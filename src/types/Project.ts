import type { QuantityItem } from "./QuantityItem";
import type { ManhourExpense } from "./ManhourExpense";
import type { NonManhourExpense } from "./NonManhourExpense";
import type { InvoiceItem } from "./InvoiceItem";
import type { MilestoneBilling } from "./MilestoneBilling";
import type { ProjectNote } from "./ProjectNote";

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

  invoiceItems: InvoiceItem[];

  // Payment Milestone (commercial) billing history — entirely independent of
  // Quantity Based Billing recorded on invoiceItems[].invoices.
  milestoneBillings: MilestoneBilling[];

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