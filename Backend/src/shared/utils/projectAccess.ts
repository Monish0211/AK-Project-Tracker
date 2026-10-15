import type { AccessTokenPayload } from "../types/auth.types.js";
import { AppError } from "./AppError.js";
import { prisma } from "./prismaClient.js";
import { userHasApprovalPermission } from "../middleware/requireApprovalPermission.js";

/**
 * Roles with unrestricted project visibility — every "may this caller see
 * projects they didn't create" decision in the codebase (this file's own
 * canAccessProject() below, plus every callerUserId derivation ahead of
 * projectOwnershipWhereOr() in the Projects/Dashboard/Timesheets/Resources
 * modules) must resolve through this one function, never re-derive its own
 * roleName check, so the set of unrestricted-visibility roles can never
 * drift out of sync between call sites.
 *
 * Business rule: PMO Manager sees every user's projects, the same as
 * Administrator — not just what they personally created. This is a
 * project-visibility rule only; it does not touch any Administrator-only
 * *action* gate (audit logs, user role management, invoice/milestone/
 * timesheet admin routes) — those keep using authorize("Administrator")
 * exactly as before.
 */
export function hasUnrestrictedProjectVisibility(roleName: string): boolean {
  return roleName === "Administrator" || roleName === "PMO Manager";
}

/**
 * Project Manager Scope (User-Based Project Visibility) — the ids of other
 * users whose created projects `callerUserId` may additionally see, on top
 * of their own. Deliberately keyed on `callerUserId` alone, not on the
 * caller's `roleName`: a restricted user who isn't a Project Manager simply
 * has zero `ProjectManagerScope` rows, so this returns `[]` for them without
 * needing a role check of its own — one less place for a role name to drift
 * out of sync. Joins live against `PortalUser.isActive` so a deactivated
 * granted user immediately stops expanding visibility (rule E) without ever
 * needing to touch or delete the grant row itself — same "always re-read
 * fresh from the database, never trust a cached/token value" philosophy
 * `authenticate.ts` already applies to the caller's own account state.
 * Returns `[]` immediately (no query) for `undefined` (unrestricted roles),
 * so Administrator/PMO Manager pay no extra cost here.
 */
export async function getProjectManagerGrantedUserIds(callerUserId: string | undefined): Promise<string[]> {
  if (!callerUserId) return [];
  const grants = await prisma.projectManagerScope.findMany({
    where: { projectManagerId: callerUserId, grantedUser: { isActive: true } },
    select: { grantedUserId: true },
  });
  return grants.map((grant) => grant.grantedUserId);
}

/**
 * Project-ownership authorization — the single source of truth for "may
 * this caller touch this project." Reused by the Project module itself and
 * by every project-scoped child-resource module (Quantity, Milestones,
 * Invoices, Expenses, Resources) so there is never a second, independently
 * drifting authorization implementation.
 *
 * Rule: a role with unrestricted project visibility (see
 * hasUnrestrictedProjectVisibility() above) always passes. A project with no
 * recorded creator (createdByUserId: null — every project that existed
 * before this field was introduced, since the concept didn't exist yet) is
 * "unclaimed" and accessible to every normal user, never locked to an
 * unrestricted-visibility role only. Otherwise, the creator may access it —
 * and, additively, so may a Project Manager who has been granted visibility
 * into that creator's projects (see getProjectManagerGrantedUserIds() above,
 * ProjectManagerScope). This never narrows anything the caller could already
 * see; it only ever adds.
 */
export interface ProjectOwnershipCheck {
  createdByUserId: string | null;
  // PMO Coordinator Management (Oct 2026) — required (not optional) so every
  // call site must select it; a missing select would silently deny coordinators.
  pmoCoordinatorUserId: string | null;
}

/** The project's own fields that canAccessProject() needs — use for every minimal access lookup. */
export const PROJECT_ACCESS_SELECT = { createdByUserId: true, pmoCoordinatorUserId: true } as const;

export async function canAccessProject(user: AccessTokenPayload, project: ProjectOwnershipCheck): Promise<boolean> {
  if (hasUnrestrictedProjectVisibility(user.roleName)) return true;
  if (project.createdByUserId === null) return true;
  if (project.createdByUserId === user.sub) return true;
  // The project's assigned PMO Coordinator account — owner-equivalent access
  // to THIS project only. Read fresh from the project row on every request,
  // so reassigning or clearing the coordinator revokes it immediately. Like
  // View All Projects, it widens project-ownership only: module access,
  // Read Only (see denyReadOnlyWritesExceptAssignedCoordinator), and every
  // approval gate (Archive Projects, Delete Project Permanently,
  // Raise/Edit/Delete Invoice) remain separate checks.
  if (project.pmoCoordinatorUserId !== null && project.pmoCoordinatorUserId === user.sub) return true;
  const grantedUserIds = await getProjectManagerGrantedUserIds(user.sub);
  if (grantedUserIds.includes(project.createdByUserId)) return true;
  // "View All Projects" approval right — PMO-Manager-equivalent project
  // access (view AND edit) for a user an Administrator explicitly grants it
  // to. Only project-ownership is widened: module access, Read Only, and every
  // independent approval gate (Archive Projects, Delete Project Permanently,
  // Raise/Edit/Delete Invoice) are separate checks that still apply.
  return holdsViewAllProjects(user.sub);
}

export async function assertProjectAccess(user: AccessTokenPayload, project: ProjectOwnershipCheck): Promise<void> {
  if (!(await canAccessProject(user, project))) {
    throw new AppError("You do not have access to this project.", 403);
  }
}

/**
 * "View All Projects" approval right (Oct 2026) — PMO-Manager-equivalent
 * project access (view AND edit every project) for a user an Administrator
 * explicitly grants it to (e.g. an Accounts user), without making them an
 * Administrator/PMO Manager. Applied in canAccessProject() above (the one
 * project-ownership check every read and write uses) and in
 * resolveProjectReadScope() below (every cross-project list). It never
 * replaces an independent gate: module access, Read Only (denyReadOnlyWrites),
 * Archive Projects, Delete Project Permanently, and Raise/Edit/Delete Invoice
 * are separate checks that still apply. Re-read from the database on every
 * call (never trusted from the token), so granting or revoking takes effect
 * immediately.
 */
export const VIEW_ALL_PROJECTS_APPROVAL = "View All Projects";

async function holdsViewAllProjects(userId: string): Promise<boolean> {
  return userHasApprovalPermission(userId, [VIEW_ALL_PROJECTS_APPROVAL]);
}

/**
 * THE read-visibility rule for every cross-project list (projects, status
 * counts, dashboard, notes register, invoice lines, resources, timesheets,
 * reminders): `undefined` = may see every project; otherwise the caller's
 * id, to be passed to projectOwnershipWhereOr() exactly as before. Unchanged
 * for everyone except holders of "View All Projects".
 */
export async function resolveProjectReadScope(user: AccessTokenPayload): Promise<string | undefined> {
  if (hasUnrestrictedProjectVisibility(user.roleName)) return undefined;
  return (await holdsViewAllProjects(user.sub)) ? undefined : user.sub;
}

/**
 * Read check for GET paths. Since "View All Projects" now widens
 * canAccessProject() itself, read and write project access are the same rule
 * (Read Only is still blocked from writing by denyReadOnlyWrites at route
 * level); kept as a named read entry point so a future read-only grant can be
 * added in one place without touching the read call sites again.
 */
export async function canReadProject(user: AccessTokenPayload, project: ProjectOwnershipCheck): Promise<boolean> {
  return canAccessProject(user, project);
}

export async function assertProjectReadAccess(user: AccessTokenPayload, project: ProjectOwnershipCheck): Promise<void> {
  if (!(await canReadProject(user, project))) {
    throw new AppError("You do not have access to this project.", 403);
  }
}

export async function assertProjectReadAccessById(projectId: string, user: AccessTokenPayload): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: PROJECT_ACCESS_SELECT });
  if (!project) {
    throw new AppError("Project not found.", 404);
  }
  await assertProjectReadAccess(user, project);
}

/**
 * Lightweight existence + ownership check for child-resource modules that
 * only need to know "does this project exist, and may the caller touch
 * it" — not the full Project DTO. Reuses the exact same minimal
 * findUnique already used by the Project module's own findProjectByIdAny.
 */
export async function assertProjectAccessById(projectId: string, user: AccessTokenPayload): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: PROJECT_ACCESS_SELECT });
  if (!project) {
    throw new AppError("Project not found.", 404);
  }
  await assertProjectAccess(user, project);
}

/**
 * Priority #6 Phase 3B — the one place a project-scoped child-resource
 * module (Invoices, and any future one) reads just createdByUserId to
 * resolve a business-event notification's recipient, without needing the
 * full Project DTO or duplicating this same minimal findUnique shape in
 * each module. Returns null both when the project is unclaimed AND when it
 * genuinely doesn't exist — callers that already validated the project's
 * existence via assertProjectAccessById() don't need to distinguish those
 * cases here.
 */
export async function getProjectCreatorUserId(projectId: string): Promise<string | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { createdByUserId: true } });
  return project?.createdByUserId ?? null;
}

/**
 * The Prisma OR-clause fragment that scopes a list query to projects the
 * caller may see — pass `undefined` for an Administrator (no restriction).
 * Shared by GET /projects, GET /timesheets/pending-projects, GET
 * /timesheets/entries, Dashboard, Resources, Reminders, and every other
 * cross-project list built on findAuthorizedProjects(), so none of them can
 * ever disagree on what "authorized project" means. Additively includes any
 * Project Manager Scope grants the caller holds (see
 * getProjectManagerGrantedUserIds() above) — a plain restricted user with no
 * grants gets back exactly the same two-branch OR as before this feature
 * existed.
 */
export async function projectOwnershipWhereOr(callerUserId: string | undefined) {
  if (!callerUserId) return undefined;
  const grantedUserIds = await getProjectManagerGrantedUserIds(callerUserId);
  return [
    { createdByUserId: null },
    { createdByUserId: callerUserId },
    ...(grantedUserIds.length > 0 ? [{ createdByUserId: { in: grantedUserIds } }] : []),
    // Projects where the caller is the assigned PMO Coordinator account —
    // the list-side mirror of canAccessProject()'s coordinator branch.
    { pmoCoordinatorUserId: callerUserId },
  ];
}
