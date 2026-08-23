/**
 * Single source of truth for "how much of a QuantityItem has been
 * invoiced" — derived from real InvoiceLine.quantityBilled activity, never
 * a separately-stored, independently-mutable field. QuantityItem.invoiceQty/
 * pendingQty used to be plain persisted columns that only the Quantity
 * module's own Create/Update ever wrote; they were never updated when an
 * InvoiceLine was created/edited/deleted, so they drifted from real
 * invoicing activity starting with the very first invoice ever raised
 * (Priority #3 audit, confirmed live against real data). Removed from the
 * schema; every caller now computes them fresh via this function.
 *
 * billedQty must already exclude Cancelled lines — same rule the existing
 * frontend Invoice calculations use (InvoiceCalculations.ts's
 * getActivityCompletedQty / calculateCumulativeProgress) and Reports'
 * useReportsData.ts already use; not a new business rule.
 *
 * LUMP SUM is a deliberate, pre-existing exception: its pending-quantity
 * ceiling is always 1 (fully billed vs. not), never the item's own woQty —
 * preserved exactly as-is, not reinterpreted.
 */
export function computeInvoiceProgress(
  woQty: number,
  uom: string,
  billedQty: number
): { invoiceQty: number; pendingQty: number } {
  const isLumpSum = uom.trim().toUpperCase() === "LUMP SUM";
  const invoiceQty = billedQty;
  const pendingQty = isLumpSum ? Math.max(1 - invoiceQty, 0) : Math.max(woQty - invoiceQty, 0);
  return { invoiceQty, pendingQty };
}
