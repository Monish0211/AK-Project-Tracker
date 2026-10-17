/**
 * Live, authoritative project financials for the Reports page (Oct 2026
 * data-consistency fix).
 *
 * Root cause this replaces: GET /projects (the list Reports loads) carries no
 * expense, quantity or invoice rows, so Reports used to read those from the
 * per-browser localStorage mirror — filled only for projects this browser
 * had opened, and never refreshed when someone else changed them. The result
 * was Reports/CSV/Excel figures that depended on browsing history and
 * disagreed with the live Project Financial Report PDF.
 *
 * This loader issues bounded, paginated, read-only requests (projects,
 * resources, expenses, quantity items, invoice lines — all in parallel) and
 * builds every project's financial collections from server rows only:
 * cached collections are REPLACED, never merged (a resource or expense
 * deleted on the server disappears here too). It deliberately never writes
 * the projects mirror, so it cannot trigger its own "pmo:data-changed"
 * refresh loop and leaves every other page's caching behaviour unchanged.
 *
 * Invoice lines need the Invoices module: a 403 there yields
 * `invoiceLines: null` ("Not available"), never zero amounts.
 */
import { isSupportedCurrency } from "../constants/currencies";
import type { Employee } from "../types/EmployeeModel";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../types/InvoiceItem";
import type { Project } from "../types/Project";
import { apiClient, ApiError } from "./apiClient";
import { getEmployees } from "./employeeService";
import { fetchAllInvoiceLinesForCaller, type ReportInvoiceLine } from "./invoiceService";
import { toExpenseItem, type BackendExpenseDto } from "./otherProjectExpenseService";
import { mapBackendResourceDto, normalizeProject, queryProjectsFromApi, type BackendResourceDto } from "./projectService";
import { toQuantityItem, type BackendQuantityDto } from "./quantityService";

export interface LiveReportData {
  projects: Project[];
  /** Every invoice line across the caller's projects; null = no Invoices module access. */
  invoiceLines: ReportInvoiceLine[] | null;
  /** HTTP requests this load issued (for diagnostics/QA). */
  requestCount: number;
}

interface PagedList<T> {
  items: T[];
  total?: number;
}

type BulkExpenseDto = BackendExpenseDto & { projectId: string };

/** Injectable for tests; production uses the real API client and caches. */
export interface LiveReportDeps {
  get: <T>(path: string) => Promise<T>;
  queryProjects: (page: number, pageSize: number) => Promise<{ items: Project[]; total: number }>;
  fetchInvoiceLines: () => Promise<ReportInvoiceLine[]>;
  getEmployees: () => Employee[];
}

const defaultDeps: LiveReportDeps = {
  get: (path) => apiClient.get(path),
  queryProjects: (page, pageSize) => queryProjectsFromApi({ page, pageSize }),
  fetchInvoiceLines: fetchAllInvoiceLinesForCaller,
  getEmployees,
};

const PROJECT_PAGE_SIZE = 200;
const CHILD_PAGE_SIZE = 500;
/** Runaway-loop bound, not an intended ceiling — an incomplete result throws instead of silently under-counting. */
const MAX_PAGES = 200;

/**
 * Pages fetched at once after page 1 (performance audit, Oct 2026). Page 1
 * reveals the total and page size; the rest were previously fetched strictly
 * one after another, so Reports waited for the SUM of every page's latency on
 * its slowest collection. Read-only GETs, bounded so the browser's
 * per-host connection limit is not flooded.
 */
const PAGE_CONCURRENCY = 3;

/** Walks every page of a paginated bulk endpoint; throws rather than ever returning a truncated list. */
export async function fetchAllPages<T>(
  load: (page: number) => Promise<PagedList<T>>,
  label: string
): Promise<{ items: T[]; requests: number }> {
  const items: T[] = [];
  const first = await load(1);
  items.push(...(first.items ?? []));
  let total = first.total ?? items.length;
  let page = 2;
  const pageSize = (first.items ?? []).length;

  if (pageSize > 0 && items.length < total) {
    // Known remaining pages: fetched in small parallel batches, appended in page order.
    const lastPage = Math.min(MAX_PAGES, Math.ceil(total / pageSize));
    let exhausted = false;
    while (page <= lastPage && !exhausted) {
      const batch = Array.from({ length: Math.min(PAGE_CONCURRENCY, lastPage - page + 1) }, (_, i) => page + i);
      const results = await Promise.all(batch.map((p) => load(p)));
      page += batch.length;
      for (const res of results) {
        const rows = res.items ?? [];
        items.push(...rows);
        total = res.total ?? total;
        if (rows.length === 0) exhausted = true;
      }
    }
    // Rows added on the server while loading (total grew): finish sequentially, exactly as before.
    while (!exhausted && items.length < total && page <= MAX_PAGES) {
      const res = await load(page);
      const rows = res.items ?? [];
      items.push(...rows);
      total = res.total ?? items.length;
      page += 1;
      if (rows.length === 0) break;
    }
  }
  if (items.length < total) {
    throw new Error(`Live ${label} data was incomplete: received ${items.length} of ${total} rows.`);
  }
  return { items, requests: page - 1 };
}

function groupByProject<T extends { projectId: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = map.get(row.projectId);
    if (bucket) bucket.push(row);
    else map.set(row.projectId, [row]);
  }
  return map;
}

function toLiveInvoiceLine(line: ReportInvoiceLine): InvoiceLine {
  return {
    id: line.id,
    invoiceNo: line.invoiceNo,
    invoiceDate: typeof line.invoiceDate === "string" ? line.invoiceDate.slice(0, 10) : "",
    quantityBilled: line.quantityBilled,
    invoiceAmountINR: line.invoiceAmountINR,
    currency: isSupportedCurrency(line.currency) ? line.currency : "INR",
    exchangeRateToINR: typeof line.exchangeRateToINR === "number" ? line.exchangeRateToINR : 1,
    invoiceAmountOriginal: typeof line.invoiceAmountOriginal === "number" ? line.invoiceAmountOriginal : line.invoiceAmountINR,
    status: line.status as InvoiceLineStatus,
    createdBy: "",
  };
}

/**
 * Same shape GET /projects/:id/invoice-items returns — one InvoiceItem per
 * live quantity item, each holding its live invoice lines. A line whose
 * quantity item is not in the list (e.g. created between two page requests)
 * still gets its own item, so no invoiced amount can ever drop out of a total.
 */
export function buildInvoiceItems(quantityRows: BackendQuantityDto[], lines: ReportInvoiceLine[]): InvoiceItem[] {
  const byQuantityId = new Map<string, InvoiceLine[]>();
  for (const line of lines) {
    const bucket = byQuantityId.get(line.quantityItemId);
    if (bucket) bucket.push(toLiveInvoiceLine(line));
    else byQuantityId.set(line.quantityItemId, [toLiveInvoiceLine(line)]);
  }
  const items: InvoiceItem[] = quantityRows.map((q) => ({
    id: q.id,
    description: q.description,
    qty: q.woQty,
    uom: q.uom || "DAY",
    unitPrice: q.unitRateINR,
    totalPrice: q.woValue,
    invoices: byQuantityId.get(q.id) ?? [],
  }));
  const known = new Set(quantityRows.map((q) => q.id));
  for (const [quantityItemId, orphanLines] of byQuantityId) {
    if (!known.has(quantityItemId)) {
      items.push({ id: quantityItemId, description: "", qty: 0, uom: "DAY", unitPrice: 0, totalPrice: 0, invoices: orphanLines });
    }
  }
  return items;
}

/** One project rebuilt from live rows only; the server's work order value and pending due always win. */
export function hydrateProject(
  project: Project,
  live: { resources: BackendResourceDto[]; expenses: BulkExpenseDto[]; quantity: BackendQuantityDto[]; invoiceLines: ReportInvoiceLine[] | null },
  employees: Employee[]
): Project {
  const normalized = normalizeProject({
    ...project,
    resources: live.resources.map((r) => mapBackendResourceDto(r, employees)),
    nonManhourExpenses: live.expenses.map((e) => toExpenseItem(e)),
    quantityItems: live.quantity.map((q) => toQuantityItem(q)),
  });
  return {
    ...normalized,
    // Set after normalizeProject(), whose quantity sync would drop orphan lines.
    invoiceItems: live.invoiceLines === null ? [] : buildInvoiceItems(live.quantity, live.invoiceLines),
    workOrderValueINR: typeof project.backendWorkOrderValueINR === "number" ? project.backendWorkOrderValueINR : normalized.workOrderValueINR,
    pendingAmount: typeof project.backendPendingDueINR === "number" ? project.backendPendingDueINR : normalized.pendingAmount,
  };
}

/** Every project the caller may read, with live financial collections. Throws on any incomplete or failed core load. */
export async function fetchLiveReportData(deps: LiveReportDeps = defaultDeps): Promise<LiveReportData> {
  const child = <T>(path: string, label: string) =>
    fetchAllPages<T>((page) => deps.get<PagedList<T>>(`${path}?page=${page}&pageSize=${CHILD_PAGE_SIZE}`), label);

  const invoiceLoad = deps.fetchInvoiceLines().then(
    (lines) => lines,
    (err: unknown) => {
      // No Invoices module → invoice figures are "Not available", not ₹0. Anything else is a real failure.
      if (err instanceof ApiError && err.status === 403) return null;
      throw err;
    }
  );

  const [projects, resources, expenses, quantity, invoiceLines] = await Promise.all([
    fetchAllPages<Project>((page) => deps.queryProjects(page, PROJECT_PAGE_SIZE), "project"),
    child<BackendResourceDto>("/projects/resources", "resource"),
    child<BulkExpenseDto>("/projects/expenses", "expense"),
    child<BackendQuantityDto>("/projects/quantity", "quantity"),
    invoiceLoad,
  ]);

  const resourcesByProject = groupByProject(resources.items);
  const expensesByProject = groupByProject(expenses.items);
  const quantityByProject = groupByProject(quantity.items);
  const linesByProject = invoiceLines === null ? null : groupByProject(invoiceLines);
  const employees = deps.getEmployees();

  return {
    projects: projects.items.map((p) =>
      hydrateProject(
        p,
        {
          resources: resourcesByProject.get(p.id) ?? [],
          expenses: expensesByProject.get(p.id) ?? [],
          quantity: quantityByProject.get(p.id) ?? [],
          invoiceLines: linesByProject === null ? null : linesByProject.get(p.id) ?? [],
        },
        employees
      )
    ),
    invoiceLines,
    requestCount: projects.requests + resources.requests + expenses.requests + quantity.requests + 1,
  };
}
