import { prisma } from "../../../shared/utils/prismaClient.js";
import { AppError } from "../../../shared/utils/AppError.js";
import { normalizeProjectCode } from "../../../shared/utils/projectCode.util.js";
import { assertProjectAccessById } from "../../../shared/utils/projectAccess.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { findAllProjectsForTimesheetMatching } from "../../projects/repository/project.repository.js";
import { findEmployeesPage } from "../../employees/repository/employee.repository.js";
import * as timesheetRepo from "../repository/timesheet.repository.js";
import * as importRepo from "../repository/timesheetImport.repository.js";
import * as rowLogRepo from "../repository/timesheetImportRowLog.repository.js";
import { recomputeProjectResource } from "./projectResource.service.js";
import {
  coarseIdentityKey,
  decideEntryOutcome,
  findTimeCorrectedEntry,
  identityKey,
  normalizeEmployeeNo,
} from "./timesheetReconciliation.rules.js";
import type {
  ImportStatus,
  ParsedTimesheetRow,
  ProcessImportResult,
  RowLogEntry,
  TimesheetImportMeta,
} from "../timesheet.types.js";
import type { EditEntryBody } from "../validators/timesheet.validators.js";

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
  // P2-08 — a retry of a previously-"Failed" Keka import reuses that SAME
  // TimesheetImport row (already atomically claimed and flipped to
  // "Processing" by mailPoll.service.ts's decideImportEligibility() before
  // this function was ever called) instead of creating a new one, since
  // TimesheetImport.emailMessageId is unique — a second createImport() call
  // for the same email would fail its own unique-constraint check. Every
  // other field below (rowLogs, finalizeImport, recomputeProjectResource,
  // the returned ProcessImportResult) already operates purely on
  // `timesheetImport.id`, so nothing else in this function needs to know
  // or care whether that id came from a fresh insert or a reused row.
  const timesheetImport = meta.existingImportId
    ? { id: meta.existingImportId }
    : await importRepo.createImport({
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

  let createdCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let duplicateCount = 0;
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
    // P1-03 (production hardening) — explicit timeout, justified by measured
    // throughput, not an arbitrary/enormous value. Prisma's *default*
    // interactive-transaction timeout is 5000ms; this loop does one Prisma
    // round-trip per row (create/update/delete), which real benchmarking
    // against this same reconciliation engine (synthetic rows, local dev DB)
    // showed genuinely exceeding that default at realistic Keka file sizes:
    //   100 rows    ~556ms
    //   1,000 rows  ~1,401ms
    //   5,000 rows  ~4,932ms   (already brushing the 5000ms default)
    //   10,000 rows FAILED at 5,011ms — Prisma's default timeout aborted and
    //               cleanly rolled back the whole transaction (verified: 0
    //               orphaned TimesheetEntry/RowLog rows afterward)
    // Marginal cost measured at ~0.88ms/row past the fixed per-import lookup
    // overhead (buildEmployeeLookupMap/buildProjectLookupMap). 120s gives
    // roughly 6x headroom over the ~9.3s a 10,000-row file is projected to
    // need, and comfortably covers a >100,000-row single file — far beyond
    // any realistic single monthly Keka export — without being an
    // unjustified "just set it huge" number. maxWait (time to acquire a
    // transaction slot from the pool) is bumped modestly from the 2000ms
    // default to ride out brief connection-pool contention under concurrent
    // imports, not to mask a real problem.
    //
    // Chunking this into multiple smaller transactions was deliberately NOT
    // done here: the loop is intentionally stateful (existingMap is mutated
    // per row so a later duplicate row in the SAME file correctly resolves
    // against an earlier row's create in this SAME run — see the "keeps a
    // duplicate row later in the SAME file" comment below), and splitting it
    // across transactions would change this file's all-or-nothing rollback
    // guarantee (a mid-file failure today rolls back the entire import, not
    // just one chunk) — a real behavioral change too large for this minimal
    // fix. See the P1 report for this as a flagged follow-up if a single
    // Keka file routinely exceeds ~100k rows in production.
    await prisma.$transaction(
      async (tx) => {
      // Concurrency fix (mirrors projectResource.service.ts's
      // recomputeProjectResource() — same pg_advisory_xact_lock mechanism,
      // same reasoning). Before this fix, the existing-entries snapshot
      // below was read OUTSIDE and BEFORE this transaction even began (see
      // findEntriesByProjectIds()'s old doc comment: "runs against the
      // plain client, not tx, since it happens before the write transaction
      // begins"). Two genuinely concurrent imports — e.g. the daily Keka
      // poll overlapping an Administrator's manual/historical Excel upload
      // — could each read that same stale snapshot, each independently
      // decide "Created" for the identical (employeeNo, rawProjectCode,
      // workDate, task) fact, and each insert its own TimesheetEntry row: a
      // real duplicate, with no database constraint to catch it (see
      // schema.prisma's TimesheetEntry comment — deliberately not added,
      // since the identity rule itself is still provisional pending a
      // verified real KEKA file).
      //
      // A single global advisory lock (not one per identity/pair) is
      // deliberately chosen here, unlike the per-pair lock
      // recomputeProjectResource() uses: this transaction reconciles an
      // entire file's worth of rows against ONE up-front snapshot, not one
      // pair at a time, so the snapshot itself — not any single row — is
      // what must never be stale relative to another in-flight import.
      // Imports are infrequent (a daily Keka poll, occasional
      // manual/historical uploads) and each one is not itself especially
      // slow relative to the alternative of reconciling with a stale view,
      // so serializing the rare case of two imports genuinely overlapping
      // is a safe, minimal-footprint trade — a second import now simply
      // waits for the first to fully commit, then re-reads a truly current
      // snapshot, rather than running fully in parallel against stale data.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('timesheet-import-reconciliation'))`;

      const existingEntries = await timesheetRepo.findEntriesByProjectIds([...resolvedProjectIds], tx);
      type ExistingEntryRow = (typeof existingEntries)[number];
      const initialExisting = new Map<string, ExistingEntryRow>();
      // Grouped by the COARSE (no-time) identity — the candidate pool the
      // Start/End Time correction fix searches for a time-overlap match
      // once an exact 6-field match has already failed. Kept in sync with
      // existingMap below at every Created/Updated/Removed write, exactly
      // the same "in-memory state mirrors what this same transaction has
      // already written" discipline existingMap itself already follows.
      const coarseGroups = new Map<string, ExistingEntryRow[]>();
      for (const entry of existingEntries) {
        initialExisting.set(
          identityKey(entry.employeeNo, entry.rawProjectCode, entry.workDate, entry.task, entry.startTime, entry.endTime),
          entry
        );
        const coarseKey = coarseIdentityKey(entry.employeeNo, entry.rawProjectCode, entry.workDate, entry.task);
        const group = coarseGroups.get(coarseKey);
        if (group) group.push(entry);
        else coarseGroups.set(coarseKey, [entry]);
      }

      function addToCoarseGroup(coarseKey: string, entry: ExistingEntryRow): void {
        const group = coarseGroups.get(coarseKey);
        if (group) group.push(entry);
        else coarseGroups.set(coarseKey, [entry]);
      }

      function replaceInCoarseGroup(coarseKey: string, entryId: string, updated: ExistingEntryRow): void {
        const group = coarseGroups.get(coarseKey);
        if (!group) return;
        const index = group.findIndex((e) => e.id === entryId);
        if (index !== -1) group[index] = updated;
      }

      function removeFromCoarseGroup(coarseKey: string, entryId: string): void {
        const group = coarseGroups.get(coarseKey);
        if (!group) return;
        const index = group.findIndex((e) => e.id === entryId);
        if (index !== -1) group.splice(index, 1);
      }

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
        // Priority #5 fix: keyed by row.rawProjectCode (stable across
        // imports), NOT projectId (which can change between "unresolved"
        // and "resolved" runs of the exact same Keka fact — see
        // timesheetReconciliation.rules.ts).
        const key = identityKey(canonicalEmployeeNo, row.rawProjectCode, row.workDate, row.task, row.startTime, row.endTime);
        const coarseKey = coarseIdentityKey(canonicalEmployeeNo, row.rawProjectCode, row.workDate, row.task);
        let existing = existingMap.get(key);
        // Start/End Time correction fix: an exact 6-field match failed —
        // before concluding this is a genuinely new session, check whether
        // it's a TIME correction to an existing one via time-range overlap
        // (see findTimeCorrectedEntry()'s own doc comment for the full
        // proof — this can never merge two genuinely separate sessions,
        // and never guesses when a candidate has no recognizable time).
        // `matchedViaTimeCorrection` gates the actual startTime/endTime
        // write below — decideEntryOutcome() itself is completely
        // unmodified; Created/Updated/Unchanged/Removed semantics stay
        // governed purely by hours/projectId exactly as before this fix.
        let matchedViaTimeCorrection = false;
        if (!existing) {
          const candidates = coarseGroups.get(coarseKey);
          if (candidates && candidates.length > 0) {
            const corrected = findTimeCorrectedEntry(candidates, row.startTime, row.endTime);
            if (corrected) {
              existing = corrected;
              matchedViaTimeCorrection = true;
            }
          }
        }
        // ProjectResource is inherently project-scoped — never recompute it
        // for an Unassigned pair, since there is no Project to attach it to
        // (per the approved decision).
        if (projectId) {
          resolvedPairs.add(`${canonicalEmployeeNo}||${projectId}`);
        }

        const decision = decideEntryOutcome(
          existing ? { projectId: existing.projectId, hours: existing.hours } : undefined,
          { projectId, hours: row.hours }
        );

        if (decision.outcome === "Created") {
          const created = await timesheetRepo.createEntry(tx, {
            employeeNo: canonicalEmployeeNo,
            rawEmployeeName: row.employeeName || null,
            projectId,
            rawProjectCode: row.rawProjectCode,
            rawProjectName: row.rawProjectName || null,
            workDate: row.workDate,
            task: row.task,
            startTime: row.startTime || null,
            endTime: row.endTime || null,
            hours: row.hours,
            sourceStatus: row.sourceStatus,
            firstImportId: timesheetImport.id,
            lastImportId: timesheetImport.id,
          });
          existingMap.set(key, created); // keeps a duplicate row later in the SAME file correctly seeing this as "existing"
          addToCoarseGroup(coarseKey, created); // so a LATER row in the SAME file can time-correction-match against this one
          createdCount++;
          rowLogs.push({
            entryId: created.id,
            rawEmployeeNo: row.employeeNo,
            rawProjectCode: row.rawProjectCode,
            workDate: row.workDate,
            task: row.task,
            startTime: row.startTime || null,
            endTime: row.endTime || null,
            previousHours: null,
            newHours: row.hours,
            outcome: "Created",
            failureReason: null,
          });
          continue;
        }

        if (!existing) {
          // The only other way to reach decision.outcome !== "Created" with
          // no existing match: a row that never existed before, arriving
          // with 0 hours — creates nothing, there is no "removal" to
          // represent (pre-existing special case, unchanged by this fix).
          unchangedCount++;
          rowLogs.push({
            entryId: null,
            rawEmployeeNo: row.employeeNo,
            rawProjectCode: row.rawProjectCode,
            workDate: row.workDate,
            task: row.task,
            startTime: row.startTime || null,
            endTime: row.endTime || null,
            previousHours: null,
            newHours: 0,
            outcome: "Unchanged",
            failureReason: null,
          });
          continue;
        }

        // The exact key `existing` is CURRENTLY filed under in existingMap
        // — equal to `key` for a normal exact match, but different from it
        // when `existing` was found via time-correction (it reflects
        // existing's OWN, still-uncorrected startTime/endTime). Needed so
        // every branch below can retire the old entry correctly instead of
        // leaving a stale, unreachable duplicate in existingMap.
        const existingKey = identityKey(
          existing.employeeNo,
          existing.rawProjectCode,
          existing.workDate,
          existing.task,
          existing.startTime,
          existing.endTime
        );

        if (decision.outcome === "Removed") {
          await timesheetRepo.deleteEntry(tx, existing.id);
          existingMap.delete(existingKey);
          removeFromCoarseGroup(coarseKey, existing.id);
          removedCount++;
          // Bug fix (Created-then-Removed within one file): existing.id may
          // already be referenced by an EARLIER row-log entry accumulated
          // earlier in THIS SAME loop — e.g. this exact identity was
          // Created a few rows up, in this same file, and is only now being
          // Removed by a later 0-hours correction. That earlier log entry's
          // entryId now points at a row this line just deleted, in the same
          // transaction, before rowLogs is ever bulk-inserted — left as-is,
          // createRowLogs() below would violate TimesheetImportRowLog's
          // entryId FK and roll back the ENTIRE import (confirmed against a
          // real 17,770-row historical file: employee 0446 / PR 7087 /
          // 2026-03-20 / "DEVELOPMENT OF DETAILED BOW-TIE(s)" — Created at
          // 3.58h, Removed later in the same file at 0h). Nulling it out
          // here mirrors exactly what onDelete: SetNull already does for a
          // log row that referenced an entry deleted by a LATER, separate
          // request — applied pre-emptively here since these rows are still
          // in memory and haven't been inserted yet. The log entries
          // themselves are kept (audit history, outcome, and hours fields
          // are untouched) — only the now-invalid entryId reference is
          // cleared. Never touches a different entry's log: ids are unique
          // per row, so this can only ever match log entries that trace
          // back to the exact row just deleted.
          for (const log of rowLogs) {
            if (log.entryId === existing.id) {
              log.entryId = null;
            }
          }
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
            startTime: row.startTime || null,
            endTime: row.endTime || null,
            previousHours: existing.hours,
            newHours: 0,
            outcome: "Removed",
            failureReason: null,
          });
          continue;
        }

        if (decision.outcome === "Unchanged") {
          // Hours already match. Priority #5: a pending project link
          // (Unassigned -> Resolved, or a relink to a different resolved
          // project) is still written here even though the outcome stays
          // "Unchanged" — a deliberate, confirmed business-rule choice (see
          // timesheetReconciliation.rules.ts's decideEntryOutcome() doc
          // comment), not a missed case. A time correction
          // (matchedViaTimeCorrection) is the same kind of
          // independent-of-outcome-label write: hours staying equal
          // doesn't mean nothing changed if the row's recorded Start/End
          // Time itself is being corrected (e.g. 09:00-13:00 -> 09:05-13:05,
          // same duration, shifted start).
          const needsWrite = decision.writeProjectId || matchedViaTimeCorrection;
          const updatedRow = needsWrite
            ? await timesheetRepo.updateEntryHours(
                tx,
                existing.id,
                row.hours,
                timesheetImport.id,
                decision.writeProjectId ? projectId : undefined,
                matchedViaTimeCorrection ? row.startTime || null : undefined,
                matchedViaTimeCorrection ? row.endTime || null : undefined
              )
            : existing;
          existingMap.delete(existingKey);
          existingMap.set(key, updatedRow);
          replaceInCoarseGroup(coarseKey, existing.id, updatedRow);
          unchangedCount++;
          // existing is always present in this branch (the !existing case
          // already `continue`d above). A plain hours-equal re-send (not a
          // time correction) is additionally counted as a duplicate — a
          // time correction with coincidentally-equal hours is NOT a
          // re-send of an already-recorded fact, so it's deliberately
          // excluded from duplicateCount even though it stays "Unchanged"
          // by hours.
          if (!matchedViaTimeCorrection) {
            duplicateCount++;
          }
          rowLogs.push({
            entryId: existing.id,
            rawEmployeeNo: row.employeeNo,
            rawProjectCode: row.rawProjectCode,
            workDate: row.workDate,
            task: row.task,
            startTime: row.startTime || null,
            endTime: row.endTime || null,
            previousHours: existing.hours,
            newHours: row.hours,
            outcome: "Unchanged",
            failureReason: null,
          });
          continue;
        }

        // Updated — the later KEKA value always wins. NEVER added to the
        // previous value. Also relinks projectId in the same statement when
        // decision.writeProjectId is true (an Unassigned/relink transition
        // whose hours also changed). Also writes the corrected Start/End
        // Time in the same statement when matchedViaTimeCorrection is true
        // (this row's identity changed specifically because its recorded
        // time is being corrected — see findTimeCorrectedEntry()).
        const updated = await timesheetRepo.updateEntryHours(
          tx,
          existing.id,
          row.hours,
          timesheetImport.id,
          decision.writeProjectId ? projectId : undefined,
          matchedViaTimeCorrection ? row.startTime || null : undefined,
          matchedViaTimeCorrection ? row.endTime || null : undefined
        );
        existingMap.delete(existingKey);
        existingMap.set(key, updated);
        replaceInCoarseGroup(coarseKey, existing.id, updated);
        updatedCount++;
        rowLogs.push({
          entryId: existing.id,
          rawEmployeeNo: row.employeeNo,
          rawProjectCode: row.rawProjectCode,
          workDate: row.workDate,
          task: row.task,
          startTime: row.startTime || null,
          endTime: row.endTime || null,
          previousHours: existing.hours,
          newHours: row.hours,
          outcome: "Updated",
          failureReason: null,
        });
      }

      await rowLogRepo.createRowLogs(tx, timesheetImport.id, rowLogs);
      },
      { timeout: 120_000, maxWait: 10_000 }
    );
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
    duplicateCount,
    // Never persisted to the TimesheetImport row itself (no schema change)
    // — purely returned so the calling controller can show it immediately.
    invalidRows: meta.invalidRows ?? [],
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
export async function editTimesheetEntry(id: string, input: EditEntryBody, user: AccessTokenPayload) {
  const existing = await timesheetRepo.findEntryById(id);
  if (!existing) {
    throw new AppError("Timesheet entry not found.", 404);
  }

  // Ownership is resolved from the entry's OWN projectId (never a
  // client-supplied one) — an "Unassigned" entry (projectId: null, the KEKA
  // import case with no resolvable project) has nothing to own and stays
  // editable by any Timesheets-access user, matching findEntries()'s own
  // "always visible" rule for the same case. Administrator always passes
  // (see assertProjectAccessById -> canAccessProject).
  if (existing.projectId) {
    await assertProjectAccessById(existing.projectId, user);
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

/**
 * Historical-backfill clear — the date-scoped counterpart to
 * deleteAllTimesheetEntries() above, added to support replacing a bounded
 * historical window (Keka implementation start date -> yesterday) with a
 * clean Excel backfill without disturbing anything outside that window.
 * Administrator-only, gated at the route (see timesheet.routes.ts) —
 * exactly the same precedent as Delete-All/Delete-Permanently.
 *
 * Scope, deliberately identical to Delete-All's own discipline, just
 * bounded by date instead of unconditional: ONLY TimesheetEntry rows whose
 * workDate falls within [startDate, endDate] (inclusive) are removed.
 * Employees, Projects, Customers, ProjectResource rows with no backing
 * TimesheetEntry, Invoices, Expenses, Milestones, Notifications, and every
 * TimesheetImport/TimesheetImportRowLog audit record are all untouched —
 * TimesheetImportRowLog rows that referenced a now-deleted entry survive
 * with entryId: null via the existing onDelete: SetNull (schema.prisma),
 * the same outcome a single "Removed" reconciliation entry already
 * produces today; nothing new is introduced here.
 *
 * ProjectResource safety — identical reasoning to Delete-All:
 * findDistinctMappedPairsInRange() captures, BEFORE the delete, exactly the
 * pairs that have at least one TimesheetEntry inside the range; only those
 * are recomputed afterward (from whatever TimesheetEntry rows remain for
 * them, in or out of the deleted range — recomputeProjectResource() always
 * reads the pair's CURRENT full history, never just the deleted slice). A
 * pair with a ProjectResource row but no TimesheetEntry in this range at
 * all (including a purely-manual Team-Assigned resource) is never touched.
 */
export async function clearHistoricalTimesheetEntries(
  startDate: Date,
  endDate: Date
): Promise<{ deletedCount: number; recomputedPairCount: number; startDate: Date; endDate: Date }> {
  if (startDate.getTime() > endDate.getTime()) {
    throw new AppError("Start date must be on or before the end date.", 400);
  }

  const mappedPairs = await timesheetRepo.findDistinctMappedPairsInRange(startDate, endDate);

  const result = await timesheetRepo.deleteEntriesInRange(startDate, endDate);

  for (const pair of mappedPairs) {
    if (pair.projectId) {
      await recomputeProjectResource(pair.employeeNo, pair.projectId);
    }
  }

  return { deletedCount: result.count, recomputedPairCount: mappedPairs.length, startDate, endDate };
}
