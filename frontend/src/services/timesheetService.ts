import type { TimesheetEntry, TimesheetImportMonth, ProjectTimesheetData } from "../types/Timesheet";
import type { ProjectResource } from "../types/Project";
import { getCellText, parseExcelDateKey } from "./timesheetImportService";
import { apiClient } from "./apiClient";
import { getEmployees } from "./employeeService";

const TIMESHEET_STORAGE_KEY = "timesheets_imports";

/**
 * Storage backend for the full timesheet mirror — IndexedDB, not
 * localStorage. The historical backfill (Start/End Time identity fix)
 * grew this dataset from ~15k to ~17.7k TimesheetEntry rows, and the
 * serialized mirror (~4.8MB+) now sits at/over most browsers'
 * localStorage-per-origin quota (commonly 5-10MB, shared with every other
 * localStorage key this app uses) — confirmed in production via a real
 * `QuotaExceededError` thrown from the old `localStorage.setItem()` call
 * here, which silently broke Team Assigned/Timesheets/Reports/Dashboard's
 * Hours Overrun widget for every consumer of this mirror. IndexedDB's
 * per-origin quota is much larger (commonly hundreds of MB+), so this
 * dataset has real room to keep growing.
 *
 * Design: a module-level in-memory cache (`cachedMonths`) remains the
 * SYNCHRONOUS source of truth every existing caller of
 * getAllTimesheetImports()/saveAllTimesheetImports() already depends on
 * (this module deliberately keeps that exact synchronous signature so
 * none of this mirror's ~10 other consumer files need to change) — reads
 * and writes to it are immediate. IndexedDB is purely the async,
 * persistent backing store: hydrated into the cache once per page load
 * (best-effort, non-blocking) and written to in the background
 * (fire-and-forget) on every save. This mirrors the exact pattern this
 * module's callers already use for the backend itself (seed from
 * whatever's cached, then correct via an explicit re-render once a slower
 * async operation resolves) — see refreshTimesheetImportsFromBackend()
 * below, whose own mount-effect callers already re-render after it
 * resolves regardless of this storage swap.
 */
const IDB_DB_NAME = "PmoTimesheetCache";
const IDB_STORE_NAME = "timesheetImports";
const IDB_RECORD_KEY = "months";
// Deliberately tiny — never the actual data — so it can never itself hit
// the localStorage quota. Its only job is to keep the browser's native
// `storage` event firing across tabs when this mirror changes, exactly as
// localStorage already did before this change; a listener below reacts to
// it by invalidating this tab's in-memory cache so it re-hydrates from
// IndexedDB (the actual data) rather than ever storing data in this key.
const CROSS_TAB_SYNC_MARKER_KEY = "timesheets_imports_sync_marker";

let cachedMonths: TimesheetImportMonth[] | null = null;
let hasSavedSinceHydrationStarted = false;
let hydrationPromise: Promise<void> | null = null;

function openTimesheetDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGetMonths(): Promise<TimesheetImportMonth[] | null> {
  try {
    const db = await openTimesheetDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readonly");
      const req = tx.objectStore(IDB_STORE_NAME).get(IDB_RECORD_KEY);
      req.onsuccess = () => resolve((req.result as TimesheetImportMonth[] | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("Could not read the timesheet cache from IndexedDB:", err);
    return null;
  }
}

async function idbSetMonths(months: TimesheetImportMonth[]): Promise<void> {
  try {
    const db = await openTimesheetDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE_NAME, "readwrite");
      tx.objectStore(IDB_STORE_NAME).put(months, IDB_RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    // The in-memory cache (this tab's synchronous source of truth) is
    // already updated by the caller regardless — a failed IndexedDB write
    // only means this tab's data won't survive a reload, never a lost
    // update within the current session.
    console.warn("Could not persist the timesheet cache to IndexedDB (this tab's in-memory copy is still current):", err);
  }
}

/** Best-effort, one-time-per-page-load hydration: adopt IndexedDB's stored value, or migrate a legacy localStorage blob into IndexedDB if this is the first load since this change shipped, then remove that legacy key to free quota for every other feature sharing this origin's localStorage. */
function ensureHydrated(): void {
  if (hydrationPromise) return;
  hydrationPromise = idbGetMonths().then((stored) => {
    // A real save (from this tab's own code, e.g. a fast backend refresh
    // that already resolved) always wins over whatever this slower
    // IndexedDB read would otherwise adopt.
    if (hasSavedSinceHydrationStarted) return;

    if (stored !== null) {
      cachedMonths = stored;
      return;
    }

    // Nothing in IndexedDB yet. If getAllTimesheetImports() already seeded
    // cachedMonths from a legacy localStorage blob (see below), persist
    // that into IndexedDB now and reclaim the old key's quota space.
    if (cachedMonths && cachedMonths.length > 0) {
      void idbSetMonths(cachedMonths);
    }
    try {
      localStorage.removeItem(TIMESHEET_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  });
}

if (typeof window !== "undefined") {
  // Cross-tab sync: another tab's save touches CROSS_TAB_SYNC_MARKER_KEY,
  // which fires the native `storage` event here (never in the tab that
  // made the change) — invalidate this tab's cache so its NEXT
  // getAllTimesheetImports() call re-hydrates from IndexedDB instead of
  // serving this tab's now-stale in-memory copy, and nudge any listener
  // already reacting to "pmo:data-changed" (this app's existing custom
  // cross-feature refresh signal) to refresh too.
  window.addEventListener("storage", (event) => {
    if (event.key !== CROSS_TAB_SYNC_MARKER_KEY) return;
    cachedMonths = null;
    hasSavedSinceHydrationStarted = false;
    hydrationPromise = null;
    window.dispatchEvent(new Event("pmo:data-changed"));
  });
}

/**
 * Read all imported timesheet months directly from storage.
 * Single source of truth used by both the Timesheets module and any
 * live consumer (e.g. Project Team Members) so neither can go stale.
 * Synchronous, same as before — see the module-level design comment above
 * for how this stays true now that the real data lives in IndexedDB.
 */
export function getAllTimesheetImports(): TimesheetImportMonth[] {
  if (cachedMonths !== null) return cachedMonths;

  // First synchronous call in this tab's lifetime: bridge from whatever
  // legacy localStorage blob might still exist (reading it is always safe
  // — only writing can hit the quota) so the very first render isn't an
  // unnecessary empty flash, while the real hydration/migration above
  // continues in the background.
  try {
    const legacy = localStorage.getItem(TIMESHEET_STORAGE_KEY);
    cachedMonths = legacy ? (JSON.parse(legacy) as TimesheetImportMonth[]) : [];
  } catch {
    cachedMonths = [];
  }

  ensureHydrated();
  return cachedMonths;
}

export function saveAllTimesheetImports(months: TimesheetImportMonth[]): void {
  cachedMonths = months;
  hasSavedSinceHydrationStarted = true;
  void idbSetMonths(months);
  try {
    localStorage.setItem(CROSS_TAB_SYNC_MARKER_KEY, String(Date.now()));
  } catch {
    /* purely a cross-tab notification — never the actual data, safe to skip on failure */
  }
}

/**
 * Wipes this tab's in-memory cache AND the persisted IndexedDB store.
 * Called from auth/authService.ts's clearCachedBusinessDataOnLogout() —
 * now that the actual timesheet mirror lives in IndexedDB rather than the
 * `timesheets_imports` localStorage key that logout already clears, that
 * removeItem() call alone would silently stop working (IndexedDB survives
 * it), which would let a previous user's cached timesheet data leak to the
 * next person logging in on a shared machine. Marking
 * hasSavedSinceHydrationStarted here also prevents a hydration already
 * in flight from before logout from repopulating the cache with the
 * previous user's data afterward.
 */
export function clearTimesheetCache(): void {
  cachedMonths = [];
  hasSavedSinceHydrationStarted = true;
  hydrationPromise = null;
  try {
    indexedDB.deleteDatabase(IDB_DB_NAME);
  } catch (err) {
    console.warn("Could not clear the persisted timesheet cache on logout:", err);
  }
}

interface BackendTimesheetEntryDto {
  id: string;
  employeeNo: string;
  rawEmployeeName: string | null;
  projectId: string | null;
  /** Present (non-null) only when projectId resolves to a real Project — see Backend's findEntries(). Association info only — NEVER used for the Timesheets Project Name column, which comes from rawProjectName below. */
  project: { prNo: string; projectTitle: string } | null;
  rawProjectCode: string;
  /** The KEKA Excel's own Project Name column — the ONLY source for the Timesheets Project Name display. Independent of project.projectTitle (the Portal Project's own title). */
  rawProjectName: string | null;
  workDate: string;
  task: string;
  hours: number;
  sourceStatus: string;
}

interface BackendTimesheetEntryPage {
  items: BackendTimesheetEntryDto[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Priority #4 (scalability) — fetches the SAME complete authorized
 * TimesheetEntry dataset refreshTimesheetImportsFromBackend() has always
 * fetched, via bounded paginated requests instead of one unbounded request.
 * No date window is applied here — every consumer of the resulting
 * localStorage mirror (Team Assigned's lifetime "All" view,
 * getProcessedLifetimeActualHours(), Dashboard's Hours Overrun widget,
 * Expense Budget Analysis, Reports, projectMetrics.ts) depends on the full
 * history being present, confirmed by the Priority #4 dependency audit —
 * narrowing what gets fetched would silently understate every one of those
 * calculations. Mirrors fetchAllProjectsFromApi()'s existing accumulation
 * pattern in projectService.ts (do/while + safety cap), scaled up for
 * Timesheet's larger expected row count.
 */
async function fetchAllTimesheetEntriesFromApi(): Promise<BackendTimesheetEntryDto[]> {
  const all: BackendTimesheetEntryDto[] = [];
  const pageSize = 200;
  let page = 1;
  let total = 0;

  do {
    const result = await apiClient.get<BackendTimesheetEntryPage>(
      `/timesheets/entries?page=${page}&pageSize=${pageSize}`
    );
    all.push(...result.items);
    total = result.total;
    page += 1;
  } while (all.length < total && page <= 2000);

  // P1-01 (production hardening) — this loop's own safety cap (page <= 2000,
  // i.e. 400,000 rows) exists to guarantee it can never spin forever against
  // a runaway `total`, NOT as a claim that 400K is an intended ceiling for
  // real data. Raising that number alone would still silently truncate
  // beyond whatever the new number is — the actual fix is that truncation
  // must never be silent. Every caller of refreshTimesheetImportsFromBackend()
  // already wraps it in try/catch or .catch() (Timesheets.tsx,
  // DashboardToolbar.tsx, ExpandableTeamMembersCard.tsx,
  // ensureTimesheetImportsFresh() below), so throwing here surfaces as a
  // caught, logged/toast-shown failure — never an unhandled rejection — and
  // every one of those callers already leaves whatever data was already in
  // `timesheets_imports` untouched on failure, so a truncation error
  // degrades to "last known good data displayed, refresh failed" rather
  // than "silently showing an incomplete dataset as if it were complete."
  //
  // This does NOT by itself make the app safe at 1,000,000 TimesheetEntry
  // rows — see the P1 report's finding for why a genuine architectural fix
  // (server-side aggregation per consumer) was judged out of proportion for
  // this pass, given every current consumer of this data (Team Assigned's
  // lifetime view, Dashboard's Hours Overrun widget, Expense Budget
  // Analysis, Reports, projectMetrics.ts) was already confirmed to
  // genuinely need the full history.
  if (all.length < total) {
    throw new Error(
      `Timesheet data fetch was incomplete: received ${all.length} of ${total} total entries from the server ` +
        `(stopped after ${page - 1} pages). No local data was overwritten with this incomplete result.`
    );
  }

  return all;
}

/**
 * Connects the Timesheets page's "Timesheet Records" display to the real
 * backend TimesheetEntry data (produced by the KEKA import pipeline — see
 * Backend/src/modules/timesheets/services/timesheet.service.ts's
 * processTimesheetImport()). Fetches every real entry — now via bounded
 * pages (see fetchAllTimesheetEntriesFromApi() above), never one unbounded
 * response — adapts it into the existing TimesheetEntry/TimesheetImportMonth
 * shape this module has always used, and writes it into the SAME
 * localStorage key getAllTimesheetImports() already reads — so every
 * existing consumer (this page, Team Assigned, TimesheetProcessingService,
 * Reports, Dashboard, Expense Budget Analysis, Notifications, PMO
 * Assistant) keeps working completely unchanged; only the underlying data
 * source moves from "whatever was last uploaded in this browser" to "the
 * real database," and only the transport mechanism (one request vs. many
 * bounded ones) changes — the accumulated dataset itself is identical
 * either way.
 *
 * Months are merged, not replaced wholesale: any month with real backend
 * data takes over that month's slot; any other locally-uploaded month (not
 * yet represented in the backend) is left exactly as it was — mirroring
 * storeTimesheetImport()'s own "remove existing month if present, replace"
 * rule.
 */
export async function refreshTimesheetImportsFromBackend(): Promise<void> {
  const items = await fetchAllTimesheetEntriesFromApi();
  const employees = getEmployees();

  const entriesByMonth = new Map<string, TimesheetEntry[]>();

  for (const dto of items) {
    const empMaster = employees.find((e) => e.employeeNo.trim().toLowerCase() === dto.employeeNo.trim().toLowerCase());
    const dateKey = dto.workDate.slice(0, 10);

    // Neither employeeNo nor projectId is required to resolve — the row is
    // retained and displayed regardless, with the raw KEKA values preserved.
    // Employee Name prefers Employee Master (kept current if it changes
    // there), then falls back to the raw KEKA name captured at import time,
    // then the employee number itself as the last-resort fallback.
    //
    // Project Name is the KEKA Excel's OWN "Project Name" column
    // (dto.rawProjectName) — a source-data value, completely independent of
    // the Portal Project's own projectTitle (dto.project?.projectTitle).
    // These are two different concepts and must never be conflated: a
    // matching Portal Project only ever supplies `projectId`/`project` for
    // association purposes (Team Assigned, ownership) — it must NEVER
    // supply or override the displayed Project Name. Falls back to "—" only
    // when the source genuinely had no Project Name value — never falls
    // back to project.projectTitle. The raw Project Code (projectCode) is
    // always shown regardless, from rawProjectCode.
    const entry: TimesheetEntry = {
      id: dto.id,
      employeeNo: dto.employeeNo,
      employeeName: empMaster?.employeeName || dto.rawEmployeeName || dto.employeeNo,
      projectCode: dto.rawProjectCode,
      projectName: dto.rawProjectName || "—",
      date: dateKey,
      hours: dto.hours,
      status: (dto.sourceStatus === "Released" ? "Released" : "Active") as "Active" | "Released",
    };
    if (dto.task) entry.task = dto.task;

    const month = getMonthFromDate(dateKey);
    if (!entriesByMonth.has(month)) entriesByMonth.set(month, []);
    entriesByMonth.get(month)!.push(entry);
  }

  const backendMonths: TimesheetImportMonth[] = [...entriesByMonth.entries()].map(([month, entries]) => {
    const dates = new Set(entries.map((e) => e.date));
    const uniqueEmployees = new Set(entries.map((e) => e.employeeNo));
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

    return {
      id: `keka-backend-${month}`,
      month,
      importType: "monthly",
      uploadedAt: new Date().toISOString(),
      uploadedBy: "KEKA (Automated Import)",
      entries,
      summary: {
        totalEmployees: uniqueEmployees.size,
        totalHours: Math.round(totalHours * 100) / 100,
        totalWorkingDays: dates.size,
      },
    };
  });

  const backendMonthKeys = new Set(backendMonths.map((m) => m.month));
  const preservedLocalMonths = getAllTimesheetImports().filter((m) => !backendMonthKeys.has(m.month));

  saveAllTimesheetImports([...preservedLocalMonths, ...backendMonths]);
}

// Priority #5C — Team Assigned's stale-localStorage fix. Module-level (not
// component-level) so every caller across the whole app shares the same
// guard, exactly the "reuse the existing mechanism, don't build a second
// one" requirement.
let inFlightImportsRefresh: Promise<void> | null = null;
let lastImportsRefreshCompletedAt = 0;
// A short cool-down, NOT a polling interval — nothing here is ever
// scheduled/timer-driven; this only ever fires in response to an actual
// caller (a component mounting, a user clicking Refresh). It exists solely
// to collapse back-to-back callers within the same few seconds (e.g. two
// Team Assigned cards mounting together, or the user switching between two
// projects' Team Assigned tabs right after Timesheets already synced) into
// a single backend request instead of one each.
const IMPORTS_REFRESH_COOLDOWN_MS = 5000;

/**
 * Ensures `timesheets_imports` reflects a reasonably-current backend state
 * before a consumer (e.g. Team Assigned) reads it, without ever polling the
 * backend on a timer and without duplicating refreshTimesheetImportsFromBackend()'s
 * own fetch/merge logic — this is a thin de-duplicating wrapper around that
 * exact function, not a second sync implementation.
 *
 * - Concurrent callers share one in-flight request (`inFlightImportsRefresh`)
 *   rather than each firing their own GET.
 * - A short cool-down: skips a redundant request entirely if one already
 *   completed within the last few seconds — see IMPORTS_REFRESH_COOLDOWN_MS
 *   above.
 * - Never throws: a failed backend refresh is logged and swallowed, leaving
 *   whatever is already in `timesheets_imports` completely untouched, so a
 *   transient network/API failure degrades to "last known data" rather than
 *   breaking the caller. Callers that need to react to failure (e.g. the
 *   Team Assigned "Refresh" button, which should visibly report a failure)
 *   should call refreshTimesheetImportsFromBackend() directly instead — this
 *   wrapper is specifically for passive, on-mount synchronization.
 */
export function ensureTimesheetImportsFresh(): Promise<void> {
  if (inFlightImportsRefresh) return inFlightImportsRefresh;

  if (Date.now() - lastImportsRefreshCompletedAt < IMPORTS_REFRESH_COOLDOWN_MS) {
    return Promise.resolve();
  }

  inFlightImportsRefresh = refreshTimesheetImportsFromBackend()
    .then(() => {
      lastImportsRefreshCompletedAt = Date.now();
    })
    .catch((err) => {
      console.warn("Could not refresh timesheet data from backend — showing last known cached data.", err);
    })
    .finally(() => {
      inFlightImportsRefresh = null;
    });

  return inFlightImportsRefresh;
}

/**
 * Extract raw daily timesheet entries from Excel rows
 * Each row in the Excel becomes a TimesheetEntry
 */
export function extractTimesheetEntries(
  rows: unknown[][],
  indices: Record<string, number>
): TimesheetEntry[] {
  const entries: TimesheetEntry[] = [];

  rows.forEach((row, idx) => {
    const empNo = getCellText(row, indices.employeeNo);
    const empName = getCellText(row, indices.employeeName);
    const projectCode = getCellText(row, indices.projectCode);
    const projectNameIdx = (indices as Record<string, number>).projectName ?? -1;
    const projectName = getCellText(row, projectNameIdx);
    const dateKey = parseExcelDateKey(row[indices.date]);
    const hours = Number(getCellText(row, indices.totalHours)) || 0;
    const taskIdx = (indices as Record<string, number>).task ?? -1;
    const task = getCellText(row, taskIdx);
    const status = getCellText(row, indices.status ?? -1) || "Active";

    if (!empNo || !empName || !projectCode || !dateKey || hours === 0) {
      return;
    }

    const entry: TimesheetEntry = {
      id: `${empNo}-${projectCode}-${dateKey}-${idx}`,
      employeeNo: empNo,
      employeeName: empName,
      projectCode,
      projectName,
      date: dateKey,
      hours,
      status: (status.toLowerCase() === "released" ? "Released" : "Active") as "Active" | "Released",
    };

    if (task) {
      entry.task = task;
    }

    entries.push(entry);
  });

  return entries;
}

/**
 * Get month from date string (YYYY-MM-DD -> YYYY-MM)
 */
export function getMonthFromDate(dateStr: string): string {
  return dateStr.substring(0, 7); // "2026-02"
}

/**
 * Create monthly/weekly aggregation from daily entries
 */
export function createImportMonth(
  entries: TimesheetEntry[],
  uploadedBy: string,
  importType: "monthly" | "weekly" = "monthly"
): TimesheetImportMonth {
  const dates = new Set(entries.map((e) => e.date));
  const uniqueEmployees = new Set(entries.map((e) => e.employeeNo));
  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  // Get month from first entry
  const month = entries.length > 0 ? getMonthFromDate(entries[0].date) : "";

  return {
    id: `import-${month}-${Date.now()}`,
    month,
    importType,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    entries,
    summary: {
      totalEmployees: uniqueEmployees.size,
      totalHours: Math.round(totalHours * 100) / 100,
      totalWorkingDays: dates.size,
    },
  };
}

/**
 * Build ProjectResource summary from timesheet entries for a specific employee and month
 * Used to populate Team Members section when displaying latest month
 */
export function buildProjectResourceFromTimesheet(
  entries: TimesheetEntry[]
): Omit<ProjectResource, "id"> | null {
  if (entries.length === 0) return null;

  const first = entries[0];
  const dates = entries.map((e) => e.date).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const totalHours = Math.round(entries.reduce((sum, e) => sum + e.hours, 0) * 100) / 100;
  const workingDays = new Set(entries.map((e) => e.date)).size;

  return {
    employeeNo: first.employeeNo,
    employeeName: first.employeeName,
    designation: "", // Would come from Employee Master
    department: "", // Would come from Employee Master
    reportingManager: "", // Would come from Employee Master
    startDate,
    endDate,
    workingDays,
    totalHours,
    status: first.status || "Active",
    location: "",
  };
}

/**
 * Get entries for a specific employee in a specific project and month
 */
export function getEmployeeEntriesForProjectMonth(
  entries: TimesheetEntry[],
  employeeNo: string,
  projectCode: string
): TimesheetEntry[] {
  return entries.filter(
    (e) => e.employeeNo === employeeNo && e.projectCode === projectCode
  );
}

/**
 * Store timesheet import (call this after successfully importing Excel)
 * Maintains historical data by month
 */
export function storeTimesheetImport(
  existingData: ProjectTimesheetData | undefined,
  newMonth: TimesheetImportMonth
): ProjectTimesheetData {
  const months = existingData?.allMonths || [];

  // Remove existing month if present (replace with new import)
  const filtered = months.filter((m) => m.month !== newMonth.month);

  return {
    prNo: existingData?.prNo || "",
    allMonths: [...filtered, newMonth],
    latestMonth: newMonth.month,
  };
}

/**
 * Get team members for a project from latest timesheet import
 * Groups entries by employee for the latest month
 */
export function getTeamMembersFromLatestTimesheet(
  timesheetData: ProjectTimesheetData | undefined,
  projectCode: string
): TimesheetEntry[][] {
  if (!timesheetData?.latestMonth) return [];

  const latestImport = timesheetData.allMonths.find(
    (m) => m.month === timesheetData.latestMonth
  );
  if (!latestImport) return [];

  // Filter entries for this project
  const projectEntries = latestImport.entries.filter((e) => e.projectCode === projectCode);

  // Group by employee
  const grouped: Record<string, TimesheetEntry[]> = {};
  projectEntries.forEach((entry) => {
    if (!grouped[entry.employeeNo]) {
      grouped[entry.employeeNo] = [];
    }
    grouped[entry.employeeNo].push(entry);
  });

  return Object.values(grouped);
}

/**
 * Format date for display (YYYY-MM-DD -> DD-MMM-YYYY)
 */
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${day}-${monthNames[parseInt(month) - 1]}-${year}`;
}

/**
 * Format month for display (YYYY-MM -> MMM YYYY)
 */
export function formatMonthDisplay(monthStr: string): string {
  if (!monthStr || monthStr.length < 7) return monthStr;
  const [year, month] = monthStr.split("-");
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}
