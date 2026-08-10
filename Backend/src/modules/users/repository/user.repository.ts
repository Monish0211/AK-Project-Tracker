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
