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

/** Sums a line's billed amount across only its Paid lines — the "payment recorded" signal in this ledger (there is no separate payment-entry object; marking a line Paid via Edit Invoice IS recording the payment). */
export function getPaymentReceivedAmount(item: InvoiceItem): number {
  const invoices = Array.isArray(item.invoices) ? item.invoices : [];

  return invoices
    .filter((invoice) => invoice.status === "Paid")
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
  /** Balance not yet invoiced (Contract Value − Invoice Raised, "Balance to Invoice"). Never negative. */
  pendingDue: number;
  /** Sum of every invoice line marked Paid — recording a payment. */
  totalPaymentReceived: number;
  /** Invoice Raised − Payment Received ("Outstanding" — invoiced but not yet collected). Never negative. */
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
 * likewise derived from this same ledger (every line marked Paid) rather
 * than the legacy, Excel-import-only project.paymentReceivedINR field, so
 * it updates the instant a line's status changes — no separate payment
 * record to keep in sync.
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
