import assert from "node:assert/strict";
import { test } from "node:test";
import cron from "node-cron";
import {
  buildUnpaidInvoiceReport,
  calendarDaysSince,
  totalKnownOutstanding,
  UNPAID_INVOICE_SUBJECT,
  type InvoiceLineCandidate,
} from "./unpaidInvoice.rules.js";
import { buildUnpaidInvoicesEmail, formatINR } from "../../shared/email/templates/unpaidInvoices.template.js";
import { env } from "../../shared/utils/env.js";

const TZ = "Asia/Kolkata";
// "Now" = Mon 19 Oct 2026, 11:00 IST (05:30 UTC).
const NOW = new Date("2026-10-19T05:30:00Z");
const daysAgo = (n: number) => new Date(Date.parse("2026-10-19T00:00:00Z") - n * 86_400_000); // date-only, UTC midnight

let seq = 0;
function line(days: number, status: string, extra: Partial<InvoiceLineCandidate> = {}): InvoiceLineCandidate {
  seq++;
  return {
    id: `l${seq}`, projectId: "p1", prNo: "PR-1", client: "Client", projectTitle: "Title", projectManager: "PM",
    invoiceNo: `INV-${seq}`, invoiceDate: daysAgo(days), status, invoiceAmountINR: 1000, currency: "INR", invoiceAmountOriginal: 1000, ...extra,
  };
}

test("29 days is excluded; exactly 30 and older are included (calendar days, invoice date)", () => {
  const r = buildUnpaidInvoiceReport([line(29, "Raised", { invoiceNo: "A" }), line(30, "Raised", { invoiceNo: "B" }), line(45, "Raised", { invoiceNo: "C" })], NOW, TZ);
  assert.deepEqual(r.overdue.map((x) => [x.invoiceNo, x.daysSinceRaised]), [["C", 45], ["B", 30]]);
  assert.equal(r.eligibleCount, 3, "all raised invoices are checked, any age");
});

test("day count uses the configured timezone's calendar date, not the hour", () => {
  const inv = new Date("2026-09-19T00:00:00Z"); // invoice dated 19 Sep
  // 18 Oct 23:30 IST (18:00 UTC) → 29 days; 19 Oct 00:30 IST (18 Oct 19:00 UTC) → 30 days.
  assert.equal(calendarDaysSince(inv, new Date("2026-10-18T18:00:00Z"), TZ), 29);
  assert.equal(calendarDaysSince(inv, new Date("2026-10-18T19:00:00Z"), TZ), 30);
  assert.equal(calendarDaysSince(inv, new Date("2026-10-18T19:00:00Z"), "UTC"), 29, "same instant, UTC calendar is still the 18th");
  // Month/year boundaries
  assert.equal(calendarDaysSince(new Date("2026-12-02T00:00:00Z"), new Date("2027-01-01T06:00:00Z"), TZ), 30);
});

test("Paid, Cancelled and Draft are excluded; Raised and Partially Paid are included", () => {
  const r = buildUnpaidInvoiceReport(
    [line(60, "Paid"), line(60, "Cancelled"), line(60, "Draft"), line(60, "Raised", { invoiceNo: "R" }), line(60, "PartiallyPaid", { invoiceNo: "PP" })],
    NOW, TZ
  );
  assert.deepEqual(r.overdue.map((x) => x.invoiceNo).sort(), ["PP", "R"]);
  assert.equal(r.eligibleCount, 2, "only raised-and-not-paid invoices are counted as checked");
});

test("Raised: paid 0, outstanding = amount. Partially Paid: paid/outstanding not recorded (null), never guessed", () => {
  const r = buildUnpaidInvoiceReport([line(40, "Raised", { invoiceNo: "R", invoiceAmountINR: 50000 }), line(40, "PartiallyPaid", { invoiceNo: "PP", invoiceAmountINR: 80000 })], NOW, TZ);
  const raised = r.overdue.find((x) => x.invoiceNo === "R")!;
  const partial = r.overdue.find((x) => x.invoiceNo === "PP")!;
  assert.deepEqual([raised.status, raised.amountPaidINR, raised.outstandingINR], ["Raised / Submitted", 0, 50000]);
  assert.deepEqual([partial.status, partial.amountPaidINR, partial.outstandingINR, partial.invoiceAmountINR], ["Partially Paid", null, null, 80000]);
  assert.equal(totalKnownOutstanding(r.overdue), 50000, "unknown partial balances are not added to the total");
});

test("an invoice raised as several lines is ONE row (amounts summed, earliest date); separate invoice numbers are separate rows", () => {
  const r = buildUnpaidInvoiceReport(
    [
      line(35, "Raised", { invoiceNo: "INV-77", invoiceAmountINR: 1000 }),
      line(40, "Raised", { invoiceNo: " inv-77 ", invoiceAmountINR: 2500.5 }), // same invoice, other line
      line(50, "Raised", { invoiceNo: "INV-78" }), // second invoice cycle on the same project
      line(50, "Raised", { invoiceNo: "INV-77", projectId: "p2", prNo: "PR-2" }), // same number, different project
    ],
    NOW, TZ
  );
  const p1 = r.overdue.filter((x) => x.projectId === "p1");
  assert.equal(p1.length, 2);
  const merged = p1.find((x) => x.invoiceNo.trim().toUpperCase() === "INV-77")!;
  assert.deepEqual([merged.lineCount, merged.invoiceAmountINR, merged.daysSinceRaised], [2, 3500.5, 40]);
  assert.equal(r.overdue.length, 3);
  assert.equal(r.eligibleCount, 3);
  const mixed = buildUnpaidInvoiceReport([line(40, "Raised", { invoiceNo: "M" }), line(40, "PartiallyPaid", { invoiceNo: "M" })], NOW, TZ).overdue[0]!;
  assert.deepEqual([mixed.status, mixed.outstandingINR], ["Partially Paid", null], "any partially paid line makes the invoice's balance unknown");
});

test("rule check: Raised / Submitted (incl. a legacy stored \"Submitted\") and Partially Paid qualify; Draft, Paid, Cancelled never do", () => {
  const r = buildUnpaidInvoiceReport(
    [
      line(40, "Raised", { invoiceNo: "R" }),
      line(40, "Submitted", { invoiceNo: "S" }),
      line(40, "PartiallyPaid", { invoiceNo: "PP" }),
      line(40, "Draft", { invoiceNo: "D" }),
      line(40, "Paid", { invoiceNo: "P" }),
      line(40, "Cancelled", { invoiceNo: "C" }),
    ],
    NOW, TZ
  );
  assert.deepEqual(r.overdue.map((x) => [x.invoiceNo, x.status]).sort(), [["PP", "Partially Paid"], ["R", "Raised / Submitted"], ["S", "Raised / Submitted"]]);
  assert.equal(r.eligibleCount, 3);
});

test("rule check: age is the invoice's age (Invoice Date), not time in status — dated 5 Oct 2026 qualifies from 4 Nov IST", () => {
  const inv = (status: string) => ({ ...line(0, status, { invoiceNo: "OCT5" }), invoiceDate: new Date("2026-10-05T00:00:00Z") });
  const at = (iso: string) => buildUnpaidInvoiceReport([inv("Raised")], new Date(iso), TZ).overdue.length;
  assert.equal(at("2026-11-03T12:00:00Z"), 0, "3 Nov (day 29) — not yet");
  assert.equal(at("2026-11-03T18:29:00Z"), 0, "3 Nov 23:59 IST — still day 29");
  assert.equal(at("2026-11-03T18:30:00Z"), 1, "4 Nov 00:00 IST — day 30, qualifies");
  assert.equal(at("2026-11-04T05:30:00Z"), 1, "4 Nov 11:00 IST (the weekly run time)");
  assert.equal(buildUnpaidInvoiceReport([inv("PartiallyPaid")], new Date("2026-11-04T05:30:00Z"), TZ).overdue[0]?.daysSinceRaised, 30);
});

test("foreign-currency invoices keep the INR amount and note the original", () => {
  const r = buildUnpaidInvoiceReport([line(40, "Raised", { currency: "USD", invoiceAmountOriginal: 2400, invoiceAmountINR: 200000 })], NOW, TZ);
  assert.equal(r.overdue[0]!.originalAmountNote, "USD 2,400.00");
  assert.equal(r.overdue[0]!.invoiceAmountINR, 200000);
});

test("rows are sorted oldest first", () => {
  const r = buildUnpaidInvoiceReport([line(31, "Raised", { invoiceNo: "X" }), line(90, "Raised", { invoiceNo: "Y" }), line(60, "Raised", { invoiceNo: "Z" })], NOW, TZ);
  assert.deepEqual(r.overdue.map((x) => x.daysSinceRaised), [90, 60, 31]);
});

test("email: values escaped, links used as given, Not recorded shown, one table, plain text present", () => {
  const email = buildUnpaidInvoicesEmail({
    subject: UNPAID_INVOICE_SUBJECT,
    generatedAt: "19 Oct 2026, 11:00 IST (Asia/Kolkata)",
    eligibleCount: 9,
    overdueDays: 30,
    knownOutstandingINR: 50000,
    partiallyPaidCount: 1,
    rows: [
      { prNo: "PR-<1>", client: `<script>x</script> & "Co"`, projectTitle: "T'1", projectManager: null, invoiceNo: "INV<9>", invoiceDate: "2026-09-01", daysSinceRaised: 48, invoiceAmountINR: 50000, amountPaidINR: 0, outstandingINR: 50000, status: "Raised / Submitted", originalAmountNote: null, projectUrl: "https://pmodashboard.ifluids.in/projects/view/p1" },
      { prNo: "PR-2", client: "C2", projectTitle: "T2", projectManager: "PM", invoiceNo: "INV-2", invoiceDate: "2026-08-01", daysSinceRaised: 79, invoiceAmountINR: 80000, amountPaidINR: null, outstandingINR: null, status: "Partially Paid", originalAmountNote: "USD 1,000.00", projectUrl: "https://pmodashboard.ifluids.in/projects/view/p2" },
    ],
  });
  assert.equal(email.subject, "Weekly Reminder — Invoices Unpaid for 30+ Days");
  assert.ok(!email.html.includes("<script>"));
  assert.ok(email.html.includes("&lt;script&gt;x&lt;/script&gt; &amp; &quot;Co&quot;"));
  assert.ok(email.html.includes("INV&lt;9&gt;") && email.html.includes("T&#39;1"));
  assert.ok(email.html.includes('href="https://pmodashboard.ifluids.in/projects/view/p1"'));
  assert.ok(email.html.includes("Not recorded"));
  assert.ok(email.html.includes("01 Sep 2026"));
  assert.equal((email.html.match(/<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; border:1px solid/g) ?? []).length, 1, "one consolidated table");
  assert.match(email.text, /Invoices unpaid for 30\+ days: 2/);
  assert.match(email.text, /Paid Not recorded \| Outstanding Not recorded \| Partially Paid/);
  assert.match(email.text, /Outstanding on fully unpaid \(Raised \/ Submitted\) invoices: ₹ 50,000\.00/);
  assert.ok(email.html.includes(">Raised / Submitted<"), "portal label used in the table");
});

test("email: empty state", () => {
  const email = buildUnpaidInvoicesEmail({ subject: "S", generatedAt: "now", eligibleCount: 4, overdueDays: 30, knownOutstandingINR: 0, partiallyPaidCount: 0, rows: [] });
  assert.match(email.html, /No invoice has been unpaid for 30 days or more/);
  assert.ok(!email.html.includes("<th"));
});

test("schedule: default Monday 11:00, valid; the scheduler registers exactly one task per process", async () => {
  assert.equal(env.UNPAID_INVOICE_CRON, "0 11 * * 1");
  assert.ok(cron.validate(env.UNPAID_INVOICE_CRON));
  assert.equal(env.UNPAID_INVOICE_EMAIL_ENABLED, false, "delivery off by default");
  const { startUnpaidInvoiceScheduler } = await import("../../shared/scheduler/unpaidInvoiceScheduler.js");
  const before = new Set(cron.getTasks().keys());
  startUnpaidInvoiceScheduler();
  startUnpaidInvoiceScheduler();
  const added = [...cron.getTasks().entries()].filter(([id]) => !before.has(id));
  try {
    assert.equal(added.length, 1);
  } finally {
    for (const [, task] of added) await task.destroy();
  }
});

test("default recipients: To info@ifluids.com, CC = the Accounts CC list of the expense email", async () => {
  const { defaultsFromAccounts } = await import("./services/unpaidInvoice.service.js");
  assert.deepEqual(defaultsFromAccounts({ cc: [{ email: "sivagnanam@ifluids.com" }, { email: "monish.n@ifluids.com" }] }), {
    toEmail: "info@ifluids.com",
    ccEmails: ["sivagnanam@ifluids.com", "monish.n@ifluids.com"],
    unresolved: [],
  });
});

test("formatINR: Indian grouping, always two decimals, ₹ prefix (the shared formatter must match per-call toLocaleString)", () => {
  const expected: [number, string][] = [
    [0, "₹ 0.00"],
    [0.005, "₹ 0.01"],
    [1, "₹ 1.00"],
    [999.5, "₹ 999.50"],
    [1000, "₹ 1,000.00"],
    [100000, "₹ 1,00,000.00"],
    [1234567.891, "₹ 12,34,567.89"],
    [98765432.1, "₹ 9,87,65,432.10"],
    [-1234.565, "₹ -1,234.57"],
  ];
  for (const [value, text] of expected) {
    assert.equal(formatINR(value), text, String(value));
    assert.equal(formatINR(value), `₹ ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, `${value} vs toLocaleString`);
  }
});
