import { AppError } from "../../../shared/utils/AppError.js";
import { activeSingleCountryCurrency } from "../../../shared/utils/countryAccess.js";
import { effectiveRegionalCurrency, usesRegionalRules } from "../../quantity/quantityCurrency.rules.js";
import { openTaskStatusesByProject } from "../../manhourCosting/manhourCosting.repository.js";
import { projectRefreshStatus } from "../../manhourCosting/manhourCosting.rules.js";
import { getTimesheetPendingProjects } from "../../timesheets/services/timesheetPending.service.js";
import { computeInvoiceProgress } from "../../../shared/utils/quantityProgress.js";
import type {
  ActivityEventDto,
  CountryDepartmentsDto,
  CountryTopClientsDto,
  DashboardSummaryDto,
  DepartmentOpsDto,
  HoursOverrunProjectDto,
  MissingAssigneeProjectDto,
  TeamLeadWorkloadDto,
  TimelineAlertProjectDto,
} from "../dto/dashboard.dto.js";
import { isActiveProjectStatus, PR_CATEGORY_PREFIX_MAP } from "../../projects/project.constants.js";
import {
  actualProjectCost,
  calculateCompletionPercentage,
  calculateDepartmentCompletion,
  calculateTimelineAlert,
  classifyHealth,
  DEFAULT_DEPARTMENTS,
  departmentWorkloadPercent,
  formatCurrencyCompact,
  formatHoursOverrun,
  grossProfit,
  isProjectCurrencyLine,
  isUsableManagerName,
  lineInvoiceAmount,
  pendingInvoicePercentage,
  projectCommercialTotals,
  projectDisplayName,
  profitPercentage,
  roundHours,
  teamLeadStatus,
  toDateKey,
} from "../dashboard.formulas.js";
import type { DashboardProjectRow, InvoiceLineRow } from "../repository/dashboard.repository.js";
import * as dashboardRepo from "../repository/dashboard.repository.js";
import { withPaymentFigures } from "../../invoicePayments/services/paymentFigures.service.js";
import { decimalPlacesFor } from "../../invoicePayments/money.rules.js";

/** "paid ₹ 1,00,000" for an India / legacy line (unchanged); "paid OMR 231.000" for a line of a project in another currency - never a rupee sign on a regional amount. */
export function paidAmountLabel(line: InvoiceLineRow): string {
  if (!isProjectCurrencyLine(line)) return `₹ ${line.invoiceAmountINR.toLocaleString("en-IN")}`;
  const digits = decimalPlacesFor(line.projectCurrency as string);
  return `${line.projectCurrency} ${lineInvoiceAmount(line).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function linesByProject(lines: InvoiceLineRow[]): Map<string, InvoiceLineRow[]> {
  const map = new Map<string, InvoiceLineRow[]>();
  for (const line of lines) {
    const list = map.get(line.projectId);
    if (list) list.push(line);
    else map.set(line.projectId, [line]);
  }
  return map;
}

export async function getDashboardSummary(callerUserId: string | undefined): Promise<DashboardSummaryDto> {
  const projects = await dashboardRepo.findAuthorizedProjects(callerUserId);

  // P1-05 — findAuthorizedProjects() fetches CAP + 1 rows specifically so
  // this can tell "there were more than CAP projects" apart from "there
  // happened to be exactly CAP" and fail loudly instead of silently
  // computing every KPI/formula below from an incomplete project set. At
  // this application's realistic project-count scale this is not expected
  // to ever fire; it exists as a safety net, not a claim this figure is
  // load-bearing today.
  if (projects.length > dashboardRepo.DASHBOARD_PROJECT_FETCH_CAP) {
    throw new AppError(
      `Dashboard cannot render: more than ${dashboardRepo.DASHBOARD_PROJECT_FETCH_CAP} authorized projects exist. ` +
        "This exceeds the current safe fetch limit — contact support before this figure is trusted.",
      500
    );
  }

  const projectIds = projects.map((p) => p.id);

  const [
    quantityTotals,
    quantityItems,
    rawInvoiceLines,
    expenseTotals,
    manhourTotals,
    regionalManhour,
    openRefreshTasks,
    timesheetHours,
    resources,
    notes,
    milestones,
    timesheetPendingItems,
  ] = await Promise.all([
    dashboardRepo.groupQuantityTotals(projectIds),
    dashboardRepo.findQuantityItemsForProjects(projectIds),
    dashboardRepo.findInvoiceLinesForProjects(projectIds),
    dashboardRepo.groupExpenseTotals(projectIds),
    dashboardRepo.groupManhourCostTotals(projectIds),
    dashboardRepo.groupRegionalManhour(projectIds),
    openTaskStatusesByProject(projectIds),
    dashboardRepo.groupTimesheetHours(projectIds),
    dashboardRepo.findResourcesForProjects(projectIds),
    dashboardRepo.findNotesForProjects(projectIds),
    dashboardRepo.findMilestonesForProjects(projectIds),
    getTimesheetPendingProjects(callerUserId),
  ]);

  const qtyByProject = new Map(quantityTotals.map((row) => [row.projectId, row]));
  // Invoice Payment workflow (Nov 2026) — attach recorded cash / settled amounts to lines whose invoice has a recorded payment.
  const invoiceLines = await withPaymentFigures(rawInvoiceLines);
  const invoiceByProject = linesByProject(invoiceLines);

  // Derived invoiceQty/pendingQty — see Priority #3 fix: QuantityItem no
  // longer stores these (they used to drift from real invoicing activity).
  // billedByQuantityItemId reuses the SAME invoiceLines already fetched
  // above for Payment Received — no additional query. The LUMP SUM ceiling
  // (shared/utils/quantityProgress.ts) must be applied per QuantityItem
  // before summing to the project level, so this groups by quantityItemId,
  // not projectId, before the per-project loop below sums each item's own
  // derived pendingQty/invoiceQty.
  const billedByQuantityItemId = new Map<string, number>();
  for (const line of invoiceLines) {
    if (line.status === "Cancelled") continue;
    billedByQuantityItemId.set(
      line.quantityItemId,
      (billedByQuantityItemId.get(line.quantityItemId) ?? 0) + line.quantityBilled
    );
  }
  const quantityItemsByProject = new Map<string, dashboardRepo.QuantityItemRow[]>();
  for (const item of quantityItems) {
    const list = quantityItemsByProject.get(item.projectId);
    if (list) list.push(item);
    else quantityItemsByProject.set(item.projectId, [item]);
  }
  function derivedInvoiceProgressForProject(projectId: string): { invoiceQty: number; pendingQty: number } {
    let invoiceQty = 0;
    let pendingQty = 0;
    for (const item of quantityItemsByProject.get(projectId) ?? []) {
      const progress = computeInvoiceProgress(item.woQty, item.uom, billedByQuantityItemId.get(item.id) ?? 0);
      invoiceQty += progress.invoiceQty;
      pendingQty += progress.pendingQty;
    }
    return { invoiceQty, pendingQty };
  }
  const milestonesByProject = new Map<string, { id: string; paymentPercentage: number }[]>();
  for (const m of milestones) {
    const list = milestonesByProject.get(m.projectId);
    const item = { id: m.id, paymentPercentage: m.paymentPercentage };
    if (list) list.push(item);
    else milestonesByProject.set(m.projectId, [item]);
  }

  const resourcesByProject = new Map<string, dashboardRepo.ResourceRow[]>();
  for (const r of resources) {
    const list = resourcesByProject.get(r.projectId);
    if (list) list.push(r);
    else resourcesByProject.set(r.projectId, [r]);
  }

  // Phase 3: the headline totals are kept PER regional currency and never added across currencies. A legacy project (no stored regional
  // currency) is INR. For a project whose regional currency is not INR the work order value is its regional value (its INR-named value is 0
  // by design); expenses and man-hour cost are plain numbers in the project's regional currency.
  interface CurrencyTotals {
    projects: number;
    totalWOValue: number;
    totalInvoiceRaised: number;
    totalPaymentReceived: number;
    totalSettled: number;
    totalExpenses: number;
    totalActualProjectCost: number;
    /** Phase 4: non-INR projects in this currency with man-hour rows that have no rate yet (their cost is NOT in totalActualProjectCost). */
    manhourIncompleteProjects: number;
    /** Phase 4 / Option A: projects in this currency whose automatic recalculation after an employee-rate change is pending or failed (figures may be out of date). */
    manhourRefreshPendingProjects: number;
  }
  const totalsByCurrency = new Map<string, CurrencyTotals>();
  const totalsFor = (currency: string): CurrencyTotals => {
    let t = totalsByCurrency.get(currency);
    if (!t) {
      t = { projects: 0, totalWOValue: 0, totalInvoiceRaised: 0, totalPaymentReceived: 0, totalSettled: 0, totalExpenses: 0, totalActualProjectCost: 0, manhourIncompleteProjects: 0, manhourRefreshPendingProjects: 0 };
      totalsByCurrency.set(currency, t);
    }
    return t;
  };

  const woByProject = new Map<string, number>();
  // Phase 3: each project's work order value in its OWN regional currency (the INR value for an INR or legacy project) and that currency.
  const kpiWoByProject = new Map<string, number>();
  const currencyByProject = new Map<string, string>();
  const raisedByProject = new Map<string, number>();
  const completionByProject = new Map<string, number>();
  const pendingQtyByProject = new Map<string, number>();
  const pendingPctByProject = new Map<string, number>();
  const teamCountByProject = new Map<string, number>();

  for (const project of projects) {
    const qty = qtyByProject.get(project.id);
    const woValue = qty?.woValue ?? 0;
    const lines = invoiceByProject.get(project.id) ?? [];
    const commercial = projectCommercialTotals(woValue, lines);
    const expenses = expenseTotals.get(project.id) ?? 0;
    const manhourCost = manhourTotals.get(project.id) ?? 0;

    const { invoiceQty: derivedInvoiceQty, pendingQty: derivedPendingQty } = derivedInvoiceProgressForProject(project.id);

    woByProject.set(project.id, woValue);
    raisedByProject.set(project.id, commercial.totalInvoiceRaised);
    pendingQtyByProject.set(project.id, derivedPendingQty);
    pendingPctByProject.set(project.id, pendingInvoicePercentage(derivedPendingQty, qty?.woQty ?? 0));
    teamCountByProject.set(project.id, (resourcesByProject.get(project.id) ?? []).length);

    const billedMilestoneIds = new Set<string>();
    for (const line of lines) {
      if (line.status !== "Cancelled" && line.milestoneId) {
        billedMilestoneIds.add(line.milestoneId);
      }
    }
    completionByProject.set(
      project.id,
      calculateCompletionPercentage({
        totalWOQty: qty?.woQty ?? 0,
        totalInvoiceQty: derivedInvoiceQty,
        milestonePercentages: milestonesByProject.get(project.id) ?? [],
        billedMilestoneIds,
        woValueINR: woValue,
        totalInvoiceRaised: commercial.totalInvoiceRaised,
      })
    );

    const projectCurrency = effectiveRegionalCurrency(project.regionalCurrency);
    const inOtherCurrency = usesRegionalRules(project.regionalCurrency) && projectCurrency !== "INR";
    const kpiWoValue = inOtherCurrency ? (qty?.woValueRegional ?? 0) : woValue;
    kpiWoByProject.set(project.id, kpiWoValue);
    currencyByProject.set(project.id, projectCurrency);
    const kpiCommercial = inOtherCurrency ? projectCommercialTotals(kpiWoValue, lines) : commercial;
    const group = totalsFor(projectCurrency);
    group.projects += 1;
    group.totalWOValue += kpiWoValue;
    group.totalInvoiceRaised += kpiCommercial.totalInvoiceRaised;
    group.totalPaymentReceived += kpiCommercial.totalPaymentReceived;
    group.totalSettled += kpiCommercial.totalSettled;
    group.totalExpenses += expenses;
    // Phase 4: man-hour cost joins the actual project cost in the project's OWN currency. An INR / legacy project keeps its INR sum exactly as before;
    // a non-INR project adds only the cost already converted with a rate, and is counted as incomplete while any of its rows has none: its INR
    // man-hour cost is never added to a regional amount.
    const regionalManhourEntry = regionalManhour.get(project.id);
    const manhourInProjectCurrency = inOtherCurrency ? (regionalManhourEntry?.regional ?? 0) : manhourCost;
    if (inOtherCurrency && (regionalManhourEntry?.notConverted ?? 0) > 0) group.manhourIncompleteProjects += 1;
    if (projectRefreshStatus(openRefreshTasks.get(project.id) ?? []) !== "CURRENT") group.manhourRefreshPendingProjects += 1;
    group.totalActualProjectCost += actualProjectCost(manhourInProjectCurrency, expenses);
  }

  const kpisOf = (t: CurrencyTotals, totalProjects: number) => {
    const totalProfit = grossProfit(t.totalWOValue, t.totalActualProjectCost);
    return {
      totalProjects,
      totalWOValue: t.totalWOValue,
      totalInvoiceRaised: t.totalInvoiceRaised,
      totalPaymentReceived: t.totalPaymentReceived,
      // Outstanding = work order value not yet SETTLED (cash plus counted deductions such as TDS) — never "not yet cash".
      totalOutstanding: Math.max(0, t.totalWOValue - t.totalSettled),
      totalExpenses: t.totalExpenses,
      totalActualProjectCost: t.totalActualProjectCost,
      manhourIncompleteProjects: t.manhourIncompleteProjects,
      manhourRefreshPendingProjects: t.manhourRefreshPendingProjects,
      totalProfit,
      totalProfitPercentage: profitPercentage(t.totalWOValue, totalProfit),
    };
  };

  // The headline currency: INR whenever INR or legacy projects are in view (the India dashboard is exactly as before); otherwise the
  // currency with the most projects. Every other currency is listed separately, never added in.
  // No project in view: the selected country's configured currency when exactly one country is enforced (Qatar shows "QAR 0", not "₹0");
  // INR otherwise (All Countries, several countries, shadow / off), exactly as before. Display only: no amount exists to convert.
  const currencyOrder = [...totalsByCurrency.entries()].sort((a, b) => b[1].projects - a[1].projects || a[0].localeCompare(b[0]));
  const kpiCurrency = totalsByCurrency.has("INR") ? "INR" : currencyOrder.length > 0 ? currencyOrder[0]![0] : (activeSingleCountryCurrency() ?? "INR");
  const kpis = kpisOf(totalsByCurrency.get(kpiCurrency) ?? totalsFor(kpiCurrency), projects.length);
  const otherCurrencies = currencyOrder
    .filter(([currency]) => currency !== kpiCurrency)
    .map(([currency, t]) => ({ currency, ...kpisOf(t, t.projects) }));
  // The Team Leads, Top Clients and Departments panels are in the headline currency too: only projects in that currency contribute, so an Oman view
  // lists OMR amounts and an India view is exactly as before (non-INR projects were 0 there already). Other currencies are never added in.
  // Country-wise sections (Phase 4 final): every country (and currency) in view is ranked on its own, in its own currency, from the same per-project work
  // order value the KPIs use. Nothing is converted or added across countries.
  const countryNames = await dashboardRepo.listCountryDisplayNames();
  const countrySections = groupProjectsByCountry(projects, currencyByProject, countryNames);
  const topClientsByCountry: CountryTopClientsDto[] = countrySections.map((s) => ({
    countryKey: s.countryKey,
    country: s.country,
    currency: s.currency,
    clients: buildTopClients(s.projects, kpiWoByProject),
  }));
  const departmentsByCountry: CountryDepartmentsDto[] = countrySections.map((s) => {
    const ids = new Set(s.projects.map((p) => p.id));
    return {
      countryKey: s.countryKey,
      country: s.country,
      currency: s.currency,
      departments: buildDepartments(
        s.projects,
        kpiWoByProject,
        invoiceByProject,
        resourcesByProject,
        completionByProject,
        milestonesByProject,
        timesheetPendingItems.filter((item) => ids.has(item.projectId))
      ),
    };
  });
  const headlineWoByProject = new Map<string, number>(
    projects.map((p) => [p.id, currencyByProject.get(p.id) === kpiCurrency ? (kpiWoByProject.get(p.id) ?? 0) : 0] as [string, number])
  );

  return {
    generatedAt: new Date().toISOString(),
    kpis,
    kpiCurrency,
    otherCurrencies,
    hoursOverrun: buildHoursOverrun(projects, woByProject, timesheetHours),
    timelineAlerts: buildTimelineAlerts(projects),
    teamLeads: buildTeamLeads(projects, kpiWoByProject, currencyByProject, quantityItemsByProject, kpiCurrency),
    timesheetPending: {
      items: timesheetPendingItems.map((row) => ({
        projectId: row.projectId,
        prNo: row.prNo,
        projectTitle: row.projectTitle,
        department: row.department,
        projectManager: row.projectManager,
        pmoCoordinator: row.pmoCoordinator,
        latestTimesheetDate: row.latestTimesheetDate,
        trackingStartDate: row.trackingStartDate,
        daysSinceLatestTimesheet: row.daysSinceLatestTimesheet,
        status: "PENDING",
      })),
    },
    activity: { items: buildActivity(projects, notes, invoiceByProject) },
    topClients: buildTopClients(projects, headlineWoByProject),
    topClientsByCountry,
    health: buildHealth(projects, pendingQtyByProject, pendingPctByProject),
    recentProjects: buildRecentProjects(projects, woByProject, kpiWoByProject, currencyByProject),
    departments: buildDepartments(
      projects,
      headlineWoByProject,
      invoiceByProject,
      resourcesByProject,
      completionByProject,
      milestonesByProject,
      timesheetPendingItems
    ),
    departmentsByCountry,
  };
}

function buildHoursOverrun(
  projects: DashboardProjectRow[],
  _woByProject: Map<string, number>,
  timesheetHours: Map<string, number>
) {
  const overrunProjects: HoursOverrunProjectDto[] = [];

  for (const p of projects) {
    if (p.projectStatus === "Archived" || p.projectStatus === "Cancelled") continue;
    const budget = Number(p.manhourBudgetHours) || 0;
    const actual = roundHours(timesheetHours.get(p.id) ?? 0);
    if (!(budget > 0 && actual > budget)) continue;

    const overrun = actual - budget;
    const pct = parseFloat((((actual - budget) / budget) * 100).toFixed(1));

    overrunProjects.push({
      id: p.id,
      prNumber: p.prNo || "N/A",
      projectName: projectDisplayName(p.client, p.projectTitle),
      projectManager:
        p.primaryProjectManager && isUsableManagerName(p.primaryProjectManager) ? p.primaryProjectManager : null,
      budgetHours: budget,
      actualHours: actual,
      hoursOverrun: overrun,
      percentOverrun: pct,
      formattedBudgetHours: `${Math.round(budget)} hrs`,
      formattedActualHours: `${Math.round(actual)} hrs`,
      formattedHoursOverrun: formatHoursOverrun(overrun),
      formattedPercentOverrun: `${pct.toFixed(1)}%`,
      status: "Loss",
    });
  }

  overrunProjects.sort((a, b) => b.hoursOverrun - a.hoursOverrun);

  return {
    totalMatchingProjects: overrunProjects.length,
    top5: overrunProjects.slice(0, 5),
    // Same array top5 is sliced from — see HoursOverrunDto's comment (P2-05).
    allMatching: overrunProjects,
  };
}

/**
 * Dashboard "Project Timeline Alerts" widget. Eligibility MUST be the same centralized "active project" classification the Timeline Alert
 * Repository page uses (frontend getProjectTimelineAlerts() -> isActiveProjectStatus()): any in-progress workflow stage, not only the literal
 * "Active" status. A literal check silently dropped every project in a later stage (Ongoing, Draft Report Submitted, Updated Report Submitted, ...)
 * after the Sept 2026 Project Status Workflow Expansion, so the widget showed 4 projects while the repository listed 65.
 * `now` exists only so tests can pin the calendar day; production always uses the current time.
 */
export function buildTimelineAlerts(projects: DashboardProjectRow[], now: Date = new Date()) {
  const alerts: TimelineAlertProjectDto[] = [];
  let dueSoonCount = 0;
  let upcomingCount = 0;
  let dueTodayCount = 0;
  let overdueCount = 0;
  let onTrackCount = 0;

  for (const p of projects) {
    if (!isActiveProjectStatus(p.projectStatus)) continue;
    if (!p.projectEndDate) continue;
    const timeline = calculateTimelineAlert(toDateKey(p.projectEndDate), now);
    if (!timeline) continue;

    if (timeline.status === "Due Today") dueTodayCount += 1;
    else if (timeline.status === "Due Soon") dueSoonCount += 1;
    else if (timeline.status === "Upcoming") upcomingCount += 1;
    else if (timeline.status === "On Track") onTrackCount += 1;
    else overdueCount += 1;

    alerts.push({
      id: p.id,
      prNumber: p.prNo || "N/A",
      projectName: projectDisplayName(p.client, p.projectTitle),
      startDate: toDateKey(p.projectStartDate),
      endDate: toDateKey(p.projectEndDate),
      ...timeline,
    });
  }

  alerts.sort((a, b) => {
    if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
    return a.daysRemaining - b.daysRemaining;
  });

  return {
    totalMatchingProjects: alerts.length,
    top10: alerts.slice(0, 10),
    dueSoonCount,
    upcomingCount,
    dueTodayCount,
    overdueCount,
    onTrackCount,
  };
}

/**
 * Aug 2026 — Team Leads Workload rule change. Previously grouped by
 * ProjectResource.employeeNo -> Employee.reportingManager (falling back to
 * Project.primaryProjectManager only when a project had no resolvable
 * resource manager). Now groups by QuantityItem.assignedTo directly — "who
 * is assigned to this project's engineering activities," independent of
 * Project Leadership and independent of Team Assigned/ProjectResource.
 * Neither of those two other concepts is read here anymore; this function
 * has no effect on ProjectResource, TimesheetEntry, or their calculations.
 *
 * quantityItemsByProject is the SAME map getDashboardSummary() already
 * builds from findQuantityItemsForProjects(projectIds) — projectIds is
 * already scoped to the caller's authorized projects (see that function's
 * own findAuthorizedProjects() call), so this never sees a project the
 * caller isn't allowed to see, and issues no additional database query.
 */
function buildTeamLeads(
  projects: DashboardProjectRow[],
  woByProject: Map<string, number>,
  currencyByProject: Map<string, string>,
  quantityItemsByProject: Map<string, dashboardRepo.QuantityItemRow[]>,
  currency: string
) {
  // `woByProject` is each project's work order value in ITS OWN regional currency (`currencyByProject`); `currency` is the headline currency. Each person's
  // work order value is kept per currency, so projects in another currency are shown in that currency instead of as 0 in the headline one.
  const personDataMap = new Map<string, { projects: Map<string, string>; totals: Map<string, { total: number; projects: number }> }>();
  // Sept 2026 — Missing Assignee. Same active-project scope, same
  // quantityItemsByProject source, same isUsableManagerName() rule the
  // assignee grouping below already uses — never a second definition of
  // "has an assignee." A project qualifies only if it HAS at least one
  // Quantity Details row (a project with zero rows yet has nothing to be
  // "missing" from) AND at least one of those rows' Assigned To is
  // blank/unusable.
  const missingAssigneeProjects: MissingAssigneeProjectDto[] = [];

  for (const project of projects) {
    if (!isActiveProjectStatus(project.projectStatus)) continue;
    const woValue = woByProject.get(project.id) || 0;

    const items = quantityItemsByProject.get(project.id) ?? [];
    const assignees = new Set<string>();
    let hasUnassignedRow = false;
    for (const item of items) {
      const name = (item.assignedTo || "").trim();
      if (isUsableManagerName(name)) {
        assignees.add(name);
      } else {
        hasUnassignedRow = true;
      }
    }
    if (items.length > 0 && hasUnassignedRow) {
      missingAssigneeProjects.push({ id: project.id, prNo: project.prNo, projectTitle: project.projectTitle });
    }

    for (const name of assignees) {
      if (!personDataMap.has(name)) {
        personDataMap.set(name, { projects: new Map(), totals: new Map() });
      }
      const data = personDataMap.get(name);
      if (!data) continue;
      // Map keyed by projectId — multiple QuantityItem rows for the SAME
      // person on the SAME project (e.g. two activities both assigned to
      // Monish on PR-11089) collapse to one entry, never a duplicate.
      if (!data.projects.has(project.id)) {
        data.projects.set(project.id, project.prNo);
        const projectCurrency = currencyByProject.get(project.id) ?? "INR";
        const entry = data.totals.get(projectCurrency) ?? { total: 0, projects: 0 };
        entry.total += woValue;
        entry.projects += 1;
        data.totals.set(projectCurrency, entry);
      }
    }
  }

  const list: TeamLeadWorkloadDto[] = [];
  personDataMap.forEach((data, personName) => {
    const activeProjectsCount = data.projects.size;
    const headlineTotal = data.totals.get(currency)?.total ?? 0;
    const totalsByCurrency = [...data.totals.entries()]
      .sort((a, b) => Number(b[0] === currency) - Number(a[0] === currency) || b[1].projects - a[1].projects || a[0].localeCompare(b[0]))
      .map(([code, t]) => ({ currency: code, projects: t.projects, totalWorkOrderValue: t.total, formattedWorkOrderValue: formatCurrencyCompact(t.total, code) }));
    list.push({
      reportingManager: personName,
      activeProjectsCount,
      totalWorkOrderValue: headlineTotal,
      formattedWorkOrderValue: formatCurrencyCompact(headlineTotal, currency),
      totalsByCurrency,
      status: teamLeadStatus(activeProjectsCount),
      projects: Array.from(data.projects.entries()).map(([id, prNo]) => ({ id, prNo })),
    });
  });

  // Phase 2.2 — active projects desc, then total WO value desc (both
  // unchanged from Phase 2), then assigned name asc as a deterministic
  // tertiary tiebreak so two people tied on both counts never depend on Map
  // iteration/insertion order to decide who lands in the Dashboard's top 5.
  list.sort((a, b) => {
    if (b.activeProjectsCount !== a.activeProjectsCount) return b.activeProjectsCount - a.activeProjectsCount;
    if (b.totalWorkOrderValue !== a.totalWorkOrderValue) return b.totalWorkOrderValue - a.totalWorkOrderValue;
    return a.reportingManager.localeCompare(b.reportingManager);
  });

  // Deterministic order (PR No. asc) — same reasoning as the person list's
  // own tiebreak above: never depend on Map/array insertion order.
  missingAssigneeProjects.sort((a, b) => a.prNo.localeCompare(b.prNo));

  return {
    totalReportingManagers: list.length,
    top5: list.slice(0, 5),
    // Phase 2.2 — same sorted array top5 is sliced from, unsliced. See
    // TeamLeadsDto's own comment for why this is free (already fully
    // computed above) and who consumes it.
    allAssigned: list,
    missingAssignee: missingAssigneeProjects,
  };
}

// An invoice date the database driver could not read (e.g. a five-digit
// year) is an Invalid Date; toISOString() would throw and fail the whole
// summary. "" is dropped by buildActivity()'s timestamp filter below.
function isoTimestampOrEmpty(date: Date): string {
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/**
 * The ten newest activity events. Performance (measured, Nov 2026): this used to build an event - with locale-formatted text and a fresh Date per comparison - for EVERY
 * project, invoice and note, then discard all but ten, on every dashboard load (about a third of the dashboard's CPU). It now ranks cheap numeric timestamps first
 * and builds the display text only for the ten that are returned. The result is identical: the same events, the same newest-first order, and ties keep the order
 * the events were generated in (the original relied on a stable sort of that same order). Exported for the equivalence test.
 */
export function buildActivity(
  projects: DashboardProjectRow[],
  notes: dashboardRepo.NoteRow[],
  invoiceByProject: Map<string, InvoiceLineRow[]>
): ActivityEventDto[] {
  interface Candidate {
    time: number;
    make: () => ActivityEventDto;
  }
  const candidates: Candidate[] = [];
  const projectById = new Map(projects.map((p) => [p.id, p]));
  // A timestamp the driver could not read (an Invalid Date, e.g. a five-digit year) is dropped, exactly as an empty timestamp always was.
  const add = (date: Date, make: () => ActivityEventDto): void => {
    const time = date.getTime();
    if (!Number.isNaN(time)) candidates.push({ time, make });
  };

  for (const project of projects) {
    add(project.createdAt, () => ({
      id: `${project.id}-created`,
      category: "Project",
      title: "Project Created",
      description: `${project.projectTitle || project.prNo} added for ${project.client || "client"}.`,
      projectRef: project.prNo,
      timestamp: project.createdAt.toISOString(),
    }));

    if (project.updatedAt.getTime() !== project.createdAt.getTime()) {
      add(project.updatedAt, () => ({
        id: `${project.id}-updated`,
        category: "Project",
        title: "Project Updated",
        description: `${project.projectTitle || project.prNo} details were updated.`,
        projectRef: project.prNo,
        timestamp: project.updatedAt.toISOString(),
      }));
    }

    for (const line of invoiceByProject.get(project.id) ?? []) {
      if (line.status === "Cancelled") continue;
      add(line.invoiceDate, () => ({
        id: `invoice-${line.id}`,
        category: "Invoice",
        title: "Invoice Raised",
        description: `${line.invoiceNo} raised for ${project.client || project.prNo}.`,
        projectRef: project.prNo,
        timestamp: isoTimestampOrEmpty(line.invoiceDate),
      }));
      if (line.status === "Paid") {
        add(line.invoiceDate, () => ({
          id: `payment-${line.id}`,
          category: "Payment",
          title: "Payment Received",
          description: `${project.client || project.prNo} paid ${paidAmountLabel(line)} against ${line.invoiceNo}.`,
          projectRef: project.prNo,
          timestamp: isoTimestampOrEmpty(line.invoiceDate),
        }));
      }
    }
  }

  for (const note of notes) {
    const project = projectById.get(note.projectId);
    if (!project) continue;
    add(note.createdAt, () => ({
      id: `note-${note.id}`,
      category: "Notes",
      title: "Project Note Added",
      description: note.message,
      projectRef: project.prNo,
      timestamp: note.createdAt.toISOString(),
    }));
  }

  // Array.prototype.sort is stable, so equal timestamps keep their generation order - the same tie-break the original had.
  return candidates
    .sort((a, b) => b.time - a.time)
    .slice(0, 10)
    .map((candidate) => candidate.make());
}

/** The fixed display order of the seven countries (the PR Category order the product has always used); anything unknown follows alphabetically. */
const COUNTRY_ORDER: string[] = Object.keys(PR_CATEGORY_PREFIX_MAP);

/**
 * Splits the projects in view into one group per (country, currency). A country keeps a single currency in practice, so this is one group per country;
 * keying by both means even an odd mixed case can never put two currencies into one ranking.
 */
function groupProjectsByCountry(
  projects: DashboardProjectRow[],
  currencyByProject: Map<string, string>,
  countryNames: Map<string, string>
): Array<{ countryKey: string; country: string; currency: string; projects: DashboardProjectRow[] }> {
  const groups = new Map<string, { countryKey: string; country: string; currency: string; projects: DashboardProjectRow[] }>();
  for (const project of projects) {
    const countryKey = project.prCategory?.trim() || "India";
    const currency = currencyByProject.get(project.id) ?? "INR";
    const key = `${countryKey}|${currency}`;
    const existing = groups.get(key);
    if (existing) existing.projects.push(project);
    else groups.set(key, { countryKey, country: countryNames.get(countryKey) ?? countryKey, currency, projects: [project] });
  }
  const rank = (countryKey: string) => {
    const i = COUNTRY_ORDER.indexOf(countryKey);
    return i === -1 ? COUNTRY_ORDER.length : i;
  };
  return [...groups.values()].sort((a, b) => rank(a.countryKey) - rank(b.countryKey) || a.country.localeCompare(b.country) || a.currency.localeCompare(b.currency));
}

function buildTopClients(projects: DashboardProjectRow[], woByProject: Map<string, number>) {
  const clients: Record<string, number> = {};
  for (const project of projects) {
    const client = project.client?.trim() || "Unknown";
    clients[client] = (clients[client] || 0) + (woByProject.get(project.id) || 0);
  }
  return Object.entries(clients)
    .map(([client, workOrderValue]) => ({ client, workOrderValue }))
    .sort((a, b) => b.workOrderValue - a.workOrderValue)
    .slice(0, 5);
}

function buildHealth(
  projects: DashboardProjectRow[],
  pendingQtyByProject: Map<string, number>,
  pendingPctByProject: Map<string, number>
) {
  let onTrack = 0;
  let atRisk = 0;
  let delayed = 0;
  let notStarted = 0;
  let scheduleNotSet = 0;
  let total = 0;

  for (const project of projects) {
    const bucket = classifyHealth({
      projectStatus: project.projectStatus,
      startDateKey: toDateKey(project.projectStartDate),
      endDateKey: project.projectEndDate ? toDateKey(project.projectEndDate) : "",
      totalPendingQty: pendingQtyByProject.get(project.id) ?? 0,
      pendingInvoicePercentage: pendingPctByProject.get(project.id) ?? 0,
    });
    if (bucket === "skip") continue;
    total += 1;
    if (bucket === "onTrack") onTrack += 1;
    else if (bucket === "atRisk") atRisk += 1;
    else if (bucket === "delayed") delayed += 1;
    else if (bucket === "notStarted") notStarted += 1;
    else if (bucket === "scheduleNotSet") scheduleNotSet += 1;
  }

  return { onTrack, atRisk, delayed, notStarted, scheduleNotSet, total };
}

function buildRecentProjects(
  projects: DashboardProjectRow[],
  woByProject: Map<string, number>,
  ownWoByProject: Map<string, number>,
  currencyByProject: Map<string, string>
) {
  return [...projects]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map((project) => ({
      id: project.id,
      prNo: project.prNo,
      client: project.client,
      projectStatus: project.projectStatus,
      workOrderValueINR: woByProject.get(project.id) || 0,
      workOrderValue: ownWoByProject.get(project.id) || 0,
      currency: currencyByProject.get(project.id) ?? "INR",
      createdAt: project.createdAt.toISOString(),
    }));
}

function buildDepartments(
  projects: DashboardProjectRow[],
  woByProject: Map<string, number>,
  invoiceByProject: Map<string, InvoiceLineRow[]>,
  resourcesByProject: Map<string, dashboardRepo.ResourceRow[]>,
  completionByProject: Map<string, number>,
  milestonesByProject: Map<string, { id: string; paymentPercentage: number }[]>,
  timesheetPendingItems: { department: string }[]
) {
  const pendingByDepartment: Record<string, number> = {};
  for (const row of timesheetPendingItems) {
    const dept = row.department?.trim() || "Design Engineering";
    pendingByDepartment[dept] = (pendingByDepartment[dept] ?? 0) + 1;
  }

  const deptMap: Record<string, DashboardProjectRow[]> = {};
  for (const name of DEFAULT_DEPARTMENTS) {
    deptMap[name] = [];
  }
  for (const p of projects) {
    const deptName = p.department?.trim() || "Design Engineering";
    if (!deptMap[deptName]) deptMap[deptName] = [];
    deptMap[deptName].push(p);
  }

  let totalProjectsCount = 0;
  let totalTeamCount = 0;
  let totalCompletionSum = 0;
  let deptCountWithProjects = 0;

  const list: DepartmentOpsDto[] = Object.entries(deptMap).map(([deptName, deptProjects]) => {
    const activeProjects = deptProjects.filter((p) => p.projectStatus !== "Cancelled").length;
    const completedProjects = deptProjects.filter((p) => p.projectStatus === "Completed").length;
    const onHoldProjects = deptProjects.filter((p) => p.projectStatus === "On Hold").length;
    totalProjectsCount += activeProjects;

    let teamMembers = 0;
    let pendingInvoices = 0;
    const timesheetPending = pendingByDepartment[deptName] ?? 0;
    let upcomingDeliveries = 0;
    let workOrderValue = 0;
    let delayedProjects = 0;
    const deptProjectCompletions: { projectStatus: string; completion: number }[] = [];

    for (const p of deptProjects) {
      teamMembers += (resourcesByProject.get(p.id) ?? []).length;
      workOrderValue += woByProject.get(p.id) || 0;

      for (const line of invoiceByProject.get(p.id) ?? []) {
        if (line.status === "Raised" || line.status === "PartiallyPaid" || line.status === "Draft") {
          pendingInvoices += 1;
        }
      }

      upcomingDeliveries += (milestonesByProject.get(p.id) ?? []).length;
      const comp = completionByProject.get(p.id) ?? 0;
      deptProjectCompletions.push({ projectStatus: p.projectStatus, completion: comp });
      if (p.projectStatus === "Delayed" || (p.projectStatus === "Active" && comp < 30)) {
        delayedProjects += 1;
      }
    }

    const completion = calculateDepartmentCompletion(deptProjectCompletions);
    if (deptProjects.length > 0) {
      totalTeamCount += teamMembers;
      totalCompletionSum += completion;
      deptCountWithProjects += 1;
    }

    const workloadPercent = departmentWorkloadPercent(activeProjects, teamMembers, pendingInvoices);

    return {
      department: deptName,
      activeProjects,
      completedProjects,
      onHoldProjects,
      delayedProjects,
      teamMembers,
      pendingInvoices,
      timesheetPending,
      upcomingDeliveries,
      completion,
      workOrderValue,
      workloadPercent,
    };
  });

  list.sort((a, b) => b.workloadPercent - a.workloadPercent);

  const avgComp = deptCountWithProjects > 0 ? Math.round(totalCompletionSum / deptCountWithProjects) : 0;

  return {
    list,
    totals: {
      departments: list.length,
      totalProjects: totalProjectsCount || projects.length,
      teamMembers: totalTeamCount,
      averageCompletion: avgComp,
    },
  };
}
