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
  /** Phase 4: projects in this currency whose man-hour cost is incomplete because no conversion rate has been applied (always 0 for INR). */
  manhourIncompleteProjects: number;
  /** Phase 4 / Option A: projects whose automatic recalculation after an employee-rate change is pending or failed, so their manpower cost may be out of date. */
  manhourRefreshPendingProjects: number;
  totalProfit: number;
  totalProfitPercentage: number;
}


/**
 * The headline totals of ONE currency (Phase 3). Projects are totalled per regional currency and different currencies are NEVER added
 * together. totalProjects here counts only the projects in this currency.
 */
export interface DashboardCurrencyKpisDto extends DashboardKpisDto {
  currency: string;
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

export interface TeamLeadWorkloadProjectRefDto {
  id: string;
  prNo: string;
}

/**
 * Aug 2026 — `reportingManager` now holds the assigned person's name, sourced
 * from QuantityItem.assignedTo (see dashboard.service.ts's buildTeamLeads()),
 * not Employee.reportingManager. Field name kept as-is to avoid a breaking
 * rename for existing consumers of this DTO — only where the value comes
 * from changed. `projects` is additive (new).
 */
export interface TeamLeadWorkloadDto {
  reportingManager: string;
  activeProjectsCount: number;
  /** The person's work order value in the HEADLINE currency only (unchanged for an India view); see totalsByCurrency for every currency. */
  totalWorkOrderValue: number;
  formattedWorkOrderValue: string;
  /**
   * The person's work order value per currency (Phase 4 follow-up). Each project contributes its work order value in ITS OWN regional currency, so an assignee
   * with Oman and Malaysia projects shows an OMR total and a MYR total, never one added figure and never a 0 for the currency that is not the headline one.
   * Headline currency first, then the others by project count. An India-only person has exactly one INR entry, equal to totalWorkOrderValue.
   */
  totalsByCurrency: TeamLeadWorkloadValueDto[];
  status: "High" | "Medium" | "Normal";
  projects: TeamLeadWorkloadProjectRefDto[];
}

export interface TeamLeadWorkloadValueDto {
  currency: string;
  /** Active projects of this person in this currency. */
  projects: number;
  totalWorkOrderValue: number;
  formattedWorkOrderValue: string;
}

/** One active project with at least one Quantity Details row missing an Assigned To — see buildTeamLeads()'s missingAssigneeProjects. */
export interface MissingAssigneeProjectDto {
  id: string;
  prNo: string;
  projectTitle: string;
}

export interface TeamLeadsDto {
  totalReportingManagers: number;
  top5: TeamLeadWorkloadDto[];
  // Phase 2.2 — same authoritative list top5 is sliced from (zero extra
  // computation: buildTeamLeads() already builds this full sorted array
  // before slicing). The dedicated Team Leads Workload page
  // (TeamLeadsWorkloadProjects.tsx) renders this instead of recomputing its
  // own list — same pattern already established by HoursOverrunDto's own
  // top5/allMatching split for the Financial Loss drill-down.
  allAssigned: TeamLeadWorkloadDto[];
  // Sept 2026 — Missing Assignee. Active projects (same isActiveProjectStatus()
  // scope as the rest of this DTO) with at least one Quantity Details row
  // whose Assigned To is blank/unusable (see buildTeamLeads()'s own
  // isUsableManagerName() reuse). Purely derived, never persisted — no new
  // Prisma field, no "Unassigned" Manpower record.
  missingAssignee: MissingAssigneeProjectDto[];
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

/**
 * One country's ranking, in that country's own currency. Countries are never merged and currencies never added: the same customer can appear in
 * several sections, each ranked and valued independently (Phase 4 final).
 */
export interface CountryTopClientsDto {
  /** The stored country key (PR Category). */
  countryKey: string;
  /** What the UI shows ("FZE" for the stored key "FZI"). */
  country: string;
  currency: string;
  clients: TopClientDto[];
}

export interface CountryDepartmentsDto {
  countryKey: string;
  country: string;
  currency: string;
  /** The same department figures as the overall panel, computed from this country's projects only; workOrderValue is in `currency`. */
  departments: DepartmentsDto;
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
  /** The work order value in the project's OWN regional currency, and that currency (Phase 3). For an INR or legacy project this equals workOrderValueINR and "INR". */
  workOrderValue: number;
  currency: string;
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
  /**
   * The currency `kpis` is in (Phase 3). INR whenever the projects in view include INR or legacy projects (so the India dashboard is exactly
   * as before); otherwise the one regional currency in view, e.g. OMR for an Oman view.
   */
  kpiCurrency: string;
  /** The totals of every OTHER currency in view, listed separately and never added into `kpis`. Empty for a single-currency view. */
  otherCurrencies: DashboardCurrencyKpisDto[];
  hoursOverrun: HoursOverrunDto;
  timelineAlerts: TimelineAlertsDto;
  teamLeads: TeamLeadsDto;
  timesheetPending: { items: TimesheetPendingItemDto[] };
  activity: { items: ActivityEventDto[] };
  topClients: TopClientDto[];
  /** Top Clients per country (own currency each). One entry for a single-country view; one per country with projects for All Countries. */
  topClientsByCountry: CountryTopClientsDto[];
  health: ProjectHealthDto;
  recentProjects: RecentProjectDto[];
  departments: DepartmentsDto;
  /** The Departments panel per country (own currency each), same shape rules as topClientsByCountry. */
  departmentsByCountry: CountryDepartmentsDto[];
}
