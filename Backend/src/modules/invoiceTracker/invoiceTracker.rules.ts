/**
 * Invoice Tracker — pure rules, no I/O.
 *
 * Redesign (Oct 2026), approved decisions:
 *
 * - MONTHLY MEMBERSHIP IS BY INVOICE DATE (InvoiceLine.invoiceDate — a required, date-only value stored at UTC midnight, so its
 *   calendar month needs no time-zone conversion). An invoice belongs to month M when its invoice date is on or after 00:00 on the
 *   1st of M and before 00:00 on the 1st of the next month. NEVER the creation date, the raised date, the payment date or the
 *   updated date: an invoice dated 15 Jan is not an October record even if it was created or raised in October, and one dated
 *   5 Nov is not either. An invoice is the lines of one project sharing an invoice number; its date is its earliest USABLE line
 *   date. An invoice with no usable invoice date (missing, unparsable or outside 1900-2200 — the portal's own validation does not
 *   let one be saved, so this is defensive) belongs to NO month: it is never given its creation date instead. It still appears in
 *   "All history" and in Outstanding (when owed), flagged for review.
 * - Invoice Requests have no invoice date at all, so they keep their only date: a request belongs to the month it was created
 *   (India calendar month). They are not invoices and never count as raised.
 * - The raise time is a different thing again: the RECORDED raise (InvoiceStatusEvent — the first move into Raised / Partially
 *   Paid / Paid from a state that was not raised), in India time. The workflow-created, invoice and raised dates are kept apart.
 * - Statuses are exactly the stored ones — invoices: Draft, Raised, PartiallyPaid, Paid, Cancelled (a legacy stored
 *   "Submitted" is Raised, as the portal and the weekly reminder already treat it); requests: Open ("Invoice
 *   Requested", waiting for Accounts to raise it) and Completed (fulfilled by a raised invoice). "Sent for Approval"
 *   and "Rejected" do not exist for invoices, so none is invented.
 * - An invoice is the lines of one project sharing an invoice number (trimmed, case-insensitive).
 * - NO payment amounts or payment transactions are stored anywhere (InvoiceLine has only a status; there is no paid / received /
 *   balance column and no payment table). So the settlement figures are derived from the saved status, and labelled as such:
 *   Raised → nothing paid yet (paid 0, outstanding = invoice amount); Paid → fully settled, so Amount Paid = the invoice amount,
 *   INFERRED FROM THE PAID STATUS (basis "inferred_from_status", never a recorded payment) and outstanding 0 — but only when
 *   the data does not contradict it (a valid, non-negative amount and all live lines Paid); otherwise the amount is NOT recorded
 *   and the invoice is flagged for review. A ZERO-amount Paid invoice is settled at 0 (0 paid, 0 outstanding) and flagged only
 *   because a zero invoice is unusual — nothing about it contradicts "Paid". PartiallyPaid → paid / outstanding NOT recorded (null, never a guess). Draft and Cancelled → not
 *   applicable. Paid + outstanding always equals the invoice amount when both are known. The weekly unpaid-invoice email uses
 *   the same Raised / Partially Paid definitions.
 * - ORDER (month view), two groups: GROUP 1 = invoices dated in the month whose RECORDED raise is also in the month (a Draft, a
 *   pending request or a Cancelled invoice is never "raised"; nothing is inferred for invoices with no recorded raise).
 *   GROUP 2 = every other qualifying record. Inside a group: newest relevant date first — the recorded raise time in group 1,
 *   the invoice date in group 2 (a request's creation date) — then a stable tie-break on id, so rows never move between pages.
 *   Projects are ranked the same way by their best record (group, then that record's date, then PR number, then id).
 * - THE LATEST RAISED INVOICE of a project (its headline): the invoice with the newest invoice date among those actually raised
 *   (Raised, Partially Paid, Paid — never Draft or Cancelled), looking at invoices dated up to the end of the selected month. It
 *   stays the latest whatever its payment status; a newer Draft never replaces it. Exact date ties: later creation time, then key.
 *   When it is not dated in the selected month the report says "No invoice raised this month" and shows it only as the latest
 *   AVAILABLE one, with its real date. OLDER OUTSTANDING = the invoices that sort after it which are still Raised or Partially
 *   Paid (each once, the latest never); the total is given only when every one of them has a reliable balance.
 * - An Invoice Request has no numeric amount (only a free-text note), so a "pending approval amount" is not recorded
 *   either; the pending figure is a COUNT of Open requests.
 */

export const RAISED_STATUSES = ["Raised", "PartiallyPaid", "Paid"] as const;
export type RaisedStatus = (typeof RAISED_STATUSES)[number];

/** A legacy stored "Submitted" is the same thing as Raised everywhere else in the portal. */
export function normalizeStatus(status: string): string {
  return status === "Submitted" ? "Raised" : status;
}

export function isRaisedStatus(status: string): boolean {
  return (RAISED_STATUSES as readonly string[]).includes(normalizeStatus(status));
}

/** Statuses (as stored) whose invoices can still be owed: Raised (incl. legacy Submitted) and PartiallyPaid. */
export const OUTSTANDING_STORED_STATUSES = ["Raised", "Submitted", "PartiallyPaid"] as const;

// ── Months ─────────────────────────────────────────────────────────────────

/** India Standard Time, a fixed +05:30 offset (no daylight saving). */
export const IST_OFFSET_MS = 330 * 60_000;
export const ALL_MONTHS = "all";

export interface MonthWindow {
  /** "2026-10" */
  month: string;
  /** INVOICE-DATE window, inclusive start: 00:00 UTC on the 1st — invoice dates are date-only values stored at UTC midnight. */
  dateStart: Date;
  /** INVOICE-DATE window, exclusive end: 00:00 UTC on the 1st of the next month. */
  dateEnd: Date;
  /** INSTANT window for timestamps (recorded raise, request creation), inclusive start: 00:00 IST on the 1st. */
  start: Date;
  /** INSTANT window, exclusive end: 00:00 IST on the 1st of the next month. */
  end: Date;
}

/** "YYYY-MM" → its invoice-date window ([UTC 1st, next UTC 1st)) and its India instant window; null when the text is not a real month in 2000–2100. */
export function parseMonth(month: string): MonthWindow | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const year = Number(m[1]);
  const monthNumber = Number(m[2]);
  if (year < 2000 || year > 2100 || monthNumber < 1 || monthNumber > 12) return null;
  return {
    month,
    dateStart: new Date(Date.UTC(year, monthNumber - 1, 1)),
    dateEnd: new Date(Date.UTC(year, monthNumber, 1)),
    start: new Date(Date.UTC(year, monthNumber - 1, 1) - IST_OFFSET_MS),
    end: new Date(Date.UTC(year, monthNumber, 1) - IST_OFFSET_MS),
  };
}

/** The India calendar month ("YYYY-MM") an instant falls in. */
export function istMonthOf(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 7);
}

/** Is this INSTANT (a recorded raise, a request's creation) inside the India month? null = every month. */
export function inWindow(instant: Date, window: MonthWindow | null): boolean {
  return window === null || (instant >= window.start && instant < window.end);
}

/** A usable invoice date: a real Date whose year is 1900-2200 (the portal's own validation never saves anything else). */
export function isValidInvoiceDate(date: Date | null | undefined): date is Date {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  const year = date.getUTCFullYear();
  return year >= 1900 && year <= 2200;
}

/** Is this invoice DATE inside the month (inclusive start, exclusive next-month start)? An unusable date is in no month; null window = any usable date. */
export function inInvoiceMonth(date: Date | null | undefined, window: MonthWindow | null): boolean {
  if (!isValidInvoiceDate(date)) return false;
  return window === null || (date >= window.dateStart && date < window.dateEnd);
}

export const normalizeInvoiceNo = (invoiceNo: string): string => invoiceNo.trim().toUpperCase();

// ── Invoices ───────────────────────────────────────────────────────────────

/**
 * One invoice's status from its lines' statuses — the same cascade as the frontend's getInvoiceCycleStatus():
 * all Cancelled → Cancelled; all non-cancelled Paid → Paid; any Paid/PartiallyPaid → PartiallyPaid; any Raised →
 * Raised; otherwise Draft. A mixed invoice therefore resolves to one deterministic answer.
 */
export function cycleStatus(statuses: string[]): string {
  if (statuses.length === 0) return "Draft";
  const live = statuses.map(normalizeStatus).filter((s) => s !== "Cancelled");
  if (live.length === 0) return "Cancelled";
  if (live.every((s) => s === "Paid")) return "Paid";
  if (live.some((s) => s === "Paid" || s === "PartiallyPaid")) return "PartiallyPaid";
  if (live.some((s) => s === "Raised")) return "Raised";
  return "Draft";
}

/** Payment wording derived straight from the stored status — never inferred from anything else. */
export function paymentLabel(status: string): "Awaiting payment" | "Partially paid" | "Paid" | "Not applicable" {
  const s = normalizeStatus(status);
  if (s === "Raised") return "Awaiting payment";
  if (s === "PartiallyPaid") return "Partially paid";
  if (s === "Paid") return "Paid";
  return "Not applicable"; // Draft (not raised yet) and Cancelled
}

export interface TrackerLine {
  id: string;
  projectId: string;
  quantityItemId?: string;
  invoiceNo: string;
  invoiceDate?: Date;
  status: string;
  invoiceAmountINR: number;
  createdAt?: Date;
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
  /** Earliest line `createdAt` — the invoice's workflow creation date (null only for lines without one). */
  createdAt: Date | null;
  /** Earliest USABLE line invoice date — null when no line has one (see the header). */
  invoiceDate: Date | null;
  /** Earliest RECORDED raise of any line (see the ORDER note) — null when no raise was recorded. Set by the caller. */
  raisedAt: Date | null;
  lines: L[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const earliest = (dates: (Date | undefined)[]): Date | null => {
  let best: Date | null = null;
  for (const d of dates) if (d && (best === null || d < best)) best = d;
  return best;
};

/** One group per (project, normalized invoice number). Order: first appearance. */
export function groupInvoices<L extends TrackerLine>(lines: L[]): InvoiceGroup<L>[] {
  const groups = new Map<string, InvoiceGroup<L>>();
  for (const line of lines) {
    const key = normalizeInvoiceNo(line.invoiceNo);
    const mapKey = `${line.projectId}\u0000${key}`;
    let g = groups.get(mapKey);
    if (!g) {
      g = { projectId: line.projectId, key, invoiceNo: line.invoiceNo, status: "Draft", amountINR: 0, createdAt: null, invoiceDate: null, raisedAt: null, lines: [] };
      groups.set(mapKey, g);
    }
    g.lines.push(line);
  }
  for (const g of groups.values()) {
    g.status = cycleStatus(g.lines.map((l) => l.status));
    g.amountINR = round2(g.lines.filter((l) => normalizeStatus(l.status) !== "Cancelled").reduce((s, l) => s + l.invoiceAmountINR, 0));
    g.createdAt = earliest(g.lines.map((l) => l.createdAt));
    g.invoiceDate = earliest(g.lines.map((l) => (isValidInvoiceDate(l.invoiceDate) ? l.invoiceDate : undefined)));
  }
  return [...groups.values()];
}

/**
 * The month's invoices: those whose INVOICE DATE is in the month. `window` null = every invoice (all history), including ones
 * with no usable date. Nothing else — creation, raise, payment and update dates play no part in membership.
 */
export function invoicesDatedIn<L extends TrackerLine>(groups: InvoiceGroup<L>[], window: MonthWindow | null): InvoiceGroup<L>[] {
  return window === null ? groups : groups.filter((g) => inInvoiceMonth(g.invoiceDate, window));
}

/** What an invoice's Amount Paid rests on — it is never a recorded payment, because none exist. */
export type PaidBasis = "none_yet" | "inferred_from_status" | "not_recorded" | "not_applicable";

export interface InvoiceFinancials {
  amountINR: number;
  /** null = not recorded. For a Paid invoice it is the invoice amount, INFERRED from the Paid status (see `paidBasis`). */
  amountPaidINR: number | null;
  /** none_yet = Raised (nothing paid yet); inferred_from_status = Paid (settled, amount inferred); not_recorded = Partially Paid or an unconfirmable Paid; not_applicable = Draft / Cancelled. */
  paidBasis: PaidBasis;
  /** null = not recorded (Partially Paid) or not applicable (Draft, Cancelled). */
  outstandingINR: number | null;
  /** How `outstandingINR` was determined. */
  balance: "full" | "settled" | "not_recorded" | "not_applicable";
  /** Data-quality notes for review; never silently "fixed". */
  flags: string[];
}

/** True when the invoice's LIVE (non-cancelled) lines do not all share one status — a contradiction for an invoice marked Paid. */
export function hasMixedLiveStatuses(lines: { status: string }[]): boolean {
  return new Set(lines.map((l) => normalizeStatus(l.status)).filter((s) => s !== "Cancelled")).size > 1;
}

/**
 * `liveLinesMixed` = hasMixedLiveStatuses(lines). Needed because an invoice's status is a roll-up: a Paid invoice whose live lines are
 * not all Paid contradicts "settled", so its Amount Paid is not inferred.
 */
export function financialsOf(status: string, amountINR: number, mixedLineStatuses = false, liveLinesMixed = false): InvoiceFinancials {
  const s = normalizeStatus(status);
  const flags: string[] = [];
  if (mixedLineStatuses) flags.push("Lines have different statuses");
  const validAmount = Number.isFinite(amountINR) && amountINR >= 0;
  if ((s === "Raised" || s === "PartiallyPaid") && !(amountINR > 0)) flags.push("Raised invoice has a zero amount");
  if (s === "Raised") return { amountINR, amountPaidINR: 0, paidBasis: "none_yet", outstandingINR: amountINR, balance: "full", flags };
  if (s === "Paid") {
    if (validAmount && !liveLinesMixed) {
      if (amountINR === 0) flags.push("Paid invoice has a zero amount — review");
      return { amountINR, amountPaidINR: amountINR, paidBasis: "inferred_from_status", outstandingINR: 0, balance: "settled", flags };
    }
    const why = liveLinesMixed ? "its lines have different statuses" : "the invoice amount is negative or invalid";
    return { amountINR, amountPaidINR: null, paidBasis: "not_recorded", outstandingINR: null, balance: "not_recorded", flags: [...flags, `Marked Paid, but settlement cannot be confirmed (${why}) — review`] };
  }
  if (s === "PartiallyPaid") return { amountINR, amountPaidINR: null, paidBasis: "not_recorded", outstandingINR: null, balance: "not_recorded", flags: [...flags, "Paid amount and balance are not recorded"] };
  return { amountINR, amountPaidINR: null, paidBasis: "not_applicable", outstandingINR: null, balance: "not_applicable", flags };
}

// ── Month report ───────────────────────────────────────────────────────────

export interface InvoiceStatusCounts {
  raised: number;
  partiallyPaid: number;
  paid: number;
  draft: number;
  cancelled: number;
}

export function emptyCounts(): InvoiceStatusCounts {
  return { raised: 0, partiallyPaid: 0, paid: 0, draft: 0, cancelled: 0 };
}

export function addToCounts(counts: InvoiceStatusCounts, status: string): void {
  const s = normalizeStatus(status);
  if (s === "Raised") counts.raised++;
  else if (s === "PartiallyPaid") counts.partiallyPaid++;
  else if (s === "Paid") counts.paid++;
  else if (s === "Cancelled") counts.cancelled++;
  else counts.draft++;
}

export interface RequestLite {
  id: string;
  projectId: string;
  status: string; // Open | Completed
  createdAt: Date;
}

export interface ProjectRecordState {
  recordCount: number;
  invoiceCount: number;
  /** The invoices' ACTUAL statuses (a legacy "Submitted" counts as Raised) — never collapsed into one label. */
  byStatus: InvoiceStatusCounts;
  /** Raised / PartiallyPaid / Paid invoices. */
  raisedInvoiceCount: number;
  /** Of those, the ones whose recorded raise is inside the period (always 0 for "all months"). */
  raisedInPeriodCount: number;
  raisedAmountINR: number;
  draftInvoiceCount: number;
  cancelledInvoiceCount: number;
  openRequestCount: number;
  completedRequestCount: number;
}

function emptyProjectState(): ProjectRecordState {
  return { recordCount: 0, invoiceCount: 0, byStatus: emptyCounts(), raisedInvoiceCount: 0, raisedInPeriodCount: 0, raisedAmountINR: 0, draftInvoiceCount: 0, cancelledInvoiceCount: 0, openRequestCount: 0, completedRequestCount: 0 };
}

/** 1 = raised in the selected month (recorded raise); 2 = every other qualifying record. */
export type RecordTier = 1 | 2;

/** Group 1 needs a raised-class status AND a recorded raise in the India month. Drafts, cancelled and un-recorded raises are group 2. */
export function invoiceTier(inv: { status: string; raisedAt: Date | null }, window: MonthWindow | null): RecordTier {
  return isRaisedStatus(inv.status) && window !== null && inv.raisedAt !== null && inWindow(inv.raisedAt, window) ? 1 : 2;
}

/** Requests are never raised invoices: always group 2. */
export function requestTier(): RecordTier {
  return 2;
}

export interface OrderableRecord {
  kind: "invoice" | "request";
  id: string;
  tier: RecordTier;
  /** The relevant persisted date: the recorded raise (group 1), else the invoice date (a request's creation date). */
  sortDate: Date;
}

const byTierDateId = (a: OrderableRecord, b: OrderableRecord): number =>
  a.tier - b.tier || b.sortDate.getTime() - a.sortDate.getTime() || (a.kind === b.kind ? 0 : a.kind === "invoice" ? -1 : 1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The display order of one project's records: group, then newest relevant date first, then a stable id tie-break. */
export function orderRecords(records: OrderableRecord[]): { kind: "invoice" | "request"; id: string }[] {
  return [...records].sort(byTierDateId).map((r) => ({ kind: r.kind, id: r.id }));
}

/** The record that represents a project in the ranking: its best group, and inside it the newest relevant date. */
export function bestRecord(records: OrderableRecord[]): { tier: RecordTier; sortDate: Date } | null {
  const first = [...records].sort(byTierDateId)[0];
  return first ? { tier: first.tier, sortDate: first.sortDate } : null;
}

// ── The headline invoice and the older-outstanding warning ──────────────────

/**
 * Newest invoice first, deterministically: invoice date (descending), then — only to break an exact tie, because the invoice date
 * has no time of day — the workflow creation time (descending, a stored column, no precision is invented), then the invoice key
 * (descending). Creation, raise and update times never decide WHICH invoice is the latest, only the order of identical dates.
 */
export function compareNewestFirst(a: { invoiceDate: Date | null; createdAt: Date | null; key: string }, b: { invoiceDate: Date | null; createdAt: Date | null; key: string }): number {
  return (b.invoiceDate?.getTime() ?? 0) - (a.invoiceDate?.getTime() ?? 0) || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0);
}

/**
 * The invoices a month report can speak about: those with a USABLE invoice date up to the end of the selected month (an invoice
 * dated after it is the future of this report; one with no usable date is in no month and is only counted — never placed).
 * `window` null (All history) = every usable-dated invoice.
 */
export function invoicesUpTo<G extends { invoiceDate: Date | null }>(groups: G[], window: MonthWindow | null): G[] {
  return groups.filter((g) => isValidInvoiceDate(g.invoiceDate) && (window === null || g.invoiceDate.getTime() < window.dateEnd.getTime()));
}

/**
 * THE LATEST RAISED INVOICE: among the invoices actually raised (Raised, Partially Paid, Paid — never Draft or Cancelled) the one
 * with the newest invoice date. It stays the latest whatever its payment status, and a newer Draft never replaces it.
 */
export function latestRaisedGroup<G extends { status: string; invoiceDate: Date | null; createdAt: Date | null; key: string }>(context: G[]): G | null {
  let best: G | null = null;
  for (const g of context) if (isRaisedStatus(g.status) && (best === null || compareNewestFirst(g, best) < 0)) best = g;
  return best;
}

export interface OlderOutstanding {
  /** Older invoices (they sort after the latest raised one) that are Raised or Partially Paid. Each invoice once; the latest itself never. */
  count: number;
  /** The total — only when EVERY counted invoice has a reliable balance; otherwise null (no partial or guessed total). */
  amountINR: number | null;
  /** Sum of the reliable balances (Raised invoices with a valid positive amount). */
  knownAmountINR: number;
  /** Counted invoices whose balance is not recorded or unreliable (Partially Paid, zero / invalid amount). */
  unknownCount: number;
  /** Raised / Partially Paid invoices with no usable date: they cannot be ordered against the latest invoice, so they are not in the count. */
  undatedCount: number;
  /** The counted invoices — the figure is traceable to these rows of the history. */
  keys: string[];
}

const isOutstandingStatus = (status: string): boolean => normalizeStatus(status) === "Raised" || normalizeStatus(status) === "PartiallyPaid";

/**
 * Older invoices still outstanding relative to the latest raised invoice. Paid invoices, Drafts and Cancelled invoices are
 * never outstanding; Work Order Value and payment milestones play no part. A Raised invoice's balance is its amount; a Partially
 * Paid one has no stored balance, so it is counted but makes the total unavailable.
 */
export function olderOutstanding<G extends InvoiceGroup>(context: G[], latest: G | null, allGroups: G[]): OlderOutstanding {
  const undatedCount = allGroups.filter((g) => !isValidInvoiceDate(g.invoiceDate) && isOutstandingStatus(g.status)).length;
  const out: OlderOutstanding = { count: 0, amountINR: 0, knownAmountINR: 0, unknownCount: 0, undatedCount, keys: [] };
  if (!latest) return out;
  for (const g of context) {
    if (g.key === latest.key || compareNewestFirst(latest, g) >= 0 || !isOutstandingStatus(g.status)) continue;
    const mixed = new Set(g.lines.map((l) => normalizeStatus(l.status))).size > 1;
    const fin = financialsOf(g.status, g.amountINR, mixed, hasMixedLiveStatuses(g.lines));
    out.count += 1;
    out.keys.push(g.key);
    if (fin.outstandingINR !== null && Number.isFinite(fin.outstandingINR) && g.amountINR > 0) out.knownAmountINR = round2(out.knownAmountINR + fin.outstandingINR);
    else out.unknownCount += 1;
  }
  out.amountINR = out.unknownCount === 0 ? out.knownAmountINR : null;
  return out;
}

export interface NotRecorded {
  /** Always null: the figure is not stored anywhere. */
  amountINR: null;
  note: string;
}

/**
 * "Amount collected": the sum, over invoices in scope, of the Amount Paid that financialsOf() can INFER — i.e. Paid invoices (positive
 * amount, all live lines Paid) at their full amount. Each invoice counts once. Partially Paid invoices are left out (counted in
 * `partiallyPaidExcludedCount`), as are Paid invoices the data contradicts (`needsReviewCount`).
 */
export interface CollectedFigure {
  amountINR: number;
  basis: "inferred_from_paid_status";
  paidInvoiceCount: number;
  partiallyPaidExcludedCount: number;
  needsReviewCount: number;
  note: string;
}

export interface MonthSummary {
  /** Projects having at least one record in the period (matching the search / status filters). */
  projectCount: number;
  projectsRaised: number;
  projectsAwaitingApproval: number;
  /** Invoices + requests created in the period. */
  recordCount: number;
  invoiceCount: number;
  requestCount: number;
  invoicesRaised: number;
  raisedAmountINR: number;
  byStatus: InvoiceStatusCounts;
  requests: { open: number; completed: number };
  /** Open requests created in the period. They carry no amount, so none is invented. */
  pendingApproval: { count: number } & NotRecorded;
  collected: CollectedFigure;
  /** Outstanding among invoices CREATED in the period (the all-months figure is the Outstanding view's). */
  outstanding: { scope: "selected_month"; knownAmountINR: number; invoiceCount: number; balanceNotRecordedCount: number };
}

export const PENDING_APPROVAL_NOTE = "Invoice requests carry only a free-text amount note, so no amount is recorded.";
export const COLLECTED_NOTE =
  "Paid invoices at their full amount — inferred from the Paid status, not from a recorded payment (none are stored). Partially Paid invoices are not included: no amount is stored for them.";

/**
 * Per-project state and period-wide totals from the period's records of ALL matching projects (so totals are never
 * limited to the current page).
 */
export function summarizeRecords(invoices: InvoiceGroup[], requests: RequestLite[], window: MonthWindow | null = null): { summary: MonthSummary; byProject: Map<string, ProjectRecordState> } {
  const byProject = new Map<string, ProjectRecordState>();
  const get = (projectId: string): ProjectRecordState => {
    let st = byProject.get(projectId);
    if (!st) {
      st = emptyProjectState();
      byProject.set(projectId, st);
    }
    return st;
  };
  const byStatus = emptyCounts();
  let invoicesRaised = 0;
  let raisedAmountINR = 0;
  let outstandingKnown = 0;
  let outstandingCount = 0;
  let notRecorded = 0;
  let collectedAmount = 0;
  let paidCount = 0;
  let partialExcluded = 0;
  let needsReview = 0;
  for (const g of invoices) {
    const st = get(g.projectId);
    st.recordCount++;
    st.invoiceCount++;
    addToCounts(byStatus, g.status);
    addToCounts(st.byStatus, g.status);
    if (isRaisedStatus(g.status)) {
      st.raisedInvoiceCount++;
      if (invoiceTier(g, window) === 1) st.raisedInPeriodCount++;
      st.raisedAmountINR = round2(st.raisedAmountINR + g.amountINR);
      invoicesRaised++;
      raisedAmountINR = round2(raisedAmountINR + g.amountINR);
      const fin = financialsOf(g.status, g.amountINR, false, hasMixedLiveStatuses(g.lines));
      if (fin.paidBasis === "inferred_from_status") {
        collectedAmount = round2(collectedAmount + (fin.amountPaidINR ?? 0));
        paidCount++;
      } else if (normalizeStatus(g.status) === "PartiallyPaid") partialExcluded++;
      else if (normalizeStatus(g.status) === "Paid") needsReview++;
      if (fin.balance === "full") {
        outstandingKnown = round2(outstandingKnown + g.amountINR);
        outstandingCount++;
      } else if (fin.balance === "not_recorded") {
        notRecorded++;
        outstandingCount++;
      }
    } else if (g.status === "Cancelled") st.cancelledInvoiceCount++;
    else st.draftInvoiceCount++;
  }
  let open = 0;
  let completed = 0;
  for (const r of requests) {
    const st = get(r.projectId);
    st.recordCount++;
    if (r.status === "Open") {
      st.openRequestCount++;
      open++;
    } else {
      st.completedRequestCount++;
      completed++;
    }
  }
  const states = [...byProject.values()];
  return {
    summary: {
      projectCount: byProject.size,
      projectsRaised: states.filter((s) => s.raisedInvoiceCount > 0).length,
      projectsAwaitingApproval: states.filter((s) => s.openRequestCount > 0).length,
      recordCount: invoices.length + requests.length,
      invoiceCount: invoices.length,
      requestCount: requests.length,
      invoicesRaised,
      raisedAmountINR,
      byStatus,
      requests: { open, completed },
      pendingApproval: { count: open, amountINR: null, note: PENDING_APPROVAL_NOTE },
      collected: { amountINR: collectedAmount, basis: "inferred_from_paid_status", paidInvoiceCount: paidCount, partiallyPaidExcludedCount: partialExcluded, needsReviewCount: needsReview, note: COLLECTED_NOTE },
      outstanding: { scope: "selected_month", knownAmountINR: outstandingKnown, invoiceCount: outstandingCount, balanceNotRecordedCount: notRecorded },
    },
    byProject,
  };
}

// ── Outstanding view ───────────────────────────────────────────────────────

export interface OutstandingGroupInput extends InvoiceGroup {
  /** Calendar days from the invoice date to today (India), computed by the caller with the reminder's own helper. */
  daysOutstanding: number | null;
}

export interface OutstandingTotals {
  invoiceCount: number;
  /** Sum of Raised invoices' amounts (known balances only). */
  knownOutstandingINR: number;
  partiallyPaidCount: number;
  /** Their invoice amounts — an upper bound reference, NOT an outstanding figure. */
  partiallyPaidInvoiceAmountINR: number;
  overdue30PlusCount: number;
  oldestDays: number | null;
}

export function summarizeOutstanding(rows: { status: string; amountINR: number; daysOutstanding: number | null }[]): OutstandingTotals {
  let known = 0;
  let partial = 0;
  let partialAmount = 0;
  let overdue = 0;
  let oldest: number | null = null;
  for (const r of rows) {
    if (normalizeStatus(r.status) === "Raised") known = round2(known + r.amountINR);
    else {
      partial++;
      partialAmount = round2(partialAmount + r.amountINR);
    }
    if (r.daysOutstanding !== null) {
      if (r.daysOutstanding >= 30) overdue++;
      if (oldest === null || r.daysOutstanding > oldest) oldest = r.daysOutstanding;
    }
  }
  return { invoiceCount: rows.length, knownOutstandingINR: known, partiallyPaidCount: partial, partiallyPaidInvoiceAmountINR: partialAmount, overdue30PlusCount: overdue, oldestDays: oldest };
}

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

/**
 * When a RECORDED event first took the invoice into a raised state (Raised, Partially Paid or Paid) from a state that was
 * not raised — creation as Raised, Draft → Raised, a re-raise after Cancelled. Later moves between raised states
 * (Raised → Partially Paid → Paid) are payments, not a raise, so they never set this date. Invoices whose history does
 * not contain the raise (for example, created before history tracking and only paid since) return null; no date is
 * inferred.
 */
export function firstRaisedAt(timeline: TimelineEvent[]): string | null {
  const hit = timeline.find((e) => e.toStatus !== null && isRaisedStatus(e.toStatus) && (e.fromStatus === null || !isRaisedStatus(e.fromStatus)));
  return hit ? hit.occurredAt : null;
}
