import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { prisma } from "../../shared/utils/prismaClient.js";
import { processTimesheetImport } from "./services/timesheet.service.js";
import type { ParsedTimesheetRow } from "./timesheet.types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAG = `ts-starttime-${Date.now()}`;

/**
 * Regression coverage for the Start Time / End Time identity component
 * added to identityKey() (timesheetReconciliation.rules.ts) — Phase A/A.2's
 * confirmed finding: the previous 4-field identity (employee+project+date+
 * task) collapsed genuinely separate KEKA work sessions on the same day
 * into one TimesheetEntry, discarding the earlier session's hours. Traced
 * against the real historical export: 99% of a 9,495-hour discrepancy was
 * exactly this pattern (e.g. 09:00-13:00=4h then 14:00-18:30=4.5h collapsing
 * to 4.5h instead of 8.5h).
 *
 * rawProjectCode is a TAG-scoped, unresolvable string (never a real PR
 * code) so every row here resolves to projectId: null — the same isolation
 * discipline timesheetRowLogFkFix.test.ts already established, to
 * guarantee this suite can never touch real Project/ProjectResource data.
 */

const BASE: Omit<ParsedTimesheetRow, "employeeNo" | "workDate" | "hours" | "startTime" | "endTime"> = {
  employeeName: "Regression Test Employee",
  rawProjectCode: `${TAG}-UNRESOLVABLE-PROJECT-CODE`,
  rawProjectName: "",
  task: "SCE workshop",
  sourceStatus: "Active",
};

function row(employeeNo: string, workDate: string, startTime: string, endTime: string, hours: number): ParsedTimesheetRow {
  return { ...BASE, employeeNo, workDate: new Date(`${workDate}T00:00:00.000Z`), startTime, endTime, hours };
}

async function entriesFor(employeeNo: string) {
  return prisma.timesheetEntry.findMany({
    where: { employeeNo, rawProjectCode: BASE.rawProjectCode },
    orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
  });
}

async function cleanup(importIds: string[], employeeNoPrefix: string) {
  await prisma.timesheetImportRowLog.deleteMany({ where: { importId: { in: importIds } } });
  await prisma.timesheetEntry.deleteMany({ where: { employeeNo: { startsWith: employeeNoPrefix } } });
  await prisma.timesheetImport.deleteMany({ where: { id: { in: importIds } } });
}

// ── A. Two separate sessions on the same day ────────────────────────────
test("A. two separate sessions on the same day (different Start/End Time, different hours) -> TWO entries, total 8.5h", async () => {
  const emp = `${TAG}-A`;
  const importIds: string[] = [];
  try {
    const result = await processTimesheetImport(
      [row(emp, "2026-02-02", "9:00", "13:00", 4), row(emp, "2026-02-02", "14:00", "18:30", 4.5)],
      { triggeredBy: "ManualUpload" }
    );
    importIds.push(result.importId);

    assert.equal(result.createdCount, 2, "both sessions are genuinely new identities -> both Created");
    assert.equal(result.updatedCount, 0);

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 2, "two distinct TimesheetEntry rows must survive");
    const total = entries.reduce((sum, e) => sum + e.hours, 0);
    assert.equal(Math.round(total * 100) / 100, 8.5, "total must be the SUM of both sessions, never one overwriting the other");
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── B. Same session resent ───────────────────────────────────────────────
test("B. same session resent (identical Start/End Time, identical hours) -> ONE entry, 4h", async () => {
  const emp = `${TAG}-B`;
  const importIds: string[] = [];
  try {
    const result = await processTimesheetImport(
      [row(emp, "2026-02-02", "9:00", "13:00", 4), row(emp, "2026-02-02", "9:00", "13:00", 4)],
      { triggeredBy: "ManualUpload" }
    );
    importIds.push(result.importId);

    assert.equal(result.createdCount, 1, "the first occurrence creates the row");
    assert.equal(result.duplicateCount, 1, "the identical re-send is a no-op duplicate, not a second row");
    assert.equal(result.updatedCount, 0);

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 1, "exactly one entry must survive");
    assert.equal(entries[0]!.hours, 4);
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── C. Same session corrected ────────────────────────────────────────────
test("C. same session corrected (identical Start/End Time, different hours) -> ONE entry, later value wins (6h, never 8+6=14)", async () => {
  const emp = `${TAG}-C`;
  const importIds: string[] = [];
  try {
    const result = await processTimesheetImport(
      [row(emp, "2026-02-02", "9:00", "13:00", 8), row(emp, "2026-02-02", "9:00", "13:00", 6)],
      { triggeredBy: "ManualUpload" }
    );
    importIds.push(result.importId);

    assert.equal(result.createdCount, 1);
    assert.equal(result.updatedCount, 1, "the later, different-hours row for the SAME identity is a correction, not a new session");

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 1, "exactly one entry must survive — never summed");
    assert.equal(entries[0]!.hours, 6, "the later value wins");
    assert.notEqual(entries[0]!.hours, 8 + 6, "must never be additive for a same-time correction");
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── D. Different times, same hours ───────────────────────────────────────
test("D. different sessions with different Start/End Time but the SAME hours -> TWO entries, total 8h", async () => {
  const emp = `${TAG}-D`;
  const importIds: string[] = [];
  try {
    const result = await processTimesheetImport(
      [row(emp, "2026-02-02", "9:00", "13:00", 4), row(emp, "2026-02-02", "14:00", "18:00", 4)],
      { triggeredBy: "ManualUpload" }
    );
    importIds.push(result.importId);

    assert.equal(result.createdCount, 2, "equal hours must never be mistaken for a duplicate when Start/End Time differ");

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 2);
    const total = entries.reduce((sum, e) => sum + e.hours, 0);
    assert.equal(total, 8);
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── E. Zero-hour removal ──────────────────────────────────────────────────
test("E. zero-hour correction for an existing session (same Start/End Time) -> Removed", async () => {
  const emp = `${TAG}-E`;
  const importIds: string[] = [];
  try {
    const r1 = await processTimesheetImport([row(emp, "2026-02-02", "9:00", "13:00", 4)], { triggeredBy: "ManualUpload" });
    importIds.push(r1.importId);
    assert.equal(r1.createdCount, 1);

    const r2 = await processTimesheetImport([row(emp, "2026-02-02", "9:00", "13:00", 0)], { triggeredBy: "ManualUpload" });
    importIds.push(r2.importId);
    assert.equal(r2.removedCount, 1);

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 0, "the session must be fully removed, not left as a stale 0-hour row");
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── E2. Zero-hour correction matched via time-range overlap (not exact) ──
test("E2. a zero-hour correction with a slightly shifted but overlapping time still removes the existing session via the time-correction match", async () => {
  const emp = `${TAG}-E2`;
  const importIds: string[] = [];
  try {
    const r1 = await processTimesheetImport([row(emp, "2026-02-02", "9:00", "13:00", 4)], { triggeredBy: "ManualUpload" });
    importIds.push(r1.importId);
    assert.equal(r1.createdCount, 1);

    // The correction's own time (9:05-13:00) does not EXACTLY match the
    // stored row (9:00-13:00) — this must go through findTimeCorrectedEntry()'s
    // overlap match, not the exact-key lookup, and still remove the row.
    const r2 = await processTimesheetImport([row(emp, "2026-02-02", "9:05", "13:00", 0)], { triggeredBy: "ManualUpload" });
    importIds.push(r2.importId);
    assert.equal(r2.removedCount, 1, "a 0-hour correction matched via time-overlap must still remove the session");
    assert.equal(r2.createdCount, 0);

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 0);
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── F. Time-format normalization ─────────────────────────────────────────
test("F. cosmetic Start/End Time format differences ('09:00' vs '9:00' vs '09:00:00') resolve to the SAME identity", async () => {
  const emp = `${TAG}-F`;
  const importIds: string[] = [];
  try {
    const r1 = await processTimesheetImport(
      [row(emp, "2026-02-02", "9:00", "13:00", 4)],
      { triggeredBy: "ManualUpload" }
    );
    importIds.push(r1.importId);
    assert.equal(r1.createdCount, 1);

    // Same session, cosmetically reformatted with leading zeros + seconds —
    // must be recognized as the SAME identity (Updated, not a second row).
    const r2 = await processTimesheetImport(
      [row(emp, "2026-02-02", "09:00:00", "13:00:00", 5)],
      { triggeredBy: "ManualUpload" }
    );
    importIds.push(r2.importId);
    assert.equal(r2.createdCount, 0, "must match the existing row, not create a phantom second one");
    assert.equal(r2.updatedCount, 1);

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 1, "format differences alone must never create a duplicate entry");
    assert.equal(entries[0]!.hours, 5);
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── G. Blank Start/End Time — legacy compatibility ───────────────────────
test("G. blank Start/End Time on both sides preserves the pre-existing 4-field identity behavior (legacy-compatible)", async () => {
  const emp = `${TAG}-G`;
  const importIds: string[] = [];
  try {
    // No Start/End Time column/value at all — exactly what every
    // TimesheetEntry row created before this feature existed looks like.
    const r1 = await processTimesheetImport([row(emp, "2026-02-02", "", "", 5)], { triggeredBy: "ManualUpload" });
    importIds.push(r1.importId);
    assert.equal(r1.createdCount, 1);

    const entryAfterCreate = (await entriesFor(emp))[0]!;
    assert.equal(entryAfterCreate.startTime, null, "blank Start Time is stored as null, not an empty string");
    assert.equal(entryAfterCreate.endTime, null);

    // A second blank-time row for the exact same employee/project/date/task
    // must still be recognized as the SAME identity (Updated), exactly as
    // the old 4-field identity already did — this is the legacy-
    // compatibility guarantee, proven end-to-end through the real service,
    // not just the pure identityKey()/normalizeTimeOfDay() functions.
    const r2 = await processTimesheetImport([row(emp, "2026-02-02", "", "", 7)], { triggeredBy: "ManualUpload" });
    importIds.push(r2.importId);
    assert.equal(r2.createdCount, 0);
    assert.equal(r2.updatedCount, 1, "two blank-time rows for the same identity must collapse into one, exactly as before this feature existed");

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.hours, 7);
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── H (Case C). Start Time correction — now FIXED, not a known limitation ─
test("H/Case C. a Start Time correction (end unchanged) updates the existing session — no longer a second row", async () => {
  const emp = `${TAG}-H`;
  const importIds: string[] = [];
  try {
    const r1 = await processTimesheetImport([row(emp, "2026-02-02", "9:00", "13:00", 4)], { triggeredBy: "ManualUpload" });
    importIds.push(r1.importId);
    assert.equal(r1.createdCount, 1);
    const originalId = (await entriesFor(emp))[0]!.id;

    // A later import reports the SAME session with a corrected Start Time
    // (9:00 -> 9:05) and correspondingly corrected hours (4 -> 3.92). This
    // is Case C/G from the task spec: the time-range overlap match (see
    // findTimeCorrectedEntry()) recognizes this as a correction to the
    // existing row rather than a new session, exactly because [9:05,13:00)
    // genuinely overlaps [9:00,13:00).
    const r2 = await processTimesheetImport([row(emp, "2026-02-02", "9:05", "13:00", 3.92)], { triggeredBy: "ManualUpload" });
    importIds.push(r2.importId);
    assert.equal(r2.createdCount, 0, "FIXED: a Start Time correction must no longer create a second row");
    assert.equal(r2.updatedCount, 1, "FIXED: recognized as an Updated correction to the existing session");

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 1, "exactly one row must survive — the original, corrected in place");
    assert.equal(entries[0]!.id, originalId, "the SAME database row is corrected, never replaced by a new one");
    assert.equal(entries[0]!.startTime, "9:05", "the corrected Start Time is persisted");
    assert.equal(entries[0]!.endTime, "13:00");
    assert.equal(entries[0]!.hours, 3.92, "later value wins, never summed (not 4 + 3.92)");
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── Case D. End Time correction ──────────────────────────────────────────
test("Case D. an End Time correction (start unchanged) updates the existing session", async () => {
  const emp = `${TAG}-CaseD`;
  const importIds: string[] = [];
  try {
    const r1 = await processTimesheetImport([row(emp, "2026-02-02", "9:00", "13:00", 4)], { triggeredBy: "ManualUpload" });
    importIds.push(r1.importId);
    assert.equal(r1.createdCount, 1);
    const originalId = (await entriesFor(emp))[0]!.id;

    const r2 = await processTimesheetImport([row(emp, "2026-02-02", "9:00", "13:15", 4.25)], { triggeredBy: "ManualUpload" });
    importIds.push(r2.importId);
    assert.equal(r2.createdCount, 0);
    assert.equal(r2.updatedCount, 1);

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.id, originalId);
    assert.equal(entries[0]!.startTime, "9:00");
    assert.equal(entries[0]!.endTime, "13:15", "the corrected End Time is persisted");
    assert.equal(entries[0]!.hours, 4.25);
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── Case E. Both Start and End Time corrected ────────────────────────────
test("Case E. both Start and End Time corrected in one later import updates the existing session", async () => {
  const emp = `${TAG}-CaseE`;
  const importIds: string[] = [];
  try {
    const r1 = await processTimesheetImport([row(emp, "2026-02-02", "9:00", "13:00", 4)], { triggeredBy: "ManualUpload" });
    importIds.push(r1.importId);
    const originalId = (await entriesFor(emp))[0]!.id;

    const r2 = await processTimesheetImport([row(emp, "2026-02-02", "9:05", "13:15", 4.17)], { triggeredBy: "ManualUpload" });
    importIds.push(r2.importId);
    assert.equal(r2.createdCount, 0);
    assert.equal(r2.updatedCount, 1);

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]!.id, originalId);
    assert.equal(entries[0]!.startTime, "9:05");
    assert.equal(entries[0]!.endTime, "13:15");
    assert.equal(entries[0]!.hours, 4.17);
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── Regression guard: the fix must NEVER merge two genuinely separate
// sessions (Case B/F), even now that time-correction matching exists ─────
test("the time-correction fix does NOT cause two genuinely separate sessions to merge (Case B/F still hold)", async () => {
  const emp = `${TAG}-NoMerge`;
  const importIds: string[] = [];
  try {
    const result = await processTimesheetImport(
      [row(emp, "2026-02-02", "9:00", "13:00", 4), row(emp, "2026-02-02", "14:00", "18:00", 4)],
      { triggeredBy: "ManualUpload" }
    );
    importIds.push(result.importId);
    assert.equal(result.createdCount, 2, "two disjoint sessions must both be Created — never matched to each other");

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 2);
    const total = entries.reduce((sum, e) => sum + e.hours, 0);
    assert.equal(total, 8, "must be the SUM of both sessions");
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── Case I. Legacy blank-time row later "corrected" by a timed row ───────
test("Case I. a legacy blank-time row is NOT bridged to a later timed row for the same identity — documented as unresolved, not guessed", async () => {
  const emp = `${TAG}-CaseI`;
  const importIds: string[] = [];
  try {
    const r1 = await processTimesheetImport([row(emp, "2026-02-02", "", "", 4)], { triggeredBy: "ManualUpload" });
    importIds.push(r1.importId);
    assert.equal(r1.createdCount, 1);

    // A later import reports the same employee/project/date/task, now with
    // a real Start/End Time. There is no way to know from the data alone
    // whether this is "the same session, now reported with more precision"
    // or a genuinely different fact — findTimeCorrectedEntry() deliberately
    // never attempts this match (a blank time carries no range to compare),
    // so this remains a second, separate row exactly as before this fix.
    const r2 = await processTimesheetImport([row(emp, "2026-02-02", "9:00", "13:00", 4)], { triggeredBy: "ManualUpload" });
    importIds.push(r2.importId);
    assert.equal(r2.createdCount, 1, "DOCUMENTED, NOT SOLVED: a blank-to-timed transition is never inferred as a correction");

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 2, "both the legacy blank-time row and the new timed row survive, unmerged");
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── Within-file correction: a later row in the SAME import batch corrects
// an earlier row's time, all within one transaction ──────────────────────
test("a time correction within the SAME import file (not a separate later import) is matched and updates in place", async () => {
  const emp = `${TAG}-SameFile`;
  const importIds: string[] = [];
  try {
    const result = await processTimesheetImport(
      [
        row(emp, "2026-02-02", "9:00", "13:00", 4), // Created
        row(emp, "2026-02-02", "9:05", "13:00", 3.92), // corrects the row above, same file
        row(emp, "2026-02-02", "14:00", "18:00", 4), // a genuinely separate, third session
      ],
      { triggeredBy: "ManualUpload" }
    );
    importIds.push(result.importId);
    assert.equal(result.createdCount, 2, "the original session and the separate afternoon session are Created");
    assert.equal(result.updatedCount, 1, "the correction row is matched and applied within the same file");

    const entries = await entriesFor(emp);
    assert.equal(entries.length, 2, "the corrected morning session (one row) plus the separate afternoon session");
    const morning = entries.find((e) => e.startTime === "9:05");
    const afternoon = entries.find((e) => e.startTime === "14:00");
    assert.ok(morning, "the corrected morning row must exist with the corrected start time");
    assert.equal(morning!.hours, 3.92);
    assert.ok(afternoon, "the separate afternoon session must survive untouched");
    assert.equal(afternoon!.hours, 4);
  } finally {
    await cleanup(importIds, emp);
  }
});

// ── J. Keka + Excel share the same reconciliation identity logic ────────
test("J. the Keka email-ingestion path and the manual Excel-upload path call the identical processTimesheetImport()/identityKey() reconciliation engine", () => {
  const mailPollSource = readFileSync(
    join(__dirname, "..", "mailIngestion", "services", "mailPoll.service.ts"),
    "utf8"
  );
  const controllerSource = readFileSync(join(__dirname, "controllers", "timesheet.controller.ts"), "utf8");

  // Both source files must import processTimesheetImport from the SAME
  // module — if a future change ever forked Keka onto its own copy of the
  // reconciliation engine, this assertion is what would catch it.
  assert.match(
    mailPollSource,
    /processTimesheetImport\s*}?\s*from\s+["']\.\.\/\.\.\/timesheets\/services\/timesheet\.service\.js["']/,
    "mailPoll.service.ts must import processTimesheetImport from timesheet.service.ts"
  );
  assert.match(
    controllerSource,
    /processTimesheetImport/,
    "timesheet.controller.ts must call processTimesheetImport"
  );
  assert.match(
    controllerSource,
    /from\s+["']\.\.\/services\/timesheet\.service\.js["']/,
    "timesheet.controller.ts must import from the same timesheet.service.ts module Keka uses"
  );
});
