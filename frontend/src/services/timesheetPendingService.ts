import { getProjects } from "./projectService";
import { getAllTimesheetImports, formatMonthDisplay } from "./timesheetService";
import { getProcessedProjectMonths } from "./timesheetProcessingService";

/**
 * Project Timesheet Pending — identifies employees ASSIGNED to a project
 * (project.resources[]) who have not submitted a timesheet for the current
 * reporting period, using the real per-employee/per-project timesheet
 * ledger (getAllTimesheetImports()'s TimesheetEntry.employeeNo/projectCode),
 * not a project-level "last synced month" rollup. This is why it can answer
 * "which employee, on which PR" rather than just "which project is stale."
 *
 * Reporting period: an employee's timesheet for month M is expected by the
 * end of month M. The "current reporting period" for lateness purposes is
 * therefore the most recently fully-completed calendar month (e.g. if today
 * is 03 Aug 2026, that's July 2026 — August's own deadline hasn't arrived
 * yet). An employee is flagged once their FIRST unsubmitted month (the one
 * right after whatever they last actually submitted, or the project's start
 * month if they've never submitted) is at or before that cutoff.
 *
 * Data source: real project/resource assignments and the real timesheet
 * import ledger already used elsewhere (Timesheets module, Team Assigned
 * tab). No fabricated fields — a project/employee with no timesheet history
 * simply shows as pending since its start month, which is the correct,
 * real answer today. Ready to swap for live Keka/PMO-assignment APIs later
 * (see module doc on the widget) without changing this shape.
 */

export type TimesheetPendingStatus = "Critical" | "High" | "Medium" | "Low";

export interface TimesheetPendingRow {
  projectId: string;
  prNo: string;
  projectName: string;
  department: string;
  projectManager: string;
  pmoCoordinator: string;
  employeeNo: string;
  employeeName: string;
  /** YYYY-MM of the first month this employee hasn't submitted yet. */
  pendingMonth: string;
  pendingMonthLabel: string;
  lastSubmittedMonth: string | null;
  lastSubmittedMonthLabel: string;
  daysPending: number;
  status: TimesheetPendingStatus;
}

const monthKey = (year: number, month0: number): string => `${year}-${String(month0 + 1).padStart(2, "0")}`;

const addMonths = (monthStr: string, delta: number): string => {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d.getFullYear(), d.getMonth());
};

/** Last calendar day of the given YYYY-MM month, as a real Date. */
const endOfMonth = (monthStr: string): Date => {
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, m, 0);
};

export const getTimesheetStatus = (daysPending: number): TimesheetPendingStatus => {
  if (daysPending > 60) return "Critical";
  if (daysPending >= 31) return "High";
  if (daysPending >= 15) return "Medium";
  return "Low";
};

export const getTimesheetPendingList = (): TimesheetPendingRow[] => {
  const today = new Date();
  const currentMonth = monthKey(today.getFullYear(), today.getMonth());
  const cutoffMonth = addMonths(currentMonth, -1);

  const allImports = getAllTimesheetImports();
  const rows: TimesheetPendingRow[] = [];

  getProjects()
    .filter((project) => project.projectStatus === "Active")
    .forEach((project) => {
      (project.resources || [])
        .filter((resource) => resource.status === "Active")
        .forEach((resource) => {
          const submittedMonths = allImports
            .filter((imp) =>
              imp.entries.some(
                (entry) => entry.employeeNo === resource.employeeNo && entry.projectCode === project.prNo
              )
            )
            .map((imp) => imp.month)
            .sort();

          const lastSubmittedMonth = submittedMonths.length > 0 ? submittedMonths[submittedMonths.length - 1] : null;

          // Already submitted through (or past) the cutoff month — up to date.
          if (lastSubmittedMonth && lastSubmittedMonth >= cutoffMonth) return;

          const projectStartMonth = project.projectStartDate ? project.projectStartDate.slice(0, 7) : cutoffMonth;
          const pendingMonth = lastSubmittedMonth ? addMonths(lastSubmittedMonth, 1) : projectStartMonth;

          const expectedSubmissionDate = endOfMonth(pendingMonth);
          const daysPending = Math.floor(
            (today.getTime() - expectedSubmissionDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          // That month's own deadline hasn't passed yet — not late.
          if (daysPending <= 0) return;

          rows.push({
            projectId: project.id,
            prNo: project.prNo,
            projectName: project.projectTitle,
            department: project.department,
            projectManager: project.primaryProjectManager || "—",
            pmoCoordinator: project.pmoCoordinator || "—",
            employeeNo: resource.employeeNo,
            employeeName: resource.employeeName,
            pendingMonth,
            pendingMonthLabel: formatMonthDisplay(pendingMonth),
            lastSubmittedMonth,
            lastSubmittedMonthLabel: lastSubmittedMonth ? formatMonthDisplay(lastSubmittedMonth) : "Never",
            daysPending,
            status: getTimesheetStatus(daysPending),
          });
        });
    });

  return rows.sort((a, b) => b.daysPending - a.daysPending);
};

/* ===================================================
   PROJECT-LEVEL TIMESHEET COMPLIANCE (Missing Reporting Month)
   Replaces the "how stale is the last submission" question above with the
   PMO compliance question: "has this project's CURRENT required reporting
   month been submitted at all — yes or no." A project vanishes from this
   list the moment any timesheet entry lands in that month for its PR
   Number; it never lingers just because history is old.

   Current reporting month = the most recently fully-completed calendar
   month (its own submission deadline — the last day of that month — has
   already passed; the in-progress current month's deadline hasn't arrived
   yet, so it's never itself the "missing" month).

   Overdue Since is ALWAYS Current Date − that one reporting month's due
   date — never derived from project age, project start date, or resource
   assignment date. Every row shares the exact same due date (they're all
   being checked against the same reporting month), so on any given day
   every row's Overdue Since is identical; only the "Pending" vs "No
   Timesheet" status differs, based on whether the project has EVER
   submitted anything (a label, not a separate day count).

   "Has this month been submitted" is answered by getProcessedProjectMonths()
   (timesheetProcessingService.ts) — the same canonical matcher Team
   Assigned itself calls — rather than a second, independent comparison
   here. A naive `entry.projectCode === project.prNo` check silently
   disagrees with Team Assigned for any PR Number with a job-number suffix
   (e.g. "PR-11040_3") or superficial formatting differences in the raw
   Excel import, because Team Assigned matches through
   normalizeProjectCode()'s job-number-aware parsing, not a raw string
   comparison. Reusing the same function is what makes it structurally
   impossible for this widget and Team Assigned to disagree on whether a
   given month was submitted.
=================================================== */

export type MissingTimesheetStatus = "Pending" | "No Timesheet";

export interface MissingTimesheetProjectRow {
  projectId: string;
  prNo: string;
  projectName: string;
  department: string;
  projectManager: string;
  pmoCoordinator: string;
  /** YYYY-MM of the current required reporting month (always the same across every row for a given render). */
  missingMonth: string;
  missingMonthLabel: string;
  overdueSinceDays: number;
  status: MissingTimesheetStatus;
}

export const getMissingTimesheetProjects = (): MissingTimesheetProjectRow[] => {
  const today = new Date();
  const currentMonth = monthKey(today.getFullYear(), today.getMonth());
  const reportingMonth = addMonths(currentMonth, -1);
  const reportingDueDate = endOfMonth(reportingMonth);

  // Current Date − Expected Timesheet Submission Due Date. The reporting
  // month is always the most recently completed one, so this due date has
  // always already passed (never negative) — same value for every row.
  const overdueSinceDays = Math.floor((today.getTime() - reportingDueDate.getTime()) / (1000 * 60 * 60 * 24));
  if (overdueSinceDays <= 0) return [];

  const allImports = getAllTimesheetImports();
  const rows: MissingTimesheetProjectRow[] = [];

  getProjects()
    .filter((project) => project.projectStatus === "Active")
    .forEach((project) => {
      // getProcessedProjectMonths() is the exact same canonical matcher Team
      // Assigned itself calls (hasProcessedTimesheetData/getProcessedProjectMonths
      // in timesheetProcessingService.ts) — it normalizes the PR Number
      // through normalizeProjectCode() (handles "PR-11040_3"-style job-number
      // suffixes, case, and whitespace the way Team Assigned's own matching
      // does) and derives each month from the entry's own work date. Reusing
      // it here — instead of a second, hand-rolled comparison — is what
      // guarantees this widget and Team Assigned can never contradict each
      // other on whether a given month was submitted.
      const submittedMonths = getProcessedProjectMonths(project.prNo, allImports);

      // Already compliant for the current reporting month — never shown.
      if (submittedMonths.includes(reportingMonth)) return;

      const status: MissingTimesheetStatus = submittedMonths.length > 0 ? "Pending" : "No Timesheet";

      rows.push({
        projectId: project.id,
        prNo: project.prNo,
        projectName: project.projectTitle,
        department: project.department,
        projectManager: project.primaryProjectManager || "—",
        pmoCoordinator: project.pmoCoordinator || "—",
        missingMonth: reportingMonth,
        missingMonthLabel: formatMonthDisplay(reportingMonth),
        overdueSinceDays,
        status,
      });
    });

  return rows.sort((a, b) => b.overdueSinceDays - a.overdueSinceDays);
};
