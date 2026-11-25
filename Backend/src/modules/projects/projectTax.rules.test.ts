import assert from "node:assert/strict";
import { test } from "node:test";
import { assertTaxFieldsAllowed, resolveProjectTaxMode, taxRatePercentField } from "./projectTax.rules.js";
import { createProjectSchema, updateProjectSchema } from "./validators/project.validators.js";

/** Project Tax (Nov 2026): which projects use Tax, what a rate may be, and what is refused on a GST project. */

test("MODE: India is GST whatever its currency; every other configured country is TAX; legacy (no regional currency), blank and unknown categories keep GST", () => {
  assert.equal(resolveProjectTaxMode("India", "INR"), "GST");
  assert.equal(resolveProjectTaxMode("India", null), "GST");
  for (const [category, currency] of [["Malaysia", "MYR"], ["Oman", "OMR"], ["Abu Dhabi", "AED"], ["FZI", "AED"], ["Elixir Qatar", "QAR"], ["Qatar", "QAR"]] as const) {
    assert.equal(resolveProjectTaxMode(category, currency), "TAX", category);
    assert.equal(resolveProjectTaxMode(category, null), "GST", `${category} legacy project`);
  }
  for (const bad of ["", "  ", null, undefined, "Mars"]) assert.equal(resolveProjectTaxMode(bad, "AED"), "GST", String(bad));
});

test("RATE: 0..100 with up to 4 decimals; null and omitted are allowed; text, negatives, over 100, 5 decimals, NaN and Infinity are refused", () => {
  for (const ok of [0, 2, 5, 10, 12, 18, 3, 7.5, 15, 20, 99.9999, 100, 0.0001, null, undefined]) assert.equal(taxRatePercentField.safeParse(ok).success, true, String(ok));
  for (const bad of [-0.0001, -1, 100.0001, 101, 7.12345, "5", "", "7.5", NaN, Infinity]) assert.equal(taxRatePercentField.safeParse(bad).success, false, String(bad));
});

test("SCHEMAS: create and update never default the Tax fields (omitted stays omitted, so nothing is assumed to be 0% or cleared)", () => {
  const update = updateProjectSchema.parse({ projectTitle: "x" });
  assert.equal("taxApplicable" in update, false);
  assert.equal("taxRatePercent" in update, false);
  assert.deepEqual(updateProjectSchema.parse({ taxApplicable: null, taxRatePercent: null }), { taxApplicable: null, taxRatePercent: null });
  const shape = createProjectSchema.shape;
  assert.equal(shape.taxApplicable.safeParse(undefined).data, undefined);
  assert.equal(shape.taxRatePercent.safeParse(undefined).data, undefined);
  assert.equal(shape.taxApplicable.safeParse("yes").success, false);
});

test("GUARD: a GST project refuses any Tax value (false and 0 count as values); null / omitted pass; a TAX project accepts them", () => {
  for (const fields of [{ taxApplicable: true }, { taxApplicable: false }, { taxRatePercent: 0 }, { taxRatePercent: 5 }]) {
    assert.throws(() => assertTaxFieldsAllowed("GST", fields), /apply only to projects outside India/);
    assertTaxFieldsAllowed("TAX", fields);
  }
  assertTaxFieldsAllowed("GST", {});
  assertTaxFieldsAllowed("GST", { taxApplicable: null, taxRatePercent: null });
});
