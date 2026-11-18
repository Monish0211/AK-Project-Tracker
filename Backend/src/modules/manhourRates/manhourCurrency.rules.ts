import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../shared/utils/AppError.js";
import { CURRENCY_MINOR_UNITS, isSupportedInvoiceCurrency } from "../invoices/invoiceCurrency.rules.js";
import { effectiveRegionalCurrency, LEGACY_REGIONAL_CURRENCY } from "../quantity/quantityCurrency.rules.js";

/**
 * Global Multi-Country Phase 4 - country-aware manpower costing. The pure, DB-free rules.
 *
 * The employee's hourly rate stays in INR (Employee.manhourExpenses) and the existing INR man-hour cost is NEVER changed by anything here.
 * For a project whose regional currency is not INR, that INR figure is converted into the project's regional currency with a separate,
 * explicit rate that belongs to the project's COUNTRY (one central, append-only rate per country, see CountryManhourFxRate):
 *
 *     1 regional currency unit = X INR          (e.g. 1 OMR = 243.156 INR)
 *     regional cost = INR cost / X
 *
 * This is deliberately NOT the project's transaction exchange rate (regional per ONE unit of the transaction currency): that rate cannot
 * give INR to regional for a USD, EUR or same-currency project, and it points the other way.
 *
 * Arithmetic is exact decimal (never floating point) and is rounded ONCE, half-up, to the currency's minor units (OMR 3, the rest 2), at the
 * very end. A rate is never fetched, never defaulted and never 1.
 */

export const COSTING_STATUS = {
  /** An INR (or legacy) project: no conversion, the INR figure is the project's own. */
  INR: "INR",
  /** A non-INR project row converted with a stored rate version. */
  CONVERTED: "CONVERTED",
  /** A non-INR project row with no rate applied: nothing is guessed and the INR figure is never shown as regional money. */
  RATE_MISSING: "RATE_MISSING",
} as const;
export type CostingStatus = (typeof COSTING_STATUS)[keyof typeof COSTING_STATUS];

/**
 * Which table a stored ProjectResource.fxRateVersion points into. NULL (legacy, before central country rates) = a per-project version kept only as
 * history; COUNTRY = a CountryManhourFxRate version. A legacy row is never reinterpreted: it keeps its stored values until a country apply moves it.
 */
export const FX_RATE_SCOPE = { COUNTRY: "COUNTRY" } as const;

export const RATE_DECIMAL_PLACES = 6;
/** Decimal(18,6) holds 12 integer digits; a rate above a million INR per unit is certainly a typing mistake. */
export const MAX_INR_PER_REGIONAL_UNIT = 1_000_000;

/** decimal.js ROUND_HALF_UP. */
const ROUND_HALF_UP = 4;

/** True when the project's manpower cost needs a conversion rate (its regional currency is not INR). A legacy project (none stored) is INR. */
export function requiresManhourRate(storedRegionalCurrency: string | null | undefined): boolean {
  return effectiveRegionalCurrency(storedRegionalCurrency) !== LEGACY_REGIONAL_CURRENCY;
}

/** Decimal places of a currency: OMR 3, every other supported currency 2. */
export function minorUnitsFor(currency: string): number {
  return isSupportedInvoiceCurrency(currency) ? CURRENCY_MINOR_UNITS[currency] : 2;
}

/**
 * Validates and parses a conversion rate ("1 regional unit = X INR"). Accepts a number or a numeric string. Rejects zero, negatives, NaN,
 * anything with more than 6 decimals, an implausibly large value, and exactly 1 (the Phase 3 convention: 1 between two different
 * currencies is never a real rate, only an untouched default).
 */
export function parseInrPerRegionalUnit(input: unknown): Prisma.Decimal {
  const raw = typeof input === "number" ? (Number.isFinite(input) ? String(input) : "") : typeof input === "string" ? input.trim() : "";
  if (raw === "" || !/^[0-9]+(\.[0-9]+)?$/.test(raw)) {
    throw new AppError("Enter the conversion rate as a positive number, for example 243.156 (1 regional currency unit = that many INR).", 400);
  }
  const rate = new Prisma.Decimal(raw);
  if (rate.lte(0)) {
    throw new AppError("The conversion rate must be greater than zero.", 400);
  }
  if (rate.decimalPlaces() > RATE_DECIMAL_PLACES) {
    throw new AppError(`The conversion rate can have at most ${RATE_DECIMAL_PLACES} decimal places.`, 400);
  }
  if (rate.gt(MAX_INR_PER_REGIONAL_UNIT)) {
    throw new AppError(`The conversion rate is implausibly large (more than ${MAX_INR_PER_REGIONAL_UNIT.toLocaleString("en-US")} INR per unit). Check the value.`, 400);
  }
  if (rate.eq(1)) {
    throw new AppError("A conversion rate of exactly 1 is not accepted for a non-INR project. Enter how many INR one unit of the regional currency is worth.", 400);
  }
  return rate;
}

/** INR cost -> regional cost: exact division by the rate, rounded half-up once to the currency's minor units. Never used for an INR project. */
export function convertInrToRegional(inrCost: number, inrPerRegionalUnit: Prisma.Decimal | string, currency: string): Prisma.Decimal {
  const rate = new Prisma.Decimal(inrPerRegionalUnit);
  if (rate.lte(0)) {
    throw new AppError("The conversion rate must be greater than zero.", 400);
  }
  const cost = new Prisma.Decimal(String(Number.isFinite(inrCost) ? inrCost : 0));
  return cost.div(rate).toDecimalPlaces(minorUnitsFor(currency), ROUND_HALF_UP);
}

export interface StoredRegionalState {
  costingStatus: string | null;
  costCurrency: string | null;
  fxRateVersion: number | null;
  fxRateInrPerRegional: Prisma.Decimal | string | null;
  rateSetAt: Date | null;
  fxRateScope?: string | null;
}

export interface RateVersionLike {
  version: number;
  inrPerRegionalUnit: Prisma.Decimal | string;
  effectiveFrom: Date;
  /** The currency the version was entered for. When present it must equal the project's regional currency, otherwise nothing is converted. */
  regionalCurrency?: string;
}

export interface RegionalSnapshot {
  costingStatus: CostingStatus;
  costCurrency: string;
  fxRateVersion: number | null;
  fxRateInrPerRegional: Prisma.Decimal | null;
  manhourCostRegional: Prisma.Decimal | null;
  rateSetAt: Date | null;
  fxRateScope: string | null;
}

/**
 * The regional snapshot to store on a ProjectResource row, given the freshly computed INR cost.
 *
 *  - INR / legacy project: status INR, no regional columns (the INR figure is the project's own money).
 *  - A row already CONVERTED keeps the rate version it was converted with and is re-converted with THAT rate when its hours change. A newer
 *    rate version never rewrites it; only the explicit, audited apply action moves a row to a newer version.
 *  - A brand-new row (`existing` is null) takes the latest rate version of the project's COUNTRY when one exists, otherwise it is RATE_MISSING.
 *    A rate entered for a different currency than the project's is never used.
 *  - An existing row with no snapshot, or already RATE_MISSING, stays RATE_MISSING: its history is never silently re-priced, and its INR
 *    figure is never presented as regional money.
 *  - A row whose stored cost currency no longer matches the project's regional currency is RATE_MISSING (never reinterpreted).
 */
export function decideRegionalSnapshot(args: {
  storedRegionalCurrency: string | null | undefined;
  inrCost: number;
  existing: StoredRegionalState | null;
  latestRate: RateVersionLike | null;
}): RegionalSnapshot {
  const currency = effectiveRegionalCurrency(args.storedRegionalCurrency);

  if (!requiresManhourRate(args.storedRegionalCurrency)) {
    return { costingStatus: COSTING_STATUS.INR, costCurrency: LEGACY_REGIONAL_CURRENCY, fxRateVersion: null, fxRateInrPerRegional: null, manhourCostRegional: null, rateSetAt: null, fxRateScope: null };
  }

  const missing: RegionalSnapshot = { costingStatus: COSTING_STATUS.RATE_MISSING, costCurrency: currency, fxRateVersion: null, fxRateInrPerRegional: null, manhourCostRegional: null, rateSetAt: null, fxRateScope: null };
  const { existing } = args;

  if (existing) {
    const stillConverted =
      existing.costingStatus === COSTING_STATUS.CONVERTED &&
      existing.costCurrency === currency &&
      existing.fxRateVersion !== null &&
      existing.fxRateInrPerRegional !== null;
    if (!stillConverted) return missing;
    const rate = new Prisma.Decimal(existing.fxRateInrPerRegional as Prisma.Decimal | string);
    return {
      costingStatus: COSTING_STATUS.CONVERTED,
      costCurrency: currency,
      fxRateVersion: existing.fxRateVersion,
      fxRateInrPerRegional: rate,
      manhourCostRegional: convertInrToRegional(args.inrCost, rate, currency),
      rateSetAt: existing.rateSetAt,
      // Kept as stored: a legacy (NULL) row stays legacy until a country apply moves it.
      fxRateScope: existing.fxRateScope ?? null,
    };
  }

  if (!args.latestRate) return missing;
  if (args.latestRate.regionalCurrency !== undefined && args.latestRate.regionalCurrency !== currency) return missing;
  const rate = new Prisma.Decimal(args.latestRate.inrPerRegionalUnit);
  return {
    costingStatus: COSTING_STATUS.CONVERTED,
    costCurrency: currency,
    fxRateVersion: args.latestRate.version,
    fxRateInrPerRegional: rate,
    manhourCostRegional: convertInrToRegional(args.inrCost, rate, currency),
    rateSetAt: args.latestRate.effectiveFrom,
    fxRateScope: FX_RATE_SCOPE.COUNTRY,
  };
}

/** True when a row is not yet on the given COUNTRY rate version: unconverted, converted with a legacy per-project version, or with an older country version. */
export function needsCountryApply(row: { costingStatus: string | null; fxRateVersion: number | null; fxRateScope?: string | null }, latestVersion: number): boolean {
  if (row.costingStatus !== COSTING_STATUS.CONVERTED) return true;
  if ((row.fxRateScope ?? null) !== FX_RATE_SCOPE.COUNTRY) return true;
  return (row.fxRateVersion ?? 0) < latestVersion;
}

/** The same conversion for the explicit apply action: always the given (latest) rate version, whatever the row held before. */
export function snapshotWithRate(inrCost: number, currency: string, rate: RateVersionLike): RegionalSnapshot {
  const decimalRate = new Prisma.Decimal(rate.inrPerRegionalUnit);
  return {
    costingStatus: COSTING_STATUS.CONVERTED,
    costCurrency: currency,
    fxRateVersion: rate.version,
    fxRateInrPerRegional: decimalRate,
    manhourCostRegional: convertInrToRegional(inrCost, decimalRate, currency),
    rateSetAt: rate.effectiveFrom,
    fxRateScope: FX_RATE_SCOPE.COUNTRY,
  };
}
