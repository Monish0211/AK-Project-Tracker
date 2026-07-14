import type { InvoiceItem } from "../types/InvoiceItem";
import type { Project } from "../types/Project";
import { getNextPayment } from "../utils/paymentUtils";
import { getTotalMilestoneBilled } from "./milestoneBillingService";

export type InvoiceStatus = "Pending" | "Partially Invoiced" | "Completed";

export function calculateTotalPrice(
  unitPrice: number,
  qty: number
): number {
  return unitPrice * qty;
}

export function getInvoiceRaisedAmount(item: InvoiceItem): number {
  const invoices = Array.isArray(item.invoices) ? item.invoices : [];

  return invoices.reduce(
    (sum, invoice) => sum + invoice.invoiceAmountINR,
    0
  );
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

export function getInvoiceCount(items: InvoiceItem[]): number {
  const safeItems = Array.isArray(items) ? items : [];

  return safeItems.reduce(
    (count, item) =>
      count + (Array.isArray(item.invoices) ? item.invoices.length : 0),
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
  /** Balance not yet invoiced. Never negative. */
  pendingDue: number;
  /** Same basis as pendingDue — Invoice History does not track per-invoice payment collection. */
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
 * Invoice Status). Combines BOTH independent billing tracks — Quantity Based
 * Billing (project.invoiceItems) and Payment Milestone Billing
 * (project.milestoneBillings) — into one project-wide total, so every page
 * (Repository, Dashboard, View Project, Edit Project) shows a consistent
 * combined figure. The two tracks are still calculated completely separately
 * (see quantityBillingService.ts / milestoneBillingService.ts) — only their
 * resulting totals are added together here, never their calculation logic.
 *
 * Deliberately never reads project.workOrderValue(INR), payment-received
 * fields, or the standalone Invoices module — those are a different concept
 * (operational Project Status) or unrelated legacy/parallel data.
 *
 * The one narrow exception is Next Payment's due date: neither billing track
 * has a per-entry due date, so the nearest Payment Milestone due date is used
 * — but only while the project isn't fully invoiced yet (see rule below).
 */
export function getProjectCommercialSummary(
  project: Project
): ProjectCommercialSummary {
  const invoiceItems = Array.isArray(project.invoiceItems)
    ? project.invoiceItems
    : [];

  const projectValueINR = getTotalWorkPackageValue(invoiceItems);

  // Quantity Based Billing and Payment Milestone Billing are two independent
  // ways of measuring progress against the SAME Work Order Value — never
  // additive. Whichever track has billed further represents the project's
  // actual commercial progress; the other track's amount must not be summed
  // on top of it (that would double-count the same work).
  const quantityBasedTotal = getTotalInvoiceRaised(invoiceItems);
  const milestoneBasedTotal = getTotalMilestoneBilled(project);
  const totalInvoiceRaised = Math.min(
    Math.max(quantityBasedTotal, milestoneBasedTotal),
    projectValueINR
  );

  const pendingDue = Math.max(
    getBalanceAmount(projectValueINR, totalInvoiceRaised),
    0
  );
  const invoiceCompletionPercent = Math.min(
    Math.max(
      getInvoiceCompletionPercentage(projectValueINR, totalInvoiceRaised),
      0
    ),
    100
  );
  const invoicesRaisedCount =
    getInvoiceCount(invoiceItems) + (project.milestoneBillings?.length ?? 0);

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
    outstandingCollection: pendingDue,
    invoiceCompletionPercent,
    invoiceStatus,
    invoicesRaisedCount,
    nextPaymentDate,
    nextPaymentAmount,
    nextPaymentDaysLeft,
    nextPaymentStatus,
  };
}
