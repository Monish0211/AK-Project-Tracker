import type { Project } from "../types/Project";

const DURATION_UNIT_TO_DAYS: Record<string, number> = { Days: 1, Weeks: 7, Months: 30 };

type ScheduleInput = Pick<Project, "projectStartDate" | "estimatedDuration" | "durationUnit">;

/**
 * Single source of truth for the Project Scheduling card's two derived
 * fields — used identically by the editable card (GeneralInfoCard.tsx) and
 * the read-only view (GeneralView.tsx) so Add/Edit/View can never disagree
 * on what these values are. Neither is ever persisted on the Project itself;
 * both are always recomputed from projectStartDate + estimatedDuration +
 * durationUnit.
 */
export function getTotalScheduleCalendarDays(project: ScheduleInput): number {
  if (!project.estimatedDuration || project.estimatedDuration <= 0) return 0;
  return project.estimatedDuration * (DURATION_UNIT_TO_DAYS[project.durationUnit || "Days"] ?? 1);
}

/** Planned Completion Date (YYYY-MM-DD), or "" if there isn't enough info to compute it. */
export function getPlannedCompletionDate(project: ScheduleInput): string {
  const totalDays = getTotalScheduleCalendarDays(project);
  if (!project.projectStartDate || totalDays <= 0) return "";
  const start = new Date(project.projectStartDate);
  if (Number.isNaN(start.getTime())) return "";
  const completion = new Date(start);
  completion.setDate(completion.getDate() + totalDays);
  return completion.toISOString().slice(0, 10);
}

/** Working Days (Approx.) — a 5-day work week approximated against the total calendar-day span. */
export function getApproxWorkingDays(project: ScheduleInput): number {
  const totalDays = getTotalScheduleCalendarDays(project);
  return totalDays > 0 ? Math.round(totalDays * (5 / 7)) : 0;
}
