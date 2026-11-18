/**
 * Phase 4 - country-aware manpower costing, the frontend's pure helpers.
 *
 * The employee's hourly rate stays in INR. For a project whose regional currency is not INR, the existing INR man-hour amount is converted with the
 * project's own manpower conversion rate: "1 regional currency unit = X INR", so regional = INR / X. This is NOT the project's transaction exchange
 * rate. The conversion is exact (scaled integers, no floating-point division) and rounded half-up once, to the currency's decimals (OMR 3, others 2).
 */

export const MANHOUR_COSTING_STATUS = {
  INR: "INR",
  CONVERTED: "CONVERTED",
  RATE_MISSING: "RATE_MISSING",
} as const;

export interface ManhourRateVersion {
  version: number;
  regionalCurrency: string;
  /** "1 regional currency unit = X INR", as a decimal string with 6 places. */
  inrPerRegionalUnit: string;
  effectiveFrom: string;
  createdByName: string;
  createdByRole: string;
  note: string | null;
}

export interface ManhourRateInfo {
  projectId: string;
  prNo: string;
  regionalCurrency: string;
  /** False for an INR / legacy project: no rate, the INR cost is its own. */
  requiresRate: boolean;
  canManage: boolean;
  current: ManhourRateVersion | null;
  history: ManhourRateVersion[];
  resources: { total: number; converted: number; rateMissing: number; behindLatest: number };
}

/** Decimal places of a currency's amounts: OMR 3, every other currency 2. */
export function manhourMinorUnits(currency: string): number {
  return currency === "OMR" ? 3 : 2;
}

/**
 * Exact INR -> project currency: inr / inrPerRegionalUnit, rounded half-up ONCE to the currency's decimals. Uses scaled integers (INR to 4 places,
 * the rate to 6) so no floating-point division can shift a digit. Returns 0 for a missing, zero or invalid rate: callers must check
 * hasUsableRate() first and show "Rate not set" instead of this number.
 */
export function convertInrToProjectCurrency(inr: number, inrPerRegionalUnit: number | string | null | undefined, currency: string): number {
  const rate = Number(inrPerRegionalUnit);
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(inr)) return 0;
  const digits = manhourMinorUnits(currency);
  const negative = inr < 0;
  const inrScaled = BigInt(Math.round(Math.abs(inr) * 1e4)); // INR with 4 decimals
  const rateScaled = BigInt(Math.round(rate * 1e6)); // rate with 6 decimals
  if (rateScaled === 0n) return 0;
  // regional (in units of 10^-digits) = inr / rate = (inrScaled / 1e4) / (rateScaled / 1e6) * 10^digits = inrScaled * 10^(digits + 2) / rateScaled
  const numerator = inrScaled * 10n ** BigInt(digits + 2);
  const quotient = (2n * numerator + rateScaled) / (2n * rateScaled); // half-up
  const value = Number(quotient) / 10 ** digits;
  return negative ? -value : value;
}

/** True when a rate version exists and is a positive number. */
export function hasUsableRate(info: Pick<ManhourRateInfo, "current"> | null | undefined): boolean {
  const rate = Number(info?.current?.inrPerRegionalUnit);
  return Number.isFinite(rate) && rate > 0;
}

/** The conversion a screen applies to its existing INR man-hour amounts. null = INR / legacy project: nothing to convert. */
export interface ManhourConversion {
  currency: string;
  /** null while no rate is set (or while it is still loading): the amounts must read "Rate not set", never an INR amount in this currency. */
  inrPerRegionalUnit: number | null;
}

/** "1 OMR = INR 243.156" */
export function manhourRateText(currency: string, inrPerRegionalUnit: number | string): string {
  const rate = Number(inrPerRegionalUnit);
  return `1 ${currency} = INR ${Number.isFinite(rate) ? String(rate) : String(inrPerRegionalUnit)}`;
}

export const RATE_NOT_SET = "Rate not set";

// ── Phase 4 / Option A: the central manpower costing read model ────────────────────────────────────────────────────────────────────────────────
// Every screen takes its manpower amounts from the backend (GET /projects/:id/manhour-costing), which returns the same stored records Dashboard, Reports,
// the PDF and the exports sum. Nothing below prices hours: it only picks and presents the figures the server returned.

export type ManhourRefreshStatus = "CURRENT" | "PENDING" | "FAILED";

export interface ManhourCostingMonth {
  month: string;
  hours: number;
  costInr: number;
  costRegional: number | null;
}

export interface ManhourCostingRow {
  employeeNo: string;
  totalHours: number;
  workingDays: number;
  /** INR per hour: the employee's current saved rate as of the row's last recalculation. */
  hourlyRateInr: number;
  costInr: number;
  costCurrency: string | null;
  costingStatus: string | null;
  fxRateVersion: number | null;
  fxRateInrPerRegional: number | null;
  /** In the project's currency; null unless CONVERTED (an INR / legacy project has no regional figure: costInr is its own money). */
  costRegional: number | null;
  months: ManhourCostingMonth[];
}

export interface ManhourCosting {
  projectId: string;
  regionalCurrency: string;
  requiresRate: boolean;
  /** Read-only: the latest central conversion rate of the project's COUNTRY (Manpower > Manpower Conversion Rates); null for an INR project or while none is set. */
  countryRate: { countryName: string; version: number; inrPerRegionalUnit: number; effectiveFrom: string } | null;
  /** PENDING / FAILED while an employee-rate recalculation for this project has not completed: the figures may be out of date. */
  refreshStatus: ManhourRefreshStatus;
  rows: ManhourCostingRow[];
  totals: { costInr: number; costInProjectCurrency: number; rateNotSetRows: number };
}

export interface EmployeeCostFigure {
  hours: number;
  hourlyInr: number;
  costInr: number;
  /** In the project's currency. null = "Rate not set" (a non-INR project row with no FX rate applied): never an INR amount in that currency. */
  costProject: number | null;
  /** costProject / hours (the project-currency hourly rate), null when the cost is not available or there are no hours. */
  hourlyProject: number | null;
}

const normNo = (value: string) => value.trim().toLowerCase();

/** The authoritative figure for one employee in the project's currency (lifetime, or one month YYYY-MM). null when the server has no costing row for the employee. */
export function employeeCostFigure(costing: ManhourCosting | null, employeeNo: string, month?: string): EmployeeCostFigure | null {
  if (!costing) return null;
  const row = costing.rows.find((r) => normNo(r.employeeNo) === normNo(employeeNo));
  if (!row) return null;
  const monthRow = month ? row.months.find((m) => m.month === month) : undefined;
  const hours = month ? (monthRow?.hours ?? 0) : row.totalHours;
  const costInr = month ? (monthRow?.costInr ?? 0) : row.costInr;
  const digits = manhourMinorUnits(costing.regionalCurrency);
  let costProject: number | null;
  if (!costing.requiresRate) costProject = costInr;
  else if (row.costRegional === null) costProject = null;
  else costProject = month ? (monthRow?.costRegional ?? 0) : row.costRegional;
  const hourlyProject = !costing.requiresRate
    ? row.hourlyRateInr
    : costProject !== null && hours > 0
      ? Math.round((costProject / hours) * 10 ** digits) / 10 ** digits
      : null;
  return { hours, hourlyInr: row.hourlyRateInr, costInr, costProject, hourlyProject };
}

export interface CostingTotals {
  costInr: number;
  /** Sum of the figures that are available, in the project's currency. */
  costProject: number;
  /** Employees shown whose project-currency cost is "Rate not set" (not in costProject). */
  rateNotSet: number;
  /** Employees shown with no costing row yet. */
  missing: number;
}

/** Totals over the employees a screen shows, as the sum of the SAME per-employee figures it shows, so a KPI always equals its rows. */
export function costingTotals(costing: ManhourCosting | null, employeeNos: string[], month?: string): CostingTotals {
  let costInr = 0;
  let costProject = 0;
  let rateNotSet = 0;
  let missing = 0;
  for (const employeeNo of employeeNos) {
    const figure = employeeCostFigure(costing, employeeNo, month);
    if (!figure) {
      missing += 1;
      continue;
    }
    costInr += figure.costInr;
    if (figure.costProject === null) rateNotSet += 1;
    else costProject += figure.costProject;
  }
  const digits = manhourMinorUnits(costing?.regionalCurrency ?? "INR");
  return { costInr: Math.round(costInr * 100) / 100, costProject: Math.round(costProject * 10 ** digits) / 10 ** digits, rateNotSet, missing };
}

export function refreshStatusText(status: ManhourRefreshStatus): string {
  return status === "FAILED"
    ? "Manpower costing recalculation failed for this project, so its man-hour figures may be out of date."
    : "Manpower costing recalculation is still in progress for this project, so its man-hour figures may be out of date.";
}
