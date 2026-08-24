import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../../shared/utils/prismaClient.js";
import { processTimesheetImport } from "./services/timesheet.service.js";
import { claimFailedImportForRetry, decideImportEligibility } from "./repository/timesheetImport.repository.js";
import type { ParsedTimesheetRow } from "./timesheet.types.js";

/**
 * P2-08 — Keka failed-import retry. Proves, against the real reconciliation
 * engine and real DB state (no Graph/mocking needed — decideImportEligibility()
 * is exercised directly, exactly as mailPoll.service.ts calls it), that a
 * "Failed" TimesheetImport is retry-eligible while "Succeeded"/
 * "PartiallySucceeded"/"Processing" are not, that retry reuses the SAME
 * row (never a duplicate TimesheetImport, never duplicate TimesheetEntry
 * rows), and that two concurrent retry attempts for the same email cannot
 * both win. Clearly-marked synthetic data (unique per-test emailMessageId,
 * employeeNo, rawProjectCode — collision-safe against concurrent test runs
 * and unrelated dev data), cleaned up by exact collected ID in `finally`.
 */

const TAG = `p2-08-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function row(overrides: Partial<ParsedTimesheetRow> = {}): ParsedTimesheetRow {
  return {
    employeeNo: `${TAG}-EMP`,
    employeeName: "P2-08 Synthetic Employee",
    rawProjectCode: `${TAG}-PR-NONEXISTENT`,
    rawProjectName: "P2-08 Synthetic Project",
    workDate: new Date("2020-01-01T00:00:00.000Z"),
    task: "P2-08",
    hours: 1,
    sourceStatus: "Active",
    ...overrides,
  };
}

async function cleanup(importIds: string[]) {
  const entries = await prisma.timesheetEntry.findMany({
    where: { rawProjectCode: { startsWith: `${TAG}-PR` } },
    select: { id: true },
  });
  const entryIds = entries.map((e) => e.id);
  if (entryIds.length > 0) {
    await prisma.timesheetImportRowLog.deleteMany({ where: { entryId: { in: entryIds } } });
    await prisma.timesheetEntry.deleteMany({ where: { id: { in: entryIds } } });
  }
  await prisma.timesheetImportRowLog.deleteMany({ where: { rawProjectCode: { startsWith: `${TAG}-PR` } } });
  const validImportIds = [...new Set(importIds)].filter((id): id is string => !!id);
  if (validImportIds.length > 0) {
    await prisma.timesheetImport.deleteMany({ where: { id: { in: validImportIds } } });
  }
}

test("P2-08 case A — no previous import: processes normally, creates a real TimesheetImport + TimesheetEntry", async () => {
  const emailMessageId = `${TAG}-A`;
  const importIds: string[] = [];
  try {
    const decision = await decideImportEligibility(emailMessageId);
    assert.deepEqual(decision, { action: "processNew" });

    const result = await processTimesheetImport([row()], { triggeredBy: "EmailPoll", emailMessageId });
    importIds.push(result.importId);

    assert.equal(result.status, "Succeeded");
    assert.equal(result.createdCount, 1);

    const stored = await prisma.timesheetImport.findUnique({ where: { id: result.importId } });
    assert.equal(stored?.status, "Succeeded");
    assert.equal(stored?.emailMessageId, emailMessageId);
  } finally {
    await cleanup(importIds);
  }
});

test("P2-08 case B — existing Succeeded import: duplicate Keka email is skipped, never reprocessed, never duplicated", async () => {
  const emailMessageId = `${TAG}-B`;
  const importIds: string[] = [];
  try {
    const first = await processTimesheetImport([row()], { triggeredBy: "EmailPoll", emailMessageId });
    importIds.push(first.importId);
    assert.equal(first.status, "Succeeded");

    // Case B / item 8: the SAME email arriving again must be skipped.
    const decision = await decideImportEligibility(emailMessageId);
    assert.deepEqual(decision, { action: "skip", reason: "alreadySucceeded" });

    // Confirm exactly one TimesheetImport and exactly one TimesheetEntry exist.
    const imports = await prisma.timesheetImport.findMany({ where: { emailMessageId } });
    assert.equal(imports.length, 1);
    const entries = await prisma.timesheetEntry.findMany({ where: { rawProjectCode: row().rawProjectCode } });
    assert.equal(entries.length, 1, "no duplicate TimesheetEntry from a re-encountered Succeeded email");
  } finally {
    await cleanup(importIds);
  }
});

test("P2-08 case C/F — existing Failed import is retried, reuses the SAME import id, and a successful retry ends Succeeded", async () => {
  const emailMessageId = `${TAG}-C`;
  const importIds: string[] = [];
  try {
    // Seed a "Failed" import directly (simulating a prior systemic failure —
    // e.g. a Graph/DB hiccup mid-transaction — without needing to force a
    // real exception through the pipeline for this part of the test).
    const seeded = await prisma.timesheetImport.create({
      data: { triggeredBy: "EmailPoll", emailMessageId, status: "Failed", errorSummary: "Simulated prior failure" },
    });
    importIds.push(seeded.id);

    const decision = await decideImportEligibility(emailMessageId);
    assert.deepEqual(decision, { action: "retryExisting", existingImportId: seeded.id });

    // The claim must have already flipped it to Processing as a side effect.
    const afterClaim = await prisma.timesheetImport.findUnique({ where: { id: seeded.id } });
    assert.equal(afterClaim?.status, "Processing");

    // Retry using the existing (now-claimed) id — mirrors exactly what
    // mailPoll.service.ts does.
    const retryResult = await processTimesheetImport([row()], {
      triggeredBy: "EmailPoll",
      emailMessageId,
      existingImportId: seeded.id,
    });

    assert.equal(retryResult.importId, seeded.id, "retry must reuse the SAME TimesheetImport row, never create a new one");
    assert.equal(retryResult.status, "Succeeded");
    assert.equal(retryResult.createdCount, 1);

    // Exactly one TimesheetImport row for this email — audit history
    // preserved on the SAME row, not fragmented across a new one.
    const imports = await prisma.timesheetImport.findMany({ where: { emailMessageId } });
    assert.equal(imports.length, 1);

    // Future polls must now skip it (Case F: future cycles skip a
    // successfully-retried import).
    const decisionAfter = await decideImportEligibility(emailMessageId);
    assert.deepEqual(decisionAfter, { action: "skip", reason: "alreadySucceeded" });
  } finally {
    await cleanup(importIds);
  }
});

test("P2-08 case E — a retry that fails again stays Failed and remains retryable on the next cycle", async () => {
  const emailMessageId = `${TAG}-E`;
  const importIds: string[] = [];
  try {
    const seeded = await prisma.timesheetImport.create({
      data: { triggeredBy: "EmailPoll", emailMessageId, status: "Failed", errorSummary: "Simulated prior failure" },
    });
    importIds.push(seeded.id);

    const claimed = await claimFailedImportForRetry(seeded.id);
    assert.equal(claimed, true);

    // Simulate the retry itself failing again (mirrors processTimesheetImport()'s
    // own catch block calling finalizeImport with status: "Failed").
    await prisma.timesheetImport.update({
      where: { id: seeded.id },
      data: { status: "Failed", errorSummary: "Simulated second failure", processingFinishedAt: new Date() },
    });

    const stillFailed = await prisma.timesheetImport.findUnique({ where: { id: seeded.id } });
    assert.equal(stillFailed?.status, "Failed");

    // Must still be retry-eligible on the NEXT poll cycle — not permanently stuck.
    const decision = await decideImportEligibility(emailMessageId);
    assert.deepEqual(decision, { action: "retryExisting", existingImportId: seeded.id });

    // Exactly one TimesheetImport row throughout — no duplicate created by
    // either failed attempt.
    const imports = await prisma.timesheetImport.findMany({ where: { emailMessageId } });
    assert.equal(imports.length, 1);
  } finally {
    await cleanup(importIds);
  }
});

test("P2-08 case D — an import currently Processing is not retried or duplicated", async () => {
  const emailMessageId = `${TAG}-D`;
  const importIds: string[] = [];
  try {
    const seeded = await prisma.timesheetImport.create({
      data: { triggeredBy: "EmailPoll", emailMessageId, status: "Processing" },
    });
    importIds.push(seeded.id);

    const decision = await decideImportEligibility(emailMessageId);
    assert.deepEqual(decision, { action: "skip", reason: "inProgress" });

    // Confirm it was NOT touched (still Processing, not silently flipped).
    const after = await prisma.timesheetImport.findUnique({ where: { id: seeded.id } });
    assert.equal(after?.status, "Processing");
  } finally {
    await cleanup(importIds);
  }
});

test("P2-08 concurrency — two simultaneous retry attempts for the same Failed import: exactly one wins the claim", async () => {
  const emailMessageId = `${TAG}-RACE`;
  const importIds: string[] = [];
  try {
    const seeded = await prisma.timesheetImport.create({
      data: { triggeredBy: "EmailPoll", emailMessageId, status: "Failed", errorSummary: "Simulated prior failure" },
    });
    importIds.push(seeded.id);

    // Genuinely concurrent — both fire before either resolves.
    const [claimA, claimB] = await Promise.all([
      claimFailedImportForRetry(seeded.id),
      claimFailedImportForRetry(seeded.id),
    ]);
    const winners = [claimA, claimB].filter(Boolean).length;
    assert.equal(winners, 1, `expected exactly one winner, got claimA=${claimA} claimB=${claimB}`);

    const after = await prisma.timesheetImport.findUnique({ where: { id: seeded.id } });
    assert.equal(after?.status, "Processing");

    // Also prove it at the decision-function level (the actual call
    // mailPoll.service.ts makes), with a fresh Failed row and higher
    // concurrency for extra confidence.
    const seeded2 = await prisma.timesheetImport.create({
      data: { triggeredBy: "EmailPoll", emailMessageId: `${emailMessageId}-2`, status: "Failed" },
    });
    importIds.push(seeded2.id);

    const decisions = await Promise.all(
      Array.from({ length: 10 }, () => decideImportEligibility(`${emailMessageId}-2`))
    );
    const retryWinners = decisions.filter((d) => d.action === "retryExisting").length;
    const raceLosers = decisions.filter((d) => d.action === "skip" && d.reason === "retryLostRace").length;
    assert.equal(retryWinners, 1, `expected exactly one retryExisting among 10 concurrent decisions, got ${JSON.stringify(decisions)}`);
    assert.equal(raceLosers, 9);
  } finally {
    await cleanup(importIds);
  }
});
