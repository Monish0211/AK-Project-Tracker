import { AppError } from "../../../shared/utils/AppError.js";
import { assertProjectAccess } from "../../../shared/utils/projectAccess.js";
import { reconcileUnassignedEntriesForProject } from "../../timesheets/services/timesheet.service.js";
import { notify, resolveProjectEventRecipients } from "../../notifications/notification.service.js";
import type { AccessTokenPayload } from "../../../shared/types/auth.types.js";
import type {
  ImportProjectsResultDto,
  PaginatedProjectListDto,
  ProjectDto,
} from "../dto/project.dto.js";
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
  restoreProject as restoreProjectInRepository,
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
    deletedAt: project.deletedAt,
    createdByUserId: project.createdByUserId,
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

/**
 * Widened relative to CreateProjectInput only for workOrderStatus/
 * projectStatus (plain string instead of the strict enum) — so this same
 * function can also accept a row validated by importProjectRowSchema, whose
 * whole point is to keep those two fields permissive for legacy Excel data.
 * CreateProjectInput's own narrower enum values are still assignable here.
 */
type GeneralInfoInput = Omit<CreateProjectInput, "workOrderStatus" | "projectStatus"> & {
  workOrderStatus: string;
  projectStatus: string;
};

/** Shared by createProject() and bulkImportProjects() so the two paths can never drift apart on how a validated row becomes a DB row. */
function toGeneralInfoData(input: GeneralInfoInput): ProjectGeneralInfoData {
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

/**
 * The creator identity comes from the authenticated caller's own JWT
 * (`req.user.sub`), never from the request body — there is no
 * `createdByUserId`/similar field in `createProjectSchema` to trust from the
 * client, so there is nothing to strip or validate against spoofing.
 */
export async function createProject(input: CreateProjectInput, creatorUserId: string): Promise<ProjectDto> {
  await assertPrNoAvailable(input.prNo);

  const created = await createProjectInRepository({ ...toGeneralInfoData(input), createdByUserId: creatorUserId });

  // Previously-imported KEKA timesheet rows whose PR code didn't match any
  // Project at import time are stored as "Unassigned" (projectId: null),
  // never rejected — see timesheet.service.ts's processTimesheetImport().
  // Now that a Project with this prNo exists, link any of those rows to it.
  await reconcileUnassignedEntriesForProject(created.id, created.prNo);

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
export async function bulkImportProjects(
  input: ImportProjectsInput,
  creatorUserId: string
): Promise<ImportProjectsResultDto> {
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

  const created = await createProjectsBulk(
    input.projects.map((p) => ({ ...toGeneralInfoData(p), createdByUserId: creatorUserId }))
  );
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

/**
 * Uses findProjectByIdAny (not findProjectById) so an archived project's
 * detail page is still reachable — needed by the Archived Projects page's
 * View action. Every existing caller already treats any 404 uniformly as
 * "not found," so widening this doesn't change behavior for active projects.
 *
 * This is the single project-ownership checkpoint every child-resource
 * module's own assertProjectExists() ultimately calls through — access is
 * checked BEFORE any project data is mapped/returned, never after.
 */
export async function getProjectById(id: string, user: AccessTokenPayload): Promise<ProjectDto> {
  const project = await findProjectByIdAny(id);
  if (!project) {
    throw new AppError("Project not found.", 404);
  }
  assertProjectAccess(user, project);
  return toProjectDto(project);
}

/**
 * Shared by both branches of updateProject() below so the data actually
 * written to the Project row can never drift between the "plain save" and
 * "save + Timesheet cleanup" paths — only which repository call applies it
 * (plain client vs a transaction's tx client) differs.
 */
function toUpdateData(input: UpdateProjectInput): Partial<ProjectGeneralInfoData> {
  return {
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
  };
}

/**
 * A project transitioning to (or out of, or re-entering) "Completed" is a
 * plain field update like any other — Timesheet/ProjectResource history is
 * never touched here. A completed project must remain reopenable with its
 * full manpower/timesheet history intact, so nothing about that status
 * value triggers a side effect on this path at all.
 */
export async function updateProject(id: string, input: UpdateProjectInput, user: AccessTokenPayload): Promise<ProjectDto> {
  const existing = await findProjectById(id);
  if (!existing) {
    throw new AppError("Project not found.", 404);
  }
  assertProjectAccess(user, existing);

  const prNoChanged = Boolean(input.prNo && input.prNo !== existing.prNo);
  if (prNoChanged) {
    await assertPrNoAvailable(input.prNo!, id);
  }

  const updateData = toUpdateData(input);
  const updated = await updateProjectInRepository(id, updateData);

  // Same reconciliation as createProject() above — a PR Number edit can
  // newly match previously-Unassigned timesheet rows just as a brand-new
  // Project can. Only fires when prNo actually changed; other field edits
  // never touch Timesheet data.
  if (prNoChanged) {
    await reconcileUnassignedEntriesForProject(updated.id, updated.prNo);
  }

  return toProjectDto(updated);
}

/**
 * Archive — reversible, the "Delete" button's actual behavior since Phase
 * 3.1. Sets isDeleted/deletedAt only; the row itself, and every child row
 * (QuantityItem/PaymentMilestone/ProjectExpense), are left completely
 * untouched. This is NOT the same operation as permanentlyDeleteProject()
 * below — the two coexist, and this one's behavior does not change. Gated by
 * the "Archive Projects" approval permission at the route layer (see
 * project.routes.ts's requireApprovalPermission) AND project-ownership
 * access (checked here) — same two-layer pattern as permanentlyDeleteProject.
 * Administrator does not automatically bypass the approval permission (must
 * hold the grant like anyone else), matching Permanent Delete's own rule.
 */
export async function archiveProject(id: string, user: AccessTokenPayload): Promise<void> {
  const existing = await findProjectById(id);
  if (!existing) {
    throw new AppError("Project not found.", 404);
  }
  assertProjectAccess(user, existing);

  await archiveProjectInRepository(id);

  // Priority #6 Phase 3B — after the archive has committed. Duplicate
  // protection is structural, not something added here: findProjectById()
  // above only ever finds a currently-active (isDeleted: false) project, so
  // a second archive attempt on an already-archived project 404s before
  // ever reaching this line — this can only ever fire once per real
  // archive transition. Fire-and-forget; never affects this response.
  const recipients = await resolveProjectEventRecipients(existing.createdByUserId, "Projects");
  await notify(recipients, {
    title: "Project Archived",
    message: `Project ${existing.prNo} (${existing.projectTitle}) was archived.`,
    type: "PROJECT_ARCHIVED",
    severity: "Medium",
    entityType: "Project",
    entityId: id,
  });
}

/**
 * Recover — the exact inverse of archiveProject. Deliberately NOT gated by
 * "Archive Projects" or any approval permission (any user with normal
 * Project access may recover) — only project-ownership access is checked.
 * Looks the project up via findProjectByIdAny() since the whole point is
 * finding an archived (isDeleted: true) row that findProjectById would
 * never see.
 */
export async function restoreProject(id: string, user: AccessTokenPayload): Promise<void> {
  const existing = await findProjectByIdAny(id);
  if (!existing) {
    throw new AppError("Project not found.", 404);
  }
  assertProjectAccess(user, existing);

  if (!existing.isDeleted) {
    throw new AppError("This project is not archived.", 409);
  }

  await restoreProjectInRepository(id);

  // Priority #6 Phase 3B — structurally protected against duplicates the
  // same way as archive: the 409 guard just above already refuses a second
  // restore attempt on a project that isn't currently archived, so this can
  // only ever fire once per real restore transition.
  const recipients = await resolveProjectEventRecipients(existing.createdByUserId, "Projects");
  await notify(recipients, {
    title: "Project Restored",
    message: `Project ${existing.prNo} (${existing.projectTitle}) was restored.`,
    type: "PROJECT_RESTORED",
    severity: "Info",
    entityType: "Project",
    entityId: id,
  });
}

/**
 * Permanent Delete — irreversible, gated by BOTH the global "Delete Project
 * Permanently" approval permission (enforced at the route layer via
 * requireApprovalPermission — does the caller hold this grant at all) AND
 * project-ownership access (checked here — may the caller touch THIS
 * project). Holding the permission alone is not sufficient to delete every
 * project in the company; it must also be one the caller is authorized for
 * (their own creation, an unclaimed legacy project, or any project if
 * Administrator). A full cascade of project-owned operational/commercial
 * rows: PostgreSQL removes every QuantityItem/PaymentMilestone/
 * ProjectExpense/ProjectResource via onDelete: Cascade, and
 * hardDeleteProjectInRepository() deletes InvoiceLine rows first (Restrict
 * FK — see that function's comment). TimesheetEntry / TimesheetImport /
 * TimesheetImportRowLog are preserved: deleting the Project only SetNulls
 * TimesheetEntry.projectId.
 *
 * Looks the project up via findProjectByIdAny() (not findProjectById), since
 * this must also work on a project that's already archived — Archive first,
 * Permanent Delete later is the expected, recommended path.
 *
 * There is no financial-record protection here — the permission gate itself
 * is the protection. A project with invoices/expenses is deleted exactly the
 * same as one without, as long as the caller holds the permission and is
 * authorized for this specific project. Historical timesheet evidence
 * always survives.
 */
export async function permanentlyDeleteProject(id: string, user: AccessTokenPayload): Promise<void> {
  const existing = await findProjectByIdAny(id);
  if (!existing) {
    throw new AppError("Project not found.", 404);
  }
  assertProjectAccess(user, existing);

  await hardDeleteProjectInRepository(id);

  // Priority #6 Phase 3B — after the delete has committed. Structurally
  // protected against duplicates: the row is gone once this line runs, so a
  // second attempt against the same id 404s at findProjectByIdAny() above,
  // before ever reaching here — this can only ever fire once.
  //
  // entityType is deliberately NULL here, NOT "Project" — this is a forced
  // consequence of notify()'s existing, protected buildActionUrl(), which
  // unconditionally derives actionUrl from entityType+entityId together
  // whenever entityType is truthy (see notification.service.ts's notify()).
  // Since the Project entity type already has a real route builder
  // (/projects/edit/:id), setting entityType: "Project" here would
  // unavoidably produce a dead link to a project that no longer exists —
  // exactly what's explicitly disallowed. entityId is still preserved as
  // the deleted project's real id for historical reference (createNotification
  // stores entityType/entityId independently, not as a coupled pair — only
  // buildActionUrl treats them as one), which is the smallest change that
  // satisfies both "keep the historical id" and "never a dead link" without
  // modifying notify()'s existing behavior.
  const recipients = await resolveProjectEventRecipients(existing.createdByUserId, "Projects");
  await notify(recipients, {
    title: "Project Permanently Deleted",
    message: `Project ${existing.prNo} (${existing.projectTitle}) was permanently deleted.`,
    type: "PROJECT_DELETED",
    severity: "Critical",
    entityType: null,
    entityId: id,
  });
}

export async function listProjects(query: ListProjectsQuery, user: AccessTokenPayload): Promise<PaginatedProjectListDto> {
  // region is an alias for prCategory (see schema.prisma) — prCategory
  // takes precedence if both were somehow sent, since it's the field's
  // real name.
  const prCategory = query.prCategory || query.region;

  // Administrator sees everything (callerUserId: undefined ⇒ no ownership
  // restriction in buildWhereClause); every other role only ever sees
  // projects they created plus unclaimed legacy projects (createdByUserId:
  // null) — never a second, list-specific authorization concept.
  const callerUserId = user.roleName === "Administrator" ? undefined : user.sub;

  const { items, total } = await findProjectsPage(
    {
      search: query.search,
      projectStatus: query.projectStatus,
      department: query.department,
      client: query.client,
      prCategory,
      isDeleted: query.isDeleted,
      callerUserId,
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
