/**
 * TimesheetEntry - Raw daily timesheet entry from imported Excel
 * Stores each day's work entry with project code, employee, task, and hours
 */
export interface TimesheetEntry {
  id: string;
  employeeNo: string;
  employeeName: string;
  projectCode: string;
  projectName: string;
  date: string; // YYYY-MM-DD format
  task?: string;
  hours: number;
  status?: "Active" | "Released";
}

/**
 * TimesheetImportMonth - Monthly aggregated timesheet data
 * Groups all daily entries by month for a project's resource allocation
 */
export interface TimesheetImportMonth {
  id: string;
  month: string; // YYYY-MM format
  uploadedAt: string; // ISO date
  uploadedBy: string; // User name
  entries: TimesheetEntry[];
  summary?: {
    totalEmployees: number;
    totalHours: number;
    totalWorkingDays: number;
  };
}

/**
 * ProjectTimesheetData - All historical timesheet data for a project
 * Stored as part of Project to maintain sync history
 */
export interface ProjectTimesheetData {
  prNo: string; // Project PR Number
  allMonths: TimesheetImportMonth[];
  latestMonth?: string; // YYYY-MM of most recent import
}
