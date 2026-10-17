/**
 * Live, read-only data for the Project Financial Report PDF (Oct 2026).
 *
 * Deliberately NOT built on projectService/invoiceService/
 * otherProjectExpenseService's fetch helpers: those write through to the
 * browser's local mirrors (and some swallow errors or run legacy
 * migrations). This module only issues four GETs and maps the responses
 * itself — exporting a PDF must never change any cached state.
 *
 * Access is enforced by the backend exactly as for every other screen:
 *  - GET /projects/:id, /expenses, /resources — Projects module + project
 *    read access. A 403/404 on any of them aborts the export.
 *  - GET /projects/:id/invoice-items — Invoices module. A 403 here alone
 *    produces a report without invoice figures (invoiceLines = null), never
 *    ₹0 amounts.
 *  - Any network/timeout/server error aborts — never a partial report.
 *
 * Employee names/designations come from the cached Employee Master list
 * (getEmployees(), read-only); a resource whose employee is not cached
 * falls back to its employee number.
 */
import { apiClient, ApiError } from "./apiClient";
import { getEmployees } from "./employeeService";
import type { Employee } from "../types/EmployeeModel";

export interface ReportProjectDetails {
  id: string;
  prNo: string;
  rfqNo: string | null;
  projectTitle: string;
  client: string;
  department: string;
  domesticForeign: string;
  contractType: string;
  projectStatus: string;
  workOrderStatus: string;
  workOrderNumber: string | null;
  workOrderDate: string | null;
  projectStartDate: string | null;
  projectEndDate: string | null;
  actualCompletionDate: string | null;
  primaryProjectManager: string | null;
  secondaryProjectManager: string | null;
  pmoCoordinator: string | null;
  workOrderValueINR: number;
}

export interface ReportManhourRow {
  employeeNo: string;
  employeeName: string;
  /** false when the employee is not in the cached Employee Master list. */
  nameFromDirectory: boolean;
  designation: string | null;
  assignmentStatus: string;
  totalHours: number;
  hourlyRate: number;
  manhourCost: number;
}

export interface ReportNonManhourRow {
  category: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  remarks: string | null;
}

export interface ReportInvoiceRow {
  invoiceNo: string;
  invoiceDate: string | null;
  status: string;
  milestoneName: string | null;
  itemDescription: string;
  invoiceAmountINR: number;
  currency: string;
  invoiceAmountOriginal: number | null;
}

export interface ProjectReportData {
  project: ReportProjectDetails;
  manhourRows: ReportManhourRow[];
  nonManhourRows: ReportNonManhourRow[];
  /** null = no invoice access for this user. */
  invoiceRows: ReportInvoiceRow[] | null;
  fetchedAt: Date;
}

export type ProjectReportErrorKind = "access" | "retry";

export const PROJECT_REPORT_ACCESS_MESSAGE = "You don't have access to this project's financial data.";
export const PROJECT_REPORT_RETRY_MESSAGE = "Couldn't load project data — please try again.";

export class ProjectReportDataError extends Error {
  kind: ProjectReportErrorKind;

  constructor(kind: ProjectReportErrorKind) {
    super(kind === "access" ? PROJECT_REPORT_ACCESS_MESSAGE : PROJECT_REPORT_RETRY_MESSAGE);
    this.name = "ProjectReportDataError";
    this.kind = kind;
  }
}

/** Injectable for tests; production uses apiClient.get + the cached employee list. */
export interface ProjectReportDataDeps {
  get: <T>(path: string) => Promise<T>;
  getEmployees: () => Employee[];
  now: () => Date;
}

const defaultDeps: ProjectReportDataDeps = {
  get: (path) => apiClient.get(path),
  getEmployees,
  now: () => new Date(),
};

// ── Raw response shapes (only the fields this report reads) ──────────────

interface RawProject {
  id: string;
  prNo?: string | null;
  rfqNo?: string | null;
  projectTitle?: string | null;
  client?: string | null;
  department?: string | null;
  domesticForeign?: string | null;
  contractType?: string | null;
  projectStatus?: string | null;
  workOrderStatus?: string | null;
  workOrderNumber?: string | null;
  workOrderDate?: string | null;
  projectStartDate?: string | null;
  projectEndDate?: string | null;
  actualCompletionDate?: string | null;
  primaryProjectManager?: string | null;
  secondaryProjectManager?: string | null;
  pmoCoordinator?: string | null;
  workOrderValueINR?: number | null;
}

interface RawExpense {
  category?: string | null;
  description?: string | null;
  quantity?: number | null;
  unitCost?: number | null;
  totalCost?: number | null;
  remarks?: string | null;
}

interface RawResource {
  employeeNo?: string | null;
  assignmentStatus?: string | null;
  totalHours?: number | null;
  hourlyRateSnapshot?: number | null;
  manhourCost?: number | null;
}

interface RawInvoiceLine {
  invoiceNo?: string | null;
  invoiceDate?: string | null;
  status?: string | null;
  milestoneName?: string | null;
  invoiceAmountINR?: number | null;
  currency?: string | null;
  invoiceAmountOriginal?: number | null;
}

interface RawInvoiceItem {
  description?: string | null;
  invoices?: RawInvoiceLine[] | null;
}

// ── Mapping helpers ──────────────────────────────────────────────────────

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | null {
  const t = text(value);
  return t === "" ? null : t;
}

/** "YYYY-MM-DD" from an ISO timestamp/date string; null for empty or unreadable values. */
export function toReportDate(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(match[3])) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function mapProject(raw: RawProject): ReportProjectDetails {
  return {
    id: raw.id,
    prNo: text(raw.prNo),
    rfqNo: optionalText(raw.rfqNo),
    projectTitle: text(raw.projectTitle),
    client: text(raw.client),
    department: text(raw.department),
    domesticForeign: text(raw.domesticForeign),
    contractType: text(raw.contractType),
    projectStatus: text(raw.projectStatus),
    workOrderStatus: text(raw.workOrderStatus),
    workOrderNumber: optionalText(raw.workOrderNumber),
    workOrderDate: toReportDate(raw.workOrderDate),
    projectStartDate: toReportDate(raw.projectStartDate),
    projectEndDate: toReportDate(raw.projectEndDate),
    actualCompletionDate: toReportDate(raw.actualCompletionDate),
    primaryProjectManager: optionalText(raw.primaryProjectManager),
    secondaryProjectManager: optionalText(raw.secondaryProjectManager),
    pmoCoordinator: optionalText(raw.pmoCoordinator),
    workOrderValueINR: num(raw.workOrderValueINR),
  };
}

function mapResources(raw: RawResource[], employees: Employee[]): ReportManhourRow[] {
  const byNo = new Map<string, Employee>();
  for (const e of employees) {
    const key = text(e.employeeNo).toLowerCase();
    if (key) byNo.set(key, e);
  }
  return raw.map((r) => {
    const employeeNo = text(r.employeeNo);
    const emp = byNo.get(employeeNo.toLowerCase());
    const name = text(emp?.employeeName);
    return {
      employeeNo,
      employeeName: name || employeeNo,
      nameFromDirectory: name !== "",
      designation: optionalText(emp?.designation),
      assignmentStatus: text(r.assignmentStatus),
      totalHours: num(r.totalHours),
      hourlyRate: num(r.hourlyRateSnapshot),
      manhourCost: num(r.manhourCost),
    };
  });
}

function mapExpenses(raw: RawExpense[]): ReportNonManhourRow[] {
  return raw.map((e) => ({
    category: text(e.category),
    description: text(e.description),
    quantity: num(e.quantity),
    unitCost: num(e.unitCost),
    totalCost: num(e.totalCost),
    remarks: optionalText(e.remarks),
  }));
}

function mapInvoices(items: RawInvoiceItem[]): ReportInvoiceRow[] {
  const rows: ReportInvoiceRow[] = [];
  for (const item of items) {
    for (const line of item.invoices ?? []) {
      rows.push({
        invoiceNo: text(line.invoiceNo),
        invoiceDate: toReportDate(line.invoiceDate),
        status: text(line.status),
        milestoneName: optionalText(line.milestoneName),
        itemDescription: text(item.description),
        invoiceAmountINR: num(line.invoiceAmountINR),
        currency: text(line.currency) || "INR",
        invoiceAmountOriginal: typeof line.invoiceAmountOriginal === "number" ? line.invoiceAmountOriginal : null,
      });
    }
  }
  // Chronological; undated lines last; invoice number breaks ties.
  return rows.sort((a, b) => {
    if (a.invoiceDate !== b.invoiceDate) {
      if (a.invoiceDate === null) return 1;
      if (b.invoiceDate === null) return -1;
      return a.invoiceDate < b.invoiceDate ? -1 : 1;
    }
    return a.invoiceNo.localeCompare(b.invoiceNo, undefined, { numeric: true });
  });
}

function isAccessDenied(reason: unknown): boolean {
  return reason instanceof ApiError && (reason.status === 403 || reason.status === 404);
}

/** One live snapshot per call. Throws ProjectReportDataError (kind "access" or "retry"). */
export async function fetchProjectReportData(
  projectId: string,
  deps: ProjectReportDataDeps = defaultDeps
): Promise<ProjectReportData> {
  const id = encodeURIComponent(projectId);
  const [project, expenses, resources, invoices] = await Promise.allSettled([
    deps.get<RawProject>(`/projects/${id}`),
    deps.get<{ items?: RawExpense[] }>(`/projects/${id}/expenses`),
    deps.get<{ items?: RawResource[] }>(`/projects/${id}/resources`),
    deps.get<{ items?: RawInvoiceItem[] }>(`/projects/${id}/invoice-items`),
  ]);

  const core = [project, expenses, resources];
  if (core.some((r) => r.status === "rejected" && isAccessDenied(r.reason))) {
    throw new ProjectReportDataError("access");
  }
  if (project.status === "rejected" || expenses.status === "rejected" || resources.status === "rejected") {
    throw new ProjectReportDataError("retry");
  }

  let invoiceRows: ReportInvoiceRow[] | null;
  if (invoices.status === "fulfilled") {
    invoiceRows = mapInvoices(invoices.value?.items ?? []);
  } else if (invoices.reason instanceof ApiError && invoices.reason.status === 403) {
    invoiceRows = null;
  } else {
    throw new ProjectReportDataError("retry");
  }

  if (!project.value || typeof project.value.id !== "string") {
    throw new ProjectReportDataError("retry");
  }

  return {
    project: mapProject(project.value),
    manhourRows: mapResources(resources.value?.items ?? [], deps.getEmployees()),
    nonManhourRows: mapExpenses(expenses.value?.items ?? []),
    invoiceRows,
    fetchedAt: deps.now(),
  };
}
