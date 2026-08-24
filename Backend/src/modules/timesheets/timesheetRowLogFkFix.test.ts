import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../../shared/utils/prismaClient.js";
import { processTimesheetImport } from "./services/timesheet.service.js";

const TAG = `ts-rowlog-fk-${Date.now()}`;

/**
 * Regression coverage for the real Created-then-Removed-within-one-file
 * TimesheetImportRowLog FK bug, discovered against the actual historical
 * backfill Excel (17,770 rows) — reproduced here with the exact triggering
 * identity's SHAPE (employee/date/task/hours sequence), not a synthetic
 * stand-in. This file tests ONLY the row-log bookkeeping fix in
 * processTimesheetImport()'s "Removed" branch — identityKey(),
 * decideEntryOutcome(), duplicate detection, last-row-wins, and
 * never-sum are all exercised exactly as they already are elsewhere and are
 * asserted here to be unchanged, never modified by this fix.
 *
 * rawProjectCode is deliberately a TAG-scoped, unparseable string, NOT the
 * real file's literal "PR 7087" — that code resolves to a REAL, live
 * company Project in this database (confirmed: id 33bbfcb3-...,
 * "HAZID, HAZOP, SIL Assessment... BCGCL..."). An earlier draft of this
 * test used "PR 7087" verbatim and it resolved successfully, causing
 * recomputeProjectResource() to write real ProjectResource rows against
 * that real project for fake test employeeNos — a genuine data-hygiene bug
 * in the test itself (caught and cleaned up: 18 polluting rows deleted,
 * confirmed scoped only to this test's own tag, real data left untouched).
 * Using a string normalizeProjectCode() can never parse into a real PR
 * code guarantees every row here resolves to projectId: null (Unassigned),
 * so recomputeProjectResource() is never called at all and this test can
 * never again touch real project data, regardless of what real projects
 * exist in whatever database this suite runs against.
 */

const IDENTITY = {
  employeeNo: "0446",
  employeeName: "Regression Test Employee",
  rawProjectCode: `${TAG}-UNRESOLVABLE-PROJECT-CODE`,
  rawProjectName: "",
  workDate: new Date("2026-03-20T00:00:00.000Z"),
  task: "DEVELOPMENT OF DETAILED BOW-TIE(s)",
  sourceStatus: "Active",
};

async function rowLogsFor(importId: string) {
  return prisma.timesheetImportRowLog.findMany({ where: { importId }, orderBy: { createdAt: "asc" } });
}

test("Created-then-Removed within one import (real 0446/PR7087/2026-03-20 case): import succeeds, no orphaned RowLog.entryId", async () => {
  const createdImportIds: string[] = [];
  try {
    // ---- THE EXACT REPRODUCTION: proves the fix, not a synthetic stand-in ----
    const result = await processTimesheetImport(
      [
        { ...IDENTITY, employeeNo: `${TAG}-0446`, hours: 3.58 }, // row 1 -> Created
        { ...IDENTITY, employeeNo: `${TAG}-0446`, hours: 0 }, // row 2, same identity -> Removed
      ],
      { triggeredBy: "ManualUpload", attachmentFilename: `${TAG}.xlsx` }
    );
    createdImportIds.push(result.importId);

    // The import must SUCCEED — this is exactly what failed before the fix
    // (the whole transaction rolled back on the FK violation).
    assert.equal(result.status, "Succeeded");
    assert.equal(result.createdCount, 1);
    assert.equal(result.removedCount, 1);
    assert.equal(result.failedCount, 0);

    // Final TimesheetEntry state: zero rows for this identity (created then removed).
    const finalEntries = await prisma.timesheetEntry.findMany({
      where: { employeeNo: `${TAG}-0446`, rawProjectCode: IDENTITY.rawProjectCode, workDate: IDENTITY.workDate, task: IDENTITY.task },
    });
    assert.equal(finalEntries.length, 0);

    // Row logs: one Created, one Removed, BOTH must exist (audit history
    // preserved) and NEITHER may reference a real still-existing row — the
    // Created log's entryId must have been retroactively nulled by the fix.
    const logs = await rowLogsFor(result.importId);
    assert.equal(logs.length, 2);
    const createdLog = logs.find((l) => l.outcome === "Created");
    const removedLog = logs.find((l) => l.outcome === "Removed");
    assert.ok(createdLog, "Created row log must exist");
    assert.ok(removedLog, "Removed row log must exist");
    assert.equal(createdLog!.entryId, null, "Created log's entryId must be nulled once its entry is removed later in the same import");
    assert.equal(removedLog!.entryId, null, "Removed log's entryId is null per existing behavior");
    // The historical facts themselves are preserved, not erased.
    assert.equal(createdLog!.newHours, 3.58);
    assert.equal(removedLog!.previousHours, 3.58);
    assert.equal(removedLog!.newHours, 0);
  } finally {
    await prisma.timesheetImportRowLog.deleteMany({ where: { importId: { in: createdImportIds } } });
    await prisma.timesheetEntry.deleteMany({ where: { employeeNo: `${TAG}-0446` } });
    await prisma.timesheetImport.deleteMany({ where: { id: { in: createdImportIds } } });
  }
});

test("Normal behavior is unaffected by the fix — Created/Updated/Unchanged/Removed-alone/Created+Updated/recreate-after-removal", async () => {
  const createdImportIds: string[] = [];
  const empPrefix = `${TAG}-normal`;
  try {
    // ---- Case 1: Created, no later removal -> log keeps a real, valid entryId. ----
    const emp1 = `${empPrefix}-1`;
    const r1 = await processTimesheetImport(
      [{ ...IDENTITY, employeeNo: emp1, hours: 5 }],
      { triggeredBy: "ManualUpload" }
    );
    createdImportIds.push(r1.importId);
    assert.equal(r1.status, "Succeeded");
    const entry1 = await prisma.timesheetEntry.findFirst({ where: { employeeNo: emp1, rawProjectCode: IDENTITY.rawProjectCode, workDate: IDENTITY.workDate, task: IDENTITY.task } });
    assert.ok(entry1);
    const logs1 = await rowLogsFor(r1.importId);
    assert.equal(logs1.length, 1);
    assert.equal(logs1[0]!.outcome, "Created");
    assert.equal(logs1[0]!.entryId, entry1!.id, "Case 1: Created log must retain its real, valid entryId when nothing removes it");

    // ---- Case 2: existing entry Updated (different hours, no removal) ----
    const r2 = await processTimesheetImport(
      [{ ...IDENTITY, employeeNo: emp1, hours: 8 }],
      { triggeredBy: "ManualUpload" }
    );
    createdImportIds.push(r2.importId);
    assert.equal(r2.status, "Succeeded");
    assert.equal(r2.updatedCount, 1);
    const entry1AfterUpdate = await prisma.timesheetEntry.findFirst({ where: { id: entry1!.id } });
    assert.equal(entry1AfterUpdate!.hours, 8, "later value wins");
    assert.notEqual(entry1AfterUpdate!.hours, 5 + 8, "hours must never be summed");
    const logs2 = await rowLogsFor(r2.importId);
    assert.equal(logs2.length, 1);
    assert.equal(logs2[0]!.outcome, "Updated");
    assert.equal(logs2[0]!.entryId, entry1!.id, "Case 2: Updated log must reference the correct, still-existing entry");

    // ---- Case 3: existing entry Unchanged/duplicate (same hours re-sent) ----
    const r3 = await processTimesheetImport(
      [{ ...IDENTITY, employeeNo: emp1, hours: 8 }],
      { triggeredBy: "ManualUpload" }
    );
    createdImportIds.push(r3.importId);
    assert.equal(r3.status, "Succeeded");
    assert.equal(r3.duplicateCount, 1);
    const logs3 = await rowLogsFor(r3.importId);
    assert.equal(logs3[0]!.outcome, "Unchanged");
    assert.equal(logs3[0]!.entryId, entry1!.id, "Case 3: Unchanged/duplicate log unaffected by the fix");
    const entry1AfterDup = await prisma.timesheetEntry.findFirst({ where: { id: entry1!.id } });
    assert.equal(entry1AfterDup!.hours, 8, "duplicate re-send must not rewrite the value");

    // ---- Case 4: existing entry Removed ALONE (entry pre-dates this import
    // — i.e. NOT created earlier in the same file) -> existing behavior,
    // unaffected by the fix (the fix only nulls EARLIER logs from the SAME
    // import; there are none here since the entry came from imports r1/r2/r3). ----
    const r4 = await processTimesheetImport(
      [{ ...IDENTITY, employeeNo: emp1, hours: 0 }],
      { triggeredBy: "ManualUpload" }
    );
    createdImportIds.push(r4.importId);
    assert.equal(r4.status, "Succeeded");
    assert.equal(r4.removedCount, 1);
    const entry1AfterRemoval = await prisma.timesheetEntry.findFirst({ where: { id: entry1!.id } });
    assert.equal(entry1AfterRemoval, null);
    const logs4 = await rowLogsFor(r4.importId);
    assert.equal(logs4[0]!.outcome, "Removed");
    assert.equal(logs4[0]!.entryId, null, "Case 4: Removed-alone log entryId is null exactly as before this fix");
    // The PRE-EXISTING row logs from imports r1/r2/r3 (already committed
    // before this fix's in-memory nulling logic ever runs) must have been
    // nulled by the database's own onDelete: SetNull -- proving this fix
    // does not duplicate or interfere with that separate, pre-existing
    // mechanism.
    const priorLogsAfterDelete = await prisma.timesheetImportRowLog.findMany({ where: { id: { in: [logs1[0]!.id, logs2[0]!.id, logs3[0]!.id] } } });
    assert.equal(priorLogsAfterDelete.length, 3);
    for (const log of priorLogsAfterDelete) {
      assert.equal(log.entryId, null, "Pre-existing row logs from earlier imports must be nulled via the database's own onDelete: SetNull once their entry is deleted");
    }

    // ---- Case 5: Created -> Updated within the SAME import (no removal) ----
    const emp2 = `${empPrefix}-2`;
    const r5 = await processTimesheetImport(
      [
        { ...IDENTITY, employeeNo: emp2, hours: 4 },
        { ...IDENTITY, employeeNo: emp2, hours: 6 },
      ],
      { triggeredBy: "ManualUpload" }
    );
    createdImportIds.push(r5.importId);
    assert.equal(r5.status, "Succeeded");
    assert.equal(r5.createdCount, 1);
    assert.equal(r5.updatedCount, 1);
    const entry2 = await prisma.timesheetEntry.findFirst({ where: { employeeNo: emp2, rawProjectCode: IDENTITY.rawProjectCode, workDate: IDENTITY.workDate, task: IDENTITY.task } });
    assert.ok(entry2);
    assert.equal(entry2!.hours, 6, "last row wins, never summed (not 4+6=10)");
    const logs5 = await rowLogsFor(r5.importId);
    assert.equal(logs5.length, 2);
    const created5 = logs5.find((l) => l.outcome === "Created");
    const updated5 = logs5.find((l) => l.outcome === "Updated");
    assert.equal(created5!.entryId, entry2!.id, "Case 5: Created log for an entry that is later Updated (not Removed) keeps its real entryId");
    assert.equal(updated5!.entryId, entry2!.id, "Case 5: Updated log references the correct, still-existing entry");

    // ---- Case 6: Created -> Removed -> RE-CREATED, same identity, all
    // within the SAME import -- the existing engine's own documented
    // behavior for this sequence (a fresh Created row after a same-file
    // removal); this fix must not alter it, only ensure every log's
    // entryId corresponds to a row that actually exists (or null). ----
    const emp3 = `${empPrefix}-3`;
    const r6 = await processTimesheetImport(
      [
        { ...IDENTITY, employeeNo: emp3, hours: 5 }, // Created (A)
        { ...IDENTITY, employeeNo: emp3, hours: 0 }, // Removed (A)
        { ...IDENTITY, employeeNo: emp3, hours: 3 }, // Created (B) - existingMap no longer has this identity, so this IS a fresh Created
      ],
      { triggeredBy: "ManualUpload" }
    );
    createdImportIds.push(r6.importId);
    assert.equal(r6.status, "Succeeded");
    assert.equal(r6.createdCount, 2, "two distinct Created rows: A and its replacement B");
    assert.equal(r6.removedCount, 1);
    const finalEntry3 = await prisma.timesheetEntry.findMany({ where: { employeeNo: emp3, rawProjectCode: IDENTITY.rawProjectCode, workDate: IDENTITY.workDate, task: IDENTITY.task } });
    assert.equal(finalEntry3.length, 1, "exactly one surviving entry: B");
    assert.equal(finalEntry3[0]!.hours, 3);
    const logs6 = await rowLogsFor(r6.importId);
    assert.equal(logs6.length, 3);
    const createdLogs6 = logs6.filter((l) => l.outcome === "Created");
    const removedLogs6 = logs6.filter((l) => l.outcome === "Removed");
    assert.equal(createdLogs6.length, 2);
    assert.equal(removedLogs6.length, 1);
    // The first Created (A, now deleted) must be nulled; the second
    // Created (B, still alive) must reference the real surviving row.
    const nulledCreated = createdLogs6.filter((l) => l.entryId === null);
    const liveCreated = createdLogs6.filter((l) => l.entryId !== null);
    assert.equal(nulledCreated.length, 1, "Case 6: Created(A)'s log must be nulled once A is removed");
    assert.equal(liveCreated.length, 1, "Case 6: Created(B)'s log must keep its real, valid entryId");
    assert.equal(liveCreated[0]!.entryId, finalEntry3[0]!.id);
    assert.equal(removedLogs6[0]!.entryId, null);
  } finally {
    await prisma.timesheetImportRowLog.deleteMany({ where: { importId: { in: createdImportIds } } });
    await prisma.timesheetEntry.deleteMany({ where: { employeeNo: { startsWith: empPrefix } } });
    await prisma.timesheetImport.deleteMany({ where: { id: { in: createdImportIds } } });
  }
});
