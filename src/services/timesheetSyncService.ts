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
