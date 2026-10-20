/**
 * Weekly "Invoices Unpaid for 30+ Days" email (Oct 2026) — pure rules, no I/O.
 *
 * Decisions (confirmed with the PMO admin, Oct 2026), because the invoice data
 * model has no status history, no "raised at" timestamp and no paid amount:
 * - Age is counted from InvoiceLine.invoiceDate (the date on the invoice —
 *   the same date Reports' ageing buckets use). createdAt is NOT used: for
 *   older invoices it is the data-entry date, often months later.
 * - "Raised and not paid" = status Raised (shown in the portal as "Raised /
 *   Submitted"; a legacy stored "Submitted" is treated the same, as the
 *   portal does) or PartiallyPaid. Draft (never raised), Paid and Cancelled
 *   are excluded. Age is the invoice's age, not time spent in its status.
 * - Raised: amount paid 0, outstanding = invoice amount. PartiallyPaid: the
 *   paid amount is not recorded anywhere, so paid/outstanding are null
 *   ("Not recorded") — never a guessed figure.
 */

import { prNoCollator } from "./missingExpense.rules.js";

export const UNPAID_INVOICE_JOB_NAME = "unpaid_invoices_30_days";
export const UNPAID_INVOICE_SETTING_KEY = "unpaid_invoices_30_days";
export const UNPAID_INVOICE_SUBJECT = "Weekly Reminder — Invoices Unpaid for 30+ Days";
export const OVERDUE_DAYS = 30;
/** Stored statuses that count as raised-and-not-paid ("Submitted" = legacy alias of Raised). */
export const UNPAID_STATUSES = ["Raised", "Submitted", "PartiallyPaid"] as const;
export const RAISED_LABEL = "Raised / Submitted";

export interface InvoiceLineCandidate {
  id: string;
  projectId: string;
  prNo: string;
  client: string;
  projectTitle: string;
  projectManager: string | null;
  invoiceNo: string;
  invoiceDate: Date; // stored as a date-only value (UTC midnight)
  status: string;
  invoiceAmountINR: number;
  currency: string;
  invoiceAmountOriginal: number | null;
}

export interface OverdueInvoiceRow {
  projectId: string;
  prNo: string;
  client: string;
  projectTitle: string;
  projectManager: string | null;
  invoiceNo: string;
  /** The invoice's earliest line — the email link highlights it in Edit Project → Invoices. */
  invoiceLineId: string;
  invoiceDate: string; // YYYY-MM-DD
  daysSinceRaised: number;
  invoiceAmountINR: number;
  /** 0 for Raised / Submitted; null for Partially Paid (amount paid is not recorded). */
  amountPaidINR: number | null;
  /** Invoice amount for Raised; null for Partially Paid. */
  outstandingINR: number | null;
  status: "Raised / Submitted" | "Partially Paid";
  /** e.g. "USD 2,400.00" when the invoice was raised in another currency. */
  originalAmountNote: string | null;
  lineCount: number;
}

export interface UnpaidInvoiceReport {
  /** Raised / Partially Paid invoices on live projects, any age. */
  eligibleCount: number;
  overdue: OverdueInvoiceRow[];
}

/** Same as a bare `a.localeCompare(b)` (default locale, default options), built once. */
const defaultCollator = new Intl.Collator();

export function isUnpaidStatus(status: string): boolean {
  return (UNPAID_STATUSES as readonly string[]).includes(status);
}

/** Today's calendar date (YYYY-MM-DD) in `timeZone`. */
export function zonedToday(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/**
 * Whole calendar days from the invoice date to today (in `timeZone`):
 * an invoice dated 18 Sep is exactly 30 days old on 18 Oct, whatever the hour.
 */
export function calendarDaysSince(invoiceDate: Date, now: Date, timeZone: string): number {
  return daysFrom(invoiceDate, zonedToday(now, timeZone));
}

/** Same count against an already-computed `today` (YYYY-MM-DD) — the report computes it once, not per line. */
function daysFrom(invoiceDate: Date, today: string): number {
  const invoiceDay = invoiceDate.toISOString().slice(0, 10); // date-only value, stored at UTC midnight
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${invoiceDay}T00:00:00Z`)) / 86_400_000);
}

function formatOriginal(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * One row per invoice (project + invoice number): an invoice raised as
 * several lines appears once, with the amounts summed and the earliest
 * invoice date. Different invoice numbers on one project (separate invoice
 * cycles) are separate rows.
 */
export function buildUnpaidInvoiceReport(lines: InvoiceLineCandidate[], now: Date, timeZone: string): UnpaidInvoiceReport {
  const groups = new Map<string, InvoiceLineCandidate[]>();
  for (const line of lines) {
    if (!isUnpaidStatus(line.status)) continue;
    const key = `${line.projectId}\u0000${line.invoiceNo.trim().toUpperCase()}`;
    const g = groups.get(key);
    if (g) g.push(line);
    else groups.set(key, [line]);
  }

  const today = zonedToday(now, timeZone);
  const overdue: OverdueInvoiceRow[] = [];
  for (const g of groups.values()) {
    const first = g[0]!;
    const earliest = g.reduce((a, b) => (b.invoiceDate < a.invoiceDate ? b : a));
    const days = daysFrom(earliest.invoiceDate, today);
    if (days < OVERDUE_DAYS) continue;
    const amount = Math.round(g.reduce((s, l) => s + l.invoiceAmountINR, 0) * 100) / 100;
    const partial = g.some((l) => l.status === "PartiallyPaid");
    const foreign = g.filter((l) => l.currency && l.currency !== "INR" && l.invoiceAmountOriginal !== null);
    const sameCurrency = foreign.length > 0 && foreign.length === g.length && foreign.every((l) => l.currency === foreign[0]!.currency);
    overdue.push({
      projectId: first.projectId,
      prNo: first.prNo,
      client: first.client,
      projectTitle: first.projectTitle,
      projectManager: first.projectManager,
      invoiceNo: first.invoiceNo,
      invoiceLineId: earliest.id,
      invoiceDate: earliest.invoiceDate.toISOString().slice(0, 10),
      daysSinceRaised: days,
      invoiceAmountINR: amount,
      amountPaidINR: partial ? null : 0,
      outstandingINR: partial ? null : amount,
      status: partial ? "Partially Paid" : RAISED_LABEL,
      originalAmountNote: sameCurrency ? formatOriginal(foreign[0]!.currency, foreign.reduce((s, l) => s + (l.invoiceAmountOriginal ?? 0), 0)) : null,
      lineCount: g.length,
    });
  }
  overdue.sort((a, b) => b.daysSinceRaised - a.daysSinceRaised || prNoCollator.compare(a.prNo, b.prNo) || defaultCollator.compare(a.invoiceNo, b.invoiceNo));
  return { eligibleCount: groups.size, overdue };
}

/** Sum of known outstanding (Raised) amounts; Partially Paid amounts are unknown and not included. */
export function totalKnownOutstanding(rows: OverdueInvoiceRow[]): number {
  return Math.round(rows.reduce((s, r) => s + (r.outstandingINR ?? 0), 0) * 100) / 100;
}
