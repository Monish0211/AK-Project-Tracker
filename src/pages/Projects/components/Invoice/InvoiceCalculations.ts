import type { InvoiceItem, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import type { Project } from "../../../../types/Project";
import { getInvoiceRaisedAmount } from "../../../../services/invoiceProgressService";

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * A payment milestone as read live from the Payments tab
 * (project.paymentMilestones) — this module NEVER defines its own milestone
 * structure. A milestone is always optional reference information on an
 * invoice line, never a required or separately-tracked billing total.
 * Mirrors PaymentMilestoneView.tsx's own display rules exactly (same
 * fallback label, same Single/Multiple gating) so the two tabs never
 * disagree on what a project's milestones are.
 */
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

/** Cumulative quantity billed against an activity so far (excludes Cancelled lines). */
export function getActivityCompletedQty(item: InvoiceItem): number {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];
  return round(
    lines
      .filter((line) => line.status !== "Cancelled")
      .reduce((sum, line) => sum + line.quantityBilled, 0)
  );
}

export function getActivityRemainingQty(item: InvoiceItem): number {
  return Math.max(round(item.qty - getActivityCompletedQty(item)), 0);
}

/**
 * Purely descriptive label for the Activities table's "Billing Type" column
 * — reflects whether this project has payment milestones configured to
 * reference, never a stored/persisted field. Every activity is always
 * billable by quantity; milestones are additional optional reference info.
 */
export function getBillingTypeLabel(project: Project): string {
  return getMilestonesForProject(project).length > 0 ? "Qty + Milestone" : "Quantity";
}

export type MilestoneRowStatus = "completed" | "partial" | "pending";

export interface MilestoneSummaryRow {
  id: string;
  label: string;
  percent: number;
  /** Qty billed against this milestone reference so far (non-cancelled lines only). */
  completedQty: number;
  /** Same figure as completedQty today — kept as a distinct field so a future
   *  physical-progress source (Timesheets/Man-hours/Deliverables) can report
   *  completed work separately from what's actually been invoiced, without
   *  reshaping this row. */
  invoicedQty: number;
  pendingQty: number;
  status: MilestoneRowStatus;
}

function getMilestoneRowStatus(completedQty: number, totalQty: number): MilestoneRowStatus {
  if (completedQty <= 0) return "pending";
  if (completedQty >= totalQty - 0.01) return "completed";
  return "partial";
}

/**
 * One row per configured milestone for a single activity — however many
 * there are (1, 2, 4, 10...). Each milestone tracks its own billed quantity
 * independently against the activity's FULL contract quantity (milestones
 * are reference tags, not a strict allocation of the quantity), matching
 * what an Accounts user sees when they didn't pick a milestone for every
 * invoice line: unreferenced quantity simply never appears against any
 * milestone row, it still counts at the activity level.
 */
export function getMilestoneSummaryForActivity(item: InvoiceItem, milestones: BillingMilestone[]): MilestoneSummaryRow[] {
  const lines = Array.isArray(item.invoices) ? item.invoices : [];

  return milestones.map((milestone) => {
    const completedQty = round(
      lines
        .filter((line) => line.status !== "Cancelled" && line.milestoneId === milestone.id)
        .reduce((sum, line) => sum + line.quantityBilled, 0)
    );
    const pendingQty = Math.max(round(item.qty - completedQty), 0);

    return {
      id: milestone.id,
      label: milestone.label,
      percent: milestone.percent,
      completedQty,
      invoicedQty: completedQty,
      pendingQty,
      status: getMilestoneRowStatus(completedQty, item.qty),
    };
  });
}

/** Invoice Amount = Invoice Qty × Unit Rate. The only place this calculation happens. */
export function calculateLineAmount(quantity: number, unitPrice: number): number {
  return round(quantity * (unitPrice || 0));
}

/**
 * Max quantity a specific line can carry — total contract qty minus whatever
 * every *other* non-cancelled line for this activity already accounts for.
 * Excludes the line's own current quantity so editing a line to the same
 * value it already holds is never blocked.
 */
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

/** Live preview numbers for a single billable line as the user types Current Invoice Qty. */
export function getLinePreview(item: InvoiceItem, currentInvoiceQty: number, excludeLineId?: string): LinePreview {
  const maxQty = getEditableMaxQuantity(item, excludeLineId);
  const safeQty = Math.max(currentInvoiceQty, 0);
  const currentInvoiceAmount = calculateLineAmount(safeQty, item.unitPrice);
  const remainingQty = Math.max(round(maxQty - safeQty), 0);
  const remainingAmount = calculateLineAmount(remainingQty, item.unitPrice);

  return { currentInvoiceAmount, remainingQty, remainingAmount };
}

export const INVOICE_LINE_STATUS_LABEL: Record<InvoiceLineStatus, string> = {
  Pending: "Pending",
  Paid: "Paid",
  Cancelled: "Cancelled",
};

/** Suggests the next sequential invoice number for this project — counts every line ever created (including Cancelled) so numbers are never reused. */
export function suggestNextInvoiceNumber(project: Project): string {
  const totalLines = (Array.isArray(project.invoiceItems) ? project.invoiceItems : []).reduce(
    (count, item) => count + (Array.isArray(item.invoices) ? item.invoices.length : 0),
    0
  );
  const prefix = project.prNo?.trim() || "INV";
  return `${prefix}-INV-${String(totalLines + 1).padStart(3, "0")}`;
}

export { getInvoiceRaisedAmount };
