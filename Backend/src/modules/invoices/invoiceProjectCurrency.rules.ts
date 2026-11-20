import { AppError } from "../../shared/utils/AppError.js";
import { CURRENCY_MINOR_UNITS, isSupportedInvoiceCurrency } from "./invoiceCurrency.rules.js";
import type { InvoiceCurrency } from "./invoiceCurrency.rules.js";

/**
 * Multi-country invoice currency (Phase 5) - the pure, DB-free, DECIMAL-SAFE rules for an invoice raised on a project whose regional currency is not INR.
 *
 * WHY A SEPARATE FILE. The India rules in invoiceCurrency.rules.ts are untouched: an INR (or legacy) project keeps every formula, column and message it has
 * always had (invoiceAmountINR is its project-currency amount, exchangeRateToINR its rate, and 1 USD = INR 95 is the same direction as before). This file covers
 * the other countries, where the project currency is MYR, OMR, AED or QAR and there is no INR in the business at all.
 *
 * THE MODEL (approved)
 *   - The ORIGINAL amount in the invoice's own currency is the authoritative amount of the actual invoice (invoiceAmountOriginal, with `currency`).
 *   - The PROJECT-CURRENCY EQUIVALENT is the authoritative amount for project billing: previously invoiced, balance and the Work Order ceiling.
 *     It is derived by the SERVER from the original amount and the invoice's own rate; a client-sent equivalent is never trusted.
 *   - Rate convention: 1 unit of INVOICE currency = X units of PROJECT currency (1 USD = OMR 0.385). The user enters it for every invoice whose currency
 *     differs from the project's; it is saved with the invoice and never changes with the project's commercial Work Order rate.
 *   - Same currency as the project: no rate, effective rate exactly 1, no conversion.
 *   - Nothing here ever writes a regional figure into an INR-named column.
 *
 * ARITHMETIC. Every amount is an integer count of the currency's minor unit in a BigInt and the rate is a decimal scaled by 10^RATE_SCALE, so a conversion is
 * exact integer maths with ONE half-up rounding at the end, to the PROJECT currency's decimals (OMR 3, the rest 2). No floating point touches a result.
 */

/** Decimal places kept for an exchange rate (column Decimal(18, 8)); more precision than this is refused, never silently rounded. */
export const RATE_SCALE = 8;
const RATE_FACTOR = 10n ** BigInt(RATE_SCALE);

/** Largest project-currency amount the Decimal(18, 3) column can hold, with room to spare. */
const MAX_MINOR_DIGITS = 15;

/** A plain decimal as typed: digits with an optional fraction; rejects exponents, signs and separators. */
const DECIMAL_PATTERN = /^(\d+(\.\d+)?|\.\d+)$/;

export function decimalsOf(currency: InvoiceCurrency): number {
  return CURRENCY_MINOR_UNITS[currency];
}

export interface ParsedRate {
  /** rate x 10^RATE_SCALE */
  scaled: bigint;
  /** The exact decimal text to store, without trailing zeros ("0.385", "4.2", "95"). */
  text: string;
}

/** A JS number as plain decimal text (never an exponent), so a rate typed as 0.0000001 survives JSON. */
function numberToPlainText(value: number): string {
  const direct = String(value);
  if (!/e/i.test(direct)) return direct;
  return value.toFixed(RATE_SCALE + 4).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Parses an exchange rate typed by the user (a number or a numeric string). Must be a finite number greater than 0 with at most RATE_SCALE decimals.
 * Never rounds: too many decimals is an error, because a silently rounded rate would change the invoice amount.
 */
export function parseExchangeRate(input: unknown, label = "exchange rate"): ParsedRate {
  const text = typeof input === "number" && Number.isFinite(input) ? numberToPlainText(input) : typeof input === "string" ? input.trim() : "";
  if (!DECIMAL_PATTERN.test(text)) throw new AppError(`The ${label} must be a number greater than 0.`, 400);
  const [wholeRaw = "", fractionRaw = ""] = text.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  const fraction = fractionRaw.replace(/0+$/, "");
  if (fraction.length > RATE_SCALE) throw new AppError(`The ${label} can have at most ${RATE_SCALE} decimal places.`, 400);
  const scaled = BigInt(whole + fraction.padEnd(RATE_SCALE, "0"));
  if (scaled <= 0n) throw new AppError(`The ${label} must be greater than 0.`, 400);
  if (whole.replace(/^0+/, "").length > 9) throw new AppError(`The ${label} is too large.`, 400);
  return { scaled, text: fraction === "" ? whole.replace(/^0+(?=\d)/, "") : `${whole.replace(/^0+(?=\d)/, "")}.${fraction}` };
}

/** Amount (a JS number from the request) -> minor units of `currency`. Rejects, never rounds, an amount with more decimals than the currency allows. */
export function amountToMinor(amount: number, currency: InvoiceCurrency): bigint {
  if (!Number.isFinite(amount) || amount < 0) throw new AppError("The invoice amount must be a number that is not negative.", 400);
  const decimals = decimalsOf(currency);
  const factor = 10 ** decimals;
  const scaled = amount * factor;
  if (Math.abs(Math.round(scaled) - scaled) > 1e-6) {
    throw new AppError(`A ${currency} amount can have at most ${decimals} decimal places (received ${amount}).`, 400);
  }
  const minor = BigInt(Math.round(scaled));
  if (minor.toString().length > MAX_MINOR_DIGITS) throw new AppError(`The ${currency} invoice amount is too large to record.`, 400);
  return minor;
}

/** Minor units -> exact decimal text with the currency's decimals ("231.000", "4200.00"). */
export function minorToText(minor: bigint, currency: InvoiceCurrency): string {
  const decimals = decimalsOf(currency);
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = digits.slice(digits.length - decimals);
  return `${negative ? "-" : ""}${whole}${decimals > 0 ? `.${fraction}` : ""}`;
}

/** Minor units -> a plain number for responses and display (never for arithmetic that is stored). */
export function minorToNumber(minor: bigint, currency: InvoiceCurrency): number {
  return Number(minorToText(minor, currency));
}

/**
 * THE conversion: an amount in `fromCurrency` minor units, at `rate` (1 from-currency = rate to-currency), to `toCurrency` minor units, rounded half-up once.
 *   to = from x rate x 10^toDecimals / 10^fromDecimals
 */
export function convertMinor(fromMinor: bigint, fromCurrency: InvoiceCurrency, toCurrency: InvoiceCurrency, rate: ParsedRate): bigint {
  const numerator = fromMinor * rate.scaled * 10n ** BigInt(decimalsOf(toCurrency));
  const denominator = RATE_FACTOR * 10n ** BigInt(decimalsOf(fromCurrency));
  const converted = (numerator * 2n + denominator) / (2n * denominator);
  if (converted.toString().length > MAX_MINOR_DIGITS) throw new AppError(`The ${toCurrency} equivalent of this amount is too large to record.`, 400);
  return converted;
}

export interface ResolvedProjectCurrencyAmounts {
  currency: InvoiceCurrency;
  projectCurrency: InvoiceCurrency;
  /** Project currency per 1 invoice currency, decimal text (exactly "1" for the same currency). */
  exchangeRateToProject: string;
  invoiceAmountOriginal: number;
  /** The project-currency equivalent, exact decimal text with the project currency's decimals (for the Decimal column). */
  invoiceAmountProject: string;
  invoiceAmountProjectNumber: number;
  /** The same figure in minor units, for exact arithmetic by the caller. */
  invoiceAmountProjectMinor: bigint;
}

export interface ProjectCurrencyAmountInput {
  currency?: string | undefined;
  /** 1 invoice currency = X project currency, as entered. */
  exchangeRateToProject?: number | string | undefined;
  invoiceAmountOriginal?: number | undefined;
}

export function assertRegionalCurrency(value: string): InvoiceCurrency {
  if (!isSupportedInvoiceCurrency(value)) throw new AppError(`Unsupported project currency "${value}".`, 500);
  return value;
}

/**
 * Create path for a non-INR project. A caller that names no currency gets the project's own (Rule 1). The same currency needs no rate (and refuses any other
 * than 1); a different currency requires one, entered by the user for this invoice.
 */
export function resolveProjectCurrencyCreateAmounts(projectCurrencyValue: string, input: ProjectCurrencyAmountInput): ResolvedProjectCurrencyAmounts {
  const projectCurrency = assertRegionalCurrency(projectCurrencyValue);
  if (input.currency !== undefined && !isSupportedInvoiceCurrency(input.currency)) throw new AppError(`Unsupported invoice currency "${input.currency}".`, 400);
  const currency: InvoiceCurrency = (input.currency as InvoiceCurrency | undefined) ?? projectCurrency;
  if (input.invoiceAmountOriginal === undefined) throw new AppError(`The ${currency} invoice amount is required.`, 400);
  const originalMinor = amountToMinor(input.invoiceAmountOriginal, currency);

  if (currency === projectCurrency) {
    if (input.exchangeRateToProject !== undefined && parseExchangeRate(input.exchangeRateToProject).scaled !== RATE_FACTOR) {
      throw new AppError(`An invoice in the project currency (${projectCurrency}) uses an exchange rate of 1; no other rate is accepted.`, 400);
    }
    return {
      currency,
      projectCurrency,
      exchangeRateToProject: "1",
      invoiceAmountOriginal: input.invoiceAmountOriginal,
      invoiceAmountProject: minorToText(originalMinor, projectCurrency),
      invoiceAmountProjectNumber: minorToNumber(originalMinor, projectCurrency),
      invoiceAmountProjectMinor: originalMinor,
    };
  }

  if (input.exchangeRateToProject === undefined || input.exchangeRateToProject === "") {
    throw new AppError(`Enter the exchange rate for this invoice: 1 ${currency} = ? ${projectCurrency}.`, 400);
  }
  const rate = parseExchangeRate(input.exchangeRateToProject, `${currency} to ${projectCurrency} exchange rate`);
  const projectMinor = convertMinor(originalMinor, currency, projectCurrency, rate);
  return {
    currency,
    projectCurrency,
    exchangeRateToProject: rate.text,
    invoiceAmountOriginal: input.invoiceAmountOriginal,
    invoiceAmountProject: minorToText(projectMinor, projectCurrency),
    invoiceAmountProjectNumber: minorToNumber(projectMinor, projectCurrency),
    invoiceAmountProjectMinor: projectMinor,
  };
}

export interface StoredProjectCurrencyAmounts {
  currency: string;
  projectCurrency: string;
  /** Decimal text as stored. */
  exchangeRateToProject: string;
  invoiceAmountOriginal: number | null;
  invoiceAmountProject: string;
}

/**
 * Update path for a non-INR project line. The currency and the rate are frozen once the line exists (re-sending the stored values is accepted: the frontend
 * PATCHes its full payload on every edit). A changed original amount is converted again with the STORED rate; nothing about a later project-rate change reaches it.
 * Returns the fields to write, or an empty object when the amounts are untouched.
 */
export function resolveProjectCurrencyUpdateAmounts(
  existing: StoredProjectCurrencyAmounts,
  input: ProjectCurrencyAmountInput
): { invoiceAmountOriginal?: number; invoiceAmountProject?: string; invoiceAmountProjectNumber?: number; invoiceAmountProjectMinor?: bigint } {
  const currency = existing.currency as InvoiceCurrency;
  const projectCurrency = existing.projectCurrency as InvoiceCurrency;
  if (input.currency !== undefined && input.currency !== currency) throw new AppError("An invoice's currency cannot be changed after it is created.", 400);
  if (input.exchangeRateToProject !== undefined && input.exchangeRateToProject !== "") {
    const sent = parseExchangeRate(input.exchangeRateToProject);
    if (sent.scaled !== parseExchangeRate(existing.exchangeRateToProject).scaled) throw new AppError("An invoice's exchange rate cannot be changed after it is created.", 400);
  }
  if (input.invoiceAmountOriginal === undefined) return {};
  const originalMinor = amountToMinor(input.invoiceAmountOriginal, currency);
  const projectMinor = currency === projectCurrency ? originalMinor : convertMinor(originalMinor, currency, projectCurrency, parseExchangeRate(existing.exchangeRateToProject));
  return {
    invoiceAmountOriginal: input.invoiceAmountOriginal,
    invoiceAmountProject: minorToText(projectMinor, projectCurrency),
    invoiceAmountProjectNumber: minorToNumber(projectMinor, projectCurrency),
    invoiceAmountProjectMinor: projectMinor,
  };
}

/**
 * The Work Order ceiling for a non-INR project, in PROJECT currency minor units: what was already invoiced on the activity plus this invoice must not exceed
 * the activity's Work Order Value. Both sides are project-currency amounts, so no currency is ever compared with another.
 */
export function assertWithinProjectCeiling(params: {
  projectCurrency: InvoiceCurrency;
  workOrderValueMinor: bigint;
  alreadyInvoicedMinor: bigint;
  incomingMinor: bigint;
}): void {
  const { projectCurrency, workOrderValueMinor, alreadyInvoicedMinor, incomingMinor } = params;
  const newTotal = alreadyInvoicedMinor + incomingMinor;
  if (newTotal > workOrderValueMinor) {
    throw new AppError(
      `This activity would be invoiced ${projectCurrency} ${minorToText(newTotal, projectCurrency)}, exceeding its Work Order Value of ${projectCurrency} ${minorToText(workOrderValueMinor, projectCurrency)}. Already invoiced: ${projectCurrency} ${minorToText(alreadyInvoicedMinor, projectCurrency)}.`,
      400
    );
  }
}

export interface ProjectLineAmounts {
  /** The unit rate in the project currency snapshotted at billing time (exact decimal text, 6 places). */
  unitPriceProject: string;
  /** Quantity x unit rate x milestone %, or the invoice amount itself for a line that is not quantity-driven. */
  calculatedAmountProject: string;
  /** invoice amount - calculated (negative when the invoice is below the system amount). */
  commercialAdjustmentProject: string;
}

/**
 * The project-currency counterparts of unitPriceINR / calculatedAmountINR / commercialAdjustmentINR, with the same meaning as the India computeAmounts():
 * a quantity-driven line (quantityBilled > 0) compares the invoice amount with quantity x unit rate x milestone %; any other line has no separate system amount.
 * Exact BigInt arithmetic, one half-up rounding to the project currency's decimals.
 */
export function computeProjectLineAmounts(params: {
  quantityBilled: number;
  unitRate: number | null;
  milestonePercent: number;
  invoiceAmountProjectMinor: bigint;
  projectCurrency: InvoiceCurrency;
}): ProjectLineAmounts {
  const { quantityBilled, unitRate, milestonePercent, invoiceAmountProjectMinor, projectCurrency } = params;
  const unit = unitRate ?? 0;
  const unitPriceProject = (Number.isFinite(unit) ? unit : 0).toFixed(6);
  if (!(quantityBilled > 0)) {
    return { unitPriceProject, calculatedAmountProject: minorToText(invoiceAmountProjectMinor, projectCurrency), commercialAdjustmentProject: minorToText(0n, projectCurrency) };
  }
  const qtyMicro = BigInt(Math.round(quantityBilled * 1e6));
  const unitMicro = BigInt(Math.round((Number.isFinite(unit) ? unit : 0) * 1e6));
  const percentScaled = BigInt(Math.round(milestonePercent * 1e4));
  const numerator = qtyMicro * unitMicro * percentScaled * 10n ** BigInt(decimalsOf(projectCurrency));
  const denominator = 10n ** 6n * 10n ** 6n * 10n ** 4n * 100n;
  const calculatedMinor = (numerator * 2n + denominator) / (2n * denominator);
  return {
    unitPriceProject,
    calculatedAmountProject: minorToText(calculatedMinor, projectCurrency),
    commercialAdjustmentProject: minorToText(invoiceAmountProjectMinor - calculatedMinor, projectCurrency),
  };
}
