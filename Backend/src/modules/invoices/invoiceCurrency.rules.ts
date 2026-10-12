import { AppError } from "../../shared/utils/AppError.js";

/**
 * Invoice Currency feature (Oct 2026) — the pure, DB-free business rules for
 * invoice currency, kept separate from invoice.service.ts so every rule can
 * be unit tested without a database (see invoiceCurrency.rules.test.ts).
 *
 * Confirmed business rules (Oct 2026):
 * - Supported invoice currencies are exactly the seven Quantity Details
 *   offers (INR, USD, EUR, AED, MYR, QAR, OMR) — but invoice currency is a
 *   separate concept from Project.currency / QuantityItem.currency.
 * - Currency + exchange rate are chosen per invoice (invoiceNo); every line
 *   of one invoice carries the same values.
 * - exchangeRateToINR = INR per ONE unit of the invoice currency (1 for INR).
 * - invoiceAmountINR stays the one authoritative INR-equivalent figure every
 *   existing aggregator/report/PDF reads. For a non-INR line the SERVER
 *   derives it as round2(invoiceAmountOriginal x exchangeRateToINR) — a
 *   client-sent invoiceAmountINR is only ever cross-checked, never trusted.
 * - A project's invoice currency is locked by its first line to reach a
 *   genuine-invoice status (Raised, PartiallyPaid or Paid — the same set
 *   Invoice Request fulfillment already treats as "no longer a Draft").
 *   Cancelling never unlocks. One currency per project, whichever it is.
 * - After creation a line's currency and exchange rate never change. A
 *   non-INR line's amount is edited via invoiceAmountOriginal (INR
 *   recomputed with the recorded rate); editing its invoiceAmountINR
 *   directly is rejected. INR lines behave exactly as before.
 */

/**
 * Must stay identical to Quantity Details' currency list — the backend copy
 * of which is pdfImport/validators/enumOptions.ts's CURRENCY_OPTIONS
 * (asserted by invoiceCurrency.rules.test.ts).
 */
export const INVOICE_CURRENCIES = ["INR", "USD", "EUR", "AED", "MYR", "QAR", "OMR"] as const;
export type InvoiceCurrency = (typeof INVOICE_CURRENCIES)[number];

/** ISO 4217 minor units — the most decimal places an original amount may carry. OMR (baisa) has 3. */
export const CURRENCY_MINOR_UNITS: Record<InvoiceCurrency, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  AED: 2,
  MYR: 2,
  QAR: 2,
  OMR: 3,
};

/** Statuses that make a line a genuine invoice — and so establish/enforce the project's currency lock. */
export const CURRENCY_LOCKING_STATUSES: readonly string[] = ["Raised", "PartiallyPaid", "Paid"];

/** Rounding tolerance when cross-checking a client-computed INR amount against the server's own. */
const AMOUNT_TOLERANCE = 0.01;

/** Same 2-decimal rounding as invoice.service.ts's round() and the frontend's InvoiceCalculations.ts round(). INR amounts are always 2 dp. */
export function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isCurrencyLockingStatus(status: string): boolean {
  return CURRENCY_LOCKING_STATUSES.includes(status);
}

export function isSupportedInvoiceCurrency(value: unknown): value is InvoiceCurrency {
  return typeof value === "string" && (INVOICE_CURRENCIES as readonly string[]).includes(value);
}

/** Legacy rows (null) and any unexpected value are treated as INR — never reinterpreted as a foreign currency. */
export function normalizeCurrency(value: string | null | undefined): InvoiceCurrency {
  return isSupportedInvoiceCurrency(value) ? value : "INR";
}

function amountsDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) > AMOUNT_TOLERANCE;
}

/**
 * Accounts enters the rate manually (INR per ONE unit of `currency`); no
 * per-currency range is imposed (confirmed Oct 2026) — only a missing,
 * zero, negative or non-finite rate is rejected. INR is always exactly 1
 * and never reaches this check.
 */
function assertValidForeignRate(currency: InvoiceCurrency, rate: number | undefined): asserts rate is number {
  if (rate === undefined) {
    throw new AppError(`An exchange rate (${currency} to INR) is required for a ${currency} invoice.`, 400);
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new AppError(`The ${currency} to INR exchange rate must be a number greater than 0 (received ${rate}).`, 400);
  }
}

/** A finite rate x a finite amount can still overflow to Infinity — never store that as an INR figure. */
function assertFiniteInr(currency: InvoiceCurrency, invoiceAmountINR: number): void {
  if (!Number.isFinite(invoiceAmountINR)) {
    throw new AppError(`The INR equivalent of this ${currency} amount is too large to record.`, 400);
  }
}

/** Rejects (never silently rounds) an original amount with more decimals than its currency allows. */
function assertOriginalPrecision(currency: InvoiceCurrency, amount: number): void {
  const factor = 10 ** CURRENCY_MINOR_UNITS[currency];
  if (Math.abs(Math.round(amount * factor) - amount * factor) > 1e-6) {
    throw new AppError(
      `A ${currency} amount can have at most ${CURRENCY_MINOR_UNITS[currency]} decimal places (received ${amount}).`,
      400
    );
  }
}

export interface ResolvedInvoiceAmounts {
  currency: InvoiceCurrency;
  exchangeRateToINR: number;
  invoiceAmountOriginal: number;
  invoiceAmountINR: number;
}

interface CurrencyAmountInput {
  currency?: string | undefined;
  exchangeRateToINR?: number | undefined;
  invoiceAmountOriginal?: number | undefined;
  invoiceAmountINR?: number | undefined;
}

/**
 * Create path. A caller that sends no currency fields at all (every
 * pre-existing caller) gets exactly the pre-feature result: INR, rate 1,
 * original === INR amount.
 */
export function resolveCreateAmounts(input: CurrencyAmountInput): ResolvedInvoiceAmounts {
  if (input.currency !== undefined && !isSupportedInvoiceCurrency(input.currency)) {
    throw new AppError(`Unsupported invoice currency "${input.currency}".`, 400);
  }
  const currency = normalizeCurrency(input.currency);

  if (currency === "INR") {
    if (input.invoiceAmountINR === undefined) {
      throw new AppError("Invoice Amount is required.", 400);
    }
    if (input.exchangeRateToINR !== undefined && input.exchangeRateToINR !== 1) {
      throw new AppError("An INR invoice must use an exchange rate of 1.", 400);
    }
    if (input.invoiceAmountOriginal !== undefined && amountsDiffer(input.invoiceAmountOriginal, input.invoiceAmountINR)) {
      throw new AppError("For an INR invoice the original amount must equal the INR amount.", 400);
    }
    return {
      currency,
      exchangeRateToINR: 1,
      invoiceAmountOriginal: input.invoiceAmountINR,
      invoiceAmountINR: input.invoiceAmountINR,
    };
  }

  assertValidForeignRate(currency, input.exchangeRateToINR);
  if (input.invoiceAmountOriginal === undefined) {
    throw new AppError(`The ${currency} invoice amount is required for a ${currency} invoice.`, 400);
  }
  assertOriginalPrecision(currency, input.invoiceAmountOriginal);
  const invoiceAmountINR = roundAmount(input.invoiceAmountOriginal * input.exchangeRateToINR);
  assertFiniteInr(currency, invoiceAmountINR);
  if (input.invoiceAmountINR !== undefined && amountsDiffer(input.invoiceAmountINR, invoiceAmountINR)) {
    throw new AppError(
      `The INR equivalent sent (${input.invoiceAmountINR}) does not match ${currency} ${input.invoiceAmountOriginal} x ${input.exchangeRateToINR} = ${invoiceAmountINR}.`,
      400
    );
  }
  return {
    currency,
    exchangeRateToINR: input.exchangeRateToINR,
    invoiceAmountOriginal: input.invoiceAmountOriginal,
    invoiceAmountINR,
  };
}

/**
 * Update path. Returns only the amount fields that should be written
 * (empty object = amounts untouched). Throws on any attempt to change the
 * frozen currency/rate, or to edit a non-INR line's INR amount directly.
 * Re-sending the existing values unchanged is always accepted — the
 * frontend PATCHes its full payload on every edit, including status-only
 * changes from Invoice History.
 */
export function resolveUpdateAmounts(
  existing: { currency: string; exchangeRateToINR: number; invoiceAmountINR: number; invoiceAmountOriginal: number | null },
  input: CurrencyAmountInput
): { invoiceAmountINR?: number; invoiceAmountOriginal?: number } {
  const currency = normalizeCurrency(existing.currency);

  if (input.currency !== undefined && input.currency !== currency) {
    throw new AppError("An invoice's currency cannot be changed after it is created.", 400);
  }
  if (input.exchangeRateToINR !== undefined && input.exchangeRateToINR !== existing.exchangeRateToINR) {
    throw new AppError("An invoice's exchange rate cannot be changed after it is created.", 400);
  }

  if (currency === "INR") {
    const nextINR = input.invoiceAmountINR ?? existing.invoiceAmountINR;
    if (input.invoiceAmountOriginal !== undefined && amountsDiffer(input.invoiceAmountOriginal, nextINR)) {
      throw new AppError("For an INR invoice the original amount must equal the INR amount.", 400);
    }
    // Keep invoiceAmountOriginal in step with every INR amount edit — it
    // was previously left stale by an INR-only PATCH.
    if (input.invoiceAmountINR !== undefined) {
      return { invoiceAmountINR: input.invoiceAmountINR, invoiceAmountOriginal: input.invoiceAmountINR };
    }
    return {};
  }

  if (input.invoiceAmountOriginal === undefined) {
    if (input.invoiceAmountINR !== undefined && amountsDiffer(input.invoiceAmountINR, existing.invoiceAmountINR)) {
      throw new AppError(
        `A ${currency} invoice's amount must be edited in ${currency}; its INR equivalent is calculated automatically.`,
        400
      );
    }
    return {};
  }

  assertOriginalPrecision(currency, input.invoiceAmountOriginal);
  const invoiceAmountINR = roundAmount(input.invoiceAmountOriginal * existing.exchangeRateToINR);
  assertFiniteInr(currency, invoiceAmountINR);
  if (input.invoiceAmountINR !== undefined && amountsDiffer(input.invoiceAmountINR, invoiceAmountINR)) {
    throw new AppError(
      `The INR equivalent sent (${input.invoiceAmountINR}) does not match ${currency} ${input.invoiceAmountOriginal} x ${existing.exchangeRateToINR} = ${invoiceAmountINR}.`,
      400
    );
  }
  return { invoiceAmountINR, invoiceAmountOriginal: input.invoiceAmountOriginal };
}

/**
 * The project's effective currency lock: the persisted Project.invoiceCurrency
 * if set, otherwise inferred from any line that already reached a genuine
 * invoice status (Cancelled included — a line that was raised then cancelled
 * still locked the project). The inference covers every project whose
 * invoices predate this feature: they are INR-locked from the moment the
 * migration runs, with no backfill needed for correctness.
 */
export function resolveEffectiveLock(
  persisted: string | null,
  nonDraftLineCurrencies: string[]
): InvoiceCurrency | null {
  if (persisted) return normalizeCurrency(persisted);
  if (nonDraftLineCurrencies.length > 0) return normalizeCurrency(nonDraftLineCurrencies[0]);
  return null;
}

/**
 * Decide whether a line in `lineCurrency` may be written with `targetStatus`,
 * and whether that write should persist the lock. Any line — Draft included
 * — in a currency different from an established lock is rejected.
 */
export function evaluateCurrencyLock(params: {
  effectiveLock: InvoiceCurrency | null;
  persistedLock: string | null;
  lineCurrency: InvoiceCurrency;
  targetStatus: string;
}): { persistLock: InvoiceCurrency | null } {
  const { effectiveLock, persistedLock, lineCurrency, targetStatus } = params;
  if (effectiveLock && effectiveLock !== lineCurrency) {
    throw new AppError(
      `This project's invoices are locked to ${effectiveLock}. A ${lineCurrency} invoice cannot be created or raised for it.`,
      409
    );
  }
  if (!persistedLock && isCurrencyLockingStatus(targetStatus)) {
    return { persistLock: lineCurrency };
  }
  return { persistLock: null };
}
