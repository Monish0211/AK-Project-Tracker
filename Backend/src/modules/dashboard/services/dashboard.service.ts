import { AppError } from "../../../shared/utils/AppError.js";
import { getTimesheetPendingProjects } from "../../timesheets/services/timesheetPending.service.js";
import { computeInvoiceProgress } from "../../../shared/utils/quantityProgress.js";
import type {
  ActivityEventDto,
  DashboardSummaryDto,
  DepartmentOpsDto,
  HoursOverrunProjectDto,
  TeamLeadWorkloadDto,
  TimelineAlertProjectDto,
} from "../dto/dashboard.dto.js";
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
  isUsableManagerName,
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
    invoiceLines,
    expenseTotals,
    manhourTotals,
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
    dashboardRepo.groupTimesheetHours(projectIds),
    dashboardRepo.findResourcesForProjects(projectIds),
    dashboardRepo.findNotesForProjects(projectIds),
    dashboardRepo.findMilestonesForProjects(projectIds),
    getTimesheetPendingProjects(callerUserId),
  ]);

  const employeeNos = [...new Set(resources.map((r) => r.employeeNo))];
  const employees = await dashboardRepo.findEmployeesByNos(employeeNos);
  const employeeManagerByNo = new Map(
    employees.map((e) => [e.employeeNo.trim().toLowerCase(), (e.reportingManager || "").trim()])
  );

  const qtyByProject = new Map(quantityTotals.map((row) => [row.projectId, row]));
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

  let totalWOValue = 0;
  let totalInvoiceRaised = 0;
  let totalPaymentReceived = 0;
  let totalExpenses = 0;
  let totalActualProjectCost = 0;

  const woByProject = new Map<string, number>();
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

    totalWOValue += woValue;
    totalInvoiceRaised += commercial.totalInvoiceRaised;
    totalPaymentReceived += commercial.totalPaymentReceived;
    totalExpenses += expenses;
    totalActualProjectCost += actualProjectCost(manhourCost, expenses);
  }

  const totalProfit = grossProfit(totalWOValue, totalActualProjectCost);

  const kpis = {
    totalProjects: projects.length,
    totalWOValue,
    totalInvoiceRaised,
    totalPaymentReceived,
    totalOutstanding: Math.max(0, totalWOValue - totalPaymentReceived),
    totalExpenses,
    totalActualProjectCost,
    totalProfit,
    totalProfitPercentage: profitPercentage(totalWOValue, totalProfit),
  };

  return {
    generatedAt: new Date().toISOString(),
    kpis,
    hoursOverrun: buildHoursOverrun(projects, woByProject, timesheetHours),
    timelineAlerts: buildTimelineAlerts(projects),
    teamLeads: buildTeamLeads(projects, woByProject, resourcesByProject, employeeManagerByNo),
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
    topClients: buildTopClients(projects, woByProject),
    health: buildHealth(projects, pendingQtyByProject, pendingPctByProject),
    recentProjects: buildRecentProjects(projects, woByProject),
    departments: buildDepartments(
      projects,
      woByProject,
      invoiceByProject,
      resourcesByProject,
      completionByProject,
      milestonesByProject,
      timesheetPendingItems
    ),
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

function buildTimelineAlerts(projects: DashboardProjectRow[]) {
  const alerts: TimelineAlertProjectDto[] = [];
  let dueSoonCount = 0;
  let upcomingCount = 0;
  let dueTodayCount = 0;
  let overdueCount = 0;
  let onTrackCount = 0;

  for (const p of projects) {
    if (p.projectStatus !== "Active") continue;
    if (!p.projectEndDate) continue;
    const timeline = calculateTimelineAlert(toDateKey(p.projectEndDate));
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

function buildTeamLeads(
  projects: DashboardProjectRow[],
  woByProject: Map<string, number>,
  resourcesByProject: Map<string, dashboardRepo.ResourceRow[]>,
  employeeManagerByNo: Map<string, string>
) {
  const managerDataMap = new Map<string, { projectIds: Set<string>; totalWOValue: number }>();

  for (const project of projects) {
    if (project.projectStatus !== "Active") continue;
    const woValue = woByProject.get(project.id) || 0;
    const projectManagers = new Set<string>();

    for (const resource of resourcesByProject.get(project.id) ?? []) {
      let managerName = employeeManagerByNo.get(resource.employeeNo.trim().toLowerCase()) || "";
      if (isUsableManagerName(managerName)) {
        projectManagers.add(managerName.trim());
      }
    }

    if (projectManagers.size === 0 && project.primaryProjectManager && isUsableManagerName(project.primaryProjectManager)) {
      projectManagers.add(project.primaryProjectManager.trim());
    }

    for (const mgr of projectManagers) {
      if (!managerDataMap.has(mgr)) {
        managerDataMap.set(mgr, { projectIds: new Set(), totalWOValue: 0 });
      }
      const data = managerDataMap.get(mgr);
      if (!data) continue;
      if (!data.projectIds.has(project.id)) {
        data.projectIds.add(project.id);
        data.totalWOValue += woValue;
      }
    }
  }

  const list: TeamLeadWorkloadDto[] = [];
  managerDataMap.forEach((data, managerName) => {
    const activeProjectsCount = data.projectIds.size;
    list.push({
      reportingManager: managerName,
      activeProjectsCount,
      totalWorkOrderValue: data.totalWOValue,
      formattedWorkOrderValue: formatCurrencyCompact(data.totalWOValue),
      status: teamLeadStatus(activeProjectsCount),
    });
  });

  list.sort((a, b) => {
    if (b.activeProjectsCount !== a.activeProjectsCount) return b.activeProjectsCount - a.activeProjectsCount;
    return b.totalWorkOrderValue - a.totalWorkOrderValue;
  });

  return {
    totalReportingManagers: list.length,
    top5: list.slice(0, 5),
  };
}

function buildActivity(
  projects: DashboardProjectRow[],
  notes: dashboardRepo.NoteRow[],
  invoiceByProject: Map<string, InvoiceLineRow[]>
): ActivityEventDto[] {
  const events: ActivityEventDto[] = [];
  const projectById = new Map(projects.map((p) => [p.id, p]));

  for (const project of projects) {
    events.push({
      id: `${project.id}-created`,
      category: "Project",
      title: "Project Created",
      description: `${project.projectTitle || project.prNo} added for ${project.client || "client"}.`,
      projectRef: project.prNo,
      timestamp: project.createdAt.toISOString(),
    });

    if (project.updatedAt.getTime() !== project.createdAt.getTime()) {
      events.push({
        id: `${project.id}-updated`,
        category: "Project",
        title: "Project Updated",
        description: `${project.projectTitle || project.prNo} details were updated.`,
        projectRef: project.prNo,
        timestamp: project.updatedAt.toISOString(),
      });
    }

    for (const line of invoiceByProject.get(project.id) ?? []) {
      if (line.status === "Cancelled") continue;
      events.push({
        id: `invoice-${line.id}`,
        category: "Invoice",
        title: "Invoice Raised",
        description: `${line.invoiceNo} raised for ${project.client || project.prNo}.`,
        projectRef: project.prNo,
        timestamp: line.invoiceDate.toISOString(),
      });
      if (line.status === "Paid") {
        events.push({
          id: `payment-${line.id}`,
          category: "Payment",
          title: "Payment Received",
          description: `${project.client || project.prNo} paid ₹ ${line.invoiceAmountINR.toLocaleString("en-IN")} against ${line.invoiceNo}.`,
          projectRef: project.prNo,
          timestamp: line.invoiceDate.toISOString(),
        });
      }
    }
  }

  for (const note of notes) {
    const project = projectById.get(note.projectId);
    if (!project) continue;
    events.push({
      id: `note-${note.id}`,
      category: "Notes",
      title: "Project Note Added",
      description: note.message,
      projectRef: project.prNo,
      timestamp: note.createdAt.toISOString(),
    });
  }

  return events
    .filter((event) => !!event.timestamp)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);
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

function buildRecentProjects(projects: DashboardProjectRow[], woByProject: Map<string, number>) {
  return [...projects]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5)
    .map((project) => ({
      id: project.id,
      prNo: project.prNo,
      client: project.client,
      projectStatus: project.projectStatus,
      workOrderValueINR: woByProject.get(project.id) || 0,
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
