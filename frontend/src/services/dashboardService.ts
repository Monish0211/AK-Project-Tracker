import { getProjects } from "./projectService";
import { getGrossProfit, getTotalProjectCost } from "./expenseService";
import { getProjectCommercialSummary } from "./invoiceProgressService";
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
  let totalPaymentReceived = 0;

  projects.forEach((project) => {
    const summary = getProjectCommercialSummary(project);
    totalInvoiceRaised += summary.totalInvoiceRaised;
    totalOutstanding += summary.outstandingCollection;
    totalPaymentReceived += summary.totalPaymentReceived;
  });

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
   project notes, per-activity invoice lines) — no synthetic/mock events.
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

    (project.invoiceItems || []).forEach((item) => {
      (item.invoices || []).forEach((line) => {
        if (line.status === "Cancelled") return;
        events.push({
          id: `invoice-${line.id}`,
          category: "Invoice",
          title: "Invoice Raised",
          description: `${line.invoiceNo} raised for ${project.client || project.prNo}.`,
          projectRef: project.prNo,
          timestamp: line.invoiceDate,
        });

        if (line.status === "Paid") {
          events.push({
            id: `payment-${line.id}`,
            category: "Payment",
            title: "Payment Received",
            description: `${project.client || project.prNo} paid ₹ ${line.invoiceAmountINR.toLocaleString("en-IN")} against ${line.invoiceNo}.`,
            projectRef: project.prNo,
            timestamp: line.invoiceDate,
          });
        }
      });
    });
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

export interface HoursOverrunWidgetResult {
  totalMatchingProjects: number;
  top5Projects: HoursOverrunProjectSummary[];
  allMatchingProjects: HoursOverrunProjectSummary[];
}

export const getProjectsWithHoursOverrun = (): HoursOverrunWidgetResult => {
  const projects = getProjects().filter(
    (p) => p.projectStatus !== "Archived" && p.projectStatus !== "Cancelled"
  );

  const timesheetImports = getAllTimesheetImports();
  const overrunProjects: HoursOverrunProjectSummary[] = [];

  projects.forEach((p) => {
    const budget = Number(p.manhourBudgetHours) || Number(p.totalHoursBudget) || 0;
    const actual = getProjectActualHours(p.prNo, timesheetImports);

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

  overrunProjects.sort((a, b) => b.hoursOverrun - a.hoursOverrun);

  return {
    totalMatchingProjects: overrunProjects.length,
    top5Projects: overrunProjects.slice(0, 5),
    allMatchingProjects: overrunProjects,
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
}

export interface ProjectTimelineAlertWidgetResult {
  totalMatchingProjects: number;
  top5Projects: DurationOverrunProjectSummary[];
  allAlertProjects: DurationOverrunProjectSummary[];
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

const DAY_IN_MILLISECONDS = 1000 * 60 * 60 * 24;

const toLocalCalendarDate = (value: string): Date | null => {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
};

const getLocalDayNumber = (date: Date): number =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_IN_MILLISECONDS;

/** Single source of truth: status is based only on End Date and local today. */
export const calculateTimelineAlert = (
  projectEndDate: string,
  currentDate = new Date()
): Pick<DurationOverrunProjectSummary, "daysRemaining" | "daysDisplay" | "priority" | "status" | "sortRank"> | null => {
  const endDate = toLocalCalendarDate(projectEndDate);
  if (!endDate) return null;

  const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  const daysRemaining = getLocalDayNumber(endDate) - getLocalDayNumber(today);

  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    return { daysRemaining, daysDisplay: `${overdueDays} Day${overdueDays === 1 ? "" : "s"} Overdue`, priority: "DarkRed", status: "Overdue", sortRank: 5 };
  }
  if (daysRemaining === 0) {
    return { daysRemaining, daysDisplay: "Due Today", priority: "Red", status: "Due Today", sortRank: 1 };
  }
  if (daysRemaining <= 7) {
    return { daysRemaining, daysDisplay: `${daysRemaining} Day${daysRemaining === 1 ? "" : "s"} Left`, priority: "Orange", status: "Due Soon", sortRank: 2 };
  }
  if (daysRemaining <= 14) {
    return { daysRemaining, daysDisplay: `${daysRemaining} Day${daysRemaining === 1 ? "" : "s"} Left`, priority: "Yellow", status: "Upcoming", sortRank: 3 };
  }
  return { daysRemaining, daysDisplay: `${daysRemaining} Day${daysRemaining === 1 ? "" : "s"} Left`, priority: "Green", status: "On Track", sortRank: 4 };
};

export const getProjectTimelineAlerts = (): ProjectTimelineAlertWidgetResult => {
  // Only active projects remain eligible for schedule monitoring. Completed
  // and Cancelled projects are excluded before any timeline calculation.
  const projects = getProjects().filter((project) => project.projectStatus === "Active");

  const alerts: DurationOverrunProjectSummary[] = [];
  let dueSoonCount = 0;
  let upcomingCount = 0;
  let dueTodayCount = 0;
  let overdueCount = 0;
  let onTrackCount = 0;

  projects.forEach((p) => {
    if (!p.projectEndDate) return;
    const timeline = calculateTimelineAlert(p.projectEndDate);
    if (!timeline) return;

    if (timeline.status === "Due Today") dueTodayCount++;
    else if (timeline.status === "Due Soon") dueSoonCount++;
    else if (timeline.status === "Upcoming") upcomingCount++;
    else if (timeline.status === "On Track") onTrackCount++;
    else overdueCount++;

    const name = p.client
      ? `${p.client} – ${p.projectTitle}`
      : p.projectTitle || "Untitled Project";

    alerts.push({
      id: p.id,
      prNumber: p.prNo || "N/A",
      projectName: name,
      // Kept only for the existing table column; it does not affect timeline logic.
      startDate: p.projectStartDate,
      endDate: p.projectEndDate,
      ...timeline,
    });
  });

  alerts.sort((a, b) => {
    if (a.sortRank !== b.sortRank) {
      return a.sortRank - b.sortRank;
    }
    return a.daysRemaining - b.daysRemaining;
  });

  const alertProjects = alerts;

  return {
    totalMatchingProjects: alerts.length,
    top5Projects: alerts.slice(0, 5),
    allAlertProjects: alertProjects,
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
