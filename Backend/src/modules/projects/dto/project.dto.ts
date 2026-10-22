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
  rfqNo: string | null;
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

  // Liquidated Damages (Oct 2026) — see schema.prisma / projectCompletion.rules.ts.
  // ldApplicable null = not recorded (never "No"); ldAmountINR set only when true.
  ldApplicable: boolean | null;
  ldAmountINR: number | null;
  ldRemarks: string | null;
  ldRecordedByUserId: string | null;
  ldRecordedAt: Date | null;

  workOrderNumber: string | null;
  workOrderDate: Date | null;
  eicName: string | null;
  contactNumber: string | null;
  emailId: string | null;

  estimatedDuration: number | null;
  durationUnit: string | null;

  contractType: string;
  pmoCoordinator: string | null;
  /** The assigned coordinator ACCOUNT (null for legacy text-only coordinators); see projectAccess.ts. */
  pmoCoordinatorUserId: string | null;
  pmoCoordinatorAssignedAt: Date | null;

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

  // Invoice Currency feature (Oct 2026) — the project's persisted INVOICE
  // currency lock (separate from `currency` above). Read-only through this
  // API; set only by invoice.service.ts. null = not persisted yet (the
  // invoice service still infers INR for projects with pre-feature raised
  // invoices — see invoiceCurrency.rules.ts's resolveEffectiveLock()).
  invoiceCurrency: string | null;

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

  // Work Order Value / Pending Due — Aug 2026 bug fix. Previously this DTO
  // carried NEITHER figure, so the frontend's Project Repository LIST could
  // only ever show a correct value for an account whose OWN browser already
  // had this project's real QuantityItems cached locally (e.g. the account
  // that built it via Add Project) — every other account saw "—" until they
  // personally opened Edit Project once. These two fields are a read-only,
  // server-computed aggregate — SUM(QuantityItem.woValue) and the same
  // "Balance to Invoice" formula Dashboard already uses — so every account
  // sees correct figures directly from this DTO, with no dependency on any
  // per-browser local cache history. See project.service.ts's
  // computeCommercialTotalsByProjectId() for how these are computed (reuses
  // the Dashboard module's existing aggregation queries/formula, never a
  // second implementation of either calculation). NOT a new source of truth
  // for anywhere the real QuantityItem/InvoiceItem arrays are already loaded
  // client-side (Edit Project, Add Project) — those continue to compute from
  // their own real data exactly as before.
  workOrderValueINR: number;
  pendingDueINR: number;
  /**
   * True when every non-Cancelled invoice line of this project has actually reached "Paid" (and there is at least one). The
   * Project Repository's Invoice Status shows "Paid" only when the Work Order Value is fully invoiced AND this is true — fully
   * invoiced alone is "Partially Paid". Server-computed from the same invoice lines as pendingDueINR, never from the browser cache.
   */
  allInvoicesPaid: boolean;
  /**
   * Invoice Request indicator (Oct 2026) — whether this project currently
   * has an Open InvoiceRequest. Deliberately independent of, and never
   * feeding into, the Project Repository's own Invoice Status calculation
   * (Not Started / Raised / Partially Paid / Paid), which remains exactly
   * as it was — this flag only drives the small, separate "+" indicator
   * shown beside that unchanged status badge. See project.service.ts's
   * computeCommercialTotalsByProjectId() for how it's computed (one
   * batched query, never N+1).
   */
  hasOpenInvoiceRequest: boolean;
  /**
   * Server-authoritative expense totals (Oct 2026) — SUM(ProjectResource.manhourCost)
   * and SUM(active ProjectExpense.totalCost), batched per page like
   * workOrderValueINR above. Lets list screens (Completed Projects) show
   * Profit Before / After LD without reading the browser cache.
   */
  manhourCostINR: number;
  nonManhourCostINR: number;
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
