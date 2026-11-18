import { AppError } from "../../shared/utils/AppError.js";
import { INVOICE_CURRENCIES, isSupportedInvoiceCurrency } from "../invoices/invoiceCurrency.rules.js";

/**
 * Regional currency vs commercial (transaction) currency — Global Multi-Country Phase 3. The pure, DB-free rules for pricing a Quantity
 * line, kept apart from quantity.service.ts so every rule can be tested without a database.
 *
 * Two currencies per project:
 *   regional currency    — the currency of the project's country (Project.regionalCurrency, a snapshot taken once at creation).
 *   transaction currency — the currency the work order is agreed in (QuantityItem.currency); may equal the regional one or not.
 *
 * Exchange rate direction (generalising the long-standing INR rule): the stored rate is REGIONAL currency per ONE unit of the
 * TRANSACTION currency, so "1 USD = 4.50 MYR" is stored as 4.5 on a Malaysia project. For an India project this is exactly the rule
 * that has always applied (INR per one unit), so no India value changes.
 *
 * A NULL regional currency is a LEGACY project (created before Phase 3). It behaves exactly as before: INR is its regional currency, the
 * original formulas apply untouched, and nothing here is validated more strictly than it used to be.
 *
 * The INR-named columns (unitRateINR, woValue) hold INR only. They are filled for INR-region projects and legacy projects, and are 0 for
 * every other region, so a MYR, OMR, AED or QAR amount can never be added into an INR total.
 */

/** The seven currencies the application supports (shared with the invoice module so the lists can never drift). */
export const QUANTITY_CURRENCIES = INVOICE_CURRENCIES;

/** What a project with no stored regional currency (a legacy project) is treated as. */
export const LEGACY_REGIONAL_CURRENCY = "INR";

export function effectiveRegionalCurrency(stored: string | null | undefined): string {
  return stored && stored.trim() !== "" ? stored : LEGACY_REGIONAL_CURRENCY;
}

/** True when the project carries a stored regional currency (the Phase 3 rules apply). False for a legacy project. */
export function usesRegionalRules(stored: string | null | undefined): boolean {
  return Boolean(stored && stored.trim() !== "");
}

export interface QuantityPriceInput {
  woQty: number;
  uom: string;
  /** The transaction currency. */
  currency: string;
  unitRate: number;
  /** Regional currency per one unit of the transaction currency, as entered. */
  exchangeRate: number;
}

export interface QuantityAmounts {
  /** The rate to store: forced to 1 when the transaction currency is the regional one. */
  exchangeRate: number;
  unitRateINR: number;
  woValue: number;
  unitRateRegional: number;
  woValueRegional: number;
}

/** Removes floating-point noise (e.g. 3695.9999999999995) from a regional amount without rounding real digits. */
function clean(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function isLumpSum(uom: string): boolean {
  return uom.trim().toUpperCase() === "LUMP SUM";
}

/**
 * Prices one Quantity line. For a legacy project, or a project whose regional currency is INR, the INR columns follow the original
 * formulas exactly (unitRateINR = unitRate for INR, else unitRate x rate; woValue = qty x unitRateINR, or unitRateINR for LUMP SUM) and
 * the regional columns equal them. For any other regional currency the regional columns carry the converted amounts and the INR
 * columns are 0.
 */
export function computeQuantityAmounts(input: QuantityPriceInput, storedRegionalCurrency: string | null | undefined): QuantityAmounts {
  const regional = effectiveRegionalCurrency(storedRegionalCurrency);
  const lump = isLumpSum(input.uom);

  if (!usesRegionalRules(storedRegionalCurrency)) {
    // Legacy: the original formula, byte for byte.
    const unitRateINR = input.currency === "INR" ? input.unitRate : input.unitRate * input.exchangeRate;
    const woValue = lump ? unitRateINR : input.woQty * unitRateINR;
    return { exchangeRate: input.exchangeRate, unitRateINR, woValue, unitRateRegional: unitRateINR, woValueRegional: woValue };
  }

  const sameAsRegional = input.currency === regional;
  const exchangeRate = sameAsRegional ? 1 : input.exchangeRate;

  if (regional === "INR") {
    // India: identical to the legacy arithmetic (no rounding is introduced), regional columns mirror the INR ones.
    const unitRateINR = sameAsRegional ? input.unitRate : input.unitRate * exchangeRate;
    const woValue = lump ? unitRateINR : input.woQty * unitRateINR;
    return { exchangeRate, unitRateINR, woValue, unitRateRegional: unitRateINR, woValueRegional: woValue };
  }

  const unitRateRegional = clean(sameAsRegional ? input.unitRate : input.unitRate * exchangeRate);
  const woValueRegional = clean(lump ? unitRateRegional : input.woQty * unitRateRegional);
  return { exchangeRate, unitRateINR: 0, woValue: 0, unitRateRegional, woValueRegional };
}

/**
 * Server-side validation of a Quantity line's currency and rate for a project that carries a regional currency. A legacy project is not
 * validated any more strictly than before. The transaction currency must be one the application supports; when it differs from the
 * regional currency the manually entered rate must be a finite number greater than zero (no live rate is ever fetched).
 */
export function assertQuantityCurrency(currency: string, exchangeRate: number, storedRegionalCurrency: string | null | undefined): void {
  if (!usesRegionalRules(storedRegionalCurrency)) return;
  const regional = effectiveRegionalCurrency(storedRegionalCurrency);
  if (!isSupportedInvoiceCurrency(currency)) {
    throw new AppError(`Currency "${currency}" is not supported. Choose one of ${QUANTITY_CURRENCIES.join(", ")}.`, 400);
  }
  if (currency === regional) return;
  if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
    throw new AppError(`Enter the exchange rate: 1 ${currency} = ? ${regional}. It must be a number greater than 0.`, 400);
  }
  // Two different currencies are never worth exactly 1:1 here. A rate of 1 is the default left behind by an untouched field (or by an import
  // template that defaults every line to INR), and accepting it would silently price the line as if the currencies were equal.
  if (exchangeRate === 1) {
    throw new AppError(`A rate of exactly 1 is not accepted for ${currency} to ${regional}. Enter the actual rate: 1 ${currency} = ? ${regional}.`, 400);
  }
}
