import type { Project } from "../../../../types/Project";
import type { InvoiceCurrency, InvoiceLine } from "../../../../types/InvoiceItem";
import { formatIndianCurrency } from "../../../../utils/formatCurrency";
import { CURRENCY_MINOR_UNITS, SUPPORTED_CURRENCIES, isSupportedCurrency } from "../../../../constants/currencies";
import { round } from "./InvoiceCalculations";

/**
 * Invoice Currency feature (Oct 2026) — frontend helpers. Mirrors
 * Backend/src/modules/invoices/invoiceCurrency.rules.ts; the backend is the
 * authority (it re-derives every INR equivalent and enforces the lock), so
 * everything here is UX only: defaults, display, and early validation.
 *
 * exchangeRateToINR = INR per ONE unit of the invoice currency (1 for INR).
 * invoiceAmountINR stays the INR-equivalent figure every existing total,
 * chart and KPI reads — nothing in this file changes what those sum.
 */

/** Same seven codes, same order, as Quantity Details (constants/currencies.ts). */
export const INVOICE_CURRENCY_OPTIONS: readonly InvoiceCurrency[] = SUPPORTED_CURRENCIES;

export function isForeignCurrency(currency: InvoiceCurrency): boolean {
  return currency !== "INR";
}

/** Legacy lines (no currency field) and any unexpected value are INR — never reinterpreted as a foreign currency. */
export function normalizeInvoiceCurrency(value: unknown): InvoiceCurrency {
  return isSupportedCurrency(value) ? value : "INR";
}

export function getLineCurrency(line: Pick<InvoiceLine, "currency">): InvoiceCurrency {
  return normalizeInvoiceCurrency(line.currency);
}

/** The amount in the line's own invoice currency — the INR amount for every INR/legacy line. */
export function getLineOriginalAmount(line: Pick<InvoiceLine, "currency" | "invoiceAmountOriginal" | "invoiceAmountINR">): number {
  if (isForeignCurrency(getLineCurrency(line)) && typeof line.invoiceAmountOriginal === "number") {
    return line.invoiceAmountOriginal;
  }
  return line.invoiceAmountINR;
}

/** Round an original amount to its currency's minor unit (3 dp for OMR, 2 for the rest). */
export function roundToMinorUnit(value: number, currency: InvoiceCurrency): number {
  const factor = 10 ** CURRENCY_MINOR_UNITS[currency];
  return Math.round(value * factor) / factor;
}

/** e.g. "EUR 1,234.50", "OMR 12.345" — code first, so currencies are never confused with each other or with ₹. INR keeps the existing ₹ format. */
export function formatInvoiceMoney(value: number, currency: InvoiceCurrency): string {
  if (currency === "INR") return formatIndianCurrency(value);
  const digits = CURRENCY_MINOR_UNITS[currency];
  return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** e.g. "EUR 1,000.00 (₹ 90,400.00 @ 90.4)" for a foreign line, plain "₹ 90,400.00" for INR. */
export function formatLineAmountWithEquivalent(line: InvoiceLine): string {
  const currency = getLineCurrency(line);
  if (!isForeignCurrency(currency)) return formatIndianCurrency(line.invoiceAmountINR);
  return `${formatInvoiceMoney(getLineOriginalAmount(line), currency)} (${formatIndianCurrency(line.invoiceAmountINR)} @ ${line.exchangeRateToINR ?? "-"})`;
}

/**
 * Whether the backend this frontend is talking to supports invoice currency
 * at all. A backend without the feature omits ProjectDto.invoiceCurrency
 * entirely (undefined), and would silently strip the currency fields and
 * store the line as INR — so foreign currencies are only ever offered once
 * the field is present (null or a value). Guards the deployment window
 * where this frontend is live before its backend.
 */
export function isInvoiceCurrencySupported(project: Pick<Project, "invoiceCurrency">): boolean {
  return project.invoiceCurrency !== undefined;
}

/** Same as the backend's resolveEffectiveLock(): persisted lock, else the currency of any line that ever left Draft (Cancelled included), else none. */
export function getProjectInvoiceCurrencyLock(project: Project): InvoiceCurrency | null {
  if (isSupportedCurrency(project.invoiceCurrency)) return project.invoiceCurrency;
  for (const item of project.invoiceItems ?? []) {
    for (const line of item.invoices ?? []) {
      if (line.status !== "Draft") return getLineCurrency(line);
    }
  }
  return null;
}

/** The currency/rate an existing invoice (invoiceNo) was raised in — every line of one invoice shares them. Null for a brand-new invoice. */
export function getInvoiceCycleCurrency(project: Project, invoiceNo: string): { currency: InvoiceCurrency; exchangeRateToINR: number } | null {
  for (const item of project.invoiceItems ?? []) {
    const line = (item.invoices ?? []).find((l) => l.invoiceNo === invoiceNo);
    if (line) return { currency: getLineCurrency(line), exchangeRateToINR: line.exchangeRateToINR ?? 1 };
  }
  return null;
}

/**
 * Rate prefill for a new invoice in `currency`. Only ever the project's own
 * current exchange rate, and only when the project's Quantity Details
 * currency IS that same currency — a USD project's rate is never reused for
 * EUR/AED/etc. Otherwise blank, so Accounts must enter one. Never fetched
 * or invented.
 */
export function getDefaultRateFor(project: Project, currency: InvoiceCurrency): string {
  if (!isForeignCurrency(currency)) return "";
  if (project.currency === currency && Number.isFinite(project.currentExchangeRate) && project.currentExchangeRate > 0) {
    return String(project.currentExchangeRate);
  }
  return "";
}

/** A plain decimal number as typed (e.g. "83", "83.25", ".5") — rejects "1e3", "0x10", "83,25" and other forms Number() would quietly reinterpret. */
const RATE_PATTERN = /^(\d+(\.\d*)?|\.\d+)$/;

/**
 * The currency + rate an invoice form STARTS with each time it is opened
 * (the form remounts per open, so nothing carries over from a previous one):
 * - an invoice that already has saved lines: their currency and rate;
 * - otherwise: the project's current lock (or INR when unlocked — e.g. after
 *   the invoice that established a lock was deleted and the backend
 *   released it), with a rate prefilled only per getDefaultRateFor().
 */
export function getInitialCurrencySelection(project: Project, invoiceNo: string): { currency: InvoiceCurrency; rateInput: string } {
  const existing = getInvoiceCycleCurrency(project, invoiceNo);
  if (existing) {
    return {
      currency: existing.currency,
      rateInput: isForeignCurrency(existing.currency) ? String(existing.exchangeRateToINR) : "",
    };
  }
  const currency = getProjectInvoiceCurrencyLock(project) ?? "INR";
  return { currency, rateInput: getDefaultRateFor(project, currency) };
}

/**
 * Null when valid; otherwise a user-facing message. INR never needs a rate
 * (always 1). Accounts enters the rate; no per-currency range is imposed
 * (confirmed Oct 2026) — same rule as the backend's assertValidForeignRate():
 * only blank, non-numeric, zero, negative and non-finite rates are rejected.
 */
export function validateExchangeRate(currency: InvoiceCurrency, rateInput: string): string | null {
  if (!isForeignCurrency(currency)) return null;
  const trimmed = rateInput.trim();
  if (trimmed === "") return `Enter the ${currency} to INR exchange rate.`;
  const rate = Number(trimmed);
  if (!RATE_PATTERN.test(trimmed) || !Number.isFinite(rate) || rate <= 0) return "Exchange rate must be a number greater than 0.";
  return null;
}

export interface InvoiceCurrencySelection {
  currency: InvoiceCurrency;
  /** Only meaningful for a foreign currency once validateExchangeRate() passed; 1 for INR. */
  exchangeRateToINR: number;
}

type LineCurrencyFields = Pick<InvoiceLine, "currency" | "exchangeRateToINR" | "invoiceAmountOriginal" | "invoiceAmountINR">;

/** An amount ENTERED in the invoice currency: INR equivalent = round2(original x rate) — the exact formula the backend re-derives and checks. */
export function amountsFromOriginal(original: number, selection: InvoiceCurrencySelection): LineCurrencyFields {
  if (!isForeignCurrency(selection.currency)) {
    return { currency: "INR", exchangeRateToINR: 1, invoiceAmountOriginal: original, invoiceAmountINR: original };
  }
  const amount = roundToMinorUnit(original, selection.currency);
  return {
    currency: selection.currency,
    exchangeRateToINR: selection.exchangeRateToINR,
    invoiceAmountOriginal: amount,
    invoiceAmountINR: round(amount * selection.exchangeRateToINR),
  };
}

/**
 * Totals for a set of lines each derived via amountsFromInr() — exactly what
 * those lines will be saved with: `original` in the invoice currency (to its
 * own precision — OMR keeps 3 decimals) and `inr`, the saved INR equivalent
 * (sum of each line's own INR, never the total re-converted).
 */
export function sumAmountsFromInr(inrValues: number[], selection: InvoiceCurrencySelection): { original: number; inr: number } {
  let original = 0;
  let inr = 0;
  for (const value of inrValues) {
    const line = amountsFromInr(value, selection);
    original += line.invoiceAmountOriginal ?? 0;
    inr += line.invoiceAmountINR ?? 0;
  }
  return { original: roundToMinorUnit(original, selection.currency), inr: round(inr) };
}

/**
 * An amount DERIVED from an INR value the workspace computed (qty x rate,
 * or a milestone % of contract value). The original amount is floored to
 * its currency's minor unit so its INR equivalent never exceeds the INR
 * value it came from — otherwise billing an activity's full remaining
 * balance could round a few paise over its Work Order Value and be
 * rejected by the backend's ceiling check.
 */
export function amountsFromInr(inrValue: number, selection: InvoiceCurrencySelection): LineCurrencyFields {
  if (!isForeignCurrency(selection.currency)) {
    return { currency: "INR", exchangeRateToINR: 1, invoiceAmountOriginal: inrValue, invoiceAmountINR: inrValue };
  }
  const factor = 10 ** CURRENCY_MINOR_UNITS[selection.currency];
  const original = Math.floor((inrValue / selection.exchangeRateToINR) * factor + 1e-9) / factor;
  return amountsFromOriginal(original, selection);
}
