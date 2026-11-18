import { prisma } from "../../shared/utils/prismaClient.js";
import { AppError } from "../../shared/utils/AppError.js";
import { assertProjectReadAccessById } from "../../shared/utils/projectAccess.js";
import type { AccessTokenPayload } from "../../shared/types/auth.types.js";
import { effectiveRegionalCurrency } from "../quantity/quantityCurrency.rules.js";
import { COSTING_STATUS, convertInrToRegional, requiresManhourRate } from "../manhourRates/manhourCurrency.rules.js";
import { findLatestCountryRate } from "../manhourRates/manhourRate.repository.js";
import { openTaskStatusesByProject } from "./manhourCosting.repository.js";
import { projectRefreshStatus, splitCostByMonth } from "./manhourCosting.rules.js";
import type { MonthCost, ProjectRefreshStatus } from "./manhourCosting.rules.js";

/**
 * Phase 4 / Option A - THE read model every manpower-cost screen consumes (Team Assigned, Expense Budget). It returns the stored authoritative
 * costing records (ProjectResource), exactly the figures Dashboard, Reports, the PDF and the exports sum, so no screen prices hours itself. The
 * per-month split only explains the lifetime figure: each month is the difference of cumulative rounded amounts, so months always add up to it.
 */

export interface ManhourCostingRowDto {
  employeeNo: string;
  totalHours: number;
  workingDays: number;
  /** INR per hour: the employee's current saved rate as of the last recalculation of this row. */
  hourlyRateInr: number;
  costInr: number;
  costCurrency: string | null;
  costingStatus: string | null;
  fxRateVersion: number | null;
  fxRateInrPerRegional: number | null;
  /** In costCurrency; null unless CONVERTED (an INR / legacy project has no regional figure: costInr is its own money). */
  costRegional: number | null;
  months: MonthCost[];
}

export interface ManhourCostingDto {
  projectId: string;
  regionalCurrency: string;
  requiresRate: boolean;
  /**
   * Read-only: the latest central conversion rate of the project's COUNTRY (Manpower > Manpower Conversion Rates), or null when none is set or the project
   * is INR. Informational: each row's own stored rate (fxRateInrPerRegional) is what its figure was converted with.
   */
  countryRate: { countryName: string; version: number; inrPerRegionalUnit: number; effectiveFrom: Date } | null;
  /** CURRENT, or PENDING / FAILED while an employee-rate recalculation for this project has not completed: the figures may be out of date. */
  refreshStatus: ProjectRefreshStatus;
  rows: ManhourCostingRowDto[];
  totals: {
    /** Sum of the rows' INR cost. */
    costInr: number;
    /** Sum of the CONVERTED rows in the project's currency (INR projects: the INR sum). Rows without a rate are NOT in it. */
    costInProjectCurrency: number;
    /** Rows of a non-INR project with no rate applied. */
    rateNotSetRows: number;
  };
}

export async function getProjectManhourCosting(projectId: string, user: AccessTokenPayload): Promise<ManhourCostingDto> {
  await assertProjectReadAccessById(projectId, user);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, regionalCurrency: true, isDeleted: true, regionId: true, region: { select: { name: true, displayName: true } } } });
  if (!project || project.isDeleted) throw new AppError("Project not found.", 404);

  const currency = effectiveRegionalCurrency(project.regionalCurrency);
  const needsRate = requiresManhourRate(project.regionalCurrency);
  const countryLatest = needsRate && project.regionId ? await findLatestCountryRate(project.regionId) : null;
  const [resources, entries, openStatuses] = await Promise.all([
    prisma.projectResource.findMany({ where: { projectId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.timesheetEntry.findMany({ where: { projectId }, select: { employeeNo: true, workDate: true, hours: true } }),
    openTaskStatusesByProject([projectId]),
  ]);

  const hoursByEmployeeMonth = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const month = `${e.workDate.getUTCFullYear()}-${String(e.workDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const perEmployee = hoursByEmployeeMonth.get(e.employeeNo) ?? new Map<string, number>();
    perEmployee.set(month, (perEmployee.get(month) ?? 0) + e.hours);
    hoursByEmployeeMonth.set(e.employeeNo, perEmployee);
  }

  const rows: ManhourCostingRowDto[] = resources.map((r) => {
    const converted = needsRate && r.costingStatus === COSTING_STATUS.CONVERTED && r.fxRateInrPerRegional !== null;
    const monthHours = [...(hoursByEmployeeMonth.get(r.employeeNo) ?? new Map<string, number>()).entries()].map(([month, hours]) => ({ month, hours }));
    const toRegional = converted ? (inr: number) => Number(convertInrToRegional(inr, r.fxRateInrPerRegional!, currency).toFixed(3)) : undefined;
    return {
      employeeNo: r.employeeNo,
      totalHours: r.totalHours,
      workingDays: r.workingDays,
      hourlyRateInr: r.hourlyRateSnapshot,
      costInr: r.manhourCost,
      costCurrency: r.costCurrency,
      costingStatus: r.costingStatus,
      fxRateVersion: r.fxRateVersion,
      fxRateInrPerRegional: r.fxRateInrPerRegional ? Number(r.fxRateInrPerRegional.toFixed(6)) : null,
      costRegional: converted && r.manhourCostRegional ? Number(r.manhourCostRegional.toFixed(3)) : null,
      months: splitCostByMonth(monthHours, r.hourlyRateSnapshot, toRegional),
    };
  });

  const costInr = Math.round(rows.reduce((s, r) => s + r.costInr, 0) * 100) / 100;
  const inProjectCurrency = needsRate ? rows.reduce((s, r) => s + (r.costRegional ?? 0), 0) : costInr;
  return {
    projectId,
    regionalCurrency: currency,
    requiresRate: needsRate,
    countryRate:
      countryLatest && countryLatest.regionalCurrency === currency
        ? { countryName: project.region?.displayName ?? project.region?.name ?? "", version: countryLatest.version, inrPerRegionalUnit: Number(countryLatest.inrPerRegionalUnit.toFixed(6)), effectiveFrom: countryLatest.effectiveFrom }
        : null,
    refreshStatus: projectRefreshStatus(openStatuses.get(projectId) ?? []),
    rows,
    totals: {
      costInr,
      costInProjectCurrency: Math.round(inProjectCurrency * 1000) / 1000,
      rateNotSetRows: needsRate ? rows.filter((r) => r.costRegional === null).length : 0,
    },
  };
}
