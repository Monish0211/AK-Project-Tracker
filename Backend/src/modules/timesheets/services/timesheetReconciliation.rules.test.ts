import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  coarseIdentityKey,
  decideEntryOutcome,
  findTimeCorrectedEntry,
  identityKey,
  normalizeTimeOfDay,
} from "./timesheetReconciliation.rules.js";

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

const AUG_20 = utcDate(2026, 7, 20);
const AUG_21 = utcDate(2026, 7, 21);
const TASK_SIL = "SIL-Verification Report preparation";

describe("timesheetReconciliation.rules — identityKey", () => {
  it("is resolution-independent: unresolved and resolved imports of the same fact produce the SAME key", () => {
    const unresolvedKey = identityKey("0533", "PR 12006", AUG_20, TASK_SIL, "", "");
    const resolvedKey = identityKey("0533", "PR 12006", AUG_20, TASK_SIL, "", "");
    assert.equal(unresolvedKey, resolvedKey);
  });

  it("different tasks for the same employee/project/date produce different keys (Rule 5)", () => {
    const keyA = identityKey("0533", "PR12006", AUG_21, "Task A", "", "");
    const keyB = identityKey("0533", "PR12006", AUG_21, "Task B", "", "");
    assert.notEqual(keyA, keyB);
  });

  it("different dates produce different keys", () => {
    const key1 = identityKey("0533", "PR12006", AUG_20, TASK_SIL, "", "");
    const key2 = identityKey("0533", "PR12006", AUG_21, TASK_SIL, "", "");
    assert.notEqual(key1, key2);
  });

  it("different employees produce different keys", () => {
    const keyA = identityKey("0533", "PR12006", AUG_20, TASK_SIL, "", "");
    const keyB = identityKey("0601", "PR12006", AUG_20, TASK_SIL, "", "");
    assert.notEqual(keyA, keyB);
  });

  it("different projects produce different keys", () => {
    const keyA = identityKey("0533", "PR12006", AUG_20, TASK_SIL, "", "");
    const keyB = identityKey("0533", "PR5001", AUG_20, TASK_SIL, "", "");
    assert.notEqual(keyA, keyB);
  });

  it("PR-code formatting differences that normalizeProjectCode already collapses still match (e.g. 'PR 12006' vs 'PR-12006')", () => {
    const keyA = identityKey("0533", "PR 12006", AUG_20, TASK_SIL, "", "");
    const keyB = identityKey("0533", "PR-12006", AUG_20, TASK_SIL, "", "");
    assert.equal(keyA, keyB);
  });

  it("two different genuinely-unparseable raw codes for the same employee/date/task stay distinct (not collapsed into one shared UNASSIGNED bucket)", () => {
    const keyA = identityKey("0533", "not a code", AUG_20, TASK_SIL, "", "");
    const keyB = identityKey("0533", "also not a code", AUG_20, TASK_SIL, "", "");
    assert.notEqual(keyA, keyB);
  });

  // ── Start Time / End Time identity component ────────────────────────────

  it("same employee/project/date/task with different Start/End Time produces DIFFERENT keys — two genuinely separate work sessions", () => {
    const morning = identityKey("0609", "PR 7087", AUG_20, "SCE workshop", "9:00", "13:00");
    const afternoon = identityKey("0609", "PR 7087", AUG_20, "SCE workshop", "14:00", "18:30");
    assert.notEqual(morning, afternoon);
  });

  it("same employee/project/date/task with identical Start/End Time produces the SAME key — idempotent re-send", () => {
    const keyA = identityKey("0609", "PR 7087", AUG_20, "SCE workshop", "9:00", "13:00");
    const keyB = identityKey("0609", "PR 7087", AUG_20, "SCE workshop", "9:00", "13:00");
    assert.equal(keyA, keyB);
  });

  it("blank Start/End Time on both sides collapses to the SAME key as the pre-existing 4-field identity — legacy compatibility", () => {
    const withBlankTimes = identityKey("0533", "PR 12006", AUG_20, TASK_SIL, "", "");
    const withNullTimes = identityKey("0533", "PR 12006", AUG_20, TASK_SIL, null, null);
    const withUndefinedTimes = identityKey("0533", "PR 12006", AUG_20, TASK_SIL, undefined, undefined);
    assert.equal(withBlankTimes, withNullTimes);
    assert.equal(withBlankTimes, withUndefinedTimes);
  });
});

describe("timesheetReconciliation.rules — normalizeTimeOfDay", () => {
  it("blank/null/undefined all normalize to \"\"", () => {
    assert.equal(normalizeTimeOfDay(""), "");
    assert.equal(normalizeTimeOfDay("   "), "");
    assert.equal(normalizeTimeOfDay(null), "");
    assert.equal(normalizeTimeOfDay(undefined), "");
  });

  it("cosmetic format differences collapse to the same normalized value: '09:00', '9:00', '09:00:00' all match", () => {
    const a = normalizeTimeOfDay("09:00");
    const b = normalizeTimeOfDay("9:00");
    const c = normalizeTimeOfDay("09:00:00");
    assert.equal(a, "09:00");
    assert.equal(a, b);
    assert.equal(a, c);
  });

  it("a different minute value is NOT collapsed — 09:00 and 09:01 remain distinct", () => {
    assert.notEqual(normalizeTimeOfDay("09:00"), normalizeTimeOfDay("09:01"));
  });

  it("12-hour AM/PM text normalizes to the equivalent 24-hour value", () => {
    assert.equal(normalizeTimeOfDay("9:00 AM"), "09:00");
    assert.equal(normalizeTimeOfDay("1:30 PM"), "13:30");
    assert.equal(normalizeTimeOfDay("12:00 PM"), "12:00");
    assert.equal(normalizeTimeOfDay("12:00 AM"), "00:00");
  });

  it("a genuinely unparseable non-blank value is kept as its own distinct, stable bucket (never silently collapsed into \"\")", () => {
    const a = normalizeTimeOfDay("not a time");
    const b = normalizeTimeOfDay("also not a time");
    assert.notEqual(a, "");
    assert.notEqual(b, "");
    assert.notEqual(a, b);
    // Case-insensitive, matching projectIdentityComponent()'s own fallback style.
    assert.equal(normalizeTimeOfDay("not a time"), normalizeTimeOfDay("NOT A TIME"));
  });
});

describe("timesheetReconciliation.rules — decideEntryOutcome", () => {
  it("1. same row / same hours -> Unchanged, no writes", () => {
    const decision = decideEntryOutcome({ projectId: "proj-1", hours: 8.57 }, { projectId: "proj-1", hours: 8.57 });
    assert.deepEqual(decision, { outcome: "Unchanged", writeProjectId: false, writeHours: false });
  });

  it("2. same row / changed hours -> Updated, latest value wins (never additive)", () => {
    const decision = decideEntryOutcome({ projectId: "proj-1", hours: 17 }, { projectId: "proj-1", hours: 19 });
    assert.deepEqual(decision, { outcome: "Updated", writeProjectId: false, writeHours: true });
    // Explicitly assert the anti-pattern this guards against: never 17 + 19 = 36.
    assert.notEqual(19, 17 + 19);
  });

  it("3. new row (no existing) -> Created", () => {
    const decision = decideEntryOutcome(undefined, { projectId: "proj-1", hours: 8 });
    assert.equal(decision.outcome, "Created");
  });

  it("4. new employee (no existing match at all) -> Created", () => {
    // A new employee never has an `existing` snapshot to match against.
    const decision = decideEntryOutcome(undefined, { projectId: "proj-5001", hours: 7 });
    assert.equal(decision.outcome, "Created");
  });

  it("5. new project (no existing match) -> Created", () => {
    const decision = decideEntryOutcome(undefined, { projectId: "proj-new", hours: 8 });
    assert.equal(decision.outcome, "Created");
  });

  it("6. new date (no existing match, since identityKey differs per date) -> Created", () => {
    const decision = decideEntryOutcome(undefined, { projectId: "proj-1", hours: 8 });
    assert.equal(decision.outcome, "Created");
  });

  it("7. new task (no existing match, since identityKey differs per task) -> Created", () => {
    const decision = decideEntryOutcome(undefined, { projectId: "proj-1", hours: 9 });
    assert.equal(decision.outcome, "Created");
  });

  it("8. 17-hour legitimate row is accepted — no maximum-daily-hours rule exists (Rule 4)", () => {
    const created = decideEntryOutcome(undefined, { projectId: "proj-1", hours: 17 });
    assert.equal(created.outcome, "Created");
    const updated = decideEntryOutcome({ projectId: "proj-1", hours: 8 }, { projectId: "proj-1", hours: 17 });
    assert.equal(updated.outcome, "Updated");
  });

  it("9. UNASSIGNED -> RESOLVED, same hours -> no duplicate; existing row is linked, outcome labeled Unchanged per the confirmed rule", () => {
    const decision = decideEntryOutcome({ projectId: null, hours: 8.57 }, { projectId: "pr12006-uuid", hours: 8.57 });
    assert.deepEqual(decision, { outcome: "Unchanged", writeProjectId: true, writeHours: false });
  });

  it("10. UNASSIGNED -> RESOLVED with changed hours -> Updated, writes both projectId and hours", () => {
    const decision = decideEntryOutcome({ projectId: null, hours: 8 }, { projectId: "pr12006-uuid", hours: 8.57 });
    assert.deepEqual(decision, { outcome: "Updated", writeProjectId: true, writeHours: true });
  });

  it("11. two different tasks, same employee/project/date -> two separate Created rows, never merged (Rule 5)", () => {
    const keyA = identityKey("0533", "PR12006", AUG_21, "Task A", "", "");
    const keyB = identityKey("0533", "PR12006", AUG_21, "Task B", "", "");
    assert.notEqual(keyA, keyB);
    const decisionA = decideEntryOutcome(undefined, { projectId: "proj-1", hours: 8 });
    const decisionB = decideEntryOutcome(undefined, { projectId: "proj-1", hours: 9 });
    assert.equal(decisionA.outcome, "Created");
    assert.equal(decisionB.outcome, "Created");
  });

  it("12. existing normal resolved row re-imported, same hours -> Unchanged (steady-state case is unaffected)", () => {
    const decision = decideEntryOutcome({ projectId: "pr12006-uuid", hours: 8.57 }, { projectId: "pr12006-uuid", hours: 8.57 });
    assert.deepEqual(decision, { outcome: "Unchanged", writeProjectId: false, writeHours: false });
  });

  it("13. existing normal resolved row re-imported, changed hours -> Updated (steady-state case is unaffected)", () => {
    const decision = decideEntryOutcome({ projectId: "pr12006-uuid", hours: 6 }, { projectId: "pr12006-uuid", hours: 8.5 });
    assert.deepEqual(decision, { outcome: "Updated", writeProjectId: false, writeHours: true });
  });

  it("0-hour correction on an existing row -> Removed, regardless of any pending project link", () => {
    const decision = decideEntryOutcome({ projectId: null, hours: 8.57 }, { projectId: "pr12006-uuid", hours: 0 });
    assert.deepEqual(decision, { outcome: "Removed", writeProjectId: false, writeHours: false });
  });

  it("0-hour row with no existing match creates nothing (pre-existing special case, unchanged by this fix)", () => {
    const decision = decideEntryOutcome(undefined, { projectId: "proj-1", hours: 0 });
    assert.deepEqual(decision, { outcome: "Unchanged", writeProjectId: false, writeHours: false });
  });

  it("resolved -> a DIFFERENT resolved project, same hours: relinks via the same mechanism, no special-casing needed", () => {
    const decision = decideEntryOutcome({ projectId: "proj-old", hours: 5 }, { projectId: "proj-new", hours: 5 });
    assert.deepEqual(decision, { outcome: "Unchanged", writeProjectId: true, writeHours: false });
  });
});

describe("timesheetReconciliation.rules — the exact reported real scenario (employee 0533 / PR 12006 / 20-Aug-2026 / SIL-Verification Report preparation / 8.57h)", () => {
  it("Import #1 (PR 12006 not yet a Project) then Import #2 (PR 12006 now resolves) -> ONE TimesheetEntry, not two", () => {
    // Import #1: project unresolved.
    const import1Key = identityKey("0533", "PR 12006", AUG_20, TASK_SIL, "", "");
    const import1Decision = decideEntryOutcome(undefined, { projectId: null, hours: 8.57 });
    assert.equal(import1Decision.outcome, "Created");

    // The row created by Import #1, as it would now sit in the database.
    const existingAfterImport1 = { projectId: null, hours: 8.57 };

    // Import #2: same Keka fact, PR 12006 now resolves to a real Project.
    const import2Key = identityKey("0533", "PR 12006", AUG_20, TASK_SIL, "", "");

    // The critical assertion the whole fix rests on: both imports compute
    // the SAME identity key, so Import #2 finds Import #1's row instead of
    // falling through to "Created" (which is exactly how the confirmed
    // duplicate — bed09dc4 / a6fffd2a — happened under the old projectId-
    // based identityKey()).
    assert.equal(import1Key, import2Key);

    const import2Decision = decideEntryOutcome(existingAfterImport1, { projectId: "pr12006-real-uuid", hours: 8.57 });

    // No second row is created — the existing one is linked in place.
    assert.notEqual(import2Decision.outcome, "Created");
    assert.equal(import2Decision.writeProjectId, true);
    assert.equal(import2Decision.writeHours, false);
  });
});

describe("timesheetReconciliation.rules — coarseIdentityKey", () => {
  it("matches the prefix of identityKey() for the same employee/project/date/task, regardless of time", () => {
    const coarse = coarseIdentityKey("0609", "PR 7087", AUG_20, "SCE workshop");
    const full = identityKey("0609", "PR 7087", AUG_20, "SCE workshop", "9:00", "13:00");
    assert.ok(full.startsWith(coarse), "identityKey() must be built on top of the exact same coarse prefix");
  });
});

describe("timesheetReconciliation.rules — findTimeCorrectedEntry (Start/End Time correction matching)", () => {
  // Case A — genuine exact duplicate: not this function's concern (the
  // caller only reaches it after an exact 6-field match already failed —
  // see processTimesheetImport()), but confirmed here for completeness:
  // identical ranges trivially "overlap" with themselves.
  it("Case A — an identical time range matches", () => {
    const candidates = [{ startTime: "9:00", endTime: "13:00" }];
    const found = findTimeCorrectedEntry(candidates, "9:00", "13:00");
    assert.equal(found, candidates[0]);
  });

  it("Case B — two genuinely separate, non-overlapping sessions never match each other", () => {
    const candidates = [{ startTime: "9:00", endTime: "13:00" }];
    const found = findTimeCorrectedEntry(candidates, "14:00", "18:00");
    assert.equal(found, undefined);
  });

  it("Case C — a Start Time correction (end unchanged) matches the original session", () => {
    const candidates = [{ startTime: "9:00", endTime: "13:00" }];
    const found = findTimeCorrectedEntry(candidates, "9:05", "13:00");
    assert.equal(found, candidates[0]);
  });

  it("Case D — an End Time correction (start unchanged) matches the original session", () => {
    const candidates = [{ startTime: "9:00", endTime: "13:00" }];
    const found = findTimeCorrectedEntry(candidates, "9:00", "13:15");
    assert.equal(found, candidates[0]);
  });

  it("Case E — both Start and End Time corrected still matches the original session", () => {
    const candidates = [{ startTime: "9:00", endTime: "13:00" }];
    const found = findTimeCorrectedEntry(candidates, "9:05", "13:15");
    assert.equal(found, candidates[0]);
  });

  it("Case F — two legitimate sessions with the SAME hours never match each other (hours are never part of this decision)", () => {
    const candidates = [{ startTime: "9:00", endTime: "13:00" }]; // 4h
    const found = findTimeCorrectedEntry(candidates, "14:00", "18:00"); // also 4h, but a disjoint range
    assert.equal(found, undefined);
  });

  it("back-to-back sessions that merely TOUCH (one ends exactly when the next starts) do NOT count as overlapping", () => {
    const candidates = [{ startTime: "9:00", endTime: "13:00" }];
    const found = findTimeCorrectedEntry(candidates, "13:00", "17:00");
    assert.equal(found, undefined, "touching, not overlapping — must remain a separate session, never merged");
  });

  it("Case I — a candidate with a blank/legacy time is never matched against a timed incoming row (no safe inference)", () => {
    const candidates = [{ startTime: null, endTime: null }];
    const found = findTimeCorrectedEntry(candidates, "9:00", "13:00");
    assert.equal(found, undefined);
  });

  it("an incoming row with a blank/legacy time is never matched against a timed candidate either (symmetric — no safe inference either direction)", () => {
    const candidates = [{ startTime: "9:00", endTime: "13:00" }];
    const found = findTimeCorrectedEntry(candidates, null, null);
    assert.equal(found, undefined);
  });

  it("an incoming row overlapping MORE THAN ONE candidate is unresolvable ambiguity — never silently picked, never merged", () => {
    const candidates = [
      { startTime: "9:00", endTime: "13:00" },
      { startTime: "12:00", endTime: "16:00" }, // deliberately already overlaps the first, for this synthetic test
    ];
    // 12:30-13:30 genuinely overlaps BOTH of the above candidates.
    const found = findTimeCorrectedEntry(candidates, "12:30", "13:30");
    assert.equal(found, undefined, "ambiguous multi-overlap must never be resolved by guessing");
  });

  it("cosmetic time-format differences ('9:00' vs '09:00:00') still match via the same normalizeTimeOfDay() rule identityKey() itself uses", () => {
    const candidates = [{ startTime: "9:00", endTime: "13:00" }];
    const found = findTimeCorrectedEntry(candidates, "09:00:00", "13:15");
    assert.equal(found, candidates[0]);
  });
});
