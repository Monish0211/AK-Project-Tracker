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

/** Quantity already billed against this activity via the "quantity" billing method. */
export function getQuantityBilled(item: InvoiceItem): number {
  const invoices = Array.isArray(item.invoices) ? item.invoices : [];

  return invoices.reduce((sum, invoice) => sum + (invoice.quantityBilled || 0), 0);
}

/** Hours already billed against this activity via the "manhour" billing method. */
export function getHoursBilled(item: InvoiceItem): number {
  const invoices = Array.isArray(item.invoices) ? item.invoices : [];

  return invoices.reduce((sum, invoice) => sum + (invoice.hoursBilled || 0), 0);
}

/** Payment milestone ids already billed against any activity in the project. */
export function getBilledMilestoneIds(items: InvoiceItem[]): Set<string> {
  const ids = new Set<string>();
  const safeItems = Array.isArray(items) ? items : [];

  safeItems.forEach((item) => {
    (Array.isArray(item.invoices) ? item.invoices : []).forEach((invoice) => {
      if (invoice.milestoneId) {
        ids.add(invoice.milestoneId);
      }
    });
  });

  return ids;
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
 * Invoice Status). Derived entirely from Invoice History (project.invoiceItems)
 * so every page — Repository, Dashboard, View Project, Edit Project — shows
 * identical numbers to the Invoice Progress Tracker tab.
 *
 * Deliberately never reads project.workOrderValue(INR), payment-received
 * fields, or the standalone Invoices module — those are a different concept
 * (operational Project Status) or unrelated legacy/parallel data.
 *
 * The one narrow exception is Next Payment's due date: Invoice History has no
 * per-invoice due date, so the nearest Payment Milestone due date is used —
 * but only while the project isn't fully invoiced yet (see rule below).
 */
export function getProjectCommercialSummary(
  project: Project
): ProjectCommercialSummary {
  const invoiceItems = Array.isArray(project.invoiceItems)
    ? project.invoiceItems
    : [];

  const projectValueINR = getTotalWorkPackageValue(invoiceItems);
  const totalInvoiceRaised = getTotalInvoiceRaised(invoiceItems);
  const pendingDue = Math.max(
    getBalanceAmount(projectValueINR, totalInvoiceRaised),
    0
  );
  const invoiceCompletionPercent = getInvoiceCompletionPercentage(
    projectValueINR,
    totalInvoiceRaised
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
