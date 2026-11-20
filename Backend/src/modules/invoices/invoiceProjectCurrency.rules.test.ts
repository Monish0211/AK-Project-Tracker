import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amountToMinor,
  assertWithinProjectCeiling,
  convertMinor,
  minorToText,
  parseExchangeRate,
  resolveProjectCurrencyCreateAmounts,
  resolveProjectCurrencyUpdateAmounts,
} from "./invoiceProjectCurrency.rules.js";

/**
 * Multi-country invoice currency, pure rules. Rate convention: 1 unit of INVOICE currency = X units of PROJECT currency. Every rate below is a clearly synthetic
 * test value, not an approved exchange rate.
 */

test("the seven required examples: project currency, invoice currency, test rate, converted amount", () => {
  const cases: Array<{ label: string; project: string; invoice: string; rate: string; amount: number; expected: string }> = [
    { label: "India (legacy rules, shown for the same convention only)", project: "INR", invoice: "USD", rate: "95", amount: 600, expected: "57000.00" },
    { label: "Oman, USD invoice", project: "OMR", invoice: "USD", rate: "0.385", amount: 600, expected: "231.000" },
    { label: "Malaysia, USD invoice", project: "MYR", invoice: "USD", rate: "4.20", amount: 1000, expected: "4200.00" },
    { label: "Abu Dhabi, INR invoice", project: "AED", invoice: "INR", rate: "0.012", amount: 100000, expected: "1200.00" },
    { label: "FZE, USD invoice", project: "AED", invoice: "USD", rate: "3.67", amount: 1000, expected: "3670.00" },
    { label: "Elixir Qatar, USD invoice", project: "QAR", invoice: "USD", rate: "3.64", amount: 1000, expected: "3640.00" },
    { label: "Qatar, EUR invoice", project: "QAR", invoice: "EUR", rate: "3.95", amount: 1000, expected: "3950.00" },
  ];
  for (const c of cases) {
    if (c.project === "INR") continue; // India keeps its original rules in invoiceCurrency.rules.ts
    const r = resolveProjectCurrencyCreateAmounts(c.project, { currency: c.invoice, exchangeRateToProject: c.rate, invoiceAmountOriginal: c.amount });
    assert.equal(r.invoiceAmountProject, c.expected, c.label);
    assert.equal(r.currency, c.invoice);
    assert.equal(r.projectCurrency, c.project);
    assert.equal(r.invoiceAmountOriginal, c.amount, `${c.label}: the original amount is preserved untouched`);
  }
});

test("Rule 1 and 2: no currency means the project's own; the same currency needs no rate and is not converted", () => {
  for (const [project, amount] of [["MYR", 500.5], ["OMR", 500], ["AED", 1250.25], ["QAR", 99.99]] as const) {
    const r = resolveProjectCurrencyCreateAmounts(project, { invoiceAmountOriginal: amount });
    assert.equal(r.currency, project, `${project}: defaults to the project currency`);
    assert.equal(r.exchangeRateToProject, "1");
    assert.equal(r.invoiceAmountProjectNumber, amount, `${project}: the project amount equals the invoice amount`);
  }
  assert.equal(resolveProjectCurrencyCreateAmounts("OMR", { invoiceAmountOriginal: 500 }).invoiceAmountProject, "500.000", "OMR keeps three decimals");
  // An explicit rate of exactly 1 is accepted for the same currency; any other rate is refused, so a stale rate can never be used.
  assert.equal(resolveProjectCurrencyCreateAmounts("OMR", { currency: "OMR", exchangeRateToProject: 1, invoiceAmountOriginal: 10 }).exchangeRateToProject, "1");
  assert.equal(resolveProjectCurrencyCreateAmounts("OMR", { currency: "OMR", exchangeRateToProject: "1.000", invoiceAmountOriginal: 10 }).exchangeRateToProject, "1");
  assert.throws(() => resolveProjectCurrencyCreateAmounts("OMR", { currency: "OMR", exchangeRateToProject: 0.385, invoiceAmountOriginal: 10 }), /uses an exchange rate of 1/);
});

test("Rule 3: a different currency requires the user's rate, with the direction in the message", () => {
  assert.throws(() => resolveProjectCurrencyCreateAmounts("OMR", { currency: "USD", invoiceAmountOriginal: 600 }), /1 USD = \? OMR/);
  assert.throws(() => resolveProjectCurrencyCreateAmounts("MYR", { currency: "EUR", exchangeRateToProject: "", invoiceAmountOriginal: 600 }), /1 EUR = \? MYR/);
  assert.throws(() => resolveProjectCurrencyCreateAmounts("AED", { currency: "INR", invoiceAmountOriginal: 600 }), /1 INR = \? AED/);
  assert.throws(() => resolveProjectCurrencyCreateAmounts("OMR", { currency: "GBP", exchangeRateToProject: 0.5, invoiceAmountOriginal: 600 }), /Unsupported invoice currency/);
  assert.throws(() => resolveProjectCurrencyCreateAmounts("OMR", { currency: "USD", exchangeRateToProject: 0.385 }), /invoice amount is required/);
});

test("Rule 5: rate parsing is exact and never rounds; invalid rates are refused", () => {
  assert.deepEqual(parseExchangeRate("0.385"), { scaled: 38_500_000n, text: "0.385" });
  assert.deepEqual(parseExchangeRate(4.2), { scaled: 420_000_000n, text: "4.2" });
  assert.deepEqual(parseExchangeRate(".5"), { scaled: 50_000_000n, text: "0.5" });
  assert.deepEqual(parseExchangeRate("3.67000"), { scaled: 367_000_000n, text: "3.67" });
  assert.deepEqual(parseExchangeRate("0.00000001"), { scaled: 1n, text: "0.00000001" }, "the smallest representable rate");
  assert.equal(parseExchangeRate(0.0000001).text, "0.0000001", "a number that JavaScript would print with an exponent still survives");
  for (const bad of [0, "0", "0.000000001", -1, "-2", "abc", "1e3", "", NaN, Infinity, "1,5", null, undefined]) {
    assert.throws(() => parseExchangeRate(bad), (e: Error) => /exchange rate/.test(e.message), `refused: ${String(bad)}`);
  }
  assert.throws(() => parseExchangeRate("0.123456789"), /at most 8 decimal places/);
});

test("precision: OMR three decimals, the others two; extra decimals are refused, not rounded; float noise is not mistaken for a decimal", () => {
  assert.equal(amountToMinor(500.123, "OMR"), 500_123n);
  assert.throws(() => amountToMinor(500.1234, "OMR"), /at most 3 decimal places/);
  assert.equal(amountToMinor(100.5, "USD"), 10_050n);
  assert.throws(() => amountToMinor(100.005, "USD"), /at most 2 decimal places/);
  assert.equal(amountToMinor(4.35, "AED"), 435n, "4.35 * 100 is 434.99999999999994 in floating point");
  assert.equal(amountToMinor(1.1, "QAR") + amountToMinor(2.2, "QAR"), 330n, "0.1 + 0.2 style noise never reaches the amounts");
  assert.throws(() => amountToMinor(-1, "OMR"), /not negative/);
  assert.throws(() => amountToMinor(Number.NaN, "OMR"), /not negative/);
  assert.throws(() => amountToMinor(1e15, "AED"), /too large/);
});

test("conversion is exact integer maths with one half-up rounding to the PROJECT currency's decimals", () => {
  const rate = (text: string) => parseExchangeRate(text);
  // USD 0.01 at 0.385 OMR = 0.00385 -> rounds half-up to OMR 0.004
  assert.equal(minorToText(convertMinor(1n, "USD", "OMR", rate("0.385")), "OMR"), "0.004");
  // USD 4.35 at 3.67 AED = 15.9645 -> AED 15.96
  assert.equal(minorToText(convertMinor(435n, "USD", "AED", rate("3.67")), "AED"), "15.96");
  // exactly half: USD 0.50 at 0.01 AED = 0.005 -> AED 0.01 (half-up)
  assert.equal(minorToText(convertMinor(50n, "USD", "AED", rate("0.01")), "AED"), "0.01");
  // a high-precision rate keeps all its digits: INR 1,000,000.00 at 0.01234567 AED = 12,345.67 AED
  assert.equal(minorToText(convertMinor(100_000_000n, "INR", "AED", rate("0.01234567")), "AED"), "12345.67");
  // the project currency's decimals decide the result, not the invoice currency's: OMR invoice to MYR and back-to-3-decimals
  assert.equal(minorToText(convertMinor(1_000n, "OMR", "MYR", rate("11.0325")), "MYR"), "11.03");
  assert.equal(minorToText(convertMinor(100n, "MYR", "OMR", rate("0.0909")), "OMR"), "0.091");
});

test("the update path: currency and rate are frozen, a re-send of the stored values is accepted, an amount edit uses the STORED rate", () => {
  const stored = { currency: "USD", projectCurrency: "OMR", exchangeRateToProject: "0.385", invoiceAmountOriginal: 600, invoiceAmountProject: "231.000" };
  assert.deepEqual(resolveProjectCurrencyUpdateAmounts(stored, { currency: "USD", exchangeRateToProject: 0.385 }), {}, "a status-only PATCH re-sends everything");
  assert.deepEqual(resolveProjectCurrencyUpdateAmounts(stored, { exchangeRateToProject: "0.3850" }), {}, "the same rate typed differently");
  assert.throws(() => resolveProjectCurrencyUpdateAmounts(stored, { currency: "EUR" }), /currency cannot be changed/);
  assert.throws(() => resolveProjectCurrencyUpdateAmounts(stored, { exchangeRateToProject: 0.39 }), /exchange rate cannot be changed/);
  const edited = resolveProjectCurrencyUpdateAmounts(stored, { invoiceAmountOriginal: 700, exchangeRateToProject: 0.385 });
  assert.equal(edited.invoiceAmountProject, "269.500", "700 x the stored 0.385");
  assert.equal(edited.invoiceAmountOriginal, 700);
  assert.throws(() => resolveProjectCurrencyUpdateAmounts(stored, { invoiceAmountOriginal: 700.0001 }), /at most 2 decimal places/);
  // a same-currency line is never converted
  const same = { currency: "OMR", projectCurrency: "OMR", exchangeRateToProject: "1", invoiceAmountOriginal: 500, invoiceAmountProject: "500.000" };
  assert.equal(resolveProjectCurrencyUpdateAmounts(same, { invoiceAmountOriginal: 612.345 }).invoiceAmountProject, "612.345");
});

test("the Work Order ceiling compares project-currency amounts only", () => {
  const base = { projectCurrency: "OMR" as const, workOrderValueMinor: 1_000_000n };
  assert.doesNotThrow(() => assertWithinProjectCeiling({ ...base, alreadyInvoicedMinor: 400_000n, incomingMinor: 600_000n }), "exactly the Work Order Value is allowed");
  assert.throws(
    () => assertWithinProjectCeiling({ ...base, alreadyInvoicedMinor: 400_000n, incomingMinor: 600_001n }),
    /would be invoiced OMR 1000\.001, exceeding its Work Order Value of OMR 1000\.000\. Already invoiced: OMR 400\.000/
  );
  // USD 3,000 at 0.385 is OMR 1,155: over an OMR 1,000 Work Order Value, although the number 3,000 is nowhere near comparable with 1,000 as it stands
  const usd = resolveProjectCurrencyCreateAmounts("OMR", { currency: "USD", exchangeRateToProject: 0.385, invoiceAmountOriginal: 3000 });
  assert.throws(() => assertWithinProjectCeiling({ ...base, alreadyInvoicedMinor: 0n, incomingMinor: usd.invoiceAmountProjectMinor }), /exceeding its Work Order Value/);
  const ok = resolveProjectCurrencyCreateAmounts("OMR", { currency: "USD", exchangeRateToProject: 0.385, invoiceAmountOriginal: 2597 }); // OMR 999.845
  assert.doesNotThrow(() => assertWithinProjectCeiling({ ...base, alreadyInvoicedMinor: 0n, incomingMinor: ok.invoiceAmountProjectMinor }));
});

test("the project-currency line amounts: quantity-driven lines compare with qty x unit rate x milestone %, other lines have no adjustment", async () => {
  const { computeProjectLineAmounts } = await import("./invoiceProjectCurrency.rules.js");
  // 10 hours at OMR 19.250 on a 100% milestone = OMR 192.500; invoiced OMR 200.000 -> adjustment +7.500
  const driven = computeProjectLineAmounts({ quantityBilled: 10, unitRate: 19.25, milestonePercent: 100, invoiceAmountProjectMinor: 200_000n, projectCurrency: "OMR" });
  assert.deepEqual(driven, { unitPriceProject: "19.250000", calculatedAmountProject: "192.500", commercialAdjustmentProject: "7.500" });
  // a 40% milestone of 3 units at AED 100.00: 3 x 100 x 0.40 = AED 120.00; invoiced AED 100.00 -> adjustment -20.00
  const milestone = computeProjectLineAmounts({ quantityBilled: 3, unitRate: 100, milestonePercent: 40, invoiceAmountProjectMinor: 10_000n, projectCurrency: "AED" });
  assert.equal(milestone.calculatedAmountProject, "120.00");
  assert.equal(milestone.commercialAdjustmentProject, "-20.00");
  // a flat line (quantityBilled 0): the invoice amount is the system amount, adjustment 0
  const flat = computeProjectLineAmounts({ quantityBilled: 0, unitRate: 55, milestonePercent: 100, invoiceAmountProjectMinor: 123_456n, projectCurrency: "QAR" });
  assert.deepEqual(flat, { unitPriceProject: "55.000000", calculatedAmountProject: "1234.56", commercialAdjustmentProject: "0.00" });
  // half-up rounding at the project currency's decimals: 1.5 x MYR 0.33 = 0.495 -> 0.50
  assert.equal(computeProjectLineAmounts({ quantityBilled: 1.5, unitRate: 0.33, milestonePercent: 100, invoiceAmountProjectMinor: 50n, projectCurrency: "MYR" }).calculatedAmountProject, "0.50");
});
