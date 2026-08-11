import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";

/**
 * Repository — Prisma access only, no business rules. The mutating
 * functions below all take a transaction client (`tx`) rather than the
 * shared `prisma` singleton, because the service layer owns the
 * create-user transaction boundary and calls each of these as one step
 * inside it — see user.service.ts.
 */

export function findUserByEmail(email: string) {
  return prisma.portalUser.findUnique({ where: { email } });
}

export function findUserById(id: string) {
  return prisma.portalUser.findUnique({ where: { id } });
}

/**
 * Hard delete — cascades to the user's RefreshToken/PasswordResetToken/
 * UserModuleAccess/UserRegionAccess/UserApprovalPermission rows and sets
 * AuthAuditLog.userId / any direct reports' reportingManagerId to null, per
 * the onDelete rules already declared on those relations in schema.prisma.
 * No soft-delete flag exists on PortalUser, so this matches the frontend's
 * "This action cannot be undone" confirmation copy literally.
 */
export function deleteUserById(id: string) {
  return prisma.portalUser.delete({ where: { id } });
}

export function findAllUsers() {
  return prisma.portalUser.findMany({
    include: {
      role: true,
      reportingManager: { select: { fullName: true } },
      moduleAccess: { include: { module: true } },
      regionAccess: { include: { region: true } },
      approvalPermissions: { include: { approvalType: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Same shape as one findAllUsers() row — used to build the update response with the identical mapper (toUserListItemDto). */
export function findUserWithAccessById(id: string) {
  return prisma.portalUser.findUnique({
    where: { id },
    include: {
      role: true,
      reportingManager: { select: { fullName: true } },
      moduleAccess: { include: { module: true } },
      regionAccess: { include: { region: true } },
      approvalPermissions: { include: { approvalType: true } },
    },
  });
}

export function findRoleById(roleId: string) {
  return prisma.portalRole.findUnique({ where: { id: roleId } });
}

export async function getLookups() {
  const [roles, modules, regions, approvalTypes] = await Promise.all([
    prisma.portalRole.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.module.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.region.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.approvalType.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return { roles, modules, regions, approvalTypes };
}

export interface CreatePortalUserData {
  fullName: string;
  email: string;
  passwordHash: string;
  phoneNumber: string | null;
  department: string | null;
  designation: string | null;
  employeeType: string | null;
  reportingManagerId: string | null;
  roleId: string;
  isActive: boolean;
  forcePasswordChange: boolean;
  passwordExpiresAt: Date;
}

export function createPortalUser(tx: Prisma.TransactionClient, data: CreatePortalUserData) {
  return tx.portalUser.create({ data, include: { role: true } });
}

export function createUserModuleAccess(tx: Prisma.TransactionClient, userId: string, moduleIds: string[]) {
  if (moduleIds.length === 0) return Promise.resolve(null);
  return tx.userModuleAccess.createMany({ data: moduleIds.map((moduleId) => ({ userId, moduleId })) });
}

export function createUserRegionAccess(tx: Prisma.TransactionClient, userId: string, regionIds: string[]) {
  if (regionIds.length === 0) return Promise.resolve(null);
  return tx.userRegionAccess.createMany({ data: regionIds.map((regionId) => ({ userId, regionId })) });
}

export function createUserApprovalPermissions(tx: Prisma.TransactionClient, userId: string, approvalTypeIds: string[]) {
  if (approvalTypeIds.length === 0) return Promise.resolve(null);
  return tx.userApprovalPermission.createMany({
    data: approvalTypeIds.map((approvalTypeId) => ({ userId, approvalTypeId })),
  });
}

export interface UpdatePortalUserData {
  fullName?: string;
  email?: string;
  phoneNumber?: string | null;
  department?: string | null;
  designation?: string | null;
  employeeType?: string | null;
  roleId?: string;
  isActive?: boolean;
  forcePasswordChange?: boolean;
  accountLocked?: boolean;
}

export function updatePortalUser(tx: Prisma.TransactionClient, id: string, data: UpdatePortalUserData) {
  return tx.portalUser.update({ where: { id }, data });
}

/**
 * Edit User Profile replaces the full grant set every save (the drawer
 * always submits the complete selection, not a diff) — same delete-then-
 * recreate shape as create, just against an existing user's rows instead of
 * a brand new one. A no-op when the caller didn't send this field at all
 * (undefined `ids`), so a partial update can't accidentally wipe grants the
 * request never touched.
 */
export async function replaceUserModuleAccess(tx: Prisma.TransactionClient, userId: string, moduleIds: string[] | undefined) {
  if (moduleIds === undefined) return;
  await tx.userModuleAccess.deleteMany({ where: { userId } });
  if (moduleIds.length > 0) {
    await tx.userModuleAccess.createMany({ data: moduleIds.map((moduleId) => ({ userId, moduleId })) });
  }
}

export async function replaceUserRegionAccess(tx: Prisma.TransactionClient, userId: string, regionIds: string[] | undefined) {
  if (regionIds === undefined) return;
  await tx.userRegionAccess.deleteMany({ where: { userId } });
  if (regionIds.length > 0) {
    await tx.userRegionAccess.createMany({ data: regionIds.map((regionId) => ({ userId, regionId })) });
  }
}

export async function replaceUserApprovalPermissions(
  tx: Prisma.TransactionClient,
  userId: string,
  approvalTypeIds: string[] | undefined
) {
  if (approvalTypeIds === undefined) return;
  await tx.userApprovalPermission.deleteMany({ where: { userId } });
  if (approvalTypeIds.length > 0) {
    await tx.userApprovalPermission.createMany({
      data: approvalTypeIds.map((approvalTypeId) => ({ userId, approvalTypeId })),
    });
  }
}

/**
 * Admin-initiated reset back to the default temporary password — distinct
 * from Auth's self-service `setNewPassword` (which clears
 * forcePasswordChange) because here it must be set to true: the whole point
 * is forcing the user through Change Password on their next login.
 */
export function resetPasswordToDefault(userId: string, passwordHash: string) {
  return prisma.portalUser.update({
    where: { id: userId },
    data: {
      passwordHash,
      forcePasswordChange: true,
      failedLoginAttempts: 0,
      accountLocked: false,
      passwordResetAt: new Date(),
    },
  });
}

/**
 * Invalidates every other device's refresh token — an admin-forced reset is
 * exactly the moment an already-issued token for this account should stop
 * working, same reasoning as Auth's self-service password change/reset.
 */
export function revokeAllRefreshTokensForUser(userId: string) {
  return prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
