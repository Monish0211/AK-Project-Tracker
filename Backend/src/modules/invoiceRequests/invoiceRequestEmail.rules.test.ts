import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInvoiceWorkflowCcList, isGenuinePaidTransition } from "./invoiceRequestEmail.rules.js";

test("buildInvoiceWorkflowCcList: no CC members selected -> mandatory recipient only", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList([]), ["info@ifluids.com"]);
});

test("buildInvoiceWorkflowCcList: one CC member -> mandatory + that member", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList(["sivagnanam@ifluids.com"]), [
    "info@ifluids.com",
    "sivagnanam@ifluids.com",
  ]);
});

test("buildInvoiceWorkflowCcList: multiple CC members -> all included, mandatory first", () => {
  assert.deepEqual(
    buildInvoiceWorkflowCcList(["sivagnanam@ifluids.com", "suresh.k@ifluids.com", "arun@ifluids.com"]),
    ["info@ifluids.com", "sivagnanam@ifluids.com", "suresh.k@ifluids.com", "arun@ifluids.com"]
  );
});

test("buildInvoiceWorkflowCcList: a duplicate member email never appears twice", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList(["sivagnanam@ifluids.com", "Sivagnanam@IFluids.com"]), [
    "info@ifluids.com",
    "sivagnanam@ifluids.com",
  ]);
});

test("buildInvoiceWorkflowCcList: the mandatory recipient can never be duplicated even if a member happens to share it", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList(["info@ifluids.com", "sivagnanam@ifluids.com"]), [
    "info@ifluids.com",
    "sivagnanam@ifluids.com",
  ]);
});

test("buildInvoiceWorkflowCcList: the mandatory recipient is always present, never removable", () => {
  for (const members of [[], ["a@ifluids.com"], ["a@ifluids.com", "b@ifluids.com"]]) {
    assert.ok(buildInvoiceWorkflowCcList(members).includes("info@ifluids.com"));
  }
});

test("isGenuinePaidTransition: Raised -> Paid fires", () => {
  assert.equal(isGenuinePaidTransition("Raised", "Paid"), true);
});

test("isGenuinePaidTransition: PartiallyPaid -> Paid fires", () => {
  assert.equal(isGenuinePaidTransition("PartiallyPaid", "Paid"), true);
});

test("isGenuinePaidTransition: Draft -> Paid fires (the system allows this direct transition)", () => {
  assert.equal(isGenuinePaidTransition("Draft", "Paid"), true);
});

test("isGenuinePaidTransition: Paid -> Paid never fires", () => {
  assert.equal(isGenuinePaidTransition("Paid", "Paid"), false);
});

test("isGenuinePaidTransition: Draft -> PartiallyPaid never fires (not becoming Paid)", () => {
  assert.equal(isGenuinePaidTransition("Draft", "PartiallyPaid"), false);
});

test("isGenuinePaidTransition: Raised -> PartiallyPaid never fires", () => {
  assert.equal(isGenuinePaidTransition("Raised", "PartiallyPaid"), false);
});

test("isGenuinePaidTransition: Paid -> Cancelled never fires (never claims to be a Paid transition)", () => {
  assert.equal(isGenuinePaidTransition("Paid", "Cancelled"), false);
});
