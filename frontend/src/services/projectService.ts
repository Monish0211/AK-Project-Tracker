import type { Project } from "../types/Project";
import type { ProjectNote } from "../types/ProjectNote";
import type { InvoiceLine, InvoiceLineStatus } from "../types/InvoiceItem";
import { createEmptyProject, inferPrCategory, inferDomesticForeign } from "../utils/createEmptyProject";
import { calculateQuantity } from "../utils/quantityCalculations";
import { syncInvoiceItemsWithQuantity } from "./invoiceSyncService";
import { notificationService } from "../notifications/notificationService";

const STORAGE_KEY = "projects";

const VALID_INVOICE_LINE_STATUSES: InvoiceLineStatus[] = ["Draft", "Raised", "PartiallyPaid", "Paid", "Cancelled"];

function normalizeInvoiceLineStatus(value: unknown): InvoiceLineStatus {
  if (typeof value === "string" && (VALID_INVOICE_LINE_STATUSES as string[]).includes(value)) {
    return value as InvoiceLineStatus;
  }
  return "Raised";
}

export function normalizeProject(project: Project): Project {
  const defaults = createEmptyProject();

  const normalizedPrNo = project.prNo || "";
  const normalizedPrCategory = inferPrCategory(normalizedPrNo, project.prCategory);
  const normalizedCurrency = project.currency || "INR";
  const normalizedDomesticForeign = inferDomesticForeign(normalizedCurrency, normalizedPrCategory, project.domesticForeign);
  const normalizedWorkOrderStatus = project.workOrderStatus || "";
  const normalizedProjectStatus = project.projectStatus || "";
  const normalizedContractType = project.contractType || "";
  const normalizedDepartment = project.department || "";
  const normalizedPmoCoordinator = project.pmoCoordinator || "";
  const normalizedPoMonth = project.poMonth || (project.projectStartDate ? project.projectStartDate.substring(0, 7) : "");

  const normalizedCurrentExchangeRate = typeof project.currentExchangeRate === "number" ? project.currentExchangeRate : 1;
  const normalizedContractExchangeRate = typeof project.contractExchangeRate === "number" ? project.contractExchangeRate : 1;

  const normalizedQuantityItems = Array.isArray(project.quantityItems)
    ? project.quantityItems.map((item: any) => {
        const uom = item.uom || "DAY";
        const assignedTo = item.assignedTo || "";
        const currency = item.currency || normalizedCurrency;
        const exchangeRate = typeof item.exchangeRate === "number" ? item.exchangeRate : normalizedCurrentExchangeRate;
        const unitRate = typeof item.unitRate === "number" ? item.unitRate : 0;
        const unitRateINR = currency === "INR" ? unitRate : unitRate * exchangeRate;
        const isLumpSum = (uom || "").trim().toUpperCase() === "LUMP SUM";
        const woValue = isLumpSum ? unitRateINR : (item.woQty || 0) * unitRateINR;
        const pendingQty = isLumpSum
          ? Math.max(1 - (item.invoiceQty || 0), 0)
          : Math.max((item.woQty || 0) - (item.invoiceQty || 0), 0);
        const pendingAmount = pendingQty * unitRateINR;

        return {
          ...item,
          uom,
          assignedTo,
          currency,
          exchangeRate,
          unitRate,
          unitRateINR,
          woValue,
          pendingQty,
          pendingAmount,
        };
      })
    : defaults.quantityItems;

  const normalizedGstApplicable =
    typeof project.gstApplicable === "boolean" ? project.gstApplicable : false;

  const totals = calculateQuantity(
    normalizedQuantityItems,
    normalizedCurrency,
    normalizedCurrentExchangeRate,
    normalizedGstApplicable
  );

  const paymentMilestones = Array.isArray(project.paymentMilestones)
    ? project.paymentMilestones.map((milestone) => ({
        ...milestone,
        milestoneName: milestone.milestoneName || "",
        amount: (totals.workOrderValueINR * (milestone.paymentPercentage || 0)) / 100,
      }))
    : defaults.paymentMilestones;

  return {
    ...defaults,
    ...project,
    prNo: normalizedPrNo,
    prCategory: normalizedPrCategory,
    domesticForeign: normalizedDomesticForeign,
    workOrderStatus: normalizedWorkOrderStatus,
    projectStatus: normalizedProjectStatus,
    actualCompletionDate: project.actualCompletionDate || "",
    completionRemarks: project.completionRemarks || "",
    completedBy: project.completedBy || "",
    completedTimestamp: project.completedTimestamp || "",
    contractType: normalizedContractType,
    department: normalizedDepartment,
    pmoCoordinator: normalizedPmoCoordinator,
    poMonth: normalizedPoMonth,
    currency: normalizedCurrency,
    currentExchangeRate: normalizedCurrentExchangeRate,
    contractExchangeRate: normalizedContractExchangeRate,
    quantityItems: normalizedQuantityItems,
    gstApplicable: normalizedGstApplicable,
    gstRate: totals.gstRate,
    gstAmount: totals.gstAmount,
    grandTotal: totals.grandTotal,
    totalWOQty: totals.totalWOQty,
    totalInvoiceQty: totals.totalInvoiceQty,
    totalPendingQty: totals.totalPendingQty,
    workOrderValue: totals.workOrderValue,
    workOrderValueINR: totals.workOrderValueINR,
    pendingAmount: totals.pendingAmount,
    pendingInvoicePercentage: totals.pendingInvoicePercentage,
    paymentMilestones,
    invoiceItems: syncInvoiceItemsWithQuantity(
      normalizedQuantityItems,
      project.invoiceItems
    ).map((item) => ({
      ...item,
      invoices: Array.isArray(item.invoices)
        ? item.invoices.map((line: InvoiceLine) => ({
            ...line,
            status: normalizeInvoiceLineStatus(line.status),
          }))
        : [],
    })),
    manhourExpenses: Array.isArray(project.manhourExpenses) ? project.manhourExpenses : [],
    nonManhourExpenses: Array.isArray(project.nonManhourExpenses) ? project.nonManhourExpenses : [],
    resources: Array.isArray(project.resources) ? project.resources : [],
    paymentReceived: typeof project.paymentReceived === "number" ? project.paymentReceived : 0,
    paymentReceivedINR: typeof project.paymentReceivedINR === "number" ? project.paymentReceivedINR : 0,
  };
}

export const getProjects = (): Project[] => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    const parsed: Project[] = JSON.parse(data);
    return parsed.map(normalizeProject);
  } catch {
    return [];
  }
};

export const saveProjects = (projects: Project[]): void => {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(projects.map(normalizeProject))
  );

  window.dispatchEvent(new Event("pmo:data-changed"));
};

export const addProject = (project: Project): void => {
  const projects = getProjects();
  projects.push(project);
  saveProjects(projects);
};

export const updateProject = (updatedProject: Project): void => {
  const projects = getProjects();
  const updated = projects.map((project) =>
    project.id === updatedProject.id ? updatedProject : project
  );
  saveProjects(updated);
};

/** Formal Project Completion Workflow function with portal-wide event synchronization */
export const completeProject = (
  id: string,
  completionData: {
    actualCompletionDate: string;
    completionRemarks: string;
    completedBy?: string;
  }
): void => {
  const projects = getProjects();
  const index = projects.findIndex((p) => p.id === id);
  if (index === -1) return;

  const p = projects[index];
  const completedBy = completionData.completedBy || "Administrator";
  const timestamp = new Date().toISOString();

  // 1. Create Project Note / Activity Timeline Entry matching ProjectNote interface
  const completionNote: ProjectNote = {
    id: `note-${Date.now()}`,
    projectId: id,
    message: `PROJECT COMPLETED\nCompletion Date: ${completionData.actualCompletionDate}\nCompleted By: ${completedBy}\nRemarks: ${completionData.completionRemarks}`,
    createdBy: completedBy,
    createdAt: timestamp,
  };

  const updatedNotes = Array.isArray(p.notes) ? [completionNote, ...p.notes] : [completionNote];

  projects[index] = {
    ...p,
    projectStatus: "Completed",
    actualCompletionDate: completionData.actualCompletionDate,
    completionRemarks: completionData.completionRemarks,
    completedBy,
    completedTimestamp: timestamp,
    notes: updatedNotes,
  };

  saveProjects(projects);

  // 2. Dispatch persistent Event Notification for Dashboard & Notification Drawer
  try {
    notificationService.dispatchEvent({
      ruleId: "PROJECT_COMPLETED",
      version: 1,
      title: `✅ Project Completed: ${p.prNo}`,
      message: `PR ${p.prNo} (${p.projectTitle || "Project"}) marked as Completed on ${completionData.actualCompletionDate} by ${completedBy}.\nRemarks: ${completionData.completionRemarks}`,
      category: "Success",
      severity: "Info",
      source: "Projects",
      targetAudience: "Everyone",
      deliveryChannels: ["InApp"],
      projectId: p.id,
      projectCode: p.prNo,
      actionLabel: "View Project",
      actionRoute: `/projects/view/${p.id}`,
      timestamp: timestamp,
    });
  } catch (err) {
    console.error("Failed to dispatch completion notification:", err);
  }

  // 3. Dispatch system events for reactive state update across all open views
  window.dispatchEvent(
    new CustomEvent("pmo:project-completed", {
      detail: {
        projectId: id,
        prNo: p.prNo,
        projectTitle: p.projectTitle,
        actualCompletionDate: completionData.actualCompletionDate,
        completionRemarks: completionData.completionRemarks,
        completedBy,
      },
    })
  );
  window.dispatchEvent(new Event("pmo:notifications-changed"));
  window.dispatchEvent(new Event("pmo:data-changed"));
};

export const deleteProject = (id: string): void => {
  const projects = getProjects();
  const filtered = projects.filter((project) => project.id !== id);
  saveProjects(filtered);
};

export const getProjectById = (id: string): Project | undefined => {
  return getProjects().find((project) => project.id === id);
};

export const clearProjects = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};