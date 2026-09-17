import type { Project } from "../types/Project";
import { getProjectCommercialSummary } from "../services/invoiceProgressService";
import { getProcessedTeamMembers } from "../services/timesheetProcessingService";
import { getAllTimesheetImports } from "../services/timesheetService";

/**
 * Assigned/Roster Team — how many ProjectResource rows exist for this
 * project. This is a staffing/allocation concept: it does NOT mean any of
 * these employees have actually logged hours yet. Use this for
 * capacity/workload-planning contexts (e.g. the Dashboard's Department
 * Command Center), never as a stand-in for actual timesheet activity.
 */
export function getAssignedTeamCount(project: Project): number {
  if (!project) return 0;
  return Array.isArray(project.resources) ? project.resources.length : 0;
}

/**
 * Actual Timesheet Employees — the count of DISTINCT employees with real,
 * TimesheetEntry-derived activity on this project, across its entire
 * lifetime (never scoped to a single month — matches
 * getProcessedLifetimeActualHours' own "lifetime, not month-filtered"
 * convention). Sourced from the same TimesheetProcessingService engine that
 * already backs the Team Assigned tab, so this can never disagree with what
 * a user sees there. Use this wherever a metric is specifically describing
 * who actually worked, not who is merely assigned.
 */
export function getActualTimesheetEmployeeCount(project: Project): number {
  if (!project) return 0;

  try {
    const allImports = getAllTimesheetImports();
    const processedMembers = getProcessedTeamMembers(project.prNo || "", allImports);
    return Array.isArray(processedMembers) ? processedMembers.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Calculates the dynamic Completion % for a project.
 *
 * Bug fix (Sep 2026): a project's invoiceMethod is a single, frontend-only
 * preference (never persisted to the backend — see InvoiceCalculations.ts's
 * getInvoiceMethod() comment) and is always undefined on a fresh fetch. This
 * function used to branch on that field, falling back to "does this array
 * happen to be non-empty" when it was unset — Quantity Billing first, Lump
 * Sum second, MLMP only on an exact (near-unreachable) method match. Real
 * projects routinely carry Quantity Details (physical/activity tracking)
 * alongside Lump Sum/MLMP/Amount Based commercial billing, and a single
 * project/PR can even bill different activities under different methods
 * simultaneously. The old Quantity branch fired merely because
 * quantityItems/totalWOQty existed — even on a Lump-Sum-billed project — and
 * returned 0% (quantityBilled/invoiceQty is never populated by non-quantity
 * billing) even when real money had been invoiced via milestones.
 *
 * Fixed to reuse getProjectCommercialSummary().invoiceCompletionPercent —
 * already-existing, already-tested logic (getTotalInvoiceRaised() sums every
 * InvoiceLine's own invoiceAmountINR, which every method populates
 * regardless of whether it came from a Quantity line, a Lump Sum/MLMP
 * milestone line, or an Amount Based line — see InvoiceLine's own type
 * comment) divided by the project's total contracted value. Money is the
 * only unit every method already records in a mutually comparable way, so
 * this combines mixed-method projects correctly with no per-method weighting
 * to invent: a project billing partly by Quantity and partly by Lump Sum
 * contributes its real invoiced ₹ from both simultaneously, automatically.
 */
export function calculateProjectCompletionPercentage(project: Project): number {
  if (!project) return 0;

  return clampPercentage(getProjectCommercialSummary(project).invoiceCompletionPercent);
}

function clampPercentage(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped * 10) / 10;
}
