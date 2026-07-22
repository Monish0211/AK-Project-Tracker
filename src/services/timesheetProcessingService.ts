/**
 * TimesheetProcessingService
 *
 * The single processing engine that turns raw imported timesheet rows
 * (TimesheetEntry — one row per Excel line, imported via the Timesheets
 * module and never modified) into consolidated daily summaries keyed by
 * Employee Number + Project Number + Work Date.
 *
 * Every module that needs Total Hours, Working Days, Average Hours, or
 * Man-Hour Cost must read from the functions below instead of re-deriving
 * totals from raw entries or from the project.resources push-sync
 * snapshot, so Team Assigned, Dashboard, Hours Overrun, Reports and Project
 * Resource Cost Summary can never disagree with each other.
 *
 * Raw imported data (getAllTimesheetImports / localStorage["timesheets_imports"])
 * is only ever read here, never written or altered — the Excel-derived
 * audit trail stays exactly as imported.
 */

import type { TimesheetEntry, TimesheetImportMonth } from "../types/Timesheet";
import { normalizeProjectCode } from "./timesheetImportService";
import { getMonthFromDate } from "./timesheetService";
import { getEmployees } from "./employeeService";

export interface ProcessedDay {
  employeeNo: string;
  employeeName: string;
  projectCode: string; // raw project code as imported (for display)
  projectName: string;
  date: string; // YYYY-MM-DD
  dailyHours: number;
  hourlyRate: number;
  dailyCost: number;
  status: "Active" | "Released";
  /** Raw rows consolidated into this day — preserved untouched for drill-down/audit. */
  entries: TimesheetEntry[];
}

export interface ProcessedEmployeeSummary {
  employeeNo: string;
  employeeName: string;
  projectCode: string;
  projectName: string;
  designation: string;
  department: string;
  reportingManager: string;
  location: string;
  grade: string;
  hourlyRate: number;
  startDate: string;
  endDate: string;
  /** Count of unique work dates — never the raw row count. */
  workingDays: number;
  totalHours: number;
  averageHoursPerDay: number;
  totalCost: number;
  status: "Active" | "Released";
  /** One entry per unique work date, sorted ascending. */
  days: ProcessedDay[];
}

// ─────────────────────────────────────────────────────────────────────────
// Day-level grouping — Employee Number + Project Number + Work Date
// ─────────────────────────────────────────────────────────────────────────

interface RawDayGroup {
  employeeNo: string;
  employeeName: string;
  projectCodeNormalized: string;
  rawProjectCode: string;
  rawProjectName: string;
  date: string;
  importMonth: string;
  dailyHours: number;
  status: "Active" | "Released";
  entries: TimesheetEntry[];
}

function computeDayGroups(allImports: TimesheetImportMonth[]): RawDayGroup[] {
  const map = new Map<string, RawDayGroup>();

  allImports.forEach((monthData) => {
    monthData.entries.forEach((entry) => {
      const normCode = normalizeProjectCode(entry.projectCode);
      // Derive the month from each row's own work date rather than trusting
      // the import container's single month tag — one Excel upload can
      // legitimately span several calendar months, and every one of them
      // must be discoverable independently.
      const entryMonth = getMonthFromDate(entry.date);
      const key = `${entryMonth}|${entry.employeeNo.trim().toLowerCase()}|${normCode}|${entry.date}`;

      let group = map.get(key);
      if (!group) {
        group = {
          employeeNo: entry.employeeNo,
          employeeName: entry.employeeName,
          projectCodeNormalized: normCode,
          rawProjectCode: entry.projectCode,
          rawProjectName: entry.projectName,
          date: entry.date,
          importMonth: entryMonth,
          dailyHours: 0,
          status: entry.status || "Active",
          entries: [],
        };
        map.set(key, group);
      }

      group.dailyHours += entry.hours;
      group.entries.push(entry);
      if (entry.status) group.status = entry.status;
    });
  });

  map.forEach((group) => {
    group.dailyHours = Math.round(group.dailyHours * 100) / 100;
    group.entries.sort((a, b) => a.id.localeCompare(b.id));
  });

  return Array.from(map.values());
}

// The day-grouping pass is the expensive part when there are thousands of
// raw rows. Memoize it against a cheap fingerprint of the raw import set so
// Dashboard, Team Assigned, Reports and Cost widgets rendering in the same
// pass don't each re-group the same rows. Employee Master enrichment (rate,
// designation, etc.) is intentionally re-applied on every call instead of
// baked into this cache, so a Manpower rate edit is reflected immediately
// without needing to invalidate the timesheet-derived cache.
let dayGroupsCache: { fingerprint: string; groups: RawDayGroup[] } | null = null;

function fingerprintImports(allImports: TimesheetImportMonth[]): string {
  return allImports.map((m) => `${m.id}:${m.entries.length}:${m.uploadedAt}`).join("|");
}

function getDayGroups(allImports: TimesheetImportMonth[]): RawDayGroup[] {
  const fingerprint = fingerprintImports(allImports);
  if (dayGroupsCache && dayGroupsCache.fingerprint === fingerprint) {
    return dayGroupsCache.groups;
  }
  const groups = computeDayGroups(allImports);
  dayGroupsCache = { fingerprint, groups };
  return groups;
}

function rateForEmployee(employeeNo: string, masterEmployees: ReturnType<typeof getEmployees>): number {
  const master = masterEmployees.find(
    (e) => e.employeeNo.trim().toLowerCase() === employeeNo.trim().toLowerCase()
  );
  return master?.manhourExpenses || 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Public engine API
// ─────────────────────────────────────────────────────────────────────────

/**
 * Unique months (YYYY-MM) that contain at least one entry matching this PR
 * Number, derived from each row's own work date — never from the import
 * container's single month tag, so a multi-month upload surfaces every
 * month it actually contains. Returned in chronological order (oldest
 * first) for populating month dropdowns; callers that want the most recent
 * month should read the last element.
 */
export function getProcessedProjectMonths(prNo: string, allImports: TimesheetImportMonth[]): string[] {
  const target = normalizeProjectCode(prNo);
  if (!target) return [];

  const months = new Set<string>();
  allImports.forEach((monthData) => {
    monthData.entries.forEach((entry) => {
      if (normalizeProjectCode(entry.projectCode) === target) {
        months.add(getMonthFromDate(entry.date));
      }
    });
  });

  return Array.from(months).sort();
}

/** Whether any imported timesheet entry matches this PR Number. */
export function hasProcessedTimesheetData(prNo: string, allImports: TimesheetImportMonth[]): boolean {
  return getProcessedProjectMonths(prNo, allImports).length > 0;
}

/**
 * Consolidated daily rows for a project (+ optional month filter): one row
 * per Employee Number + Project Number + Work Date, with every raw Excel
 * row for that day preserved in `.entries` for drill-down/audit.
 */
export function getProcessedDays(
  prNo: string,
  allImports: TimesheetImportMonth[],
  month?: string
): ProcessedDay[] {
  const target = normalizeProjectCode(prNo);
  if (!target) return [];

  const masterEmployees = getEmployees();
  const groups = getDayGroups(allImports).filter(
    (g) => g.projectCodeNormalized === target && (!month || g.importMonth === month)
  );

  return groups
    .map((g) => {
      const hourlyRate = rateForEmployee(g.employeeNo, masterEmployees);
      return {
        employeeNo: g.employeeNo,
        employeeName: g.employeeName,
        projectCode: g.rawProjectCode,
        projectName: g.rawProjectName,
        date: g.date,
        dailyHours: g.dailyHours,
        hourlyRate,
        dailyCost: Math.round(g.dailyHours * hourlyRate * 100) / 100,
        status: g.status,
        entries: g.entries,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Consolidated daily rows for one employee within a project (+ optional month filter). */
export function getProcessedEmployeeDays(
  prNo: string,
  allImports: TimesheetImportMonth[],
  employeeNo: string,
  month?: string
): ProcessedDay[] {
  return getProcessedDays(prNo, allImports, month).filter(
    (d) => d.employeeNo.trim().toLowerCase() === employeeNo.trim().toLowerCase()
  );
}

/**
 * One consolidated summary row per employee for a project (+ optional month
 * filter) — Total Hours, Working Days (unique dates only), Average Hours
 * and Man-Hour Cost all derived from the same consolidated daily rows.
 */
export function getProcessedTeamMembers(
  prNo: string,
  allImports: TimesheetImportMonth[],
  month?: string
): ProcessedEmployeeSummary[] {
  const days = getProcessedDays(prNo, allImports, month);
  const masterEmployees = getEmployees();

  const byEmployee = new Map<string, ProcessedDay[]>();
  days.forEach((d) => {
    const key = d.employeeNo.trim().toLowerCase();
    const list = byEmployee.get(key);
    if (list) list.push(d);
    else byEmployee.set(key, [d]);
  });

  const summaries: ProcessedEmployeeSummary[] = [];

  byEmployee.forEach((employeeDays) => {
    const sorted = [...employeeDays].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const master = masterEmployees.find(
      (e) => e.employeeNo.trim().toLowerCase() === first.employeeNo.trim().toLowerCase()
    );

    const totalHours = Math.round(sorted.reduce((sum, d) => sum + d.dailyHours, 0) * 100) / 100;
    const totalCost = Math.round(sorted.reduce((sum, d) => sum + d.dailyCost, 0) * 100) / 100;
    const workingDays = sorted.length; // one row per unique date already

    summaries.push({
      employeeNo: first.employeeNo,
      employeeName: master?.employeeName || first.employeeName,
      projectCode: first.projectCode,
      projectName: first.projectName,
      designation: master?.designation || "",
      department: master?.department || "",
      reportingManager: master?.reportingManager || "",
      location: master?.location || "",
      grade: master?.grade || "",
      hourlyRate: first.hourlyRate,
      startDate: first.date,
      endDate: last.date,
      workingDays,
      totalHours,
      averageHoursPerDay: workingDays > 0 ? Math.round((totalHours / workingDays) * 100) / 100 : 0,
      totalCost,
      status: last.status,
      days: sorted,
    });
  });

  return summaries.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

/**
 * Actual Hours for a project — the single source of truth. Sums the
 * consolidated Total Hours (from getProcessedTeamMembers) for the project's
 * latest matched month. Anything comparing against budgeted hours (e.g. the
 * Dashboard's Hours Overrun widget) must call this rather than re-deriving
 * hours independently, or the views can disagree.
 */
export function getProcessedActualHours(prNo: string, allImports: TimesheetImportMonth[]): number {
  const months = getProcessedProjectMonths(prNo, allImports);
  const latestMonth = months[months.length - 1];
  if (!latestMonth) return 0;

  const members = getProcessedTeamMembers(prNo, allImports, latestMonth);
  return Math.round(members.reduce((sum, m) => sum + m.totalHours, 0) * 100) / 100;
}

/**
 * One employee's consolidated Total Hours for a project, across the
 * project's latest matched month — used where a per-employee figure is
 * needed outside of Team Assigned (e.g. Reports) without pulling in the
 * full team list. Returns undefined if the employee has no processed data
 * for this project (e.g. a manually-added resource with no timesheet
 * import matched yet).
 */
export function getProcessedEmployeeTotalHours(
  prNo: string,
  allImports: TimesheetImportMonth[],
  employeeNo: string
): number | undefined {
  const months = getProcessedProjectMonths(prNo, allImports);
  const latestMonth = months[months.length - 1];
  if (!latestMonth) return undefined;

  const member = getProcessedTeamMembers(prNo, allImports, latestMonth).find(
    (m) => m.employeeNo.trim().toLowerCase() === employeeNo.trim().toLowerCase()
  );
  return member?.totalHours;
}
