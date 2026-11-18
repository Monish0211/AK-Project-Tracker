import { apiClient, ApiError } from "./apiClient";

/**
 * Bulk import: the backend's per-row country check (Global Multi-Country Phase 2). The backend is authoritative: it derives each row's
 * country from that row's OWN PR Category, checks the importing user's access per row, and reports duplicates. The frontend keeps no
 * PR Category -> country table of its own; this file only calls the backend and interprets the answer.
 */

export type RowCountryStatus = "ok" | "blank_category" | "unknown_category" | "no_country" | "not_authorized";

export interface ImportPreviewRow {
  index: number;
  rowNumber: number;
  prNo: string;
  prCategory: string;
  country: { code: string | null; name: string; displayName: string } | null;
  countryStatus: RowCountryStatus;
  duplicate: "none" | "in_file" | "existing";
  errors: string[];
}

export interface ImportPreview {
  /** true when country problems block the import (the server is enforcing country access). */
  enforced: boolean;
  rows: ImportPreviewRow[];
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

export interface ImportRejectedRow {
  rowNumber: number;
  prNo: string;
  prCategory: string;
  country: string | null;
  status: RowCountryStatus;
  errors: string[];
}

export interface ImportRejection {
  message: string;
  rows: ImportRejectedRow[];
  total: number;
  truncated: boolean;
}

export interface PrCategoryCountryReference {
  enforced: boolean;
  items: {
    prCategory: string;
    prNoPrefix: string;
    /** defaultCurrency is the country's regional currency (Phase 3); null or absent when none is configured. */
    country: { code: string | null; name: string; displayName: string; defaultCurrency?: string | null } | null;
    authorized: boolean;
  }[];
}

/** Non-committing: nothing is created. */
export function previewProjectImport(rows: { rowNumber: number; prNo: string; prCategory: string }[]): Promise<ImportPreview> {
  return apiClient.post<ImportPreview>("/projects/import/preview", { rows }, { timeoutMs: 60_000 });
}

export function getPrCategoryCountries(): Promise<PrCategoryCountryReference> {
  return apiClient.get<PrCategoryCountryReference>("/projects/pr-category-countries");
}

/** A row is a problem when it has a duplicate, or (only while the server enforces country access) a country problem. */
export function rowBlocks(row: ImportPreviewRow, enforced: boolean): boolean {
  return row.duplicate !== "none" || (enforced && row.countryStatus !== "ok");
}

/** The import may go ahead only when no row blocks. */
export function previewBlocksImport(preview: ImportPreview): boolean {
  return preview.rows.some((row) => rowBlocks(row, preview.enforced));
}

/** Plain-language label for a row's country status (what the user reads in the Authorization column). */
export function countryStatusLabel(status: RowCountryStatus, enforced: boolean): string {
  switch (status) {
    case "ok":
      return "Authorized";
    case "not_authorized":
      return enforced ? "Not authorized" : "Not authorized (not yet enforced)";
    case "blank_category":
      return "PR Category blank";
    case "unknown_category":
      return "PR Category not recognised";
    case "no_country":
      return "No country configured";
  }
}

/** Reads the per-row report a rejected import carries, or null when the error is not that kind of rejection. */
export function importRejectionFromError(error: unknown): ImportRejection | null {
  if (!(error instanceof ApiError) || (error.status !== 400 && error.status !== 403)) return null;
  const details = error.details as { rejectedRows?: ImportRejectedRow[]; totalRejectedRows?: number; truncated?: boolean } | undefined;
  if (!details || !Array.isArray(details.rejectedRows)) return null;
  return { message: error.message, rows: details.rejectedRows, total: details.totalRejectedRows ?? details.rejectedRows.length, truncated: details.truncated === true };
}

// ---- the Add / Edit Project form: PR Category -> country hint ---------------------------------------------------------------

export interface CategoryOptionState {
  disabled: boolean;
  /** What the option reads: the category, plus the country when its display name differs (e.g. FZI shows as FZE). */
  label: string;
}

/**
 * How one PR Category option looks in the Add / Edit Project form. The server is the enforcement point (it refuses a country the user does
 * not hold and refuses moving an existing project to another country); this only keeps the form from offering what would be refused.
 * The category already on the project is never disabled, so an existing record can always be saved unchanged.
 */
export function categoryOptionState(
  reference: PrCategoryCountryReference | null | undefined,
  category: string,
  opts: { currentCategory: string; lockCountry: boolean }
): CategoryOptionState {
  const entry = reference?.items.find((i) => i.prCategory === category);
  const displayName = entry?.country?.displayName;
  const label = displayName && displayName !== category ? `${category} (${displayName})` : category;
  if (category === opts.currentCategory) return { disabled: false, label };
  if (opts.lockCountry) return { disabled: true, label };
  if (reference?.enforced && (!entry || !entry.country || !entry.authorized)) return { disabled: true, label };
  return { disabled: false, label };
}

/** The helper line under the PR Category field, or null when there is nothing to say. */
export function categoryHint(
  reference: PrCategoryCountryReference | null | undefined,
  category: string,
  opts: { lockCountry: boolean }
): string | null {
  if (!reference || !category) return null;
  const entry = reference.items.find((i) => i.prCategory === category);
  if (!entry?.country) return reference.enforced ? "This PR Category is not linked to a country yet. Ask an Administrator to configure it." : null;
  if (reference.enforced && !entry.authorized && !opts.lockCountry) return `You do not have access to create projects for ${entry.country.displayName}.`;
  const currency = entry.country.defaultCurrency ? ` · Regional currency: ${entry.country.defaultCurrency}` : "";
  return opts.lockCountry
    ? `Country: ${entry.country.displayName}${currency}. A saved project's country cannot be changed here.`
    : `Country: ${entry.country.displayName}${currency}`;
}
