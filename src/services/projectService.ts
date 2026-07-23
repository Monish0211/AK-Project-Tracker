import type { Project } from "../types/Project";
import { createEmptyProject, inferPrCategory, inferDomesticForeign } from "../utils/createEmptyProject";
import { calculateQuantity } from "../utils/quantityCalculations";
import { syncInvoiceItemsWithQuantity } from "./invoiceSyncService";

const STORAGE_KEY = "projects";

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
    contractType: normalizedContractType,
    department: normalizedDepartment,
    pmoCoordinator: normalizedPmoCoordinator,
    poMonth: normalizedPoMonth,
    currency: normalizedCurrency,
    currentExchangeRate: normalizedCurrentExchangeRate,
    contractExchangeRate: normalizedContractExchangeRate,
    quantityItems: normalizedQuantityItems,
    gstApplicable: normalizedGstApplicable,
    ...totals,
    paymentMilestones,
    paymentType: project.paymentType || (paymentMilestones.length > 1 ? "Multiple" : "Single"),
    paymentTerms: project.paymentTerms || "30% / 40% / 30%",
    milestoneBillings: Array.isArray(project.milestoneBillings)
      ? project.milestoneBillings
      : [],
    manhourExpenses: Array.isArray(project.manhourExpenses)
      ? project.manhourExpenses
      : [],
    nonManhourExpenses: Array.isArray(project.nonManhourExpenses)
      ? project.nonManhourExpenses
      : [],
    invoiceItems: syncInvoiceItemsWithQuantity(
      normalizedQuantityItems,
      Array.isArray(project.invoiceItems) ? project.invoiceItems : []
    ).map((item) => ({
      ...item,
      invoices: (Array.isArray(item.invoices) ? item.invoices : []).map((invoice) => ({
        id: invoice.id,
        invoiceDate: invoice.invoiceDate || "",
        quantityBilled: typeof invoice.quantityBilled === "number" ? invoice.quantityBilled : 0,
        invoiceAmountINR: typeof invoice.invoiceAmountINR === "number" ? invoice.invoiceAmountINR : 0,
      })),
    })),
    resources: Array.isArray(project.resources)
      ? project.resources.map((res: any) => ({
          ...res,
          workingDays: typeof res.workingDays === "number" ? res.workingDays : Number(res.workingDays) || 0,
          totalHours: typeof res.totalHours === "number" ? res.totalHours : Number(res.totalHours) || 0,
          status: res.status || "Active",
        }))
      : [],
    primaryProjectManager: project.primaryProjectManager || (project as any).projectManager || "",
    secondaryProjectManager: project.secondaryProjectManager || "",
    clientCoordinator: project.clientCoordinator || "",
    lastImportedDate: project.lastImportedDate || "",
    lastImportedBy: project.lastImportedBy || "",
    lastImportedRowsCount: typeof project.lastImportedRowsCount === "number" ? project.lastImportedRowsCount : Number(project.lastImportedRowsCount) || 0,
    totalHoursBudget: typeof project.totalHoursBudget === "number" ? project.totalHoursBudget : Number(project.totalHoursBudget) || 0,
    totalProjectBudget: totals.workOrderValueINR,

    manhourBudgetAmount: typeof project.manhourBudgetAmount === "number" ? project.manhourBudgetAmount : Number(project.manhourBudgetAmount) || 0,
    manhourBudgetHours: typeof project.manhourBudgetHours === "number" ? project.manhourBudgetHours : Number(project.manhourBudgetHours) || 0,
    manhourBudgetRemarks: project.manhourBudgetRemarks || "",
    nonManhourBudgetAmount: typeof project.nonManhourBudgetAmount === "number" ? project.nonManhourBudgetAmount : Number(project.nonManhourBudgetAmount) || 0,
    nonManhourBudgetRemarks: project.nonManhourBudgetRemarks || "",
  };
}

export const getProjects = (): Project[] => {
  const data = localStorage.getItem(STORAGE_KEY);

  if (!data) {
    return [];
  }

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

  // Lets the Dashboard (and any other live view) know project data changed,
  // without introducing a new store or altering any calculation.
  window.dispatchEvent(new Event("pmo:data-changed"));
};

export const addProject = (project: Project): void => {
  const projects = getProjects();

  projects.push(project);

  saveProjects(projects);
};

export const updateProject = (
  updatedProject: Project
): void => {
  const projects = getProjects();

  const updated = projects.map((project) =>
    project.id === updatedProject.id
      ? updatedProject
      : project
  );

  saveProjects(updated);
};

export const deleteProject = (id: string): void => {
  const projects = getProjects();

  const filtered = projects.filter(
    (project) => project.id !== id
  );

  saveProjects(filtered);
};

export const getProjectById = (
  id: string
): Project | undefined => {
  return getProjects().find(
    (project) => project.id === id
  );
};

export const clearProjects = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};