/**
 * TimesheetSyncService
 * Synchronizes imported timesheets to projects
 * Matches Project Code (Timesheet) = PR Number (Project Master)
 * Automatically updates project Team Members without manual intervention
 */

import type { Project, ProjectResource } from "../types/Project";
import type { TimesheetImportMonth, TimesheetEntry } from "../types/Timesheet";
import { normalizeProjectCode } from "./timesheetImportService";
import { buildProjectResourceFromTimesheet } from "./timesheetService";
import { getEmployees } from "./employeeService";

/**
 * Sync a timesheet import to all matching projects
 * Updates project.resources and project.timesheetMonths
 *
 * @param projects - All projects in the system
 * @param timesheetImport - The newly imported timesheet month
 * @returns Updated projects
 */
export function syncTimesheetToProjects(
  projects: Project[],
  timesheetImport: TimesheetImportMonth
): Project[] {
  const masterEmployees = getEmployees();

  return projects.map((project) => {
    // Extract project code from PR Number (normalize for matching)
    const projectCodeNormalized = normalizeProjectCode(project.prNo);

    // Find all timesheet entries for this project
    const projectEntries = timesheetImport.entries.filter((entry) => {
      const timesheetCodeNormalized = normalizeProjectCode(entry.projectCode);
      return (
        timesheetCodeNormalized === projectCodeNormalized &&
        timesheetCodeNormalized !== "" &&
        projectCodeNormalized !== ""
      );
    });

    // If no entries for this project, return unchanged
    if (projectEntries.length === 0) {
      return project;
    }

    // Group entries by employee
    const entriesByEmployee: Record<string, TimesheetEntry[]> = {};
    projectEntries.forEach((entry) => {
      if (!entriesByEmployee[entry.employeeNo]) {
        entriesByEmployee[entry.employeeNo] = [];
      }
      entriesByEmployee[entry.employeeNo].push(entry);
    });

    // Build new resources from timesheet entries
    const newResources: ProjectResource[] = [];

    Object.entries(entriesByEmployee).forEach(([empNo, empEntries]) => {
      // Build resource from timesheet data
      const resourceData = buildProjectResourceFromTimesheet(empEntries);
      if (!resourceData) return;

      // Enrich with Employee Master data
      const empMaster = masterEmployees.find(
        (e) => e.employeeNo.trim().toLowerCase() === empNo.trim().toLowerCase()
      );

      newResources.push({
        id: crypto.randomUUID(),
        employeeNo: resourceData.employeeNo,
        employeeName: empMaster?.employeeName || resourceData.employeeName,
        designation: empMaster?.designation || resourceData.designation,
        department: empMaster?.department || resourceData.department,
        reportingManager:
          empMaster?.reportingManager || resourceData.reportingManager,
        startDate: resourceData.startDate,
        endDate: resourceData.endDate,
        workingDays: resourceData.workingDays,
        totalHours: resourceData.totalHours,
        status: resourceData.status,
        location: empMaster?.location || resourceData.location,
      });
    });

    // Replace old resources with new ones from timesheet
    // This ensures Team Members always reflects latest timesheet
    const updatedTimesheetMonths = project.timesheetMonths || [];
    const existingIndex = updatedTimesheetMonths.findIndex(
      (m) => m.month === timesheetImport.month
    );

    if (existingIndex !== -1) {
      updatedTimesheetMonths[existingIndex] = timesheetImport;
    } else {
      updatedTimesheetMonths.push(timesheetImport);
    }

    return {
      ...project,
      resources: newResources,
      timesheetMonths: updatedTimesheetMonths,
      latestTimesheetMonth: timesheetImport.month,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// LIVE MATCHING
// ─────────────────────────────────────────────────────────────────────────
// The functions above populate project.resources/timesheetMonths once, at
// import time — a "push" sync. That snapshot goes stale the moment a
// project is created or has its PR Number edited after the import already
// ran, since nothing re-triggers the push for it.
//
// The functions below fix that: they take the project's PR Number and the
// full set of raw timesheet imports (read fresh from storage) and match
// Project Code = PR Number on every call. They never go stale because
// there's nothing cached to go stale — the match always reflects current
// project + current timesheet data.

function buildResourcesFromEntries(entries: TimesheetEntry[]): ProjectResource[] {
  const masterEmployees = getEmployees();

  const entriesByEmployee: Record<string, TimesheetEntry[]> = {};
  entries.forEach((entry) => {
    if (!entriesByEmployee[entry.employeeNo]) {
      entriesByEmployee[entry.employeeNo] = [];
    }
    entriesByEmployee[entry.employeeNo].push(entry);
  });

  const resources: ProjectResource[] = [];

  Object.entries(entriesByEmployee).forEach(([empNo, empEntries]) => {
    const resourceData = buildProjectResourceFromTimesheet(empEntries);
    if (!resourceData) return;

    const empMaster = masterEmployees.find(
      (e) => e.employeeNo.trim().toLowerCase() === empNo.trim().toLowerCase()
    );

    resources.push({
      id: `live-${empNo}`,
      employeeNo: resourceData.employeeNo,
      employeeName: empMaster?.employeeName || resourceData.employeeName,
      designation: empMaster?.designation || resourceData.designation,
      department: empMaster?.department || resourceData.department,
      reportingManager: empMaster?.reportingManager || resourceData.reportingManager,
      startDate: resourceData.startDate,
      endDate: resourceData.endDate,
      workingDays: resourceData.workingDays,
      totalHours: resourceData.totalHours,
      status: resourceData.status,
      location: empMaster?.location || resourceData.location,
    });
  });

  return resources;
}

/**
 * Get all months that contain at least one entry matching this PR Number.
 */
export function getLiveProjectMonths(prNo: string, allImports: TimesheetImportMonth[]): string[] {
  const target = normalizeProjectCode(prNo);
  if (!target) return [];

  return allImports
    .filter((month) =>
      month.entries.some((entry) => normalizeProjectCode(entry.projectCode) === target)
    )
    .map((month) => month.month)
    .sort()
    .reverse();
}

/**
 * Whether any imported timesheet entry matches this PR Number.
 */
export function hasLiveTimesheetData(prNo: string, allImports: TimesheetImportMonth[]): boolean {
  return getLiveProjectMonths(prNo, allImports).length > 0;
}

/**
 * Live team member list for a project + month, computed by matching
 * Project Code = PR Number directly against raw timesheet entries.
 */
export function getLiveTeamMembers(
  prNo: string,
  allImports: TimesheetImportMonth[],
  month?: string
): ProjectResource[] {
  const target = normalizeProjectCode(prNo);
  if (!target || !month) return [];

  const monthData = allImports.find((m) => m.month === month);
  if (!monthData) return [];

  const matchedEntries = monthData.entries.filter(
    (entry) => normalizeProjectCode(entry.projectCode) === target
  );

  return buildResourcesFromEntries(matchedEntries);
}

/**
 * Actual Hours for a project — sums the same per-employee totalHours that
 * Team Assigned computes via getLiveTeamMembers(), for the project's latest
 * matched month (Team Assigned's own default view before a user manually
 * switches months). This is the single source of truth for "Actual Hours":
 * anything comparing against budgeted hours (e.g. the Dashboard's Hours
 * Overrun widget) must call this rather than re-deriving hours from
 * project.resources or raw timesheet entries independently, or the two
 * views can disagree.
 */
export function getProjectActualHours(prNo: string, allImports: TimesheetImportMonth[]): number {
  const latestMonth = getLiveProjectMonths(prNo, allImports)[0];
  if (!latestMonth) return 0;

  const teamMembers = getLiveTeamMembers(prNo, allImports, latestMonth);
  return Math.round(teamMembers.reduce((sum, m) => sum + (m.totalHours || 0), 0) * 100) / 100;
}

/**
 * Live summary stats for a project + month.
 */
export function getLiveTimesheetSummary(
  prNo: string,
  allImports: TimesheetImportMonth[],
  month?: string
): { month: string; totalEmployees: number; totalHours: number; totalWorkingDays: number } | null {
  if (!month) return null;

  const target = normalizeProjectCode(prNo);
  const monthData = allImports.find((m) => m.month === month);
  if (!target || !monthData) return null;

  const matchedEntries = monthData.entries.filter(
    (entry) => normalizeProjectCode(entry.projectCode) === target
  );
  if (matchedEntries.length === 0) return null;

  const totalHours = matchedEntries.reduce((sum, e) => sum + e.hours, 0);

  return {
    month,
    totalEmployees: new Set(matchedEntries.map((e) => e.employeeNo)).size,
    totalHours: Math.round(totalHours * 100) / 100,
    totalWorkingDays: new Set(matchedEntries.map((e) => e.date)).size,
  };
}

/**
 * Live daily entries for one employee within a project + month.
 */
export function getLiveEmployeeDailyEntries(
  prNo: string,
  allImports: TimesheetImportMonth[],
  employeeNo: string,
  month?: string
): TimesheetEntry[] {
  if (!month) return [];

  const target = normalizeProjectCode(prNo);
  const monthData = allImports.find((m) => m.month === month);
  if (!target || !monthData) return [];

  return monthData.entries
    .filter(
      (entry) =>
        entry.employeeNo === employeeNo && normalizeProjectCode(entry.projectCode) === target
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get all daily timesheet entries for an employee in a specific project
 * Used to populate the expandable row with detailed work entries
 *
 * @param project - The project
 * @param employeeNo - Employee number
 * @param month - YYYY-MM format (optional, defaults to latest)
 * @returns Array of daily timesheet entries
 */
export function getEmployeeDailyEntries(
  project: Project,
  employeeNo: string,
  month?: string
): TimesheetEntry[] {
  const targetMonth =
    month || project.latestTimesheetMonth || "";

  if (!targetMonth || !project.timesheetMonths) {
    return [];
  }

  const timesheetMonth = project.timesheetMonths.find(
    (m) => m.month === targetMonth
  );

  if (!timesheetMonth) {
    return [];
  }

  const projectCodeNormalized = normalizeProjectCode(project.prNo);

  return timesheetMonth.entries
    .filter((entry) => {
      const timesheetCodeNormalized = normalizeProjectCode(entry.projectCode);
      return (
        entry.employeeNo === employeeNo &&
        timesheetCodeNormalized === projectCodeNormalized
      );
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get available months for a project
 * Used to show month selector in Team Members section
 *
 * @param project - The project
 * @returns Array of available months (YYYY-MM)
 */
export function getProjectMonths(project: Project): string[] {
  if (!project.timesheetMonths) {
    return [];
  }

  return project.timesheetMonths
    .map((m) => m.month)
    .sort()
    .reverse();
}

/**
 * Check if project has timesheet data synced
 *
 * @param project - The project
 * @returns True if project has timesheet data
 */
export function hasTimesheetData(project: Project): boolean {
  return (
    project.timesheetMonths !== undefined &&
    project.timesheetMonths.length > 0
  );
}

/**
 * Get summary stats for a project's latest timesheet
 *
 * @param project - The project
 * @returns Summary stats or null if no timesheet data
 */
export function getTimesheetSummary(
  project: Project
): {
  month: string;
  totalEmployees: number;
  totalHours: number;
  totalWorkingDays: number;
} | null {
  if (!project.latestTimesheetMonth || !project.timesheetMonths) {
    return null;
  }

  const latest = project.timesheetMonths.find(
    (m) => m.month === project.latestTimesheetMonth
  );

  if (!latest || !latest.summary) {
    return null;
  }

  return {
    month: latest.month,
    totalEmployees: latest.summary.totalEmployees,
    totalHours: latest.summary.totalHours,
    totalWorkingDays: latest.summary.totalWorkingDays,
  };
}
