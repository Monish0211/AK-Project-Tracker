import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { groupInvoices, summarizeOutstanding, summarizeRecords, type TrackerLine } from "./invoiceTracker.rules.js";
import { buildUnpaidInvoiceReport, totalKnownOutstanding, totalKnownOutstandingByCurrency, type InvoiceLineCandidate } from "../weeklyNotifications/unpaidInvoice.rules.js";
import { buildUnpaidInvoicesEmail, type UnpaidInvoiceEmailRow } from "../../shared/email/templates/unpaidInvoices.template.js";

/**
 * The Invoice Tracker and the weekly unpaid-invoice reminder across countries: every invoice amount is in its project's own currency, every total is kept per
 * currency (never added across currencies), and an India-only report is exactly what it always was.
 */
const line = (id: string, projectId: string, no: string, status: string, amount: number, currency?: string): TrackerLine => ({
  id,
  projectId,
  invoiceNo: no,
  invoiceDate: new Date("2026-11-10"),
  status,
  invoiceAmountINR: amount,
  ...(currency ? { projectCurrency: currency } : {}),
  createdAt: new Date("2026-11-10T05:00:00Z"),
});

describe("Invoice Tracker totals", () => {
  const mixed = groupInvoices([
    line("a", "p-in", "I-1", "Raised", 50_000),
    line("b", "p-in", "I-2", "Paid", 10_000),
    line("c", "p-om", "O-1", "Raised", 231, "OMR"),
    line("d", "p-om", "O-2", "Paid", 100.5, "OMR"),
    line("e", "p-qa", "Q-1", "Raised", 3950, "QAR"),
    line("f", "p-qa", "Q-2", "Draft", 99, "QAR"),
  ]);

  test("one total per currency; the rupee figure is the rupee part only", () => {
    const { summary } = summarizeRecords(mixed, [], null);
    assert.deepEqual(summary.raisedByCurrency, { INR: 60_000, OMR: 331.5, QAR: 3950 });
    assert.equal(summary.raisedAmountINR, 60_000);
    assert.deepEqual(summary.collected.byCurrency, { INR: 10_000, OMR: 100.5 });
    assert.equal(summary.collected.amountINR, 10_000);
    assert.deepEqual(summary.outstanding.knownByCurrency, { INR: 50_000, OMR: 231, QAR: 3950 });
    assert.equal(summary.outstanding.knownAmountINR, 50_000);
    assert.equal(summary.invoicesRaised, 5, "counts are counts: status logic is the same for every country");
  });

  test("an India-only report is exactly the figures it always had", () => {
    const india = groupInvoices([line("a", "p-in", "I-1", "Raised", 50_000), line("b", "p-in", "I-2", "Paid", 10_000), line("g", "p-in", "I-3", "PartiallyPaid", 7_000)]);
    const { summary } = summarizeRecords(india, [], null);
    assert.equal(summary.raisedAmountINR, 67_000);
    assert.deepEqual(summary.raisedByCurrency, { INR: 67_000 });
    assert.equal(summary.collected.amountINR, 10_000);
    assert.equal(summary.outstanding.knownAmountINR, 50_000);
    assert.equal(summary.outstanding.balanceNotRecordedCount, 1);
  });

  test("the Outstanding view totals per currency and still identifies overdue invoices the same way", () => {
    const totals = summarizeOutstanding([
      { status: "Raised", amountINR: 50_000, daysOutstanding: 45, projectCurrency: "INR" },
      { status: "Raised", amountINR: 231, daysOutstanding: 10, projectCurrency: "OMR" },
      { status: "PartiallyPaid", amountINR: 4200, daysOutstanding: 31, projectCurrency: "MYR" },
      { status: "Raised", amountINR: 1000, daysOutstanding: null },
    ]);
    assert.deepEqual(totals.knownOutstandingByCurrency, { INR: 51_000, OMR: 231 });
    assert.equal(totals.knownOutstandingINR, 51_000);
    assert.deepEqual(totals.partiallyPaidInvoiceAmountByCurrency, { MYR: 4200 });
    assert.equal(totals.overdue30PlusCount, 2);
    assert.equal(totals.oldestDays, 45);
    assert.equal(totals.partiallyPaidCount, 1);
  });
});

describe("weekly unpaid-invoice reminder across countries", () => {
  const candidate = (over: Partial<InvoiceLineCandidate>): InvoiceLineCandidate => ({
    id: "x",
    projectId: "p",
    prNo: "PR-1",
    client: "C",
    projectTitle: "T",
    projectManager: null,
    invoiceNo: "N-1",
    invoiceDate: new Date("2026-09-01"),
    status: "Raised",
    invoiceAmountINR: 1000,
    currency: "INR",
    invoiceAmountOriginal: null,
    ...over,
  });
  const now = new Date("2026-11-18T06:00:00Z");

  test("every country's overdue invoice is in one report, each in its own currency; the same rules (30 days, status) apply to all", () => {
    const report = buildUnpaidInvoiceReport(
      [
        candidate({ id: "1", projectId: "in", prNo: "PR-IN", invoiceNo: "I-1", invoiceAmountINR: 50_000 }),
        candidate({ id: "2", projectId: "om", prNo: "EE-OM", invoiceNo: "O-1", invoiceAmountINR: 231, projectCurrency: "OMR", currency: "USD", invoiceAmountOriginal: 600 }),
        candidate({ id: "3", projectId: "my", prNo: "MY-1", invoiceNo: "M-1", invoiceAmountINR: 4200, projectCurrency: "MYR", currency: "MYR", invoiceAmountOriginal: 4200, status: "PartiallyPaid" }),
        candidate({ id: "4", projectId: "qa", prNo: "Q-1", invoiceNo: "Q-1", invoiceAmountINR: 100, projectCurrency: "QAR", invoiceDate: new Date("2026-11-10") }),
        candidate({ id: "5", projectId: "ad", prNo: "AD-1", invoiceNo: "A-1", invoiceAmountINR: 1200, projectCurrency: "AED", currency: "INR", invoiceAmountOriginal: 100_000 }),
      ],
      now,
      "Asia/Kolkata"
    );
    assert.equal(report.eligibleCount, 5);
    assert.deepEqual(report.overdue.map((r) => r.prNo).sort(), ["AD-1", "EE-OM", "MY-1", "PR-IN"], "the recent Qatar invoice is not overdue");
    const by = Object.fromEntries(report.overdue.map((r) => [r.prNo, r]));
    assert.equal(by["PR-IN"]!.currency, "INR");
    assert.equal(by["EE-OM"]!.currency, "OMR");
    assert.equal(by["EE-OM"]!.outstandingINR, 231);
    assert.equal(by["EE-OM"]!.originalAmountNote, "USD 600.00", "the invoice's own currency");
    assert.equal(by["MY-1"]!.outstandingINR, null, "Partially Paid: balance not recorded, same rule as India");
    assert.equal(by["MY-1"]!.originalAmountNote, null, "an invoice in the project's own currency has no second figure");
    assert.equal(by["AD-1"]!.originalAmountNote, "INR 100,000.00");
    assert.deepEqual(totalKnownOutstandingByCurrency(report.overdue), { INR: 50_000, OMR: 231, MYR: 0, AED: 1200 });
    assert.equal(totalKnownOutstanding(report.overdue), 50_000, "the rupee figure is the rupee part only");
  });

  test("an India-only report is exactly what it was: same rows, same single total, same email", () => {
    const report = buildUnpaidInvoiceReport([candidate({ id: "1", invoiceAmountINR: 50_000, currency: "USD", invoiceAmountOriginal: 600 }), candidate({ id: "2", projectId: "p2", prNo: "PR-2", invoiceNo: "N-2", invoiceAmountINR: 2500 })], now, "Asia/Kolkata");
    assert.deepEqual(report.overdue.map((r) => r.currency), ["INR", "INR"]);
    assert.equal(report.overdue[0]!.originalAmountNote, "USD 600.00");
    assert.equal(totalKnownOutstanding(report.overdue), 52_500);
    const rows: UnpaidInvoiceEmailRow[] = report.overdue.map((r) => ({ ...r, projectUrl: "http://x/y" }));
    const base = { subject: "s", generatedAt: "now", eligibleCount: 2, overdueDays: 30, knownOutstandingINR: 52_500, partiallyPaidCount: 0, rows };
    const withoutMap = buildUnpaidInvoicesEmail(base);
    const withInrMap = buildUnpaidInvoicesEmail({ ...base, knownOutstandingByCurrency: totalKnownOutstandingByCurrency(report.overdue) });
    assert.equal(withInrMap.html, withoutMap.html, "an INR-only map changes nothing");
    assert.equal(withInrMap.text, withoutMap.text);
    assert.ok(withoutMap.html.includes("₹ 52,500.00"));
    assert.ok(withoutMap.html.includes("Outstanding on fully unpaid (Raised / Submitted) invoices</td>") || withoutMap.html.includes("Outstanding on fully unpaid (Raised / Submitted) invoices<"), "one unlabelled total line");
    assert.ok(!/\(INR\)/.test(withoutMap.html));
  });

  test("with several countries the email has one line per currency, never one sum", () => {
    const rows: UnpaidInvoiceEmailRow[] = [
      { prNo: "PR-IN", client: "C", projectTitle: "T", projectManager: null, invoiceNo: "I-1", invoiceDate: "2026-09-01", daysSinceRaised: 78, currency: "INR", invoiceAmountINR: 50_000, amountPaidINR: 0, outstandingINR: 50_000, status: "Raised / Submitted", originalAmountNote: null, projectUrl: "u" },
      { prNo: "EE-OM", client: "C", projectTitle: "T", projectManager: null, invoiceNo: "O-1", invoiceDate: "2026-09-01", daysSinceRaised: 78, currency: "OMR", invoiceAmountINR: 231, amountPaidINR: 0, outstandingINR: 231, status: "Raised / Submitted", originalAmountNote: "USD 600.00", projectUrl: "u" },
    ];
    const email = buildUnpaidInvoicesEmail({ subject: "s", generatedAt: "now", eligibleCount: 2, overdueDays: 30, knownOutstandingINR: 50_000, knownOutstandingByCurrency: { INR: 50_000, OMR: 231 }, partiallyPaidCount: 0, rows });
    assert.ok(email.html.includes("(INR)") && email.html.includes("(OMR)"));
    assert.ok(email.html.includes("₹ 50,000.00") && email.html.includes("OMR 231.000"));
    assert.ok(email.text.includes("invoices (INR): ₹ 50,000.00") && email.text.includes("invoices (OMR): OMR 231.000"));
    assert.ok(!/50,231|50231/.test(email.html + email.text));
  });
});
