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

  contractExchangeRate: number;
  currentExchangeRate: number;

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

  totalWOQty: number;
  totalInvoiceQty: number;
  totalPendingQty: number;

  pendingAmount: number;
  pendingInvoicePercentage: number;

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