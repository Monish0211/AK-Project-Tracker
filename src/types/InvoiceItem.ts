/**
 * One billing line raised against an Activity (InvoiceItem). The Invoice
 * Management module's single billing primitive — supports both the PMO
 * team's quantity-driven workflow and the Accounts team's need to bill
 * without being forced into a payment-milestone percentage.
 *
 * A milestone reference is always OPTIONAL — see milestoneId/milestoneName.
 * When absent, `description` carries the free-text billing reason instead
 * (a completed deliverable, a manual billing stage, etc).
 */
export type InvoiceLineStatus = "Pending" | "Paid" | "Cancelled";

/**
 * Project-wide switch for how invoices are raised. "lump_sum" bills purely
 * off Payment Milestone percentages of an activity's Contract Value — no
 * quantity is ever entered. "invoice_line_items" is today's existing
 * quantity-driven / commercial-milestone workflow, unchanged.
 */
export type InvoiceMethod = "lump_sum" | "invoice_line_items";

export interface InvoiceLine {
  id: string;

  invoiceNo: string;
  invoiceDate: string;

  /** Optional reference into project.paymentMilestones — never mandatory. */
  milestoneId?: string;
  /** Snapshotted at billing time so a later rename of the milestone doesn't rewrite history. */
  milestoneName?: string;

  /** Free-text billing description — used when no milestone is referenced, or to add context alongside one. */
  description?: string;

  /** Quantity completed and billed in this line. */
  quantityBilled: number;

  /** Unit Rate at the time this line was raised — snapshotted so a later Unit Rate revision in the Quantity module never rewrites what this historical invoice actually billed at. */
  unitPriceINR?: number;

  /** Calculated amount before commercial adjustment = Qty Billed × Unit Rate */
  calculatedAmountINR?: number;

  /** Actual invoice amount entered by Accounts after commercial adjustment */
  invoiceAmountINR: number;

  /** Commercial adjustment = invoiceAmountINR - calculatedAmountINR (e.g. -189 or +500) */
  commercialAdjustmentINR?: number;

  clientReference?: string;
  remarks?: string;

  status: InvoiceLineStatus;
  createdBy: string;
}

export interface InvoiceItem {
  id: string;

  // Description, Qty, UOM and Unit Price are derived from the matching
  // Quantity Details activity (same id) and kept in sync automatically —
  // see services/invoiceSyncService.ts.
  description: string;

  qty: number;

  uom: string;

  unitPrice: number;

  totalPrice: number;

  invoices: InvoiceLine[];
}
