import type { InvoiceItem } from "../types/InvoiceItem";

/**
 * Quantity Based Billing — tracks physical engineering progress per activity.
 * Completely independent of Payment Milestone (commercial) billing — see
 * services/milestoneBillingService.ts. Never merge the two calculations.
 */

/** Quantity already completed and billed against this activity, across all past invoices. */
export function getCompletedQty(item: InvoiceItem): number {
  const invoices = Array.isArray(item.invoices) ? item.invoices : [];

  return invoices.reduce((sum, invoice) => sum + (invoice.quantityBilled || 0), 0);
}

/** Quantity left to bill, accounting for an in-progress (not yet saved) current entry. */
export function getRemainingQty(item: InvoiceItem, currentEntryQty: number = 0): number {
  const remaining = item.qty - getCompletedQty(item) - currentEntryQty;

  return Math.max(remaining, 0);
}

/** The invoice amount for a quantity entry — qty × unit rate. Never entered manually. */
export function calculateQuantityInvoiceAmount(
  unitPrice: number,
  currentEntryQty: number
): number {
  return unitPrice * currentEntryQty;
}
