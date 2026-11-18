import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../shared/utils/AppError.js";
import {
  COSTING_STATUS,
  FX_RATE_SCOPE,
  convertInrToRegional,
  decideRegionalSnapshot,
  minorUnitsFor,
  needsCountryApply,
  parseInrPerRegionalUnit,
  requiresManhourRate,
  snapshotWithRate,
} from "./manhourCurrency.rules.js";

/**
 * Phase 4 - the pure manpower conversion rules. The rates below are TEST FIXTURES chosen only to exercise the arithmetic (243.156 is the example
 * from the business brief); the product never defaults, fetches or invents a rate.
 */

const refuses = (fn: () => unknown, pattern: RegExp) => assert.throws(fn, (err) => err instanceof AppError && pattern.test(err.message));

describe("conversion rate validation: 1 regional currency unit = X INR", () => {
  test("accepts a positive rate given as a number or a numeric string, up to 6 decimals", () => {
    assert.equal(parseInrPerRegionalUnit(243.156).toFixed(6), "243.156000");
    assert.equal(parseInrPerRegionalUnit("243.156").toFixed(6), "243.156000");
    assert.equal(parseInrPerRegionalUnit(" 24.123456 ").toFixed(6), "24.123456");
    assert.equal(parseInrPerRegionalUnit(0.5).toFixed(6), "0.500000");
  });

  test("rejects zero, negative, non-numeric, NaN and Infinity", () => {
    for (const bad of [0, -3, "0", "-1", "abc", "", "  ", NaN, Infinity, null, undefined, "1e3", "12,5"]) {
      assert.throws(() => parseInrPerRegionalUnit(bad), AppError, `rejects ${String(bad)}`);
    }
  });

  test("rejects more than 6 decimals, an implausibly large value, and exactly 1 (never a real rate, only an untouched default)", () => {
    refuses(() => parseInrPerRegionalUnit("1.1234567"), /at most 6 decimal places/);
    refuses(() => parseInrPerRegionalUnit(1_000_001), /implausibly large/);
    refuses(() => parseInrPerRegionalUnit(1), /exactly 1/);
    refuses(() => parseInrPerRegionalUnit("1.000000"), /exactly 1/);
    assert.equal(parseInrPerRegionalUnit("1.000001").toFixed(6), "1.000001");
  });
});

describe("INR cost / rate = regional cost (direction, precision, rounding)", () => {
  test("direction: 1 OMR = 243.156 INR, so INR 125,000 is about OMR 514.073 (smaller than the INR figure, never multiplied)", () => {
    const omr = convertInrToRegional(125_000, "243.156", "OMR");
    assert.equal(omr.toFixed(3), "514.073");
    assert.ok(omr.lt(125_000));
    assert.notEqual(omr.toFixed(3), (125_000 * 243.156).toFixed(3), "never the inverse direction");
  });

  test("the worked hourly example: INR 1,250 per hour is OMR 5.141 (3 decimals), INR 1,250 x 100 hours is the same as 100 x the rounded rate only to rounding", () => {
    assert.equal(convertInrToRegional(1_250, "243.156", "OMR").toFixed(3), "5.141");
    assert.equal(convertInrToRegional(125_000, "243.156", "OMR").toFixed(3), "514.073");
  });

  test("OMR keeps 3 decimals; MYR, AED, QAR and INR-like currencies keep 2", () => {
    assert.equal(minorUnitsFor("OMR"), 3);
    for (const currency of ["MYR", "AED", "QAR", "USD", "EUR"]) assert.equal(minorUnitsFor(currency), 2, currency);
    assert.equal(convertInrToRegional(1_000, "3", "OMR").toFixed(3), "333.333");
    assert.equal(convertInrToRegional(1_000, "3", "AED").toFixed(2), "333.33");
  });

  test("half-up rounding once, at the end: 0.005 rounds up to 0.01, 1.0005 OMR rounds up to 1.001", () => {
    assert.equal(convertInrToRegional(0.01, "2", "AED").toFixed(2), "0.01");
    assert.equal(convertInrToRegional(2.001, "2", "OMR").toFixed(3), "1.001");
    assert.equal(convertInrToRegional(1.0005 * 2, "2", "OMR").toFixed(3), "1.001");
  });

  test("zero hours and zero cost stay exactly zero", () => {
    assert.equal(convertInrToRegional(0, "243.156", "OMR").toFixed(3), "0.000");
  });

  test("exact decimal arithmetic: no floating-point noise on awkward values", () => {
    // 0.1 + 0.2 style drift must not leak in: 3 x 0.1 INR at rate 0.3 is exactly 1.
    assert.equal(convertInrToRegional(0.3, "0.3", "AED").toFixed(2), "1.00");
    assert.equal(convertInrToRegional(1_234_567.89, "243.156", "OMR").toFixed(3), new Prisma.Decimal("1234567.89").div("243.156").toDecimalPlaces(3, 4).toFixed(3));
  });

  test("a zero or negative stored rate can never be divided by", () => {
    assert.throws(() => convertInrToRegional(100, "0", "OMR"), AppError);
    assert.throws(() => convertInrToRegional(100, "-5", "OMR"), AppError);
  });
});

describe("all seven countries use the right currency, decimals and direction", () => {
  const countries = [
    { country: "India", currency: "INR", stored: "INR" },
    { country: "Malaysia", currency: "MYR", stored: "MYR" },
    { country: "Oman", currency: "OMR", stored: "OMR" },
    { country: "Abu Dhabi", currency: "AED", stored: "AED" },
    { country: "FZE", currency: "AED", stored: "AED" },
    { country: "Elixir Qatar", currency: "QAR", stored: "QAR" },
    { country: "Qatar", currency: "QAR", stored: "QAR" },
  ];
  const rate = { version: 1, inrPerRegionalUnit: "20.5", effectiveFrom: new Date("2026-11-01T00:00:00Z") }; // test fixture only

  for (const { country, currency, stored } of countries) {
    test(`${country} (${currency})`, () => {
      const snapshot = decideRegionalSnapshot({ storedRegionalCurrency: stored, inrCost: 125_000, existing: null, latestRate: rate });
      if (currency === "INR") {
        assert.equal(requiresManhourRate(stored), false);
        assert.equal(snapshot.costingStatus, COSTING_STATUS.INR);
        assert.equal(snapshot.manhourCostRegional, null, "an INR project has no conversion: the INR figure is its own");
        assert.equal(snapshot.fxRateVersion, null);
      } else {
        assert.equal(requiresManhourRate(stored), true);
        assert.equal(snapshot.costingStatus, COSTING_STATUS.CONVERTED);
        assert.equal(snapshot.costCurrency, currency);
        const expected = new Prisma.Decimal(125_000).div("20.5").toDecimalPlaces(minorUnitsFor(currency), 4);
        assert.equal(snapshot.manhourCostRegional?.toFixed(minorUnitsFor(currency)), expected.toFixed(minorUnitsFor(currency)));
        assert.equal(snapshot.fxRateVersion, 1);
        assert.equal(snapshot.fxRateInrPerRegional?.toFixed(6), "20.500000");
      }
    });
  }

  test("a legacy project (no stored regional currency) is INR: no conversion", () => {
    const snapshot = decideRegionalSnapshot({ storedRegionalCurrency: null, inrCost: 5_000, existing: null, latestRate: null });
    assert.equal(snapshot.costingStatus, COSTING_STATUS.INR);
  });
});

describe("snapshot decisions: a later rate never rewrites stored history", () => {
  const v1 = { version: 1, inrPerRegionalUnit: "243.156", effectiveFrom: new Date("2026-11-01T00:00:00Z") };
  const v2 = { version: 2, inrPerRegionalUnit: "250", effectiveFrom: new Date("2026-12-01T00:00:00Z") };
  const converted = { costingStatus: "CONVERTED", costCurrency: "OMR", fxRateVersion: 1, fxRateInrPerRegional: "243.156", rateSetAt: v1.effectiveFrom };

  test("a non-INR row with no rate set is RATE_MISSING: no regional amount, nothing guessed, no rate of 1", () => {
    const snapshot = decideRegionalSnapshot({ storedRegionalCurrency: "OMR", inrCost: 125_000, existing: null, latestRate: null });
    assert.equal(snapshot.costingStatus, COSTING_STATUS.RATE_MISSING);
    assert.equal(snapshot.manhourCostRegional, null);
    assert.equal(snapshot.fxRateInrPerRegional, null);
    assert.equal(snapshot.costCurrency, "OMR");
  });

  test("a CONVERTED row keeps its OWN rate version when its hours change, even though a newer version exists", () => {
    const snapshot = decideRegionalSnapshot({ storedRegionalCurrency: "OMR", inrCost: 250_000, existing: converted, latestRate: v2 });
    assert.equal(snapshot.fxRateVersion, 1);
    assert.equal(snapshot.fxRateInrPerRegional?.toFixed(6), "243.156000");
    assert.equal(snapshot.manhourCostRegional?.toFixed(3), "1028.147");
  });

  test("a brand-new row takes the latest version", () => {
    const snapshot = decideRegionalSnapshot({ storedRegionalCurrency: "OMR", inrCost: 250_000, existing: null, latestRate: v2 });
    assert.equal(snapshot.fxRateVersion, 2);
    assert.equal(snapshot.manhourCostRegional?.toFixed(3), "1000.000");
  });

  test("an existing row with no snapshot (a project that already had hours) stays RATE_MISSING even when a rate now exists: history is never silently re-priced", () => {
    for (const existing of [
      { costingStatus: null, costCurrency: null, fxRateVersion: null, fxRateInrPerRegional: null, rateSetAt: null },
      { costingStatus: "RATE_MISSING", costCurrency: "OMR", fxRateVersion: null, fxRateInrPerRegional: null, rateSetAt: null },
    ]) {
      const snapshot = decideRegionalSnapshot({ storedRegionalCurrency: "OMR", inrCost: 125_000, existing, latestRate: v2 });
      assert.equal(snapshot.costingStatus, COSTING_STATUS.RATE_MISSING);
      assert.equal(snapshot.manhourCostRegional, null);
    }
  });

  test("a row converted in another currency is never reinterpreted: RATE_MISSING", () => {
    const snapshot = decideRegionalSnapshot({ storedRegionalCurrency: "AED", inrCost: 125_000, existing: converted, latestRate: v2 });
    assert.equal(snapshot.costingStatus, COSTING_STATUS.RATE_MISSING);
  });

  test("the explicit apply conversion always uses the given rate version", () => {
    const snapshot = snapshotWithRate(125_000, "OMR", v2);
    assert.equal(snapshot.costingStatus, COSTING_STATUS.CONVERTED);
    assert.equal(snapshot.fxRateVersion, 2);
    assert.equal(snapshot.manhourCostRegional?.toFixed(3), "500.000");
  });

  test("no double conversion: converting the regional result again would shrink it, and the rules never do", () => {
    const once = convertInrToRegional(125_000, "243.156", "OMR");
    const snapshot = decideRegionalSnapshot({ storedRegionalCurrency: "OMR", inrCost: 125_000, existing: converted, latestRate: v1 });
    assert.equal(snapshot.manhourCostRegional?.toFixed(3), once.toFixed(3));
    assert.notEqual(convertInrToRegional(Number(once), "243.156", "OMR").toFixed(3), once.toFixed(3));
  });
});

describe("central country rates: scope, apply selection and currency guard", () => {
  const country = { version: 2, inrPerRegionalUnit: "250", effectiveFrom: new Date("2026-11-01"), regionalCurrency: "OMR" };

  test("a brand-new row takes the country rate and is marked COUNTRY; an existing legacy row keeps its legacy (NULL) scope", () => {
    const fresh = decideRegionalSnapshot({ storedRegionalCurrency: "OMR", inrCost: 125_000, existing: null, latestRate: country });
    assert.equal(fresh.fxRateScope, FX_RATE_SCOPE.COUNTRY);
    assert.equal(fresh.manhourCostRegional?.toFixed(3), "500.000");
    const legacy = { costingStatus: "CONVERTED", costCurrency: "OMR", fxRateVersion: 1, fxRateInrPerRegional: "243.156", rateSetAt: new Date("2026-10-01"), fxRateScope: null };
    const kept = decideRegionalSnapshot({ storedRegionalCurrency: "OMR", inrCost: 125_000, existing: legacy, latestRate: country });
    assert.equal(kept.fxRateScope, null, "a country rate never rewrites or relabels a legacy row");
    assert.equal(kept.fxRateVersion, 1);
    assert.equal(kept.manhourCostRegional?.toFixed(3), convertInrToRegional(125_000, "243.156", "OMR").toFixed(3));
  });

  test("a rate entered for a different currency than the project currency is never used", () => {
    const wrong = decideRegionalSnapshot({ storedRegionalCurrency: "OMR", inrCost: 1000, existing: null, latestRate: { ...country, regionalCurrency: "QAR" } });
    assert.equal(wrong.costingStatus, COSTING_STATUS.RATE_MISSING);
    assert.equal(wrong.manhourCostRegional, null);
  });

  test("India (INR) is never converted whatever country rates exist, and carries no scope", () => {
    for (const stored of ["INR", null, undefined]) {
      const s = decideRegionalSnapshot({ storedRegionalCurrency: stored, inrCost: 40_000, existing: null, latestRate: { ...country, regionalCurrency: "INR" } });
      assert.equal(s.costingStatus, COSTING_STATUS.INR);
      assert.equal(s.manhourCostRegional, null);
      assert.equal(s.fxRateVersion, null);
      assert.equal(s.fxRateScope, null);
    }
  });

  test("needsCountryApply: unconverted, legacy, or an older country version need the apply; a row already on the latest version does not", () => {
    assert.equal(needsCountryApply({ costingStatus: "RATE_MISSING", fxRateVersion: null, fxRateScope: null }, 2), true);
    assert.equal(needsCountryApply({ costingStatus: null, fxRateVersion: null }, 1), true);
    assert.equal(needsCountryApply({ costingStatus: "CONVERTED", fxRateVersion: 2, fxRateScope: null }, 2), true, "legacy version 2 is NOT country version 2");
    assert.equal(needsCountryApply({ costingStatus: "CONVERTED", fxRateVersion: 1, fxRateScope: "COUNTRY" }, 2), true);
    assert.equal(needsCountryApply({ costingStatus: "CONVERTED", fxRateVersion: 2, fxRateScope: "COUNTRY" }, 2), false);
    assert.equal(needsCountryApply({ costingStatus: "CONVERTED", fxRateVersion: 3, fxRateScope: "COUNTRY" }, 2), false);
  });

  test("the apply conversion marks the row COUNTRY and converts the INR figure exactly once", () => {
    const s = snapshotWithRate(125_000, "OMR", country);
    assert.equal(s.fxRateScope, FX_RATE_SCOPE.COUNTRY);
    assert.equal(s.fxRateVersion, 2);
    assert.equal(s.manhourCostRegional?.toFixed(3), "500.000");
  });
});
