import { apiClient } from "./apiClient";

/**
 * Phase 4 (central country rates) - Manpower > Manpower Conversion Rates. The manpower conversion rate belongs to a COUNTRY ("1 regional currency unit = X INR"),
 * not to a project. Every call needs the explicit "Manpower Conversion Rates" Module Access grant; saving a version, reviewing what an apply would change,
 * applying and retrying also need the Administrator or PMO Manager role. The server enforces all of it: hiding a button here is only a courtesy.
 */

export interface CountryRateVersion {
  version: number;
  regionalCurrency: string;
  /** Decimal text with 6 decimals, exactly as stored. */
  inrPerRegionalUnit: string;
  effectiveFrom: string;
  createdByName: string;
  createdByRole: string;
  note: string | null;
}

export interface CountryRate {
  regionId: string;
  /** The stored country key (what grants and PR Category use). */
  name: string;
  displayName: string;
  currency: string;
  /** India: fixed at 1, never editable, never converted. */
  fixed: boolean;
  current: CountryRateVersion | null;
  /** Projects this rate converts (stored regional currency = the country's currency). */
  projects: number;
  /** The country's projects in another currency (e.g. a legacy INR project): never converted, never counted. Absent from an older backend. */
  otherCurrencyProjects?: number;
  /** Manpower records of the eligible projects only. */
  rows: { total: number; onLatest: number; behind: number; missing: number };
  openRun: { runId: string; status: string; targetVersion: number } | null;
}

export interface CountryRateList {
  canManage: boolean;
  countries: CountryRate[];
}

export interface ApplyPreviewRow {
  projectResourceId: string;
  employeeNo: string;
  manhourCostInr: number;
  current: { status: string | null; scope: string | null; fxRateVersion: number | null; fxRateInrPerRegional: string | null; manhourCostRegional: string | null };
  proposed: { fxRateVersion: number; fxRateInrPerRegional: string; manhourCostRegional: string };
}

export interface ApplyPreviewProject {
  projectId: string;
  prNo: string;
  projectTitle: string;
  rowCount: number;
  manhourCostInr: number;
  currentRegional: string;
  proposedRegional: string;
  rows: ApplyPreviewRow[];
}

export interface CountryApplyPreview {
  regionId: string;
  displayName: string;
  currency: string;
  rate: CountryRateVersion | null;
  projects: ApplyPreviewProject[];
  totals: { projects: number; rows: number; manhourCostInr: number; currentRegional: string; proposedRegional: string };
}

export interface ApplySummary {
  runId: string | null;
  regionId: string;
  rateVersion: number;
  status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "PARTIAL" | "FAILED";
  projectCount: number;
  succeededCount: number;
  failedCount: number;
}

export interface OpenCountryApplyRun {
  runId: string;
  regionId: string;
  regionName: string;
  targetVersion: number;
  status: string;
  actorName: string;
  createdAt: string;
  lastError: string | null;
  openProjects: { taskId: string; projectId: string; prNo: string; status: string; attempts: number; lastError: string | null }[];
}

export type LegacyClassification = "CONSISTENT" | "LEGACY_PROJECT_RATE" | "OLDER_COUNTRY_VERSION" | "MISSING_RATE" | "NEEDS_REVIEW";

export interface LegacyReviewProject {
  projectId: string;
  prNo: string;
  projectTitle: string;
  classification: LegacyClassification;
  reason: string;
  records: { total: number; consistent: number; legacyProjectRate: number; olderCountryVersion: number; missingRate: number };
  previousRate: string | null;
  previousVersion: number | null;
  previousScope: "PROJECT" | "COUNTRY" | "MIXED" | null;
  approvedRate: string | null;
  approvedVersion: number | null;
  manhourCostInr: number;
  previousRegional: string;
  proposedRegional: string | null;
}

export interface LegacyReview {
  regionId: string;
  displayName: string;
  currency: string;
  approved: { version: number; inrPerRegionalUnit: string } | null;
  legacyRates: { inrPerRegionalUnit: string; projects: number; records: number }[];
  conflict: boolean;
  conflictReason: string | null;
  projects: LegacyReviewProject[];
  totals: Record<LegacyClassification, number> & { projects: number; records: number };
}

/** Read-only: how every existing record of the country was converted. Needs only the Manpower Conversion Rates grant; it changes nothing. */
export function getLegacyReview(regionId: string): Promise<LegacyReview> {
  return apiClient.get<LegacyReview>(`/manhour-conversion-rates/${regionId}/legacy-review`);
}

export function getCountryRates(): Promise<CountryRateList> {
  return apiClient.get<CountryRateList>("/manhour-conversion-rates");
}

export async function getCountryRateHistory(regionId: string): Promise<CountryRateVersion[]> {
  const result = await apiClient.get<{ history: CountryRateVersion[] }>(`/manhour-conversion-rates/${regionId}/history`);
  return result.history;
}

/** Saves a NEW version. Existing project costs are not changed until the version is reviewed and applied. */
export function saveCountryRate(regionId: string, inrPerRegionalUnit: string, note: string): Promise<CountryRate> {
  return apiClient.post<CountryRate>(`/manhour-conversion-rates/${regionId}/versions`, { inrPerRegionalUnit, note: note.trim() === "" ? null : note.trim() });
}

export function previewCountryApply(regionId: string): Promise<CountryApplyPreview> {
  return apiClient.get<CountryApplyPreview>(`/manhour-conversion-rates/${regionId}/apply-preview`);
}

export function applyCountryRate(regionId: string, expectedVersion: number, reason: string): Promise<ApplySummary> {
  return apiClient.post<ApplySummary>(`/manhour-conversion-rates/${regionId}/apply`, { expectedVersion, reason: reason.trim() === "" ? null : reason.trim() });
}

export async function getOpenCountryApplyRuns(): Promise<OpenCountryApplyRun[]> {
  const result = await apiClient.get<{ items: OpenCountryApplyRun[] }>("/manhour-conversion-rates/runs");
  return result.items;
}

export function retryCountryApply(runId: string): Promise<ApplySummary> {
  return apiClient.post<ApplySummary>(`/manhour-conversion-rates/runs/${runId}/retry`, {});
}
