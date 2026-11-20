import type { InvoiceCurrency } from "../../types/InvoiceItem";
import { CURRENCY_MINOR_UNITS } from "../../constants/currencies";
import { convertBelowThousand, numberToIndianWords } from "./numberToWords";

/**
 * Name of each foreign currency's minor unit, as printed in the amount-in-words line: the singular (exactly one minor unit) and the plural. Fils, Sen and Baisa are
 * the same in both numbers. QAR's minor unit is the Qatari dirham: the amount is always led by its ISO code ("QAR ..."), so it cannot be read as the UAE dirham (AED).
 */
const MINOR_UNIT_NAME: Record<Exclude<InvoiceCurrency, "INR">, { one: string; many: string }> = {
  USD: { one: "Cent", many: "Cents" },
  EUR: { one: "Cent", many: "Cents" },
  AED: { one: "Fils", many: "Fils" },
  MYR: { one: "Sen", many: "Sen" },
  QAR: { one: "Dirham", many: "Dirhams" },
  OMR: { one: "Baisa", many: "Baisa" },
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
  // The tiny epsilon only guards a product such as 1.005 x 100 = 100.49999999999999 from rounding the wrong way; amounts arrive already at their currency's precision.
  const totalMinor = Number.isFinite(amount) ? Math.round(Math.abs(amount) * factor + 1e-7) : 0;
  const major = Math.floor(totalMinor / factor);
  const minor = totalMinor % factor;
  let result = `${currency} ${wholeNumberToWords(major)}`;
  if (minor > 0) result += ` and ${convertBelowThousand(minor)} ${minor === 1 ? MINOR_UNIT_NAME[currency].one : MINOR_UNIT_NAME[currency].many}`;
  return `${result} Only`;
}
