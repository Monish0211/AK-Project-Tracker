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

function normalizeEmployeeNo(raw: string): string {
  return raw.trim().toLowerCase();
}

/** "YYYY-MM-DD" — see projectResource.service.ts's identical helper for why UTC getters are correct here (workDate is always stored at UTC midnight). */
function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function identityKey(employeeNo: string, projectId: string, workDate: Date, task: string): string {
  return `${normalizeEmployeeNo(employeeNo)}||${projectId}||${dateKey(workDate)}||${task.trim()}`;
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

    let failureReason: string | null = null;
    if (!employee) {
      failureReason = `Employee No "${row.employeeNo}" not found in Employee Master.`;
    } else if (!project) {
      // Deliberately the same outcome for "PR never existed" and "PR
      // existed but its Project was permanently deleted before this row
      // could ever be resolved" — the Project table gives no way to tell
      // these apart for a row that has never been seen before (see
      // schema.prisma's TimesheetEntry model comment / Stage 4 §9). A row
      // whose Project is archived (not permanently deleted) DOES resolve
      // here — archived projects stay in projectMap, only their isDeleted
      // flag differs, which this reconciliation loop never inspects.
      failureReason = `Project not found for PR "${row.rawProjectCode}".`;
    }

    if (project) resolvedProjectIds.add(project.id);

    return { row, employee, projectId: project?.id ?? null, failureReason };
  });

  const existingEntries = await timesheetRepo.findEntriesByProjectIds([...resolvedProjectIds]);
  const initialExisting = new Map<string, (typeof existingEntries)[number]>();
  for (const entry of existingEntries) {
    if (entry.projectId) initialExisting.set(identityKey(entry.employeeNo, entry.projectId, entry.workDate, entry.task), entry);
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

      for (const { row, employee, projectId, failureReason } of resolutions) {
        if (failureReason || !employee || !projectId) {
          failedCount++;
          rowLogs.push({
            entryId: null,
            rawEmployeeNo: row.employeeNo,
            rawProjectCode: row.rawProjectCode,
            workDate: row.workDate,
            task: row.task,
            previousHours: null,
            newHours: row.hours,
            outcome: "Failed",
            failureReason: failureReason ?? "Unknown validation failure.",
          });
          continue;
        }

        const canonicalEmployeeNo = employee.employeeNo;
        const key = identityKey(canonicalEmployeeNo, projectId, row.workDate, row.task);
        const existing = existingMap.get(key);
        const pairKey = `${canonicalEmployeeNo}||${projectId}`;
        resolvedPairs.add(pairKey);

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
            projectId,
            rawProjectCode: row.rawProjectCode,
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
