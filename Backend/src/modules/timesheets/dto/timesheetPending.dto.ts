/**
 * One Active project currently flagged Timesheet Pending. Only PENDING
 * projects are ever returned by GET /timesheets/pending-projects — a
 * compliant (CURRENT) project is simply absent from the response, matching
 * the exact behavior the previous frontend-only calculation already had.
 * `status` is therefore always "PENDING" here; it's still an explicit,
 * named field (rather than an implicit fact of "being in this list") so a
 * future consumer that wants both states can add one without breaking this
 * shape.
 */
export interface TimesheetPendingProjectDto {
  projectId: string;
  prNo: string;
  projectTitle: string;
  department: string;
  projectManager: string | null;
  pmoCoordinator: string | null;
  /** ISO date string of the project's latest TimesheetEntry.workDate — null means no TimesheetEntry has ever existed for this project. */
  latestTimesheetDate: string | null;
  /** ISO date string — only populated when latestTimesheetDate is null; the persisted date this project's "no timesheet yet" grace period started counting from. */
  trackingStartDate: string | null;
  /** Days since whichever anchor date (latestTimesheetDate, or trackingStartDate when there's no timesheet yet) produced this project's PENDING status. */
  daysSinceLatestTimesheet: number;
  status: "PENDING";
}

export interface TimesheetPendingProjectListDto {
  items: TimesheetPendingProjectDto[];
}
