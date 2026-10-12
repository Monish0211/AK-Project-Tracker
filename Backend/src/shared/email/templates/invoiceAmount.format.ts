import { CURRENCY_MINOR_UNITS, isSupportedInvoiceCurrency } from "../../../modules/invoices/invoiceCurrency.rules.js";

/**
 * Invoice Currency feature (Oct 2026) — the one way an invoice amount is
 * rendered in an email. An INR line (every pre-feature line included)
 * renders byte-identically to the old per-template formatInr(); a foreign-
 * currency line shows its original amount first (with that currency's own
 * decimal places — 3 for OMR), then the INR equivalent and the recorded
 * rate, so the two are never confused.
 */
export function formatInvoiceAmountForEmail(data: {
  invoiceAmountINR: number;
  invoiceCurrency?: string | undefined;
  invoiceAmountOriginal?: number | null | undefined;
  exchangeRateToINR?: number | undefined;
}): string {
  const inr = `₹${data.invoiceAmountINR.toLocaleString("en-IN")}`;
  const currency = data.invoiceCurrency;
  if (!isSupportedInvoiceCurrency(currency) || currency === "INR" || data.invoiceAmountOriginal == null) {
    return inr;
  }
  const digits = CURRENCY_MINOR_UNITS[currency];
  const original = `${currency} ${data.invoiceAmountOriginal.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  return `${original} (INR equivalent ${inr} at ${data.exchangeRateToINR ?? "-"})`;
}
