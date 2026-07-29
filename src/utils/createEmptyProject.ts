import type { Project } from "../types/Project";
import { syncInvoiceItemsWithQuantity } from "../services/invoiceSyncService";

export const PR_CATEGORIES = [
  "India",
  "Malaysia",
  "Oman",
  "Abu Dhabi",
  "FZI",
  "Elixir Qatar",
  "Qatar",
] as const;

export const PR_NUMBER_PREFIX_MAP: Record<string, string> = {
  India: "PR-",
  Malaysia: "MYPR-",
  Oman: "EE-",
  "Abu Dhabi": "PRAD-",
  FZI: "PRI-",
  "Elixir Qatar": "EE-Q-",
  Qatar: "Q-PR-",
};

export function inferPrCategory(prNo: string, rawPrCategory?: string): string {
  if (rawPrCategory && rawPrCategory.trim()) {
    const trimmed = rawPrCategory.trim();
    const match = PR_CATEGORIES.find((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (match) return match;
    return trimmed;
  }

  const cleanPr = (prNo || "").trim().toUpperCase();
  if (cleanPr.startsWith("MYPR")) return "Malaysia";
  if (cleanPr.startsWith("EE-Q") || cleanPr.startsWith("EEQ")) return "Elixir Qatar";
  if (cleanPr.startsWith("EE")) return "Oman";
  if (cleanPr.startsWith("PRAD")) return "Abu Dhabi";
  if (cleanPr.startsWith("PRI")) return "FZI";
  if (cleanPr.startsWith("Q-PR") || cleanPr.startsWith("QPR")) return "Qatar";
  if (cleanPr.startsWith("PR-")) return "India";

  return "";
}

export function inferDomesticForeign(currency?: string, prCategory?: string, rawValue?: string): string {
  if (rawValue && rawValue.trim()) {
    const trimmed = rawValue.trim();
    if (trimmed.toLowerCase().includes("dom")) return "Domestic";
    if (trimmed.toLowerCase().includes("for")) return "Foreign";
  }
  if ((currency || "INR").toUpperCase() === "INR" || prCategory === "India") {
    return "Domestic";
  }
  return "Foreign";
}

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
    quantityRevisions: [],

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