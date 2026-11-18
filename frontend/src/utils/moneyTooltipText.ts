import { formatBusinessINR, formatFullINR } from "./formatCurrency";
import { formatMoney, formatMoneyCompact } from "./currencyDisplay";

/**
 * What the tooltip says for an amount: the exact figure, the rounded form it was shown as, and how rounding works for that currency. INR keeps the original
 * wording (Lakhs / Crores); every other currency is shown with its own symbol and K / M, through the same shared formatter as the rest of the app.
 */
export function moneyTooltipText(value: number, currency: string = "INR"): { exact: string; compact: string; note: string } {
  if (currency === "INR") {
    return { exact: formatFullINR(value), compact: formatBusinessINR(value), note: "Amounts in the table are rounded to Lakhs/Crores." };
  }
  return { exact: formatMoney(value, currency), compact: formatMoneyCompact(value, currency), note: "Large amounts are rounded to thousands (K) and millions (M)." };
}
