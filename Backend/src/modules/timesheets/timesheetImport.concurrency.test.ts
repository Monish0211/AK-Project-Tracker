import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../../shared/utils/prismaClient.js";
import { processTimesheetImport } from "./services/timesheet.service.js";

const TAG = `ts-concurrency-${Date.now()}`;

function projectPayload(prNo: string) {
  return {
    poMonth: "2026-01",
    prCategory: "India",
    prNo,
    client: "Timesheet Import Concurrency Regression Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "Timesheet import concurrency regression",
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectEndDate: new Date("2026-12-31"),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
    createdByUserId: null,
  };
}

/**
 * Proves the P1-style concurrency fix in timesheet.service.ts's
 * processTimesheetImport(): two genuinely simultaneous imports of the
 * IDENTICAL new (employeeNo, rawProjectCode, workDate, task) fact — one
 * simulating a Keka email poll, one simulating an Excel upload — must
 * produce exactly ONE TimesheetEntry, never two. Before the fix, both
 * calls would have read the same pre-transaction "nothing exists yet"
 * snapshot and both inserted a row; the pg_advisory_xact_lock now
 * serializes the two transactions so the second one re-reads a fresh,
 * post-commit view before deciding anything.
 */
test("Two genuinely concurrent imports of the same fact (Keka-style + Excel-style) create exactly one TimesheetEntry, never two", async () => {
  const createdProjectIds: string[] = [];
  const createdImportIds: string[] = [];

  try {
    const project = await prisma.project.create({ data: projectPayload(`${TAG}-A`) });
    createdProjectIds.push(project.id);

    const employeeNo = `${TAG}-EMP-RACE`;
    const sharedRow = {
      employeeNo,
      employeeName: "Race Condition Test Employee",
      rawProjectCode: `${TAG}-A`,
      rawProjectName: "",
      workDate: new Date("2026-03-15T00:00:00.000Z"),
      task: "Concurrency Test Task",
      hours: 7,
      sourceStatus: "Active",
    };

    const [kekaResult, excelResult] = await Promise.all([
      processTimesheetImport([sharedRow], { triggeredBy: "EmailPoll", emailMessageId: `${TAG}-race-msg` }),
      processTimesheetImport([{ ...sharedRow }], { triggeredBy: "ManualUpload" }),
    ]);
    createdImportIds.push(kekaResult.importId, excelResult.importId);

    const entries = await prisma.timesheetEntry.findMany({
      where: { employeeNo, projectId: project.id, rawProjectCode: `${TAG}-A` },
    });

    // Exactly one entry exists, with the correct hours — never two rows for
    // the same identity, and never a lost/corrupted value either.
    assert.equal(entries.length, 1, `Expected exactly 1 TimesheetEntry after two concurrent imports of the same fact, found ${entries.length}`);
    assert.equal(entries[0]!.hours, 7);

    // Exactly one of the two concurrent runs actually created the row; the
    // other correctly recognized it as an already-existing duplicate (its
    // own re-read, post-lock, saw the first run's committed row).
    const createdTotal = kekaResult.createdCount + excelResult.createdCount;
    const duplicateTotal = kekaResult.duplicateCount + excelResult.duplicateCount;
    assert.equal(createdTotal, 1, "Exactly one of the two concurrent imports should report having created the row");
    assert.equal(duplicateTotal, 1, "Exactly one of the two concurrent imports should report the row as a duplicate");
  } finally {
    await prisma.timesheetImportRowLog.deleteMany({ where: { importId: { in: createdImportIds } } });
    await prisma.timesheetEntry.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.timesheetImport.deleteMany({ where: { id: { in: createdImportIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
  }
});
