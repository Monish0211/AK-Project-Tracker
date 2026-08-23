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

export function getAllResourcesForAuthorizedProjects(callerUserId?: string) {
  return prisma.projectResource.findMany({
    where: { project: authorizedProjectWhere(callerUserId) },
    orderBy: { createdAt: "asc" },
  });
}

export function createResource(projectId: string, data: ProjectResourceData) {
  return prisma.projectResource.create({ data: { ...data, projectId } });
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

/** Backs the @@unique([projectId, employeeNo]) constraint — one employee, one row, per project. */
export function findResourceByProjectAndEmployee(projectId: string, employeeNo: string) {
  return prisma.projectResource.findUnique({
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
