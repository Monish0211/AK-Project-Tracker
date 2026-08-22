import { apiClient } from "./apiClient";

/**
 * Live Dashboard portfolio data — GET /dashboard/summary.
 * Formulas live in Backend/src/modules/dashboard; this file only fetches.
 */

export interface DashboardKpis {
  totalProjects: number;
  totalWOValue: number;
  totalInvoiceRaised: number;
  totalPaymentReceived: number;
  totalOutstanding: number;
  totalExpenses: number;
  totalActualProjectCost: number;
  totalProfit: number;
  totalProfitPercentage: number;
}


export interface HoursOverrunProject {
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

export interface HoursOverrun {
  totalMatchingProjects: number;
  top5: HoursOverrunProject[];
}

export type TimelineAlertPriority = "Orange" | "Yellow" | "Red" | "DarkRed" | "Green";

export interface TimelineAlertProject {
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

export interface TimelineAlerts {
  totalMatchingProjects: number;
  top10: TimelineAlertProject[];
  dueSoonCount: number;
  upcomingCount: number;
  dueTodayCount: number;
  overdueCount: number;
  onTrackCount: number;
}

export interface TeamLeadWorkload {
  reportingManager: string;
  activeProjectsCount: number;
  totalWorkOrderValue: number;
  formattedWorkOrderValue: string;
  status: "High" | "Medium" | "Normal";
}

export interface TeamLeads {
  totalReportingManagers: number;
  top5: TeamLeadWorkload[];
}

export interface TimesheetPendingItem {
  projectId: string;
  prNo: string;
  projectTitle: string;
  department: string;
  projectManager: string | null;
  pmoCoordinator: string | null;
  latestTimesheetDate: string | null;
  trackingStartDate: string | null;
  daysSinceLatestTimesheet: number;
  status: "PENDING";
}

export interface ActivityEvent {
  id: string;
  category: "Project" | "Invoice" | "Payment" | "Notes";
  title: string;
  description: string;
  projectRef: string;
  timestamp: string;
}

export interface TopClient {
  client: string;
  workOrderValue: number;
}

export interface ProjectHealth {
  onTrack: number;
  atRisk: number;
  delayed: number;
  notStarted: number;
  scheduleNotSet: number;
  total: number;
}

export interface RecentProject {
  id: string;
  prNo: string;
  client: string;
  projectStatus: string;
  workOrderValueINR: number;
  createdAt: string;
}

export interface DepartmentOps {
  department: string;
  activeProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  delayedProjects: number;
  teamMembers: number;
  pendingInvoices: number;
  timesheetPending: number;
  upcomingDeliveries: number;
  completion: number;
  workOrderValue: number;
  workloadPercent: number;
}

export interface Departments {
  list: DepartmentOps[];
  totals: {
    departments: number;
    totalProjects: number;
    teamMembers: number;
    averageCompletion: number;
  };
}

export interface DashboardSummary {
  generatedAt: string;
  kpis: DashboardKpis;
  hoursOverrun: HoursOverrun;
  timelineAlerts: TimelineAlerts;
  teamLeads: TeamLeads;
  timesheetPending: { items: TimesheetPendingItem[] };
  activity: { items: ActivityEvent[] };
  topClients: TopClient[];
  health: ProjectHealth;
  recentProjects: RecentProject[];
  departments: Departments;
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return apiClient.get<DashboardSummary>("/dashboard/summary");
}
