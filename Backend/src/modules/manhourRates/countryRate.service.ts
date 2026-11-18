import { prisma } from "../../shared/utils/prismaClient.js";
import type { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../shared/utils/AppError.js";
import { assertModuleAccess } from "../../shared/utils/moduleAccess.js";
import { getCountryAccessMode, grantsAllowRegion, loadCountryGrants, userMayUseCountry } from "../../shared/utils/countryAccess.js";
import type { AccessTokenPayload } from "../../shared/types/auth.types.js";
import { effectiveRegionalCurrency, LEGACY_REGIONAL_CURRENCY } from "../quantity/quantityCurrency.rules.js";
import { lockResourcePair } from "../manhourCosting/manhourCosting.repository.js";
import { REFRESH_RUN_STATUS, REFRESH_TASK_STATUS, runStatusFromTasks } from "../manhourCosting/manhourCosting.rules.js";
import type { RefreshRunStatus } from "../manhourCosting/manhourCosting.rules.js";
import { COSTING_STATUS, FX_RATE_SCOPE, needsCountryApply, parseInrPerRegionalUnit, snapshotWithRate } from "./manhourCurrency.rules.js";
import {
  bumpApplyTaskAttempt,
  closeApplyTasks,
  createApplyRun,
  findApplyRun,
  findApplyTask,
  findLatestCountryRate,
  findOpenApplyRunsForRegion,
  findOpenApplyTasksForProject,
  findProjectBasics,
  findRegion,
  findUserName,
  insertCountryRate,
  insertRepriceAudit,
  latestCountryRates,
  listActiveRegions,
  listCountryProjects,
  listCountryRates,
  listInterruptedApplyRunIds,
  listOpenApplyRuns,
  listResourcesForProjects,
  lockCountry,
  lockProject,
  markApplyTaskFailed,
  markApplyTaskSucceeded,
  setApplyRunStatus,
  updateApplyRunProgress,
  updateResourceRegional,
} from "./manhourRate.repository.js";

/**
 * Phase 4 (central country rates) - the manpower conversion rate of a COUNTRY ("1 regional currency unit = X INR"), kept in the common Manpower area.
 *
 * Who may do what (the permission model; every check is enforced here as well as on the routes, so a direct API call cannot bypass any of it):
 *   - Everything needs the explicit "Manpower Conversion Rates" Module Access grant. There is no role bypass: an Administrator is checked like anyone.
 *   - Reading the countries and the history needs only that grant (and country access). A Read Only user with the grant can look, never change.
 *   - Writing (a new version, reviewing what an apply would change, applying, retrying) needs the grant AND the Administrator or PMO Manager role, which is
 *     the Phase 4 rule this feature must not weaken. The grant widens who may SEE; it never lets a non-manager role write.
 *   - Country access still applies: a user only sees and manages the countries they hold.
 *
 * Saving a version rewrites nothing. Only the explicit, previewed apply moves existing rows, and it only re-converts the INR figure: the INR base cost is
 * never touched. India is fixed at 1: it has no version, no edit and is never converted.
 */

export const CONVERSION_RATE_MODULE = "Manpower Conversion Rates";
export const CONVERSION_RATE_WRITER_ROLES = ["Administrator", "PMO Manager"] as const;

export function canWriteConversionRates(roleName: string): boolean {
  return (CONVERSION_RATE_WRITER_ROLES as readonly string[]).includes(roleName);
}

async function assertModule(user: AccessTokenPayload): Promise<void> {
  await assertModuleAccess(user.sub, [CONVERSION_RATE_MODULE], "You do not have access to Manpower Conversion Rates.");
}

async function assertCanWrite(user: AccessTokenPayload): Promise<void> {
  await assertModule(user);
  if (!canWriteConversionRates(user.roleName)) {
    throw new AppError("Only an Administrator or a PMO Manager can change or apply manpower conversion rates.", 403);
  }
}

/** The countries this user may see: every active country, or only the granted ones when country access is enforced. */
async function visibleRegionFilter(user: AccessTokenPayload): Promise<(regionId: string) => boolean> {
  if (getCountryAccessMode() !== "enforce") return () => true;
  const grants = await loadCountryGrants(user.sub);
  return (regionId) => grantsAllowRegion(grants, regionId);
}

async function loadRegionOrThrow(regionId: string, user: AccessTokenPayload) {
  const region = await findRegion(regionId);
  if (!region || !region.isActive) throw new AppError("Country not found.", 404);
  if (!(await userMayUseCountry(user.sub, region.id))) throw new AppError("You do not have access to this country.", 403);
  return region;
}

function isFixedInr(currency: string | null | undefined): boolean {
  return effectiveRegionalCurrency(currency) === LEGACY_REGIONAL_CURRENCY;
}

export interface CountryRateVersionDto {
  version: number;
  regionalCurrency: string;
  inrPerRegionalUnit: string;
  effectiveFrom: Date;
  createdByName: string;
  createdByRole: string;
  note: string | null;
}

type RateRow = NonNullable<Awaited<ReturnType<typeof findLatestCountryRate>>>;

function toVersionDto(row: RateRow): CountryRateVersionDto {
  return {
    version: row.version,
    regionalCurrency: row.regionalCurrency,
    inrPerRegionalUnit: row.inrPerRegionalUnit.toFixed(6),
    effectiveFrom: row.effectiveFrom,
    createdByName: row.createdByName,
    createdByRole: row.createdByRole,
    note: row.note,
  };
}

export interface CountryRateDto {
  regionId: string;
  /** The stored country key (what grants and PR Category use). */
  name: string;
  displayName: string;
  currency: string;
  /** India: fixed at 1, never editable, never converted. */
  fixed: boolean;
  current: CountryRateVersionDto | null;
  projects: number;
  rows: {
    total: number;
    /** Converted with the latest country version. */
    onLatest: number;
    /** Converted with a legacy per-project rate or an older country version: an apply would move them. */
    behind: number;
    /** No rate applied yet. */
    missing: number;
  };
  /** An application of this country's rate that has not completed (pending, processing, partial or failed). */
  openRun: { runId: string; status: string; targetVersion: number } | null;
}

export interface CountryRateListDto {
  canManage: boolean;
  countries: CountryRateDto[];
}

async function buildCountry(region: Awaited<ReturnType<typeof findRegion>> & object, latest: RateRow | undefined): Promise<CountryRateDto> {
  const currency = effectiveRegionalCurrency(region.defaultCurrency);
  const fixed = isFixedInr(region.defaultCurrency);
  const projects = await listCountryProjects(region.id);
  const rows = fixed || projects.length === 0 ? [] : await listResourcesForProjects(projects.map((p) => p.id));
  const latestVersion = latest?.version ?? null;
  const open = await prisma.countryRateApplyRun.findFirst({ where: { regionId: region.id, status: { not: REFRESH_RUN_STATUS.SUCCEEDED } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, targetVersion: true } });
  return {
    regionId: region.id,
    name: region.name,
    displayName: region.displayName ?? region.name,
    currency,
    fixed,
    current: latest ? toVersionDto(latest) : null,
    projects: projects.length,
    rows: {
      total: rows.length,
      onLatest: latestVersion === null ? 0 : rows.filter((r) => !needsCountryApply(r, latestVersion)).length,
      behind: rows.filter((r) => r.costingStatus === COSTING_STATUS.CONVERTED && (latestVersion === null || needsCountryApply(r, latestVersion))).length,
      missing: rows.filter((r) => r.costingStatus !== COSTING_STATUS.CONVERTED).length,
    },
    openRun: open ? { runId: open.id, status: open.status, targetVersion: open.targetVersion } : null,
  };
}

/** Every country the caller may see, India first as the fixed one. */
export async function listCountryConversionRates(user: AccessTokenPayload): Promise<CountryRateListDto> {
  await assertModule(user);
  const [regions, latest, visible] = await Promise.all([listActiveRegions(), latestCountryRates(), visibleRegionFilter(user)]);
  const allowed = regions.filter((r) => visible(r.id) && r.defaultCurrency);
  const countries = await Promise.all(allowed.map((region) => buildCountry(region, latest.get(region.id))));
  countries.sort((a, b) => Number(b.fixed) - Number(a.fixed) || a.displayName.localeCompare(b.displayName));
  return { canManage: canWriteConversionRates(user.roleName), countries };
}

/** Append-only history of a country's versions, newest first. India has none (fixed at 1). */
export async function getCountryRateHistory(regionId: string, user: AccessTokenPayload): Promise<{ regionId: string; fixed: boolean; history: CountryRateVersionDto[] }> {
  await assertModule(user);
  const region = await loadRegionOrThrow(regionId, user);
  const fixed = isFixedInr(region.defaultCurrency);
  return { regionId, fixed, history: fixed ? [] : (await listCountryRates(regionId)).map(toVersionDto) };
}

function assertConfigurable(region: NonNullable<Awaited<ReturnType<typeof findRegion>>>): string {
  if (isFixedInr(region.defaultCurrency)) throw new AppError("India is fixed at 1 (INR): its manpower cost needs no conversion rate and cannot be changed.", 409);
  if (!region.defaultCurrency) throw new AppError("This country has no regional currency configured.", 409);
  return effectiveRegionalCurrency(region.defaultCurrency);
}

export async function setCountryRate(regionId: string, input: { inrPerRegionalUnit: unknown; note?: string | null | undefined }, user: AccessTokenPayload): Promise<CountryRateDto> {
  await assertCanWrite(user);
  const region = await loadRegionOrThrow(regionId, user);
  const currency = assertConfigurable(region);
  const rate = parseInrPerRegionalUnit(input.inrPerRegionalUnit);
  const who = await findUserName(user.sub);
  const createdByName = who?.fullName?.trim() || who?.email || user.email;

  await prisma.$transaction(async (tx) => {
    await lockCountry(tx, regionId);
    // A version cannot be added while an application of the previous one is still being processed: the in-flight run targets a specific version.
    const inFlight = await findOpenApplyRunsForRegion(regionId, tx);
    if (inFlight.length > 0) throw new AppError("The previous rate is still being applied to this country's projects. Wait for it to finish, then save the new version.", 409);
    const latest = await findLatestCountryRate(regionId, tx);
    await insertCountryRate(tx, {
      regionId,
      version: (latest?.version ?? 0) + 1,
      regionalCurrency: currency,
      inrPerRegionalUnit: rate,
      createdByUserId: user.sub,
      createdByName,
      createdByRole: user.roleName,
      note: input.note?.trim() ? input.note.trim() : null,
    });
  });

  const latest = await findLatestCountryRate(regionId);
  return buildCountry(region, latest ?? undefined);
}

export interface ApplyPreviewRowDto {
  projectResourceId: string;
  employeeNo: string;
  manhourCostInr: number;
  current: { status: string | null; scope: string | null; fxRateVersion: number | null; fxRateInrPerRegional: string | null; manhourCostRegional: string | null };
  proposed: { fxRateVersion: number; fxRateInrPerRegional: string; manhourCostRegional: string };
}

export interface ApplyPreviewProjectDto {
  projectId: string;
  prNo: string;
  projectTitle: string;
  rowCount: number;
  manhourCostInr: number;
  currentRegional: string;
  proposedRegional: string;
  rows: ApplyPreviewRowDto[];
}

export interface CountryApplyPreviewDto {
  regionId: string;
  displayName: string;
  currency: string;
  rate: CountryRateVersionDto | null;
  projects: ApplyPreviewProjectDto[];
  totals: { projects: number; rows: number; manhourCostInr: number; currentRegional: string; proposedRegional: string };
}

type ResourceRow = Awaited<ReturnType<typeof listResourcesForProjects>>[number];

function previewRow(row: ResourceRow, latest: RateRow, currency: string): ApplyPreviewRowDto {
  const next = snapshotWithRate(row.manhourCost, currency, latest);
  return {
    projectResourceId: row.id,
    employeeNo: row.employeeNo,
    manhourCostInr: row.manhourCost,
    current: {
      status: row.costingStatus,
      scope: row.fxRateScope,
      fxRateVersion: row.fxRateVersion,
      fxRateInrPerRegional: row.fxRateInrPerRegional ? row.fxRateInrPerRegional.toFixed(6) : null,
      manhourCostRegional: row.manhourCostRegional ? row.manhourCostRegional.toFixed(3) : null,
    },
    proposed: {
      fxRateVersion: latest.version,
      fxRateInrPerRegional: latest.inrPerRegionalUnit.toFixed(6),
      manhourCostRegional: (next.manhourCostRegional as NonNullable<typeof next.manhourCostRegional>).toFixed(3),
    },
  };
}

const sum3 = (values: string[]) => values.reduce((acc, v) => acc + Number(v), 0).toFixed(3);

/** Read-only: which projects and rows an apply would change, with the old and new figures, before anything is written. */
export async function previewCountryApply(regionId: string, user: AccessTokenPayload): Promise<CountryApplyPreviewDto> {
  await assertCanWrite(user);
  const region = await loadRegionOrThrow(regionId, user);
  const currency = assertConfigurable(region);
  const latest = await findLatestCountryRate(regionId);
  const base = { regionId, displayName: region.displayName ?? region.name, currency, rate: latest ? toVersionDto(latest) : null };
  if (!latest) return { ...base, projects: [], totals: { projects: 0, rows: 0, manhourCostInr: 0, currentRegional: "0.000", proposedRegional: "0.000" } };

  const projects = await listCountryProjects(regionId);
  const rows = projects.length === 0 ? [] : await listResourcesForProjects(projects.map((p) => p.id));
  const out: ApplyPreviewProjectDto[] = [];
  for (const project of projects) {
    if (effectiveRegionalCurrency(project.regionalCurrency) !== currency) continue; // never reinterpret a project whose currency differs from the country's
    const affected = rows.filter((r) => r.projectId === project.id && needsCountryApply(r, latest.version));
    if (affected.length === 0) continue;
    const items = affected.map((r) => previewRow(r, latest, currency));
    out.push({
      projectId: project.id,
      prNo: project.prNo,
      projectTitle: project.projectTitle,
      rowCount: items.length,
      manhourCostInr: Math.round(items.reduce((a, i) => a + i.manhourCostInr, 0) * 100) / 100,
      currentRegional: sum3(items.map((i) => i.current.manhourCostRegional ?? "0")),
      proposedRegional: sum3(items.map((i) => i.proposed.manhourCostRegional)),
      rows: items,
    });
  }
  return {
    ...base,
    projects: out,
    totals: {
      projects: out.length,
      rows: out.reduce((a, p) => a + p.rowCount, 0),
      manhourCostInr: Math.round(out.reduce((a, p) => a + p.manhourCostInr, 0) * 100) / 100,
      currentRegional: sum3(out.map((p) => p.currentRegional)),
      proposedRegional: sum3(out.map((p) => p.proposedRegional)),
    },
  };
}

// ---- legacy-record review (read-only) ------------------------------------------------------------------------------------------------------------------

export type LegacyClassification = "CONSISTENT" | "LEGACY_PROJECT_RATE" | "OLDER_COUNTRY_VERSION" | "MISSING_RATE" | "NEEDS_REVIEW";

/** Worst first: what a reviewer should look at before anything else. */
const CLASSIFICATION_ORDER: LegacyClassification[] = ["NEEDS_REVIEW", "MISSING_RATE", "LEGACY_PROJECT_RATE", "OLDER_COUNTRY_VERSION", "CONSISTENT"];

export interface LegacyReviewProjectDto {
  projectId: string;
  prNo: string;
  projectTitle: string;
  classification: LegacyClassification;
  /** Plain words: why the project is in this class. */
  reason: string;
  records: { total: number; consistent: number; legacyProjectRate: number; olderCountryVersion: number; missingRate: number };
  /** The rate (and version) its records were last converted with, where known; "mixed" when its records carry different rates. */
  previousRate: string | null;
  previousVersion: number | null;
  previousScope: "PROJECT" | "COUNTRY" | "MIXED" | null;
  /** The approved country rate this project would move to, or null when the country has none yet (nothing is assumed). */
  approvedRate: string | null;
  approvedVersion: number | null;
  manhourCostInr: number;
  previousRegional: string;
  /** What the records would read at the approved country rate; null while the country has no approved rate. */
  proposedRegional: string | null;
}

export interface LegacyReviewDto {
  regionId: string;
  displayName: string;
  currency: string;
  approved: { version: number; inrPerRegionalUnit: string } | null;
  /** Distinct project-level rates the country's legacy records were converted with. More than one is a conflict that needs a person's decision. */
  legacyRates: { inrPerRegionalUnit: string; projects: number; records: number }[];
  conflict: boolean;
  conflictReason: string | null;
  projects: LegacyReviewProjectDto[];
  totals: Record<LegacyClassification, number> & { projects: number; records: number };
}

/**
 * Read-only review of how every record of a country's projects was converted, so a person can see what an apply would change before approving it. Classes: already
 * consistent with the approved country rate; calculated with an older project-level rate; calculated with an older country version; no valid rate applied; or needing
 * review (the country's legacy records disagree, a project's currency does not match the country's, or there is no approved country rate to compare with).
 * It writes nothing and applies nothing: no rate is created, chosen or assumed, and it never picks between conflicting legacy rates.
 */
export async function getLegacyReview(regionId: string, user: AccessTokenPayload): Promise<LegacyReviewDto> {
  await assertModule(user);
  const region = await loadRegionOrThrow(regionId, user);
  const currency = assertConfigurable(region);
  const latest = await findLatestCountryRate(regionId);
  const projects = await listCountryProjects(regionId);
  const rows = projects.length === 0 ? [] : await listResourcesForProjects(projects.map((p) => p.id));

  // The distinct project-level rates among CONVERTED legacy records (scope NULL): more than one is a conflict nobody may resolve by guessing.
  const legacyRows = rows.filter((r) => r.costingStatus === COSTING_STATUS.CONVERTED && (r.fxRateScope ?? null) !== FX_RATE_SCOPE.COUNTRY && r.fxRateInrPerRegional !== null);
  const legacyCounts = new Map<string, { projects: Set<string>; records: number }>();
  for (const r of legacyRows) {
    const key = r.fxRateInrPerRegional!.toFixed(6);
    const entry = legacyCounts.get(key) ?? { projects: new Set<string>(), records: 0 };
    entry.projects.add(r.projectId);
    entry.records += 1;
    legacyCounts.set(key, entry);
  }
  const legacyRates = [...legacyCounts.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([rate, e]) => ({ inrPerRegionalUnit: rate, projects: e.projects.size, records: e.records }));
  const conflict = legacyRates.length > 1;
  const conflictReason = conflict ? `The legacy project-level rates disagree (${legacyRates.map((r) => Number(r.inrPerRegionalUnit)).join(" and ")}). An approved country rate must be chosen by a person; none is assumed.` : null;

  const out: LegacyReviewProjectDto[] = [];
  for (const project of projects) {
    const own = rows.filter((r) => r.projectId === project.id);
    if (own.length === 0) continue;
    const currencyMismatch = effectiveRegionalCurrency(project.regionalCurrency) !== currency;
    const counts = { total: own.length, consistent: 0, legacyProjectRate: 0, olderCountryVersion: 0, missingRate: 0 };
    for (const r of own) {
      if (r.costingStatus !== COSTING_STATUS.CONVERTED) counts.missingRate += 1;
      else if ((r.fxRateScope ?? null) !== FX_RATE_SCOPE.COUNTRY) counts.legacyProjectRate += 1;
      else if (latest && (r.fxRateVersion ?? 0) < latest.version) counts.olderCountryVersion += 1;
      else counts.consistent += 1;
    }
    const own_legacy = own.filter((r) => r.costingStatus === COSTING_STATUS.CONVERTED && r.fxRateInrPerRegional !== null);
    const rates = [...new Set(own_legacy.map((r) => r.fxRateInrPerRegional!.toFixed(6)))];
    const scopes = new Set(own_legacy.map((r) => ((r.fxRateScope ?? null) === FX_RATE_SCOPE.COUNTRY ? "COUNTRY" : "PROJECT")));
    const previousScope = scopes.size === 0 ? null : scopes.size > 1 ? "MIXED" : (scopes.has("COUNTRY") ? "COUNTRY" : "PROJECT");
    const versions = [...new Set(own_legacy.map((r) => r.fxRateVersion))];

    let classification: LegacyClassification;
    let reason: string;
    if (currencyMismatch) {
      classification = "NEEDS_REVIEW";
      reason = `This project's currency is not ${currency}, the currency the country's rate is entered for, so nothing is converted automatically.`;
    } else if (counts.legacyProjectRate > 0 && conflict && !latest) {
      // The legacy rates disagree and nobody has approved a country rate yet: there is nothing to move these records to, and none may be picked for them.
      classification = "NEEDS_REVIEW";
      reason = conflictReason as string;
    } else if (counts.missingRate > 0) {
      classification = "MISSING_RATE";
      reason = latest ? "Some records have no rate applied. Review and apply the approved country rate to convert them." : "Some records have no rate applied and the country has no approved rate yet.";
    } else if (counts.legacyProjectRate > 0) {
      classification = latest ? "LEGACY_PROJECT_RATE" : "NEEDS_REVIEW";
      reason = latest
        ? `Converted with an older project-level rate (${rates.map(Number).join(" and ")}), not with the approved country rate (${Number(latest.inrPerRegionalUnit)}). Review and apply to move it.`
        : "Converted with an older project-level rate, and the country has no approved rate yet to compare it with.";
    } else if (counts.olderCountryVersion > 0) {
      classification = "OLDER_COUNTRY_VERSION";
      reason = "Converted with an earlier version of the country rate. Review and apply the latest version to move it.";
    } else {
      classification = "CONSISTENT";
      reason = "Every record is already converted with the approved country rate.";
    }

    const inrCost = Math.round(own.reduce((s, r) => s + r.manhourCost, 0) * 100) / 100;
    const previousRegional = own.reduce((s, r) => s + Number(r.manhourCostRegional ?? 0), 0);
    const proposed = latest && !currencyMismatch ? own.reduce((s, r) => s + Number((snapshotWithRate(r.manhourCost, currency, latest).manhourCostRegional as NonNullable<ReturnType<typeof snapshotWithRate>["manhourCostRegional"]>).toFixed(3)), 0) : null;
    out.push({
      projectId: project.id,
      prNo: project.prNo,
      projectTitle: project.projectTitle,
      classification,
      reason,
      records: counts,
      previousRate: rates.length === 0 ? null : rates.length === 1 ? rates[0]! : "mixed",
      previousVersion: versions.length === 1 ? (versions[0] ?? null) : null,
      previousScope,
      approvedRate: latest && !currencyMismatch ? latest.inrPerRegionalUnit.toFixed(6) : null,
      approvedVersion: latest && !currencyMismatch ? latest.version : null,
      manhourCostInr: inrCost,
      previousRegional: previousRegional.toFixed(3),
      proposedRegional: proposed === null ? null : proposed.toFixed(3),
    });
  }
  out.sort((a, b) => CLASSIFICATION_ORDER.indexOf(a.classification) - CLASSIFICATION_ORDER.indexOf(b.classification) || a.prNo.localeCompare(b.prNo));

  const totals = { projects: out.length, records: out.reduce((s, p) => s + p.records.total, 0), CONSISTENT: 0, LEGACY_PROJECT_RATE: 0, OLDER_COUNTRY_VERSION: 0, MISSING_RATE: 0, NEEDS_REVIEW: 0 } as LegacyReviewDto["totals"];
  for (const p of out) totals[p.classification] += 1;
  return {
    regionId,
    displayName: region.displayName ?? region.name,
    currency,
    approved: latest ? { version: latest.version, inrPerRegionalUnit: latest.inrPerRegionalUnit.toFixed(6) } : null,
    legacyRates,
    conflict,
    conflictReason,
    projects: out,
    totals,
  };
}

export interface ApplySummaryDto {
  runId: string | null;
  regionId: string;
  rateVersion: number;
  status: RefreshRunStatus;
  projectCount: number;
  succeededCount: number;
  failedCount: number;
}

async function actorName(user: AccessTokenPayload): Promise<string> {
  const who = await findUserName(user.sub);
  return who?.fullName?.trim() || who?.email || user.email;
}

/**
 * The ONLY way existing rows move to a newer country rate. `expectedVersion` must be the version the user previewed, so a version saved in between
 * cannot be applied unseen. The run and one task per affected project are recorded in one transaction; the projects are then converted one at a time,
 * each in its own transaction, and a project that fails stays visibly pending / failed (retry converts only what is still behind: no row twice, none skipped).
 */
export async function applyCountryRate(regionId: string, input: { expectedVersion: number; reason?: string | null | undefined }, user: AccessTokenPayload): Promise<ApplySummaryDto> {
  await assertCanWrite(user);
  const region = await loadRegionOrThrow(regionId, user);
  const currency = assertConfigurable(region);
  const name = await actorName(user);

  const recorded = await prisma.$transaction(async (tx) => {
    await lockCountry(tx, regionId);
    const latest = await findLatestCountryRate(regionId, tx);
    if (!latest) throw new AppError("No manpower conversion rate has been set for this country yet.", 409);
    if (latest.version !== input.expectedVersion) {
      throw new AppError(`The rate changed since this preview (now version ${latest.version}). Review the preview again before applying.`, 409);
    }
    const inFlight = await findOpenApplyRunsForRegion(regionId, tx);
    if (inFlight.length > 0) throw new AppError("An application of this country's rate is already being processed. Wait for it to finish.", 409);
    const projects = await listCountryProjects(regionId, tx);
    const usable = projects.filter((p) => effectiveRegionalCurrency(p.regionalCurrency) === currency);
    const rows = usable.length === 0 ? [] : await listResourcesForProjects(usable.map((p) => p.id), tx);
    const projectIds = usable.filter((p) => rows.some((r) => r.projectId === p.id && needsCountryApply(r, latest.version))).map((p) => p.id);
    if (projectIds.length === 0) return { latestVersion: latest.version, run: null };
    const run = await createApplyRun(tx, {
      regionId,
      regionName: region.displayName ?? region.name,
      targetVersion: latest.version,
      reason: input.reason?.trim() ? input.reason.trim() : null,
      actorUserId: user.sub,
      actorName: name,
      actorRole: user.roleName,
      projectIds,
    });
    return { latestVersion: latest.version, run };
  });

  if (!recorded.run) {
    return { runId: null, regionId, rateVersion: recorded.latestVersion, status: REFRESH_RUN_STATUS.SUCCEEDED, projectCount: 0, succeededCount: 0, failedCount: 0 };
  }
  const summary = await processApplyRunSafely(recorded.run.id);
  return (
    summary ?? { runId: recorded.run.id, regionId, rateVersion: recorded.latestVersion, status: REFRESH_RUN_STATUS.PENDING, projectCount: recorded.run.projectCount, succeededCount: 0, failedCount: 0 }
  );
}

function sameDecimal(a: { equals(other: unknown): boolean } | null, b: { equals(other: unknown): boolean } | null): boolean {
  if (a === null || b === null) return a === b;
  return a.equals(b);
}

/** Converts one project's rows that are not yet on the run's target version. Idempotent: a row already on it is left alone and not audited. */
async function processApplyTask(taskId: string): Promise<void> {
  const task = await findApplyTask(taskId);
  if (!task) return;
  const run = await findApplyRun(task.runId);
  if (!run) return;
  await bumpApplyTaskAttempt(taskId);
  let supersededRuns: string[] = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        await lockProject(tx, task.projectId);
        const fresh = await findApplyTask(taskId, tx);
        if (!fresh || fresh.status === REFRESH_TASK_STATUS.SUCCEEDED) return;

        const latest = await findLatestCountryRate(run.regionId, tx);
        if (!latest || latest.version !== run.targetVersion) {
          throw new AppError(`A newer rate (version ${latest?.version ?? "?"}) has been saved for this country, so version ${run.targetVersion} is no longer current. Review and apply the newer version instead.`, 409);
        }
        const project = await findProjectBasics(task.projectId, tx);
        if (project && !project.isDeleted) {
          if (project.regionId !== run.regionId || effectiveRegionalCurrency(project.regionalCurrency) !== latest.regionalCurrency) {
            throw new AppError("This project is no longer in the country or currency the rate was entered for, so it was not converted.", 409);
          }
          const satisfiable = await findOpenApplyTasksForProject(tx, task.projectId, taskId);
          const candidates = await tx.projectResource.findMany({ where: { projectId: task.projectId }, orderBy: { id: "asc" } });
          const audits: Prisma.ProjectResourceRepriceAuditCreateManyInput[] = [];
          for (const candidate of candidates) {
            await lockResourcePair(tx, task.projectId, candidate.employeeNo);
            const row = await tx.projectResource.findUnique({ where: { id: candidate.id } }); // re-read after the pair lock: a timesheet recompute may have just changed the hours
            if (!row || !needsCountryApply(row, latest.version)) continue;
            const next = snapshotWithRate(row.manhourCost, latest.regionalCurrency, latest);
            const unchanged =
              row.costingStatus === next.costingStatus &&
              row.fxRateScope === next.fxRateScope &&
              row.fxRateVersion === next.fxRateVersion &&
              sameDecimal(row.fxRateInrPerRegional, next.fxRateInrPerRegional) &&
              sameDecimal(row.manhourCostRegional, next.manhourCostRegional);
            if (unchanged) continue;
            await updateResourceRegional(tx, row.id, {
              costCurrency: next.costCurrency,
              costingStatus: next.costingStatus,
              fxRateVersion: next.fxRateVersion,
              fxRateInrPerRegional: next.fxRateInrPerRegional,
              manhourCostRegional: next.manhourCostRegional,
              rateSetAt: next.rateSetAt,
              fxRateScope: next.fxRateScope,
            });
            audits.push({
              runId: run.id,
              regionId: run.regionId,
              projectId: task.projectId,
              projectResourceId: row.id,
              employeeNo: row.employeeNo,
              manhourCostInr: row.manhourCost,
              oldStatus: row.costingStatus,
              oldCostCurrency: row.costCurrency,
              oldFxRateVersion: row.fxRateVersion,
              oldFxRateScope: row.fxRateScope,
              oldFxRateInrPerRegional: row.fxRateInrPerRegional,
              oldManhourCostRegional: row.manhourCostRegional,
              newStatus: next.costingStatus,
              newCostCurrency: next.costCurrency,
              newFxRateVersion: latest.version,
              newFxRateScope: FX_RATE_SCOPE.COUNTRY,
              newFxRateInrPerRegional: latest.inrPerRegionalUnit,
              newManhourCostRegional: next.manhourCostRegional as NonNullable<typeof next.manhourCostRegional>,
              reason: run.reason,
              performedByUserId: run.actorUserId,
              performedByName: run.actorName,
              performedByRole: run.actorRole,
            });
          }
          if (audits.length > 0) await insertRepriceAudit(tx, audits);
          supersededRuns = await closeApplyTasks(tx, satisfiable);
        }
        await markApplyTaskSucceeded(tx, taskId);
      },
      { timeout: 60_000, maxWait: 30_000 }
    );
  } catch (err) {
    await markApplyTaskFailed(taskId, err instanceof Error ? err.message : "Applying the rate failed.");
    return;
  }
  for (const otherRunId of supersededRuns) {
    if (otherRunId !== run.id) await syncApplyRunStatus(otherRunId);
  }
}

async function syncApplyRunStatus(runId: string): Promise<void> {
  const current = await findApplyRun(runId);
  if (!current) return;
  const status = runStatusFromTasks(current.tasks.map((t) => t.status));
  const failed = current.tasks.find((t) => t.status === REFRESH_TASK_STATUS.FAILED);
  await updateApplyRunProgress(runId, status, failed?.lastError ?? null);
}

async function processApplyRun(runId: string): Promise<ApplySummaryDto | null> {
  const run = await findApplyRun(runId);
  if (!run) return null;
  await setApplyRunStatus(runId, REFRESH_RUN_STATUS.PROCESSING);
  for (const task of run.tasks) {
    if (task.status === REFRESH_TASK_STATUS.SUCCEEDED) continue;
    await processApplyTask(task.id);
  }
  const after = await findApplyRun(runId);
  const statuses = (after?.tasks ?? []).map((t) => t.status);
  const status = runStatusFromTasks(statuses);
  const failed = (after?.tasks ?? []).find((t) => t.status === REFRESH_TASK_STATUS.FAILED);
  const updated = await updateApplyRunProgress(runId, status, failed?.lastError ?? null);
  return { runId, regionId: run.regionId, rateVersion: run.targetVersion, status, projectCount: updated.projectCount, succeededCount: updated.succeededCount, failedCount: updated.failedCount };
}

/** Never throws: an unexpected error leaves the run visibly PENDING / FAILED, never reported as done. */
export async function processApplyRunSafely(runId: string): Promise<ApplySummaryDto | null> {
  try {
    return await processApplyRun(runId);
  } catch {
    const run = await findApplyRun(runId);
    return run
      ? { runId, regionId: run.regionId, rateVersion: run.targetVersion, status: run.status as RefreshRunStatus, projectCount: run.projectCount, succeededCount: run.succeededCount, failedCount: run.failedCount }
      : null;
  }
}

/**
 * Retry from the visible failed / pending state. It only runs while the run's version is still the country's LATEST: if a newer version was saved
 * since, retrying the old one would apply a stale rate, and applying the newer one unseen would skip its review, so the user is told to review and
 * apply the newer version (which also closes the old run's open tasks). Nothing is converted twice: only rows still behind the version are touched.
 */
export async function retryCountryApply(runId: string, user: AccessTokenPayload): Promise<ApplySummaryDto> {
  await assertCanWrite(user);
  const run = await findApplyRun(runId);
  if (!run) throw new AppError("Application run not found.", 404);
  await loadRegionOrThrow(run.regionId, user);
  const latest = await findLatestCountryRate(run.regionId);
  if (!latest || latest.version !== run.targetVersion) {
    throw new AppError(`A newer rate (version ${latest?.version ?? "?"}) has been saved for this country. Review and apply the newer version instead of retrying version ${run.targetVersion}.`, 409);
  }
  const summary = await processApplyRun(runId);
  if (!summary) throw new AppError("Application run not found.", 404);
  return summary;
}

export interface OpenApplyRunDto {
  runId: string;
  regionId: string;
  regionName: string;
  targetVersion: number;
  status: string;
  actorName: string;
  createdAt: Date;
  lastError: string | null;
  openProjects: { taskId: string; projectId: string; prNo: string; status: string; attempts: number; lastError: string | null }[];
}

/** Runs that still have a project pending or failed, for the countries the caller may see. */
export async function listOpenCountryApplyRuns(user: AccessTokenPayload): Promise<OpenApplyRunDto[]> {
  await assertModule(user);
  const visible = await visibleRegionFilter(user);
  const runs = (await listOpenApplyRuns()).filter((r) => r.tasks.length > 0 && visible(r.regionId));
  const projectIds = [...new Set(runs.flatMap((r) => r.tasks.map((t) => t.projectId)))];
  const prNos = new Map((await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, prNo: true } })).map((p) => [p.id, p.prNo]));
  return runs.map((r) => ({
    runId: r.id,
    regionId: r.regionId,
    regionName: r.regionName,
    targetVersion: r.targetVersion,
    status: r.status,
    actorName: r.actorName,
    createdAt: r.createdAt,
    lastError: r.lastError,
    openProjects: r.tasks.map((t) => ({ taskId: t.id, projectId: t.projectId, prNo: prNos.get(t.projectId) ?? t.projectId, status: t.status, attempts: t.attempts, lastError: t.lastError })),
  }));
}

/** Crash recovery, run once when the server starts: finishes runs a restart interrupted. FAILED runs are never retried automatically. */
export async function resumeInterruptedApplyRuns(): Promise<number> {
  const runs = await listInterruptedApplyRunIds();
  for (const run of runs) await processApplyRunSafely(run.id);
  return runs.length;
}
