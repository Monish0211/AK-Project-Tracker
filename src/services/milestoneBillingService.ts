import type { Project } from "../types/Project";

/**
 * Payment Milestone (commercial) billing — tracks which contractual milestone
 * has been achieved. Completely independent of Quantity Based Billing — see
 * services/quantityBillingService.ts. Never merge the two calculations.
 */

/** Milestone ids already billed for this project. A milestone can only be billed once. */
export function getBilledMilestoneIds(project: Project): Set<string> {
  const billings = Array.isArray(project.milestoneBillings) ? project.milestoneBillings : [];

  return new Set(billings.map((billing) => billing.milestoneId));
}

export function isMilestoneBilled(project: Project, milestoneId: string): boolean {
  return getBilledMilestoneIds(project).has(milestoneId);
}

/** Total amount already billed across all Payment Milestones for this project. */
export function getTotalMilestoneBilled(project: Project): number {
  const billings = Array.isArray(project.milestoneBillings) ? project.milestoneBillings : [];

  return billings.reduce((sum, billing) => sum + (billing.amount || 0), 0);
}

export function getMilestoneDisplayName(
  milestone: Project["paymentMilestones"][number],
  index: number
): string {
  return milestone.milestoneName?.trim() || `Milestone ${index + 1}`;
}
