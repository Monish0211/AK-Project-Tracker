import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatInvoiceAmountForEmail } from "../../shared/email/templates/invoiceAmount.format.js";
import {
  invoiceRaisedFromLines,
  lineCashINR,
  lineInvoiceAmount,
  lineSettledINR,
  paymentReceivedFromLines,
  projectCommercialTotals,
  settledFromLines,
} from "../dashboard/dashboard.formulas.js";
import { isGstEligible } from "../invoiceGst/invoiceGst.rules.js";

/**
 * Multi-country invoice currency (Phase 5): the places that READ an invoice amount. A line of a project in another currency carries its money in that currency
 * (its INR-named columns are 0), so every reader has to take the project-currency figure - and an India / legacy line must read exactly as it always did.
 */
const regionalLine = (over: Record<string, unknown> = {}) => ({
  status: "Raised",
  invoiceAmountINR: 0,
  projectCurrency: "OMR",
  invoiceAmountProject: 231,
  recordedCashProject: undefined as number | undefined,
  settledProject: undefined as number | undefined,
  ...over,
});
const indiaLine = (over: Record<string, unknown> = {}) => ({ status: "Raised", invoiceAmountINR: 57_000, ...over });

describe("dashboard formulas read the project-currency amount for a regional line and the INR amount for every other line", () => {
  test("invoice raised", () => {
    assert.equal(lineInvoiceAmount(regionalLine()), 231);
    assert.equal(lineInvoiceAmount(indiaLine()), 57_000);
    assert.equal(lineInvoiceAmount({ invoiceAmountINR: 100, projectCurrency: "INR", invoiceAmountProject: null }), 100, "an explicit INR project is read as INR");
    assert.equal(invoiceRaisedFromLines([regionalLine(), regionalLine({ invoiceAmountProject: 69 }), regionalLine({ status: "Cancelled", invoiceAmountProject: 1000 })]), 300);
    assert.equal(invoiceRaisedFromLines([indiaLine(), indiaLine({ invoiceAmountINR: 43_000 }), indiaLine({ status: "Cancelled" })]), 100_000);
  });

  test("cash and settled use the recorded project-currency figures, else the Paid fallback in the project currency", () => {
    assert.equal(lineCashINR(regionalLine({ status: "PartiallyPaid", recordedCashProject: 115.5, settledProject: 115.5 })), 115.5);
    assert.equal(lineSettledINR(regionalLine({ status: "PartiallyPaid", recordedCashProject: 115.5, settledProject: 207.9 })), 207.9);
    assert.equal(lineCashINR(regionalLine({ status: "Paid" })), 231, "Paid with no payment record: its project-currency amount");
    assert.equal(lineCashINR(regionalLine({ status: "Raised" })), 0);
    assert.equal(lineCashINR(regionalLine({ status: "Cancelled", recordedCashProject: 50 })), 0);
    assert.equal(lineSettledINR(regionalLine({ status: "Paid" })), 231);
    // India: untouched by any project-currency field
    assert.equal(lineCashINR(indiaLine({ status: "Paid" })), 57_000);
    assert.equal(lineCashINR(indiaLine({ status: "PartiallyPaid", recordedCashINR: 1000 })), 1000);
    assert.equal(lineSettledINR(indiaLine({ status: "PartiallyPaid", settledINR: 1500 })), 1500);
  });

  test("a project's totals are in its own currency and capped at its work order value; an India project is unchanged", () => {
    const oman = [regionalLine({ status: "Paid", invoiceAmountProject: 600, recordedCashProject: 500, settledProject: 600 }), regionalLine({ invoiceAmountProject: 600 })];
    const totals = projectCommercialTotals(1000, oman);
    assert.deepEqual(totals, { totalInvoiceRaised: 1000, totalPaymentReceived: 500, totalSettled: 600 }, "raised 1200 is capped at the work order value of OMR 1000");
    assert.equal(paymentReceivedFromLines(oman), 500);
    assert.equal(settledFromLines(oman), 600);
    const india = projectCommercialTotals(100_000, [indiaLine({ status: "Paid" }), indiaLine()]);
    assert.deepEqual(india, { totalInvoiceRaised: 100_000, totalPaymentReceived: 57_000, totalSettled: 57_000 });
  });

  test("regional and India lines never share a total: each project is summed on its own", () => {
    const oman = projectCommercialTotals(1000, [regionalLine({ invoiceAmountProject: 231 })]);
    const india = projectCommercialTotals(1_000_000, [indiaLine()]);
    assert.equal(oman.totalInvoiceRaised, 231);
    assert.equal(india.totalInvoiceRaised, 57_000);
  });
});

describe("invoice emails write a regional amount in its own currency, never as rupees", () => {
  test("India / legacy: byte-identical to before", () => {
    assert.equal(formatInvoiceAmountForEmail({ invoiceAmountINR: 123456.5 }), "₹1,23,456.5");
    assert.equal(
      formatInvoiceAmountForEmail({ invoiceAmountINR: 57_000, invoiceCurrency: "USD", invoiceAmountOriginal: 600, exchangeRateToINR: 95 }),
      "USD 600.00 (INR equivalent ₹57,000 at 95)"
    );
  });

  test("a project in another country: own currency alone, or the invoice currency with its equivalent and the rate in the project currency", () => {
    assert.equal(formatInvoiceAmountForEmail({ invoiceAmountINR: 231, invoiceCurrency: "OMR", invoiceAmountOriginal: 231, exchangeRateToINR: 1, projectCurrency: "OMR" }), "OMR 231.000");
    assert.equal(
      formatInvoiceAmountForEmail({ invoiceAmountINR: 231, invoiceCurrency: "USD", invoiceAmountOriginal: 600, exchangeRateToINR: 0.385, projectCurrency: "OMR" }),
      "USD 600.00 (equivalent OMR 231.000 at 1 USD = OMR 0.385)"
    );
    assert.equal(
      formatInvoiceAmountForEmail({ invoiceAmountINR: 1200, invoiceCurrency: "INR", invoiceAmountOriginal: 100000, exchangeRateToINR: 0.012, projectCurrency: "AED" }),
      "INR 100,000.00 (equivalent AED 1,200.00 at 1 INR = AED 0.012)"
    );
    assert.equal(formatInvoiceAmountForEmail({ invoiceAmountINR: 4200, invoiceCurrency: "MYR", invoiceAmountOriginal: 4200, exchangeRateToINR: 1, projectCurrency: "MYR" }), "MYR 4,200.00");
    for (const text of [
      formatInvoiceAmountForEmail({ invoiceAmountINR: 3640, invoiceCurrency: "USD", invoiceAmountOriginal: 1000, exchangeRateToINR: 3.64, projectCurrency: "QAR" }),
      formatInvoiceAmountForEmail({ invoiceAmountINR: 3950, invoiceCurrency: "EUR", invoiceAmountOriginal: 1000, exchangeRateToINR: 3.95, projectCurrency: "QAR" }),
    ]) assert.ok(!text.includes("₹") && !/INR equivalent/.test(text), text);
  });
});

describe("Indian GST eligibility", () => {
  test("INR invoice on an India / legacy project: eligible; on a project in another currency: never", () => {
    assert.equal(isGstEligible({ invoiceCurrency: "INR" }), true);
    assert.equal(isGstEligible({ invoiceCurrency: "INR", projectCurrency: null }), true);
    assert.equal(isGstEligible({ invoiceCurrency: "INR", projectCurrency: "INR" }), true);
    assert.equal(isGstEligible({ invoiceCurrency: "INR", projectCurrency: "AED" }), false);
    assert.equal(isGstEligible({ invoiceCurrency: "USD", projectCurrency: "INR" }), false);
    assert.equal(isGstEligible({ invoiceCurrency: "OMR", projectCurrency: "OMR" }), false);
  });
});
