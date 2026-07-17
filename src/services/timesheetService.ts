import type { TimesheetEntry, TimesheetImportMonth, ProjectTimesheetData } from "../types/Timesheet";
import type { ProjectResource } from "../types/Project";
import { getCellText, parseExcelDateKey } from "./timesheetImportService";

/**
 * Extract raw daily timesheet entries from Excel rows
 * Each row in the Excel becomes a TimesheetEntry
 */
export function extractTimesheetEntries(
  rows: unknown[][],
  indices: Record<string, number>
): TimesheetEntry[] {
  const entries: TimesheetEntry[] = [];

  rows.forEach((row, idx) => {
    const empNo = getCellText(row, indices.employeeNo);
    const empName = getCellText(row, indices.employeeName);
    const projectCode = getCellText(row, indices.projectCode);
    const projectNameIdx = (indices as Record<string, number>).projectName ?? -1;
    const projectName = getCellText(row, projectNameIdx);
    const dateKey = parseExcelDateKey(row[indices.date]);
    const hours = Number(getCellText(row, indices.totalHours)) || 0;
    const taskIdx = (indices as Record<string, number>).task ?? -1;
    const task = getCellText(row, taskIdx);
    const status = getCellText(row, indices.status ?? -1) || "Active";

    if (!empNo || !empName || !projectCode || !dateKey || hours === 0) {
      return;
    }

    const entry: TimesheetEntry = {
      id: `${empNo}-${projectCode}-${dateKey}-${idx}`,
      employeeNo: empNo,
      employeeName: empName,
      projectCode,
      projectName,
      date: dateKey,
      hours,
      status: (status.toLowerCase() === "released" ? "Released" : "Active") as "Active" | "Released",
    };

    if (task) {
      entry.task = task;
    }

    entries.push(entry);
  });

  return entries;
}

/**
 * Get month from date string (YYYY-MM-DD -> YYYY-MM)
 */
export function getMonthFromDate(dateStr: string): string {
  return dateStr.substring(0, 7); // "2026-02"
}

/**
 * Create monthly/weekly aggregation from daily entries
 */
export function createImportMonth(
  entries: TimesheetEntry[],
  uploadedBy: string,
  importType: "monthly" | "weekly" = "monthly"
): TimesheetImportMonth {
  const dates = new Set(entries.map((e) => e.date));
  const uniqueEmployees = new Set(entries.map((e) => e.employeeNo));
  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  // Get month from first entry
  const month = entries.length > 0 ? getMonthFromDate(entries[0].date) : "";

  return {
    id: `import-${month}-${Date.now()}`,
    month,
    importType,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    entries,
    summary: {
      totalEmployees: uniqueEmployees.size,
      totalHours: Math.round(totalHours * 100) / 100,
      totalWorkingDays: dates.size,
    },
  };
}

/**
 * Build ProjectResource summary from timesheet entries for a specific employee and month
 * Used to populate Team Members section when displaying latest month
 */
export function buildProjectResourceFromTimesheet(
  entries: TimesheetEntry[]
): Omit<ProjectResource, "id"> | null {
  if (entries.length === 0) return null;

  const first = entries[0];
  const dates = entries.map((e) => e.date).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const totalHours = Math.round(entries.reduce((sum, e) => sum + e.hours, 100) * 100) / 100;
  const workingDays = new Set(entries.map((e) => e.date)).size;

  return {
    employeeNo: first.employeeNo,
    employeeName: first.employeeName,
    designation: "", // Would come from Employee Master
    department: "", // Would come from Employee Master
    reportingManager: "", // Would come from Employee Master
    startDate,
    endDate,
    workingDays,
    totalHours,
    status: first.status || "Active",
    location: "",
  };
}

/**
 * Get entries for a specific employee in a specific project and month
 */
export function getEmployeeEntriesForProjectMonth(
  entries: TimesheetEntry[],
  employeeNo: string,
  projectCode: string
): TimesheetEntry[] {
  return entries.filter(
    (e) => e.employeeNo === employeeNo && e.projectCode === projectCode
  );
}

/**
 * Store timesheet import (call this after successfully importing Excel)
 * Maintains historical data by month
 */
export function storeTimesheetImport(
  existingData: ProjectTimesheetData | undefined,
  newMonth: TimesheetImportMonth
): ProjectTimesheetData {
  const months = existingData?.allMonths || [];

  // Remove existing month if present (replace with new import)
  const filtered = months.filter((m) => m.month !== newMonth.month);

  return {
    prNo: existingData?.prNo || "",
    allMonths: [...filtered, newMonth],
    latestMonth: newMonth.month,
  };
}

/**
 * Get team members for a project from latest timesheet import
 * Groups entries by employee for the latest month
 */
export function getTeamMembersFromLatestTimesheet(
  timesheetData: ProjectTimesheetData | undefined,
  projectCode: string
): TimesheetEntry[][] {
  if (!timesheetData?.latestMonth) return [];

  const latestImport = timesheetData.allMonths.find(
    (m) => m.month === timesheetData.latestMonth
  );
  if (!latestImport) return [];

  // Filter entries for this project
  const projectEntries = latestImport.entries.filter((e) => e.projectCode === projectCode);

  // Group by employee
  const grouped: Record<string, TimesheetEntry[]> = {};
  projectEntries.forEach((entry) => {
    if (!grouped[entry.employeeNo]) {
      grouped[entry.employeeNo] = [];
    }
    grouped[entry.employeeNo].push(entry);
  });

  return Object.values(grouped);
}

/**
 * Format date for display (YYYY-MM-DD -> DD-MMM-YYYY)
 */
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${day}-${monthNames[parseInt(month) - 1]}-${year}`;
}

/**
 * Format month for display (YYYY-MM -> MMM YYYY)
 */
export function formatMonthDisplay(monthStr: string): string {
  if (!monthStr || monthStr.length < 7) return monthStr;
  const [year, month] = monthStr.split("-");
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${monthNames[parseInt(month) - 1]} ${year}`;
}
