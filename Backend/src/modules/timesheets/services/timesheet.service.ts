import { prisma } from "../../../shared/utils/prismaClient.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { normalizeProjectCode } from "../../../shared/utils/projectCode.util.js";
import { findAllProjectsForTimesheetMatching } from "../../projects/repository/project.repository.js";
import { findEmployeesPage } from "../../employees/repository/employee.repository.js";
import * as timesheetRepo from "../repository/timesheet.repository.js";
import * as importRepo from "../repository/timesheetImport.repository.js";
import * as rowLogRepo from "../repository/timesheetImportRowLog.repository.js";
import { recomputeProjectResource } from "./projectResource.service.js";
import type {
  ImportStatus,
  ParsedTimesheetRow,
  ProcessImportResult,
  RowLogEntry,
  TimesheetImportMeta,
} from "../timesheet.types.js";
import type { EditEntryBody } from "../validators/timesheet.validators.js";

function normalizeEmployeeNo(raw: string): string {
  return raw.trim().toLowerCase();
}

/** "YYYY-MM-DD" — see projectResource.service.ts's identical helper for why UTC getters are correct here (workDate is always stored at UTC midnight). */
function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** projectId is null for an "Unassigned" row (Employee matched, Project did not) — still a stable, distinct identity per employee+date+task among other unassigned rows. */
function identityKey(employeeNo: string, projectId: string | null, workDate: Date, task: string): string {
  return `${normalizeEmployeeNo(employeeNo)}||${projectId ?? "UNASSIGNED"}||${dateKey(workDate)}||${task.trim()}`;
}

/**
 * Fetches every Employee once (this application's realistic scale is
 * hundreds of employees, not millions — one query is cheap) and builds an
 * in-memory lookup keyed by normalized employeeNo, so no Excel row ever
 * triggers its own Employee query. Reuses the EXISTING, unmodified
 * employees module's findEmployeesPage() (Employees module is explicitly
 * off-limits this phase) with a page size large enough to return every row
 * in one call.
 */
async function buildEmployeeLookupMap() {
  const { items } = await findEmployeesPage({}, "employeeNo", "asc", 1, 1_000_000);
  const map = new Map<string, (typeof items)[number]>();
  for (const employee of items) {
    map.set(normalizeEmployeeNo(employee.employeeNo), employee);
  }
  return map;
}

interface ProjectLookupEntry {
  id: string;
  isDeleted: boolean;
}

/**
 * Fetches every Project once (id/prNo/isDeleted only — see
 * project.repository.ts's findAllProjectsForTimesheetMatching()) and builds
 * an in-memory lookup keyed by the ported normalizeProjectCode(), so no
 * Excel row ever triggers its own Project query and no
 * `Project.prNoNormalized` column is needed (Stage 3 revision — see
 * projectCode.util.ts). Archived projects are deliberately included: a
 * historical Timesheet row for an archived project is still processed, per
 * Decision 24.
 */
async function buildProjectLookupMap(): Promise<Map<string, ProjectLookupEntry>> {
  const projects = await findAllProjectsForTimesheetMatching();
  const map = new Map<string, ProjectLookupEntry>();
  for (const project of projects) {
    const key = normalizeProjectCode(project.prNo);
    if (key) map.set(key, { id: project.id, isDeleted: project.isDeleted });
  }
  return map;
}

/**
 * The ONE reconciliation engine — called identically by the Graph email-
 * ingestion path and the Administrator manual-upload path (see
 * mailIngestion/services/mailPoll.service.ts and
 * controllers/timesheet.controller.ts's importTimesheet). The only thing
 * that ever differs between the two callers is `meta.triggeredBy` and its
 * associated email/attachment fields — nothing about parsing, validation,
 * reconciliation, or ProjectResource recomputation branches on it anywhere
 * below.
 *
 * Every row is processed independently by its own (employeeNo, projectCode,
 * workDate, task) — never by any assumption that one file equals one day,
 * one week, or one month. Row-level failures never abort the import; only
 * a caller-side parse failure (an unreadable workbook) prevents this
 * function from ever being called at all.
 */
export async function processTimesheetImport(
  rows: ParsedTimesheetRow[],
  meta: TimesheetImportMeta
): Promise<ProcessImportResult> {
  const timesheetImport = await importRepo.createImport({
    emailMessageId: meta.emailMessageId ?? null,
    attachmentId: meta.attachmentId ?? null,
    attachmentFilename: meta.attachmentFilename ?? null,
    receivedAt: meta.receivedAt ?? null,
    triggeredBy: meta.triggeredBy,
    uploadedByUserId: meta.uploadedByUserId ?? null,
  });

  const [employeeMap, projectMap] = await Promise.all([buildEmployeeLookupMap(), buildProjectLookupMap()]);

  const resolvedProjectIds = new Set<string>();
  const resolutions = rows.map((row) => {
    const employee = employeeMap.get(normalizeEmployeeNo(row.employeeNo));
    const projectKey = normalizeProjectCode(row.rawProjectCode);
    const project = projectKey ? projectMap.get(projectKey) : undefined;

    // Neither a missing Project nor a missing Employee is a failure — the
    // row is always retained as a real TimesheetEntry, with projectId: null
    // ("Unassigned") and/or employeeNo/rawEmployeeName preserved verbatim
    // from KEKA whenever the corresponding master record doesn't exist. The
    // KEKA Excel is the source of truth for timesheet activity; master-data
    // matching only decides what gets LINKED, never whether the row is
    // SAVED. This is unrelated to genuinely malformed source rows (missing/
    // unreadable employeeNo, PR code, date, or hours), which are filtered
    // out upstream in excelParser.service.ts before ever reaching this
    // function, and are unaffected by this change. rawProjectCode/employeeNo
    // are always preserved on the entry, so an unmatched PR/employee is
    // never lost and can be assigned/resolved later once the matching
    // master record is created — the existing normalizeProjectCode()/
    // matching rules are entirely unchanged; this only changes what happens
    // AFTER a match attempt comes back empty.
    if (project) resolvedProjectIds.add(project.id);

    return { row, employee, projectId: project?.id ?? null };
  });

  // Includes existing "Unassigned" (projectId: null) entries too — not just
  // resolvedProjectIds — so a future day's revision of a previously-created
  // Unassigned row is correctly recognized as "existing" (Updated/Removed)
  // instead of always looking like a brand-new row. See
  // findEntriesByProjectIds()'s own comment for why this was necessary.
  const existingEntries = await timesheetRepo.findEntriesByProjectIds([...resolvedProjectIds]);
  const initialExisting = new Map<string, (typeof existingEntries)[number]>();
  for (const entry of existingEntries) {
    initialExisting.set(identityKey(entry.employeeNo, entry.projectId, entry.workDate, entry.task), entry);
  }

  let createdCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let removedCount = 0;
  let failedCount = 0;
  // Every (employeeNo, projectId) pair that resolved successfully this run,
  // regardless of this run's own per-row outcome — not just the ones with
  // a Created/Updated/Removed outcome. Recomputing ProjectResource for all
  // of them (not only "changed this run") means re-processing the same or
  // overlapping data after an earlier failed/partial run always self-heals
  // any staleness left behind, without needing a special resume mechanism.
  const resolvedPairs = new Set<string>();

  try {
    await prisma.$transaction(async (tx) => {
      const existingMap = new Map(initialExisting);
      const rowLogs: RowLogEntry[] = [];

      for (const { row, employee, projectId } of resolutions) {
        // projectId may legitimately be null here (Project not found), and
        // employee may legitimately be undefined (Employee No not found) —
        // the row is still created/reconciled as a real entry below either
        // way. canonicalEmployeeNo aligns to Employee Master's own casing
        // when matched (so repeat imports/manual edits key consistently);
        // when unmatched, the raw KEKA value is used as-is since there is
        // no canonical form to align to.
        const canonicalEmployeeNo = employee?.employeeNo ?? row.employeeNo;
        const key = identityKey(canonicalEmployeeNo, projectId, row.workDate, row.task);
        const existing = existingMap.get(key);
        // ProjectResource is inherently project-scoped — never recompute it
        // for an Unassigned pair, since there is no Project to attach it to
        // (per the approved decision).
        if (projectId) {
          resolvedPairs.add(`${canonicalEmployeeNo}||${projectId}`);
        }

        if (!existing) {
          // A row that never existed before, arriving with 0 hours, creates
          // nothing — there is no "removal" to represent.
          if (row.hours === 0) {
            unchangedCount++;
            rowLogs.push({
              entryId: null,
              rawEmployeeNo: row.employeeNo,
              rawProjectCode: row.rawProjectCode,
              workDate: row.workDate,
              task: row.task,
              previousHours: null,
              newHours: 0,
              outcome: "Unchanged",
              failureReason: null,
            });
            continue;
          }

          const created = await timesheetRepo.createEntry(tx, {
            employeeNo: canonicalEmployeeNo,
            rawEmployeeName: row.employeeName || null,
            projectId,
            rawProjectCode: row.rawProjectCode,
            rawProjectName: row.rawProjectName || null,
            workDate: row.workDate,
            task: row.task,
            hours: row.hours,
            sourceStatus: row.sourceStatus,
            firstImportId: timesheetImport.id,
            lastImportId: timesheetImport.id,
          });
          existingMap.set(key, created); // keeps a duplicate row later in the SAME file correctly seeing this as "existing"
          createdCount++;
          rowLogs.push({
            entryId: created.id,
            rawEmployeeNo: row.employeeNo,
            rawProjectCode: row.rawProjectCode,
            workDate: row.workDate,
            task: row.task,
            previousHours: null,
            newHours: row.hours,
            outcome: "Created",
            failureReason: null,
          });
          continue;
        }

        if (existing.hours === row.hours) {
          unchangedCount++;
          rowLogs.push({
            entryId: existing.id,
            rawEmployeeNo: row.employeeNo,
            rawProjectCode: row.rawProjectCode,
            workDate: row.workDate,
            task: row.task,
            previousHours: existing.hours,
            newHours: row.hours,
            outcome: "Unchanged",
            failureReason: null,
          });
          continue;
        }

        if (row.hours === 0) {
          await timesheetRepo.deleteEntry(tx, existing.id);
          existingMap.delete(key);
          removedCount++;
          // entryId is null, not existing.id — by the time rowLogs is
          // inserted below, existing.id no longer exists in TimesheetEntry
          // (deleted on the line above, in this same transaction), and the
          // FK would reject a reference to it. This is the same end state
          // entryId: SetNull would produce for a PAST log row whose entry
          // gets removed later — recording null directly here is
          // equivalent, simpler, and avoids a doomed insert. The historical
          // fact itself (previousHours/rawProjectCode/task/workDate) still
          // survives regardless.
          rowLogs.push({
            entryId: null,
            rawEmployeeNo: row.employeeNo,
            rawProjectCode: row.rawProjectCode,
            workDate: row.workDate,
            task: row.task,
            previousHours: existing.hours,
            newHours: 0,
            outcome: "Removed",
            failureReason: null,
          });
          continue;
        }

        // A revision — the later KEKA value always wins. NEVER added to
        // the previous value.
        const updated = await timesheetRepo.updateEntryHours(tx, existing.id, row.hours, timesheetImport.id);
        existingMap.set(key, updated);
        updatedCount++;
        rowLogs.push({
          entryId: existing.id,
          rawEmployeeNo: row.employeeNo,
          rawProjectCode: row.rawProjectCode,
          workDate: row.workDate,
          task: row.task,
          previousHours: existing.hours,
          newHours: row.hours,
          outcome: "Updated",
          failureReason: null,
        });
      }

      await rowLogRepo.createRowLogs(tx, timesheetImport.id, rowLogs);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error during Timesheet reconciliation.";
    await importRepo.finalizeImport(timesheetImport.id, {
      status: "Failed",
      totalRows: rows.length,
      createdCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      removedCount: 0,
      failedCount: 0,
      errorSummary: `Import failed during processing and was rolled back: ${message}`,
    });
    throw new AppError(`Timesheet import failed and was rolled back: ${message}`, 500);
  }

  // ProjectResource is ALWAYS recomputed from every current TimesheetEntry
  // row for the pair (see projectResource.service.ts) — never incremented.
  // Run for every pair that resolved this run (not only ones this run
  // itself Created/Updated/Removed) so reprocessing the same or
  // overlapping data after an earlier interrupted run always corrects any
  // staleness left behind.
  for (const pairKey of resolvedPairs) {
    const [pairEmployeeNo, pairProjectId] = pairKey.split("||") as [string, string];
    await recomputeProjectResource(pairEmployeeNo, pairProjectId);
  }

  const totalRows = rows.length;
  const status: ImportStatus =
    failedCount === 0 ? "Succeeded" : failedCount === totalRows && totalRows > 0 ? "Failed" : "PartiallySucceeded";

  const finalized = await importRepo.finalizeImport(timesheetImport.id, {
    status,
    totalRows,
    createdCount,
    updatedCount,
    unchangedCount,
    removedCount,
    failedCount,
    errorSummary: failedCount > 0 ? `${failedCount} of ${totalRows} row(s) failed validation.` : null,
  });

  return {
    importId: finalized.id,
    status: finalized.status as ImportStatus,
    totalRows,
    createdCount,
    updatedCount,
    unchangedCount,
    removedCount,
    failedCount,
    errorSummary: finalized.errorSummary,
  };
}

/**
 * Called from project.service.ts whenever a Project is created, or an
 * existing Project's prNo is changed — never called from
 * processTimesheetImport() itself. Finds every currently-"Unassigned"
 * (projectId: null) TimesheetEntry whose rawProjectCode normalizes to the
 * same value as the given prNo (via the SAME normalizeProjectCode() the
 * import engine already uses — no second matching implementation), and
 * links it to this Project. Only projectId is written; employeeNo/
 * rawEmployeeName/rawProjectCode/workDate/task/hours are left exactly as
 * originally imported. ProjectResource is recomputed for each newly-linked
 * (employeeNo, projectId) pair via the existing, unmodified
 * recomputeProjectResource() — the same call the import engine itself makes
 * for a pair that resolves a Project at import time — so a row that
 * couldn't be linked until today ends up in exactly the state it would
 * have been in had the Project already existed when it was imported.
 */
export async function reconcileUnassignedEntriesForProject(projectId: string, prNo: string): Promise<number> {
  const key = normalizeProjectCode(prNo);
  if (!key) return 0;

  const unassigned = await timesheetRepo.findUnassignedEntries();
  const matching = unassigned.filter((entry) => normalizeProjectCode(entry.rawProjectCode) === key);
  if (matching.length === 0) return 0;

  await timesheetRepo.reassignEntriesToProject(matching.map((entry) => entry.id), projectId);

  const distinctEmployeeNos = new Set(matching.map((entry) => entry.employeeNo));
  for (const employeeNo of distinctEmployeeNos) {
    await recomputeProjectResource(employeeNo, projectId);
  }

  return matching.length;
}

/**
 * Manual, single-row correction (e.g. fixing a typo'd hours value) — a
 * completely separate path from processTimesheetImport() above and never
 * called by it. Identity fields (employeeNo, projectId, rawProjectCode)
 * are never editable here; only the mutable/correction fields
 * (hours/task/workDate/sourceStatus) can change, so the entry's identity
 * and existing revision history stay exactly as the KEKA pipeline left
 * them. ProjectResource is recomputed only when the entry already belongs
 * to a mapped Project — an Unassigned entry (projectId: null) has no
 * ProjectResource to recompute, per the PR-optional-for-display decision.
 */
export async function editTimesheetEntry(id: string, input: EditEntryBody) {
  const existing = await timesheetRepo.findEntryById(id);
  if (!existing) {
    throw new AppError("Timesheet entry not found.", 404);
  }

  const updated = await timesheetRepo.updateEntryFields(id, {
    ...(input.hours !== undefined && { hours: input.hours }),
    ...(input.task !== undefined && { task: input.task }),
    ...(input.workDate !== undefined && { workDate: input.workDate }),
    ...(input.sourceStatus !== undefined && { sourceStatus: input.sourceStatus }),
  });

  if (existing.projectId) {
    await recomputeProjectResource(existing.employeeNo, existing.projectId);
  }

  return updated;
}

/**
 * Manual, single-row delete — remembers the entry's (employeeNo, projectId)
 * before removing it so the affected ProjectResource (if any) can be
 * recomputed afterward. Never touches the Project, Employee, or any
 * TimesheetImport/RowLog audit record (the row-log FK is nullable +
 * onDelete: SetNull — see schema.prisma's TimesheetImportRowLog.entryId —
 * so historical log rows survive with entryId: null, exactly as they
 * already do for KEKA's own "Removed" outcome above).
 */
export async function deleteTimesheetEntry(id: string): Promise<void> {
  const existing = await timesheetRepo.findEntryById(id);
  if (!existing) {
    throw new AppError("Timesheet entry not found.", 404);
  }

  await timesheetRepo.deleteEntryStandalone(id);

  if (existing.projectId) {
    await recomputeProjectResource(existing.employeeNo, existing.projectId);
  }
}

/**
 * Deletes every TimesheetEntry row. Projects, Employees, Customers, KEKA
 * configuration, and TimesheetImport/RowLog audit history are all
 * untouched — only TimesheetEntry itself is cleared.
 *
 * ProjectResource safety: a ProjectResource row can also be created purely
 * manually (Team Assigned's "Add Resource"), with no TimesheetEntry ever
 * backing its (employeeNo, projectId) pair — that data must survive
 * Delete-All untouched. findDistinctMappedPairs() captures, BEFORE the
 * delete, exactly the set of pairs that currently have at least one real
 * TimesheetEntry; only those pairs are recomputed afterward (correctly
 * zeroing their now-stale totalHours/workingDays/manhourCost while
 * preserving assignment dates/status/hourlyRateSnapshot, per
 * projectResource.service.ts's existing "zero entries remain" branch). Any
 * ProjectResource row outside that set was never timesheet-derived and is
 * never touched.
 */
export async function deleteAllTimesheetEntries(): Promise<{ deletedCount: number; recomputedPairCount: number }> {
  const mappedPairs = await timesheetRepo.findDistinctMappedPairs();

  const result = await timesheetRepo.deleteAllEntries();

  for (const pair of mappedPairs) {
    if (pair.projectId) {
      await recomputeProjectResource(pair.employeeNo, pair.projectId);
    }
  }

  return { deletedCount: result.count, recomputedPairCount: mappedPairs.length };
}
