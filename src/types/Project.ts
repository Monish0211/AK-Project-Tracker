import type { QuantityItem } from "./QuantityItem";
import type { ManhourExpense } from "./ManhourExpense";
import type { NonManhourExpense } from "./NonManhourExpense";
import type { InvoiceItem } from "./InvoiceItem";

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
  // COMMERCIAL INFORMATION
  // ==========================

  contractFormalities: string;

  paymentTerms: string;

  currency: string;

  contractExchangeRate: number;

  currentExchangeRate: number;

  workOrderValue: number;

  workOrderValueINR: number;

  // ==========================
  // PAYMENT MILESTONES
  // ==========================

  paymentType: "Single" | "Multiple";

  paymentMilestones: {
    id: string;

    paymentPercentage: number;

    dueDate: string;

    amount: number;
  }[];

  // ==========================
  // INVOICE INFORMATION
  // ==========================

  invoiceItems: InvoiceItem[];

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

  projectManager: string;
  projectEngineer: string;
  projectCoordinator: string;

  clientReferenceNo: string;
  remarks: string;

  // ==========================
  // AUDIT
  // ==========================

  createdAt?: string;
  updatedAt?: string;
}