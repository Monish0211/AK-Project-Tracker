import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "./AppError.js";
import { prisma } from "./prismaClient.js";
import type { AccessTokenPayload, CountryContext, CountryRegionInfo } from "../types/auth.types.js";

/**
 * Country access (Global Multi-Country Phase 1) — an ADDITIONAL project-access boundary.
 *
 * It never replaces or widens anything: module access, project ownership, approval rights and Read Only all still
 * apply. A user may act on a project only if the project's country (Project.regionId) is one the user is authorized
 * for AND every pre-existing check also passes.
 *
 * Mode (env COUNTRY_ACCESS_MODE, default "off"):
 *   off     - nothing here has any effect; behaviour is byte-identical to before this feature existed.
 *   shadow  - decisions are computed and logged ("would deny"), never applied.
 *   enforce - decisions are applied.
 *
 * Grants are read fresh from the database on every request (never from the JWT), like the account-status check.
 * The X-Active-Country header only NARROWS what a list shows within the user's authorized countries. It is
 * validated against the grants, is never trusted for a write, and an unauthorized value is refused, never ignored.
 * A project's country is the Project.regionId column, set from the stored PR Category only (never from the PR
 * prefix or the creator's country).
 */

export type CountryAccessMode = "off" | "shadow" | "enforce";

/** The header value that selects the consolidated "All Countries" context. */
export const ALL_COUNTRIES = "ALL";

/** Header carrying the user's active country (a Region.code, or ALL). */
export const ACTIVE_COUNTRY_HEADER = "x-active-country";

export function getCountryAccessMode(): CountryAccessMode {
  const raw = (process.env["COUNTRY_ACCESS_MODE"] ?? "off").trim().toLowerCase();
  return raw === "shadow" || raw === "enforce" ? raw : "off";
}

const REGION_SELECT = { id: true, code: true, name: true, displayName: true, defaultCurrency: true } as const;

function toRegionInfo(row: { id: string; code: string | null; name: string; displayName: string | null; defaultCurrency: string | null }): CountryRegionInfo {
  return { id: row.id, code: row.code, name: row.name, displayName: row.displayName ?? row.name, defaultCurrency: row.defaultCurrency };
}

/**
 * The countries this user may select, read fresh. A user holding the explicit All Countries right may select every
 * active country plus All Countries; every other user may select only their assigned (and still active) countries.
 */
export interface CountryGrants {
  allCountries: boolean;
  assigned: CountryRegionInfo[];
  selectable: CountryRegionInfo[];
}

type GrantRow = {
  allCountriesAccess: boolean;
  regionAccess: { region: { id: string; code: string | null; name: string; displayName: string | null; defaultCurrency: string | null; isActive: boolean } }[];
} | null;

export async function loadCountryGrants(userId: string): Promise<CountryGrants> {
  const user = await prisma.portalUser.findUnique({
    where: { id: userId },
    select: {
      allCountriesAccess: true,
      regionAccess: { select: { region: { select: { ...REGION_SELECT, isActive: true } } } },
    },
  });
  return grantsFromRow(user);
}

/**
 * The account's current state AND its country grants in ONE database statement. authenticate() needs both on every request (account must be active and unlocked,
 * then its countries become the request's context); reading them separately cost four sequential round trips before any route work began. The rules are unchanged:
 * the caller still checks the account first, and the grants are computed by exactly the same function loadCountryGrants() uses.
 */
export async function loadAccountAndCountryGrants(userId: string): Promise<{ account: { isActive: boolean; accountLocked: boolean } | null; grants: CountryGrants }> {
  // One read-only statement (a join with the regions aggregated to JSON). The Prisma client in this project loads each relation level as its own statement, which made
  // this four sequential round trips on every authenticated request. Same columns, same tables, same filters as the two queries it replaces.
  const rows = await prisma.$queryRaw<
    {
      isActive: boolean;
      accountLocked: boolean;
      allCountriesAccess: boolean;
      regions: { id: string; code: string | null; name: string; displayName: string | null; defaultCurrency: string | null; isActive: boolean }[] | null;
    }[]
  >`
    SELECT u."isActive", u."accountLocked", u."allCountriesAccess",
           COALESCE(json_agg(json_build_object('id', r."id", 'code', r."code", 'name', r."name", 'displayName', r."displayName", 'defaultCurrency', r."defaultCurrency", 'isActive', r."isActive"))
                    FILTER (WHERE r."id" IS NOT NULL), '[]'::json) AS "regions"
    FROM "PortalUser" u
    LEFT JOIN "UserRegionAccess" a ON a."userId" = u."id"
    LEFT JOIN "Region" r ON r."id" = a."regionId"
    WHERE u."id" = ${userId}
    GROUP BY u."id"
  `;
  const user = rows[0];
  if (!user) return { account: null, grants: await grantsFromRow(null) };
  return {
    account: { isActive: user.isActive, accountLocked: user.accountLocked },
    grants: await grantsFromRow({ allCountriesAccess: user.allCountriesAccess, regionAccess: (user.regions ?? []).map((region) => ({ region })) }),
  };
}

async function grantsFromRow(user: GrantRow): Promise<CountryGrants> {
  const allCountries = user?.allCountriesAccess === true;
  const assigned = (user?.regionAccess ?? [])
    .map((grant) => grant.region)
    .filter((region) => region.isActive)
    .map(toRegionInfo)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  if (!allCountries) return { allCountries, assigned, selectable: assigned };
  const every = await prisma.region.findMany({ where: { isActive: true }, select: REGION_SELECT, orderBy: { name: "asc" } });
  return { allCountries, assigned, selectable: every.map(toRegionInfo).sort((a, b) => a.displayName.localeCompare(b.displayName)) };
}

/**
 * The country (Region id) a PR Category names, or null when the text is not exactly a region's stored name. This is how Project.regionId is
 * kept in step with the stored PR Category wherever the category is written. It is deliberately NOT inferred from the PR number prefix
 * and never from the creator: an unrecognised category stays unclassified (null) rather than being guessed.
 */
export async function regionIdForPrCategory(prCategory: string | undefined | null): Promise<string | null> {
  if (!prCategory) return null;
  const row = await prisma.region.findUnique({ where: { name: prCategory }, select: { id: true } });
  return row?.id ?? null;
}

export async function buildCountryContext(userId: string, requestedHeader: string | string[] | undefined, mode: CountryAccessMode, preloaded?: CountryGrants): Promise<CountryContext> {
  const requested = (Array.isArray(requestedHeader) ? requestedHeader[0] : requestedHeader)?.trim() || null;
  const grants = preloaded ?? (await loadCountryGrants(userId));
  return { mode, allCountries: grants.allCountries, assigned: grants.assigned, selectable: grants.selectable, requested };
}

export interface ResolvedCountryScope {
  /** true = no country restriction (All Countries holder with no narrower selection). */
  unrestricted: boolean;
  /** Country ids a project may belong to. Meaningful only when !unrestricted. */
  regionIds: string[];
  /** What the user is looking at: ALL, one country code, or UNION (all of their assigned countries). */
  active: string;
}

/**
 * Turns a context into a scope, or throws AppError(403) when the requested active country is not permitted.
 * No requested country: an All Countries holder sees everything; everyone else sees the union of their assigned
 * countries (never wider than their grants).
 */
export function resolveCountryScope(ctx: CountryContext): ResolvedCountryScope {
  const requested = ctx.requested;
  if (requested === null) {
    return ctx.allCountries ? { unrestricted: true, regionIds: [], active: ALL_COUNTRIES } : { unrestricted: false, regionIds: ctx.assigned.map((r) => r.id), active: "UNION" };
  }
  if (requested.toUpperCase() === ALL_COUNTRIES) {
    if (!ctx.allCountries) throw new AppError("All Countries is not permitted for your account.", 403);
    return { unrestricted: true, regionIds: [], active: ALL_COUNTRIES };
  }
  const wanted = requested.toLowerCase();
  const match = ctx.selectable.find((r) => r.id === requested || (r.code !== null && r.code.toLowerCase() === wanted));
  if (!match) throw new AppError("The selected country is not permitted for your account.", 403);
  return { unrestricted: false, regionIds: [match.id], active: match.code ?? match.id };
}

// ---------------------------------------------------------------------------------------------------------------------
// Request-scoped context. authenticate.ts sets it (it is the one place every authenticated route already passes
// through), so list helpers that only receive a caller id can still apply the country boundary without every call
// site being changed. Background jobs have no request, so they see no context and behave exactly as before.
// ---------------------------------------------------------------------------------------------------------------------
const storage = new AsyncLocalStorage<{ ctx: CountryContext }>();

export function runWithCountryContext<T>(ctx: CountryContext, fn: () => T): T {
  return storage.run({ ctx }, fn);
}

function currentContext(user?: Pick<AccessTokenPayload, "country"> | undefined): CountryContext | undefined {
  return user?.country ?? storage.getStore()?.ctx;
}

function logShadow(message: string): void {
  console.warn(`[CountryAccess][shadow] ${message}`);
}

/** The scope to apply right now, or undefined when none applies (mode off, no context, or shadow). Throws 403 in enforce mode for a forbidden requested country. */
function scopeToApply(ctx: CountryContext | undefined): ResolvedCountryScope | undefined {
  if (!ctx || ctx.mode === "off") return undefined;
  if (ctx.mode === "shadow") {
    try {
      resolveCountryScope(ctx);
    } catch (err) {
      logShadow(`requested country would be refused: ${err instanceof AppError ? err.message : String(err)}`);
    }
    return undefined;
  }
  return resolveCountryScope(ctx);
}

/** Prisma where fragment limiting projects to the active countries; undefined when no restriction applies. */
export function projectCountryWhere(user?: Pick<AccessTokenPayload, "country">): Prisma.ProjectWhereInput | undefined {
  const scope = scopeToApply(currentContext(user));
  if (!scope || scope.unrestricted) return undefined;
  return { regionId: { in: scope.regionIds } };
}

/**
 * Of these project ids, the ones inside the caller's country scope. null means no country scope applies (country access off, or the explicit All Countries right), so
 * nothing is to be filtered. Used to keep another country's projects out of a list that is built elsewhere (the Weekly Emails previews, the recalculation retry).
 */
export async function projectIdsInCountryScope(ids: readonly string[], user?: Pick<AccessTokenPayload, "country">): Promise<Set<string> | null> {
  const where = projectCountryWhere(user);
  if (!where) return null;
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const rows = await prisma.project.findMany({ where: { id: { in: unique }, ...where }, select: { id: true } });
  return new Set(rows.map((row) => row.id));
}

/** Whether a set of grants permits a project country. An unclassified project (null) needs the explicit All Countries right. */
export function grantsAllowRegion(grants: { allCountries: boolean; assigned: readonly Pick<CountryRegionInfo, "id">[] }, regionId: string | null | undefined): boolean {
  if (grants.allCountries) return true;
  return regionId != null && grants.assigned.some((r) => r.id === regionId);
}

/**
 * Single-record country check for a project (view, edit, child records). Projects with no country (regionId null) are only reachable with
 * All Countries until they are classified.
 *
 * Phase 2: this is decided by the user's GRANTS, not by the active-country selector. The selector only narrows what a LIST shows; a user who
 * holds both India and Oman may open or edit either project whichever country the selector currently shows. The header is still validated
 * (a country the user does not hold is refused, never ignored), and an ID, a URL or a direct API call can never reach a country outside the
 * grants.
 */
export function countryAllowsProject(user: Pick<AccessTokenPayload, "country" | "sub">, regionId: string | null | undefined): boolean {
  const ctx = currentContext(user);
  if (!ctx || ctx.mode === "off") return true;
  if (ctx.mode === "shadow") {
    try {
      resolveCountryScope(ctx);
      if (!grantsAllowRegion(ctx, regionId)) logShadow(`user ${user.sub} would be denied a project in country ${regionId ?? "(unmapped)"}`);
    } catch (err) {
      logShadow(`requested country would be refused: ${err instanceof AppError ? err.message : String(err)}`);
    }
    return true;
  }
  resolveCountryScope(ctx); // validates the requested header: a country the user does not hold is a 403, never silently ignored
  return grantsAllowRegion(ctx, regionId);
}

/**
 * Country restriction for a bulk WRITE that matches projects by an identifier in an uploaded file (e.g. the Other Project Expenses
 * import). Grants-based and independent of the active-country selector; undefined = no restriction (mode not enforce, or the explicit All
 * Countries right). A project outside the user's countries simply is not in the match set, so it is reported like any unknown PR Number.
 */
export async function grantedProjectCountryWhere(userId: string): Promise<Prisma.ProjectWhereInput | undefined> {
  if (getCountryAccessMode() !== "enforce") return undefined;
  const grants = await loadCountryGrants(userId);
  if (grants.allCountries) return undefined;
  return { regionId: { in: grants.assigned.map((r) => r.id) } };
}

/**
 * Write-side country check for an arbitrary user id (project creation, including PR Request approval and bulk import, where the actor is
 * the creator). Reads the grants fresh, ignores the request's active-country selector entirely, and does nothing unless the mode is enforce
 * (shadow only logs). Returns false when the user may not use the country.
 */
export async function userMayUseCountry(userId: string, regionId: string | null | undefined): Promise<boolean> {
  const mode = getCountryAccessMode();
  if (mode === "off") return true;
  const grants = await loadCountryGrants(userId);
  const allowed = grantsAllowRegion(grants, regionId);
  if (!allowed && mode === "shadow") {
    logShadow(`user ${userId} would be refused creating a project in country ${regionId ?? "(unmapped)"}`);
    return true;
  }
  return allowed;
}
