import type { InvoiceCurrency } from "../../types/InvoiceItem";
import { CURRENCY_MINOR_UNITS } from "../../constants/currencies";
import { convertBelowThousand, numberToIndianWords } from "./numberToWords";

/** Name of each foreign currency's minor unit, as printed in the amount-in-words line. */
const MINOR_UNIT_NAME: Record<Exclude<InvoiceCurrency, "INR">, string> = {
  USD: "Cents",
  EUR: "Cents",
  AED: "Fils",
  MYR: "Sen",
  QAR: "Dirhams",
  OMR: "Baisa",
};

/** International scale (Billion / Million / Thousand) — foreign-currency invoices are not written in Lakh/Crore. */
function wholeNumberToWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  for (const [size, name] of [[1_000_000_000, "Billion"], [1_000_000, "Million"], [1_000, "Thousand"]] as const) {
    if (n >= size) {
      parts.push(`${wholeNumberToWords(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n > 0) parts.push(convertBelowThousand(n));
  return parts.join(" ");
}

/**
 * "Amount Chargeable (in words)" in the invoice's own currency.
 * - INR: exactly the existing wording (numberToIndianWords — Lakh/Crore, Paise).
 * - Foreign: "USD One Thousand Two Hundred Thirty Four and Fifty Cents Only";
 *   the minor unit uses the currency's own precision (OMR: 3 digits of Baisa).
 */
export function amountToCurrencyWords(amount: number, currency: InvoiceCurrency): string {
  if (currency === "INR") return numberToIndianWords(amount);
  const digits = CURRENCY_MINOR_UNITS[currency];
  const factor = 10 ** digits;
  const totalMinor = Number.isFinite(amount) ? Math.round(Math.abs(amount) * factor) : 0;
  const major = Math.floor(totalMinor / factor);
  const minor = totalMinor % factor;
  let result = `${currency} ${wholeNumberToWords(major)}`;
  if (minor > 0) result += ` and ${convertBelowThousand(minor)} ${MINOR_UNIT_NAME[currency]}`;
  return `${result} Only`;
}
