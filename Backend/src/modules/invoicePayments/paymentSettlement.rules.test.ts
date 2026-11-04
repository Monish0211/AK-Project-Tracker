import assert from "node:assert/strict";
import { test } from "node:test";
import { floatToMinor, formatMoney, parseMoney, sumMinor } from "./money.rules.js";
import { computeSettlement, DEDUCTION_CATEGORIES, isDeductionCategory, statusJustifiedBySettlement } from "./paymentSettlement.rules.js";
import type { DeductionCategory, SettlementAdjustment } from "./paymentSettlement.rules.js";
import type { InvoiceCurrency } from "../invoices/invoiceCurrency.rules.js";

const m = (value: string, currency: InvoiceCurrency = "INR"): bigint => {
  const parsed = parseMoney(value, currency);
  assert.notEqual(parsed, null, `${value} ${currency} must parse`);
  return parsed!;
};

function settle(due: string, bank: string[], deductions: Array<[DeductionCategory, string]> = [], currency: InvoiceCurrency = "INR") {
  return computeSettlement({
    currency,
    dueMinor: m(due, currency),
    receipts: bank.map((amount) => ({ amountMinor: m(amount, currency) })),
    adjustments: deductions.map(([category, amount]): SettlementAdjustment => ({ category, amountMinor: m(amount, currency) })),
  });
}

// ── Money ─────────────────────────────────────────────────────────────────────────────────────────

test("money: INR / USD / AED take 2 decimals, OMR takes 3 — nothing is rounded", () => {
  assert.equal(parseMoney("125.50", "INR"), 12550n);
  assert.equal(parseMoney("125.50", "USD"), 12550n);
  assert.equal(parseMoney("125.50", "AED"), 12550n);
  assert.equal(parseMoney("125.125", "OMR"), 125125n);
  assert.equal(parseMoney("125.125", "INR"), null);
  assert.equal(parseMoney("125.125", "USD"), null);
  assert.equal(parseMoney("125.125", "AED"), null);
  assert.equal(parseMoney("125.1255", "OMR"), null);
});

test("money: strict parsing and exact formatting", () => {
  for (const bad of ["", " ", "-1", "+1", "1e3", "1,000", "1.", ".5", "abc", "12 34", "1234567890123", "0x10"]) assert.equal(parseMoney(bad, "INR"), null, JSON.stringify(bad));
  assert.equal(formatMoney(12550n, "INR"), "125.50");
  assert.equal(formatMoney(125125n, "OMR"), "125.125");
  assert.equal(formatMoney(1n, "OMR"), "0.001");
  assert.equal(floatToMinor(0.1 + 0.2, "INR"), 30n);
  assert.equal(sumMinor([m("0.10"), m("0.20")]), m("0.30"), "the classic float trap is exact as minor units");
});

// ── The rule: Total Settled = bank + deductions ─────────────────────────────────────────────────

test("nothing recorded -> NONE, status unchanged (Raised / Submitted), everything outstanding", () => {
  const r = settle("100000", []);
  assert.equal(r.outcome, "NONE");
  assert.equal(r.settledMinor, 0n);
  assert.equal(r.outstandingMinor, m("100000"));
  assert.equal(statusJustifiedBySettlement(r), null);
});

test("example 1: invoice 1,00,000, bank 70,000 + TDS 10,000 + Security Deposit 10,000 + LD 10,000 = 1,00,000 -> Paid", () => {
  const r = settle("100000", ["70000"], [["TDS", "10000"], ["SECURITY_DEPOSIT", "10000"], ["LD_AMOUNT", "10000"]]);
  assert.equal(r.outcome, "SETTLED");
  assert.equal(r.settled, true);
  assert.equal(r.settledMinor, m("100000"));
  assert.equal(r.cashMinor, m("70000"), "bank cash stays separate from the deductions");
  assert.equal(r.deductionsMinor, m("30000"));
  assert.equal(r.outstandingMinor, 0n);
  assert.equal(statusJustifiedBySettlement(r), "Paid");
});

test("example 2: bank 70,000 + deductions 10,000 = 80,000 -> Partially Paid, outstanding 20,000", () => {
  const r = settle("100000", ["70000"], [["TDS", "10000"]]);
  assert.equal(r.outcome, "PARTIAL");
  assert.equal(r.settled, false);
  assert.equal(r.settledMinor, m("80000"));
  assert.equal(r.outstandingMinor, m("20000"));
  assert.equal(statusJustifiedBySettlement(r), "PartiallyPaid");
});

test("bank only, less than the invoice amount -> Partially Paid", () => {
  const r = settle("100000", ["30000"]);
  assert.equal(statusJustifiedBySettlement(r), "PartiallyPaid");
  assert.equal(r.outstandingMinor, m("70000"));
});

test("a deduction alone (no bank amount) also counts toward Total Settled", () => {
  const r = settle("100000", [], [["WAIVE_OFF", "100000"]]);
  assert.equal(r.outcome, "SETTLED");
  assert.equal(r.cashMinor, 0n);
});

test("total settled above the invoice amount is rejected, never Paid and never Partially Paid", () => {
  for (const [bank, deductions] of [["100000.01", []], ["70000", [["TDS", "30000.01"]]], ["60000", [["TDS", "30000"], ["LD_AMOUNT", "10001"]]]] as Array<[string, Array<[DeductionCategory, string]>]>) {
    const r = settle("100000", [bank], deductions);
    assert.equal(r.outcome, "INVALID");
    assert.equal(r.settled, false);
    assert.equal(r.violations[0]?.code, "OVER_SETTLED");
    assert.equal(statusJustifiedBySettlement(r), null);
  }
});

test("the over-settlement message names the actual amounts and the currency", () => {
  const r = settle("1000", ["40000"], [["TDS", "50000"]], "USD");
  assert.equal(r.violations[0]!.message, "Bank amount USD 40000.00 + deductions USD 50000.00 = USD 90000.00, which exceeds the invoice amount of USD 1000.00 by USD 89000.00.");
  const omr = settle("1000.125", ["1000.125"], [["TDS", "0.001"]], "OMR");
  assert.match(omr.violations[0]!.message, /exceeds the invoice amount of OMR 1000\.125 by OMR 0\.001/);
});

test("payments add up across receipts: earlier plus new", () => {
  const first = settle("100000", ["20000"], [["TDS", "5000"]]);
  assert.equal(first.outcome, "PARTIAL");
  const both = settle("100000", ["20000", "50000"], [["TDS", "5000"], ["SECURITY_DEPOSIT", "25000"]]);
  assert.equal(both.outcome, "SETTLED");
  assert.equal(both.cashMinor, m("70000"));
  const tooMuch = settle("100000", ["20000", "50000", "0.01"], [["TDS", "5000"], ["SECURITY_DEPOSIT", "25000"]]);
  assert.equal(tooMuch.outcome, "INVALID");
});

test("removing a payment from the active set (a reversal) takes settlement back down", () => {
  assert.equal(settle("100000", ["70000", "10000"], [["TDS", "20000"]]).outcome, "SETTLED");
  assert.equal(settle("100000", ["70000"], []).outcome, "PARTIAL");
  assert.equal(settle("100000", [], []).outcome, "NONE");
});

// ── Deduction categories ──────────────────────────────────────────────────────────────────────────

test("the workflow has exactly nine deduction categories, and no GST category exists", () => {
  assert.deepEqual([...DEDUCTION_CATEGORIES], ["TDS", "SECURITY_DEPOSIT", "ISD", "OTHER_DEDUCTIONS", "LD_AMOUNT", "BANK_CHARGES", "WITHHOLDING_TAXES", "FX_LOSS", "WAIVE_OFF"]);
  assert.equal(isDeductionCategory("GST_TDS"), false);
  assert.equal(isDeductionCategory("GST"), false);
});

test("EVERY category counts toward Total Settled and reduces the outstanding balance, each on its own", () => {
  for (const category of DEDUCTION_CATEGORIES) {
    const r = settle("1000", ["900"], [[category, "100"]]);
    assert.equal(r.settled, true, `${category} settles the remaining 100`);
    assert.equal(r.deductionsMinor, m("100"), category);
    assert.equal(r.cashMinor, m("900"), `${category} is never counted as cash`);
    assert.deepEqual(r.deductionsByCategory, [{ category, amountMinor: m("100") }]);
  }
});

test("all nine together are summed, and two entries of one category add up", () => {
  const all = settle("900", [], DEDUCTION_CATEGORIES.map((c) => [c, "100"] as [DeductionCategory, string]));
  assert.equal(all.settled, true);
  assert.equal(all.deductionsByCategory.length, 9);
  const two = settle("100", ["50"], [["TDS", "20"], ["TDS", "30"]]);
  assert.deepEqual(two.deductionsByCategory, [{ category: "TDS", amountMinor: m("50") }]);
  assert.equal(two.settled, true);
});

// ── Currency ──────────────────────────────────────────────────────────────────────────────────────

test("USD: invoice 6,000, bank 5,000 + TDS 1,000 -> Paid, in USD only", () => {
  const r = settle("6000", ["5000"], [["TDS", "1000"]], "USD");
  assert.equal(r.settled, true);
  assert.equal(formatMoney(r.cashMinor, "USD"), "5000.00");
});

test("AED keeps two decimals; OMR keeps three — one baisa short is Partially Paid, one baisa over is rejected", () => {
  assert.equal(settle("1234.56", ["1111.10"], [["TDS", "123.46"]], "AED").settled, true);
  const short = settle("1000.125", ["900.124"], [["TDS", "100"]], "OMR");
  assert.equal(short.outcome, "PARTIAL");
  assert.equal(formatMoney(short.outstandingMinor, "OMR"), "0.001");
  assert.equal(settle("1000.125", ["900.125"], [["TDS", "100"]], "OMR").settled, true);
  assert.equal(settle("1000.125", ["900.126"], [["TDS", "100"]], "OMR").outcome, "INVALID");
});

test("an invoice amount of zero can never be 'settled'", () => {
  assert.equal(computeSettlement({ currency: "USD", dueMinor: 0n, receipts: [], adjustments: [] }).settled, false);
});
