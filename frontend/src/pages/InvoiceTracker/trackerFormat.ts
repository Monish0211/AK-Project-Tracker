import type { InvoiceLineStatus } from "../../types/InvoiceItem";
import { INVOICE_LINE_STATUS_LABEL } from "../Projects/components/Invoice/InvoiceCalculations";
import type { TimelineEvent, TrackerFilter } from "../../services/invoiceTrackerService";

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

/** "2026-03" → "March 2026". */
export function formatMonthLabel(month: string): string {
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
  { value: "all", label: "All projects" },
  { value: "raised", label: "Raised this month" },
  { value: "notRaised", label: "Not Raised this month" },
  { value: "requestPending", label: "Invoice request pending (+)" },
];

export function parseFilter(value: string | null | undefined): TrackerFilter {
  return TRACKER_FILTERS.some((f) => f.value === value) ? (value as TrackerFilter) : "all";
}
