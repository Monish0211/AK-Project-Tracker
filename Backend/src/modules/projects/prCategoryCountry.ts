import { AppError } from "../../shared/utils/AppError.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { getCountryAccessMode, grantsAllowRegion, loadCountryGrants } from "../../shared/utils/countryAccess.js";
import { PR_CATEGORY_PREFIX_MAP, PR_CATEGORY_VALUES, isValidPrCategory } from "./project.constants.js";
import type { PrCategory } from "./project.constants.js";
import { findActiveProjectsByPrNos } from "./repository/project.repository.js";

/**
 * PR Category -> country (Global Multi-Country Phase 2). THE single backend place that says which country a PR Category belongs to.
 *
 *  - The categories are the existing, fixed PR_CATEGORY_VALUES (project.constants.ts): none is invented here.
 *  - The country is the Region row whose stored `name` equals the category text exactly. It is never derived from the PR number prefix,
 *    from the creator, from the user's active country, or from row order in an import.
 *  - A category with no active matching Region row is reported as "no_country" and is never guessed into a country.
 *  - The frontend does not keep its own copy: it reads this through GET /projects/pr-category-countries and the import preview endpoint.
 */

export interface MappedCountry {
  regionId: string;
  code: string | null;
  name: string;
  displayName: string;
  /** The country's regional default currency (Region.defaultCurrency), or null when none is configured. */
  defaultCurrency: string | null;
}

export type CountryResolution =
  | { kind: "mapped"; country: MappedCountry }
  | { kind: "blank_category" }
  | { kind: "unknown_category" }
  | { kind: "no_country" };

/** Loads every Region a known PR Category could name, once. */
async function loadCategoryRegions(): Promise<Map<string, MappedCountry>> {
  const rows = await prisma.region.findMany({
    where: { name: { in: [...PR_CATEGORY_VALUES] }, isActive: true },
    select: { id: true, code: true, name: true, displayName: true, defaultCurrency: true },
  });
  return new Map(rows.map((r) => [r.name, { regionId: r.id, code: r.code, name: r.name, displayName: r.displayName ?? r.name, defaultCurrency: r.defaultCurrency }]));
}

function resolveWith(regions: Map<string, MappedCountry>, prCategory: string | null | undefined): CountryResolution {
  const category = (prCategory ?? "").trim();
  if (category === "") return { kind: "blank_category" };
  if (!isValidPrCategory(category)) return { kind: "unknown_category" };
  const country = regions.get(category);
  return country ? { kind: "mapped", country } : { kind: "no_country" };
}

export async function resolveCountryForPrCategory(prCategory: string | null | undefined): Promise<CountryResolution> {
  return resolveWith(await loadCategoryRegions(), prCategory);
}

export interface PrCategoryCountryEntry {
  prCategory: PrCategory;
  prNoPrefix: string;
  /** null = this category has no active country configured yet (reported, never guessed). */
  country: { code: string | null; name: string; displayName: string; defaultCurrency: string | null } | null;
  /** true when the CALLER's grants allow creating a project in this country (always true while country access is not enforced). */
  authorized: boolean;
}

/** The mapping reference for the UI and for the PMO: every existing category, its country, and whether the caller may use it. */
export async function listPrCategoryCountries(userId: string): Promise<{ enforced: boolean; items: PrCategoryCountryEntry[] }> {
  const mode = getCountryAccessMode();
  const regions = await loadCategoryRegions();
  const grants = mode === "enforce" ? await loadCountryGrants(userId) : null;
  return {
    enforced: mode === "enforce",
    items: PR_CATEGORY_VALUES.map((prCategory) => {
      const country = regions.get(prCategory) ?? null;
      return {
        prCategory,
        prNoPrefix: PR_CATEGORY_PREFIX_MAP[prCategory],
        country: country ? { code: country.code, name: country.name, displayName: country.displayName, defaultCurrency: country.defaultCurrency } : null,
        authorized: grants === null ? true : country !== null && grantsAllowRegion(grants, country.regionId),
      };
    }),
  };
}

/**
 * Create-time country check for a single project (also used by PR Request approval, where the approving user is the creator).
 * Returns the project's country (Region id) — null only while the mode is not enforcing and the category has no country. Enforce:
 * the category must name an active country, and the creator must hold that country (the creator's own home country is irrelevant, and
 * the active-country selector never decides it).
 */
export async function resolveAndAuthorizeCreateCountry(
  prCategory: string,
  creatorUserId: string
): Promise<{ regionId: string | null; regionalCurrency: string | null }> {
  const resolution = await resolveCountryForPrCategory(prCategory);
  const mode = getCountryAccessMode();
  if (resolution.kind !== "mapped") {
    if (mode === "enforce") {
      throw new AppError(`PR Category "${prCategory}" is not linked to a country, so the project cannot be created. Ask an Administrator to configure it.`, 400);
    }
    return { regionId: null, regionalCurrency: null };
  }
  if (mode !== "off") {
    const grants = await loadCountryGrants(creatorUserId);
    if (!grantsAllowRegion(grants, resolution.country.regionId)) {
      if (mode === "enforce") throw new AppError(`You do not have access to create projects for ${resolution.country.displayName}.`, 403);
      console.warn(`[CountryAccess][shadow] user ${creatorUserId} would be refused creating a project for ${resolution.country.displayName}`);
    }
  }
  // The regional currency is the country's configured default (null while none is configured: the project is then a legacy-style INR one).
  return { regionId: resolution.country.regionId, regionalCurrency: resolution.country.defaultCurrency };
}

// ---------------------------------------------------------------------------------------------------------------------
// Bulk import: per-row country identification and authorization (non-committing; shared by the preview and the real import)
// ---------------------------------------------------------------------------------------------------------------------

export type RowCountryStatus = "ok" | "blank_category" | "unknown_category" | "no_country" | "not_authorized";

export interface ImportRowCheckInput {
  prNo: string;
  prCategory: string;
  /** The row's number in the user's file (Excel row), when the client knows it. */
  rowNumber?: number | undefined;
}

export interface ImportRowCheck {
  index: number;
  rowNumber: number;
  prNo: string;
  prCategory: string;
  country: { code: string | null; name: string; displayName: string } | null;
  /** The resolved country id, used by the import to stamp each created project. */
  regionId: string | null;
  /** The country's regional default currency, stamped on each created project (Phase 3). */
  regionalCurrency: string | null;
  countryStatus: RowCountryStatus;
  /** "in_file" = the PR Number appears more than once in this file; "existing" = an active project already holds it. */
  duplicate: "none" | "in_file" | "existing";
  errors: string[];
}

export interface ImportCheckResult {
  /** true when country problems block an import (COUNTRY_ACCESS_MODE=enforce). Shown either way so a preview can warn before it is switched on. */
  enforced: boolean;
  rows: ImportRowCheck[];
  summary: {
    total: number;
    ok: number;
    byCountry: { country: string; rows: number }[];
    blankCategory: number;
    unknownCategory: number;
    noCountry: number;
    notAuthorized: number;
    duplicateInFile: number;
    duplicateExisting: number;
  };
}

const COUNTRY_MESSAGES: Record<Exclude<RowCountryStatus, "ok" | "not_authorized">, string> = {
  blank_category: "PR Category is blank. Fill it in; the country is never guessed from the PR Number prefix.",
  unknown_category: "PR Category is not one of the recognised categories.",
  no_country: "PR Category is not linked to a country yet. Ask an Administrator to configure it.",
};

/**
 * Each row's country comes from ITS OWN PR Category — not from the PR prefix, the importing user, their active country, or the row order —
 * so one file can mix countries. Authorization is checked per row against the importing user's grants (never the active-country selector).
 * Duplicate detection is the existing rule (case-insensitive within the file; exact match against active projects), reported per row.
 */
export async function checkImportRows(rows: ImportRowCheckInput[], userId: string): Promise<ImportCheckResult> {
  const mode = getCountryAccessMode();
  const regions = await loadCategoryRegions();
  const grants = await loadCountryGrants(userId);

  const keyCounts = new Map<string, number>();
  for (const r of rows) {
    const key = r.prNo.trim().toLowerCase();
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  const existingNos = new Set((await findActiveProjectsByPrNos(rows.map((r) => r.prNo))).map((p) => p.prNo));

  const checks: ImportRowCheck[] = rows.map((row, index) => {
    const resolution = resolveWith(regions, row.prCategory);
    let countryStatus: RowCountryStatus;
    let country: ImportRowCheck["country"] = null;
    let regionId: string | null = null;
    let regionalCurrency: string | null = null;
    const errors: string[] = [];
    if (resolution.kind === "mapped") {
      country = { code: resolution.country.code, name: resolution.country.name, displayName: resolution.country.displayName };
      regionId = resolution.country.regionId;
      regionalCurrency = resolution.country.defaultCurrency;
      if (grantsAllowRegion(grants, resolution.country.regionId)) {
        countryStatus = "ok";
      } else {
        countryStatus = "not_authorized";
        errors.push(`You do not have access to ${resolution.country.displayName}.`);
      }
    } else {
      countryStatus = resolution.kind;
      errors.push(COUNTRY_MESSAGES[resolution.kind]);
    }
    let duplicate: ImportRowCheck["duplicate"] = "none";
    if ((keyCounts.get(row.prNo.trim().toLowerCase()) ?? 0) > 1) {
      duplicate = "in_file";
      errors.push(`PR Number "${row.prNo}" appears more than once in this file.`);
    } else if (existingNos.has(row.prNo)) {
      duplicate = "existing";
      errors.push(`PR Number "${row.prNo}" already exists.`);
    }
    return { index, rowNumber: row.rowNumber ?? index + 1, prNo: row.prNo, prCategory: row.prCategory, country, regionId, regionalCurrency, countryStatus, duplicate, errors };
  });

  const countByCountry = new Map<string, number>();
  for (const c of checks) if (c.country) countByCountry.set(c.country.displayName, (countByCountry.get(c.country.displayName) ?? 0) + 1);
  const count = (s: RowCountryStatus) => checks.filter((c) => c.countryStatus === s).length;
  return {
    enforced: mode === "enforce",
    rows: checks,
    summary: {
      total: checks.length,
      ok: checks.filter((c) => c.countryStatus === "ok" && c.duplicate === "none").length,
      byCountry: [...countByCountry].map(([country, n]) => ({ country, rows: n })).sort((a, b) => a.country.localeCompare(b.country)),
      blankCategory: count("blank_category"),
      unknownCategory: count("unknown_category"),
      noCountry: count("no_country"),
      notAuthorized: count("not_authorized"),
      duplicateInFile: checks.filter((c) => c.duplicate === "in_file").length,
      duplicateExisting: checks.filter((c) => c.duplicate === "existing").length,
    },
  };
}

/** The cap on problem rows echoed in an error body, so a very large bad file cannot produce an unbounded response. */
const MAX_PROBLEM_ROWS_IN_ERROR = 500;

/**
 * Approved policy (O-26): an import with any row the user cannot import because of country is rejected WHOLE — nothing is created — with
 * a row-by-row report. Approved policy (O-34): a blank PR Category is a row error, never guessed. Only enforced in enforce mode.
 * Duplicate PR Numbers keep their existing 409 handling in bulkImportProjects.
 */
export function assertImportCountriesAcceptable(result: ImportCheckResult): void {
  if (!result.enforced) return;
  const problems = result.rows.filter((r) => r.countryStatus !== "ok");
  if (problems.length === 0) return;
  const status = problems.some((r) => r.countryStatus === "not_authorized") ? 403 : 400;
  const shown = problems.slice(0, MAX_PROBLEM_ROWS_IN_ERROR).map((r) => ({
    rowNumber: r.rowNumber,
    prNo: r.prNo,
    prCategory: r.prCategory,
    country: r.country?.displayName ?? null,
    status: r.countryStatus,
    errors: r.errors,
  }));
  throw new AppError(`Import rejected: ${problems.length} row(s) cannot be imported because of their country. No projects were created.`, status, {
    rejectedRows: shown,
    totalRejectedRows: problems.length,
    truncated: problems.length > shown.length,
  });
}
