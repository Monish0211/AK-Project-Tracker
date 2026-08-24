import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { projectOwnershipWhereOr } from "../../../shared/utils/projectAccess.js";
import type { ProjectResourceData } from "../resource.types.js";

/** Same ownership-where shape as getAllResourcesForAuthorizedProjects — kept in one place so the two never drift. */
function authorizedProjectWhere(callerUserId: string | undefined): Prisma.ProjectWhereInput {
  const projectWhere: Prisma.ProjectWhereInput = { isDeleted: false };
  const ownershipOr = projectOwnershipWhereOr(callerUserId);
  if (ownershipOr) {
    projectWhere.OR = ownershipOr;
  }
  return projectWhere;
}

/**
 * All Prisma access for Project Resources lives here — the service layer
 * never imports `prisma` directly (same rule as quantity.repository.ts). No
 * business logic, no calculations — manhourCost arrives already computed by
 * resource.service.ts.
 */

// P2-06 (production hardening) — a defensive fetch bound, not a claim that
// this many resource rows is expected. Same "CAP + 1 so the caller can tell
// 'exactly CAP rows' apart from 'there are MORE than CAP and this silently
// dropped some'" reasoning as dashboard.repository.ts's
// DASHBOARD_PROJECT_FETCH_CAP — see listAllAuthorizedResources()'s own
// overflow check, which throws rather than ever returning a silently
// incomplete resource list (this feeds Reports' per-project resource costs).
export const RESOURCE_FETCH_CAP = 50_000;

export function getAllResourcesForAuthorizedProjects(callerUserId?: string) {
  return prisma.projectResource.findMany({
    where: { project: authorizedProjectWhere(callerUserId) },
    orderBy: { createdAt: "asc" },
    take: RESOURCE_FETCH_CAP + 1,
  });
}

export function createResource(projectId: string, data: ProjectResourceData) {
  return prisma.projectResource.create({ data: { ...data, projectId } });
}

/**
 * P1-04 (production hardening) — atomic create-or-update on the
 * @@unique([projectId, employeeNo]) key, run inside the caller's advisory-
 * locked transaction (see projectResource.service.ts's recomputeProjectResource()).
 * Replaces the old separate "read existing, then create-or-update" sequence
 * for that one call site: a single INSERT ... ON CONFLICT DO UPDATE is
 * atomic on its own, so there is no window between deciding "this pair
 * doesn't exist yet" and writing where a second concurrent recompute for the
 * exact same pair could either duplicate-insert (would have hit the unique
 * constraint and errored) or interleave a stale write. `createData` and
 * `updateData` are deliberately separate (Prisma upsert's own shape) so
 * hourlyRateSnapshot can be included in `createData` only — it is set on
 * first creation and must never be touched by a later recompute, exactly as
 * before.
 */
export function upsertResourceByProjectAndEmployee(
  tx: Prisma.TransactionClient,
  projectId: string,
  employeeNo: string,
  createData: ProjectResourceData,
  updateData: Partial<ProjectResourceData>
) {
  return tx.projectResource.upsert({
    where: { projectId_employeeNo: { projectId, employeeNo } },
    create: { ...createData, projectId, employeeNo },
    update: updateData,
  });
}

export function getResourcesByProjectId(projectId: string) {
  return prisma.projectResource.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Ownership-scoped exactly like getAllResourcesForAuthorizedProjects — an
 * assignment is only returned if the caller is authorized for its Project
 * (Administrator: unrestricted; normal user: own or unclaimed projects
 * only, via projectOwnershipWhereOr). employeeNo has no ownership meaning
 * of its own, since one employee can be assigned across projects owned by
 * different users.
 */
export function getResourcesByEmployeeNo(employeeNo: string, callerUserId: string | undefined) {
  return prisma.projectResource.findMany({
    where: { employeeNo, project: authorizedProjectWhere(callerUserId) },
    orderBy: { createdAt: "asc" },
  });
}

export function getResourceById(id: string) {
  return prisma.projectResource.findUnique({ where: { id } });
}

/**
 * Backs the @@unique([projectId, employeeNo]) constraint — one employee, one
 * row, per project. Optional `tx` (P1-04) lets recomputeProjectResource()
 * read this inside its own advisory-locked transaction instead of a
 * separate, unlocked connection — defaults to the plain client so every
 * pre-existing caller is completely unaffected.
 */
export function findResourceByProjectAndEmployee(
  projectId: string,
  employeeNo: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma
) {
  return tx.projectResource.findUnique({
    where: { projectId_employeeNo: { projectId, employeeNo } },
  });
}

export function updateResource(id: string, data: Partial<ProjectResourceData>) {
  return prisma.projectResource.update({ where: { id }, data });
}

export function deleteResource(id: string) {
  return prisma.projectResource.delete({ where: { id } });
}

/** Not wired to a route yet — kept for a future project-delete cascade helper, mirroring the schema's onDelete: Cascade at the DB level (same convention as quantity.repository.ts's own unused deleteAllByProject). */
export function deleteAllByProject(projectId: string) {
  return prisma.projectResource.deleteMany({ where: { projectId } });
}

/** Backs the Employees module's delete guard (Employees → Resources, one direction only — see resource.service.ts's countResourcesForEmployee()). */
export function countResourcesByEmployeeNo(employeeNo: string) {
  return prisma.projectResource.count({ where: { employeeNo } });
}
