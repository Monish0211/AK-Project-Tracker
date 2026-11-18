import { AppError } from "../../shared/utils/AppError.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { createAuditLog } from "../auth/repository/auth.repository.js";

/**
 * Who may change a user's country access (Global Multi-Country Phase 1).
 *
 * Rules (confirmed): only an Administrator assigns country access; nobody may change their OWN country access (so a PMO
 * Manager, or an Administrator, can never grant themselves a country or All Countries); and every change, and every refused
 * attempt, is written to the security audit log with who, when, and the old and new values.
 *
 * "Change" means the set of countries or the All Countries flag actually differs. The User Management form re-sends the
 * current countries on every save, so an unchanged value is never treated as an attempt (a PMO Manager can still edit
 * someone's phone number).
 */

export const COUNTRY_ACCESS_ADMIN_ROLE = "Administrator";

export interface CountryAccessRequester {
  id: string;
  email: string;
  roleName: string;
}

export interface CountryAccessState {
  regionIds: string[];
  allCountries: boolean;
}

export interface CountryAccessChange {
  regionsChanged: boolean;
  allCountriesChanged: boolean;
  changed: boolean;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id)) && set.size === new Set(b).size;
}

export function describeCountryAccessChange(current: CountryAccessState, next: { regionIds?: string[] | undefined; allCountries?: boolean | undefined }): CountryAccessChange {
  const regionsChanged = next.regionIds !== undefined && !sameSet(current.regionIds, next.regionIds);
  const allCountriesChanged = next.allCountries !== undefined && next.allCountries !== current.allCountries;
  return { regionsChanged, allCountriesChanged, changed: regionsChanged || allCountriesChanged };
}

async function regionNames(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await prisma.region.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

async function deny(requester: CountryAccessRequester, targetUserId: string | null, reason: string, message: string, attempted: { regionIds?: string[] | undefined; allCountries?: boolean | undefined }): Promise<never> {
  try {
    await createAuditLog({
      userId: requester.id,
      email: requester.email,
      event: "COUNTRY_ACCESS_CHANGE_DENIED",
      details: { targetUserId, reason, attemptedRegionIds: attempted.regionIds ?? null, attemptedAllCountries: attempted.allCountries ?? null },
    });
  } catch (err) {
    // The refusal must hold even if the audit write itself fails.
    console.error("[users] Could not write COUNTRY_ACCESS_CHANGE_DENIED audit entry:", err instanceof Error ? err.message : err);
  }
  throw new AppError(message, 403);
}

/**
 * Throws 403 unless the requester may make this change. `requester` undefined means an internal call (a script or a test
 * calling the service directly), which the HTTP layer never produces: every controller passes the signed-in user.
 */
export async function assertMayChangeCountryAccess(
  requester: CountryAccessRequester | undefined,
  targetUserId: string | null,
  change: CountryAccessChange,
  attempted: { regionIds?: string[] | undefined; allCountries?: boolean | undefined }
): Promise<void> {
  if (!requester || !change.changed) return;
  if (requester.roleName !== COUNTRY_ACCESS_ADMIN_ROLE) {
    await deny(requester, targetUserId, "NOT_ADMINISTRATOR", "Only an Administrator can change country access.", attempted);
  }
  if (targetUserId !== null && targetUserId === requester.id) {
    await deny(requester, targetUserId, "SELF_EDIT", "You cannot change your own country access. Ask another Administrator.", attempted);
  }
}

/** Written after the change has committed. Never throws: the change already happened and must not be reported as failed. */
export async function auditCountryAccessChange(
  requester: CountryAccessRequester | undefined,
  targetUserId: string,
  before: CountryAccessState,
  after: CountryAccessState,
  change: CountryAccessChange
): Promise<void> {
  if (!requester || !change.changed) return;
  try {
    const names = await regionNames([...new Set([...before.regionIds, ...after.regionIds])]);
    const named = (ids: string[]) => ids.map((id) => names[id] ?? id).sort();
    const details = {
      targetUserId,
      before: { regionIds: before.regionIds, regions: named(before.regionIds), allCountries: before.allCountries },
      after: { regionIds: after.regionIds, regions: named(after.regionIds), allCountries: after.allCountries },
    };
    await createAuditLog({ userId: requester.id, email: requester.email, event: "COUNTRY_ACCESS_CHANGED", details });
    if (change.allCountriesChanged) {
      await createAuditLog({
        userId: requester.id,
        email: requester.email,
        event: after.allCountries ? "ALL_COUNTRIES_GRANTED" : "ALL_COUNTRIES_REVOKED",
        details: { targetUserId },
      });
    }
  } catch (err) {
    console.error("[users] Could not write the country access audit entry:", err instanceof Error ? err.message : err);
  }
}
