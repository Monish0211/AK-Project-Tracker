import {
  findActiveProjectsForPendingCheck,
  findLatestWorkDatesByProjectIds,
  setTrackingStartDatesIfUnset,
} from "../repository/timesheetPending.repository.js";
import type { TimesheetPendingProjectDto } from "../dto/timesheetPending.dto.js";
import { daysBetween, isTimesheetPending, toIsoDate } from "./timesheetPending.rules.js";

/**
 * Timesheet Pending — confirmed business rule (do not reinterpret):
 *
 *  - PROJECT-level, not employee-level. Team Assigned/ProjectResource
 *    headcount is never consulted — one valid TimesheetEntry anywhere for
 *    the project, from any employee, is sufficient to make it current.
 *  - 7-day rolling window: daysSinceLatestTimesheet = today − the
 *    project's single latest TimesheetEntry.workDate. 0–7 days is CURRENT;
 *    more than 7 days is PENDING. Exactly 7 days is still CURRENT.
 *  - A project with zero TimesheetEntry ever does NOT use its creation or
 *    start date — the first time this calculation notices the gap, it
 *    persists a tracking-start date (Project.timesheetPendingTrackingStartedAt)
 *    and the same 7-day rule applies against that instead. Once a real
 *    entry arrives, the calculation switches anchors to its workDate; the
 *    tracking-start date is never read again and never cleared.
 *  - Only Active, non-archived projects participate.
 *
 * Date math lives in timesheetPending.rules.ts so this file only loads
 * projects/entries and persists the one-time tracking-start date.
 */

export async function getTimesheetPendingProjects(callerUserId?: string): Promise<TimesheetPendingProjectDto[]> {
  const projects = await findActiveProjectsForPendingCheck(callerUserId);
  if (projects.length === 0) {
    return [];
  }

  const latestDates = await findLatestWorkDatesByProjectIds(projects.map((p) => p.id));
  const latestByProjectId = new Map(latestDates.map((row) => [row.projectId, row.latestWorkDate]));

  const today = new Date();
  const unsetTrackingIds = projects
    .filter((project) => !latestByProjectId.has(project.id) && !project.timesheetPendingTrackingStartedAt)
    .map((project) => project.id);

  if (unsetTrackingIds.length > 0) {
    await setTrackingStartDatesIfUnset(unsetTrackingIds, today);
  }

  const results: TimesheetPendingProjectDto[] = [];

  for (const project of projects) {
    const latestWorkDate = latestByProjectId.get(project.id) ?? null;

    let anchorDate: Date;
    let latestTimesheetDate: string | null;
    let trackingStartDate: string | null;

    if (latestWorkDate) {
      // A real TimesheetEntry exists — the tracking-start date (if any) is
      // dormant from this point on; the latest actual entry is what matters.
      anchorDate = latestWorkDate;
      latestTimesheetDate = toIsoDate(latestWorkDate);
      trackingStartDate = null;
    } else {
      const trackingStartedAt = project.timesheetPendingTrackingStartedAt ?? today;
      anchorDate = trackingStartedAt;
      latestTimesheetDate = null;
      trackingStartDate = toIsoDate(trackingStartedAt);
    }

    const daysSinceLatestTimesheet = daysBetween(anchorDate, today);
    if (!isTimesheetPending(daysSinceLatestTimesheet)) {
      continue; // CURRENT — never returned, matching the previous frontend rule's exact behavior.
    }

    results.push({
      projectId: project.id,
      prNo: project.prNo,
      projectTitle: project.projectTitle,
      department: project.department,
      projectManager: project.primaryProjectManager,
      pmoCoordinator: project.pmoCoordinator,
      latestTimesheetDate,
      trackingStartDate,
      daysSinceLatestTimesheet,
      status: "PENDING",
    });
  }

  return results.sort((a, b) => b.daysSinceLatestTimesheet - a.daysSinceLatestTimesheet);
}
