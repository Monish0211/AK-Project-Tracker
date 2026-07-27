import type { Project } from "../../../../../types/Project";
import type { PrototypeActivityLedger, PrototypeMilestoneTerm } from "./prototypeTypes";

/**
 * PROTOTYPE ONLY — THE single shared calculation for every commercial figure
 * in this preview. Invoice Amount, Completed Amount, and Pending Amount are
 * always `quantity × Unit Rate × the milestone's percentage`. The ledger
 * (usePrototypeInvoiceLedger) only ever stores completed QUANTITY per
 * milestone id — every monetary value is derived from it here, on demand, so
 * amount can never drift out of sync with quantity anywhere it's displayed
 * (Milestone Cards, Commercial Summary, Billing History, Raise Invoice
 * drawer).
 *
 * getProjectMilestones() is the ONE place that reads the Payments tab
 * (project.paymentMilestones) — the Invoice module never defines its own
 * milestone structure. Whatever is configured there (one 100% milestone, a
 * 50/50 split, a four-way 20/30/30/20 schedule, or anything else) is what
 * every card, dropdown, and summary in this prototype reflects. Editing the
 * Payments tab and coming back needs no code change — the next render just
 * reads the updated array.
 */

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * Mirrors the real Payments tab's own display rules exactly (same fallback
 * label, same Single/Multiple gating) — see PaymentMilestoneView.tsx.
 */
export function getProjectMilestones(project: Project): PrototypeMilestoneTerm[] {
  const milestones = project.paymentMilestones ?? [];
  const effective = project.paymentType === "Single" ? milestones.slice(0, 1) : milestones;

  return effective.map((milestone, index) => ({
    id: milestone.id,
    label: milestone.milestoneName || `Milestone ${index + 1}`,
    percent: milestone.paymentPercentage || 0,
  }));
}

export function findMilestone(milestones: PrototypeMilestoneTerm[], milestoneId: string): PrototypeMilestoneTerm {
  return milestones.find((m) => m.id === milestoneId) ?? { id: milestoneId, label: "Unknown Milestone", percent: 0 };
}

/** Invoice Amount = Invoice Quantity × Unit Rate × Milestone %. */
export function calculateMilestoneAmount(quantity: number, unitPrice: number, percent: number): number {
  return round(quantity * unitPrice * (percent / 100));
}

export interface MilestoneSummaryRow {
  id: string;
  label: string;
  percent: number;
  completedQty: number;
  pendingQty: number;
  completedAmount: number;
  pendingAmount: number;
}

/**
 * One row per configured milestone — however many there are — with quantity
 * AND amount together. The Milestone Cards, the Raise Invoice drawer's live
 * before/after preview, and any future KPI rollup should all call this
 * instead of recomputing amounts independently.
 */
export function getMilestoneSummaryRows(
  ledger: PrototypeActivityLedger,
  totalQty: number,
  unitPrice: number,
  milestones: PrototypeMilestoneTerm[]
): MilestoneSummaryRow[] {
  return milestones.map((term) => {
    const completedQty = ledger[term.id] ?? 0;
    const pendingQty = Math.max(round(totalQty - completedQty), 0);

    return {
      id: term.id,
      label: term.label,
      percent: term.percent,
      completedQty,
      pendingQty,
      completedAmount: calculateMilestoneAmount(completedQty, unitPrice, term.percent),
      pendingAmount: calculateMilestoneAmount(pendingQty, unitPrice, term.percent),
    };
  });
}

export type CommercialStatus = "notStarted" | "partial" | "fullyInvoiced";

export interface MilestoneInvoiceAmount {
  id: string;
  label: string;
  amount: number;
}

export interface CommercialSummary {
  activityValue: number;
  /** One entry per configured milestone — supports any count, never assumes exactly Draft + Final. */
  milestoneInvoiceAmounts: MilestoneInvoiceAmount[];
  totalInvoiced: number;
  balanceAmount: number;
  status: CommercialStatus;
}

/**
 * Consolidates every configured milestone's invoice amount into one
 * commercial view — Total Amount Invoiced = sum of all milestone invoice
 * amounts, Balance Amount = Activity Value − Total Amount Invoiced. Reuses
 * calculateMilestoneAmount() so it can never disagree with the per-milestone
 * cards it sits beside.
 */
export function getCommercialSummary(
  ledger: PrototypeActivityLedger,
  unitPrice: number,
  activityValue: number,
  milestones: PrototypeMilestoneTerm[]
): CommercialSummary {
  const milestoneInvoiceAmounts: MilestoneInvoiceAmount[] = milestones.map((term) => ({
    id: term.id,
    label: term.label,
    amount: calculateMilestoneAmount(ledger[term.id] ?? 0, unitPrice, term.percent),
  }));

  const totalInvoiced = round(milestoneInvoiceAmounts.reduce((sum, m) => sum + m.amount, 0));
  const balanceAmount = round(Math.max(activityValue - totalInvoiced, 0));

  let status: CommercialStatus = "notStarted";
  if (activityValue > 0 && totalInvoiced >= activityValue - 0.01) {
    status = "fullyInvoiced";
  } else if (totalInvoiced > 0) {
    status = "partial";
  }

  return { activityValue, milestoneInvoiceAmounts, totalInvoiced, balanceAmount, status };
}
