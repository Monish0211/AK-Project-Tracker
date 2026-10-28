import assert from "node:assert/strict";
import { test } from "node:test";
import { MANDATORY_INVOICE_ACCOUNTS_CC_EMAIL, MANDATORY_INVOICE_REQUEST_CC_EMAIL } from "../../shared/email/email.constants.js";
import { MAX_ADDITIONAL_CC_EMAILS, buildInvoiceWorkflowCcList, normalizeAdditionalCcEmails, normalizeEmailAddress } from "./invoiceRequestEmail.rules.js";
import { createInvoiceRequestSchema } from "./validators/invoiceRequest.validators.js";

/**
 * Additional CC Email Addresses (Oct 2026) — pure rules and the request schema. The browser checks addresses too, but this is the check that
 * counts: it runs on the server for every request, whatever the client sent. No database, no network, no mail.
 */

const MANDATORY = MANDATORY_INVOICE_REQUEST_CC_EMAIL; // arun@ifluids.com
const ACCOUNTS = MANDATORY_INVOICE_ACCOUNTS_CC_EMAIL; // accounts@ifluids.com — the second mandatory address, on every list
const parse = (body: Record<string, unknown>) => createInvoiceRequestSchema.safeParse({ assignedToUserId: "u1", ...body });

test("a plain address is valid and comes back trimmed and lower-cased", () => {
  assert.equal(normalizeEmailAddress("  Priya.Sharma@Example.COM "), "priya.sharma@example.com");
  for (const ok of ["a@b.co", "first.last+tag@sub.example.org", "o'brien@example.com", "x_y-z@my-company.co.in", "user@xn--bcher-kva.example", "a@b.museum", "1234567890@example.com", "user@example.xn--p1ai"]) {
    assert.equal(normalizeEmailAddress(ok), ok.toLowerCase(), ok);
  }
});

test("anything that is not exactly one plain address is invalid: names, lists, quotes, comments, spaces, line breaks, odd dots, missing parts", () => {
  const bad = [
    "", "   ", "plainaddress", "@example.com", "user@", "user@@example.com", "user@example", "user@.example.com", "user@example..com", "user@example.com.", "user@-example.com", "user@example-.com",
    "user @example.com", "user@exam ple.com", "Priya <priya@example.com>", "<priya@example.com>", '"quoted"@example.com', "user(comment)@example.com", "user@[192.168.0.1]",
    "a@example.com, b@example.com", "a@example.com;b@example.com", "a@example.com b@example.com",
    ".user@example.com", "user.@example.com", "us..er@example.com", "user@example.c", "user@example.123",
    "user@example.com\r\nBcc: attacker@example.com", "user@example.com\nBcc: x@y.com", "user\r@example.com", "user\u0000@example.com", "a@example.com\u2028Bcc: x@y.com", "us\ter@example.com",
    "üser@example.com", "user@exämple.com", `${"a".repeat(65)}@example.com`, `a@${"b".repeat(250)}.com`, `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.${"e".repeat(63)}`,
  ];
  for (const value of bad) assert.equal(normalizeEmailAddress(value), null, JSON.stringify(value).slice(0, 60));
  // Whitespace AROUND an address (a pasted line, a trailing newline) is only trimmed; a line break INSIDE one is what is refused (above).
  assert.equal(normalizeEmailAddress("user@example.com\r\n"), "user@example.com");
  assert.equal(normalizeEmailAddress("\tuser@example.com \n"), "user@example.com");
});

test("a list is trimmed, lower-cased and de-duplicated case-insensitively (first one kept, order preserved); blanks are ignored; every bad entry is reported", () => {
  assert.deepEqual(normalizeAdditionalCcEmails(["Asha@Example.com", " asha@example.COM", "ravi@example.com", "ASHA@EXAMPLE.COM", "", "   ", "Meena@Example.com"]), {
    emails: ["asha@example.com", "ravi@example.com", "meena@example.com"],
    invalid: [],
  });
  assert.deepEqual(normalizeAdditionalCcEmails(["ok@example.com", "nope", "Name <x@y.com>", "OK@example.com"]), { emails: ["ok@example.com"], invalid: ["nope", "Name <x@y.com>"] });
  assert.deepEqual(normalizeAdditionalCcEmails([]), { emails: [], invalid: [] });
});

test("the CC list always starts with arun@ifluids.com and accounts@ifluids.com, each exactly once, then the saved CC Members, then the manual addresses — with every duplicate removed, in any letter case", () => {
  const cc = buildInvoiceWorkflowCcList(["Member.One@example.com", "member.two@example.com"], ["extra@example.com", "EXTRA@example.com", "member.one@EXAMPLE.com", "ARUN@ifluids.com", "another@example.com"]);
  assert.deepEqual(cc, [MANDATORY, ACCOUNTS, "Member.One@example.com", "member.two@example.com", "extra@example.com", "another@example.com"]);
  assert.equal(cc.filter((e) => e.toLowerCase() === MANDATORY).length, 1, "the mandatory address is present once and only once");
  assert.equal(cc[0], MANDATORY, "…and first");
});

test("manual addresses can only ADD: they cannot remove, replace or reorder the mandatory address or the members, and the primary recipient is never repeated in CC", () => {
  const members = ["m1@example.com", "m2@example.com"];
  const withManual = buildInvoiceWorkflowCcList(members, ["a@example.com", "b@example.com"]);
  assert.deepEqual(withManual.slice(0, 4), [MANDATORY, ACCOUNTS, "m1@example.com", "m2@example.com"], "the existing recipients are untouched and first");
  assert.deepEqual(buildInvoiceWorkflowCcList(members, ["only@example.com"], ["Primary@Example.com"]), [MANDATORY, ACCOUNTS, ...members, "only@example.com"]);
  assert.deepEqual(buildInvoiceWorkflowCcList(members, ["primary@example.com", "kept@example.com"], ["Primary@Example.com"]), [MANDATORY, ACCOUNTS, ...members, "kept@example.com"], "an address equal to the primary recipient is dropped, whatever its case");
});

test("with no manual addresses the CC list is exactly what it always was (the Raised / Paid emails use this call unchanged)", () => {
  assert.deepEqual(buildInvoiceWorkflowCcList([]), [MANDATORY, ACCOUNTS]);
  assert.deepEqual(buildInvoiceWorkflowCcList(["m@example.com", "M@example.com", MANDATORY.toUpperCase()]), [MANDATORY, ACCOUNTS, "m@example.com"]);
  assert.deepEqual(buildInvoiceWorkflowCcList(["m@example.com"], []), buildInvoiceWorkflowCcList(["m@example.com"]));
  assert.deepEqual(buildInvoiceWorkflowCcList(["m@example.com"], undefined, undefined), [MANDATORY, ACCOUNTS, "m@example.com"]);
});

test("the schema: no field, an empty list and a list of valid addresses all work; the stored form is lower-cased and de-duplicated", () => {
  const none = parse({});
  assert.ok(none.success);
  assert.equal(none.data.additionalCcEmails, undefined, "backward compatible: a request without the field is unchanged");
  const empty = parse({ additionalCcEmails: [] });
  assert.ok(empty.success);
  assert.deepEqual(empty.data.additionalCcEmails, []);
  const one = parse({ additionalCcEmails: ["Client.Contact@Customer.com"] });
  assert.ok(one.success);
  assert.deepEqual(one.data.additionalCcEmails, ["client.contact@customer.com"]);
  const many = parse({ additionalCcEmails: ["A@x.com", " b@y.org ", "a@X.COM", "", "c@z.co.in"] });
  assert.ok(many.success);
  assert.deepEqual(many.data.additionalCcEmails, ["a@x.com", "b@y.org", "c@z.co.in"]);
});

test("the schema rejects bad input on its own — wrong shapes, invalid addresses, header-injection attempts, too many, too long — with a message that names the address", () => {
  for (const value of ["not-an-email", "Name <a@b.com>", "a@b.com,c@d.com", "a@b.com\r\nBcc: attacker@example.com", "a@b"]) {
    const result = parse({ additionalCcEmails: ["fine@example.com", value] });
    assert.equal(result.success, false, JSON.stringify(value));
    if (!result.success) {
      const issue = result.error.issues[0]!;
      assert.deepEqual(issue.path, ["additionalCcEmails"]);
      assert.match(issue.message, /is not a valid email address\.$/);
      assert.equal(/[\r\n]/.test(issue.message), false, "a rejected value can never put a line break into an error message");
    }
  }
  for (const wrong of ["a@b.com", 5, { a: 1 }, [1, 2], [null], [["a@b.com"]], [{ email: "a@b.com" }]]) assert.equal(parse({ additionalCcEmails: wrong }).success, false, JSON.stringify(wrong));
  const eleven = Array.from({ length: MAX_ADDITIONAL_CC_EMAILS + 1 }, (_, i) => `p${i}@example.com`);
  const tooMany = parse({ additionalCcEmails: eleven });
  assert.equal(tooMany.success, false);
  if (!tooMany.success) assert.match(tooMany.error.issues[0]!.message, /at most 10 additional CC email addresses/);
  assert.ok(parse({ additionalCcEmails: eleven.slice(0, MAX_ADDITIONAL_CC_EMAILS) }).success, "exactly ten is fine");
  assert.equal(parse({ additionalCcEmails: [`${"a".repeat(330)}@example.com`] }).success, false);
  const longBad = parse({ additionalCcEmails: ["x".repeat(300)] });
  assert.equal(longBad.success, false);
});

test("duplicates beyond the cap do not count against it, and the schema leaves every other field as it was", () => {
  const dupes = Array.from({ length: 10 }, () => "same@example.com");
  const result = parse({ additionalCcEmails: dupes, ccMemberUserIds: ["u2"], notes: "  keep  ", invoiceAmountNote: "x" });
  assert.ok(result.success);
  assert.deepEqual(result.data.additionalCcEmails, ["same@example.com"]);
  assert.deepEqual(result.data.ccMemberUserIds, ["u2"]);
  assert.equal(result.data.notes, "keep");
  assert.equal(result.data.assignedToUserId, "u1");
});
