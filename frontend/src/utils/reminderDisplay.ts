import type { ProjectReminder } from "../types/ProjectReminder";
import { getNotifyOffsetMinutes } from "../types/ProjectReminder";
import type { Tone } from "../components/ui/Badge";

export type ReminderTriggerStatus = "upcoming" | "due-soon" | "due-now" | "overdue";

export interface ReminderStatusDisplay {
  status: ReminderTriggerStatus;
  label: string;
  detail: string;
}

type ReminderTiming = Pick<ProjectReminder, "reminderDate" | "reminderTime" | "notifyOffset">;

// A reminder still reads as "Due Now" for a short grace window after its due
// instant passes, instead of flipping straight to "Overdue" mid-glance.
const DUE_NOW_GRACE_MS = 2 * 60_000;

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const calendarDaysBetween = (from: Date, to: Date): number =>
  Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);

export const formatTimeFromDate = (date: Date): string => {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${period}`;
};

/** Formats a "HH:mm" field value as "9:00 AM" — avoids locale-dependent Intl quirks. */
export const formatHumanTime = (reminderTime: string): string => {
  if (!reminderTime) return "—";
  const [hours, minutes] = reminderTime.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return formatTimeFromDate(date);
};

export const formatHumanDate = (date: Date): string => {
  const diffDays = calendarDaysBetween(new Date(), date);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/** Formats a "YYYY-MM-DD" field value as "Today" / "Tomorrow" / "Yesterday" / "23 Jul 2026". */
export const formatHumanDateString = (reminderDate: string): string => {
  if (!reminderDate) return "—";
  return formatHumanDate(new Date(`${reminderDate}T00:00:00`));
};

export const formatDuration = (ms: number): string => {
  const minutes = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  if (minutes < 1) return "a moment";
  if (minutes < 60) return `${minutes} Minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} Hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} Day${days === 1 ? "" : "s"}`;
};

export const getReminderDueDateTime = (reminderDate: string, reminderTime: string): Date =>
  new Date(`${reminderDate}T${reminderTime || "00:00"}:00`);

export const getReminderTriggerDateTime = (
  reminderDate: string,
  reminderTime: string,
  notifyOffset: string
): Date => {
  const due = getReminderDueDateTime(reminderDate, reminderTime);
  return new Date(due.getTime() - getNotifyOffsetMinutes(notifyOffset) * 60_000);
};

export const getReminderTriggerStatus = (
  reminder: ReminderTiming,
  now: Date = new Date()
): ReminderTriggerStatus => {
  const triggerAt = getReminderTriggerDateTime(reminder.reminderDate, reminder.reminderTime, reminder.notifyOffset);
  const dueAt = getReminderDueDateTime(reminder.reminderDate, reminder.reminderTime);
  const nowMs = now.getTime();
  if (nowMs < triggerAt.getTime()) return "upcoming";
  if (nowMs < dueAt.getTime()) return "due-soon";
  if (nowMs < dueAt.getTime() + DUE_NOW_GRACE_MS) return "due-now";
  return "overdue";
};

/** Human-readable {status, label, detail} for a reminder card, popup, or list row. */
export const getReminderStatusDisplay = (
  reminder: ReminderTiming,
  now: Date = new Date()
): ReminderStatusDisplay => {
  const status = getReminderTriggerStatus(reminder, now);
  const dueAt = getReminderDueDateTime(reminder.reminderDate, reminder.reminderTime);
  const triggerAt = getReminderTriggerDateTime(reminder.reminderDate, reminder.reminderTime, reminder.notifyOffset);

  if (status === "overdue") {
    return { status, label: "Overdue", detail: `Overdue by ${formatDuration(now.getTime() - dueAt.getTime())}` };
  }
  if (status === "due-now") {
    return { status, label: "Due Now", detail: `Scheduled for ${formatHumanTime(reminder.reminderTime)}` };
  }
  if (status === "due-soon") {
    return { status, label: "Due Soon", detail: `Due in ${formatDuration(dueAt.getTime() - now.getTime())}` };
  }

  const dayDiff = calendarDaysBetween(now, dueAt);
  let detail: string;
  if (dayDiff === 0) {
    detail = `Due Today at ${formatHumanTime(reminder.reminderTime)}`;
  } else if (dayDiff === 1) {
    detail = "Starts Tomorrow";
  } else {
    const msUntilTrigger = triggerAt.getTime() - now.getTime();
    detail = msUntilTrigger <= 6 * 3_600_000 ? `Starts in ${formatDuration(msUntilTrigger)}` : "Upcoming";
  }
  return { status, label: "Upcoming", detail };
};

/** Live preview of when a reminder-in-progress (not yet saved) will notify. */
export const getReminderPreview = (
  reminderDate: string,
  reminderTime: string,
  notifyOffset: string
): { date: string; time: string } | null => {
  if (!reminderDate || !reminderTime) return null;
  const triggerAt = getReminderTriggerDateTime(reminderDate, reminderTime, notifyOffset);
  if (Number.isNaN(triggerAt.getTime())) return null;
  return { date: formatHumanDate(triggerAt), time: formatTimeFromDate(triggerAt) };
};

export const reminderPriorityTone = (priority: ProjectReminder["priority"]): Tone => {
  switch (priority) {
    case "Critical":
      return "critical";
    case "High":
      return "danger";
    case "Medium":
      return "warning";
    default:
      return "success";
  }
};

export const reminderStatusTone = (status: ReminderTriggerStatus): Tone => {
  switch (status) {
    case "upcoming":
      return "success";
    case "due-soon":
      return "warning";
    case "due-now":
      return "accent";
    case "overdue":
      return "danger";
  }
};
