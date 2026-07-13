/** How a billing progress entry's amount was derived — see BillingProgressDrawer. */
export type BillingMethod = "quantity" | "milestone" | "manhour" | "others";

export interface InvoiceEntry {
  id: string;

  billingMethod: BillingMethod;

  /** Auto-recorded (today's date) — no longer entered manually. */
  invoiceDate: string;

  /** The calculated invoice amount for this progress increment (INR). */
  invoiceAmountINR: number;

  /** Quantity covered by this entry — only set when billingMethod is "quantity". */
  quantityBilled?: number;

  /** Hours covered by this entry — only set when billingMethod is "manhour". */
  hoursBilled?: number;

  /** Payment milestone billed against — only set when billingMethod is "milestone". */
  milestoneId?: string;
  milestoneLabel?: string;
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
