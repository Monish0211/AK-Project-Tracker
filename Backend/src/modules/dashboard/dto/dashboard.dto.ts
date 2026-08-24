/**
 * GET /dashboard/summary — payload for the currently rendered Dashboard page
 * only (see frontend/src/pages/Dashboard/Dashboard.tsx). Shapes match the
 * live frontend dashboardService.ts / widget contracts so Phase 3 can swap
 * the client calculator for this response without inventing new fields.
 */

export interface DashboardKpisDto {
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


export interface HoursOverrunProjectDto {
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

export interface HoursOverrunDto {
  totalMatchingProjects: number;
  top5: HoursOverrunProjectDto[];
  // P2-05 — the Financial Loss drill-down (frontend/src/pages/Projects/
  // FinancialLossProjects.tsx) used to recompute this list itself from a
  // frontend localStorage project mirror + a separate client-side
  // actual-hours derivation, which could disagree with this exact
  // server-authoritative calculation (different budget-hours fallback,
  // different actual-hours source). allMatching reuses the SAME list top5
  // is sliced from — no second calculation — so the drill-down can render
  // the full set while staying byte-for-byte consistent with the tile.
  allMatching: HoursOverrunProjectDto[];
}

export type TimelineAlertPriority = "Orange" | "Yellow" | "Red" | "DarkRed" | "Green";

export interface TimelineAlertProjectDto {
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

export interface TimelineAlertsDto {
  totalMatchingProjects: number;
  top10: TimelineAlertProjectDto[];
  dueSoonCount: number;
  upcomingCount: number;
  dueTodayCount: number;
  overdueCount: number;
  onTrackCount: number;
}

export interface TeamLeadWorkloadDto {
  reportingManager: string;
  activeProjectsCount: number;
  totalWorkOrderValue: number;
  formattedWorkOrderValue: string;
  status: "High" | "Medium" | "Normal";
}

export interface TeamLeadsDto {
  totalReportingManagers: number;
  top5: TeamLeadWorkloadDto[];
}

export interface TimesheetPendingItemDto {
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

export interface ActivityEventDto {
  id: string;
  category: "Project" | "Invoice" | "Payment" | "Notes";
  title: string;
  description: string;
  projectRef: string;
  timestamp: string;
}

export interface TopClientDto {
  client: string;
  workOrderValue: number;
}

export interface ProjectHealthDto {
  onTrack: number;
  atRisk: number;
  delayed: number;
  notStarted: number;
  scheduleNotSet: number;
  total: number;
}

export interface RecentProjectDto {
  id: string;
  prNo: string;
  client: string;
  projectStatus: string;
  workOrderValueINR: number;
  createdAt: string;
}

export interface DepartmentOpsDto {
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

export interface DepartmentsDto {
  list: DepartmentOpsDto[];
  totals: {
    departments: number;
    totalProjects: number;
    teamMembers: number;
    averageCompletion: number;
  };
}

export interface DashboardSummaryDto {
  generatedAt: string;
  kpis: DashboardKpisDto;
  hoursOverrun: HoursOverrunDto;
  timelineAlerts: TimelineAlertsDto;
  teamLeads: TeamLeadsDto;
  timesheetPending: { items: TimesheetPendingItemDto[] };
  activity: { items: ActivityEventDto[] };
  topClients: TopClientDto[];
  health: ProjectHealthDto;
  recentProjects: RecentProjectDto[];
  departments: DepartmentsDto;
}
