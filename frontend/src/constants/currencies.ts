/**
 * The one shared list of supported currency codes — used by Quantity
 * Details (work-order pricing currency) AND the Invoice section (invoice
 * currency). The two are separate concepts that happen to offer the same
 * codes; sharing the list keeps every dropdown consistent. Must match the
 * backend's invoiceCurrency.rules.ts INVOICE_CURRENCIES and
 * pdfImport/validators/enumOptions.ts CURRENCY_OPTIONS.
 */
export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "AED", "MYR", "QAR", "OMR"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_NAMES: Record<SupportedCurrency, string> = {
  INR: "Indian Rupee",
  USD: "US Dollar",
  EUR: "Euro",
  AED: "UAE Dirham",
  MYR: "Malaysian Ringgit",
  QAR: "Qatari Riyal",
  OMR: "Omani Rial",
};

/** ISO 4217 minor units — OMR (baisa) has 3 decimal places, the rest 2. */
export const CURRENCY_MINOR_UNITS: Record<SupportedCurrency, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  AED: 2,
  MYR: 2,
  QAR: 2,
  OMR: 3,
};

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return typeof value === "string" && (SUPPORTED_CURRENCIES as readonly string[]).includes(value);
}
