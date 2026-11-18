import { moneyFormatter, regionalCurrencyOf } from "./currencyDisplay";
import type { RegionalCurrencyHolder } from "./currencyDisplay";
import { recordedLdAmount } from "./liquidatedDamages";
import type { LdAmountFields } from "./liquidatedDamages";

/**
 * How a project's recorded Liquidated Damages reads on screen (Phase 4 final): the amount in the currency it was recorded in, with a regional LD in the
 * project's own currency and a legacy rupee amount on a non-India project clearly marked INR. The single place the Project views use, so the label and the
 * number can never disagree.
 */
type LdProject = LdAmountFields & RegionalCurrencyHolder;

/** "₹ 50,000.00" (India), "AED 2,500.00" (regional), "₹ 5,000.00 (INR)" (a legacy rupee amount on a non-India project); a zero in the project's currency for "No". */
export function ldAmountText(p: LdProject): string {
  const projectCurrency = regionalCurrencyOf(p);
  const rec = recordedLdAmount(p, projectCurrency);
  if (!rec) return moneyFormatter(projectCurrency).exact(0);
  const text = moneyFormatter(rec.currency).exact(rec.amount);
  return rec.legacyRupees ? `${text} (INR)` : text;
}

/** "LD Amount" for an India project (unchanged), "LD Amount (AED)" for a regional project, "LD Amount (INR)" for a legacy rupee amount on a non-India project. */
export function ldAmountLabel(p: LdProject): string {
  const projectCurrency = regionalCurrencyOf(p);
  if (projectCurrency === "INR") return "LD Amount";
  const rec = recordedLdAmount(p, projectCurrency);
  return `LD Amount (${rec?.legacyRupees ? "INR" : projectCurrency})`;
}
