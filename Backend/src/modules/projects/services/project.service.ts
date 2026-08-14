import { AppError } from "../../../shared/utils/AppError.js";
import type { ImportProjectsResultDto, PaginatedProjectListDto, ProjectDto } from "../dto/project.dto.js";
import type { ProjectGeneralInfoData } from "../repository/project.repository.js";
import {
  archiveProject as archiveProjectInRepository,
  createProject as createProjectInRepository,
  createProjectsBulk,
  findActiveProjectByPrNo,
  findActiveProjectsByPrNos,
  findProjectById,
  findProjectByIdAny,
  findProjectsPage,
  hardDeleteProject as hardDeleteProjectInRepository,
  updateProject as updateProjectInRepository,
} from "../repository/project.repository.js";
import type {
  CreateProjectInput,
  ImportProjectsInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from "../validators/project.validators.js";

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
    paymentType: project.paymentType,
    manhourBudgetAmount: project.manhourBudgetAmount,
    manhourBudgetHours: project.manhourBudgetHours,
    manhourBudgetRemarks: project.manhourBudgetRemarks,
    nonManhourBudgetAmount: project.nonManhourBudgetAmount,
    nonManhourBudgetRemarks: project.nonManhourBudgetRemarks,
    primaryProjectManager: project.primaryProjectManager,
    secondaryProjectManager: project.secondaryProjectManager,
    projectEngineer: project.projectEngineer,
    projectCoordinator: project.projectCoordinator,
    clientCoordinator: project.clientCoordinator,
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

/** Shared by createProject() and bulkImportProjects() so the two paths can never drift apart on how a validated row becomes a DB row. */
function toGeneralInfoData(input: CreateProjectInput): ProjectGeneralInfoData {
  return {
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
    paymentType: input.paymentType,
    manhourBudgetAmount: input.manhourBudgetAmount ?? null,
    manhourBudgetHours: input.manhourBudgetHours ?? null,
    manhourBudgetRemarks: input.manhourBudgetRemarks ?? null,
    nonManhourBudgetAmount: input.nonManhourBudgetAmount ?? null,
    nonManhourBudgetRemarks: input.nonManhourBudgetRemarks ?? null,
    primaryProjectManager: input.primaryProjectManager ?? null,
    secondaryProjectManager: input.secondaryProjectManager ?? null,
    projectEngineer: input.projectEngineer ?? null,
    projectCoordinator: input.projectCoordinator ?? null,
    clientCoordinator: input.clientCoordinator ?? null,
  };
}

export async function createProject(input: CreateProjectInput): Promise<ProjectDto> {
  await assertPrNoAvailable(input.prNo);

  const created = await createProjectInRepository(toGeneralInfoData(input));

  return toProjectDto(created);
}

/**
 * Excel import — every row is the exact same createProjectSchema a single
 * POST /projects validates, so acceptance here can never disagree with
 * acceptance one at a time. All rows land or none do: a single multi-row
 * INSERT (createProjectsBulk) is already atomic, and the duplicate checks
 * below run first so a bad batch never reaches the database at all.
 * Response order matches the request's projects[] order (matched back by
 * prNo — already confirmed unique within the batch below — rather than
 * assumed from DB insert order).
 */
export async function bulkImportProjects(input: ImportProjectsInput): Promise<ImportProjectsResultDto> {
  const prNos = input.projects.map((p) => p.prNo);

  const seen = new Set<string>();
  for (const prNo of prNos) {
    const key = prNo.trim().toLowerCase();
    if (seen.has(key)) {
      throw new AppError(`Duplicate PR Number "${prNo}" within the import file.`, 409);
    }
    seen.add(key);
  }

  const existing = await findActiveProjectsByPrNos(prNos);
  if (existing.length > 0) {
    const names = existing.map((p) => `"${p.prNo}"`).join(", ");
    throw new AppError(`The following PR Numbers already exist: ${names}.`, 409);
  }

  const created = await createProjectsBulk(input.projects.map(toGeneralInfoData));
  const createdByPrNo = new Map(created.map((row) => [row.prNo, row]));

  const items = input.projects.map((p) => {
    const row = createdByPrNo.get(p.prNo);
    if (!row) {
      // Should be unreachable — createProjectsBulk() inserted exactly one
      // row per submitted prNo, already confirmed unique above.
      throw new AppError(`Project with PR Number "${p.prNo}" was not created.`, 500);
    }
    return toProjectDto(row);
  });

  return { items };
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
    ...(input.paymentType !== undefined && { paymentType: input.paymentType }),
    ...(input.manhourBudgetAmount !== undefined && { manhourBudgetAmount: input.manhourBudgetAmount }),
    ...(input.manhourBudgetHours !== undefined && { manhourBudgetHours: input.manhourBudgetHours }),
    ...(input.manhourBudgetRemarks !== undefined && { manhourBudgetRemarks: input.manhourBudgetRemarks }),
    ...(input.nonManhourBudgetAmount !== undefined && { nonManhourBudgetAmount: input.nonManhourBudgetAmount }),
    ...(input.nonManhourBudgetRemarks !== undefined && { nonManhourBudgetRemarks: input.nonManhourBudgetRemarks }),
    ...(input.primaryProjectManager !== undefined && { primaryProjectManager: input.primaryProjectManager }),
    ...(input.secondaryProjectManager !== undefined && { secondaryProjectManager: input.secondaryProjectManager }),
    ...(input.projectEngineer !== undefined && { projectEngineer: input.projectEngineer }),
    ...(input.projectCoordinator !== undefined && { projectCoordinator: input.projectCoordinator }),
    ...(input.clientCoordinator !== undefined && { clientCoordinator: input.clientCoordinator }),
  });

  return toProjectDto(updated);
}

/**
 * Archive — reversible, the "Delete" button's actual behavior since Phase
 * 3.1. Sets isDeleted/deletedAt only; the row itself, and every child row
 * (QuantityItem/PaymentMilestone/ProjectExpense), are left completely
 * untouched. This is NOT the same operation as permanentlyDeleteProject()
 * below — the two coexist, and this one's behavior does not change.
 */
export async function archiveProject(id: string): Promise<void> {
  const existing = await findProjectById(id);
  if (!existing) {
    throw new AppError("Project not found.", 404);
  }

  await archiveProjectInRepository(id);
}

/**
 * Permanent Delete — irreversible, Administrator-only (enforced at the route
 * layer via authorize("Administrator")). A real row delete: PostgreSQL
 * removes every QuantityItem/PaymentMilestone/ProjectExpense row for this
 * project automatically via their onDelete: Cascade foreign keys (see
 * schema.prisma) — nothing here or in any other module's repository ever
 * deletes those rows directly.
 *
 * Looks the project up via findProjectByIdAny() (not findProjectById), since
 * this must also work on a project that's already archived — Archive first,
 * Permanent Delete later is the expected, recommended path.
 *
 * `hasInvoiceHistory` is asserted by the caller (see
 * permanentDeleteProjectSchema in project.validators.ts for why this can't
 * be independently verified here yet — Invoices/InvoiceLines have no
 * Postgres table today). A true value blocks the delete with a 409,
 * preserving financial history exactly as Archive already does.
 */
export async function permanentlyDeleteProject(id: string, hasInvoiceHistory: boolean): Promise<void> {
  const existing = await findProjectByIdAny(id);
  if (!existing) {
    throw new AppError("Project not found.", 404);
  }

  if (hasInvoiceHistory) {
    throw new AppError(
      "This project contains financial records and cannot be permanently deleted. Archive the project instead.",
      409
    );
  }

  await hardDeleteProjectInRepository(id);
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
