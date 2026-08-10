import type { UserSession } from "./authService";

/**
 * Every permission check in the app should go through one of these three
 * functions — never `user.modules.includes(...)` inline in a component.
 * Deliberately data-driven with no role-based bypass: Administrator sees
 * every module today because the database grants Administrator every
 * module/region/approval (see Backend/prisma/seed.ts), not because this
 * code special-cases the role name. If an Administrator's grants ever
 * changed, these functions would (correctly) reflect that.
 */

export function hasModuleAccess(user: UserSession | null, moduleName: string): boolean {
  return !!user && user.modules.includes(moduleName);
}

export function hasRegionAccess(user: UserSession | null, regionName: string): boolean {
  return !!user && user.regions.includes(regionName);
}

export function hasApprovalPermission(user: UserSession | null, approvalName: string): boolean {
  return !!user && user.approvalPermissions.includes(approvalName);
}
