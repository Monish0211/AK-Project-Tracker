import type { InvoiceItem } from "../types/InvoiceItem";
import type { Project } from "../types/Project";
import { getNextPayment } from "../utils/paymentUtils";

export type InvoiceStatus = "Pending" | "Partially Invoiced" | "Completed";

export function calculateTotalPrice(
  unitPrice: number,
  qty: number
): number {
  return unitPrice * qty;
}

/** Sums a line's billed amount across all non-cancelled invoice lines — a Cancelled line is kept for audit visibility but never counted as raised. */
export function getInvoiceRaisedAmount(item: InvoiceItem): number {
  const invoices = Array.isArray(item.invoices) ? item.invoices : [];

  return invoices
    .filter((invoice) => invoice.status !== "Cancelled")
    .reduce((sum, invoice) => sum + invoice.invoiceAmountINR, 0);
}

export function getRowInvoicePercentage(item: InvoiceItem): number {
  if (item.totalPrice <= 0) {
    return 0;
  }

  return (getInvoiceRaisedAmount(item) / item.totalPrice) * 100;
}

export function getRowBalancePercentage(item: InvoiceItem): number {
  return 100 - getRowInvoicePercentage(item);
}

export function getRowBalanceAmount(item: InvoiceItem): number {
  return item.totalPrice - getInvoiceRaisedAmount(item);
}

export function getInvoiceStatus(item: InvoiceItem): InvoiceStatus {
  const percentage = getRowInvoicePercentage(item);

  if (percentage <= 0) {
    return "Pending";
  }

  if (percentage >= 100) {
    return "Completed";
  }

  return "Partially Invoiced";
}

export function getTotalWorkPackageValue(items: InvoiceItem[]): number {
  const safeItems = Array.isArray(items) ? items : [];

  return safeItems.reduce((sum, item) => sum + item.totalPrice, 0);
}

export function getTotalInvoiceRaised(items: InvoiceItem[]): number {
  const safeItems = Array.isArray(items) ? items : [];

  return safeItems.reduce(
    (sum, item) => sum + getInvoiceRaisedAmount(item),
    0
  );
}

/**
 * Reports Phase 2 Business Definition: Cash Realized / Payment Received
 * counts ONLY invoices with status "Paid". Raised and PartiallyPaid are NOT
 * treated as realized cash. Cancelled and Draft are excluded.
 */
function isReceivedInvoiceLineStatus(status: string): boolean {
  return status === "Paid";
}

/** Sum of a line's billed amount across every line that counts as received under the rule above — ONLY Paid invoices. Excludes Draft, Cancelled, Raised, and PartiallyPaid. */
export function getPaymentReceivedAmount(item: InvoiceItem): number {
  const invoices = Array.isArray(item.invoices) ? item.invoices : [];

  return invoices
    .filter((invoice) => isReceivedInvoiceLineStatus(invoice.status))
    .reduce((sum, invoice) => sum + invoice.invoiceAmountINR, 0);
}

export function getTotalPaymentReceived(items: InvoiceItem[]): number {
  const safeItems = Array.isArray(items) ? items : [];

  return safeItems.reduce(
    (sum, item) => sum + getPaymentReceivedAmount(item),
    0
  );
}

/** Count of non-cancelled invoice lines across all activities. */
export function getInvoiceCount(items: InvoiceItem[]): number {
  const safeItems = Array.isArray(items) ? items : [];

  return safeItems.reduce(
    (count, item) =>
      count +
      (Array.isArray(item.invoices)
        ? item.invoices.filter((invoice) => invoice.status !== "Cancelled").length
        : 0),
    0
  );
}

export function getBalanceAmount(
  projectValue: number,
  invoiceRaised: number
): number {
  return projectValue - invoiceRaised;
}

export function getBalancePercentage(
  projectValue: number,
  invoiceRaised: number
): number {
  if (projectValue <= 0) {
    return 0;
  }

  return (getBalanceAmount(projectValue, invoiceRaised) / projectValue) * 100;
}

export function getInvoiceCompletionPercentage(
  projectValue: number,
  invoiceRaised: number
): number {
  if (projectValue <= 0) {
    return 0;
  }

  return (invoiceRaised / projectValue) * 100;
}

export function getOutstandingCollection(
  invoiceRaised: number,
  collectionReceived: number
): number {
  return invoiceRaised - collectionReceived;
}

export type ProjectInvoiceStatus = "Not Started" | "Pending" | "Completed";

export interface ProjectCommercialSummary {
  /** Total work-package value, derived from Invoice History (mirrors Quantity Details). */
  projectValueINR: number;
  totalInvoiceRaised: number;
  /** Balance not yet invoiced (Contract Value − Invoice Raised, "Balance to Invoice"). Never negative. Based purely on invoiced value, never payment status. */
  pendingDue: number;
  /** Sum of every invoice line that has reached Raised / Submitted, PartiallyPaid, or Paid — this PMO's confirmed rule treats Raised / Submitted as collected, same as Paid. */
  totalPaymentReceived: number;
  /**
   * Invoice Raised (includes Draft, excludes Cancelled) − Payment Received
   * (Raised/PartiallyPaid/Paid only). Never negative. This is the invoiced
   * amount that hasn't yet been counted as received — e.g. a Draft-only
   * invoice is fully Outstanding (raised, but Draft never counts as
   * received); a project with a Draft ₹3,000 line and a Paid ₹2,000 line
   * shows Outstanding = ₹3,000, not 0 and not the full contract value.
   * Deliberately NOT Work Order Value − Payment Received, and NOT the
   * same figure as "Balance to Invoice" (pendingDue below) — those are
   * separate concepts.
   */
  outstandingCollection: number;
  invoiceCompletionPercent: number;
  invoiceStatus: ProjectInvoiceStatus;
  invoicesRaisedCount: number;
  /** "-" once the project is fully invoiced, or when there is no upcoming milestone. */
  nextPaymentDate: string;
  nextPaymentAmount: number;
  nextPaymentDaysLeft: number | null;
  nextPaymentStatus: "Upcoming" | "Today" | "Overdue" | null;
}

/**
 * The single source of truth for a project's commercial figures (Pending Due,
 * Next Payment, Invoice Completion, Invoice Raised, Outstanding Collection,
 * Invoice Status) — used by Dashboard, Project Repository, View Project, and
 * Edit Project so every page shows a consistent figure.
 *
 * Sourced entirely from project.invoiceItems[].invoices — one unified
 * per-activity billing ledger. A payment milestone is only ever an optional
 * reference label on a line (see types/InvoiceItem.ts's InvoiceLine.milestoneId)
 * — never a second, independently-tracked billing total. Payment Received is
 * likewise derived from this same ledger rather than the legacy,
 * Excel-import-only project.paymentReceivedINR field, so it updates the
 * instant a line's status changes — no separate payment record to keep in
 * sync.
 *
 * Business rule: Payment Received counts every line that has reached
 * Raised / Submitted, PartiallyPaid, or Paid (i.e. everything actually
 * submitted to the client) — Draft and Cancelled never count; once an
 * invoice is raised to the client, it is treated as collected for this
 * PMO's summary purposes, same as Paid always has been.
 *
 * Outstanding = Invoice Raised − Payment Received — the invoiced amount
 * that has NOT yet been counted as received. A Draft line counts toward
 * Invoice Raised but not Payment Received, so it stays fully Outstanding
 * until it reaches Raised / Submitted or Paid; a Cancelled line drops out
 * of both, so it contributes nothing (not even to Outstanding). This is
 * a distinct concept from "Balance to Invoice" (pendingDue) — Contract
 * Value minus Invoice Raised, i.e. the part of the contract not yet
 * invoiced at all — and from Work Order Value, which this function never
 * reads for either figure.
 *
 * Deliberately never reads project.workOrderValue(INR) or the standalone
 * Invoices module — those are a different concept (operational Project
 * Status) or unrelated legacy/parallel data.
 *
 * The one narrow exception is Next Payment's due date: invoice lines don't
 * carry their own due date, so the nearest Payment Milestone due date is used
 * — but only while the project isn't fully invoiced yet (see rule below).
 */
export function getProjectCommercialSummary(
  project: Project
): ProjectCommercialSummary {
  const invoiceItems = Array.isArray(project.invoiceItems)
    ? project.invoiceItems
    : [];

  const projectValueINR = getTotalWorkPackageValue(invoiceItems);
  const totalInvoiceRaised = Math.min(
    getTotalInvoiceRaised(invoiceItems),
    projectValueINR
  );

  const pendingDue = Math.max(
    getBalanceAmount(projectValueINR, totalInvoiceRaised),
    0
  );
  const totalPaymentReceived = Math.min(
    getTotalPaymentReceived(invoiceItems),
    totalInvoiceRaised
  );
  // Outstanding — invoiced amount not yet counted as received. See this
  // function's own doc comment for why this is Invoice Raised minus
  // Payment Received, never Work Order Value minus Payment Received, and
  // never the same as Balance to Invoice (pendingDue above).
  const outstandingCollection = Math.max(totalInvoiceRaised - totalPaymentReceived, 0);
  const invoiceCompletionPercent = Math.min(
    Math.max(
      getInvoiceCompletionPercentage(projectValueINR, totalInvoiceRaised),
      0
    ),
    100
  );
  const invoicesRaisedCount = getInvoiceCount(invoiceItems);

  let invoiceStatus: ProjectInvoiceStatus;
  if (totalInvoiceRaised <= 0) {
    invoiceStatus = "Not Started";
  } else if (totalInvoiceRaised >= projectValueINR) {
    invoiceStatus = "Completed";
  } else {
    invoiceStatus = "Pending";
  }

  let nextPaymentDate = "-";
  let nextPaymentAmount = 0;
  let nextPaymentDaysLeft: number | null = null;
  let nextPaymentStatus: "Upcoming" | "Today" | "Overdue" | null = null;

  // Never surface a payment due date once the project is fully invoiced.
  if (invoiceStatus !== "Completed") {
    const next = getNextPayment(project);

    if (next) {
      nextPaymentDate = next.dueDate;
      nextPaymentAmount = next.amount;
      nextPaymentDaysLeft = next.daysLeft;
      nextPaymentStatus = next.status;
    }
  }

  return {
    projectValueINR,
    totalInvoiceRaised,
    pendingDue,
    totalPaymentReceived,
    outstandingCollection,
    invoiceCompletionPercent,
    invoiceStatus,
    invoicesRaisedCount,
    nextPaymentDate,
    nextPaymentAmount,
    nextPaymentDaysLeft,
    nextPaymentStatus,
  };
}

/** Is this payment milestone referenced by any non-cancelled invoice line across the project's activities? */
export function isMilestoneBilled(project: Project, milestoneId: string): boolean {
  const invoiceItems = Array.isArray(project.invoiceItems) ? project.invoiceItems : [];

  return invoiceItems.some((item) =>
    (Array.isArray(item.invoices) ? item.invoices : []).some(
      (line) => line.milestoneId === milestoneId && line.status !== "Cancelled"
    )
  );
}
