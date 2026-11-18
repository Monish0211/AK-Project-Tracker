import assert from "node:assert/strict";
import { test } from "node:test";
import { completionNoteMessage, decideCompletion, ldAmountError, ldAmountText } from "./projectCompletion.rules.js";
import type { ExistingCompletionState } from "./projectCompletion.rules.js";

/**
 * Regional Liquidated Damages (Phase 4 final). The pure rules: the project's own currency decides what an LD amount is. India stays INR exactly
 * as before; every other country enters, stores and validates its LD in its regional currency. The currency is never taken from the client.
 */
const ACTIVE: ExistingCompletionState = {
  projectStatus: "Active",
  actualCompletionDate: null,
  completionRemarks: null,
  ldApplicable: null,
  ldAmountINR: null,
  ldRemarks: null,
};
const COMPLETE = { projectStatus: "Completed", actualCompletionDate: new Date("2026-11-10"), completionRemarks: "All deliverables handed over." };

const COUNTRIES: Array<[string, string]> = [
  ["India", "INR"],
  ["Malaysia", "MYR"],
  ["Oman", "OMR"],
  ["Abu Dhabi", "AED"],
  ["FZE", "AED"],
  ["Elixir Qatar", "QAR"],
  ["Qatar", "QAR"],
];

test("every country records its LD in its own currency: INR in the INR column, everything else in the regional column", () => {
  for (const [country, currency] of COUNTRIES) {
    const decision = decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true, ldAmount: 1250.5, ldRemarks: "Clause 9" }, currency);
    assert.equal(decision.ok, true, country);
    if (!decision.ok) continue;
    assert.deepEqual(
      decision.recordLd,
      currency === "INR"
        ? { ldApplicable: true, ldCurrency: "INR", ldAmountINR: 1250.5, ldAmountRegional: null, ldRemarks: "Clause 9" }
        : { ldApplicable: true, ldCurrency: currency, ldAmountINR: null, ldAmountRegional: 1250.5, ldRemarks: "Clause 9" },
      `${country} (${currency})`
    );
  }
});

test("a project with no stored currency (legacy India) and the original ldAmountINR field behave exactly as before", () => {
  for (const stored of [undefined, null, "", "INR"]) {
    const decision = decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true, ldAmountINR: 50000 }, stored);
    assert.deepEqual(decision, { ok: true, isCompletion: true, recordLd: { ldApplicable: true, ldCurrency: "INR", ldAmountINR: 50000, ldAmountRegional: null, ldRemarks: null } }, String(stored));
  }
  // The same amount sent under both names is fine; two different amounts are refused.
  assert.equal(decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true, ldAmountINR: 700, ldAmount: 700 }, "INR").ok, true);
  const clash = decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true, ldAmountINR: 700, ldAmount: 800 }, "INR");
  assert.equal(clash.ok, false);
});

test("a rupee amount is refused for a regional project, and a mismatching currency is refused for every project", () => {
  for (const [, currency] of COUNTRIES.filter(([, c]) => c !== "INR")) {
    const rupee = decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true, ldAmountINR: 5000 }, currency);
    assert.equal(rupee.ok, false, currency);
    if (!rupee.ok) assert.match(rupee.message, new RegExp(`must be entered in ${currency}`));
    const wrong = decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true, ldAmount: 5000, ldCurrency: "INR" }, currency);
    assert.equal(wrong.ok, false, `${currency} with INR`);
    if (!wrong.ok) assert.match(wrong.message, new RegExp(`must be entered in ${currency}, not INR`));
  }
  const toIndia = decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true, ldAmount: 5000, ldCurrency: "AED" }, "INR");
  assert.equal(toIndia.ok, false);
  // The right currency (any case) passes, and is only a check: the stored currency is the project's.
  const ok = decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true, ldAmount: 5000, ldCurrency: "aed" }, "AED");
  assert.equal(ok.ok && ok.recordLd?.ldCurrency, "AED");
});

test("decimals follow the currency: OMR allows three, the others two", () => {
  assert.equal(ldAmountError(12.345, "OMR"), null);
  assert.match(ldAmountError(12.3456, "OMR")!, /three decimal/);
  assert.equal(ldAmountError(12.34, "AED"), null);
  assert.match(ldAmountError(12.345, "AED")!, /two decimal/);
  assert.match(ldAmountError(12.345, "INR")!, /two decimal/);
  assert.match(ldAmountError(0, "QAR")!, /greater than zero/);
  assert.match(ldAmountError(-1, "MYR")!, /greater than zero/);
  assert.match(ldAmountError(1e12, "AED")!, /too large/);
  const omr = decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true, ldAmount: 123.456 }, "OMR");
  assert.equal(omr.ok && omr.recordLd?.ldAmountRegional, 123.456);
  assert.equal(decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true, ldAmount: 123.4567 }, "OMR").ok, false);
});

test("'No LD' stores no currency and no amount; an amount with 'No LD' is refused", () => {
  const none = decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: false }, "AED");
  assert.deepEqual(none.ok && none.recordLd, { ldApplicable: false, ldCurrency: null, ldAmountINR: null, ldAmountRegional: null, ldRemarks: null });
  assert.equal(decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: false, ldAmount: 10 }, "AED").ok, false);
  assert.equal(decideCompletion(ACTIVE, { ...COMPLETE, ldApplicable: true }, "AED").ok, false, "amount required");
});

test("a recorded regional LD is immutable: the identical re-submit is a no-op, a different amount or a rupee amount is a 409", () => {
  const recorded: ExistingCompletionState = {
    ...ACTIVE,
    projectStatus: "Completed",
    actualCompletionDate: new Date("2026-11-10"),
    completionRemarks: "All deliverables handed over.",
    ldApplicable: true,
    ldCurrency: "AED",
    ldAmountINR: null,
    ldAmountRegional: 2500,
    ldRemarks: "Clause 9",
  };
  const same = decideCompletion(recorded, { ldApplicable: true, ldAmount: 2500, ldCurrency: "AED", ldRemarks: "Clause 9" }, "AED");
  assert.deepEqual(same, { ok: true, isCompletion: false, recordLd: null });
  const other = decideCompletion(recorded, { ldApplicable: true, ldAmount: 2600 }, "AED");
  assert.equal(!other.ok && other.status, 409);
  const rupees = decideCompletion(recorded, { ldAmountINR: 2500 }, "AED");
  assert.equal(rupees.ok, false);
  const wrongCurrency = decideCompletion(recorded, { ldAmount: 2500, ldCurrency: "OMR" }, "AED");
  assert.equal(!wrongCurrency.ok && wrongCurrency.status, 409);
  // Reopen and complete again: the record stands and nothing new is asked.
  const again = decideCompletion({ ...recorded, projectStatus: "Active" }, { ...COMPLETE }, "AED");
  assert.deepEqual(again, { ok: true, isCompletion: true, recordLd: null });
});

test("a LEGACY rupee record on a regional project keeps its meaning: it is never read as regional and cannot be re-submitted as one", () => {
  const legacy: ExistingCompletionState = {
    ...ACTIVE,
    projectStatus: "Completed",
    actualCompletionDate: new Date("2026-11-10"),
    completionRemarks: "All deliverables handed over.",
    ldApplicable: true,
    ldCurrency: null,
    ldAmountINR: 5000,
    ldAmountRegional: null,
    ldRemarks: null,
  };
  // The same number sent as an OMR amount is NOT the same record.
  assert.equal(decideCompletion(legacy, { ldAmount: 5000 }, "OMR").ok, false);
  // An untouched edit of the project passes.
  assert.deepEqual(decideCompletion(legacy, {}, "OMR"), { ok: true, isCompletion: false, recordLd: null });
});

test("the audit note and text name the project's own currency, never a rupee sign for a regional amount", () => {
  assert.equal(ldAmountText(50000, "INR"), "₹ 50,000.00");
  assert.equal(ldAmountText(2500, "AED"), "AED 2,500.00");
  assert.equal(ldAmountText(703.51, "OMR"), "OMR 703.510");
  assert.equal(ldAmountText(100, "MYR"), "MYR 100.00");
  const base = { actualCompletionDate: new Date("2026-11-10"), completionRemarks: "All deliverables handed over.", completedByName: "QA Admin", ldNewlyRecorded: true };
  const regional = completionNoteMessage({ ...base, ld: { ldApplicable: true, ldAmountINR: null, ldCurrency: "AED", ldAmountRegional: 2500, ldRemarks: null } });
  assert.match(regional, /Liquidated Damages: Applicable — AED 2,500\.00/);
  assert.doesNotMatch(regional, /₹/);
  const india = completionNoteMessage({ ...base, ld: { ldApplicable: true, ldAmountINR: 50000, ldRemarks: null } });
  assert.match(india, /Liquidated Damages: Applicable — ₹ 50,000\.00/);
});

test("the edit form re-sends a recorded LD on every save: an identical LEGACY rupee record on a regional project is a harmless no-op", () => {
  const legacy: ExistingCompletionState = {
    ...ACTIVE,
    projectStatus: "Completed",
    actualCompletionDate: new Date("2026-11-10"),
    completionRemarks: "All deliverables handed over.",
    ldApplicable: true,
    ldCurrency: null,
    ldAmountINR: 5000,
    ldAmountRegional: null,
    ldRemarks: "Ref 7",
  };
  for (const currency of ["OMR", "AED", "MYR", "QAR"]) {
    assert.deepEqual(decideCompletion(legacy, { ldApplicable: true, ldAmountINR: 5000, ldRemarks: "Ref 7" }, currency), { ok: true, isCompletion: false, recordLd: null }, currency);
    assert.equal(decideCompletion(legacy, { ldApplicable: true, ldAmountINR: 5001 }, currency).ok, false, `${currency}: a different rupee amount`);
    assert.equal(decideCompletion(legacy, { ldApplicable: true, ldAmountINR: null }, currency).ok, false, `${currency}: removing it`);
    assert.equal(decideCompletion(legacy, { ldApplicable: true, ldAmountINR: 5000, ldAmount: 5000 }, currency).ok, false, `${currency}: claiming it as a regional amount`);
    assert.equal(decideCompletion(legacy, { ldApplicable: true, ldAmountINR: 5000, ldCurrency: currency }, currency).ok, false, `${currency}: naming the regional currency`);
  }
  // A regional record re-sent with its own currency and amount is a no-op too (what the updated form sends).
  const regional: ExistingCompletionState = { ...legacy, ldCurrency: "AED", ldAmountINR: null, ldAmountRegional: 2500 };
  assert.deepEqual(decideCompletion(regional, { ldApplicable: true, ldAmount: 2500, ldCurrency: "AED", ldRemarks: "Ref 7" }, "AED"), { ok: true, isCompletion: false, recordLd: null });
});
