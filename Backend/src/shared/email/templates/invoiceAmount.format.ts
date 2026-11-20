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
  /**
   * Multi-country (Phase 5): set only for a project whose own currency is not INR. invoiceAmountINR and exchangeRateToINR then carry the PROJECT-currency amount
   * and rate (never a rupee figure), so they are written in that currency.
   */
  projectCurrency?: string | undefined;
}): string {
  if (isSupportedInvoiceCurrency(data.projectCurrency) && data.projectCurrency !== "INR") {
    const project = data.projectCurrency;
    const projectDigits = CURRENCY_MINOR_UNITS[project];
    const equivalent = `${project} ${data.invoiceAmountINR.toLocaleString("en-US", { minimumFractionDigits: projectDigits, maximumFractionDigits: projectDigits })}`;
    const currency = data.invoiceCurrency;
    if (!isSupportedInvoiceCurrency(currency) || currency === project || data.invoiceAmountOriginal == null) return equivalent;
    const digits = CURRENCY_MINOR_UNITS[currency];
    const original = `${currency} ${data.invoiceAmountOriginal.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
    return `${original} (equivalent ${equivalent} at 1 ${currency} = ${project} ${data.exchangeRateToINR ?? "-"})`;
  }
  const inr = `₹${data.invoiceAmountINR.toLocaleString("en-IN")}`;
  const currency = data.invoiceCurrency;
  if (!isSupportedInvoiceCurrency(currency) || currency === "INR" || data.invoiceAmountOriginal == null) {
    return inr;
  }
  const digits = CURRENCY_MINOR_UNITS[currency];
  const original = `${currency} ${data.invoiceAmountOriginal.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  return `${original} (INR equivalent ${inr} at ${data.exchangeRateToINR ?? "-"})`;
}
