import { AppError } from "../../shared/utils/AppError.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { ADMIN_CONTROL_RIGHTS, adminControlOwnerEmails, isAdminControlOwner, isAdminControlRight, mayManageAdminControls, type AdminControlRight } from "../../shared/utils/adminRights.js";
import type { AccessTokenPayload } from "../../shared/types/auth.types.js";
import { createAuditLog } from "../auth/repository/auth.repository.js";

/**
 * Settings > Administrative Controls (Nov 2026). The only place the two administrative rights (PR Approval Administration, Invoice Administration)
 * are granted or revoked.
 *
 *  - Only an ACTIVE Administrator may view or change it. The role is re-read from the database, never trusted from the token.
 *  - Never on yourself. Only an active Administrator can hold a right (decision D1).
 *  - Every grant, every revoke and every refused attempt is written to the security audit log (AuthAuditLog) with who, whom, which right and the reason.
 *  - Refusals are decided here (not in route middleware) precisely so a refused attempt can be audited.
 */

export const ADMIN_CONTROL_AUDIT_EVENTS = [
  "ADMIN_CONTROL_RIGHT_GRANTED",
  "ADMIN_CONTROL_RIGHT_REVOKED",
  "ADMIN_CONTROL_RIGHT_CHANGE_DENIED",
  "APPROVAL_RIGHTS_CHANGED",
  "APPROVAL_RIGHTS_CHANGE_DENIED",
  "INVOICE_RAISED_WITHOUT_EMAIL",
  "INVOICE_ADMIN_DELETED",
  "PR_REQUEST_ADMIN_EDITED",
  "PR_REQUEST_ADMIN_APPROVED",
  "PR_REQUEST_ADMIN_REJECTED",
  "PR_REQUEST_ADMIN_REASSIGNED",
  "PR_REQUEST_ADMIN_DELETED",
] as const;

/** Which administrative rights the caller holds right now (empty for everyone else) - lets the UI show only the controls the server will accept. */
export async function getMyRights(requester: AccessTokenPayload): Promise<{ rights: AdminControlRight[] }> {
  const user = await prisma.portalUser.findUnique({
    where: { id: requester.sub },
    select: {
      email: true,
      isActive: true,
      role: { select: { name: true } },
      approvalPermissions: { where: { approvalType: { name: { in: [...ADMIN_CONTROL_RIGHTS] }, isActive: true } }, select: { approvalType: { select: { name: true } } } },
    },
  });
  if (!user || !user.isActive || user.role.name !== "Administrator") return { rights: [] };
  if (isAdminControlOwner(user.email)) return { rights: [...ADMIN_CONTROL_RIGHTS] };
  return { rights: user.approvalPermissions.map((p) => p.approvalType.name).filter(isAdminControlRight) };
}

async function loadActor(userId: string) {
  return prisma.portalUser.findUnique({ where: { id: userId }, select: { id: true, email: true, isActive: true, role: { select: { name: true } } } });
}

async function denyChange(requester: AccessTokenPayload, details: Record<string, unknown>, status: number, message: string): Promise<never> {
  try {
    await createAuditLog({ userId: requester.sub, email: requester.email, event: "ADMIN_CONTROL_RIGHT_CHANGE_DENIED", details: details as never });
  } catch (err) {
    console.error("[adminControls] Could not write the denial audit entry:", err instanceof Error ? err.message : err);
  }
  throw new AppError(message, status);
}

async function assertActiveAdministrator(requester: AccessTokenPayload): Promise<void> {
  const actor = await loadActor(requester.sub);
  if (!actor || !actor.isActive || actor.role.name !== "Administrator") {
    throw new AppError("Only an Administrator can open Administrative Controls.", 403);
  }
}

export interface AdminControlsOverview {
  /** Whether the caller may grant / revoke here (a configured owner, or anyone when no owner is configured). Everyone else sees it read-only. */
  canManage: boolean;
  /** The configured owner(s), by name where an account exists; empty = no owner configured (any Administrator manages the others). */
  owners: { email: string; fullName: string | null }[];
  rights: { name: AdminControlRight; description: string | null }[];
  administrators: { id: string; fullName: string; email: string; isSelf: boolean; isOwner: boolean; rights: AdminControlRight[] }[];
  audit: { id: string; event: string; actorEmail: string; details: unknown; createdAt: Date }[];
}

export async function getOverview(requester: AccessTokenPayload): Promise<AdminControlsOverview> {
  await assertActiveAdministrator(requester);
  const [types, admins, audit] = await Promise.all([
    prisma.approvalType.findMany({ where: { name: { in: [...ADMIN_CONTROL_RIGHTS] } }, select: { name: true, description: true } }),
    prisma.portalUser.findMany({
      where: { isActive: true, role: { name: "Administrator" } },
      select: { id: true, fullName: true, email: true, approvalPermissions: { where: { approvalType: { name: { in: [...ADMIN_CONTROL_RIGHTS] } } }, select: { approvalType: { select: { name: true } } } } },
      orderBy: { fullName: "asc" },
    }),
    prisma.authAuditLog.findMany({
      where: { event: { in: [...ADMIN_CONTROL_AUDIT_EVENTS] } },
      select: { id: true, event: true, email: true, details: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const order = (n: string) => ADMIN_CONTROL_RIGHTS.indexOf(n as AdminControlRight);
  const ownerEmails = adminControlOwnerEmails();
  const ownerAccounts = ownerEmails.length
    ? await prisma.portalUser.findMany({ where: { email: { in: ownerEmails, mode: "insensitive" } }, select: { email: true, fullName: true } })
    : [];
  const me = await loadActor(requester.sub);
  return {
    canManage: !!me && mayManageAdminControls(me.email),
    owners: ownerEmails.map((email) => ({ email, fullName: ownerAccounts.find((a) => a.email.toLowerCase() === email)?.fullName ?? null })),
    rights: types.filter((t) => isAdminControlRight(t.name)).sort((a, b) => order(a.name) - order(b.name)) as AdminControlsOverview["rights"],
    administrators: admins.map((a) => ({
      id: a.id,
      fullName: a.fullName,
      email: a.email,
      isSelf: a.id === requester.sub,
      isOwner: isAdminControlOwner(a.email),
      rights: isAdminControlOwner(a.email)
        ? [...ADMIN_CONTROL_RIGHTS]
        : a.approvalPermissions.map((p) => p.approvalType.name).filter(isAdminControlRight).sort((x, y) => order(x) - order(y)),
    })),
    audit: audit.map((e) => ({ id: e.id, event: e.event, actorEmail: e.email, details: e.details, createdAt: e.createdAt })),
  };
}

export async function setRight(
  requester: AccessTokenPayload,
  targetUserId: string,
  input: { right: string; granted: boolean; reason: string }
): Promise<{ changed: boolean; rights: AdminControlRight[] }> {
  const attempt = { targetUserId, right: input.right, granted: input.granted, reason: input.reason };
  const actor = await loadActor(requester.sub);
  if (!actor || !actor.isActive || actor.role.name !== "Administrator") {
    await denyChange(requester, { ...attempt, refusal: "NOT_ADMINISTRATOR" }, 403, "Only an Administrator can grant or revoke administrative rights.");
  }
  // Only the named owner(s) may change rights, when an owner is configured (ADMIN_CONTROLS_OWNER_EMAILS). Checked against the email stored on the
  // account, never the token, and audited like every refusal.
  if (actor && !mayManageAdminControls(actor.email)) {
    await denyChange(requester, { ...attempt, refusal: "NOT_OWNER" }, 403, "Only the designated owner of Administrative Controls can grant or revoke these rights.");
  }
  if (targetUserId !== requester.sub) {
    const targetOwner = await prisma.portalUser.findUnique({ where: { id: targetUserId }, select: { email: true } });
    if (targetOwner && isAdminControlOwner(targetOwner.email)) {
      await denyChange(requester, { ...attempt, refusal: "TARGET_IS_OWNER" }, 400, "The owner holds both rights automatically; they cannot be granted or revoked here.");
    }
  }
  if (targetUserId === requester.sub) {
    await denyChange(requester, { ...attempt, refusal: "SELF_EDIT" }, 403, "You cannot change your own administrative rights. Ask another Administrator.");
  }
  if (!isAdminControlRight(input.right)) {
    await denyChange(requester, { ...attempt, refusal: "UNKNOWN_RIGHT" }, 400, `Unknown right. Choose one of: ${ADMIN_CONTROL_RIGHTS.join(", ")}.`);
  }
  const right = input.right as AdminControlRight;
  const target = await prisma.portalUser.findUnique({ where: { id: targetUserId }, select: { id: true, email: true, isActive: true, role: { select: { name: true } } } });
  if (!target) throw new AppError("User not found.", 404);
  if (input.granted && (!target.isActive || target.role.name !== "Administrator")) {
    await denyChange(requester, { ...attempt, targetEmail: target.email, refusal: "TARGET_NOT_ACTIVE_ADMINISTRATOR" }, 400, "Administrative rights can only be given to an active Administrator.");
  }
  const type = await prisma.approvalType.findUnique({ where: { name: right }, select: { id: true } });
  if (!type) throw new AppError(`The "${right}" right is not set up in this database (migration missing).`, 500);

  const changed = await prisma.$transaction(async (tx) => {
    const existing = await tx.userApprovalPermission.findFirst({ where: { userId: targetUserId, approvalTypeId: type.id }, select: { id: true } });
    if (input.granted && !existing) {
      await tx.userApprovalPermission.create({ data: { userId: targetUserId, approvalTypeId: type.id } });
      return true;
    }
    if (!input.granted && existing) {
      await tx.userApprovalPermission.deleteMany({ where: { userId: targetUserId, approvalTypeId: type.id } });
      return true;
    }
    return false;
  });

  if (changed) {
    try {
      await createAuditLog({
        userId: requester.sub,
        email: requester.email,
        event: input.granted ? "ADMIN_CONTROL_RIGHT_GRANTED" : "ADMIN_CONTROL_RIGHT_REVOKED",
        details: { targetUserId, targetEmail: target.email, right, reason: input.reason },
      });
    } catch (err) {
      console.error("[adminControls] Could not write the change audit entry:", err instanceof Error ? err.message : err);
    }
  }
  const rights = await prisma.userApprovalPermission.findMany({
    where: { userId: targetUserId, approvalType: { name: { in: [...ADMIN_CONTROL_RIGHTS] } } },
    select: { approvalType: { select: { name: true } } },
  });
  return { changed, rights: rights.map((r) => r.approvalType.name).filter(isAdminControlRight) };
}
