import type { Project } from "../types/Project";
import { apiClient } from "./apiClient";
import { fetchInvoiceItemsFromApi } from "./invoiceService";
import { fetchMilestonesFromApi } from "./paymentMilestoneService";
import { fetchProjectByIdFromApi, normalizeProject } from "./projectService";
import { fetchQuantityItemsFromApi } from "./quantityService";
import { batchPmoDataChanged } from "../utils/pmoDataChanged";

/**
 * Invoice Tracker — GET /invoice-tracker (a month, or "all" history), /invoice-tracker/outstanding and
 * /invoice-tracker/projects/:id/invoices. Read-only. Page access is the Invoices module; View / Edit / Delete keep
 * using the existing /invoice-lines endpoints. A month's invoices are those whose INVOICE DATE is in it (an Invoice
 * Request, which has no invoice date, is placed by its creation date). NO payment amounts exist, so Amount Paid is derived from
 * the saved status and labelled (`paidBasis`): Paid = the invoice amount, INFERRED from the status; Partially Paid and pending
 * approval amounts stay null ("Not recorded") — never a guess. Statuses are exactly the stored ones. No payment amounts exist, so collected / pending
 * approval amounts and a Partially Paid balance come back as null ("Not recorded") — never a guess.
 */

export const ALL_MONTHS = "all";

export type TrackerFilter = "all" | "raised" | "notRaised" | "requestPending";

export interface InvoiceStatusCounts {
  raised: number;
  partiallyPaid: number;
  paid: number;
  draft: number;
  cancelled: number;
}

export interface NotRecorded {
  amountINR: null;
  note: string;
}

/** Amount collected: Paid invoices at their full amount, INFERRED from the Paid status (no payments are stored). Each invoice once. */
export interface CollectedFigure {
  amountINR: number;
  basis: "inferred_from_paid_status";
  paidInvoiceCount: number;
  /** Partially Paid invoices left out — no amount is stored for them. */
  partiallyPaidExcludedCount: number;
  /** Marked Paid but contradicted by the data (zero amount, mixed lines): not inferred, flagged. */
  needsReviewCount: number;
  note: string;
}

export interface TrackerSummary {
  /** Projects with at least one record created in the period. */
  projectCount: number;
  projectsRaised: number;
  projectsAwaitingApproval: number;
  /** Invoices + invoice requests created in the period. */
  recordCount: number;
  invoiceCount: number;
  requestCount: number;
  invoicesRaised: number;
  raisedAmountINR: number;
  byStatus: InvoiceStatusCounts;
  requests: { open: number; completed: number };
  pendingApproval: { count: number } & NotRecorded;
  collected: CollectedFigure;
  /** Among invoices CREATED in the period — the all-months figure is the Outstanding view's. */
  outstanding: { scope: "selected_month"; knownAmountINR: number; invoiceCount: number; balanceNotRecordedCount: number };
}

export interface ProjectRecordState {
  recordCount: number;
  invoiceCount: number;
  /** The invoices' ACTUAL saved statuses (a legacy "Submitted" is counted as Raised) — never collapsed into one label. */
  byStatus: InvoiceStatusCounts;
  /** Raised / PartiallyPaid / Paid invoices. */
  raisedInvoiceCount: number;
  /** Of those, the ones whose recorded raise happened in the selected month (0 for "all"). */
  raisedInPeriodCount: number;
  raisedAmountINR: number;
  draftInvoiceCount: number;
  cancelledInvoiceCount: number;
  openRequestCount: number;
  completedRequestCount: number;
}

/** Older invoices (dated before the latest raised invoice) that are still Raised or Partially Paid. */
export interface OlderOutstandingSummary {
  /** Reliable: every counted invoice is dated and Raised / Partially Paid. */
  count: number;
  /** Total only when EVERY counted invoice has a reliable balance; null otherwise (never a partial or guessed total). */
  amountINR: number | null;
  /** The sum of the balances that ARE reliable (Raised invoices with a valid amount). */
  knownAmountINR: number;
  /** Counted invoices whose balance is not recorded / unreliable (Partially Paid, zero or invalid amount). */
  unknownCount: number;
  /** Raised / Partially Paid invoices with no usable invoice date: they cannot be placed before or after the latest invoice. */
  undatedCount: number;
}

/** The project's headline invoice: the latest actually raised one (Raised, Partially Paid or Paid), by invoice date. */
export interface LatestRaisedInvoice {
  invoiceNo: string;
  invoiceDate: string;
  amountINR: number;
  status: string;
  paymentStatus: string;
  /** Dated in the selected month; false = an older invoice shown for context; null = All history (no month). */
  inMonth: boolean | null;
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
  latestRaised: LatestRaisedInvoice | null;
  olderOutstanding: OlderOutstandingSummary;
  records: ProjectRecordState;
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

export type PaidBasis = "none_yet" | "inferred_from_status" | "not_recorded" | "not_applicable";

export interface InvoiceFinancials {
  amountINR: number;
  /** null = not recorded. For a Paid invoice it is the invoice amount, INFERRED from the Paid status (see `paidBasis`). */
  amountPaidINR: number | null;
  /** What Amount Paid rests on: Raised = nothing paid yet; Paid = inferred from the status; Partially Paid / unconfirmable Paid = not recorded. */
  paidBasis: PaidBasis;
  /** null = not recorded (Partially Paid) or not applicable (Draft, Cancelled). */
  outstandingINR: number | null;
  balance: "full" | "settled" | "not_recorded" | "not_applicable";
  flags: string[];
}

export interface TrackerInvoice {
  key: string;
  invoiceNo: string;
  /** Workflow creation date (instant) — never changes when the status does. */
  createdAt: string;
  /** India calendar month of `createdAt`, "YYYY-MM". */
  createdMonth: string;
  /** The invoice date (date-only); null when no line has a usable one — such an invoice is in no month's report. */
  invoiceDate: string | null;
  /** When recorded history first took it to Raised or beyond; null when none was recorded. */
  raisedAt: string | null;
  /** True when that recorded raise falls in the selected month (never true for "all"). */
  raisedInPeriod: boolean;
  amountINR: number;
  currency: string;
  originalAmount: number | null;
  status: string;
  mixedLineStatuses: boolean;
  paymentStatus: "Awaiting payment" | "Partially paid" | "Paid" | "Not applicable";
  financials: InvoiceFinancials;
  lines: TrackerInvoiceLine[];
  recordedInPortal: { at: string; by: string };
  hasRecordedHistory: boolean;
  timeline: TimelineEvent[];
  invoiceRequest: { id: string; submittedAt: string; submittedBy: string } | null;
}

export interface TrackerRequest {
  id: string;
  /** Requests have no human number: a short reference (first 8 characters of the id) for display. */
  ref: string;
  /** Open | Completed — the stored values. */
  status: string;
  /** "Invoice Requested" (Open) or "Completed". */
  label: string;
  createdAt: string;
  createdMonth: string;
  requestedBy: string;
  assignedTo: string;
  /** Free text as typed by the requester — not a number. */
  amountNote: string | null;
  notes: string | null;
  fulfilledByInvoiceNo: string | null;
}

export interface TrackerChain {
  month: string;
  project: { id: string; prNo: string; client: string; projectTitle: string; projectStatus: string };
  /** Invoices DATED in the selected month (all invoices for "all"). */
  invoices: TrackerInvoice[];
  /** This project's EARLIER-dated invoices, newest first — billing context only, never in `invoices`, never in any total. Empty for "all". */
  previousInvoices: TrackerInvoice[];
  /** Invoices of this project with no usable invoice date: in no month (so in neither list above); listed in All history. 0 for "all". */
  undatedInvoiceCount: number;
  requests: TrackerRequest[];
  /** Key (in `invoices` or `previousInvoices`) of the latest raised invoice up to the end of the month; null for All history or none. */
  latestRaisedKey: string | null;
  /** Dated in the selected month (true), an older one shown for context (false), or no month / none (null). */
  latestRaisedInMonth: boolean | null;
  /** Draft invoices dated in the selected month — never the headline invoice. */
  draftKeys: string[];
  /** The previous invoices table: every other invoice dated up to the month, newest first. */
  historyKeys: string[];
  /** Older invoices still outstanding, with the keys that trace the figure to rows in the history. */
  olderOutstanding: OlderOutstandingSummary & { keys: string[] };
  /** The server's display order across both kinds: raised in the month first, then the other records. */
  order: { kind: "invoice" | "request"; id: string }[];
}

export interface OutstandingRow {
  projectId: string;
  prNo: string;
  client: string;
  projectTitle: string;
  projectStatus: string;
  invoiceNo: string;
  createdAt: string | null;
  createdMonth: string | null;
  invoiceDate: string | null;
  status: string;
  paymentStatus: TrackerInvoice["paymentStatus"];
  amountINR: number;
  amountPaidINR: number | null;
  outstandingINR: number | null;
  balance: InvoiceFinancials["balance"];
  flags: string[];
  /** Calendar days from the invoice date to today (India); null when there is no invoice date. */
  daysOutstanding: number | null;
  lineCount: number;
  actionLine: { id: string; quantityItemId: string };
}

export interface OutstandingTotals {
  invoiceCount: number;
  knownOutstandingINR: number;
  partiallyPaidCount: number;
  partiallyPaidInvoiceAmountINR: number;
  overdue30PlusCount: number;
  oldestDays: number | null;
}

export interface OutstandingPage {
  asOf: string;
  timezone: string;
  totals: OutstandingTotals;
  items: OutstandingRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TrackerQuery {
  /** "YYYY-MM" or "all". */
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

export interface OutstandingQuery {
  page: number;
  pageSize: number;
  search?: string;
  projectStatus?: string;
}

export function outstandingQueryString(q: OutstandingQuery): string {
  const params = new URLSearchParams({ page: String(q.page), pageSize: String(q.pageSize) });
  if (q.search) params.set("search", q.search);
  if (q.projectStatus) params.set("projectStatus", q.projectStatus);
  return params.toString();
}

export const fetchTrackerMonth = (q: TrackerQuery) => apiClient.get<TrackerMonthPage>(`/invoice-tracker?${trackerQueryString(q)}`);

export const fetchOutstanding = (q: OutstandingQuery) => apiClient.get<OutstandingPage>(`/invoice-tracker/outstanding?${outstandingQueryString(q)}`);

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
  // Each read writes through to the local mirror and used to announce "data changed" on its own — four announcements, each re-running
  // the app-wide listeners. Batched: one announcement when all four are in.
  const [fetched, quantityItems, paymentMilestones, invoiceItems] = await batchPmoDataChanged(() =>
    Promise.all([
      fetchProjectByIdFromApi(projectId, { includeResources: false }),
      fetchQuantityItemsFromApi(projectId),
      fetchMilestonesFromApi(projectId),
      fetchInvoiceItemsFromApi(projectId),
    ])
  );
  if (!fetched) throw new Error("Project not found.");
  // Same order as Edit Project: invoice items are synced against the freshly loaded quantity items.
  let project = normalizeProject({ ...fetched, quantityItems, paymentMilestones });
  project = normalizeProject({ ...project, invoiceItems });
  return fetched.invoiceCurrency === undefined ? project : { ...project, invoiceCurrency: fetched.invoiceCurrency };
}
