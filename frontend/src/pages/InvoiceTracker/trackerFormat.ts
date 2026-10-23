import type { InvoiceLineStatus } from "../../types/InvoiceItem";
import type { Tone } from "../../components/ui/Badge";
import { INVOICE_LINE_STATUS_LABEL, INVOICE_LINE_STATUS_TONE } from "../Projects/components/Invoice/InvoiceCalculations";
import type { LatestRecord, SummaryStatus, TimelineEvent, TrackerFilter } from "../../services/invoiceTrackerService";

/** "2026-10" — the current calendar month in Asia/Kolkata (the portal's business time zone). */
export function currentMonthIST(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}`;
}

export function isValidMonth(month: string | null | undefined): month is string {
  if (!month) return false;
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return false;
  const year = Number(m[1]);
  const monthNumber = Number(m[2]);
  return year >= 2000 && year <= 2100 && monthNumber >= 1 && monthNumber <= 12;
}

/** A real month, or the "all" history scope. */
export function isMonthOrAll(value: string | null | undefined): value is string {
  return value === "all" || isValidMonth(value);
}

/** "2026-03" → "March 2026"; "all" → "All months". */
export function formatMonthLabel(month: string): string {
  if (month === "all") return "All months";
  if (!isValidMonth(month)) return month;
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03-01" → "01 Mar 2026" (a date-only value; no time zone conversion). */
export function formatDateOnly(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/** An exact instant, shown in India time: "20 Oct 2026, 3:45 pm IST". */
export function formatInstant(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const text = d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
  return `${text.replace(/\s?(am|pm)$/i, (s) => s.toLowerCase())} IST`;
}

export const statusLabel = (status: string | null): string => (status ? (INVOICE_LINE_STATUS_LABEL[status as InvoiceLineStatus] ?? status) : "—");

/** The project row's Status: an open request is "Pending Approval"; an invoice is exactly the status Accounts saved. */
export const SUMMARY_STATUS_LABEL: Record<SummaryStatus, string> = { PendingApproval: "Pending Approval", Raised: "Raised", PartiallyPaid: "Partially Paid", Paid: "Paid" };
export const SUMMARY_STATUS_TONE: Record<SummaryStatus, Tone> = {
  PendingApproval: "accent",
  Raised: INVOICE_LINE_STATUS_TONE.Raised,
  PartiallyPaid: INVOICE_LINE_STATUS_TONE.PartiallyPaid,
  Paid: INVOICE_LINE_STATUS_TONE.Paid,
};

/**
 * The line under the amount that says WHICH record it is and when — so a row never looks like a current-month invoice when it is an
 * older record, and a request (no amount) says what it is waiting for or where its invoice went.
 */
export function latestRecordCaption(r: Pick<LatestRecord, "kind" | "reference" | "recordDate" | "status" | "raisedLater">): string {
  if (r.kind === "invoice") return `${r.reference} · Invoice date ${formatDateOnly(r.recordDate)}`;
  if (r.raisedLater) {
    const where = r.raisedLater.invoiceDate ? `dated ${formatDateOnly(r.raisedLater.invoiceDate)}` : "with no usable invoice date";
    return `Request ${r.reference} · ${formatDateOnly(r.recordDate)} · invoice ${r.raisedLater.invoiceNo} ${where}`;
  }
  return `Request ${r.reference} · ${formatDateOnly(r.recordDate)} · awaiting invoice`;
}

/** One line of the timeline: what happened, from the recorded previous and new status. */
export function describeEvent(e: Pick<TimelineEvent, "eventType" | "fromStatus" | "toStatus" | "lineCount">): string {
  const lines = e.lineCount > 1 ? ` · ${e.lineCount} lines` : "";
  switch (e.eventType) {
    case "CREATED":
      return `Created as ${statusLabel(e.toStatus)}${lines}`;
    case "IMPORTED":
      return `Imported as ${statusLabel(e.toStatus)} — earlier history unknown${lines}`;
    case "STATUS_CHANGED":
      return `${statusLabel(e.fromStatus)} → ${statusLabel(e.toStatus)}${lines}`;
    case "DELETED":
      return `Deleted (was ${statusLabel(e.fromStatus)})${lines}`;
    default:
      return `${e.eventType}${lines}`;
  }
}

const SOURCE_LABELS: Record<string, string> = {
  invoice_create: "Invoice created",
  invoice_update: "Invoice edited",
  invoice_delete: "Invoice deleted",
  invoice_ingest: "Imported",
  quantity_activity_delete: "Activity deleted",
  project_permanent_delete: "Project permanently deleted",
};
export const sourceLabel = (source: string): string => SOURCE_LABELS[source] ?? source;

export const TRACKER_FILTERS: { value: TrackerFilter; label: string }[] = [
  { value: "all", label: "All projects with records" },
  { value: "raised", label: "Has a raised invoice" },
  { value: "notRaised", label: "No raised invoice" },
  { value: "requestPending", label: "Invoice request open (+)" },
];

export type TrackerView = "month" | "outstanding" | "history";
export const TRACKER_VIEWS: { value: TrackerView; label: string }[] = [
  { value: "month", label: "Monthly report" },
  { value: "outstanding", label: "Outstanding" },
  { value: "history", label: "All history" },
];
export function parseView(value: string | null | undefined): TrackerView {
  return TRACKER_VIEWS.some((v) => v.value === value) ? (value as TrackerView) : "month";
}

/** Projects with an invoice save in flight (count per project: two quick saves on one project keep it "saving" until both settle). */
export type SavingMap = ReadonlyMap<string, number>;
export const beginSaving = (m: SavingMap, projectId: string): SavingMap => new Map(m).set(projectId, (m.get(projectId) ?? 0) + 1);
export function endSaving(m: SavingMap, projectId: string): SavingMap {
  const left = (m.get(projectId) ?? 0) - 1;
  const next = new Map(m);
  if (left > 0) next.set(projectId, left);
  else next.delete(projectId);
  return next;
}
export const isSaving = (m: SavingMap, projectId: string): boolean => (m.get(projectId) ?? 0) > 0;

export const plural = (n: number, word: string): string => `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

/**
 * The older-outstanding warning, one line per fact. The count is stated only when it is reliable; the amount only when EVERY
 * counted invoice has a reliable balance — otherwise the total is declared unavailable instead of a partial or guessed figure.
 */
export function olderOutstandingLines(o: { count: number; amountINR: number | null; unknownCount: number; undatedCount: number }, format: (n: number) => string, compact = false): string[] {
  const lines: string[] = [];
  if (o.count > 0) {
    lines.push(
      o.amountINR !== null
        ? `${plural(o.count, "older invoice")} outstanding — ${format(o.amountINR)}`
        : compact
          ? `${plural(o.count, "older invoice")} outstanding — total not recorded`
          : `${plural(o.count, "older invoice")} outstanding — total not recorded (${o.unknownCount} without a recorded balance, needs review)`
    );
  }
  if (o.undatedCount > 0) {
    lines.push(
      compact
        ? `${plural(o.undatedCount, "outstanding invoice")} with no usable date`
        : `${plural(o.undatedCount, "outstanding invoice")} with no usable invoice date — cannot be placed before or after the latest invoice; see the Outstanding tab`
    );
  }
  return lines;
}

/** An amount that may not be recorded: null → "Not recorded". */
export function amountOrNotRecorded(amount: number | null, format: (n: number) => string): string {
  return amount === null ? "Not recorded" : format(amount);
}

export function parseFilter(value: string | null | undefined): TrackerFilter {
  return TRACKER_FILTERS.some((f) => f.value === value) ? (value as TrackerFilter) : "all";
}

/** Years offered: a fixed window around "now" that always includes the selected year, so the displayed value can never be missing from the list. */
export function yearOptions(selectedYear: number, currentYear: number): number[] {
  const first = Math.min(2020, selectedYear);
  const last = Math.max(currentYear + 1, selectedYear);
  const years: number[] = [];
  for (let y = first; y <= last; y++) years.push(y);
  return years;
}
