import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../shared/utils/AppError.js";
import { assertQuantityCurrency, computeQuantityAmounts, effectiveRegionalCurrency, usesRegionalRules } from "./quantityCurrency.rules.js";

/**
 * Global Multi-Country Phase 3 — the pure pricing rules. The rate is REGIONAL currency per ONE unit of the TRANSACTION currency
 * ("1 USD = 4.50 MYR" is stored as 4.5 on a Malaysia project).
 */

const line = (over: Partial<{ woQty: number; uom: string; currency: string; unitRate: number; exchangeRate: number }> = {}) => ({
  woQty: 1,
  uom: "DAY",
  currency: "USD",
  unitRate: 9600,
  exchangeRate: 1,
  ...over,
});

/** The original (pre-Phase 3) formula, copied verbatim, to prove a legacy or India project is byte-for-byte unchanged. */
function originalFormula(f: { woQty: number; uom: string; currency: string; unitRate: number; exchangeRate: number }) {
  const lump = f.uom.trim().toUpperCase() === "LUMP SUM";
  const unitRateINR = f.currency === "INR" ? f.unitRate : f.unitRate * f.exchangeRate;
  return { unitRateINR, woValue: lump ? unitRateINR : f.woQty * unitRateINR };
}

test("India: USD 9,600 at 1 USD = 95 INR is INR 9,12,000", () => {
  const r = computeQuantityAmounts(line({ exchangeRate: 95 }), "INR");
  assert.equal(r.woValue, 912000);
  assert.equal(r.unitRateINR, 912000);
  assert.equal(r.woValueRegional, 912000);
  assert.equal(r.exchangeRate, 95);
});

test("Malaysia: USD 9,600 at 1 USD = 4.50 MYR is MYR 43,200, and the INR columns stay 0", () => {
  const r = computeQuantityAmounts(line({ exchangeRate: 4.5 }), "MYR");
  assert.equal(r.woValueRegional, 43200);
  assert.equal(r.unitRateRegional, 43200);
  assert.equal(r.unitRateINR, 0, "an MYR amount is never written to an INR-named column");
  assert.equal(r.woValue, 0);
});

test("Oman with a 3-decimal currency: USD 9,600 at 1 USD = 0.385 OMR is OMR 3,696 with no floating-point noise", () => {
  const r = computeQuantityAmounts(line({ exchangeRate: 0.385 }), "OMR");
  assert.equal(r.woValueRegional, 3696);
});

test("quantity multiplies the converted unit rate; LUMP SUM ignores the quantity", () => {
  assert.equal(computeQuantityAmounts(line({ woQty: 3, exchangeRate: 4.5, unitRate: 100 }), "MYR").woValueRegional, 1350);
  assert.equal(computeQuantityAmounts(line({ woQty: 3, exchangeRate: 4.5, unitRate: 100, uom: "LUMP SUM" }), "MYR").woValueRegional, 450);
});

test("the regional currency itself is always rate 1, whatever rate was sent (a stale or typed rate cannot leak in)", () => {
  const r = computeQuantityAmounts(line({ currency: "OMR", unitRate: 500, exchangeRate: 83 }), "OMR");
  assert.equal(r.exchangeRate, 1);
  assert.equal(r.unitRateRegional, 500);
  assert.equal(r.woValueRegional, 500);
  const india = computeQuantityAmounts(line({ currency: "INR", unitRate: 500, exchangeRate: 83 }), "INR");
  assert.equal(india.exchangeRate, 1);
  assert.equal(india.woValue, 500);
});

test("each country's regional currency, with a different transaction currency, converts at the entered rate", () => {
  const cases: [string, string, number][] = [
    ["MYR", "USD", 4.5],
    ["OMR", "USD", 0.385],
    ["AED", "USD", 3.67],
    ["QAR", "USD", 3.64],
    ["OMR", "QAR", 0.1056],
  ];
  for (const [regional, txn, rate] of cases) {
    const r = computeQuantityAmounts(line({ currency: txn, exchangeRate: rate, unitRate: 1000, woQty: 2 }), regional);
    assert.equal(r.woValueRegional, Math.round(2 * 1000 * rate * 1e6) / 1e6, `${txn} -> ${regional}`);
    assert.equal(r.woValue, 0);
  }
});

test("a LEGACY project (no stored regional currency) and an INR-region project reproduce the original formula byte for byte", () => {
  const samples = [
    line({ currency: "INR", unitRate: 1234.5, woQty: 7, exchangeRate: 1 }),
    line({ currency: "USD", unitRate: 9600, woQty: 1, exchangeRate: 83.25 }),
    line({ currency: "EUR", unitRate: 33.333, woQty: 3, exchangeRate: 91.7, uom: "MAN-DAY" }),
    line({ currency: "AED", unitRate: 100, woQty: 10, exchangeRate: 22.6, uom: "LUMP SUM" }),
    line({ currency: "INR", unitRate: 33.333, woQty: 3, exchangeRate: 1 }),
  ];
  for (const s of samples) {
    const expected = originalFormula(s);
    for (const stored of [null, undefined, "", "INR"]) {
      const r = computeQuantityAmounts(s, stored);
      assert.equal(r.unitRateINR, expected.unitRateINR, `unitRateINR ${JSON.stringify(s)} stored=${String(stored)}`);
      assert.equal(r.woValue, expected.woValue, `woValue ${JSON.stringify(s)} stored=${String(stored)}`);
      assert.equal(r.woValueRegional, expected.woValue, "the regional value of an India or legacy project is its INR value");
    }
  }
});

test("a legacy project keeps whatever rate it was given (not forced), exactly as before", () => {
  assert.equal(computeQuantityAmounts(line({ currency: "USD", exchangeRate: 1 }), null).exchangeRate, 1);
  assert.equal(computeQuantityAmounts(line({ currency: "INR", exchangeRate: 83 }), null).exchangeRate, 83);
});

test("effectiveRegionalCurrency and usesRegionalRules: a missing value is a legacy INR project", () => {
  assert.equal(effectiveRegionalCurrency(null), "INR");
  assert.equal(effectiveRegionalCurrency(""), "INR");
  assert.equal(effectiveRegionalCurrency("OMR"), "OMR");
  assert.equal(usesRegionalRules(null), false);
  assert.equal(usesRegionalRules("INR"), true, "an India project created under Phase 3 is not 'legacy'");
});

test("validation: a different transaction currency needs a manually entered rate greater than 0", () => {
  const bad = (rate: number) => () => assertQuantityCurrency("USD", rate, "OMR");
  for (const rate of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(bad(rate), (e: unknown) => e instanceof AppError && e.statusCode === 400 && /1 USD = \? OMR/.test(e.message), `rate ${rate}`);
  }
  assert.doesNotThrow(() => assertQuantityCurrency("USD", 0.385, "OMR"));
});

test("validation: a rate of exactly 1 between two different currencies is refused (an untouched default would silently price the line as equal currencies)", () => {
  assert.throws(() => assertQuantityCurrency("USD", 1, "OMR"), (e: unknown) => e instanceof AppError && e.statusCode === 400 && /exactly 1/.test(e.message));
  assert.throws(() => assertQuantityCurrency("INR", 1, "MYR"), (e: unknown) => e instanceof AppError && e.statusCode === 400, "the import template's INR at rate 1 on a Malaysia project");
  assert.doesNotThrow(() => assertQuantityCurrency("USD", 1, null), "a legacy project keeps accepting it, as before");
  assert.doesNotThrow(() => assertQuantityCurrency("OMR", 1, "OMR"), "the regional currency itself is rate 1");
});

test("validation: the regional currency needs no rate, an unsupported currency is refused, and a legacy project is not validated more strictly", () => {
  assert.doesNotThrow(() => assertQuantityCurrency("OMR", 0, "OMR"), "rate is irrelevant (forced to 1)");
  assert.throws(() => assertQuantityCurrency("XYZ", 1, "OMR"), (e: unknown) => e instanceof AppError && e.statusCode === 400);
  assert.doesNotThrow(() => assertQuantityCurrency("XYZ", 0, null), "legacy behaviour is unchanged");
  assert.doesNotThrow(() => assertQuantityCurrency("USD", 1, null), "legacy USD at rate 1 is still accepted");
});
