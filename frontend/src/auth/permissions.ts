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

/**
 * Business-data mutations (create/update/delete/archive/restore).
 * "Read Only" may view data allowed by Module Access + ownership, but must
 * not mutate. Backend enforces this via denyReadOnlyWrites; this helper is
 * the matching UI supplement so Edit/Add/Archive controls stay hidden.
 */
export function canMutateData(user: UserSession | null): boolean {
  return !!user && user.role !== "Read Only";
}

/**
 * PMO Coordinator exception (Oct 2026, approved "Option B"): a Read Only
 * user who is THIS project's assigned PMO Coordinator account may edit the
 * project's own fields (the General Information / Expense Budget save,
 * PATCH /projects/:id) — nothing else. The backend enforces this
 * (denyReadOnlyWritesExceptAssignedCoordinator); this is the matching UI
 * supplement. Re-evaluated from the saved project each time, so a
 * reassignment removes it on the next load.
 */
export function isReadOnlyAssignedCoordinator(
  user: UserSession | null,
  project: { pmoCoordinatorUserId?: string | null } | null | undefined
): boolean {
  return (
    !!user &&
    user.role === "Read Only" &&
    !!project?.pmoCoordinatorUserId &&
    project.pmoCoordinatorUserId === user.id
  );
}

/** Whether the Edit Project action is offered for this project. */
export function canEditProject(
  user: UserSession | null,
  project: { pmoCoordinatorUserId?: string | null } | null | undefined
): boolean {
  return canMutateData(user) || isReadOnlyAssignedCoordinator(user, project);
}
