import type { Project } from "../types/Project";
import { apiClient } from "./apiClient";
import { fetchInvoiceItemsFromApi } from "./invoiceService";
import { fetchMilestonesFromApi } from "./paymentMilestoneService";
import { fetchProjectByIdFromApi, normalizeProject } from "./projectService";
import { fetchQuantityItemsFromApi } from "./quantityService";

/**
 * Invoice Tracker (Oct 2026) — GET /invoice-tracker and GET /invoice-tracker/projects/:id/invoices. Read-only. Page
 * access is the Invoices module; View / Edit / Delete keep using the existing /invoice-lines endpoints.
 */

export type TrackerFilter = "all" | "raised" | "notRaised" | "requestPending";

export interface InvoiceStatusCounts {
  raised: number;
  partiallyPaid: number;
  paid: number;
  draft: number;
  cancelled: number;
}

export interface TrackerSummary {
  projectCount: number;
  projectsRaised: number;
  projectsNotRaised: number;
  invoiceCount: number;
  invoicesRaised: number;
  raisedAmountINR: number;
  byStatus: InvoiceStatusCounts;
  approvalPendingCount: number;
}

export interface TrackerProjectRow {
  id: string;
  prNo: string;
  client: string;
  projectTitle: string;
  projectStatus: string;
  workOrderValueINR: number;
  pendingDueINR: number;
  hasOpenInvoiceRequest: boolean;
  month: {
    state: "Raised" | "Not Raised";
    invoiceCount: number;
    raisedInvoiceCount: number;
    raisedAmountINR: number;
    draftInvoiceCount: number;
    cancelledInvoiceCount: number;
  };
}

export interface TrackerMonthPage {
  month: string;
  summary: TrackerSummary;
  items: TrackerProjectRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TimelineEvent {
  eventType: "CREATED" | "STATUS_CHANGED" | "DELETED" | "IMPORTED" | string;
  fromStatus: string | null;
  toStatus: string | null;
  actorName: string;
  actorUserId: string | null;
  source: string;
  occurredAt: string;
  lineCount: number;
}

export interface TrackerInvoiceLine {
  id: string;
  quantityItemId: string;
  activity: string;
  status: string;
  amountINR: number;
}

export interface TrackerInvoice {
  key: string;
  invoiceNo: string;
  invoiceDate: string;
  /** True when the invoice is dated in the selected month (only those are counted in that month's totals). */
  inSelectedMonth: boolean;
  amountINR: number;
  currency: string;
  originalAmount: number | null;
  status: string;
  mixedLineStatuses: boolean;
  paymentStatus: "Awaiting payment" | "Partially paid" | "Paid" | "Not applicable";
  lines: TrackerInvoiceLine[];
  recordedInPortal: { at: string; by: string };
  hasRecordedHistory: boolean;
  timeline: TimelineEvent[];
  invoiceRequest: { id: string; submittedAt: string; submittedBy: string } | null;
}

export interface TrackerChain {
  month: string;
  project: { id: string; prNo: string; client: string; projectTitle: string; projectStatus: string };
  invoices: TrackerInvoice[];
}

export interface TrackerQuery {
  month: string;
  page: number;
  pageSize: number;
  search?: string;
  projectStatus?: string;
  filter?: TrackerFilter;
}

export function trackerQueryString(q: TrackerQuery): string {
  const params = new URLSearchParams({ month: q.month, page: String(q.page), pageSize: String(q.pageSize) });
  if (q.search) params.set("search", q.search);
  if (q.projectStatus) params.set("projectStatus", q.projectStatus);
  if (q.filter && q.filter !== "all") params.set("filter", q.filter);
  return params.toString();
}

export const fetchTrackerMonth = (q: TrackerQuery) => apiClient.get<TrackerMonthPage>(`/invoice-tracker?${trackerQueryString(q)}`);

export const fetchTrackerChain = (projectId: string, month: string) =>
  apiClient.get<TrackerChain>(`/invoice-tracker/projects/${encodeURIComponent(projectId)}/invoices?month=${encodeURIComponent(month)}`);

/**
 * The full Project the existing invoice editor (RaiseInvoiceDrawer) needs: general info + quantity items + payment
 * milestones + invoice items, all straight from the API. Deliberately NOT the load*ForProject() helpers Edit Project
 * uses: those can migrate legacy browser-cached data into the database as a side effect, which must never happen
 * just because someone opened a tracker row. Any failed request fails the whole load — an invoice is never edited
 * against a partial project.
 */
export function loadProjectInvoiceContext(projectId: string): Promise<Project> {
  // One load per project at a time: a double click, or React StrictMode's double effect in development, shares the request
  // already in flight instead of starting a second full load. Nothing is cached once it settles — the next open is fresh.
  const running = inFlightLoads.get(projectId);
  if (running) return running;
  const started: Promise<Project> = loadFreshProjectInvoiceContext(projectId).finally(() => {
    if (inFlightLoads.get(projectId) === started) inFlightLoads.delete(projectId);
  });
  inFlightLoads.set(projectId, started);
  return started;
}

const inFlightLoads = new Map<string, Promise<Project>>();

async function loadFreshProjectInvoiceContext(projectId: string): Promise<Project> {
  // The four reads do not depend on one another (the invoice items are synced against the quantity items below, in memory),
  // so they run together: one round trip of latency instead of four. The project's own invoiceCurrency comes with its
  // record — no second GET /projects/:id. Any failed request still fails the whole load.
  const [fetched, quantityItems, paymentMilestones, invoiceItems] = await Promise.all([
    fetchProjectByIdFromApi(projectId, { includeResources: false }),
    fetchQuantityItemsFromApi(projectId),
    fetchMilestonesFromApi(projectId),
    fetchInvoiceItemsFromApi(projectId),
  ]);
  if (!fetched) throw new Error("Project not found.");
  // Same order as Edit Project: invoice items are synced against the freshly loaded quantity items.
  let project = normalizeProject({ ...fetched, quantityItems, paymentMilestones });
  project = normalizeProject({ ...project, invoiceItems });
  return fetched.invoiceCurrency === undefined ? project : { ...project, invoiceCurrency: fetched.invoiceCurrency };
}
