import type { QuantityItem } from "./QuantityItem";

export interface Project {
  id: string;

  // ==========================
  // GENERAL INFORMATION
  // ==========================

  poMonth: string;
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
  // COMMERCIAL INFORMATION
  // ==========================

  contractFormalities: string;
  paymentTerms: string;

  workOrderValue: number;

  currency: string;

  // Exchange Rate at the time of Contract
  contractExchangeRate: number;

  // Current Live Exchange Rate
  currentExchangeRate: number;

  // Automatically Calculated
  workOrderValueINR: number;

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
  // DOCUMENT INFORMATION
  // ==========================

  reportLink: string;

  completionCertificate: string;

  projectCompletionDate: string;

  // ==========================
  // EXPENSE INFORMATION
  // ==========================

  manhourExpenses: number;

  nonManhourExpenses: number;

  totalExpenses: number;

  profit: number;

  profitPercentage: number;

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
  // AUDIT INFORMATION
  // ==========================

  createdAt?: string;

  updatedAt?: string;
}