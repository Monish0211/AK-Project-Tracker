import type { Project, ProjectResource } from "../types/Project";
import type { ProjectNote } from "../types/ProjectNote";
import type { InvoiceLine, InvoiceLineStatus } from "../types/InvoiceItem";
import { createEmptyProject, inferPrCategory, inferDomesticForeign } from "../utils/createEmptyProject";
import { calculateQuantity } from "../utils/quantityCalculations";
import { syncInvoiceItemsWithQuantity } from "./invoiceSyncService";
import { notificationService } from "../notifications/notificationService";
import { apiClient, ApiError } from "./apiClient";
import { getEmployees } from "./employeeService";

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

// =============================================================================
// PHASE 3.1 — BACKEND-CONNECTED GENERAL INFORMATION
// =============================================================================
// Everything below is new, additive, and calls the real backend
// (Backend/src/modules/projects) for General Information fields only —
// Quantity/Commercial/Payment Milestones/Invoice/Expense/Team/Budget/
// Documents/Notes/Reminders all remain exactly as they were above: pure
// localStorage, untouched by this section.
//
// Design: the localStorage array above stays the single source every other
// module (Dashboard/Sidebar/Reports/Notifications/Timesheets/breadcrumbs)
// already reads via the synchronous getProjects()/getProjectById() — none of
// that code changes. Functions here call the API, merge the returned
// General Information fields into whatever local record already exists for
// that id (preserving every other field untouched), and write the result
// back into the SAME localStorage array via saveProjects() — which already
// dispatches "pmo:data-changed", so every other module picks up the change
// for free, with no code of its own to change.

/** Raw shape one row of GET/POST/PATCH /projects returns — see Backend's ProjectDto. */
interface BackendProjectDto {
  id: string;
  poMonth: string;
  prCategory: string;
  prNo: string;
  client: string;
  department: string;
  domesticForeign: string;
  projectTitle: string;
  workOrderStatus: string;
  projectStartDate: string;
  projectEndDate: string | null;
  projectStatus: string;
  actualCompletionDate: string | null;
  completionRemarks: string | null;
  completedBy: string | null;
  completedTimestamp: string | null;
  workOrderNumber: string | null;
  workOrderDate: string | null;
  eicName: string | null;
  contactNumber: string | null;
  emailId: string | null;
  estimatedDuration: number | null;
  durationUnit: string | null;
  contractType: string;
  pmoCoordinator: string | null;
  paymentType: string;
  // Expense Budget — Phase 3.5. Flat fields on Project, same as everything
  // else in this DTO — see Backend's ProjectDto.
  manhourBudgetAmount: number | null;
  manhourBudgetHours: number | null;
  manhourBudgetRemarks: string | null;
  nonManhourBudgetAmount: number | null;
  nonManhourBudgetRemarks: string | null;
  // Project Leadership — Phase 3.7. Same 5 flat fields as Backend's ProjectDto.
  primaryProjectManager: string | null;
  secondaryProjectManager: string | null;
  projectEngineer: string | null;
  projectCoordinator: string | null;
  clientCoordinator: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  // Only ever present when this specific PATCH call transitioned
  // projectStatus into "Completed" for the first time (see Backend's
  // project.service.ts isNewlyCompleted check) — absent on every other
  // response. See updateProjectGeneralInfo() below for how this drives the
  // completion notification + Timesheet refresh.
  timesheetCleanup?: TimesheetCleanupResult | null;
}

export interface TimesheetCleanupResult {
  deletedTimesheetEntries: number;
  projectResourcesUpdated: number;
}

interface BackendPaginatedProjectList {
  items: BackendProjectDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** What the backend's General Information create/update endpoints accept — see Backend's createProjectSchema/updateProjectSchema. */
interface ProjectGeneralInfoPayload {
  poMonth: string;
  prCategory: string;
  prNo: string;
  client: string;
  department: string;
  domesticForeign: string;
  projectTitle: string;
  workOrderStatus: string;
  projectStartDate: string;
  projectEndDate: string | null;
  projectStatus: string;
  actualCompletionDate: string | null;
  completionRemarks: string | null;
  completedBy: string | null;
  completedTimestamp: string | null;
  workOrderNumber: string | null;
  workOrderDate: string | null;
  eicName: string | null;
  contactNumber: string | null;
  emailId: string | null;
  estimatedDuration: number | null;
  durationUnit: string | null;
  contractType: string;
  pmoCoordinator: string | null;
  paymentType: string;
  // Expense Budget — Phase 3.5. Same 5 flat fields as BackendProjectDto.
  manhourBudgetAmount: number | null;
  manhourBudgetHours: number | null;
  manhourBudgetRemarks: string | null;
  nonManhourBudgetAmount: number | null;
  nonManhourBudgetRemarks: string | null;
  // Project Leadership — Phase 3.7. Same 5 flat fields as BackendProjectDto.
  primaryProjectManager: string | null;
  secondaryProjectManager: string | null;
  projectEngineer: string | null;
  projectCoordinator: string | null;
  clientCoordinator: string | null;
}

/** Empty string -> null. The backend's optional string fields reject "" (min(1) once present) — omit-or-null is what they expect, matching Users module's own validator style. */
function orNull(value: string | undefined): string | null {
  return value && value.trim() !== "" ? value : null;
}

function toGeneralInfoPayload(project: Project): ProjectGeneralInfoPayload {
  return {
    poMonth: project.poMonth,
    prCategory: project.prCategory,
    prNo: project.prNo,
    client: project.client,
    department: project.department,
    domesticForeign: project.domesticForeign,
    projectTitle: project.projectTitle,
    workOrderStatus: project.workOrderStatus,
    projectStartDate: project.projectStartDate,
    projectEndDate: orNull(project.projectEndDate),
    projectStatus: project.projectStatus,
    actualCompletionDate: orNull(project.actualCompletionDate),
    completionRemarks: orNull(project.completionRemarks),
    completedBy: orNull(project.completedBy),
    completedTimestamp: orNull(project.completedTimestamp),
    workOrderNumber: orNull(project.workOrderNumber),
    workOrderDate: orNull(project.workOrderDate),
    eicName: orNull(project.eicName),
    contactNumber: orNull(project.contactNumber),
    emailId: orNull(project.emailId),
    estimatedDuration: typeof project.estimatedDuration === "number" ? project.estimatedDuration : null,
    durationUnit: project.durationUnit || null,
    contractType: project.contractType || "LUMP SUM",
    pmoCoordinator: orNull(project.pmoCoordinator),
    paymentType: project.paymentType || "Single",
    manhourBudgetAmount: typeof project.manhourBudgetAmount === "number" ? project.manhourBudgetAmount : null,
    manhourBudgetHours: typeof project.manhourBudgetHours === "number" ? project.manhourBudgetHours : null,
    manhourBudgetRemarks: orNull(project.manhourBudgetRemarks),
    nonManhourBudgetAmount: typeof project.nonManhourBudgetAmount === "number" ? project.nonManhourBudgetAmount : null,
    nonManhourBudgetRemarks: orNull(project.nonManhourBudgetRemarks),
    primaryProjectManager: orNull(project.primaryProjectManager),
    secondaryProjectManager: orNull(project.secondaryProjectManager),
    projectEngineer: orNull(project.projectEngineer),
    projectCoordinator: orNull(project.projectCoordinator),
    clientCoordinator: orNull(project.clientCoordinator),
  };
}

/** Full ISO datetime -> the "YYYY-MM-DD" a <input type="date"> requires. */
function toDateOnly(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/**
 * Overlays a backend row's General Information fields onto whatever local
 * record already exists for that id — every other field (quantityItems,
 * invoiceItems, resources, notes, etc.) is preserved untouched. A brand-new
 * project (created via the backend, never seen locally before) starts from
 * createEmptyProject()'s defaults for everything else.
 */
/**
 * `explicitBase` lets a caller that already has a fully-built local Project
 * object (e.g. Excel import, which parses Quantity/Payment Milestones/
 * Expense Budget from the workbook before General Information even reaches
 * the backend) supply it directly, instead of this function looking one up
 * by `dto.id` — which would never match for a brand-new row anyway, since
 * the backend hasn't issued that id yet at parse time. Every other caller
 * (create/update/list/get) omits it and keeps the original lookup-by-id
 * behavior unchanged.
 */
function mergeBackendGeneralInfoIntoLocalProject(dto: BackendProjectDto, explicitBase?: Project): Project {
  const existingLocal = explicitBase ?? getProjects().find((p) => p.id === dto.id);
  const base = existingLocal ?? createEmptyProject();

  return normalizeProject({
    ...base,
    id: dto.id,
    poMonth: dto.poMonth,
    prCategory: dto.prCategory,
    prNo: dto.prNo,
    client: dto.client,
    department: dto.department,
    domesticForeign: dto.domesticForeign,
    projectTitle: dto.projectTitle,
    workOrderStatus: dto.workOrderStatus,
    projectStartDate: toDateOnly(dto.projectStartDate),
    projectEndDate: toDateOnly(dto.projectEndDate),
    projectStatus: dto.projectStatus,
    actualCompletionDate: toDateOnly(dto.actualCompletionDate) || undefined,
    completionRemarks: dto.completionRemarks || undefined,
    completedBy: dto.completedBy || undefined,
    completedTimestamp: dto.completedTimestamp || undefined,
    workOrderNumber: dto.workOrderNumber || undefined,
    workOrderDate: toDateOnly(dto.workOrderDate) || undefined,
    eicName: dto.eicName || undefined,
    contactNumber: dto.contactNumber || undefined,
    emailId: dto.emailId || undefined,
    estimatedDuration: dto.estimatedDuration ?? undefined,
    durationUnit: (dto.durationUnit as Project["durationUnit"]) || undefined,
    contractType: dto.contractType,
    pmoCoordinator: dto.pmoCoordinator || undefined,
    paymentType: (dto.paymentType as Project["paymentType"]) || "Single",
    manhourBudgetAmount: dto.manhourBudgetAmount ?? undefined,
    manhourBudgetHours: dto.manhourBudgetHours ?? undefined,
    manhourBudgetRemarks: dto.manhourBudgetRemarks || undefined,
    nonManhourBudgetAmount: dto.nonManhourBudgetAmount ?? undefined,
    nonManhourBudgetRemarks: dto.nonManhourBudgetRemarks || undefined,
    primaryProjectManager: dto.primaryProjectManager || "",
    secondaryProjectManager: dto.secondaryProjectManager || "",
    projectEngineer: dto.projectEngineer || "",
    projectCoordinator: dto.projectCoordinator || "",
    clientCoordinator: dto.clientCoordinator || "",
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  });
}

/** Upserts by id into the same localStorage array getProjects() reads, via the existing saveProjects() — so pmo:data-changed fires and every other module refreshes with no code of its own to change. */
function writeThroughProjectsMirror(projects: Project[]): void {
  const current = getProjects();
  const byId = new Map(current.map((p) => [p.id, p]));
  projects.forEach((p) => byId.set(p.id, p));
  saveProjects(Array.from(byId.values()));
}

export interface ProjectListParams {
  search?: string;
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortDirection?: "asc" | "desc";
  projectStatus?: string;
  department?: string;
  client?: string;
  /** Alias for prCategory — PR Category's values (India/Malaysia/Oman/...) are this app's region list. */
  region?: string;
  prCategory?: string;
}

export interface ProjectListResult {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
}

/** The real, paginated/searchable/sortable/filterable Project List — GET /projects. */
export async function fetchProjectsFromApi(params: ProjectListParams = {}): Promise<ProjectListResult> {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 10));
  if (params.sortField) query.set("sortField", params.sortField);
  if (params.sortDirection) query.set("sortDirection", params.sortDirection);
  if (params.projectStatus) query.set("projectStatus", params.projectStatus);
  if (params.department) query.set("department", params.department);
  if (params.client) query.set("client", params.client);
  if (params.region) query.set("region", params.region);
  if (params.prCategory) query.set("prCategory", params.prCategory);

  const result = await apiClient.get<BackendPaginatedProjectList>(`/projects?${query.toString()}`);
  // Wrapped in an arrow, not passed directly: Array.prototype.map() calls its
  // callback as (value, index, array) — passed directly, the numeric index
  // would flow into mergeBackendGeneralInfoIntoLocalProject's optional
  // second parameter (explicitBase?: Project), which is never the intent.
  const items = result.items.map((dto) => mergeBackendGeneralInfoIntoLocalProject(dto));
  writeThroughProjectsMirror(items);

  return { items, total: result.total, page: result.page, pageSize: result.pageSize };
}

interface BackendResourceDto {
  id: string;
  employeeNo: string;
  assignmentStartDate: string | null;
  assignmentEndDate: string | null;
  assignmentStatus: string;
  workingDays: number;
  totalHours: number;
}

/**
 * Connects Team Assigned / Project manpower display to the real backend
 * ProjectResource data (produced by the KEKA Timesheet import pipeline —
 * see Backend/src/modules/timesheets/services/projectResource.service.ts).
 * Upserts by the backend resource's own id, so real KEKA-derived resources
 * coexist with any manually-added resource rows (TeamAssignedCard.tsx's own
 * "Add" flow) rather than replacing them — mirrors the exact write-through
 * pattern already used for Employees/Projects. TeamAssignedCard.tsx itself
 * is completely unmodified: it already reads project.resources exactly as
 * it always has.
 */
async function refreshProjectResourcesFromBackend(project: Project): Promise<Project> {
  try {
    const result = await apiClient.get<{ items: BackendResourceDto[] }>(`/projects/${project.id}/resources`);
    const employees = getEmployees();

    const backendResources: ProjectResource[] = result.items.map((r) => {
      const emp = employees.find((e) => e.employeeNo.trim().toLowerCase() === r.employeeNo.trim().toLowerCase());
      return {
        id: r.id,
        employeeNo: r.employeeNo,
        employeeName: emp?.employeeName || r.employeeNo,
        reportingManager: emp?.reportingManager || "",
        department: emp?.department || "",
        designation: emp?.designation || "",
        startDate: r.assignmentStartDate ? r.assignmentStartDate.slice(0, 10) : "",
        endDate: r.assignmentEndDate ? r.assignmentEndDate.slice(0, 10) : "",
        workingDays: r.workingDays,
        totalHours: r.totalHours,
        status: (r.assignmentStatus === "Released" ? "Released" : "Active") as "Active" | "Released",
        location: emp?.location || "",
      };
    });

    const existingResources = Array.isArray(project.resources) ? project.resources : [];
    const byId = new Map(existingResources.map((r) => [r.id, r]));
    backendResources.forEach((r) => byId.set(r.id, r));

    return { ...project, resources: Array.from(byId.values()) };
  } catch {
    // Non-fatal — Team Assigned still works with whatever local resources
    // already exist if this call fails (e.g. offline, or the project has
    // no backend resources yet).
    return project;
  }
}

/** Fresh single-project fetch — GET /projects/:id. Returns undefined if not found (or soft-deleted). */
export async function fetchProjectByIdFromApi(id: string): Promise<Project | undefined> {
  try {
    const dto = await apiClient.get<BackendProjectDto>(`/projects/${id}`);
    let merged = mergeBackendGeneralInfoIntoLocalProject(dto);
    merged = await refreshProjectResourcesFromBackend(merged);
    writeThroughProjectsMirror([merged]);
    return merged;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return undefined;
    throw err;
  }
}

/** Creates a project's General Information via the real backend — POST /projects. */
export async function createProjectGeneralInfo(project: Project): Promise<Project> {
  const dto = await apiClient.post<BackendProjectDto>("/projects", toGeneralInfoPayload(project));
  const merged = mergeBackendGeneralInfoIntoLocalProject(dto);
  writeThroughProjectsMirror([merged]);
  return merged;
}

/**
 * Updates a project's General Information via the real backend — PATCH
 * /projects/:id. When this specific save transitioned Project Status into
 * "Completed", the backend has already deleted that Project's live
 * Timesheet records and recomputed the affected ProjectResource rows in
 * one atomic operation (see Backend's project.service.ts updateProject) —
 * `timesheetCleanup` on the response is how the caller finds out. This
 * function reacts to that by dispatching the existing in-app notification
 * (the same notificationService completeProject() below already uses);
 * refreshing the Timesheets page's own data is the caller's job (see
 * FormButtons.tsx), since this service has no reason to depend on
 * timesheetService.ts.
 */
export async function updateProjectGeneralInfo(
  id: string,
  project: Project
): Promise<{ project: Project; timesheetCleanup: TimesheetCleanupResult | null }> {
  const dto = await apiClient.patch<BackendProjectDto>(`/projects/${id}`, toGeneralInfoPayload(project));
  const merged = mergeBackendGeneralInfoIntoLocalProject(dto);
  writeThroughProjectsMirror([merged]);

  const timesheetCleanup = dto.timesheetCleanup ?? null;
  if (timesheetCleanup) {
    const { deletedTimesheetEntries } = timesheetCleanup;
    const message =
      deletedTimesheetEntries > 0
        ? `Project completed successfully. ${deletedTimesheetEntries} Timesheet record${deletedTimesheetEntries === 1 ? "" : "s"} ${deletedTimesheetEntries === 1 ? "was" : "were"} removed.`
        : "Project completed successfully. No Timesheet records were found for this Project.";

    try {
      notificationService.dispatchEvent({
        ruleId: "PROJECT_TIMESHEET_CLEANUP",
        version: 1,
        title: `Project Completed: ${merged.prNo}`,
        message,
        category: "Success",
        severity: "Info",
        source: "Projects",
        targetAudience: "Everyone",
        deliveryChannels: ["InApp"],
        projectId: merged.id,
        projectCode: merged.prNo,
        actionLabel: "View Project",
        actionRoute: `/projects/view/${merged.id}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to dispatch Timesheet cleanup notification:", err);
    }
  }

  return { project: merged, timesheetCleanup };
}

/** Archive — reversible. DELETE /projects/:id never removes the row server-side, only sets isDeleted/deletedAt; this also drops it from the local mirror so it disappears from the Project Repository list immediately. Every child record (Quantity/Payment Milestones/Other Project Expenses) is left completely untouched. */
export async function archiveProjectViaApi(id: string): Promise<void> {
  await apiClient.delete(`/projects/${id}`);
  saveProjects(getProjects().filter((p) => p.id !== id));
}

/**
 * Permanent Delete — irreversible, Administrator-only (enforced server-side
 * via authorize("Administrator") on DELETE /projects/:id/permanent; this
 * function does not itself check the caller's role — the UI is expected to
 * only ever surface this action to an Administrator, and the backend
 * enforces it regardless).
 *
 * `hasInvoiceHistory` must be computed by the caller (see Projects.tsx,
 * which reuses invoiceProgressService.ts's getInvoiceCount() — the same
 * definition of "has invoice history" already used everywhere else in the
 * app) and is asserted to the backend, which cannot verify it independently:
 * Invoices/InvoiceLines are still localStorage-only, no Postgres table
 * exists for them yet. A true value gets a 409 back from the backend before
 * anything is removed; a false value proceeds to a real, cascading delete of
 * the Project row and every QuantityItem/PaymentMilestone/ProjectExpense row
 * that references it.
 */
export async function permanentlyDeleteProjectViaApi(id: string, hasInvoiceHistory: boolean): Promise<void> {
  await apiClient.delete(`/projects/${id}/permanent`, { hasInvoiceHistory });
  saveProjects(getProjects().filter((p) => p.id !== id));
}

interface ImportProjectsResponse {
  items: BackendProjectDto[];
}

/**
 * Excel import's persistence layer — General Information for every parsed
 * row goes through the real backend (POST /projects/import) in one
 * request, same all-or-nothing semantics the Import UI already documents
 * ("if any row fails validation, the entire import is rejected"): either
 * every row lands in Postgres with a real id, or the whole call throws and
 * nothing is written anywhere, including the local mirror.
 *
 * `parsedProjects` are the full local Project objects parseProjectsWorkbook()
 * already built — Quantity/Payment Milestones/Expense Budget/Invoice Items
 * included, since those modules aren't backend-migrated yet. Each one is
 * passed as the explicit base to mergeBackendGeneralInfoIntoLocalProject()
 * so that data survives the round trip; only the id and General Information
 * fields are overwritten with what the backend actually stored.
 */
export async function bulkImportProjectGeneralInfo(parsedProjects: Project[]): Promise<Project[]> {
  // The Excel Import template (see projectWorkbookService.ts's
  // PROJECTS_COLUMNS) has no Work Order Number / Work Order Date / EIC Name
  // columns — those three were added to General Information after Import's
  // column schema was designed, and adding columns to Import now would be
  // redesigning it, which this change must not do. The backend requires all
  // three (same createProjectSchema the manual Add/Edit form's General tab
  // already enforces), so a row with none of them would 400 on every
  // import. These fallbacks are applied ONLY to the outgoing payload, never
  // to Import's own UI/columns/validation — the values actually stored are
  // still visible and correctable afterward via the normal Edit screen.
  const payload = {
    projects: parsedProjects.map((p) =>
      toGeneralInfoPayload({
        ...p,
        workOrderNumber: p.workOrderNumber?.trim() || p.prNo,
        workOrderDate: p.workOrderDate?.trim() || p.projectStartDate,
        eicName: p.eicName?.trim() || p.primaryProjectManager?.trim() || "Not Specified",
      })
    ),
  };
  const result = await apiClient.post<ImportProjectsResponse>("/projects/import", payload);

  const merged = result.items.map((dto, index) => mergeBackendGeneralInfoIntoLocalProject(dto, parsedProjects[index]));
  writeThroughProjectsMirror(merged);
  return merged;
}