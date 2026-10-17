import assert from "node:assert/strict";
import { test } from "node:test";
import { completionNoteMessage, decideCompletion, ldAmountError, LD_MAX_INR } from "./projectCompletion.rules.js";
import type { ExistingCompletionState } from "./projectCompletion.rules.js";

const ACTIVE: ExistingCompletionState = {
  projectStatus: "Active",
  actualCompletionDate: null,
  completionRemarks: null,
  ldApplicable: null,
  ldAmountINR: null,
  ldRemarks: null,
};
const COMPLETE = { projectStatus: "Completed", actualCompletionDate: new Date("2026-10-01"), completionRemarks: "All deliverables handed over." };

test("ldAmountError: positive, finite, ≤ 2 decimals, bounded", () => {
  for (const ok of [0.01, 1, 50000, 50000.5, 12345.67, LD_MAX_INR]) assert.equal(ldAmountError(ok), null, String(ok));
  assert.match(ldAmountError(0)!, /greater than zero/);
  assert.match(ldAmountError(-5)!, /greater than zero/);
  assert.match(ldAmountError(NaN)!, /valid number/);
  assert.match(ldAmountError(Infinity)!, /valid number/);
  assert.match(ldAmountError("100")!, /valid number/);
  assert.match(ldAmountError(1.234)!, /two decimal/);
  assert.match(ldAmountError(LD_MAX_INR + 1)!, /too large/);
});

test("completion requires an explicit LD decision, a date and 20-char remarks", () => {
  assert.deepEqual(decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: false }), { ok: true, isCompletion: true, recordLd: { ldApplicable: false, ldAmountINR: null, ldRemarks: null } });
  assert.deepEqual(decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true, ldAmountINR: 50000, ldRemarks: "  Clause 14.2  " }), { ok: true, isCompletion: true, recordLd: { ldApplicable: true, ldAmountINR: 50000, ldRemarks: "Clause 14.2" } });
  const noDecision = decideCompletion(ACTIVE, COMPLETE);
  assert.equal(noDecision.ok, false);
  assert.ok(!noDecision.ok && noDecision.status === 400 && /choose whether/.test(noDecision.message));
  const noAmount = decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true });
  assert.ok(!noAmount.ok && /required when LD is applicable/.test(noAmount.message));
  const amountWithNo = decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: false, ldAmountINR: 10 });
  assert.ok(!amountWithNo.ok && /only be given when LD is applicable/.test(amountWithNo.message));
  const noDate = decideCompletion(ACTIVE, { ...COMPLETE, actualCompletionDate: null, ldApplicable: false });
  assert.ok(!noDate.ok && /Actual Completion Date/.test(noDate.message));
  const shortRemarks = decideCompletion(ACTIVE, { ...COMPLETE, completionRemarks: "too short", ldApplicable: false });
  assert.ok(!shortRemarks.ok && /at least 20 characters/.test(shortRemarks.message));
  const longRef = decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: false, ldRemarks: "x".repeat(501) });
  assert.ok(!longRef.ok && /at most 500/.test(longRef.message));
});

test("LD is immutable once recorded; identical re-submits are harmless; reopen keeps it", () => {
  const recorded: ExistingCompletionState = { ...ACTIVE, ...COMPLETE, ldApplicable: true, ldAmountINR: 50000, ldRemarks: "Clause 14.2" };
  assert.deepEqual(decideCompletion(recorded, { ldApplicable: true, ldAmountINR: 50000, ldRemarks: "Clause 14.2" }), { ok: true, isCompletion: false, recordLd: null }, "same values → no-op");
  const changed = decideCompletion(recorded, { ldAmountINR: 60000 });
  assert.ok(!changed.ok && changed.status === 409);
  const flipped = decideCompletion(recorded, { ldApplicable: false });
  assert.ok(!flipped.ok && flipped.status === 409);
  // Reopened (Active) with LD recorded, then completed again without LD → allowed, LD untouched.
  const reopened = { ...recorded, projectStatus: "Active" };
  assert.deepEqual(decideCompletion(reopened, COMPLETE), { ok: true, isCompletion: true, recordLd: null });
});

test("LD cannot be recorded outside a completion (including legacy completed projects)", () => {
  const notCompleting = decideCompletion(ACTIVE, { projectTitle: "x", ldApplicable: false } as never);
  assert.ok(!notCompleting.ok && notCompleting.status === 400);
  const legacy: ExistingCompletionState = { ...ACTIVE, ...COMPLETE };
  assert.deepEqual(decideCompletion(legacy, { projectStatus: "Completed" }), { ok: true, isCompletion: false, recordLd: null }, "legacy stays not recorded");
  const legacyLd = decideCompletion(legacy, { ldApplicable: true, ldAmountINR: 5 });
  assert.ok(!legacyLd.ok && legacyLd.status === 400);
  assert.deepEqual(decideCompletion(ACTIVE, { projectTitle: "x" } as never), { ok: true, isCompletion: false, recordLd: null });
});

test("create directly as Completed follows the same rules", () => {
  assert.equal(decideCompletion(null, { ...COMPLETE, ldApplicable: false }).ok, true);
  assert.equal(decideCompletion(null, COMPLETE).ok, false);
  assert.deepEqual(decideCompletion(null, { projectStatus: "Active" }), { ok: true, isCompletion: false, recordLd: null });
});

test("completion note text", () => {
  const msg = completionNoteMessage({ actualCompletionDate: new Date("2026-10-01T00:00:00Z"), completionRemarks: " All deliverables handed over. ", completedByName: "Priya", ld: { ldApplicable: true, ldAmountINR: 50000.5, ldRemarks: "Clause 14.2" }, ldNewlyRecorded: true });
  assert.equal(msg, "PROJECT COMPLETED\nCompletion Date: 2026-10-01\nCompleted By: Priya\nLiquidated Damages: Applicable — ₹ 50,000.50\nLD Reference / Remarks: Clause 14.2\nRemarks: All deliverables handed over.");
  assert.match(completionNoteMessage({ actualCompletionDate: new Date("2026-10-01"), completionRemarks: "r", completedByName: "P", ld: { ldApplicable: false, ldAmountINR: null, ldRemarks: null }, ldNewlyRecorded: false }), /Not applicable \(recorded earlier, unchanged\)/);
});
