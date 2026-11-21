import { AppError } from "../../shared/utils/AppError.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { ADMIN_CONTROL_RIGHTS, isAdminControlRight } from "../../shared/utils/adminRights.js";
import { createAuditLog } from "../auth/repository/auth.repository.js";
import type { CountryAccessRequester } from "./countryAccessAdmin.js";

/**
 * Approval rights in Settings > User Management (Administrative Controls release, decision D6): the same rules as country access.
 *
 *  - Only a real change is an attempt: the form re-sends the current rights on every save, so a PMO Manager can still edit someone's phone number.
 *  - Only an Administrator may grant or remove an approval right, and never on themselves. A refused attempt is audited (AuthAuditLog).
 *  - Every grant and removal is audited with who, whom, and which rights.
 *  - The two Administrative Controls rights (PR Approval Administration, Invoice Administration) are NOT managed here at all: they are absent from
 *    the form's list, an attempt to add one through this path is refused (and audited), and a user's existing administrative rights are always kept
 *    whatever this path sends - so a normal user save can never grant or remove them.
 */

export interface ApprovalRightsChange {
  /** The approval-type ids to store (undefined = no change requested, keep everything). */
  nextIds: string[] | undefined;
  granted: string[];
  revoked: string[];
  /** Administrative Controls rights the request tried to add (always refused here). */
  adminRightAttempts: string[];
}

export async function planApprovalRightsChange(beforeIds: string[], inputIds: string[] | undefined): Promise<ApprovalRightsChange> {
  if (inputIds === undefined) return { nextIds: undefined, granted: [], revoked: [], adminRightAttempts: [] };
  const ids = [...new Set([...beforeIds, ...inputIds])];
  const types = ids.length === 0 ? [] : await prisma.approvalType.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const nameOf = new Map(types.map((t) => [t.id, t.name]));
  const isAdminRight = (id: string) => isAdminControlRight(nameOf.get(id) ?? "");
  const before = new Set(beforeIds);
  const adminRightAttempts = inputIds.filter((id) => isAdminRight(id) && !before.has(id)).map((id) => nameOf.get(id)!);
  // Administrative rights are kept exactly as they are; everything else follows the request.
  const next = [...new Set([...inputIds.filter((id) => !isAdminRight(id)), ...beforeIds.filter((id) => isAdminRight(id))])];
  const nextSet = new Set(next);
  return {
    nextIds: next,
    granted: next.filter((id) => !before.has(id)).map((id) => nameOf.get(id) ?? id).sort(),
    revoked: beforeIds.filter((id) => !nextSet.has(id)).map((id) => nameOf.get(id) ?? id).sort(),
    adminRightAttempts: [...new Set(adminRightAttempts)].sort(),
  };
}

async function deny(requester: CountryAccessRequester, targetUserId: string | null, reason: string, change: ApprovalRightsChange, message: string): Promise<never> {
  try {
    await createAuditLog({
      userId: requester.id,
      email: requester.email,
      event: "APPROVAL_RIGHTS_CHANGE_DENIED",
      details: { targetUserId, reason, attemptedGrant: change.granted, attemptedRevoke: change.revoked, attemptedAdminRights: change.adminRightAttempts },
    });
  } catch (err) {
    // The refusal must hold even if the audit write itself fails.
    console.error("[users] Could not write the approval-rights denial audit entry:", err instanceof Error ? err.message : err);
  }
  throw new AppError(message, 403);
}

/**
 * `requester` undefined is an internal call (a script or a test calling the service directly); the HTTP layer always passes the signed-in user.
 * `targetUserId` null = a user being created.
 */
export async function assertMayChangeApprovalRights(requester: CountryAccessRequester | undefined, targetUserId: string | null, change: ApprovalRightsChange): Promise<void> {
  if (!requester) return;
  if (change.adminRightAttempts.length > 0) {
    await deny(requester, targetUserId, "ADMIN_CONTROL_RIGHT_VIA_USER_MANAGEMENT", change, `${ADMIN_CONTROL_RIGHTS.join(" and ")} are managed only in Settings > Administrative Controls.`);
  }
  if (change.granted.length === 0 && change.revoked.length === 0) return;
  if (requester.roleName !== "Administrator") {
    await deny(requester, targetUserId, "NOT_ADMINISTRATOR", change, "Only an Administrator can grant or remove approval rights.");
  }
  if (targetUserId !== null && targetUserId === requester.id) {
    await deny(requester, targetUserId, "SELF_EDIT", change, "You cannot change your own approval rights. Ask another Administrator.");
  }
}

/** Written after the change has committed; never throws (the change already happened and must not be reported as failed). */
export async function auditApprovalRightsChange(requester: CountryAccessRequester | undefined, targetUserId: string, change: ApprovalRightsChange): Promise<void> {
  if (!requester || (change.granted.length === 0 && change.revoked.length === 0)) return;
  try {
    await createAuditLog({
      userId: requester.id,
      email: requester.email,
      event: "APPROVAL_RIGHTS_CHANGED",
      details: { targetUserId, granted: change.granted, revoked: change.revoked },
    });
  } catch (err) {
    console.error("[users] Could not write the approval-rights audit entry:", err instanceof Error ? err.message : err);
  }
}
