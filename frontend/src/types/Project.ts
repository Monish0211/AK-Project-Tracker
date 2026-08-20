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
  workingDays: number;
  totalHours: number;
  status: "Active" | "Released";
  location?: string;
}