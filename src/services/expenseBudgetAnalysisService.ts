import { getProjectById } from "./projectService";
import { getAllTimesheetImports } from "./timesheetService";
import { getProcessedLifetimeActualHours, getProcessedTeamMembers } from "./timesheetProcessingService";
import { getTotalNonManhourCost } from "./expenseService";
import type { Tone } from "../components/ui/Badge";

/**
 * THE single shared calculation for a project's budget execution. Execution
 * Analysis, Budget Utilization, and any future Dashboard/Reports widget must
 * all call calculateBudgetExecution(projectId) and read its fields — never
 * recompute Actual Man-Hour Budget, Actual Non Man-Hour Budget, Actual
 * Project Cost, Budget Variance, or Budget Utilization % independently.
 *
 * Actual Budget Hours / Actual Man-Hour Budget are read live from this
 * project's imported Timesheet entries (matched by PR Number) via
 * timesheetProcessingService — the exact same engine Team Assigned and the
 * Dashboard's Hours Overrun widget already use, so this can never disagree
 * with them. `project.manhourExpenses` is NOT used here: there is no UI
 * anywhere in this app that ever writes to it (confirmed dead/vestigial
 * data — always []), which is why Actual values previously always read 0.
 *
 * Actual Non Man-Hour Budget comes from project.nonManhourExpenses (the
 * Other Project Expenses ledger, populated by project import).
 *
 * There is no "approved" status field on either Timesheet entries or Non
 * Man-Hour Expenses in this data model yet — every recorded entry is
 * treated as final/approved until that workflow exists on the backend.
 * This is the single seam to swap when the Node.js + SQL Server backend
 * exposes an "approved-only" endpoint: filter inside this function and
 * every consumer keeps working unchanged.
 */
export interface BudgetExecution {
  plannedBudgetHours: number;
  actualBudgetHours: number;
  budgetHoursVariance: number;

  plannedManhourBudget: number;
  actualManhourBudget: number;
  manhourBudgetVariance: number;

  plannedNonManhourBudget: number;
  actualNonManhourBudget: number;
  nonManhourBudgetVariance: number;

  /**
   * Total Project Budget — the Work Order Value entered on the project.
   * This is a contract/revenue figure, NOT the cost budget: it powers only
   * the "Total Project Budget" stat tile and Budgeted Profit. It is
   * deliberately NOT used for Budget Variance or Budget Utilization — see
   * `approvedBudget` for that.
   */
  plannedTotalBudget: number;
  /**
   * Approved Budget = Planned Man-Hour Budget + Planned Non Man-Hour Budget.
   * This is the allocated COST budget the project is actually meant to spend
   * against, so the Execution Analysis table's "Total Budget" row is a true
   * sum of the "Man-Hour Budget" / "Non Man-Hour Budget" rows above it, and
   * Budget Variance / Budget Utilization compare Actual Cost against it
   * instead of against the (usually much larger, unrelated) Work Order Value.
   */
  approvedBudget: number;
  /** Actual Project Cost = Actual Man-Hour Budget + Actual Non Man-Hour Budget. Nothing else. */
  actualTotalBudget: number;
  /** Actual Project Cost - Approved Budget. Positive = overrun, negative = savings. Drives the Execution Analysis table's per-row Variance columns (color rule: positive/overrun = red, negative/savings = green). */
  totalBudgetVariance: number;
  /** Budget Variance = Approved Budget - Actual Project Cost. Positive = budget remaining (under budget), negative = budget exceeded (over budget). Drives the "Budget Variance" / "Budget Remaining / Exceeded" figure shown on both View and Edit pages. */
  budgetVarianceRemaining: number;

  /** Budget Utilization % = (Actual Project Cost ÷ Approved Budget) × 100 */
  budgetUtilizationPercent: number;
}

export const UTILIZATION_BADGE: Record<BudgetUtilizationTier, { label: string; tone: Tone }> = {
  healthy: { label: "Within Budget", tone: "success" },
  approaching: { label: "Approaching Budget", tone: "warning" },
  onBudget: { label: "On Budget", tone: "accent" },
  over: { label: "Over Budget", tone: "danger" },
};

/** Returns null if no project with this id exists. */
export function calculateBudgetExecution(projectId: string): BudgetExecution | null {
  const project = getProjectById(projectId);
  if (!project) return null;

  const plannedBudgetHours = project.manhourBudgetHours || 0;
  const plannedManhourBudget = project.manhourBudgetAmount || 0;
  const plannedNonManhourBudget = project.nonManhourBudgetAmount || 0;
  const plannedTotalBudget = project.workOrderValueINR || 0;

  // Approved Budget = Planned Man-Hour Budget + Planned Non Man-Hour Budget.
  // Nothing else — never the Work Order Value.
  const approvedBudget = plannedManhourBudget + plannedNonManhourBudget;

  const allTimesheetImports = getAllTimesheetImports();
  const actualBudgetHours = getProcessedLifetimeActualHours(project.prNo, allTimesheetImports);
  const actualManhourBudget = getProcessedTeamMembers(project.prNo, allTimesheetImports).reduce(
    (sum, member) => sum + member.totalCost,
    0
  );
  const actualNonManhourBudget = getTotalNonManhourCost(project.nonManhourExpenses);

  // Actual Project Cost = Actual Man-Hour Budget + Actual Non Man-Hour Budget. Nothing else.
  const actualTotalBudget = actualManhourBudget + actualNonManhourBudget;

  return {
    plannedBudgetHours,
    actualBudgetHours,
    budgetHoursVariance: round2(actualBudgetHours - plannedBudgetHours),

    plannedManhourBudget,
    actualManhourBudget: round2(actualManhourBudget),
    manhourBudgetVariance: round2(actualManhourBudget - plannedManhourBudget),

    plannedNonManhourBudget,
    actualNonManhourBudget: round2(actualNonManhourBudget),
    nonManhourBudgetVariance: round2(actualNonManhourBudget - plannedNonManhourBudget),

    plannedTotalBudget,
    approvedBudget: round2(approvedBudget),
    actualTotalBudget: round2(actualTotalBudget),
    totalBudgetVariance: round2(actualTotalBudget - approvedBudget),
    budgetVarianceRemaining: round2(approvedBudget - actualTotalBudget),

    budgetUtilizationPercent:
      approvedBudget > 0 ? round2((actualTotalBudget / approvedBudget) * 100) : 0,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type BudgetUtilizationTier = "healthy" | "approaching" | "onBudget" | "over";

/**
 * 0–80% Healthy · 81–99% Approaching Budget · exactly 100% On Budget ·
 * above 100% Over Budget.
 */
export function getBudgetUtilizationTier(utilizationPercent: number): BudgetUtilizationTier {
  if (utilizationPercent > 100) return "over";
  if (utilizationPercent === 100) return "onBudget";
  if (utilizationPercent >= 81) return "approaching";
  return "healthy";
}
