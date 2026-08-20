import type { AccessTokenPayload } from "../types/auth.types.js";
import { AppError } from "./AppError.js";
import { prisma } from "./prismaClient.js";

/**
 * Project-ownership authorization — the single source of truth for "may
 * this caller touch this project." Reused by the Project module itself and
 * by every project-scoped child-resource module (Quantity, Milestones,
 * Invoices, Expenses, Resources) so there is never a second, independently
 * drifting authorization implementation.
 *
 * Rule: Administrator always passes. A project with no recorded creator
 * (createdByUserId: null — every project that existed before this field was
 * introduced, since the concept didn't exist yet) is "unclaimed" and
 * accessible to every normal user, never locked to Administrator-only.
 * Otherwise, only the creator may access it.
 */
export interface ProjectOwnershipCheck {
  createdByUserId: string | null;
}

export function canAccessProject(user: AccessTokenPayload, project: ProjectOwnershipCheck): boolean {
  if (user.roleName === "Administrator") return true;
  if (project.createdByUserId === null) return true;
  return project.createdByUserId === user.sub;
}

export function assertProjectAccess(user: AccessTokenPayload, project: ProjectOwnershipCheck): void {
  if (!canAccessProject(user, project)) {
    throw new AppError("You do not have access to this project.", 403);
  }
}

/**
 * Lightweight existence + ownership check for child-resource modules that
 * only need to know "does this project exist, and may the caller touch
 * it" — not the full Project DTO. Reuses the exact same minimal
 * findUnique already used by the Project module's own findProjectByIdAny.
 */
export async function assertProjectAccessById(projectId: string, user: AccessTokenPayload): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { createdByUserId: true } });
  if (!project) {
    throw new AppError("Project not found.", 404);
  }
  assertProjectAccess(user, project);
}

/**
 * The Prisma OR-clause fragment that scopes a list query to projects the
 * caller may see — pass `undefined` for an Administrator (no restriction).
 * Shared by GET /projects, GET /timesheets/pending-projects, and GET
 * /timesheets/entries so all three can never disagree on what "authorized
 * project" means.
 */
export function projectOwnershipWhereOr(callerUserId: string | undefined) {
  if (!callerUserId) return undefined;
  return [{ createdByUserId: null }, { createdByUserId: callerUserId }];
}
