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

  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
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
