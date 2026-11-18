import { prisma } from "../../../shared/utils/prismaClient.js";
import { grantedProjectCountryWhere } from "../../../shared/utils/countryAccess.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import { effectiveRegionalCurrency } from "../../quantity/quantityCurrency.rules.js";
import { ldAmountText } from "../projectCompletion.rules.js";

/**
 * Read-only Liquidated Damages classification report (Phase 4 final). It lists how each existing LD record is to be understood and what the proposed
 * treatment is. It writes NOTHING and proposes nothing automatically: an LD amount typed in rupees before regional LD existed is never reinterpreted
 * as a regional amount. A record on a non-India project that has no currency is flagged for a person to decide.
 */
export type LdReviewStatus = "CONSISTENT" | "NEEDS_REVIEW" | "NO_ACTION";

export interface LdReviewRowDto {
  prNo: string;
  country: string;
  projectCurrency: string;
  ldApplicable: boolean | null;
  existingAmount: string | null;
  /** How the stored value is read today. */
  existingInterpretation: string;
  proposedTreatment: string;
  reviewStatus: LdReviewStatus;
}

export interface LdReviewDto {
  summary: { total: number; consistent: number; needsReview: number; noAction: number };
  rows: LdReviewRowDto[];
}

interface ProjectLdFields {
  prNo: string;
  prCategory: string;
  regionalCurrency: string | null;
  projectStatus: string;
  ldApplicable: boolean | null;
  ldAmountINR: unknown;
  ldAmountRegional: unknown;
  ldCurrency: string | null;
}

/** Pure classification of one project's LD record (exported for tests). */
export function classifyLd(p: ProjectLdFields, country: string): LdReviewRowDto {
  const currency = effectiveRegionalCurrency(p.regionalCurrency);
  const base = { prNo: p.prNo, country, projectCurrency: currency, ldApplicable: p.ldApplicable };
  if (p.ldApplicable === null) {
    return {
      ...base,
      existingAmount: null,
      existingInterpretation: "No LD record (completed before LD existed, or imported). Not read as 'No LD'.",
      proposedTreatment: "None. It stays 'not recorded'.",
      reviewStatus: "NO_ACTION",
    };
  }
  if (p.ldApplicable === false) {
    return { ...base, existingAmount: null, existingInterpretation: "'No LD' recorded.", proposedTreatment: "None.", reviewStatus: "NO_ACTION" };
  }
  const rupees = p.ldAmountINR === null || p.ldAmountINR === undefined ? null : Number(p.ldAmountINR);
  const regional = p.ldAmountRegional === null || p.ldAmountRegional === undefined ? null : Number(p.ldAmountRegional);
  if (regional !== null) {
    const matches = (p.ldCurrency ?? "") === currency;
    return matches
      ? {
          ...base,
          existingAmount: ldAmountText(regional, p.ldCurrency),
          existingInterpretation: `Recorded in ${currency}, the project's own currency.`,
          proposedTreatment: `None. Deducted from ${currency} profit.`,
          reviewStatus: "CONSISTENT",
        }
      : {
          ...base,
          existingAmount: ldAmountText(regional, p.ldCurrency),
          existingInterpretation: `Recorded in ${p.ldCurrency ?? "no currency"}, which is not the project's currency (${currency}).`,
          proposedTreatment: "Not deducted anywhere until a person confirms the correct currency.",
          reviewStatus: "NEEDS_REVIEW",
        };
  }
  if (rupees === null) {
    return { ...base, existingAmount: null, existingInterpretation: "LD applies but no amount is stored.", proposedTreatment: "A person must confirm the amount.", reviewStatus: "NEEDS_REVIEW" };
  }
  if (currency === "INR") {
    return {
      ...base,
      existingAmount: ldAmountText(rupees, "INR"),
      existingInterpretation: p.ldCurrency === "INR" ? "Recorded in INR on an INR project." : "Legacy rupee amount on an INR project (consistent).",
      proposedTreatment: "None. Deducted from profit exactly as before.",
      reviewStatus: "CONSISTENT",
    };
  }
  return {
    ...base,
    existingAmount: ldAmountText(rupees, "INR"),
    existingInterpretation: `A rupee amount typed before regional LD existed, on a project in ${currency}. Kept as INR. NOT assumed to be an amount in ${currency}.`,
    proposedTreatment: `Shown as INR and not deducted from ${currency} profit. A person decides whether it is really INR (keep) or really ${currency} (needs an approved correction).`,
    reviewStatus: "NEEDS_REVIEW",
  };
}

export async function getLdReview(user: AccessTokenPayload): Promise<LdReviewDto> {
  const countryWhere = await grantedProjectCountryWhere(user.sub);
  const projects = await prisma.project.findMany({
    where: { isDeleted: false, ...(countryWhere ?? {}), OR: [{ projectStatus: "Completed" }, { ldApplicable: { not: null } }] },
    select: { prNo: true, prCategory: true, regionalCurrency: true, projectStatus: true, ldApplicable: true, ldAmountINR: true, ldAmountRegional: true, ldCurrency: true, region: { select: { name: true, displayName: true } } },
    orderBy: [{ prCategory: "asc" }, { prNo: "asc" }],
  });
  const rows = projects.map((p) => classifyLd(p, p.region?.displayName ?? p.region?.name ?? p.prCategory));
  const count = (s: LdReviewStatus) => rows.filter((r) => r.reviewStatus === s).length;
  return { summary: { total: rows.length, consistent: count("CONSISTENT"), needsReview: count("NEEDS_REVIEW"), noAction: count("NO_ACTION") }, rows };
}
