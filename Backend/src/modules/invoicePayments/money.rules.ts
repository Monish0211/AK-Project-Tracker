import { CURRENCY_MINOR_UNITS, normalizeCurrency } from "../invoices/invoiceCurrency.rules.js";
import type { InvoiceCurrency } from "../invoices/invoiceCurrency.rules.js";

/**
 * Invoice Payment workflow (Nov 2026) — exact money arithmetic.
 *
 * Every amount in the settlement engine is an integer count of the currency's MINOR unit held in a BigInt (paise,
 * cents, fils, baisa), so addition and comparison are exact and no floating point ever touches a settlement result.
 * The number of decimals a currency allows comes from the same table the invoice module already uses (INR/USD/EUR/AED/
 * MYR/QAR = 2, OMR = 3) — a 3-decimal OMR amount is never rounded to 2, and a 3-decimal INR amount is rejected rather
 * than rounded.
 *
 * Existing InvoiceLine amounts are stored as Float; floatToMinor() converts such a value once (rounded to the currency's
 * minor unit, exactly like the portal's own round()) and everything after that is integer.
 */

/** Integer digits a single amount may carry. Together with the 3-decimal column this fits Decimal(18, 3). */
export const MAX_INTEGER_DIGITS = 12;

export function decimalPlacesFor(currency: InvoiceCurrency | string): number {
  return CURRENCY_MINOR_UNITS[normalizeCurrency(currency)];
}

/**
 * Parses a user/API amount into minor units. Strict: digits with an optional fractional part of at most the currency's
 * decimals, no sign, no exponent, no thousands separators. Returns null when the input is not valid — callers turn that
 * into a field error; nothing is ever half-read.
 */
export function parseMoney(input: unknown, currency: InvoiceCurrency | string): bigint | null {
  const scale = decimalPlacesFor(currency);
  let text: string;
  if (typeof input === "string") text = input.trim();
  else if (typeof input === "number" && Number.isFinite(input)) text = String(input);
  else return null;

  const match = new RegExp(`^(\\d{1,${MAX_INTEGER_DIGITS}})(?:\\.(\\d{1,${scale}}))?$`).exec(text);
  if (!match) return null;
  const whole = match[1];
  const fraction = (match[2] ?? "").padEnd(scale, "0");
  return BigInt(whole + fraction);
}

/** Minor units -> the exact decimal string for the currency ("125.50", "125.125"). */
export function formatMoney(minor: bigint, currency: InvoiceCurrency | string): string {
  const scale = decimalPlacesFor(currency);
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale);
  return `${negative ? "-" : ""}${whole}${scale > 0 ? `.${fraction}` : ""}`;
}

/** A stored Float amount -> minor units, rounded half-up once to the currency's decimals. */
export function floatToMinor(value: number, currency: InvoiceCurrency | string): bigint {
  const scale = decimalPlacesFor(currency);
  return BigInt(Math.round(value * 10 ** scale));
}

/** Minor units -> a plain number for display-only / INR-equivalent maths in reports (never for settlement). */
export function minorToNumber(minor: bigint, currency: InvoiceCurrency | string): number {
  return Number(minor) / 10 ** decimalPlacesFor(currency);
}

/** Sum of a list of minor-unit amounts. */
export function sumMinor(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

/** A stored Decimal column (Prisma.Decimal or anything with toFixed) -> minor units. The column holds at most the currency's decimals, so toFixed(scale) is exact. */
export function decimalToMinor(value: { toFixed(places: number): string }, currency: InvoiceCurrency | string): bigint {
  const scale = decimalPlacesFor(currency);
  const [whole, fraction = ""] = value.toFixed(scale).split(".");
  return BigInt(whole + fraction.padEnd(scale, "0"));
}
