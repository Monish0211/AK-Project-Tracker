/**
 * Invoice Tracker (Oct 2026) — pure rules, no I/O. Approved business decisions:
 *
 * - The month an invoice belongs to is its INVOICE DATE (InvoiceLine.invoiceDate, a date-only value stored at UTC
 *   midnight — so the month is simply its calendar month, no time-zone conversion). Never createdAt: older rows
 *   were entered months after their invoice date. An invoice entered late or backdated therefore appears under its
 *   invoice date's month; its history shows when it was really recorded.
 * - "Raised in the month" = Raised, PartiallyPaid or Paid. Draft and Cancelled invoices appear only inside the
 *   expanded chain and never make a project "Raised".
 * - An invoice is the lines of one project sharing an invoice number (compared trimmed, case-insensitive). A
 *   project with five invoices contributes five invoices to the counts and appears once in the project table.
 * - Payment status is only what the stored status says (Raised = awaiting payment, PartiallyPaid, Paid). No paid
 *   amount or payment date exists, and none is invented.
 */

export const RAISED_STATUSES = ["Raised", "PartiallyPaid", "Paid"] as const;
export type RaisedStatus = (typeof RAISED_STATUSES)[number];

export function isRaisedStatus(status: string): boolean {
  return (RAISED_STATUSES as readonly string[]).includes(status);
}

export interface MonthWindow {
  /** "2026-10" */
  month: string;
  /** Inclusive start (UTC midnight, 1st). */
  start: Date;
  /** Exclusive end (UTC midnight, 1st of the next month). */
  end: Date;
}

/** "YYYY-MM" → its [start, end) UTC window; null when the text is not a real month in 2000–2100. */
export function parseMonth(month: string): MonthWindow | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const monthNumber = Number(m[2]);
  if (year < 2000 || year > 2100 || monthNumber < 1 || monthNumber > 12) return null;
  return { month, start: new Date(Date.UTC(year, monthNumber - 1, 1)), end: new Date(Date.UTC(year, monthNumber, 1)) };
}

export const normalizeInvoiceNo = (invoiceNo: string): string => invoiceNo.trim().toUpperCase();

/**
 * One invoice's status from its lines' statuses — the same cascade as the frontend's getInvoiceCycleStatus():
 * all Cancelled → Cancelled; all non-cancelled Paid → Paid; any Paid/PartiallyPaid → PartiallyPaid; any Raised →
 * Raised; otherwise Draft. A mixed invoice therefore resolves to one deterministic answer.
 */
export function cycleStatus(statuses: string[]): string {
  if (statuses.length === 0) return "Draft";
  const live = statuses.filter((s) => s !== "Cancelled");
  if (live.length === 0) return "Cancelled";
  if (live.every((s) => s === "Paid")) return "Paid";
  if (live.some((s) => s === "Paid" || s === "PartiallyPaid")) return "PartiallyPaid";
  if (live.some((s) => s === "Raised")) return "Raised";
  return "Draft";
}

/** Payment wording derived straight from the stored status — never inferred from anything else. */
export function paymentLabel(status: string): "Awaiting payment" | "Partially paid" | "Paid" | "Not applicable" {
  if (status === "Raised") return "Awaiting payment";
  if (status === "PartiallyPaid") return "Partially paid";
  if (status === "Paid") return "Paid";
  return "Not applicable"; // Draft (not raised yet) and Cancelled
}

export interface TrackerLine {
  id: string;
  projectId: string;
  invoiceNo: string;
  status: string;
  invoiceAmountINR: number;
}

export interface InvoiceGroup<L extends TrackerLine = TrackerLine> {
  projectId: string;
  /** normalized number — the grouping key */
  key: string;
  /** the number as first stored (display) */
  invoiceNo: string;
  status: string;
  /** Sum of the invoice's non-cancelled lines. */
  amountINR: number;
  lines: L[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** One group per (project, normalized invoice number). Order: first appearance. */
export function groupInvoices<L extends TrackerLine>(lines: L[]): InvoiceGroup<L>[] {
  const groups = new Map<string, InvoiceGroup<L>>();
  for (const line of lines) {
    const key = normalizeInvoiceNo(line.invoiceNo);
    const mapKey = `${line.projectId}\u0000${key}`;
    let g = groups.get(mapKey);
    if (!g) {
      g = { projectId: line.projectId, key, invoiceNo: line.invoiceNo, status: "Draft", amountINR: 0, lines: [] };
      groups.set(mapKey, g);
    }
    g.lines.push(line);
  }
  for (const g of groups.values()) {
    g.status = cycleStatus(g.lines.map((l) => l.status));
    g.amountINR = round2(g.lines.filter((l) => l.status !== "Cancelled").reduce((s, l) => s + l.invoiceAmountINR, 0));
  }
  return [...groups.values()];
}

export interface InvoiceStatusCounts {
  raised: number;
  partiallyPaid: number;
  paid: number;
  draft: number;
  cancelled: number;
}

export interface ProjectMonthState {
  /** "Raised" when at least one qualifying invoice exists in the month, else "Not Raised". */
  state: "Raised" | "Not Raised";
  /** All invoices of the month, any status. */
  invoiceCount: number;
  /** Qualifying (Raised / PartiallyPaid / Paid) invoices. */
  raisedInvoiceCount: number;
  raisedAmountINR: number;
  draftInvoiceCount: number;
  cancelledInvoiceCount: number;
}

export function emptyCounts(): InvoiceStatusCounts {
  return { raised: 0, partiallyPaid: 0, paid: 0, draft: 0, cancelled: 0 };
}

export function addToCounts(counts: InvoiceStatusCounts, status: string): void {
  if (status === "Raised") counts.raised++;
  else if (status === "PartiallyPaid") counts.partiallyPaid++;
  else if (status === "Paid") counts.paid++;
  else if (status === "Cancelled") counts.cancelled++;
  else counts.draft++;
}

export interface MonthSummary {
  /** Projects matching the search / project-status filters (any month state). */
  projectCount: number;
  projectsRaised: number;
  projectsNotRaised: number;
  /** Distinct invoices of the month by their roll-up status. */
  invoiceCount: number;
  invoicesRaised: number;
  raisedAmountINR: number;
  byStatus: InvoiceStatusCounts;
  /** Projects (matching the filters) that currently have an Open invoice request — a current state, not month-specific. */
  approvalPendingCount: number;
}

/**
 * Per-project month state and month-wide totals from the month's lines of ALL matching projects (so totals are
 * never limited to the current page).
 */
export function summarizeMonth(lines: TrackerLine[], projectCount: number, approvalPendingCount: number): { summary: MonthSummary; byProject: Map<string, ProjectMonthState> } {
  const byProject = new Map<string, ProjectMonthState>();
  const byStatus = emptyCounts();
  let invoicesRaised = 0;
  let raisedAmountINR = 0;
  const invoices = groupInvoices(lines);
  for (const g of invoices) {
    let st = byProject.get(g.projectId);
    if (!st) {
      st = { state: "Not Raised", invoiceCount: 0, raisedInvoiceCount: 0, raisedAmountINR: 0, draftInvoiceCount: 0, cancelledInvoiceCount: 0 };
      byProject.set(g.projectId, st);
    }
    st.invoiceCount++;
    addToCounts(byStatus, g.status);
    if (isRaisedStatus(g.status)) {
      st.state = "Raised";
      st.raisedInvoiceCount++;
      st.raisedAmountINR = round2(st.raisedAmountINR + g.amountINR);
      invoicesRaised++;
      raisedAmountINR = round2(raisedAmountINR + g.amountINR);
    } else if (g.status === "Cancelled") st.cancelledInvoiceCount++;
    else st.draftInvoiceCount++;
  }
  const projectsRaised = [...byProject.values()].filter((s) => s.state === "Raised").length;
  return {
    summary: {
      projectCount,
      projectsRaised,
      projectsNotRaised: Math.max(0, projectCount - projectsRaised),
      invoiceCount: invoices.length,
      invoicesRaised,
      raisedAmountINR,
      byStatus,
      approvalPendingCount,
    },
    byProject,
  };
}

export const NOT_RAISED: ProjectMonthState = { state: "Not Raised", invoiceCount: 0, raisedInvoiceCount: 0, raisedAmountINR: 0, draftInvoiceCount: 0, cancelledInvoiceCount: 0 };

// ── History presentation ────────────────────────────────────────────────────

export interface StoredEvent {
  id: string;
  seq: bigint;
  invoiceLineId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorUserId: string | null;
  actorName: string;
  source: string;
  occurredAt: Date;
}

export interface TimelineEvent {
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorName: string;
  actorUserId: string | null;
  source: string;
  occurredAt: string;
  /** How many of the invoice's lines this one action touched. */
  lineCount: number;
}

/** One status change on an N-line invoice is N stored events (the UI saves line by line); show them as one. */
export const MERGE_WINDOW_MS = 60_000;

export function mergeInvoiceEvents(events: StoredEvent[]): TimelineEvent[] {
  const sorted = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime() || Number(a.seq - b.seq));
  const out: TimelineEvent[] = [];
  for (const e of sorted) {
    const last = out.at(-1);
    if (
      last &&
      last.eventType === e.eventType &&
      last.fromStatus === e.fromStatus &&
      last.toStatus === e.toStatus &&
      last.actorUserId === e.actorUserId &&
      last.actorName === e.actorName &&
      last.source === e.source &&
      e.occurredAt.getTime() - new Date(last.occurredAt).getTime() <= MERGE_WINDOW_MS
    ) {
      last.lineCount++;
      continue;
    }
    out.push({
      eventType: e.eventType,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actorName: e.actorName,
      actorUserId: e.actorUserId,
      source: e.source,
      occurredAt: e.occurredAt.toISOString(),
      lineCount: 1,
    });
  }
  return out;
}
