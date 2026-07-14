/**
 * A Quantity Based Billing entry — physical engineering progress recorded
 * against one activity. Completely independent of Payment Milestone billing
 * (see types/MilestoneBilling.ts) — never merge the two.
 */
export interface InvoiceEntry {
  id: string;

  /** Auto-recorded (today's date) — no longer entered manually. */
  invoiceDate: string;

  /** Quantity completed and billed in this entry. */
  quantityBilled: number;

  /** quantityBilled × the activity's unit rate at the time of billing (INR). */
  invoiceAmountINR: number;
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

  invoices: InvoiceEntry[];
}
