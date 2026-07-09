import type { Project } from "../types/Project";
import { createEmptyProject } from "../utils/createEmptyProject";

const STORAGE_KEY = "projects";

function normalizeProject(project: Project): Project {
  const defaults = createEmptyProject();

  const normalizedCurrency = project.currency || "INR";
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
        const woValue = typeof item.woValue === "number" ? item.woValue : (item.woQty || 0) * unitRateINR;
        const pendingQty = Math.max((item.woQty || 0) - (item.invoiceQty || 0), 0);
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

  return {
    ...defaults,
    ...project,
    currency: normalizedCurrency,
    currentExchangeRate: normalizedCurrentExchangeRate,
    contractExchangeRate: normalizedContractExchangeRate,
    quantityItems: normalizedQuantityItems,
    paymentMilestones: Array.isArray(project.paymentMilestones)
      ? project.paymentMilestones
      : defaults.paymentMilestones,
    manhourExpenses: Array.isArray(project.manhourExpenses)
      ? project.manhourExpenses
      : [],
    nonManhourExpenses: Array.isArray(project.nonManhourExpenses)
      ? project.nonManhourExpenses
      : [],
    invoiceItems: Array.isArray(project.invoiceItems)
      ? project.invoiceItems
      : [],
    resources: Array.isArray(project.resources)
      ? project.resources.map((res: any) => ({
          ...res,
          workingDays: typeof res.workingDays === "number" ? res.workingDays : 0,
          totalHours: typeof res.totalHours === "number" ? res.totalHours : 0,
          status: res.status || "Active",
        }))
      : [],
    clientCoordinator: project.clientCoordinator || "",
    lastImportedDate: project.lastImportedDate || "",
    lastImportedBy: project.lastImportedBy || "",
    lastImportedRowsCount: typeof project.lastImportedRowsCount === "number" ? project.lastImportedRowsCount : 0,
    contractType: project.contractType || "LUMP SUM",
    totalHoursBudget: typeof project.totalHoursBudget === "number" ? project.totalHoursBudget : 0,
    totalProjectBudget: typeof project.totalProjectBudget === "number" ? project.totalProjectBudget : 0,
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
    JSON.stringify(projects)
  );
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