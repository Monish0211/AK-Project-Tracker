import type { InvoiceItem, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import type { Project } from "../../../../types/Project";
import { getInvoiceRaisedAmount } from "../../../../services/invoiceProgressService";

const round = (value: number): number => Math.round(value * 100) / 100;

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

// ---------------------------------------------------------------------------
// Quantity Consumption — Progressive vs Reference
// ---------------------------------------------------------------------------

/**
 * Two ways an activity's contract quantity behaves when milestones bill
 * against it:
 *  - "progressive": the deliverable is physically consumed in parts (e.g.
 *    Packages, Drawings, Pipe Joints, Survey Points, KM, Cable Length).
 *    Every milestone draws from ONE shared remaining pool.
 *  - "reference": the quantity represents one fixed effort/deliverable that
 *    every milestone (Draft, Final, Submission, Approval, Commissioning,
 *    Acceptance...) is simply a payment stage FOR (e.g. a Study, a
 *    Consultancy engagement, a Visit, N Man-Days, N Sets). Billing one
 *    milestone never reduces what another milestone can reference.
 *
 * Never stored, never a UI toggle — determined automatically from the
 * activity's own description and UOM (never UOM alone) and, when that's
 * ambiguous, from whether the project's payment milestones read as named
 * stages of one deliverable rather than plain, unlabeled percentage splits.
 */
export type BillingQuantityMode = "progressive" | "reference";

const REFERENCE_ACTIVITY_KEYWORDS = [
  "hazop", "hazid", "sil study", "pulsation study", "pulsation", "consultancy",
  "consulting", "report submission", "visit", "visits", "engineering",
  "man-day", "man-days", "man day", "man days", "manday", "mandays",
  "man-hour", "man-hours", "man hour", "man hours", "manhour", "manhours",
  "study", "studies", "assessment", "audit", "set", "sets", "day", "days",
];

const PROGRESSIVE_ACTIVITY_KEYWORDS = [
  "package", "packages", "drawing", "drawings", "pipe joint", "pipe joints",
  "joint", "joints", "survey point", "survey points", "cable length", "cable",
  "cables", "kilometer", "kilometre", "kilometers", "kilometres", "km",
  "meter", "meters", "metre", "metres", "weld", "welds",
];

/** Named stages of a single deliverable — their presence signals Reference mode when the activity's own description/UOM is ambiguous. */
const REFERENCE_MILESTONE_STAGE_KEYWORDS = [
  "draft", "final", "submission", "approval", "commissioning", "acceptance",
  "completion", "handover", "close-out", "closeout", "mobilization", "mobilisation",
  "demobilization", "demobilisation", "kick-off", "kickoff", "kom", "fat", "sat",
  "guarantee", "retention", "provisional",
];

/** Whole-word match only, so short tokens like "day"/"set"/"km" never false-positive inside unrelated words (e.g. "Sunday", "offset", "kilometer" already listed separately). */
function matchesKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`).test(lower);
  });
}

/**
 * Determines Progressive vs Reference for one activity. Checks the
 * activity's own description and UOM together first (the primary, most
 * reliable signal — never UOM in isolation); only falls back to inspecting
 * the milestone structure when neither clearly indicates either behaviour.
 */
export function inferBillingQuantityMode(item: InvoiceItem, milestones: BillingMilestone[]): BillingQuantityMode {
  const descriptionAndUom = `${item.description ?? ""} ${item.uom ?? ""}`;

  if (matchesKeyword(descriptionAndUom, REFERENCE_ACTIVITY_KEYWORDS)) return "reference";
  if (matchesKeyword(descriptionAndUom, PROGRESSIVE_ACTIVITY_KEYWORDS)) return "progressive";

  if (milestones.length > 1) {
    const stageNamedCount = milestones.filter((m) => matchesKeyword(m.label, REFERENCE_MILESTONE_STAGE_KEYWORDS)).length;
    if (stageNamedCount >= Math.ceil(milestones.length / 2)) return "reference";
  }

  return "progressive";
}

/**
 * Quantity Progress (Completed/Remaining) is project-execution data owned
 * entirely by the PM/Quantity module (QuantityItem.invoiceQty, matched by
 * activity id) — never billing data. The Invoice module is financial only:
 * creating, editing, or deleting an invoice must never change this number,
 * and it must never be inferred from `item.invoices`. It only changes when
 * the PM edits execution data on the Quantity tab; until that happens for a
 * given activity, this simply reports whatever is saved there today (0 by
 * default for a not-yet-started activity).
 */
export function getActivityCompletedQty(item: InvoiceItem, project: Project): number {
  const quantityItems = Array.isArray(project.quantityItems) ? project.quantityItems : [];
  const match = quantityItems.find((q) => q.id === item.id);
  return match?.invoiceQty ?? 0;
}

/** Always the complement of Completed Qty — Remaining = Contract Qty − Completed Qty — so the two never drift apart or contradict each other. */
export function getActivityRemainingQty(item: InvoiceItem, project: Project): number {
  return Math.max(round(item.qty - getActivityCompletedQty(item, project)), 0);
}

/**
 * THE single centralized source of truth for how much of an activity's
 * quantity is still available to bill — every call site (Activities table,
 * expanded row, Raise Invoice drawer) must route through this rather than
 * re-deriving the subtraction locally.
 *
 *   Progressive: Available = Contract Qty − Already Invoiced Qty (one pool
 *   shared across every milestone on this activity).
 *   Reference:   Available = Contract Qty, always — never reduced by any
 *   milestone's invoicing.
 *
 * `excludeLineId` lets an edit-in-progress leave its own prior quantity out
 * of "already invoiced" so editing a line back to its own current value is
 * never blocked.
 */
export function getAvailableQuantity(
  item: InvoiceItem,
  milestones: BillingMilestone[],
  excludeLineId?: string
): number {
  if (inferBillingQuantityMode(item, milestones) === "reference") {
    return item.qty;
  }

  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  const alreadyInvoiced = round(
    lines
      .filter((line) => line.status !== "Cancelled" && line.id !== excludeLineId)
      .reduce((sum, line) => sum + (line.quantityBilled || 0), 0)
  );

  return Math.max(round(item.qty - alreadyInvoiced), 0);
}

/** Reference mode only: has this exact milestone (or the no-milestone bucket, when milestoneId is undefined) already been invoiced by a non-cancelled line? */
export function isMilestoneAlreadyInvoiced(item: InvoiceItem, milestoneId: string | undefined, excludeLineId?: string): boolean {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  return lines.some(
    (line) => line.status !== "Cancelled" && line.id !== excludeLineId && line.milestoneId === milestoneId
  );
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
    const milestoneValue = round(item.totalPrice * (milestone.percent / 100));
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

export function calculateEligibleAmount(
  completedQty: number,
  unitPrice: number,
  milestonePercent: number = 100
): number {
  if (completedQty <= 0 || unitPrice <= 0 || milestonePercent <= 0) return 0;
  return round(completedQty * unitPrice * (milestonePercent / 100));
}

export function getPreviousBilledQtyForMilestone(
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
      .reduce((sum, line) => sum + (line.quantityBilled || 0), 0)
  );
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

export interface MilestoneBillingState {
  milestoneValue: number;
  alreadyInvoiced: number;
  balanceAmount: number;
  status: CommercialLineBillingStatus;
}

/**
 * Single source of truth for Commercial Milestone Billing: the displayed
 * Balance Amount, the Invoice Amount validation ceiling, and the Status
 * badge must all read from this one calculation. `alreadyInvoiced` is the
 * amount from SAVED invoices only — never include the amount currently
 * being typed into the draft Invoice Amount field, or the balance (and
 * status) would flip to "paid" before the invoice is actually saved.
 */
export function getMilestoneBillingState(milestoneValue: number, alreadyInvoiced: number): MilestoneBillingState {
  const balanceAmount = Math.max(round(milestoneValue - alreadyInvoiced), 0);
  const status: CommercialLineBillingStatus =
    milestoneValue <= 0 ? "Not Eligible" : getCommercialBillingStatus(0, milestoneValue, alreadyInvoiced);
  return { milestoneValue, alreadyInvoiced, balanceAmount, status };
}

export function getEditableMaxQuantity(item: InvoiceItem, excludeLineId?: string): number {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  const othersCompleted = lines
    .filter((line) => line.status !== "Cancelled" && line.id !== excludeLineId)
    .reduce((sum, line) => sum + line.quantityBilled, 0);

  return Math.max(round(item.qty - othersCompleted), 0);
}

export interface LinePreview {
  currentInvoiceAmount: number;
  remainingQty: number;
  remainingAmount: number;
}

export function getLinePreview(item: InvoiceItem, currentInvoiceQty: number, excludeLineId?: string): LinePreview {
  const maxQty = getEditableMaxQuantity(item, excludeLineId);
  const safeQty = Math.max(currentInvoiceQty, 0);
  const currentInvoiceAmount = calculateLineAmount(safeQty, item.unitPrice);
  const remainingQty = Math.max(round(maxQty - safeQty), 0);
  const remainingAmount = calculateLineAmount(remainingQty, item.unitPrice);

  return { currentInvoiceAmount, remainingQty, remainingAmount };
}

/**
 * The Raise Invoice drawer's two display layouts. Derived directly from
 * `inferBillingQuantityMode` — "reference" activities render as
 * "commercial_milestone" (Milestone Value / Already Invoiced / Balance,
 * no Bill Qty input), "progressive" activities render as "quantity_driven"
 * (Available Qty / Bill Qty / System Amount). There is deliberately no
 * separate UOM-keyword classifier for this anymore — a second classifier
 * disagreeing with `inferBillingQuantityMode` is exactly what caused
 * milestone percentages to get multiplied into invoice quantities before.
 */
export type InvoiceWorkflowMode = "quantity_driven" | "commercial_milestone";

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
