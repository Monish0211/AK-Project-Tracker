import { AppError } from "../../shared/utils/AppError.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { createAuditLog } from "../auth/repository/auth.repository.js";
import type { CountryAccessRequester } from "./countryAccessAdmin.js";

/**
 * The "Manpower Conversion Rates" Module Access grant (Phase 4, central country rates) is a sensitive capability: it decides who may see and manage the
 * conversion rates every regional manpower cost is converted with. Granting or removing it is written to the same security audit log the country-access
 * changes use (AuthAuditLog), with who, when and which user. Written after the change has committed; never throws, because the change already happened and
 * must not be reported as failed. Granting and revoking go through the ordinary Module Access save (Settings > User Management), so nothing else changes.
 */

export const CONVERSION_RATES_MODULE_NAME = "Manpower Conversion Rates";

/**
 * Who may grant or remove it: an Administrator only. A PMO Manager can edit users in general (so can reach this field in the form), but a capability that
 * decides who manages the manpower conversion rates is not theirs to hand out; a refused attempt is audited. An unchanged value is not an attempt (the
 * User Management form re-sends the current modules on every save, so a PMO Manager can still edit someone's phone number). `requester` undefined is an
 * internal call (a script or a test calling the service directly); the HTTP layer always passes the signed-in user.
 */
export async function assertMayChangeConversionRateAccess(
  requester: CountryAccessRequester | undefined,
  targetUserId: string | null,
  hadBefore: boolean,
  moduleIdsAfter: string[] | undefined
): Promise<void> {
  if (!requester || moduleIdsAfter === undefined || requester.roleName === "Administrator") return;
  const module = await prisma.module.findUnique({ where: { name: CONVERSION_RATES_MODULE_NAME }, select: { id: true } });
  if (!module || moduleIdsAfter.includes(module.id) === hadBefore) return;
  try {
    await createAuditLog({
      userId: requester.id,
      email: requester.email,
      event: "MANPOWER_CONVERSION_ACCESS_CHANGE_DENIED",
      details: { targetUserId, module: CONVERSION_RATES_MODULE_NAME, reason: "NOT_ADMINISTRATOR", attemptedGrant: !hadBefore },
    });
  } catch (err) {
    // The refusal must hold even if the audit write itself fails.
    console.error("[users] Could not write the Manpower Conversion Rates denial audit entry:", err instanceof Error ? err.message : err);
  }
  throw new AppError("Only an Administrator can grant or remove access to Manpower Conversion Rates.", 403);
}

export async function auditConversionRateAccessChange(
  requester: CountryAccessRequester | undefined,
  targetUserId: string,
  hadBefore: boolean,
  moduleIdsAfter: string[] | undefined
): Promise<void> {
  if (!requester || moduleIdsAfter === undefined) return;
  try {
    const module = await prisma.module.findUnique({ where: { name: CONVERSION_RATES_MODULE_NAME }, select: { id: true } });
    if (!module) return;
    const hasAfter = moduleIdsAfter.includes(module.id);
    if (hasAfter === hadBefore) return;
    await createAuditLog({
      userId: requester.id,
      email: requester.email,
      event: hasAfter ? "MANPOWER_CONVERSION_ACCESS_GRANTED" : "MANPOWER_CONVERSION_ACCESS_REVOKED",
      details: { targetUserId, module: CONVERSION_RATES_MODULE_NAME },
    });
  } catch (err) {
    console.error("[users] Could not write the Manpower Conversion Rates access audit entry:", err instanceof Error ? err.message : err);
  }
}
