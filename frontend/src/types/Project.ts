import type { QuantityItem } from "./QuantityItem";
import type { ManhourExpense } from "./ManhourExpense";
import type { NonManhourExpense } from "./NonManhourExpense";
import type { InvoiceItem, InvoiceMethod } from "./InvoiceItem";
import type { QuantityRevision } from "./QuantityRevision";
import type { ProjectNote } from "./ProjectNote";
import type { TimesheetImportMonth } from "./Timesheet";
import type { InvoiceDocumentDetails } from "./InvoiceDocument";

export interface Project {
  id: string;

  // ==========================
  // GENERAL INFORMATION
  // ==========================

  poMonth: string;

  prCategory: string;

  prNo: string;
  client: string;
  department: string;
  domesticForeign: string;
  projectTitle: string;

  workOrderStatus: string;
  projectStartDate: string;
  projectEndDate: string;
  projectStatus: string;

  // Formal Project Completion Fields
  actualCompletionDate?: string;
  completionRemarks?: string;
  completedBy?: string;
  completedTimestamp?: string;

  // Work Order Details
  workOrderNumber?: string;
  workOrderDate?: string;
  eicName?: string;
  contactNumber?: string;
  emailId?: string;

  // Project Scheduling
  estimatedDuration?: number;
  durationUnit?: "Days" | "Weeks" | "Months";

  // ==========================
  // QUANTITY INFORMATION
  // ==========================

  quantityItems: QuantityItem[];

  totalWOQty: number;
  totalInvoiceQty: number;
  totalPendingQty: number;

  pendingAmount: number;
  pendingInvoicePercentage: number;

  // ==========================
  // GST / COMMERCIAL SUMMARY (Quantity Details)
  // ==========================

  gstApplicable: boolean;
  gstRate: number;
  gstAmount: number;
  grandTotal: number;

  // ==========================
  // COMMERCIAL INFORMATION
  // ==========================

  contractFormalities: string;

  paymentTerms: string;

  currency: string;

  contractExchangeRate: number;

  currentExchangeRate: number;

  workOrderValue: number;

  workOrderValueINR: number;

  // Work Order Value / Pending Due — Aug 2026 bug fix. Server-computed
  // fallback aggregate from GET/POST/PATCH /projects (see Backend's
  // ProjectDto), carried through untouched by normalizeProject()'s own
  // recompute. Used ONLY when this project's real quantityItems/invoiceItems
  // haven't been loaded into this browser yet (e.g. the Project Repository
  // list, before Edit Project has ever been opened here) — see
  // normalizeProject() in projectService.ts and getProjectCommercialSummary()
  // in invoiceProgressService.ts for where each is consumed. Never a second
  // source of truth once the real item arrays ARE populated.
  backendWorkOrderValueINR?: number;
  backendPendingDueINR?: number;
  // Invoice Request indicator (Oct 2026) — whether this project currently
  // has an Open InvoiceRequest. Deliberately independent of, and never
  // feeding into, the Invoice Status calculation below (Not Started /
  // Raised / Partially Paid / Paid, still derived client-side exactly as
  // before from workOrderValueINR/backendPendingDueINR) — this flag only
  // drives Project Repository's small, separate "+" indicator beside the
  // unchanged status badge. See Backend's ProjectDto for how it's computed.
  hasOpenInvoiceRequest?: boolean;
  // Invoice Currency feature (Oct 2026) — the backend's persisted invoice-
  // currency lock (ProjectDto.invoiceCurrency), separate from `currency`
  // (Quantity Details' pricing currency). undefined = the backend doesn't
  // report it (older backend, or a never-synced local project) and USD
  // invoicing is not offered; null = backend supports it, nothing locked
  // yet. See Invoice/invoiceCurrency.ts's isInvoiceCurrencySupported().
  invoiceCurrency?: string | null;

  contractType: string;

  // ==========================
  // PAYMENT MILESTONES
  // ==========================

  paymentType: "Single" | "Multiple";

  paymentMilestones: {
    id: string;
    milestoneName?: string;
    paymentPercentage: number;
    dueDate: string;
    amount: number;
  }[];

  // ==========================
  // INVOICE INFORMATION
  // ==========================

  invoiceMethod?: InvoiceMethod;

  invoiceItems: InvoiceItem[];

  quantityRevisions?: QuantityRevision[];

  paymentReceived: number;
  paymentReceivedINR: number;

  // ==========================
  // EXPENSE INFORMATION
  // ==========================

  manhourExpenses: ManhourExpense[];

  nonManhourExpenses: NonManhourExpense[];

  // ==========================
  // DOCUMENT INFORMATION
  // ==========================

  reportLink: string;
  completionCertificate: string;
  projectCompletionDate: string;

  // ==========================
  // PROJECT TEAM
  // ==========================

  primaryProjectManager: string;
  secondaryProjectManager: string;
  projectEngineer: string;
  projectCoordinator: string;
  pmoCoordinator?: string;
  /** The assigned PMO Coordinator ACCOUNT, from the backend (null/absent = legacy text-only coordinator). */
  pmoCoordinatorUserId?: string | null;
  /** Form-only: the registry entry picked in General Information this session; sent so the backend can validate and link it. */
  pmoCoordinatorEntryId?: string;
  clientCoordinator: string;

  resources: ProjectResource[];

  timesheetMonths?: TimesheetImportMonth[];
  latestTimesheetMonth?: string;

  totalHoursBudget?: number;
  totalProjectBudget?: number;

  lastImportedDate?: string;
  lastImportedBy?: string;
  lastImportedRowsCount?: number;

  // ==========================
  // EXPENSE BUDGET INFORMATION
  // ==========================
  manhourBudgetAmount?: number;
  manhourBudgetHours?: number;
  manhourBudgetRemarks?: string;
  nonManhourBudgetAmount?: number;
  nonManhourBudgetRemarks?: string;

  clientReferenceNo: string;
  remarks: string;

  // ==========================
  // AUDIT
  // ==========================

  createdAt?: string;
  updatedAt?: string;

  // Archive (soft-delete) — populated from the backend for the Archived
  // Projects page; absent/false for every normal (non-archived) project.
  isDeleted?: boolean;
  deletedAt?: string | null;

  // Project-ownership authorization — null for every project created before
  // this field existed (treated as accessible to every normal user) or for
  // any project created by someone else once role-based UI ever needs to
  // distinguish that. Never sent by the client; set server-side only.
  createdByUserId?: string | null;

  notes?: ProjectNote[];
  invoiceDocumentDetailsMap?: Record<string, InvoiceDocumentDetails>;
}

export interface ProjectResource {
  id: string;
  employeeNo: string;
  employeeName: string;
  reportingManager: string;
  department: string;
  designation: string;
  startDate: string;
  endDate: string;
  hourlyRateSnapshot?: number;
  workingDays: number;
  totalHours: number;
  manhourCost?: number;
  status: "Active" | "Released";
  location?: string;
}