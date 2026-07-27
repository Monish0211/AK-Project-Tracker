/**
 * PROTOTYPE ONLY — Quantity-Based Invoice Tracking preview.
 *
 * Every type here is local to this `prototype/` folder. None of them extend,
 * modify, or get written back to the real persisted data model
 * (types/Project.ts, types/InvoiceItem.ts, types/QuantityItem.ts). Deleting
 * this whole folder removes the prototype's data shapes with it.
 *
 * Milestones are NEVER hardcoded here. `PrototypeMilestoneTerm` mirrors
 * whatever is actually configured on `project.paymentMilestones` (the
 * Payments tab) — see prototypeCalculations.ts's getProjectMilestones(),
 * the single place that reads that source of truth. A project with a single
 * "100% Final Report" milestone, a "50/50 Draft/Final" split, or a
 * four-milestone "20/30/30/20" schedule all flow through the exact same
 * types below — only the array length differs.
 */

/** id = the real project.paymentMilestones[].id — never a fixed "draft"/"final" key. */
export interface PrototypeMilestoneTerm {
  id: string;
  label: string;
  percent: number;
}

export type PrototypeInvoiceStatus = "pending" | "paid" | "cancelled";

export const PROTOTYPE_INVOICE_STATUS_LABEL: Record<PrototypeInvoiceStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  cancelled: "Cancelled",
};

export interface PrototypeInvoiceEntry {
  id: string;
  activityId: string;
  invoiceNo: string;
  invoiceDate: string;
  /** References project.paymentMilestones[].id — the milestone's live name/percent is always looked up fresh, never snapshotted here. */
  milestoneId: string;
  quantity: number;
  amount: number;
  remarks: string;
  fileName?: string;
  /**
   * A Cancelled invoice keeps its record (for audit visibility in Billing
   * History) but is excluded from completed quantity everywhere — matching
   * the production "Void/Cancel" semantics noted for the real ERP flow.
   */
  status: PrototypeInvoiceStatus;
}

/** Simulated quantity ledger for one activity — completed qty keyed by milestone id, in-memory only, never persisted. Supports any number of milestones. */
export type PrototypeActivityLedger = Record<string, number>;
