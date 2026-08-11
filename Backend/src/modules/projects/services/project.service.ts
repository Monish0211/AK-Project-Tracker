import { AppError } from "../../../shared/utils/AppError.js";
import type { PaginatedProjectListDto, ProjectDto } from "../dto/project.dto.js";
import {
  createProject as createProjectInRepository,
  findActiveProjectByPrNo,
  findProjectById,
  findProjectsPage,
  softDeleteProject as softDeleteProjectInRepository,
  updateProject as updateProjectInRepository,
} from "../repository/project.repository.js";
import type { CreateProjectInput, ListProjectsQuery, UpdateProjectInput } from "../validators/project.validators.js";

function toProjectDto(project: Awaited<ReturnType<typeof findProjectById>>): ProjectDto {
  if (!project) {
    throw new AppError("Project not found.", 404);
  }

  return {
    id: project.id,
    poMonth: project.poMonth,
    prCategory: project.prCategory,
    prNo: project.prNo,
    client: project.client,
    department: project.department,
    domesticForeign: project.domesticForeign,
    projectTitle: project.projectTitle,
    workOrderStatus: project.workOrderStatus,
    projectStartDate: project.projectStartDate,
    projectEndDate: project.projectEndDate,
    projectStatus: project.projectStatus,
    actualCompletionDate: project.actualCompletionDate,
    completionRemarks: project.completionRemarks,
    completedBy: project.completedBy,
    completedTimestamp: project.completedTimestamp,
    workOrderNumber: project.workOrderNumber,
    workOrderDate: project.workOrderDate,
    eicName: project.eicName,
    contactNumber: project.contactNumber,
    emailId: project.emailId,
    estimatedDuration: project.estimatedDuration,
    durationUnit: project.durationUnit,
    contractType: project.contractType,
    pmoCoordinator: project.pmoCoordinator,
    isDeleted: project.isDeleted,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

/**
 * PR Number identifies a project the same way email identifies a
 * PortalUser — this mirrors createUser()'s findUserByEmail duplicate check
 * exactly, scoped to active (non-deleted) projects only.
 */
async function assertPrNoAvailable(prNo: string, excludingProjectId?: string): Promise<void> {
  const existing = await findActiveProjectByPrNo(prNo);
  if (existing && existing.id !== excludingProjectId) {
    throw new AppError(`A project with PR Number "${prNo}" already exists.`, 409);
  }
}

export async function createProject(input: CreateProjectInput): Promise<ProjectDto> {
  await assertPrNoAvailable(input.prNo);

  const created = await createProjectInRepository({
    poMonth: input.poMonth,
    prCategory: input.prCategory,
    prNo: input.prNo,
    client: input.client,
    department: input.department,
    domesticForeign: input.domesticForeign,
    projectTitle: input.projectTitle,
    workOrderStatus: input.workOrderStatus,
    projectStartDate: input.projectStartDate,
    projectEndDate: input.projectEndDate ?? null,
    projectStatus: input.projectStatus,
    actualCompletionDate: input.actualCompletionDate ?? null,
    completionRemarks: input.completionRemarks ?? null,
    completedBy: input.completedBy ?? null,
    completedTimestamp: input.completedTimestamp ?? null,
    workOrderNumber: input.workOrderNumber,
    workOrderDate: input.workOrderDate,
    eicName: input.eicName,
    contactNumber: input.contactNumber ?? null,
    emailId: input.emailId ?? null,
    estimatedDuration: input.estimatedDuration ?? null,
    durationUnit: input.durationUnit ?? null,
    contractType: input.contractType,
    pmoCoordinator: input.pmoCoordinator ?? null,
  });

  return toProjectDto(created);
}

export async function getProjectById(id: string): Promise<ProjectDto> {
  const project = await findProjectById(id);
  return toProjectDto(project);
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<ProjectDto> {
  const existing = await findProjectById(id);
  if (!existing) {
    throw new AppError("Project not found.", 404);
  }

  if (input.prNo && input.prNo !== existing.prNo) {
    await assertPrNoAvailable(input.prNo, id);
  }

  const updated = await updateProjectInRepository(id, {
    ...(input.poMonth !== undefined && { poMonth: input.poMonth }),
    ...(input.prCategory !== undefined && { prCategory: input.prCategory }),
    ...(input.prNo !== undefined && { prNo: input.prNo }),
    ...(input.client !== undefined && { client: input.client }),
    ...(input.department !== undefined && { department: input.department }),
    ...(input.domesticForeign !== undefined && { domesticForeign: input.domesticForeign }),
    ...(input.projectTitle !== undefined && { projectTitle: input.projectTitle }),
    ...(input.workOrderStatus !== undefined && { workOrderStatus: input.workOrderStatus }),
    ...(input.projectStartDate !== undefined && { projectStartDate: input.projectStartDate }),
    ...(input.projectEndDate !== undefined && { projectEndDate: input.projectEndDate }),
    ...(input.projectStatus !== undefined && { projectStatus: input.projectStatus }),
    ...(input.actualCompletionDate !== undefined && { actualCompletionDate: input.actualCompletionDate }),
    ...(input.completionRemarks !== undefined && { completionRemarks: input.completionRemarks }),
    ...(input.completedBy !== undefined && { completedBy: input.completedBy }),
    ...(input.completedTimestamp !== undefined && { completedTimestamp: input.completedTimestamp }),
    ...(input.workOrderNumber !== undefined && { workOrderNumber: input.workOrderNumber }),
    ...(input.workOrderDate !== undefined && { workOrderDate: input.workOrderDate }),
    ...(input.eicName !== undefined && { eicName: input.eicName }),
    ...(input.contactNumber !== undefined && { contactNumber: input.contactNumber }),
    ...(input.emailId !== undefined && { emailId: input.emailId }),
    ...(input.estimatedDuration !== undefined && { estimatedDuration: input.estimatedDuration }),
    ...(input.durationUnit !== undefined && { durationUnit: input.durationUnit }),
    ...(input.contractType !== undefined && { contractType: input.contractType }),
    ...(input.pmoCoordinator !== undefined && { pmoCoordinator: input.pmoCoordinator }),
  });

  return toProjectDto(updated);
}

/** Soft delete only — never a hard delete. isDeleted/deletedAt are set; the row itself is never removed. */
export async function deleteProject(id: string): Promise<void> {
  const existing = await findProjectById(id);
  if (!existing) {
    throw new AppError("Project not found.", 404);
  }

  await softDeleteProjectInRepository(id);
}

export async function listProjects(query: ListProjectsQuery): Promise<PaginatedProjectListDto> {
  // region is an alias for prCategory (see schema.prisma) — prCategory
  // takes precedence if both were somehow sent, since it's the field's
  // real name.
  const prCategory = query.prCategory || query.region;

  const { items, total } = await findProjectsPage(
    {
      search: query.search,
      projectStatus: query.projectStatus,
      department: query.department,
      client: query.client,
      prCategory,
    },
    query.sortField,
    query.sortDirection,
    query.page,
    query.pageSize
  );

  return {
    items: items.map((item) => toProjectDto(item)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}
