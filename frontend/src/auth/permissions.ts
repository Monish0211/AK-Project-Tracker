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

/**
 * A route / action's Module Access requirement. `module` is the single-module form; `anyOf` is satisfied by holding ANY of the
 * listed modules (e.g. a shared requester/approver page); `alsoRequires` must ALL be held in addition (e.g. "Projects" AND "Add Project").
 * Pure and data-driven — no role-name bypass, same as hasModuleAccess.
 */
export interface ModuleRequirement {
  module?: string;
  anyOf?: readonly string[];
  alsoRequires?: readonly string[];
}

export function meetsModuleRequirement(user: UserSession | null, requirement: ModuleRequirement): boolean {
  if (!user) return false;
  const { module, anyOf, alsoRequires } = requirement;
  if (module !== undefined && !user.modules.includes(module)) return false;
  if (anyOf !== undefined && !anyOf.some((name) => user.modules.includes(name))) return false;
  if (alsoRequires !== undefined && !alsoRequires.every((name) => user.modules.includes(name))) return false;
  return true;
}

/** Name shown on the Access Denied page: the first module the user is actually missing. */
export function describeMissingModule(user: UserSession | null, requirement: ModuleRequirement): string | undefined {
  const { module, anyOf, alsoRequires } = requirement;
  if (module !== undefined && !user?.modules.includes(module)) return module;
  if (alsoRequires) {
    const missing = alsoRequires.find((name) => !user?.modules.includes(name));
    if (missing) return missing;
  }
  if (anyOf !== undefined && !anyOf.some((name) => user?.modules.includes(name))) return anyOf.join(" or ");
  return undefined;
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
 * Direct project creation (Add Project button, /projects/add, Excel import). Needs "Projects" AND "Add Project", and — like every
 * other write — is never offered to Read Only. The backend enforces the same three rules (project.routes.ts); this is the UI supplement.
 * Independent of PR Request: holding one never implies the other.
 */
export function canAddProject(user: UserSession | null): boolean {
  return canMutateData(user) && meetsModuleRequirement(user, { alsoRequires: ["Projects", "Add Project"] });
}

/**
 * Submitting a PR Request (the Project Repository / PR Requests "New PR Request" action). Needs the "PR Request" module and a
 * non-Read-Only role (the backend denies Read Only writes). Does NOT grant any approval authority — that stays on "Approvals".
 */
export function canSubmitPRRequest(user: UserSession | null): boolean {
  return canMutateData(user) && hasModuleAccess(user, "PR Request");
}

/** Whether the Approvals Queue / approve / reject side of the PR workflow is available (the "Approvals" module). */
export function canReviewPRRequests(user: UserSession | null): boolean {
  return hasModuleAccess(user, "Approvals");
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
