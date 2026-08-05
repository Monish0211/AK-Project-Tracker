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

  // Work Order Details — the actual WO document reference and its
  // Engineer-in-Charge contact, separate from the workOrderStatus/
  // workOrderValue fields above.
  workOrderNumber?: string;
  workOrderDate?: string;
  eicName?: string;
  contactNumber?: string;
  emailId?: string;

  // Project Scheduling — only estimatedDuration/durationUnit are stored;
  // Planned Completion Date and Working Days (Approx.) are always derived
  // from projectStartDate + these two at render time (see
  // GeneralInfoCard.tsx), never persisted, so they can't drift out of sync
  // with a later Project Start Date edit.
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

    /** e.g. "Submission Draft", "Submission Final". Optional for backward compatibility with existing projects. */
    milestoneName?: string;

    paymentPercentage: number;

    dueDate: string;

    amount: number;
  }[];

  // ==========================
  // INVOICE INFORMATION
  // ==========================

  /** Undefined until Accounts explicitly picks one in the Invoice Management header — no default. See getInvoiceMethod() in InvoiceCalculations.ts. */
  invoiceMethod?: InvoiceMethod;

  invoiceItems: InvoiceItem[];

  // Future-ready placeholder — see types/QuantityRevision.ts. No mutation
  // logic exists yet; only backs the Invoice History "Quantity Revisions"
  // section layout.
  quantityRevisions?: QuantityRevision[];

  // Collection received against raised invoices.
  // Not yet editable from the UI — kept ready for backend/payment
  // gateway integration so Outstanding Collection can be computed today.
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

  // Timesheet synchronization: Historical monthly imports
  // Automatically populated from Timesheets module imports
  timesheetMonths?: TimesheetImportMonth[];
  latestTimesheetMonth?: string; // YYYY-MM format

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