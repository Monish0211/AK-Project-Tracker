import type { QuantityItem } from "./QuantityItem";

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

  invoiceRaised: number;
  invoiceRaisedINR: number;

  balanceToBeRaised: number;
  balanceToBeRaisedINR: number;

  paymentReceived: number;
  paymentReceivedINR: number;

  outstanding: number;
  outstandingINR: number;

  paymentStatus: string;

  // ==========================
  // EXPENSE INFORMATION
  // ==========================

  manhourExpenses: number;
  nonManhourExpenses: number;

  totalExpenses: number;

  profit: number;
  profitPercentage: number;

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