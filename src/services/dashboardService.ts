import { getProjects } from "./projectService";
import { getGrossProfit, getTotalProjectCost } from "./expenseService";
import { getProjectCommercialSummary } from "./invoiceProgressService";
import { getInvoices } from "./invoiceService";
import { getAllTimesheetImports } from "./timesheetService";
import { getProjectActualHours } from "./timesheetSyncService";
import { getEmployees } from "./employeeService";

export interface DashboardMetrics {
  totalProjects: number;
  totalWOValue: number;
  totalInvoiceRaised: number;
  totalPaymentReceived: number;
  totalOutstanding: number;
  totalExpenses: number;
  totalProfit: number;
  totalProfitPercentage: number;
}

/* ===================================================
   KPI METRICS
=================================================== */

export const getDashboardMetrics = (): DashboardMetrics => {
  const projects = getProjects();

  const totalProjects = projects.length;

  const totalWOValue = projects.reduce(
    (sum, project) => sum + (project.workOrderValueINR || 0),
    0
  );

  let totalInvoiceRaised = 0;
  let totalOutstanding = 0;

  projects.forEach((project) => {
    const summary = getProjectCommercialSummary(project);
    totalInvoiceRaised += summary.totalInvoiceRaised;
    totalOutstanding += summary.outstandingCollection;
  });

  // Payment Received is tracked separately in the standalone Invoices module
  // (project.invoiceItems / Invoice History has no payment-collection data).
  const totalPaymentReceived = getInvoices()
    .filter((invoice) => invoice.status !== "Cancelled")
    .reduce((sum, invoice) => sum + (invoice.receivedAmount || 0), 0);

  const totalExpenses = projects.reduce(
    (sum, project) =>
      sum +
      getTotalProjectCost(
        project.manhourExpenses,
        project.nonManhourExpenses
      ),
    0
  );

  const totalProfit = projects.reduce(
    (sum, project) =>
      sum +
      getGrossProfit(
        project.workOrderValueINR || 0,
        getTotalProjectCost(
          project.manhourExpenses,
          project.nonManhourExpenses
        )
      ),
    0
  );

  const totalProfitPercentage =
    totalWOValue === 0
      ? 0
      : (totalProfit / totalWOValue) * 100;

  return {
    totalProjects,
    totalWOValue,
    totalInvoiceRaised,
    totalPaymentReceived,
    totalOutstanding,
    totalExpenses,
    totalProfit,
    totalProfitPercentage,
  };
};

/* ===================================================
   PROJECT STATUS
=================================================== */

export const getProjectStatusData = () => {
  const projects = getProjects();

  // Always General Information → Project Status. Never derived from Invoice
  // History / commercial calculations.
  const status = {
    Active: 0,
    "On Hold": 0,
    Completed: 0,
    Cancelled: 0,
  };

  projects.forEach((project) => {
    if (project.projectStatus === "Active") {
      status.Active++;
    } else if (project.projectStatus === "On Hold") {
      status["On Hold"]++;
    } else if (project.projectStatus === "Completed") {
      status.Completed++;
    } else if (project.projectStatus === "Cancelled") {
      status.Cancelled++;
    }
  });

  return [
    {
      name: "Active",
      value: status.Active,
    },
    {
      name: "On Hold",
      value: status["On Hold"],
    },
    {
      name: "Completed",
      value: status.Completed,
    },
    {
      name: "Cancelled",
      value: status.Cancelled,
    },
  ];
};

/* ===================================================
   DEPARTMENT SUMMARY
=================================================== */

export const getDepartmentSummary = () => {
  const projects = getProjects();

  const departments: Record<string, number> = {};

  projects.forEach((project) => {
    const department =
      project.department?.trim() || "Unassigned";

    departments[department] =
      (departments[department] || 0) + 1;
  });

  return Object.entries(departments)
    .map(([department, count]) => ({
      department,
      count,
    }))
    .sort((a, b) => b.count - a.count);
};

/* ===================================================
   TOP CLIENTS
=================================================== */

/* ===================================================
   TOP CLIENTS
=================================================== */

export const getTopClients = () => {
  const projects = getProjects();

  const clients: Record<string, number> = {};

  projects.forEach((project) => {
    const client =
      project.client?.trim() || "Unknown";

    clients[client] =
      (clients[client] || 0) +
      (project.workOrderValueINR || 0);
  });

  return Object.entries(clients)
    .map(([client, workOrderValue]) => ({
      client,
      workOrderValue,
    }))
    .sort(
      (a, b) =>
        b.workOrderValue - a.workOrderValue
    )
    .slice(0, 5);
};

/* ===================================================
   RECENT PROJECTS
=================================================== */

export const getRecentProjects = () => {
  return getProjects()
    .sort(
      (a, b) =>
        new Date(b.createdAt ?? "").getTime() -
        new Date(a.createdAt ?? "").getTime()
    )
    .slice(0, 5);
};

/* ===================================================
   PROJECT HEALTH SUMMARY
   Schedule-health lens derived from General Information dates and pending
   quantity/invoice progress — independent of (and additional to) the
   Active/On Hold/Completed/Cancelled Project Status field above.
=================================================== */

export interface ProjectHealthSummary {
  onTrack: number;
  atRisk: number;
  delayed: number;
  notStarted: number;
  total: number;
}

const AT_RISK_WINDOW_DAYS = 14;

export const getProjectHealthSummary = (): ProjectHealthSummary => {
  // Completed/Cancelled projects are out of scope for an in-progress
  // schedule-health rollup.
  const projects = getProjects().filter(
    (project) =>
      project.projectStatus !== "Completed" &&
      project.projectStatus !== "Cancelled"
  );

  const today = new Date();

  let onTrack = 0;
  let atRisk = 0;
  let delayed = 0;
  let notStarted = 0;

  projects.forEach((project) => {
    const start = project.projectStartDate ? new Date(project.projectStartDate) : null;
    const end = project.projectEndDate ? new Date(project.projectEndDate) : null;
    const hasPendingWork =
      (project.totalPendingQty || 0) > 0 || (project.pendingInvoicePercentage || 0) > 0;

    if (start && !Number.isNaN(start.getTime()) && start.getTime() > today.getTime()) {
      notStarted++;
      return;
    }

    if (end && !Number.isNaN(end.getTime())) {
      const daysToEnd = (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

      if (daysToEnd < 0) {
        delayed++;
        return;
      }

      if (daysToEnd <= AT_RISK_WINDOW_DAYS && hasPendingWork) {
        atRisk++;
        return;
      }
    }

    onTrack++;
  });

  return { onTrack, atRisk, delayed, notStarted, total: projects.length };
};

/* ===================================================
   RECENT ACTIVITY
   Derived from real, already-timestamped records (project audit fields,
   project notes, standalone invoice records) — no synthetic/mock events.
=================================================== */

export interface ActivityEvent {
  id: string;
  category: "Project" | "Invoice" | "Payment" | "Notes";
  title: string;
  description: string;
  projectRef: string;
  timestamp: string;
}

export const getRecentActivity = (limit = 8): ActivityEvent[] => {
  const projects = getProjects();
  const invoices = getInvoices();
  const events: ActivityEvent[] = [];

  projects.forEach((project) => {
    if (project.createdAt) {
      events.push({
        id: `${project.id}-created`,
        category: "Project",
        title: "Project Created",
        description: `${project.projectTitle || project.prNo} added for ${project.client || "client"}.`,
        projectRef: project.prNo,
        timestamp: project.createdAt,
      });
    }

    if (project.updatedAt && project.updatedAt !== project.createdAt) {
      events.push({
        id: `${project.id}-updated`,
        category: "Project",
        title: "Project Updated",
        description: `${project.projectTitle || project.prNo} details were updated.`,
        projectRef: project.prNo,
        timestamp: project.updatedAt,
      });
    }

    (project.notes || []).forEach((note) => {
      events.push({
        id: `note-${note.id}`,
        category: "Notes",
        title: "Project Note Added",
        description: note.message,
        projectRef: project.prNo,
        timestamp: note.createdAt,
      });
    });
  });

  invoices.forEach((invoice) => {
    events.push({
      id: `invoice-${invoice.id}`,
      category: "Invoice",
      title: "Invoice Raised",
      description: `${invoice.invoiceRef} raised for ${invoice.client}.`,
      projectRef: invoice.prNo,
      timestamp: invoice.createdAt,
    });

    if (invoice.receivedAmount > 0) {
      events.push({
        id: `payment-${invoice.id}`,
        category: "Payment",
        title: "Payment Received",
        description: `${invoice.client} paid ₹ ${invoice.receivedAmount.toLocaleString("en-IN")} against ${invoice.invoiceRef}.`,
        projectRef: invoice.prNo,
        timestamp: invoice.updatedAt || invoice.createdAt,
      });
    }
  });

  return events
    .filter((event) => !!event.timestamp)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
};

/* ===================================================
   EXECUTIVE RISK SUMMARY WIDGETS
=================================================== */

export interface HoursOverrunProjectSummary {
  id: string;
  prNumber: string;
  projectName: string;
  budgetHours: number;
  actualHours: number;
  hoursOverrun: number;
  percentOverrun: number;
  formattedBudgetHours: string;
  formattedActualHours: string;
  formattedHoursOverrun: string;
  formattedPercentOverrun: string;
  status: "Loss";
}

export interface HoursOverrunWidgetResult {
  totalMatchingProjects: number;
  top5Projects: HoursOverrunProjectSummary[];
}

export const getProjectsWithHoursOverrun = (): HoursOverrunWidgetResult => {
  const projects = getProjects().filter(
    (p) => p.projectStatus !== "Archived" && p.projectStatus !== "Cancelled"
  );

  const timesheetImports = getAllTimesheetImports();
  const overrunProjects: HoursOverrunProjectSummary[] = [];

  projects.forEach((p) => {
    // Budget Hours from Expense Budget -> Budget Hours (or totalHoursBudget fallback)
    const budget = Number(p.manhourBudgetHours) || Number(p.totalHoursBudget) || 0;

    // Actual Hours: the project's LIFETIME total from TimesheetProcessingService
    // (every imported month for this project summed, consolidated by
    // Employee + Project + Work Date) — never just the month currently
    // selected in Team Assigned. That month selector is a display-only UI
    // filter; changing it must never change this widget's numbers.
    const actual = getProjectActualHours(p.prNo, timesheetImports);

    // Filter Logic: BudgetHours > 0 AND ActualHours > BudgetHours
    const isIncluded = budget > 0 && actual > budget;
    const overrun = actual - budget;

    if (isIncluded) {
      const pct = parseFloat((((actual - budget) / budget) * 100).toFixed(1));
      const name = p.client
        ? `${p.client} – ${p.projectTitle}`
        : p.projectTitle || "Untitled Project";

      overrunProjects.push({
        id: p.id,
        prNumber: p.prNo || "N/A",
        projectName: name,
        budgetHours: budget,
        actualHours: actual,
        hoursOverrun: overrun,
        percentOverrun: pct,
        formattedBudgetHours: `${Math.round(budget)} hrs`,
        formattedActualHours: `${Math.round(actual)} hrs`,
        formattedHoursOverrun: `+${overrun % 1 === 0 ? overrun.toFixed(0) : overrun.toFixed(2)} hrs`,
        formattedPercentOverrun: `${pct.toFixed(1)}%`,
        status: "Loss",
      });
    }
  });

  // Sort descending by Hours Overrun (largest overrun first)
  overrunProjects.sort((a, b) => b.hoursOverrun - a.hoursOverrun);

  return {
    totalMatchingProjects: overrunProjects.length,
    top5Projects: overrunProjects.slice(0, 5),
  };
};

export type TimelineAlertPriority = "Orange" | "Yellow" | "Red" | "DarkRed" | "Green";

export interface DurationOverrunProjectSummary {
  id: string;
  prNumber: string;
  projectName: string;
  startDate: string;
  endDate: string;
  daysRemaining: number;
  daysDisplay: string;
  priority: TimelineAlertPriority;
  status: string;
  sortRank: number;
  plannedDurationDays: number;
  actualDurationDays: number;
  delayDays: number;
  percentDelay: number;
  formattedPlannedDuration: string;
  formattedActualDuration: string;
  formattedDelayDays: string;
  formattedPercentDelay: string;
}

export interface ProjectTimelineAlertWidgetResult {
  totalMatchingProjects: number;
  top5Projects: DurationOverrunProjectSummary[];
  dueSoonCount: number;
  upcomingCount: number;
  dueTodayCount: number;
  overdueCount: number;
  onTrackCount: number;
}

export interface DurationOverrunWidgetResult {
  totalMatchingProjects: number;
  top5Projects: DurationOverrunProjectSummary[];
}

export const getProjectTimelineAlerts = (): ProjectTimelineAlertWidgetResult => {
  // Business Rule: Display ONLY Active projects
  const projects = getProjects().filter((p) => p.projectStatus === "Active");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const alerts: DurationOverrunProjectSummary[] = [];
  let dueSoonCount = 0;
  let upcomingCount = 0;
  let dueTodayCount = 0;
  let overdueCount = 0;
  let onTrackCount = 0;

  projects.forEach((p) => {
    if (!p.projectStartDate || !p.projectEndDate) return;

    const startDateObj = new Date(p.projectStartDate);
    const endDateObj = new Date(p.projectEndDate);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) return;

    const endCal = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate());
    const startCal = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate());

    const diffTime = endCal.getTime() - today.getTime();
    const daysRemaining = Math.round(diffTime / (1000 * 3600 * 24));

    let priority: TimelineAlertPriority;
    let statusText: string;
    let daysDisplay: string;
    let sortRank: number;

    if (daysRemaining < 0) {
      // 5. Past Due (Beginning the day AFTER the due date)
      // Status: Overdue | Color: Dark Red
      const overdueDays = Math.abs(daysRemaining);
      priority = "DarkRed";
      statusText = "Overdue";
      daysDisplay = `${overdueDays} Day${overdueDays === 1 ? "" : "s"} Overdue`;
      sortRank = 4;
      overdueCount++;
    } else if (daysRemaining === 0) {
      // 4. Due Today (Exact due date)
      // Status: Due Today | Color: Red
      priority = "Red";
      statusText = "Due Today";
      daysDisplay = "Due Today";
      sortRank = 3;
      dueTodayCount++;
    } else if (daysRemaining <= 7) {
      // 1. Due within the next 7 calendar days
      // Status: Due Soon | Color: Orange | Highest priority in table (rank 1)
      priority = "Orange";
      statusText = "Due Soon";
      daysDisplay = `${daysRemaining} Day${daysRemaining === 1 ? "" : "s"} Left`;
      sortRank = 1;
      dueSoonCount++;
    } else if (daysRemaining <= 14) {
      // 2. Due within 8–14 calendar days
      // Status: Upcoming | Color: Yellow (rank 2)
      priority = "Yellow";
      statusText = "Upcoming";
      daysDisplay = `${daysRemaining} Day${daysRemaining === 1 ? "" : "s"} Left`;
      sortRank = 2;
      upcomingCount++;
    } else {
      // 3. Due in more than 14 days
      // Status: On Track | Color: Green (rank 5)
      priority = "Green";
      statusText = "On Track";
      daysDisplay = `${daysRemaining} Day${daysRemaining === 1 ? "" : "s"} Left`;
      sortRank = 5;
      onTrackCount++;
    }

    const plannedDurationDays = Math.max(
      1,
      Math.round((endCal.getTime() - startCal.getTime()) / (1000 * 3600 * 24))
    );
    const actualDurationDays = Math.max(
      0,
      Math.round((today.getTime() - startCal.getTime()) / (1000 * 3600 * 24))
    );
    const delayDays = daysRemaining < 0 ? Math.abs(daysRemaining) : 0;
    const percentDelay = parseFloat(((delayDays / plannedDurationDays) * 100).toFixed(1));

    const name = p.client
      ? `${p.client} – ${p.projectTitle}`
      : p.projectTitle || "Untitled Project";

    alerts.push({
      id: p.id,
      prNumber: p.prNo || "N/A",
      projectName: name,
      startDate: p.projectStartDate,
      endDate: p.projectEndDate,
      daysRemaining,
      daysDisplay,
      priority,
      status: statusText,
      sortRank,
      plannedDurationDays,
      actualDurationDays,
      delayDays,
      percentDelay,
      formattedPlannedDuration: `${plannedDurationDays} Days`,
      formattedActualDuration: `${actualDurationDays} Days`,
      formattedDelayDays: delayDays > 0 ? `+${delayDays} Days` : "0 Days",
      formattedPercentDelay: `${percentDelay.toFixed(1)}%`,
    });
  });

  // Sorting Priority Order:
  // 1. Due Soon (Orange) - sortRank 1
  // 2. Upcoming (Yellow) - sortRank 2
  // 3. Due Today (Red) - sortRank 3
  // 4. Overdue (Dark Red) - sortRank 4
  // 5. On Track (Green) - sortRank 5
  // Secondary sort: daysRemaining ascending
  alerts.sort((a, b) => {
    if (a.sortRank !== b.sortRank) {
      return a.sortRank - b.sortRank;
    }
    return a.daysRemaining - b.daysRemaining;
  });

  return {
    totalMatchingProjects: alerts.length,
    top5Projects: alerts.slice(0, 5),
    dueSoonCount,
    upcomingCount,
    dueTodayCount,
    overdueCount,
    onTrackCount,
  };
};

export const getProjectsWithDurationOverrun = (): DurationOverrunWidgetResult => {
  const result = getProjectTimelineAlerts();
  return {
    totalMatchingProjects: result.totalMatchingProjects,
    top5Projects: result.top5Projects,
  };
};

/* ===================================================
   TEAM LEADS – PROJECT WORKLOAD WIDGET
=================================================== */

export interface TeamLeadWorkloadSummary {
  reportingManager: string;
  activeProjectsCount: number;
  totalWorkOrderValue: number;
  formattedWorkOrderValue: string;
  status: "High" | "Medium" | "Normal";
}

export interface TeamLeadWorkloadWidgetResult {
  totalReportingManagers: number;
  top5Leads: TeamLeadWorkloadSummary[];
}

function formatCurrencyCompact(amount: number): string {
  if (!amount || amount === 0) return "₹ 0";
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    return `₹ ${cr.toFixed(2)} Cr`;
  }
  if (amount >= 100000) {
    const lakh = amount / 100000;
    return `₹ ${lakh.toFixed(2)} L`;
  }
  return `₹ ${amount.toLocaleString("en-IN")}`;
}

export const getTeamLeadsWorkload = (): TeamLeadWorkloadWidgetResult => {
  // Business Rule: Only active projects
  const activeProjects = getProjects().filter((p) => p.projectStatus === "Active");
  const masterEmployees = getEmployees();

  // Map: Reporting Manager -> { projectIds: Set<string>, totalWOValue: number }
  const managerDataMap: Map<string, { projectIds: Set<string>; totalWOValue: number }> = new Map();

  activeProjects.forEach((project) => {
    const woValue = Number(project.workOrderValueINR) || 0;
    const projectManagersInThisProject = new Set<string>();

    // 1. Collect unique reporting managers from project resources
    (project.resources || []).forEach((resource) => {
      let managerName = (resource.reportingManager || "").trim();

      // If managerName empty, lookup from master employees
      if (!managerName && resource.employeeNo) {
        const emp = masterEmployees.find(
          (e) => e.employeeNo.trim().toLowerCase() === resource.employeeNo.trim().toLowerCase()
        );
        if (emp?.reportingManager) {
          managerName = emp.reportingManager.trim();
        }
      }

      if (
        managerName &&
        managerName !== "—" &&
        managerName.toLowerCase() !== "unassigned" &&
        managerName.toLowerCase() !== "null"
      ) {
        projectManagersInThisProject.add(managerName);
      }
    });

    // 2. Fallback to primaryProjectManager if resources list is unpopulated
    if (projectManagersInThisProject.size === 0) {
      if (
        project.primaryProjectManager &&
        project.primaryProjectManager.trim() &&
        project.primaryProjectManager !== "—"
      ) {
        projectManagersInThisProject.add(project.primaryProjectManager.trim());
      }
    }

    // Add this project to each unique manager's map ONCE per project
    projectManagersInThisProject.forEach((mgr) => {
      if (!managerDataMap.has(mgr)) {
        managerDataMap.set(mgr, { projectIds: new Set(), totalWOValue: 0 });
      }
      const data = managerDataMap.get(mgr)!;
      if (!data.projectIds.has(project.id)) {
        data.projectIds.add(project.id);
        data.totalWOValue += woValue;
      }
    });
  });

  const list: TeamLeadWorkloadSummary[] = [];

  managerDataMap.forEach((data, managerName) => {
    const activeProjectsCount = data.projectIds.size;
    let status: "High" | "Medium" | "Normal" = "Normal";

    // Business Rules Status Badges:
    // High: 10 or more Active Projects
    // Medium: 5 to 9 Active Projects
    // Normal: Less than 5 Active Projects
    if (activeProjectsCount >= 10) {
      status = "High";
    } else if (activeProjectsCount >= 5) {
      status = "Medium";
    }

    list.push({
      reportingManager: managerName,
      activeProjectsCount,
      totalWorkOrderValue: data.totalWOValue,
      formattedWorkOrderValue: formatCurrencyCompact(data.totalWOValue),
      status,
    });
  });

  // Sort descending by Active Projects, then by Total WO Value
  list.sort((a, b) => {
    if (b.activeProjectsCount !== a.activeProjectsCount) {
      return b.activeProjectsCount - a.activeProjectsCount;
    }
    return b.totalWorkOrderValue - a.totalWorkOrderValue;
  });

  return {
    totalReportingManagers: list.length,
    top5Leads: list.slice(0, 5),
  };
};