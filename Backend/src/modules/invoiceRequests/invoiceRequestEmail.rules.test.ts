import assert from "node:assert/strict";
import { test } from "node:test";
import { MANDATORY_INVOICE_REQUEST_CC_EMAIL, MANDATORY_INVOICE_WORKFLOW_CC_EMAIL } from "../../shared/email/email.constants.js";
import { buildInvoiceRequestCcList, buildInvoiceWorkflowCcList, isGenuinePaidTransition } from "./invoiceRequestEmail.rules.js";

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

// ── Mandatory CC differs by stage (Oct 2026): Assigned + Raised -> arun@ifluids.com, Paid -> info@ifluids.com ─────────────────────────────
test("the two mandatory addresses: Assigned/Raised use arun@ifluids.com, the Paid email's address stays info@ifluids.com", () => {
  assert.equal(MANDATORY_INVOICE_REQUEST_CC_EMAIL, "arun@ifluids.com");
  assert.equal(MANDATORY_INVOICE_WORKFLOW_CC_EMAIL, "info@ifluids.com");
});

test("buildInvoiceRequestCcList (Assigned / Raised): arun@ifluids.com first, exactly once, never info@ifluids.com", () => {
  assert.deepEqual(buildInvoiceRequestCcList([]), ["arun@ifluids.com"]);
  assert.deepEqual(buildInvoiceRequestCcList(["sivagnanam@ifluids.com", "suresh.k@ifluids.com"]), ["arun@ifluids.com", "sivagnanam@ifluids.com", "suresh.k@ifluids.com"]);
  assert.ok(!buildInvoiceRequestCcList(["a@x.com"], ["b@x.com"]).includes("info@ifluids.com"));
});

test("buildInvoiceRequestCcList keeps every existing rule: order (mandatory, members, manual), case-insensitive de-duplication, primary recipient skipped", () => {
  const cc = buildInvoiceRequestCcList(
    ["Member.One@example.com", "ARUN@ifluids.com", "member.two@example.com", "MEMBER.ONE@example.com"],
    ["Extra@customer.com", "extra@CUSTOMER.com", "arun@IFLUIDS.com", "member.two@example.com", "primary@example.com", "later@customer.com"],
    ["Primary@Example.com"]
  );
  assert.deepEqual(cc, ["arun@ifluids.com", "Member.One@example.com", "member.two@example.com", "Extra@customer.com", "later@customer.com"]);
});

test("info@ifluids.com is an ordinary address for Assigned/Raised now: a member or manual entry keeps it (once); only arun@ is mandatory there", () => {
  assert.deepEqual(buildInvoiceRequestCcList(["info@ifluids.com"], ["INFO@ifluids.com"]), ["arun@ifluids.com", "info@ifluids.com"]);
});

test("the Invoice Paid list is unchanged: buildInvoiceWorkflowCcList still leads with info@ifluids.com and never adds arun@ifluids.com on its own", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList([]), ["info@ifluids.com"]);
  assert.deepEqual(buildInvoiceWorkflowCcList(["m@example.com"], ["x@example.com"]), ["info@ifluids.com", "m@example.com", "x@example.com"]);
  assert.ok(!buildInvoiceWorkflowCcList(["m@example.com"]).includes("arun@ifluids.com"));
});
