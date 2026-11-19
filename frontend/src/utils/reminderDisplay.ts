import type { ProjectReminder } from "../types/ProjectReminder";
import { getNotifyOffsetMinutes } from "../types/ProjectReminder";
import type { Tone } from "../components/ui/Badge";
import { utcToZonedWallClock, zonedToday, zonedWallClockToUtc, zoneLabel } from "./projectTimeZone";

export type ReminderTriggerStatus = "upcoming" | "due-soon" | "due-now" | "overdue";

export interface ReminderStatusDisplay {
  status: ReminderTriggerStatus;
  label: string;
  detail: string;
}

/**
 * What every reminder time computation needs. `timeZone` / `dueAt` (Project-country time zones): the reminder's date and time are the PROJECT's local time in that zone,
 * and dueAt is the exact UTC instant the server computed. A reminder without them (saved before this change) keeps the old reading in the viewer's own clock, unchanged.
 */
type ReminderTiming = Pick<ProjectReminder, "reminderDate" | "reminderTime" | "notifyOffset"> & { dueAt?: string | null; timeZone?: string | null };

// A reminder still reads as "Due Now" for a short grace window after its due
// instant passes, instead of flipping straight to "Overdue" mid-glance.
const DUE_NOW_GRACE_MS = 2 * 60_000;

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const dayNumber = (key: string): number => {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Calendar days from `from` to `to`, counted in `timeZone` when given (the project's own days), else in the viewer's clock. */
const calendarDaysBetween = (from: Date, to: Date, timeZone?: string | null): number =>
  timeZone
    ? dayNumber(utcToZonedWallClock(to, timeZone).date) - dayNumber(utcToZonedWallClock(from, timeZone).date)
    : Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);

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
  const period = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${period}`;
};

/** A reminder's time with its project zone, e.g. "10:00 AM · Qatar time" (a reminder saved before project time zones: just "10:00 AM"). */
export const formatReminderTime = (reminder: { reminderTime: string; timeZone?: string | null; country?: string | null }): string => {
  const label = zoneLabel(reminder.timeZone, reminder.country);
  return label ? `${formatHumanTime(reminder.reminderTime)} · ${label}` : formatHumanTime(reminder.reminderTime);
};

/** "23 Jul 2026", one shared formatter (same output as toLocaleDateString with these options, without building a formatter per call). */
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export const formatHumanDate = (date: Date): string => {
  const diffDays = calendarDaysBetween(new Date(), date);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return DAY_MONTH_YEAR.format(date);
};

/**
 * Formats a "YYYY-MM-DD" field value as "Today" / "Tomorrow" / "Yesterday" / "23 Jul 2026". With `timeZone`, "Today" is today in that zone (the project's own calendar),
 * so an India viewer and a Qatar project agree on which day a Qatar reminder is due.
 */
export const formatHumanDateString = (reminderDate: string, timeZone?: string | null, now: Date = new Date()): string => {
  if (!reminderDate) return "—";
  if (timeZone) {
    const diff = dayNumber(reminderDate) - dayNumber(zonedToday(timeZone, now));
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    const [y, m, d] = reminderDate.split("-").map(Number);
    return DAY_MONTH_YEAR.format(new Date(y, m - 1, d));
  }
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

/**
 * The due instant of a local date + time. With `timeZone` it is that wall-clock time in the project's zone; without one (a reminder saved before project time zones) it is
 * read in the viewer's clock, exactly as before.
 */
export const getReminderDueDateTime = (reminderDate: string, reminderTime: string, timeZone?: string | null): Date =>
  timeZone ? zonedWallClockToUtc(reminderDate, reminderTime || "00:00", timeZone) : new Date(`${reminderDate}T${reminderTime || "00:00"}:00`);

/** THE due instant of a stored reminder: the server's UTC dueAt when present, else its local time in its zone, else (old reminder) the viewer's clock. */
export const reminderDueInstant = (reminder: Pick<ReminderTiming, "reminderDate" | "reminderTime" | "dueAt" | "timeZone">): Date =>
  reminder.dueAt ? new Date(reminder.dueAt) : getReminderDueDateTime(reminder.reminderDate, reminder.reminderTime, reminder.timeZone);

export const getReminderTriggerDateTime = (
  reminderDate: string,
  reminderTime: string,
  notifyOffset: string,
  timeZone?: string | null
): Date => {
  const due = getReminderDueDateTime(reminderDate, reminderTime, timeZone);
  return new Date(due.getTime() - getNotifyOffsetMinutes(notifyOffset) * 60_000);
};

const reminderTriggerInstant = (reminder: ReminderTiming): Date =>
  new Date(reminderDueInstant(reminder).getTime() - getNotifyOffsetMinutes(reminder.notifyOffset) * 60_000);

export const getReminderTriggerStatus = (
  reminder: ReminderTiming,
  now: Date = new Date()
): ReminderTriggerStatus => {
  const triggerAt = reminderTriggerInstant(reminder);
  const dueAt = reminderDueInstant(reminder);
  const nowMs = now.getTime();
  if (nowMs < triggerAt.getTime()) return "upcoming";
  if (nowMs < dueAt.getTime()) return "due-soon";
  if (nowMs < dueAt.getTime() + DUE_NOW_GRACE_MS) return "due-now";
  return "overdue";
};

/** Human-readable {status, label, detail} for a reminder card, popup, or list row. */
export const getReminderStatusDisplay = (
  reminder: ReminderTiming & { country?: string | null },
  now: Date = new Date()
): ReminderStatusDisplay => {
  const status = getReminderTriggerStatus(reminder, now);
  const dueAt = reminderDueInstant(reminder);
  const triggerAt = reminderTriggerInstant(reminder);
  const time = formatReminderTime(reminder);

  if (status === "overdue") {
    return { status, label: "Overdue", detail: `Overdue by ${formatDuration(now.getTime() - dueAt.getTime())}` };
  }
  if (status === "due-now") {
    return { status, label: "Due Now", detail: `Scheduled for ${time}` };
  }
  if (status === "due-soon") {
    return { status, label: "Due Soon", detail: `Due in ${formatDuration(dueAt.getTime() - now.getTime())}` };
  }

  const dayDiff = calendarDaysBetween(now, dueAt, reminder.timeZone);
  let detail: string;
  if (dayDiff === 0) {
    detail = `Due Today at ${time}`;
  } else if (dayDiff === 1) {
    detail = "Starts Tomorrow";
  } else {
    const msUntilTrigger = triggerAt.getTime() - now.getTime();
    detail = msUntilTrigger <= 6 * 3_600_000 ? `Starts in ${formatDuration(msUntilTrigger)}` : "Upcoming";
  }
  return { status, label: "Upcoming", detail };
};

/**
 * Live preview of when a reminder-in-progress (not yet saved) will notify. With `timeZone` the date and time are the project's local time and the preview is shown in that
 * same zone (an India user adding a Qatar reminder sees Qatar time).
 */
export const getReminderPreview = (
  reminderDate: string,
  reminderTime: string,
  notifyOffset: string,
  timeZone?: string | null,
  now: Date = new Date()
): { date: string; time: string } | null => {
  if (!reminderDate || !reminderTime) return null;
  const triggerAt = getReminderTriggerDateTime(reminderDate, reminderTime, notifyOffset, timeZone);
  if (Number.isNaN(triggerAt.getTime())) return null;
  if (timeZone) {
    const local = utcToZonedWallClock(triggerAt, timeZone);
    return { date: formatHumanDateString(local.date, timeZone, now), time: `${formatHumanTime(local.time)} · ${zoneLabel(timeZone)}` };
  }
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
