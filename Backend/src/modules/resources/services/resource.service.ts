import { AppError } from "../../../shared/utils/AppError.js";
import { getProjectById } from "../../projects/services/project.service.js";
import type { ResourceDto, ResourceListDto } from "../dto/resource.dto.js";
import {
  createResource as createResourceInRepository,
  countResourcesByEmployeeNo,
  deleteResource as deleteResourceInRepository,
  findResourceByProjectAndEmployee,
  getResourceById,
  getResourcesByEmployeeNo,
  getResourcesByProjectId,
  updateResource as updateResourceInRepository,
} from "../repository/resource.repository.js";
import type { ProjectResourceData } from "../resource.types.js";
import type { CreateResourceInput, UpdateResourceInput } from "../validators/resource.validators.js";

function toResourceDto(row: Awaited<ReturnType<typeof getResourceById>>): ResourceDto {
  if (!row) {
    throw new AppError("Project resource not found.", 404);
  }

  return {
    id: row.id,
    projectId: row.projectId,
    employeeNo: row.employeeNo,
    assignmentStartDate: row.assignmentStartDate,
    assignmentEndDate: row.assignmentEndDate,
    assignmentStatus: row.assignmentStatus,
    hourlyRateSnapshot: row.hourlyRateSnapshot,
    workingDays: row.workingDays,
    totalHours: row.totalHours,
    manhourCost: row.manhourCost,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Throws AppError(404) via getProjectById() if the project doesn't exist or is soft-deleted. */
async function assertProjectExists(projectId: string): Promise<void> {
  await getProjectById(projectId);
}

export async function createResourceForProject(projectId: string, input: CreateResourceInput): Promise<ResourceDto> {
  await assertProjectExists(projectId);

  const existing = await findResourceByProjectAndEmployee(projectId, input.employeeNo);
  if (existing) {
    throw new AppError(`Employee "${input.employeeNo}" is already assigned to this project.`, 409);
  }

  const data: ProjectResourceData = {
    employeeNo: input.employeeNo,
    assignmentStartDate: input.assignmentStartDate ?? null,
    assignmentEndDate: input.assignmentEndDate ?? null,
    assignmentStatus: input.assignmentStatus,
    hourlyRateSnapshot: input.hourlyRateSnapshot,
    workingDays: input.workingDays,
    totalHours: input.totalHours,
    manhourCost: input.totalHours * input.hourlyRateSnapshot,
    lastSyncedAt: new Date(),
  };

  const created = await createResourceInRepository(projectId, data);
  return toResourceDto(created);
}

export async function listResourcesForProject(projectId: string): Promise<ResourceListDto> {
  await assertProjectExists(projectId);

  const rows = await getResourcesByProjectId(projectId);
  return { items: rows.map((row) => toResourceDto(row)) };
}

/** No employee-existence check here — see resource.validators.ts's module comment: Resources has zero dependency on the Employees module by design. */
export async function listResourcesForEmployee(employeeNo: string): Promise<ResourceListDto> {
  const rows = await getResourcesByEmployeeNo(employeeNo);
  return { items: rows.map((row) => toResourceDto(row)) };
}

export async function updateResourceItem(id: string, input: UpdateResourceInput): Promise<ResourceDto> {
  const existing = await getResourceById(id);
  if (!existing) {
    throw new AppError("Project resource not found.", 404);
  }

  const hourlyRateSnapshot = input.hourlyRateSnapshot ?? existing.hourlyRateSnapshot;
  const totalHours = input.totalHours ?? existing.totalHours;

  const updated = await updateResourceInRepository(id, {
    ...(input.assignmentStartDate !== undefined && { assignmentStartDate: input.assignmentStartDate }),
    ...(input.assignmentEndDate !== undefined && { assignmentEndDate: input.assignmentEndDate }),
    ...(input.assignmentStatus !== undefined && { assignmentStatus: input.assignmentStatus }),
    ...(input.workingDays !== undefined && { workingDays: input.workingDays }),
    hourlyRateSnapshot,
    totalHours,
    manhourCost: totalHours * hourlyRateSnapshot,
    lastSyncedAt: new Date(),
  });

  return toResourceDto(updated);
}

export async function deleteResourceItem(id: string): Promise<void> {
  const existing = await getResourceById(id);
  if (!existing) {
    throw new AppError("Project resource not found.", 404);
  }

  await deleteResourceInRepository(id);
}

/**
 * Exported for the Employees module's delete guard only — Employees →
 * Resources, one direction. Resources itself never imports anything from
 * Employees (see resource.validators.ts's module comment), so this stays a
 * clean, acyclic dependency.
 */
export async function countResourcesForEmployee(employeeNo: string): Promise<number> {
  return countResourcesByEmployeeNo(employeeNo);
}
