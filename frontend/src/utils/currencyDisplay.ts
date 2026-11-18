import { CURRENCY_MINOR_UNITS, isSupportedCurrency } from "../constants/currencies";
import { formatBusinessINR, formatFullINR, formatIndianCurrency } from "./formatCurrency";

/**
 * Regional currency vs transaction currency — display and small helpers (Global Multi-Country Phase 3).
 *
 * A project's REGIONAL currency is the currency of its country, copied from the backend (Project.regionalCurrency). A project with no
 * stored regional currency is a LEGACY project and is treated as INR everywhere, so every existing screen reads exactly as before.
 * The exchange rate means: regional currency per ONE unit of the transaction currency ("1 USD = 4.50 MYR").
 */

export const LEGACY_REGIONAL_CURRENCY = "INR";

export interface RegionalCurrencyHolder {
  regionalCurrency?: string | null | undefined;
  /** The project's stored PR Category = its country. Decides the number-abbreviation convention, never the user's selected country. */
  prCategory?: string | null | undefined;
}

/**
 * Number-abbreviation convention of a country's amounts: INDIAN (Lakh / Crore: 1,00,000 = 1 L, 1,00,00,000 = 1 Cr) or INTERNATIONAL (K / M / B).
 * It follows the PROJECT'S COUNTRY (the stored PR Category), never the signed-in user's country, the active-country selector, the browser locale or the
 * currency alone: two countries can share a currency, yet each stays its own country.
 */
export type NumberingSystem = "indian" | "international";

/** Report groups and the "no country" bucket carry these in place of a real country (see reportCurrency.ts): they name no country. */
function namesNoCountry(name: string): boolean {
  return name === "" || name === "none" || name.startsWith("category:");
}

/**
 * India is the ONLY country with the Indian convention (matched by its name or code, case-insensitively); every other country is international. No list of
 * countries is kept here: the country comes from the project (its stored PR Category) or from a report group's key, so a country added in the backend needs no
 * change. A project that names no country (a legacy project with no PR Category) falls back to its currency: INR is India's, anything else is international.
 * Pure; presentation only.
 */
export function numberingSystemForCountry(country: string | null | undefined, currency?: string | null): NumberingSystem {
  const name = (country ?? "").trim().toLowerCase();
  if (name === "india") return "indian";
  if (!namesNoCountry(name)) return "international";
  return (currency || LEGACY_REGIONAL_CURRENCY) === "INR" ? "indian" : "international";
}

/** The project's regional currency; INR for a legacy project. */
export function regionalCurrencyOf(project: RegionalCurrencyHolder | null | undefined): string {
  return project?.regionalCurrency ? project.regionalCurrency : LEGACY_REGIONAL_CURRENCY;
}

/** True when the project's regional currency is anything other than INR (so the INR-named amounts are not the project's own money). */
export function isNonInrRegional(project: RegionalCurrencyHolder | null | undefined): boolean {
  return regionalCurrencyOf(project) !== "INR";
}

function minorUnits(currency: string): number {
  return isSupportedCurrency(currency) ? CURRENCY_MINOR_UNITS[currency] : 2;
}

/** A plain number grouped with the currency's own decimal places (OMR 3, the rest 2): no symbol. */
export function formatCurrencyNumber(value: number, currency: string): string {
  const digits = minorUnits(currency);
  return (Number.isFinite(value) ? value : 0).toLocaleString(currency === "INR" ? "en-IN" : "en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * The symbol shown in front of an amount: ₹ for INR, RM for MYR, and the ISO code for every other currency (OMR, AED, QAR, USD, EUR),
 * which have no unambiguous short symbol of their own. The ISO code is still used in labels and headings ("Rate (MYR)"); only amounts use RM.
 */
export function currencySymbol(currency: string): string {
  if (currency === "INR") return "₹";
  if (currency === "MYR") return "RM";
  return currency;
}

/**
 * The text put in front of an amount, with its spacing: "₹" sits against the number (the long-standing Indian format); "RM" and every currency code (AED, OMR,
 * QAR, ...) are followed by a space, so every regional currency reads alike: "RM 43.2K", "AED 52.85K".
 */
export function amountPrefix(currency: string): string {
  return currency === "INR" ? currencySymbol(currency) : `${currencySymbol(currency)} `;
}

/**
 * An amount in a currency. INR keeps the established ₹ Indian-grouped format (so India reads exactly as before); every other currency uses its own
 * symbol or code and its own decimal places, e.g. "RM43,200.00", "OMR 3,696.000", "AED 35,232.00". A negative value puts the sign first.
 */
export function formatMoney(value: number, currency: string): string {
  if (currency === "INR") return formatIndianCurrency(value);
  const sign = value < 0 ? "-" : "";
  return `${sign}${amountPrefix(currency)}${formatCurrencyNumber(Math.abs(value), currency)}`;
}

const INTERNATIONAL_UNITS = [
  { size: 1_000_000_000, suffix: "B" },
  { size: 1_000_000, suffix: "M" },
  { size: 1_000, suffix: "K" },
] as const;

/**
 * International abbreviation of a non-negative amount, with no space before the letter: 1,000 = 1K, 52,850 = 52.85K, 125,000 = 125K, 1,250,000 = 1.25M,
 * 1,000,000,000 = 1B (at most 2 decimals, trailing zeros dropped). A value that rounds up to the next unit's size is shown in that unit (999,996 = 1M, never
 * 1000K). Below 1,000 the amount is shown as it is, with the currency's own decimals. Presentation only: the amount itself is never changed.
 */
function abbreviateInternational(abs: number, digits: number): string {
  for (let i = 0; i < INTERNATIONAL_UNITS.length; i += 1) {
    const unit = INTERNATIONAL_UNITS[i]!;
    if (abs < unit.size) continue;
    const scaled = Number((abs / unit.size).toFixed(2));
    if (scaled >= 1000 && i > 0) {
      const larger = INTERNATIONAL_UNITS[i - 1]!;
      return `${Number((abs / larger.size).toFixed(2))}${larger.suffix}`;
    }
    return `${scaled}${unit.suffix}`;
  }
  const small = Number(abs.toFixed(digits));
  return small >= 1000 ? "1K" : String(small);
}

/**
 * Compact form for tiles and summaries. INR keeps its long-standing Indian Cr / L / K notation, untouched (India reads exactly as before); every other
 * currency uses the international abbreviations, e.g. "AED 52.85K", "OMR 125K", "QAR 1.25M", "RM43.2K". The symbol or code and its spacing are the existing ones
 * (amountPrefix); a missing or non-finite value reads as zero.
 */
export function formatMoneyCompact(value: number, currency: string): string {
  if (currency === "INR") return formatBusinessINR(value);
  return compactInternational(value, currency);
}

/** The international compact form for any currency symbol, used for every non-INR amount (and for INR amounts of an international-numbering country). */
function compactInternational(value: number, currency: string): string {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  const body = abbreviateInternational(abs, minorUnits(currency));
  const sign = safe < 0 && body !== "0" ? "-" : "";
  return `${sign}${amountPrefix(currency)}${body}`;
}

/** The three amount styles the screens use. For INR they ARE the long-standing INR formatters, so India is byte-for-byte unchanged. */
export interface MoneyFormatter {
  currency: string;
  /** Tile / summary style: ₹ 1.2 Cr, RM43.2 K. */
  compact: (value: number) => string;
  /** Tooltip / full figure: ₹ 12,34,567, OMR 3,696.000. */
  full: (value: number) => string;
  /** Table cell with fixed decimals: ₹ 1,234.50, AED 500.00. */
  exact: (value: number) => string;
}

/**
 * The formatter for amounts in one currency. A missing currency is INR. `country` (the project's stored PR Category) decides the abbreviation convention: an
 * India (or country-less INR) amount uses the long-standing Indian formatters, byte for byte; amounts of any other country use the international K / M / B
 * abbreviations, never Lakh / Crore.
 */
export function moneyFormatter(currency?: string | null, country?: string | null): MoneyFormatter {
  const code = currency || "INR";
  if (code === "INR") {
    const indian = numberingSystemForCountry(country, code) === "indian";
    return {
      currency: code,
      compact: indian ? (v) => formatBusinessINR(v || 0) : (v) => compactInternational(v || 0, code),
      full: (v) => formatFullINR(v || 0),
      exact: (v) => formatIndianCurrency(v || 0),
    };
  }
  return { currency: code, compact: (v) => formatMoneyCompact(v || 0, code), full: (v) => formatMoney(v || 0, code), exact: (v) => formatMoney(v || 0, code) };
}

/** The formatter for a project's OWN money (regional work order value, budgets, expenses, cost, profit): its regional currency, in its country's number convention. */
export function projectMoney(project: RegionalCurrencyHolder | null | undefined): MoneyFormatter {
  return moneyFormatter(regionalCurrencyOf(project), project?.prCategory);
}

/** The direction of the rate in words, e.g. "1 USD = ? OMR" (X shown as "?") or "1 USD = 0.385 OMR" once entered. */
export function rateDirectionLabel(transactionCurrency: string, regionalCurrency: string, rate?: number): string {
  const shown = rate !== undefined && Number.isFinite(rate) && rate > 0 ? String(rate) : "?";
  return `1 ${transactionCurrency} = ${shown} ${regionalCurrency}`;
}

interface WorkOrderValueFields extends RegionalCurrencyHolder {
  workOrderValueINR?: number | undefined;
  workOrderValueRegional?: number | undefined;
}

/**
 * The Work Order Value in the project's regional currency. For a legacy or INR project that is the INR value, exactly as before; for any
 * other region it is the regional value (the INR-named value is 0 there by design).
 */
export function regionalWorkOrderValue(project: WorkOrderValueFields | null | undefined): number {
  if (!project) return 0;
  if (!isNonInrRegional(project)) return project.workOrderValueINR || 0;
  return project.workOrderValueRegional || 0;
}

/** A Quantity line's value in the project's regional currency (the INR value for a legacy or INR project). */
export function lineRegionalValue(
  item: { woValue?: number | undefined; woValueRegional?: number | null | undefined },
  project: RegionalCurrencyHolder | null | undefined
): number {
  if (!isNonInrRegional(project)) return item.woValue || 0;
  return item.woValueRegional ?? 0;
}

/** A Quantity line's unit rate in the project's regional currency. */
export function lineRegionalUnitRate(
  item: { unitRateINR?: number | undefined; unitRateRegional?: number | null | undefined },
  project: RegionalCurrencyHolder | null | undefined
): number {
  if (!isNonInrRegional(project)) return item.unitRateINR || 0;
  return item.unitRateRegional ?? 0;
}

/** The short glyph shown inside an editable amount field: ₹, RM, or the ISO code. */
export function currencyPrefix(currency: string): string {
  return currencySymbol(currency);
}

/**
 * The left padding an amount input needs so its typed text and placeholder start AFTER the glyph drawn inside it: one character (₹) needs little, RM more, a
 * three-letter code (AED, OMR, QAR, USD) the most. Static class names, so Tailwind keeps them.
 */
export function currencyInputPadding(currency: string): string {
  const width = currencyPrefix(currency).length;
  if (width <= 1) return "pl-7";
  if (width === 2) return "pl-9";
  return "pl-12";
}
