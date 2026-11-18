/**
 * Phase 4 / Option A - the pure, DB-free rules of the central manpower costing.
 *
 * One authoritative calculation: INR manpower cost = the eligible hours of a (project, employee) row x the employee's CURRENT saved hourly rate
 * (Employee.manhourExpenses). The existing rounding is unchanged: round2(totalHours x rate), where totalHours is the existing round2 sum of the
 * pair's timesheet entries. The regional cost (manhourCurrency.rules.ts) is derived from that INR figure with the project's manpower FX version.
 */

export const REFRESH_TASK_STATUS = { PENDING: "PENDING", SUCCEEDED: "SUCCEEDED", FAILED: "FAILED" } as const;
export const REFRESH_RUN_STATUS = { PENDING: "PENDING", PROCESSING: "PROCESSING", SUCCEEDED: "SUCCEEDED", PARTIAL: "PARTIAL", FAILED: "FAILED" } as const;
export type RefreshRunStatus = (typeof REFRESH_RUN_STATUS)[keyof typeof REFRESH_RUN_STATUS];
export type ProjectRefreshStatus = "CURRENT" | "PENDING" | "FAILED";

export type RateChangeSource = "MANUAL_UPDATE" | "EXCEL_IMPORT" | "EMPLOYEE_CREATE";

/** The existing backend rounding, unchanged: two decimals, applied once to hours x rate. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** INR manpower cost of a row: the existing rule, with the CURRENT employee rate. */
export function inrManpowerCost(totalHours: number, hourlyRate: number): number {
  return round2((Number.isFinite(totalHours) ? totalHours : 0) * (Number.isFinite(hourlyRate) ? hourlyRate : 0));
}

/** True when a save really changed the rate. An unchanged rate (or an update that does not carry a rate) triggers no recalculation. */
export function hourlyRateChanged(previous: number | null | undefined, next: number | null | undefined): boolean {
  if (next === undefined || next === null) return false;
  if (previous === undefined || previous === null) return true;
  return previous !== next;
}

/** A project's refresh state from its open tasks: any FAILED task wins, then any PENDING one, otherwise CURRENT. */
export function projectRefreshStatus(openStatuses: readonly string[]): ProjectRefreshStatus {
  if (openStatuses.includes(REFRESH_TASK_STATUS.FAILED)) return "FAILED";
  if (openStatuses.includes(REFRESH_TASK_STATUS.PENDING)) return "PENDING";
  return "CURRENT";
}

/** A run's overall state from its tasks. SUCCEEDED only when EVERY task succeeded: never "done" while any project is pending or failed. */
export function runStatusFromTasks(taskStatuses: readonly string[]): RefreshRunStatus {
  if (taskStatuses.length === 0) return REFRESH_RUN_STATUS.SUCCEEDED;
  const succeeded = taskStatuses.filter((s) => s === REFRESH_TASK_STATUS.SUCCEEDED).length;
  const failed = taskStatuses.filter((s) => s === REFRESH_TASK_STATUS.FAILED).length;
  if (succeeded === taskStatuses.length) return REFRESH_RUN_STATUS.SUCCEEDED;
  if (failed === taskStatuses.length) return REFRESH_RUN_STATUS.FAILED;
  if (failed > 0 || succeeded > 0) return REFRESH_RUN_STATUS.PARTIAL;
  return REFRESH_RUN_STATUS.PENDING;
}

export interface MonthHours {
  month: string; // YYYY-MM
  hours: number;
}

export interface MonthCost {
  month: string;
  hours: number;
  costInr: number;
  costRegional: number | null;
}

/**
 * Splits a row's lifetime cost over its months so the months ALWAYS add up to the lifetime figure the rest of the application uses. Each month's
 * amount is the difference of cumulative rounded amounts: round2(cumulative hours x rate) minus the previous cumulative, so no cent is lost or
 * invented. `toRegional` (optional) converts a cumulative INR amount with the row's own FX version; the regional split telescopes the same way.
 */
export function splitCostByMonth(months: readonly MonthHours[], hourlyRate: number, toRegional?: (cumulativeInr: number) => number): MonthCost[] {
  const ordered = [...months].sort((a, b) => a.month.localeCompare(b.month));
  let cumulativeHours = 0;
  let previousInr = 0;
  let previousRegional = 0;
  return ordered.map((m) => {
    cumulativeHours = round2(cumulativeHours + m.hours);
    const cumulativeInr = inrManpowerCost(cumulativeHours, hourlyRate);
    const cumulativeRegional = toRegional ? toRegional(cumulativeInr) : null;
    const costInr = round2(cumulativeInr - previousInr);
    const costRegional = cumulativeRegional === null ? null : Math.round((cumulativeRegional - previousRegional) * 1000) / 1000;
    previousInr = cumulativeInr;
    if (cumulativeRegional !== null) previousRegional = cumulativeRegional;
    return { month: m.month, hours: round2(m.hours), costInr, costRegional };
  });
}
