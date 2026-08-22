import type { Prisma } from "../../../../generated/prisma/client.js";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { projectOwnershipWhereOr } from "../../../shared/utils/projectAccess.js";
import type { ProjectResourceData } from "../resource.types.js";

/**
 * All Prisma access for Project Resources lives here — the service layer
 * never imports `prisma` directly (same rule as quantity.repository.ts). No
 * business logic, no calculations — manhourCost arrives already computed by
 * resource.service.ts.
 */

export function getAllResourcesForAuthorizedProjects(callerUserId?: string) {
  const projectWhere: Prisma.ProjectWhereInput = {
    isDeleted: false,
  };
  const ownershipOr = projectOwnershipWhereOr(callerUserId);
  if (ownershipOr) {
    projectWhere.OR = ownershipOr;
  }
  return prisma.projectResource.findMany({
    where: { project: projectWhere },
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

export function getResourcesByEmployeeNo(employeeNo: string) {
  return prisma.projectResource.findMany({
    where: { employeeNo },
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
