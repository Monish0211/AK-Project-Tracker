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

        uom: "DAY",
        assignedTo: "",

        currency: "INR",

        unitRate: 0,
        exchangeRate: 1,
        unitRateINR: 0,

        woValue: 0,
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

    invoiceItems: [
      {
        id: crypto.randomUUID(),
        description: "",
        numberOfDays: 0,
        location: "",
        unitPrice: 0,
        totalPrice: 0,
        invoices: [],
      },
    ],

    paymentReceived: 0,
    paymentReceivedINR: 0,

    // ==========================
    // EXPENSE INFORMATION
    // ==========================

    manhourExpenses: [],
    nonManhourExpenses: [],

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