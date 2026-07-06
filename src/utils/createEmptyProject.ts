import type { Project } from "../types/Project";

export function createEmptyProject(): Project {
  return {
    id: crypto.randomUUID(),

    // ==========================
    // GENERAL INFORMATION
    // ==========================

    poMonth: "",
    prCategory: "",

    prNo: "",
    client: "",
    department: "",
    domesticForeign: "",
    projectTitle: "",

    workOrderStatus: "",
    projectStartDate: "",
    projectEndDate: "",
    projectStatus: "",

    // ==========================
    // QUANTITY INFORMATION
    // ==========================

    quantityItems: [
      {
        id: crypto.randomUUID(),

        description: "",

        woQty: 0,
        invoiceQty: 0,
        pendingQty: 0,

        currency: "INR",

        unitRate: 0,
        exchangeRate: 1,
        unitRateINR: 0,

        pendingAmount: 0,
      },
    ],

    totalWOQty: 0,
    totalInvoiceQty: 0,
    totalPendingQty: 0,

    pendingAmount: 0,
    pendingInvoicePercentage: 0,

    // ==========================
    // COMMERCIAL INFORMATION
    // ==========================

    contractFormalities: "",

    paymentTerms: "",

    currency: "INR",

    contractExchangeRate: 1,

    currentExchangeRate: 1,

    workOrderValue: 0,

    workOrderValueINR: 0,

    // ==========================
    // PAYMENT MILESTONES
    // ==========================

    paymentType: "Single",

    paymentMilestones: [
      {
        id: crypto.randomUUID(),
        paymentPercentage: 100,
        dueDate: "",
        amount: 0,
      },
    ],

    // ==========================
    // INVOICE INFORMATION
    // ==========================

    invoiceRaised: 0,
    invoiceRaisedINR: 0,

    balanceToBeRaised: 0,
    balanceToBeRaisedINR: 0,

    paymentReceived: 0,
    paymentReceivedINR: 0,

    outstanding: 0,
    outstandingINR: 0,

    paymentStatus: "",

    // ==========================
    // EXPENSE INFORMATION
    // ==========================

    manhourExpenses: 0,
    nonManhourExpenses: 0,

    totalExpenses: 0,

    profit: 0,
    profitPercentage: 0,

    // ==========================
    // DOCUMENT INFORMATION
    // ==========================

    reportLink: "",
    completionCertificate: "",
    projectCompletionDate: "",

    // ==========================
    // PROJECT TEAM
    // ==========================

    projectManager: "",
    projectEngineer: "",
    projectCoordinator: "",

    clientReferenceNo: "",
    remarks: "",

    // ==========================
    // AUDIT
    // ==========================

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}