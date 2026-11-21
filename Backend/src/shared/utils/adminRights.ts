import type { AccessTokenPayload } from "../types/auth.types.js";
import { AppError } from "./AppError.js";
import { prisma } from "./prismaClient.js";

/**
 * Administrative Controls (Nov 2026): two approval rights managed ONLY in Settings > Administrative Controls - never through User Management.
 *
 * A right counts only when its holder is, at the moment of the request, an ACTIVE user whose role is Administrator and who holds the grant. All three
 * are re-read from the database on every check (never trusted from the token), so revoking the right, deactivating the user or changing their role
 * takes effect on the very next request.
 */
export const PR_APPROVAL_ADMINISTRATION = "PR Approval Administration";
export const INVOICE_ADMINISTRATION = "Invoice Administration";
export const ADMIN_CONTROL_RIGHTS = [PR_APPROVAL_ADMINISTRATION, INVOICE_ADMINISTRATION] as const;
export type AdminControlRight = (typeof ADMIN_CONTROL_RIGHTS)[number];

export function isAdminControlRight(name: string): name is AdminControlRight {
  return (ADMIN_CONTROL_RIGHTS as readonly string[]).includes(name);
}

/**
 * The designated owner (ADMIN_CONTROLS_OWNER_EMAILS) holds BOTH rights automatically while they are an active Administrator - no grant, so the
 * "never on yourself" rule never has to be bent. Anyone else holds a right only when the owner (or, with no owner configured, another
 * Administrator) granted it.
 */
export async function userHoldsAdminRight(userId: string, right: AdminControlRight): Promise<boolean> {
  const user = await prisma.portalUser.findUnique({
    where: { id: userId },
    select: {
      email: true,
      isActive: true,
      role: { select: { name: true } },
      approvalPermissions: { where: { approvalType: { name: right, isActive: true } }, select: { id: true } },
    },
  });
  if (!user || !user.isActive || user.role.name !== "Administrator") return false;
  return isAdminControlOwner(user.email) || user.approvalPermissions.length > 0;
}

/** 403 unless the caller currently holds the right (see userHoldsAdminRight). */
export async function assertAdminRight(user: Pick<AccessTokenPayload, "sub">, right: AdminControlRight): Promise<void> {
  if (!(await userHoldsAdminRight(user.sub, right))) {
    throw new AppError(`This action needs the "${right}" right (Settings > Administrative Controls).`, 403);
  }
}

/**
 * Who may grant or revoke the administrative rights (Settings > Administrative Controls). A server setting -
 * ADMIN_CONTROLS_OWNER_EMAILS, a comma-separated list (one owner, optionally a backup) - deliberately NOT stored in the database, so nobody can
 * change it from the application, the owner included. Empty / unset: any active Administrator may manage the others (the original rule).
 * Read on every call, so a changed setting applies after a restart without a code change.
 */
export function adminControlOwnerEmails(): string[] {
  return (process.env["ADMIN_CONTROLS_OWNER_EMAILS"] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/** True when this email may manage the rights: it is a configured owner, or no owner is configured. */
export function mayManageAdminControls(email: string): boolean {
  const owners = adminControlOwnerEmails();
  return owners.length === 0 || owners.includes(email.trim().toLowerCase());
}

/** True only for a configured owner (never true when no owner is configured). */
export function isAdminControlOwner(email: string): boolean {
  return adminControlOwnerEmails().includes(email.trim().toLowerCase());
}
