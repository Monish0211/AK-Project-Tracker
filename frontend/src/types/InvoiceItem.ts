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
/**
 * Values are stable, backend-friendly identifiers (no spaces/slashes) meant
 * to map 1:1 onto a future `invoiceStatus` database column — display labels
 * (e.g. "Raised" → "Raised / Submitted") live separately in
 * INVOICE_LINE_STATUS_LABEL (InvoiceCalculations.ts), never inline in the
 * enum itself.
 *
 * Draft — being prepared, not yet submitted to the client.
 * Raised — submitted/issued to the client, awaiting payment.
 * PartiallyPaid — some but not all of the invoiced amount has been received.
 * Paid — fully settled.
 * Cancelled — voided, excluded from every raised/outstanding total.
 *
 * The Raise Invoice popup only ever offers Draft/Raised/Cancelled — an
 * invoice cannot be (partially) paid the moment it's created. PartiallyPaid
 * and Paid are only reachable later, via Edit Invoice.
 */
export type InvoiceLineStatus = "Draft" | "Raised" | "PartiallyPaid" | "Paid" | "Cancelled";

/**
 * Project-wide switch for how invoices are raised. "lump_sum" bills purely
 * off Payment Milestone percentages of an activity's Contract Value — no
 * quantity is ever entered. "invoice_line_items" is today's existing
 * quantity-driven / commercial-milestone workflow, unchanged. "mlmp"
 * (Multiple Line Items – Multiple Payment Terms) auto-generates one SET per
 * unit of an activity's quantity (Qty 2 SET → SET 1, SET 2), each cloned
 * from the project's EXISTING Payment Milestones (Project.paymentMilestones
 * — the same source Lump Sum already uses) and tracked independently per
 * SET — see InvoiceLine.setIndex. There is no separate MLMP milestone
 * template: reusing Payment Milestones is deliberate, so there is only ever
 * one place to configure a project's payment stages. "amount_based" bills
 * directly against an activity's remaining Contract Value — no quantity, no
 * milestone at all — for consultancy/retainer/PMC-style contracts; each line
 * is just a free-entry amount capped at that activity's own balance.
 */
export type InvoiceMethod = "lump_sum" | "invoice_line_items" | "mlmp" | "amount_based";

export interface InvoiceLine {
  id: string;

  invoiceNo: string;
  invoiceDate: string;

  /** Optional reference into project.paymentMilestones — never mandatory. Shared by Lump Sum (one line per milestone) and MLMP (one line per SET × milestone). */
  milestoneId?: string;
  /** Snapshotted at billing time so a later rename of the milestone doesn't rewrite history. */
  milestoneName?: string;

  /** MLMP only — the 1-based SET number this line bills against (Qty 2 SET → 1 or 2). Undefined for every other method/line. */
  setIndex?: number;

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
