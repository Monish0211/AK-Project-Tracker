import type { InvoiceItem, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import type { Project } from "../../../../types/Project";
import {
  getInvoiceRaisedAmount,
  getInvoiceStatus,
  getProjectCommercialSummary,
  type InvoiceStatus,
} from "../../../../services/invoiceProgressService";

export type { InvoiceStatus };

/**
 * This file is the Invoice Calculation Service — the ONLY place invoice,
 * milestone, and billing figures are computed. Components must call one of
 * the functions here (or the public API grouped at the bottom of this file)
 * rather than re-deriving a formula inline. `round` is exported so any
 * caller that still needs to combine a raw number (e.g. a form input) rounds
 * the exact same way as every other figure in the app — no second rounding
 * idiom anywhere else.
 */
export const round = (value: number): number => Math.round(value * 100) / 100;

export interface BillingMilestone {
  id: string;
  label: string;
  percent: number;
}

export function getMilestonesForProject(project: Project): BillingMilestone[] {
  const milestones = project.paymentMilestones ?? [];
  const effective = project.paymentType === "Single" ? milestones.slice(0, 1) : milestones;

  return effective.map((milestone, index) => ({
    id: milestone.id,
    label: milestone.milestoneName?.trim() || `Milestone ${index + 1}`,
    percent: milestone.paymentPercentage || 0,
  }));
}

export function findMilestone(milestones: BillingMilestone[], milestoneId: string | undefined): BillingMilestone | undefined {
  if (!milestoneId) return undefined;
  return milestones.find((m) => m.id === milestoneId);
}

/**
 * Single Source of Truth for Quantity Progress: Completed Qty is ALWAYS the
 * sum of Quantity Consumed recorded on saved, non-cancelled invoice lines
 * for this activity — never a separate PM/Quantity-module field, never
 * re-derived from Milestone Summary, never temporary UI state. This applies
 * uniformly to every activity, whether its contract quantity is billed
 * progressively (Packages, Drawings, KM — Accounts enters Bill Qty
 * directly) or via milestones (Qty + Milestone — Quantity Consumed is
 * auto-calculated and persisted at save time, see getQuantityConsumed).
 * There is only one Quantity Progress engine.
 */
export function getActivityCompletedQty(item: InvoiceItem): number {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  return round(
    lines
      .filter((line) => line.status !== "Cancelled")
      .reduce((sum, line) => sum + line.quantityBilled, 0)
  );
}

/** Always the complement of Completed Qty — Remaining = Contract Qty − Completed Qty — so the two never drift apart or contradict each other. */
export function getActivityRemainingQty(item: InvoiceItem): number {
  return Math.max(round(item.qty - getActivityCompletedQty(item)), 0);
}

/**
 * The Bill Qty availability pool for Quantity-Driven billing (activities
 * with NO configured payment milestones, where Accounts manually enters how
 * much to bill each time): Available = Contract Qty − Already Invoiced Qty,
 * one pool shared across every invoice raised against this activity.
 * `excludeLineId` lets an edit-in-progress leave its own prior quantity out
 * of "already invoiced" so editing a line back to its own current value is
 * never blocked.
 */
export function getAvailableQuantity(item: InvoiceItem, excludeLineId?: string): number {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  const alreadyInvoiced = round(
    lines
      .filter((line) => line.status !== "Cancelled" && line.id !== excludeLineId)
      .reduce((sum, line) => sum + (line.quantityBilled || 0), 0)
  );

  return Math.max(round(item.qty - alreadyInvoiced), 0);
}

export function getBillingTypeLabel(project: Project): string {
  return getMilestonesForProject(project).length > 0 ? "Qty + Milestone" : "Quantity";
}

export type MilestoneRowStatus = "completed" | "partial" | "pending";

export interface MilestoneSummaryRow {
  id: string;
  label: string;
  percent: number;
  milestoneValue: number;
  alreadyInvoiced: number;
  balance: number;
  status: MilestoneRowStatus;
}

/** Milestone Value = Work Order Value × Milestone % — the ONE formula for this, shared by Milestone Summary, Raise Invoice, and Invoice History. Never re-derive this inline. */
export function getMilestoneValue(totalPrice: number, milestonePercent: number): number {
  return round(totalPrice * (milestonePercent / 100));
}

/**
 * Quantity Consumed = Contract Qty × Milestone % — the same milestone % that
 * determines the invoice amount also determines the quantity consumed, for
 * every activity billed under a Qty + Milestone schedule. Computed once when
 * a milestone invoice is saved and persisted onto that invoice line
 * (InvoiceLine.quantityBilled) — never recalculated live from the milestone
 * definition afterwards, so a later change to the milestone % or contract
 * qty never rewrites the history of what was actually billed.
 */
export function getQuantityConsumed(contractQty: number, milestonePercent: number): number {
  return round(contractQty * (milestonePercent / 100));
}

/** Commercial Adjustment = Invoice Amount (as entered/edited) − System-Calculated Amount. The ONE formula for this, shared by create and edit flows. */
export function getCommercialAdjustment(invoiceAmount: number, calculatedAmount: number): number {
  return round(invoiceAmount - calculatedAmount);
}

/**
 * One row per configured milestone for an activity.
 * Calculates Milestone Value = Contract Value × Milestone %
 * Calculates Already Invoiced = Sum of Invoice Amount INR for this milestone
 * Calculates Balance = Milestone Value - Already Invoiced
 */
export function getMilestoneSummaryForActivity(
  item: InvoiceItem,
  milestones: BillingMilestone[]
): MilestoneSummaryRow[] {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];

  return milestones.map((milestone) => {
    const milestoneValue = getMilestoneValue(item.totalPrice, milestone.percent);
    const alreadyInvoiced = round(
      lines
        .filter((line) => line.status !== "Cancelled" && line.milestoneId === milestone.id)
        .reduce((sum, line) => sum + (line.invoiceAmountINR || 0), 0)
    );
    const balance = Math.max(round(milestoneValue - alreadyInvoiced), 0);

    let status: MilestoneRowStatus = "pending";
    if (alreadyInvoiced >= milestoneValue - 0.01 && milestoneValue > 0) {
      status = "completed";
    } else if (alreadyInvoiced > 0) {
      status = "partial";
    }

    return {
      id: milestone.id,
      label: milestone.label,
      percent: milestone.percent,
      milestoneValue,
      alreadyInvoiced,
      balance,
      status,
    };
  });
}

export function calculateLineAmount(quantity: number, unitPrice: number): number {
  return round(quantity * (unitPrice || 0));
}

export function getPreviousRaisedAmountForMilestone(
  item: InvoiceItem,
  milestoneId?: string,
  excludeLineId?: string
): number {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  return round(
    lines
      .filter(
        (line) =>
          line.status !== "Cancelled" &&
          line.id !== excludeLineId &&
          (milestoneId ? line.milestoneId === milestoneId : !line.milestoneId)
      )
      .reduce((sum, line) => sum + (line.invoiceAmountINR || 0), 0)
  );
}

export type CommercialLineBillingStatus =
  | "Not Eligible"
  | "Eligible"
  | "Partially Billed"
  | "Fully Billed";

export function getCommercialBillingStatus(
  _completedQty: number,
  eligibleAmount: number,
  totalBilledAmount: number
): CommercialLineBillingStatus {
  if (eligibleAmount <= 0) return "Not Eligible";
  if (totalBilledAmount >= eligibleAmount - 0.01) return "Fully Billed";
  if (totalBilledAmount > 0) return "Partially Billed";
  return "Eligible";
}

/**
 * Accounts reads Milestone Value/Balance off the Lakh/Crore display
 * (`formatBusinessINR`, 2 decimal places) — never the exact rupee figure.
 * At that precision, "₹2.22 L" represents anything from ₹2,21,500 to
 * ₹2,22,500; typing the "obvious" rupee equivalent of what's on screen can
 * legitimately land up to half of that display's rounding step above the
 * exact balance. That is not an over-billing attempt, so it must not be
 * rejected — this returns exactly that step, matching `formatBusinessINR`'s
 * own bucket boundaries so the tolerance is never wider than the ambiguity
 * the display itself introduced.
 */
export function getBalanceValidationTolerance(balanceAmount: number): number {
  const abs = Math.abs(balanceAmount);
  if (abs >= 1_00_00_000) return 50_000; // 2-decimal Crore display
  if (abs >= 1_00_000) return 500; // 2-decimal Lakh display
  if (abs >= 1_000) return 5; // 2-decimal Thousand display
  return 0.01;
}

export interface MilestoneBillingState {
  milestoneValue: number;
  alreadyInvoiced: number;
  balanceAmount: number;
  /** Invoice Amount must be rejected only when it exceeds THIS, not balanceAmount directly — see getBalanceValidationTolerance. */
  validationLimit: number;
  status: CommercialLineBillingStatus;
}

/**
 * Single source of truth for Commercial Milestone Billing: the displayed
 * Balance Amount, the Invoice Amount validation ceiling, and the Status
 * badge must all read from this one calculation — the UI and the
 * validation must both consume this, never re-derive their own ceiling.
 * `alreadyInvoiced` is the amount from SAVED invoices only — never include
 * the amount currently being typed into the draft Invoice Amount field, or
 * the balance (and status) would flip to "paid" before the invoice is
 * actually saved.
 */
export function getMilestoneBillingState(milestoneValue: number, alreadyInvoiced: number): MilestoneBillingState {
  const balanceAmount = Math.max(round(milestoneValue - alreadyInvoiced), 0);
  const validationLimit = round(balanceAmount + getBalanceValidationTolerance(balanceAmount));
  const status: CommercialLineBillingStatus =
    milestoneValue <= 0 ? "Not Eligible" : getCommercialBillingStatus(0, milestoneValue, alreadyInvoiced);
  return { milestoneValue, alreadyInvoiced, balanceAmount, validationLimit, status };
}

/**
 * The Raise Invoice drawer's two display layouts. Determined by ONE fact,
 * never a keyword guess about the activity's description/UOM: does this
 * project have payment milestones configured at all?
 *  - Milestones configured (Billing Type = "Qty + Milestone"): every
 *    activity on the project bills the same way — Milestone Value / Already
 *    Invoiced / Balance, no manual quantity entry. The milestone % that sets
 *    the invoice amount also sets the quantity consumed (getQuantityConsumed).
 *  - No milestones configured (Billing Type = "Quantity"): Accounts enters
 *    Bill Qty directly against the Available Qty pool — unrelated to any
 *    milestone %, since there isn't one.
 * This is the ONLY classifier for invoice layout/formula — there is no
 * second, activity-level classifier that could disagree with it.
 */
export type InvoiceWorkflowMode = "quantity_driven" | "commercial_milestone";

export function getInvoiceWorkflowMode(milestones: BillingMilestone[]): InvoiceWorkflowMode {
  return milestones.length > 0 ? "commercial_milestone" : "quantity_driven";
}

export const INVOICE_LINE_STATUS_LABEL: Record<InvoiceLineStatus, string> = {
  Pending: "Pending",
  Paid: "Paid",
  Cancelled: "Cancelled",
};

export function suggestNextInvoiceNumber(project: Project): string {
  const totalLines = (Array.isArray(project.invoiceItems) ? project.invoiceItems : []).reduce(
    (count, item) => count + (Array.isArray(item.invoices) ? item.invoices.length : 0),
    0
  );
  const prefix = project.prNo?.trim() || "INV";
  return `${prefix}-INV-${String(totalLines + 1).padStart(3, "0")}`;
}

export { getInvoiceRaisedAmount };

// =============================================================================
// Invoice Calculation Service — Public API
// =============================================================================
// Every screen in the Invoice module (Activities Billing, Raise Invoice,
// Milestone Summary, Invoice History, KPI Cards) must read its figures from
// one of the functions below rather than composing the primitives above
// itself. This is the single entry point the architecture is built around:
//   - Quantity Progress (Contract/Completed/Remaining Qty) → always the sum
//     of persisted invoice records (getActivityCompletedQty) — never a
//     separate progress engine, never derived from Milestone Summary or
//     temporary UI state → calculateExecutionProgress.
//   - Payments Module data (milestone description/%/sequence) × Invoice
//     History → calculateMilestoneFinancials.
//   - Project-level KPIs (Invoice Raised, Balance, Outstanding, Payment
//     Received) → calculateProjectKPIs.
//   - Per-activity invoice status → calculateInvoiceStatus.
// No React component in this module should perform financial calculations
// directly — it should only render what these return.

export interface ExecutionProgress {
  contractQty: number;
  completedQty: number;
  remainingQty: number;
  uom: string;
  progressPercent: number;
}

/**
 * Quantity Progress — Contract/Completed/Remaining Qty and UOM. Completed
 * Qty is always SUM(Quantity Consumed) from saved, non-cancelled invoice
 * lines for this activity (getActivityCompletedQty) — the single Quantity
 * Progress engine, whether billing is progressive (Bill Qty entered
 * directly) or milestone-driven (Quantity Consumed auto-calculated from
 * Milestone % and persisted at save time).
 */
export function calculateExecutionProgress(item: InvoiceItem): ExecutionProgress {
  const completedQty = getActivityCompletedQty(item);
  const remainingQty = getActivityRemainingQty(item);
  const progressPercent = item.qty > 0 ? Math.min(round((completedQty / item.qty) * 100), 100) : 0;
  return { contractQty: item.qty, completedQty, remainingQty, uom: item.uom, progressPercent };
}

export interface MilestoneFinancials {
  workflowMode: InvoiceWorkflowMode;
  milestones: MilestoneSummaryRow[];
}

/**
 * Payments Module milestone definitions (description/%/sequence) combined
 * with Invoice History → the full per-milestone financial picture and the
 * billing-mode classification that decides the Raise Invoice layout. Single
 * source of truth for Milestone Summary, the Raise Invoice dialog, and
 * Invoice History's milestone display.
 */
export function calculateMilestoneFinancials(project: Project, item: InvoiceItem): MilestoneFinancials {
  const milestones = getMilestonesForProject(project);
  return { workflowMode: getInvoiceWorkflowMode(milestones), milestones: getMilestoneSummaryForActivity(item, milestones) };
}

/**
 * Project-level KPIs (Invoice Raised, Balance to Invoice, Outstanding,
 * Payment Received, Invoice Completion %, Invoice Status). Thin alias of
 * `getProjectCommercialSummary` — the underlying calculation is shared
 * app-wide (Dashboard, Reports, View Project), not reimplemented here.
 */
export const calculateProjectKPIs = getProjectCommercialSummary;

/** Per-activity invoice status (Pending/Partially Invoiced/Completed). Thin alias of `getInvoiceStatus` — same reasoning as calculateProjectKPIs. */
export const calculateInvoiceStatus = getInvoiceStatus;
