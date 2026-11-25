import { z } from "zod";
import { AppError } from "../../shared/utils/AppError.js";
import { isValidPrCategory } from "./project.constants.js";

/**
 * Which tax setting a project's Commercial Summary uses (Nov 2026). THE single place that decides it.
 *
 *  - "GST": India, exactly as before (Project.gstApplicable). Also kept for a LEGACY project (no regional currency: it was created before country
 *    currencies existed and keeps behaving as it always did) and for a blank or unrecognised PR Category.
 *  - "TAX": every other country (Project.taxApplicable / taxRatePercent), calculated on the project's regional Work Order Value.
 *
 * The country is the project's stored PR Category - the same key prCategoryCountry.ts maps to a country (Region.name). It is NEVER derived from the
 * transaction currency, the PR number or the user. `regionalCurrency` is only the legacy marker here: whether the project has one, not which.
 *
 * Project Tax is a Commercial Summary setting only: invoices, GST snapshots, payments and payment milestones never read it.
 */
export type ProjectTaxMode = "GST" | "TAX";

const INDIA_PR_CATEGORY = "India";

export function resolveProjectTaxMode(prCategory: string | null | undefined, regionalCurrency: string | null | undefined): ProjectTaxMode {
  const category = (prCategory ?? "").trim();
  if (!isValidPrCategory(category) || category === INDIA_PR_CATEGORY) return "GST";
  return regionalCurrency ? "TAX" : "GST";
}

/** A percentage 0..100 with at most 4 decimals (the column is Decimal(7,4)). Strict: text is refused, so "" can never become 0%. NULL = Not Set. */
export const taxRatePercentField = z
  .number({ message: "Tax Rate must be a number." })
  .min(0, "Tax Rate cannot be below 0%.")
  .max(100, "Tax Rate cannot be above 100%.")
  .refine((v) => Math.abs(v * 10000 - Math.round(v * 10000)) < 1e-6, "Tax Rate can have at most 4 decimal places.")
  .optional()
  .nullable();

export const taxApplicableField = z.boolean().optional().nullable();

export interface TaxFieldsInput {
  taxApplicable?: boolean | null | undefined;
  taxRatePercent?: number | null | undefined;
}

export const TAX_NOT_ALLOWED_MESSAGE =
  "Tax Applicability and Tax Rate apply only to projects outside India. This project uses the GST setting.";

/** Refuses a Tax value on a GST project (India or legacy). An omitted or null field carries no value, so it is always allowed. */
export function assertTaxFieldsAllowed(mode: ProjectTaxMode, fields: TaxFieldsInput, prNo?: string): void {
  if (mode !== "GST") return;
  const hasApplicable = fields.taxApplicable !== undefined && fields.taxApplicable !== null;
  const hasRate = fields.taxRatePercent !== undefined && fields.taxRatePercent !== null;
  if (hasApplicable || hasRate) throw new AppError(prNo ? `${prNo}: ${TAX_NOT_ALLOWED_MESSAGE}` : TAX_NOT_ALLOWED_MESSAGE, 400);
}
