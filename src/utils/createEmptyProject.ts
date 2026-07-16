import type { Project } from "../types/Project";
import { syncInvoiceItemsWithQuantity } from "../services/invoiceSyncService";

export function createEmptyProject(): Project {
  const quantityItems = [
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
  ];

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

    quantityItems,

    totalWOQty: 0,
    totalInvoiceQty: 0,
    totalPendingQty: 0,

    pendingAmount: 0,
    pendingInvoicePercentage: 0,

    // ==========================
    // GST / COMMERCIAL SUMMARY (Quantity Details)
    // ==========================

    gstApplicable: false,
    gstRate: 0,
    gstAmount: 0,
    grandTotal: 0,

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

    contractType: "LUMP SUM",

    // ==========================
    // PAYMENT MILESTONES
    // ==========================

    paymentType: "Single",

    paymentMilestones: [
      {
        id: crypto.randomUUID(),
        milestoneName: "",
        paymentPercentage: 100,
        dueDate: "",
        amount: 0,
      },
    ],

    // ==========================
    // INVOICE INFORMATION
    // ==========================

    invoiceItems: syncInvoiceItemsWithQuantity(quantityItems, []),
    milestoneBillings: [],

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

    primaryProjectManager: "",
    secondaryProjectManager: "",
    projectEngineer: "",
    projectCoordinator: "",
    pmoCoordinator: "",
    clientCoordinator: "",

    resources: [],

    totalHoursBudget: 0,
    totalProjectBudget: 0,

    lastImportedDate: "",
    lastImportedBy: "",
    lastImportedRowsCount: 0,

    manhourBudgetAmount: 0,
    manhourBudgetHours: 0,
    manhourBudgetRemarks: "",
    nonManhourBudgetAmount: 0,
    nonManhourBudgetRemarks: "",

    clientReferenceNo: "",
    remarks: "",

    // ==========================
    // AUDIT
    // ==========================

    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}