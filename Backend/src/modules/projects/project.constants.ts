/**
 * Single shared source for the Project/Work Order status vocabulary used by
 * the ordinary manual create/update API validation (see
 * validators/project.validators.ts). Mirrors the frontend dropdown exactly
 * (frontend/src/pages/Projects/components/GeneralInfoCard.tsx) — kept as
 * plain string arrays (not a Prisma/TS enum) so the column itself stays a
 * flexible `String`, matching every other status-like field in this schema
 * (Employee.status, TimesheetImport.status, InvoiceLine.status).
 *
 * Deliberately NOT used by the Excel import path (importProjectRowSchema in
 * project.validators.ts overrides these two fields back to a permissive
 * free-text string) — real historical project data predates this
 * standardized vocabulary and uses free-form phrasing ("Hold", "In
 * progress", "Issued", etc.) that import must keep accepting. This list is
 * the enforced vocabulary for NEW data entered through the ordinary UI/API
 * only, never a filter applied to already-imported historical values.
 */
export const PROJECT_STATUS_VALUES = ["Not Started", "Ongoing", "Active", "On Hold", "Completed", "Cancelled"] as const;

export const WORK_ORDER_STATUS_VALUES = ["Received", "Yet to Receive", "Pending", "Closed", "Cancelled"] as const;

/**
 * Region -> PR Category -> PR Number prefix business rule. prCategory
 * doubles as "Region" on the Project row itself (see schema.prisma's
 * Project model comment — there is no separate region column), so this map's
 * keys ARE the region list for this purpose and are also the fixed,
 * exhaustive set of values PR Category may now hold — it is no longer an
 * unrestricted free-text dropdown.
 *
 * Deliberately NOT sourced from `REGIONS` in
 * shared/constants/permissions.constants.ts even though the values are
 * identical today: that file's own header comment reserves it for
 * `prisma/seed.ts`'s one-time Region lookup table seeding for User Project
 * Region Access grants ("Application code must never import these to make
 * an access decision") — a completely different concept from a Project's own
 * PR Category, per this feature's own explicit design brief. This map is the
 * single source of truth for the PR-Category-to-prefix rule; every caller
 * (createProject/updateProject in project.service.ts, and the frontend's own
 * mirror in createEmptyProject.ts) reads from it rather than re-deriving it.
 */
export const PR_CATEGORY_PREFIX_MAP = {
  India: "PR-",
  Malaysia: "MYPR",
  Oman: "EE",
  "Abu Dhabi": "PRAD-",
  FZI: "PRI-",
  "Elixir Qatar": "EE-Q-",
  Qatar: "Q-PR-",
} as const;

export type PrCategory = keyof typeof PR_CATEGORY_PREFIX_MAP;

export const PR_CATEGORY_VALUES = Object.keys(PR_CATEGORY_PREFIX_MAP) as PrCategory[];

export function isValidPrCategory(value: string): value is PrCategory {
  return Object.prototype.hasOwnProperty.call(PR_CATEGORY_PREFIX_MAP, value);
}

/**
 * Returns a user-facing error message if prCategory/prNo violate the Region
 * -> PR Category -> PR Number prefix rule, or null if the combination is
 * valid. Three things are enforced together: prCategory must be one of the
 * fixed PR_CATEGORY_VALUES, prNo must start with EXACTLY that category's
 * prefix (case-sensitive — every real PR Number in the system today is
 * consistently uppercase, e.g. "PR-7087", "PR-12006"; there is no existing
 * lowercase convention to preserve), and there must be a non-empty remaining
 * portion after the prefix (a bare "PR-" with nothing after it is not a real
 * PR Number). Does not touch prNo uniqueness — that stays entirely owned by
 * assertPrNoAvailable()/the DB's partial unique index in project.service.ts.
 */
export function validatePrCategoryPrNoRule(prCategory: string, prNo: string): string | null {
  if (!isValidPrCategory(prCategory)) {
    return `Invalid PR Category "${prCategory}". Must be one of: ${PR_CATEGORY_VALUES.join(", ")}.`;
  }

  const expectedPrefix: string = PR_CATEGORY_PREFIX_MAP[prCategory];
  if (!prNo.startsWith(expectedPrefix)) {
    return `PR Number must start with "${expectedPrefix}" for PR Category "${prCategory}".`;
  }

  if (prNo.slice(expectedPrefix.length).trim() === "") {
    return `PR Number must include a value after the "${expectedPrefix}" prefix.`;
  }

  return null;
}
