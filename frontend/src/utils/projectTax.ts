import type { Project } from "../types/Project";
import type { PrCategoryCountryReference } from "../services/projectCountryImportService";
import { isSupportedCurrency, CURRENCY_MINOR_UNITS } from "../constants/currencies";

/**
 * Project Tax (Nov 2026) - the Commercial Summary Tax setting of a project OUTSIDE India. India (and legacy projects) keep the GST card and the
 * calculation in quantityCalculations.ts, untouched.
 *
 *  - WHICH card a project shows is decided by the server (Backend modules/projects/projectTax.rules.ts): `taxMode` on a saved project, and per PR
 *    Category on GET /projects/pr-category-countries for a form that has no saved verdict yet. Never derived from the currency.
 *  - Tax Amount and Grand Total are never stored: they are worked out here from the saved rate and the current regional Work Order Value, so they
 *    follow every change of quantity, unit rate, currency or exchange rate.
 *  - Nothing here is read by invoices, GST snapshots, payments or payment milestones.
 */
export type ProjectTaxMode = "GST" | "TAX";

export const TAX_RATE_PRESETS: readonly number[] = [0, 2, 5, 10, 12, 18];

/** The card to show: the server's verdict for the saved record while its category is unchanged, else its verdict for the chosen category. */
export function resolveTaxMode(
  project: Pick<Project, "prCategory" | "taxMode" | "taxModeCategory">,
  reference: PrCategoryCountryReference | null | undefined
): ProjectTaxMode {
  if (project.taxMode && project.taxModeCategory === project.prCategory) return project.taxMode;
  return reference?.items.find((i) => i.prCategory === project.prCategory)?.taxMode ?? "GST";
}

/** False only for India, a blank category and a saved GST (legacy) project: those never send Tax fields (the server would refuse them). */
export function taxFieldsApply(project: Pick<Project, "prCategory" | "taxMode" | "taxModeCategory">): boolean {
  if (!project.prCategory || project.prCategory === "India") return false;
  return !(project.taxMode === "GST" && project.taxModeCategory === project.prCategory);
}

/**
 * The Tax fields of a save. A value this browser does not know (undefined - an older cached copy, a form never touched) is NOT sent, so it can never
 * wipe what is saved; null is sent only when the form really holds "no rate" (loaded as Not Set, or the Custom box was emptied).
 */
export function taxPayloadFields(project: Project): { taxApplicable?: boolean | null; taxRatePercent?: number | null } {
  if (!taxFieldsApply(project)) return {};
  return {
    ...(project.taxApplicable !== undefined ? { taxApplicable: project.taxApplicable } : {}),
    ...(project.taxRatePercent !== undefined ? { taxRatePercent: project.taxRatePercent } : {}),
  };
}

/** NOT_SET: no choice made. RATE_MISSING: Applicable but no rate yet. In both the Tax Amount is unknown, never assumed to be 0%. */
export type ProjectTaxStatus = "NOT_SET" | "NOT_APPLICABLE" | "RATE_MISSING" | "APPLIED";

export interface ProjectTaxFigures {
  status: ProjectTaxStatus;
  /** The regional Work Order Value, rounded to the currency's decimals. */
  workOrderValue: number;
  /** null = unknown (Not Set / no rate); 0 when Not Applicable. */
  taxAmount: number | null;
  /** Work Order Value plus the Tax Amount (the Work Order Value alone while the Tax Amount is unknown or 0). */
  grandTotal: number;
}

const decimalsOf = (currency: string): number => (isSupportedCurrency(currency) ? CURRENCY_MINOR_UNITS[currency] : 2);

/** A non-negative amount in whole minor units, rounded half up on its decimal text (so 1.005 is 101, never 100 through binary noise). */
function toMinorUnits(value: number, decimals: number): bigint {
  const safe = Number.isFinite(value) && value > 0 ? value : 0;
  const [whole = "0", fraction = ""] = safe.toFixed(decimals + 6).split(".");
  const kept = BigInt(whole + fraction.slice(0, decimals));
  return fraction.charCodeAt(decimals) >= "5".charCodeAt(0) ? kept + 1n : kept;
}

/**
 * Tax Amount = Work Order Value x Rate / 100, in the currency's minor units (OMR 3 decimals, the others 2), rounded half up with whole-number
 * arithmetic. The Grand Total is the sum of the two ROUNDED figures, so the three numbers on screen always add up.
 */
export function computeProjectTax(input: {
  workOrderValue: number;
  currency: string;
  applicable: boolean | null | undefined;
  ratePercent: number | null | undefined;
}): ProjectTaxFigures {
  const decimals = decimalsOf(input.currency);
  const scale = 10 ** decimals;
  const base = toMinorUnits(input.workOrderValue, decimals);
  const workOrderValue = Number(base) / scale;
  const untaxed = (status: ProjectTaxStatus, taxAmount: number | null): ProjectTaxFigures => ({ status, workOrderValue, taxAmount, grandTotal: workOrderValue });
  if (input.applicable === false) return untaxed("NOT_APPLICABLE", 0);
  if (input.applicable !== true) return untaxed("NOT_SET", null);
  if (typeof input.ratePercent !== "number" || !Number.isFinite(input.ratePercent)) return untaxed("RATE_MISSING", null);
  const rate = BigInt(Math.round(input.ratePercent * 10000)); // the rate carries at most 4 decimals
  const divisor = 100n * 10000n;
  const tax = (base * rate + divisor / 2n) / divisor;
  return { status: "APPLIED", workOrderValue, taxAmount: Number(tax) / scale, grandTotal: Number(base + tax) / scale };
}

/** What the Custom box holds: a rate 0..100 with up to 4 decimals, nothing (empty), or an entry that is not a valid rate. */
export function parseTaxRateInput(text: string): { rate: number | null; error: string | null } {
  const value = text.trim();
  if (value === "") return { rate: null, error: "Enter a tax percentage." };
  if (!/^(\d+(\.\d{0,4})?|\.\d{1,4})$/.test(value)) return { rate: null, error: "Enter a number with up to 4 decimals." };
  const rate = Number(value);
  if (rate > 100) return { rate: null, error: "Tax Rate cannot be above 100%." };
  return { rate, error: null };
}
