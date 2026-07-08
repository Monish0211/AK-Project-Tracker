import type { InvoiceItem } from "../types/InvoiceItem";

export type InvoiceStatus = "Pending" | "Partially Invoiced" | "Completed";

export function calculateTotalPrice(
  unitPrice: number,
  numberOfDays: number
): number {
  return unitPrice * numberOfDays;
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
