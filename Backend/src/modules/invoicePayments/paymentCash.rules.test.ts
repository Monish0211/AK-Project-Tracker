import assert from "node:assert/strict";
import { test } from "node:test";
import { figuresForInvoice } from "./paymentCash.rules.js";
import type { LineForFigures, RecordedPayment } from "./paymentCash.rules.js";
import { lineCashINR, lineSettledINR, paymentReceivedFromLines, projectCommercialTotals, settledFromLines } from "../dashboard/dashboard.formulas.js";

const dec = (value: string) => ({ toFixed: (places: number) => Number(value).toFixed(places) });
const payment = (bank: string, deductions: Array<[string, string]> = []): RecordedPayment => ({
  receipts: [{ amountReceived: dec(bank) }],
  adjustments: deductions.map(([category, amount]) => ({ category, amount: dec(amount) })),
});
const line = (id: string, inr: number, original: number | null = inr, currency = "INR", rate = 1): LineForFigures => ({
  id, status: "Raised", invoiceAmountINR: inr, invoiceAmountOriginal: original, currency, exchangeRateToINR: rate,
});

test("cash is the bank amount (70,000); settled is bank plus every deduction (100,000); deductions are never cash", () => {
  const f = figuresForInvoice([line("a", 100000)], [payment("70000", [["TDS", "10000"], ["SECURITY_DEPOSIT", "10000"], ["LD_AMOUNT", "10000"]])]);
  assert.deepEqual(f.get("a"), { recordedCashINR: 70000, settledINR: 100000 });
});

test("a part settlement records its cash and what it settles; the rest stays outstanding", () => {
  const f = figuresForInvoice([line("a", 100000)], [payment("70000", [["TDS", "10000"]])]);
  assert.deepEqual(f.get("a"), { recordedCashINR: 70000, settledINR: 80000 });
});

test("every deduction category reduces what is outstanding", () => {
  for (const category of ["TDS", "SECURITY_DEPOSIT", "ISD", "OTHER_DEDUCTIONS", "LD_AMOUNT", "BANK_CHARGES", "WITHHOLDING_TAXES", "FX_LOSS", "WAIVE_OFF"]) {
    assert.deepEqual(figuresForInvoice([line("a", 1000)], [payment("400", [[category, "100"]])]).get("a"), { recordedCashINR: 400, settledINR: 500 }, category);
  }
});

test("a row of the removed GST TDS category is ignored, never counted", () => {
  assert.deepEqual(figuresForInvoice([line("a", 1000)], [payment("400", [["GST_TDS", "100"]])]).get("a"), { recordedCashINR: 400, settledINR: 400 });
});

test("two payments add up; the invoice's figures are shared across its lines in proportion and sum exactly", () => {
  const f = figuresForInvoice([line("a", 60000), line("b", 40000)], [payment("20000"), payment("50000", [["TDS", "30000"]])]);
  assert.deepEqual(f.get("a"), { recordedCashINR: 42000, settledINR: 60000 });
  assert.deepEqual(f.get("b"), { recordedCashINR: 28000, settledINR: 40000 });
});

test("an uneven split never loses a paisa", () => {
  const f = figuresForInvoice([line("a", 33.33), line("b", 33.33), line("c", 33.34)], [payment("100")]);
  const cash = [...f.values()].reduce((s, x) => s + x.recordedCashINR, 0);
  assert.equal(Math.round(cash * 100) / 100, 100);
});

test("a foreign invoice: cash is converted at the invoice's OWN recorded rate, nothing else", () => {
  assert.deepEqual(figuresForInvoice([line("a", 540000, 6000, "USD", 90)], [payment("5000", [["TDS", "1000"]])]).get("a"), { recordedCashINR: 450000, settledINR: 540000 });
  assert.deepEqual(figuresForInvoice([line("o", 220027.5, 1000.125, "OMR", 220)], [payment("900.125", [["TDS", "100"]])]).get("o"), { recordedCashINR: 198027.5, settledINR: 220027.5 });
});

test("an invoice with no recorded payment has no figures (consumers keep the status-based figure)", () => {
  assert.equal(figuresForInvoice([line("a", 50000)], []).size, 0);
  assert.equal(figuresForInvoice([], [payment("1")]).size, 0);
});

// ── Dashboard formulas ──────────────────────────────────────────────────────────────────────────

test("legacy lines keep the long-standing rule: Paid counts its full amount, nothing else counts", () => {
  const lines = [
    { status: "Paid", invoiceAmountINR: 1000 },
    { status: "Raised", invoiceAmountINR: 500 },
    { status: "PartiallyPaid", invoiceAmountINR: 400 },
    { status: "Cancelled", invoiceAmountINR: 9999 },
  ];
  assert.equal(paymentReceivedFromLines(lines), 1000);
  assert.equal(settledFromLines(lines), 1000);
});

test("a line with a recorded payment uses its actual cash for Cash Realized and its settled amount for Outstanding", () => {
  const paid = { status: "Paid", invoiceAmountINR: 100000, recordedCashINR: 70000, settledINR: 100000 };
  assert.equal(lineCashINR(paid), 70000, "Paid with deductions is NOT the full invoice amount in cash");
  assert.equal(lineSettledINR(paid), 100000);
  const partial = { status: "PartiallyPaid", invoiceAmountINR: 100000, recordedCashINR: 70000, settledINR: 80000 };
  assert.equal(lineCashINR(partial), 70000);
  assert.equal(lineSettledINR(partial), 80000);
  assert.equal(lineCashINR({ status: "Cancelled", invoiceAmountINR: 5, recordedCashINR: 5, settledINR: 5 }), 0);
});

test("project totals: cash and settled are capped at what was raised", () => {
  const totals = projectCommercialTotals(1000000, [
    { status: "Paid", invoiceAmountINR: 100000, recordedCashINR: 70000, settledINR: 100000 },
    { status: "Raised", invoiceAmountINR: 30000 },
  ]);
  assert.deepEqual(totals, { totalInvoiceRaised: 130000, totalPaymentReceived: 70000, totalSettled: 100000 });
});
