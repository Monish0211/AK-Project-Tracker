import { apiClient } from "./apiClient";

/**
 * Timesheet Pending — the backend (GET /timesheets/pending-projects,
 * Backend/src/modules/timesheets/services/timesheetPending.service.ts) is
 * the single source of truth for this calculation. This file is a thin
 * fetch wrapper only — it must never recompute "today − latest timesheet
 * date" itself, and never falls back to localStorage/getAllTimesheetImports().
 *
 * Confirmed business rule (do not reinterpret on the frontend):
 *  - PROJECT-level, not employee-level — one valid TimesheetEntry anywhere
 *    for the project is sufficient; Team Assigned/ProjectResource headcount
 *    is never compared.
 *  - 7-day rolling window from the project's latest TimesheetEntry.workDate
 *    (or, if none exists yet, from a persisted tracking-start date) — never
 *    a calendar-month concept.
 *  - Only Active projects participate.
 *
 * Only PENDING projects are ever returned — a compliant project is simply
 * absent, matching this feature's previous behavior exactly.
 */

export interface TimesheetPendingProjectRow {
  projectId: string;
  prNo: string;
  projectTitle: string;
  department: string;
  projectManager: string | null;
  pmoCoordinator: string | null;
  /** ISO date string, or null if this project has never had a TimesheetEntry. */
  latestTimesheetDate: string | null;
  /** ISO date string — only populated when latestTimesheetDate is null. */
  trackingStartDate: string | null;
  daysSinceLatestTimesheet: number;
  status: "PENDING";
}

export async function fetchTimesheetPendingProjects(): Promise<TimesheetPendingProjectRow[]> {
  const result = await apiClient.get<{ items: TimesheetPendingProjectRow[] }>("/timesheets/pending-projects");
  return result.items;
}
