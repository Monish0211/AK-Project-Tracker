/**
 * Phase 3.1 — General Information only. Every field here maps 1:1 onto a
 * column on the Project model (see schema.prisma), which itself mirrors
 * frontend/src/types/Project.ts's General Information fields exactly.
 * Quantity/Commercial/Payment Milestones/Invoice/Expense/Team/Budget/
 * Documents/Notes/Reminders are out of scope for this phase and have no
 * representation here.
 */
export interface ProjectDto {
  id: string;

  poMonth: string;
  prCategory: string;
  prNo: string;
  client: string;
  department: string;
  domesticForeign: string;
  projectTitle: string;

  workOrderStatus: string;
  projectStartDate: Date;
  projectEndDate: Date | null;
  projectStatus: string;

  actualCompletionDate: Date | null;
  completionRemarks: string | null;
  completedBy: string | null;
  completedTimestamp: Date | null;

  workOrderNumber: string | null;
  workOrderDate: Date | null;
  eicName: string | null;
  contactNumber: string | null;
  emailId: string | null;

  estimatedDuration: number | null;
  durationUnit: string | null;

  contractType: string;
  pmoCoordinator: string | null;

  paymentType: string;

  // Expense Budget — Phase 3.5.
  manhourBudgetAmount: number | null;
  manhourBudgetHours: number | null;
  manhourBudgetRemarks: string | null;
  nonManhourBudgetAmount: number | null;
  nonManhourBudgetRemarks: string | null;

  // Project Leadership — Phase 3.7.
  primaryProjectManager: string | null;
  secondaryProjectManager: string | null;
  projectEngineer: string | null;
  projectCoordinator: string | null;
  clientCoordinator: string | null;

  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Only ever populated by updateProject() when this specific PATCH call
 * transitioned projectStatus into "Completed" for the first time — see
 * project.service.ts's isNewlyCompleted check. Absent (undefined) on every
 * other response (GET, create, an edit that doesn't touch status, or a
 * re-save of an already-Completed project) — never a persisted column,
 * purely a transient result of that one operation.
 */
export interface TimesheetCleanupResultDto {
  deletedTimesheetEntries: number;
  projectResourcesUpdated: number;
}

export interface UpdateProjectResultDto extends ProjectDto {
  timesheetCleanup?: TimesheetCleanupResultDto | null;
}

export interface PaginatedProjectListDto {
  items: ProjectDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** POST /projects/import response — items are in the exact same order as the request's projects[] array. */
export interface ImportProjectsResultDto {
  items: ProjectDto[];
}
