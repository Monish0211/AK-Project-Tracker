/**
 * Pure Timesheet Pending date math — no Prisma, no I/O. The service layer
 * applies these rules to Active projects; GET /timesheets/pending-projects
 * is the only caller that decides PENDING vs CURRENT. Keep this file the
 * single definition of "how many days" and "is it pending" so the frontend
 * never reimplements the 7-day window.
 *
 * Confirmed business rule:
 *  - 0–7 days from the anchor date is CURRENT (exactly 7 is still CURRENT).
 *  - More than 7 days is PENDING.
 *  - Anchor is latest TimesheetEntry.workDate, or the persisted tracking-
 *    start date when no entry exists yet.
 */

export const PENDING_THRESHOLD_DAYS = 7;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Both sides normalized to UTC midnight — TimesheetEntry.workDate is stored as UTC midnight. */
export function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((utcMidnight(to).getTime() - utcMidnight(from).getTime()) / MS_PER_DAY);
}

export function isTimesheetPending(daysSinceAnchor: number): boolean {
  return daysSinceAnchor > PENDING_THRESHOLD_DAYS;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
