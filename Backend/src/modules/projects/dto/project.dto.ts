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

  // Commercial Summary GST toggle — see schema.prisma's own comment on this
  // column. GST Rate/GST Amount/Grand Total are NOT part of this DTO —
  // those stay derived client-side from quantityItems + this flag.
  gstApplicable: boolean;

  // Quantity Details project-level currency defaults — see schema.prisma's
  // own comment on these columns. Each QuantityItem's own currency/
  // exchangeRate columns are separate and untouched by these.
  currency: string;
  currentExchangeRate: number;
  contractExchangeRate: number;

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

  // Project Remarks — optional free-text timeline/delay explanation.
  remarks: string | null;

  isDeleted: boolean;
  deletedAt: Date | null;
  createdByUserId: string | null;
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
