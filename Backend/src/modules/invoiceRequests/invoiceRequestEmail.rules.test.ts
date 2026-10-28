import assert from "node:assert/strict";
import { test } from "node:test";
import { MANDATORY_INVOICE_ACCOUNTS_CC_EMAIL, MANDATORY_INVOICE_REQUEST_CC_EMAIL, MANDATORY_INVOICE_WORKFLOW_CC_EMAILS } from "../../shared/email/email.constants.js";
import { buildInvoiceRequestCcList, buildInvoiceWorkflowCcList, isGenuinePaidTransition } from "./invoiceRequestEmail.rules.js";

const ARUN = "arun@ifluids.com";
const ACCOUNTS = "accounts@ifluids.com";
const OLD_PAID = "info@ifluids.com";

test("buildInvoiceWorkflowCcList: no CC members selected -> the two mandatory recipients only", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList([]), [ARUN, ACCOUNTS]);
});

test("buildInvoiceWorkflowCcList: one CC member -> mandatory pair + that member", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList(["sivagnanam@ifluids.com"]), [ARUN, ACCOUNTS, "sivagnanam@ifluids.com"]);
});

test("buildInvoiceWorkflowCcList: multiple CC members -> all included, mandatory pair first", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList(["sivagnanam@ifluids.com", "suresh.k@ifluids.com", "ravi@ifluids.com"]), [
    ARUN,
    ACCOUNTS,
    "sivagnanam@ifluids.com",
    "suresh.k@ifluids.com",
    "ravi@ifluids.com",
  ]);
});

test("buildInvoiceWorkflowCcList: a duplicate member email never appears twice", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList(["sivagnanam@ifluids.com", "Sivagnanam@IFluids.com"]), [ARUN, ACCOUNTS, "sivagnanam@ifluids.com"]);
});

test("buildInvoiceWorkflowCcList: a mandatory recipient can never be duplicated even if a member happens to share it", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList([ARUN, "sivagnanam@ifluids.com", "Accounts@IFluids.com"]), [ARUN, ACCOUNTS, "sivagnanam@ifluids.com"]);
});

test("buildInvoiceWorkflowCcList: both mandatory recipients are always present, never removable", () => {
  for (const members of [[], ["a@ifluids.com"], ["a@ifluids.com", "b@ifluids.com"]]) {
    const cc = buildInvoiceWorkflowCcList(members);
    assert.ok(cc.includes(ARUN) && cc.includes(ACCOUNTS));
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

// ── All three lifecycle emails (Assigned = Request Invoice, Raised, Paid) carry arun@ AND accounts@ (Oct 2026); Paid no longer has info@ ──────────
test("the mandatory addresses: one pair, arun@ifluids.com then accounts@ifluids.com, for all three emails — info@ifluids.com is not among them", () => {
  assert.equal(MANDATORY_INVOICE_REQUEST_CC_EMAIL, ARUN);
  assert.equal(MANDATORY_INVOICE_ACCOUNTS_CC_EMAIL, ACCOUNTS);
  assert.deepEqual([...MANDATORY_INVOICE_WORKFLOW_CC_EMAILS], [ARUN, ACCOUNTS]);
  assert.ok(!MANDATORY_INVOICE_WORKFLOW_CC_EMAILS.some((e) => e === OLD_PAID));
});

test("buildInvoiceRequestCcList (Assigned / Raised): arun@ then accounts@ first, each exactly once, never info@ifluids.com", () => {
  assert.deepEqual(buildInvoiceRequestCcList([]), [ARUN, ACCOUNTS]);
  assert.deepEqual(buildInvoiceRequestCcList(["sivagnanam@ifluids.com", "suresh.k@ifluids.com"]), [ARUN, ACCOUNTS, "sivagnanam@ifluids.com", "suresh.k@ifluids.com"]);
  assert.ok(!buildInvoiceRequestCcList(["a@x.com"], ["b@x.com"]).includes(OLD_PAID));
});

test("buildInvoiceRequestCcList keeps every existing rule: order (mandatory, members, manual), case-insensitive de-duplication, primary recipient skipped", () => {
  const cc = buildInvoiceRequestCcList(
    ["Member.One@example.com", "ARUN@ifluids.com", "member.two@example.com", "MEMBER.ONE@example.com", "Accounts@IFluids.com"],
    ["Extra@customer.com", "extra@CUSTOMER.com", "arun@IFLUIDS.com", "ACCOUNTS@ifluids.com", "member.two@example.com", "primary@example.com", "later@customer.com"],
    ["Primary@Example.com"]
  );
  assert.deepEqual(cc, [ARUN, ACCOUNTS, "Member.One@example.com", "member.two@example.com", "Extra@customer.com", "later@customer.com"]);
});

test("both mandatory addresses can never be dropped or doubled on any list: not by a member, a manual entry, or by being the primary recipient's skip entry", () => {
  for (const build of [buildInvoiceRequestCcList, buildInvoiceWorkflowCcList]) {
    for (const members of [[], ["m@example.com"], [ACCOUNTS], [ACCOUNTS.toUpperCase()], [ARUN.toUpperCase(), ACCOUNTS]]) {
      for (const extra of [[], ["x@example.com"], [ACCOUNTS], ["ACCOUNTS@IFLUIDS.COM"], ["Arun@iFluids.com"]]) {
        const cc = build(members, extra);
        assert.deepEqual(cc.slice(0, 2), [ARUN, ACCOUNTS]);
        for (const mandatory of [ARUN, ACCOUNTS]) assert.equal(cc.filter((e) => e.toLowerCase() === mandatory).length, 1, `${mandatory} present once, never twice`);
      }
    }
  }
  // the skip list (the primary recipient) only ever removes MANUAL addresses; the mandatory pair stays even when one of them is the To address
  assert.deepEqual(buildInvoiceRequestCcList([], [], [ACCOUNTS]), [ARUN, ACCOUNTS]);
  assert.deepEqual(buildInvoiceRequestCcList([], [ACCOUNTS, "z@example.com"], [ACCOUNTS]), [ARUN, ACCOUNTS, "z@example.com"]);
});

test("info@ifluids.com is an ordinary address for the lifecycle emails: a member or manual entry keeps it (once); only arun@ + accounts@ are mandatory", () => {
  assert.deepEqual(buildInvoiceRequestCcList([OLD_PAID], ["INFO@ifluids.com"]), [ARUN, ACCOUNTS, OLD_PAID]);
});

test("the Invoice Paid list (buildInvoiceWorkflowCcList default) is the same pair: arun@ + accounts@, saved members preserved, info@ifluids.com gone", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList([]), [ARUN, ACCOUNTS]);
  assert.deepEqual(buildInvoiceWorkflowCcList(["m@example.com"], ["x@example.com"]), [ARUN, ACCOUNTS, "m@example.com", "x@example.com"]);
  assert.ok(!buildInvoiceWorkflowCcList(["m@example.com"]).includes(OLD_PAID));
  // the Paid list and the Assigned / Raised list can never drift apart
  for (const members of [[], ["m@example.com"], ["Arun@iFluids.com", "m@example.com", "ACCOUNTS@ifluids.com"]]) {
    assert.deepEqual(buildInvoiceWorkflowCcList(members), buildInvoiceRequestCcList(members));
  }
});

test("buildInvoiceWorkflowCcList accepts one address or several: each listed in the order given, once, blanks and repeats dropped", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList([], [], [], "only@example.com"), ["only@example.com"]);
  assert.deepEqual(buildInvoiceWorkflowCcList(["m@example.com"], [], [], ["one@example.com", "Two@example.com"]), ["one@example.com", "Two@example.com", "m@example.com"]);
  assert.deepEqual(buildInvoiceWorkflowCcList(["TWO@example.com"], [], [], ["one@example.com", "two@example.com", "ONE@example.com", "  "]), ["one@example.com", "two@example.com"]);
});
