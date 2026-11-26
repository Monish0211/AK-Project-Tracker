import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../shared/utils/AppError.js";
import { formatAmount } from "../../shared/email/templates/unpaidInvoices.template.js";
import { decimalPlacesFor, formatMoney, parseMoney } from "../invoicePayments/money.rules.js";
import { CURRENCY_MINOR_UNITS, INVOICE_CURRENCIES, isSupportedInvoiceCurrency, resolveCreateAmounts } from "../invoices/invoiceCurrency.rules.js";
import { CURRENCY_OPTIONS } from "../pdfImport/validators/enumOptions.js";
import { totalKnownOutstandingByCurrency, type OverdueInvoiceRow } from "../weeklyNotifications/unpaidInvoice.rules.js";
import { assertQuantityCurrency, computeQuantityAmounts } from "./quantityCurrency.rules.js";

/** KWD (Kuwaiti Dinar, Nov 2026): a Quantity / invoice currency with THREE decimals (fils), like OMR, priced into the project's currency by a manual rate. */

const refused = (fn: () => unknown, part: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof AppError && e.statusCode === 400 && part.test(e.message));

test("KWD is supported wherever the currency lists are shared, with 3 decimals; SAR and the others are unchanged", () => {
  assert.ok(isSupportedInvoiceCurrency("KWD"));
  assert.deepEqual([...CURRENCY_OPTIONS], [...INVOICE_CURRENCIES], "PDF import offers the same list");
  assert.equal(INVOICE_CURRENCIES.at(-1), "KWD");
  assert.equal(CURRENCY_MINOR_UNITS.KWD, 3);
  assert.deepEqual([CURRENCY_MINOR_UNITS.OMR, CURRENCY_MINOR_UNITS.SAR, CURRENCY_MINOR_UNITS.USD, CURRENCY_MINOR_UNITS.INR], [3, 2, 2, 2]);
});

test("invoice amounts: KWD keeps 3 decimals (the INR equivalent is derived), a 4th decimal is refused", () => {
  const ok = resolveCreateAmounts({ currency: "KWD", exchangeRateToINR: 270.5, invoiceAmountOriginal: 10.125 });
  assert.deepEqual([ok.currency, ok.invoiceAmountOriginal, ok.invoiceAmountINR], ["KWD", 10.125, Math.round(10.125 * 270.5 * 100) / 100]);
  refused(() => resolveCreateAmounts({ currency: "KWD", exchangeRateToINR: 270.5, invoiceAmountOriginal: 10.1255 }), /3 decimal/);
  refused(() => resolveCreateAmounts({ currency: "SAR", exchangeRateToINR: 22.2, invoiceAmountOriginal: 10.125 }), /2 decimal/);
});

test("payments: KWD amounts are exact in fils (no rounding to 2 decimals)", () => {
  assert.equal(decimalPlacesFor("KWD"), 3);
  assert.equal(parseMoney("12.345", "KWD"), 12345n);
  assert.equal(parseMoney("12.3456", "KWD"), null);
  assert.equal(parseMoney("12.345", "SAR"), null);
  assert.equal(formatMoney(12345n, "KWD"), "12.345");
  assert.equal(formatMoney(5n, "KWD"), "0.005");
});

test("a KWD line needs an exchange rate to the regional currency; 1 is refused; pricing converts at the entered rate", () => {
  for (const regional of ["INR", "AED", "OMR", "QAR", "MYR"]) {
    assert.doesNotThrow(() => assertQuantityCurrency("KWD", 11.95, regional), regional);
    refused(() => assertQuantityCurrency("KWD", 1, regional), /rate of exactly 1 is not accepted for KWD/);
    refused(() => assertQuantityCurrency("KWD", 0, regional), /Enter the exchange rate: 1 KWD = \? /);
  }
  const line = { woQty: 3, uom: "DAY", currency: "KWD", unitRate: 1000, exchangeRate: 11.95 };
  const aed = computeQuantityAmounts(line, "AED");
  assert.deepEqual([aed.exchangeRate, aed.unitRateRegional, aed.woValueRegional], [11.95, 11950, 35850]);
  const omrProject = computeQuantityAmounts({ ...line, exchangeRate: 1.25 }, "OMR");
  assert.equal(omrProject.woValueRegional, 3750, "an Oman project priced in KWD converts into OMR");
});

test("the weekly unpaid-invoice email writes KWD with 3 decimals and totals it to the fils (never to 2 decimals); SAR and USD keep 2", () => {
  assert.equal(formatAmount(1234.5, "KWD"), "KWD 1,234.500");
  assert.equal(formatAmount(1234.5, "OMR"), "OMR 1,234.500");
  assert.equal(formatAmount(1234.5, "SAR"), "SAR 1,234.50");
  assert.equal(formatAmount(1234.5, "USD"), "USD 1,234.50");
  const rows = [{ currency: "KWD", outstandingINR: 10.1234 }, { currency: "KWD", outstandingINR: 0.0004 }, { currency: "USD", outstandingINR: 10.1234 }, { currency: "INR", outstandingINR: 100.456 }] as unknown as OverdueInvoiceRow[];
  assert.deepEqual(totalKnownOutstandingByCurrency(rows), { KWD: 10.123, USD: 10.12, INR: 100.46 });
});
