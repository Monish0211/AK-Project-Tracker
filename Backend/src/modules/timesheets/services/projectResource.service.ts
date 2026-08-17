import {
  createResource,
  findResourceByProjectAndEmployee,
  updateResource,
} from "../../resources/repository/resource.repository.js";
import { findEmployeeByEmployeeNo } from "../../employees/repository/employee.repository.js";
import { findEntriesForPair } from "../repository/timesheet.repository.js";

/** "YYYY-MM-DD" from a stored workDate — the workDates this module stores are always UTC midnight (see excelParser.service.ts), so UTC getters are the correct read-back. */
function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Recomputes ProjectResource for one (employeeNo, projectId) pair — ALWAYS
 * from every current TimesheetEntry row for that pair, NEVER by
 * incrementing whatever ProjectResource already had. Called once per
 * touched pair at the end of timesheet.service.ts's processTimesheetImport(),
 * per the approved Stage 3/4 architecture.
 *
 * hourlyRateSnapshot is the one field this function will NEVER recompute
 * once a ProjectResource row already exists — it is captured only on this
 * pair's very first creation (below), frozen forever after, exactly per
 * Phase 3.7's original design and the Stage 3/4 clarifications reaffirming
 * it (an Employee Master rate change later must never silently change
 * historical cost).
 *
 * assignmentStatus is deliberately NOT derived from totalHours reaching
 * zero — a correction to 0 hours is a different fact from "this employee
 * was released from the project." It's driven by whichever live entry has
 * the latest workDate's own sourceStatus (most-recent-day-wins); left at
 * its prior value when no live entries remain (a full zero-hour wipe).
 */
export async function recomputeProjectResource(employeeNo: string, projectId: string): Promise<void> {
  const entries = await findEntriesForPair(employeeNo, projectId);
  const existing = await findResourceByProjectAndEmployee(projectId, employeeNo);

  const totalHours = round2(entries.reduce((sum, e) => sum + e.hours, 0));
  const workingDays = new Set(entries.map((e) => dateKey(e.workDate))).size;

  let assignmentStartDate: Date | null;
  let assignmentEndDate: Date | null;
  let assignmentStatus: string;

  if (entries.length > 0) {
    const times = entries.map((e) => e.workDate.getTime()).sort((a, b) => a - b);
    assignmentStartDate = new Date(times[0]!);
    assignmentEndDate = new Date(times[times.length - 1]!);
    const latestEntry = entries.reduce((a, b) => (a.workDate.getTime() >= b.workDate.getTime() ? a : b));
    assignmentStatus = latestEntry.sourceStatus === "Released" ? "Released" : "Active";
  } else {
    // Every TimesheetEntry for this pair was Removed (a zero-hour
    // correction wiped the last remaining row) — preserve the prior
    // historical values rather than nulling/resetting them. Never delete
    // the ProjectResource row itself: doing so would force a fresh
    // hourlyRateSnapshot capture if hours ever resume later, silently
    // breaking the "frozen forever" guarantee below.
    assignmentStartDate = existing?.assignmentStartDate ?? null;
    assignmentEndDate = existing?.assignmentEndDate ?? null;
    assignmentStatus = existing?.assignmentStatus ?? "Active";
  }

  let hourlyRateSnapshot: number;
  if (existing) {
    hourlyRateSnapshot = existing.hourlyRateSnapshot;
  } else {
    const employee = await findEmployeeByEmployeeNo(employeeNo);
    hourlyRateSnapshot = employee?.manhourExpenses ?? 0;
  }

  const manhourCost = round2(totalHours * hourlyRateSnapshot);

  if (existing) {
    await updateResource(existing.id, {
      assignmentStartDate,
      assignmentEndDate,
      assignmentStatus,
      workingDays,
      totalHours,
      manhourCost,
      lastSyncedAt: new Date(),
    });
  } else {
    await createResource(projectId, {
      employeeNo,
      assignmentStartDate,
      assignmentEndDate,
      assignmentStatus,
      hourlyRateSnapshot,
      workingDays,
      totalHours,
      manhourCost,
      lastSyncedAt: new Date(),
    });
  }
}
