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
  /** Phase 4: projects in this currency whose man-hour cost is incomplete (no conversion rate applied); 0 for INR. Absent from an older server. */
  manhourIncompleteProjects?: number;
  /** Phase 4 / Option A: projects whose automatic recalculation after an employee-rate change is pending or failed (figures may be out of date). */
  manhourRefreshPendingProjects?: number;
  totalProfit: number;
  totalProfitPercentage: number;
}


/** The headline totals of one currency; different currencies are never added together (Phase 3). */
export interface DashboardCurrencyKpis extends DashboardKpis {
  currency: string;
}

export interface HoursOverrunProject {
  id: string;
  prNumber: string;
  projectName: string;
  projectManager: string | null;
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
  // P2-05 — same authoritative list top5 is sliced from; the Financial Loss
  // drill-down (FinancialLossProjects.tsx) renders this instead of
  // recomputing its own list from the frontend project mirror.
  allMatching: HoursOverrunProject[];
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

export interface TeamLeadWorkloadProjectRef {
  id: string;
  prNo: string;
}

/**
 * Aug 2026 — `reportingManager` now holds the assigned person's name,
 * sourced from QuantityItem.assignedTo (see Backend's buildTeamLeads()), not
 * Employee.reportingManager. Field name kept as-is to match the backend DTO
 * exactly — only where the value comes from changed. `projects` is additive.
 */
export interface TeamLeadWorkloadValue {
  currency: string;
  projects: number;
  totalWorkOrderValue: number;
  /** Formatted by the backend in the currency's own number convention (India Indian, every other country international). */
  formattedWorkOrderValue: string;
}

export interface TeamLeadWorkload {
  reportingManager: string;
  activeProjectsCount: number;
  /** The headline-currency total only (unchanged); use totalsByCurrency for every currency. */
  totalWorkOrderValue: number;
  formattedWorkOrderValue: string;
  /** The person's work order value per currency, headline currency first. */
  totalsByCurrency: TeamLeadWorkloadValue[];
  status: "High" | "Medium" | "Normal";
  projects: TeamLeadWorkloadProjectRef[];
}

/** One active project with at least one Quantity Details row missing an Assigned To — see Backend's buildTeamLeads(). */
export interface MissingAssigneeProject {
  id: string;
  prNo: string;
  projectTitle: string;
}

export interface TeamLeads {
  totalReportingManagers: number;
  top5: TeamLeadWorkload[];
  // Phase 2.2 — same authoritative list top5 is sliced from; the dedicated
  // Team Leads Workload drill-down (TeamLeadsWorkloadProjects.tsx) renders
  // this instead of recomputing its own list, mirroring HoursOverrun's own
  // top5/allMatching split for the Financial Loss drill-down.
  allAssigned: TeamLeadWorkload[];
  // Sept 2026 — Missing Assignee. Same active-project scope as the rest of
  // this object; purely derived server-side, never a second client-side
  // recomputation of this rule.
  missingAssignee: MissingAssigneeProject[];
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

/** One country's Top Clients ranking, in that country's own currency (never merged or added across countries). */
export interface CountryTopClients {
  countryKey: string;
  country: string;
  currency: string;
  clients: TopClient[];
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
  /** The work order value in the project's OWN regional currency, and that currency (Phase 3). Absent on an older backend (then INR). */
  workOrderValue?: number;
  currency?: string;
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

export interface CountryDepartments {
  countryKey: string;
  country: string;
  currency: string;
  departments: Departments;
}

export interface DashboardSummary {
  generatedAt: string;
  kpis: DashboardKpis;
  /** The currency `kpis` is in: INR whenever INR or legacy projects are in view, otherwise the one regional currency in view. Absent on an older backend (then INR). */
  kpiCurrency?: string;
  /** The totals of every other currency in view, listed separately. */
  otherCurrencies?: DashboardCurrencyKpis[];
  hoursOverrun: HoursOverrun;
  timelineAlerts: TimelineAlerts;
  teamLeads: TeamLeads;
  timesheetPending: { items: TimesheetPendingItem[] };
  activity: { items: ActivityEvent[] };
  topClients: TopClient[];
  /** Top Clients per country, each in its own currency. Absent on an older backend (then `topClients` is shown as before). */
  topClientsByCountry?: CountryTopClients[];
  health: ProjectHealth;
  recentProjects: RecentProject[];
  departments: Departments;
  /** The Departments panel per country, each in its own currency. Absent on an older backend. */
  departmentsByCountry?: CountryDepartments[];
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return apiClient.get<DashboardSummary>("/dashboard/summary");
}
