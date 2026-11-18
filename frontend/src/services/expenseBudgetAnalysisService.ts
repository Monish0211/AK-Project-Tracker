import { getProjectById } from "./projectService";
import { getAllTimesheetImports } from "./timesheetService";
import { getProcessedLifetimeActualHours } from "./timesheetProcessingService";
import { getTotalNonManhourCost } from "./expenseService";
import type { Tone } from "../components/ui/Badge";
import type { Project } from "../types/Project";
import { regionalWorkOrderValue } from "../utils/currencyDisplay";
import { manhourMinorUnits } from "../utils/manhourCosting";
import type { ManhourCosting } from "../utils/manhourCosting";

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
  /**
   * Phase 4 / Option A: the SERVER's authoritative man-hour cost for the project (GET /projects/:id/manhour-costing: the same stored records Dashboard, Reports and
   * the PDF sum), in the project's regional currency. A non-INR row with no FX rate applied is not in it (see manhourRateMissing). 0 until the costing has loaded.
   */
  actualManhourBudget: number;
  /** The same cost in INR (hours x the employee's current saved INR rate, as stored by the server). */
  actualManhourBudgetInr: number;
  /** A non-INR project with rows that have no manpower FX rate applied. Their cost is NOT in any total here and must read "Rate not set". */
  manhourRateMissing: boolean;
  /** The server costing has not loaded yet: the man-hour cells show a placeholder, never a zero presented as the cost. */
  manhourCostingPending: boolean;
  /** PENDING / FAILED: an employee-rate recalculation for this project has not completed, so the man-hour figures may be out of date. */
  manhourRefreshStatus: "CURRENT" | "PENDING" | "FAILED";
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

/**
 * Returns null if no project with this id exists.
 *
 * Bug fix (Sep 2026): `projectOverride` lets a caller that already has the
 * freshly-fetched Project (e.g. ViewProject.tsx's own load chain, passed
 * down as a prop) use that directly instead of this function's own
 * `getProjectById(projectId)` localStorage read — which could be stale or
 * genuinely empty (e.g. right after a fresh login, before any page's fetch
 * has written this project into the shared mirror yet) even while the
 * caller's own in-memory data is already correct. Every existing/future
 * caller that only has a projectId (Dashboard, Reports) is unaffected —
 * omitting the second argument keeps the exact same localStorage-read
 * behavior as before.
 */
export function calculateBudgetExecution(projectId: string, projectOverride?: Project, manhourCosting?: ManhourCosting | null): BudgetExecution | null {
  const project = projectOverride ?? getProjectById(projectId);
  if (!project) return null;

  const plannedBudgetHours = project.manhourBudgetHours || 0;
  const plannedManhourBudget = project.manhourBudgetAmount || 0;
  const plannedNonManhourBudget = project.nonManhourBudgetAmount || 0;
  // Phase 3: the work order value in the project's regional currency (the INR value for an INR or legacy project, exactly as before).
  const plannedTotalBudget = regionalWorkOrderValue(project);

  // Approved Budget = Planned Man-Hour Budget + Planned Non Man-Hour Budget.
  // Nothing else — never the Work Order Value.
  const approvedBudget = plannedManhourBudget + plannedNonManhourBudget;

  const allTimesheetImports = getAllTimesheetImports();
  const actualBudgetHours = getProcessedLifetimeActualHours(project.prNo, allTimesheetImports);
  // Phase 4 / Option A: the actual man-hour cost is NOT priced here. It is the server's authoritative costing for the project (the same stored figures as Team
  // Assigned, Dashboard, Reports, the PDF and the exports), so every screen agrees. A non-INR project row with no FX rate applied is left out of the total
  // (never added as INR to regional amounts) and flagged. Until the costing has loaded the man-hour figures are marked pending, not shown as zero.
  const manhourCostingPending = !manhourCosting;
  const actualManhourBudgetInr = manhourCosting ? manhourCosting.totals.costInr : 0;
  const actualManhourBudget = manhourCosting ? manhourCosting.totals.costInProjectCurrency : 0;
  const manhourRateMissing = Boolean(manhourCosting?.requiresRate) && (manhourCosting?.totals.rateNotSetRows ?? 0) > 0;
  const manhourRefreshStatus = manhourCosting?.refreshStatus ?? "CURRENT";
  // OMR keeps 3 decimals; every other currency (and every INR / legacy project) keeps the 2 it always had.
  const digits = manhourCosting ? manhourMinorUnits(manhourCosting.regionalCurrency) : 2;
  const money = (value: number) => Math.round(value * 10 ** digits) / 10 ** digits;
  const actualNonManhourBudget = getTotalNonManhourCost(project.nonManhourExpenses);

  // Actual Project Cost = Actual Man-Hour Budget + Actual Non Man-Hour Budget. Nothing else.
  const actualTotalBudget = actualManhourBudget + actualNonManhourBudget;

  return {
    plannedBudgetHours,
    actualBudgetHours,
    budgetHoursVariance: round2(actualBudgetHours - plannedBudgetHours),

    plannedManhourBudget,
    actualManhourBudget: money(actualManhourBudget),
    actualManhourBudgetInr: round2(actualManhourBudgetInr),
    manhourRateMissing,
    manhourCostingPending,
    manhourRefreshStatus,
    manhourBudgetVariance: money(actualManhourBudget - plannedManhourBudget),

    plannedNonManhourBudget,
    actualNonManhourBudget: money(actualNonManhourBudget),
    nonManhourBudgetVariance: money(actualNonManhourBudget - plannedNonManhourBudget),

    plannedTotalBudget,
    approvedBudget: money(approvedBudget),
    actualTotalBudget: money(actualTotalBudget),
    totalBudgetVariance: money(actualTotalBudget - approvedBudget),
    budgetVarianceRemaining: money(approvedBudget - actualTotalBudget),

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
