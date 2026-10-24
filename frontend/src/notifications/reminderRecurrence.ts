import type { ProjectReminder, ReminderRepeat } from "../types/ProjectReminder";
import { getNotifyOffsetMinutes } from "../types/ProjectReminder";

/**
 * Recurring reminders (Oct 2026). A reminder's `repeat` setting (Daily / Weekly / Monthly / Yearly) used to be saved and
 * displayed ("Repeats: Daily") but nothing ever acted on it, so a "recurring" reminder fired once and then stopped.
 *
 * Model: when an occurrence FIRES, the scheduler creates the next occurrence as a new reminder (the same way Snooze creates a
 * new reminder) and leaves the one that fired untouched as history. Occurrence N's date is always computed from the original
 * anchor date, never from the previous occurrence, so a monthly reminder anchored on the 31st goes Jan 31 -> Feb 28 -> Mar 31
 * (not Jan 31 -> Feb 28 -> Mar 28). If the app was closed for several periods, missed occurrences are skipped — the next one
 * created is the first whose notify time is still in the future — so reopening the app never replays a backlog.
 *
 * All arithmetic is on calendar dates (year / month / day), never on millisecond offsets, so it cannot drift across daylight
 * saving changes or time zones: "09:00 every day" stays 09:00 local.
 */

export interface RecurrenceMeta {
  recurrenceOf?: string;
  recurrenceAnchorDate?: string;
  recurrenceIndex?: number;
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

const daysInMonth = (year: number, monthIndex: number): number => new Date(year, monthIndex + 1, 0).getDate();

const parseDate = (date: string): { y: number; m: number; d: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
};

const format = (y: number, m: number, d: number): string => `${y}-${pad2(m + 1)}-${pad2(d)}`;

/** The date of occurrence number `k` (k = 0 is the anchor itself) of a reminder that starts on `anchor` and repeats `repeat`. */
export function occurrenceDate(anchor: string, repeat: ReminderRepeat, k: number): string | null {
  const a = parseDate(anchor);
  if (!a || k < 0) return null;
  switch (repeat) {
    case "Daily": {
      const d = new Date(a.y, a.m, a.d + k);
      return format(d.getFullYear(), d.getMonth(), d.getDate());
    }
    case "Weekly": {
      const d = new Date(a.y, a.m, a.d + 7 * k);
      return format(d.getFullYear(), d.getMonth(), d.getDate());
    }
    case "Monthly": {
      const total = a.m + k;
      const y = a.y + Math.floor(total / 12);
      const m = ((total % 12) + 12) % 12;
      return format(y, m, Math.min(a.d, daysInMonth(y, m)));
    }
    case "Yearly": {
      const y = a.y + k;
      return format(y, a.m, Math.min(a.d, daysInMonth(y, a.m)));
    }
    default:
      return null; // "None" (or anything unknown): not recurring
  }
}

export const isRecurring = (repeat: string | undefined): repeat is Exclude<ReminderRepeat, "None"> =>
  repeat === "Daily" || repeat === "Weekly" || repeat === "Monthly" || repeat === "Yearly";

const readMeta = (reminder: Pick<ProjectReminder, "reminderDate" | "metadata">): { anchor: string; index: number } => {
  const meta = (reminder.metadata ?? {}) as RecurrenceMeta;
  const anchor = typeof meta.recurrenceAnchorDate === "string" && parseDate(meta.recurrenceAnchorDate) ? meta.recurrenceAnchorDate : reminder.reminderDate;
  const index = typeof meta.recurrenceIndex === "number" && Number.isInteger(meta.recurrenceIndex) && meta.recurrenceIndex >= 0 ? meta.recurrenceIndex : 0;
  return { anchor, index };
};

const triggerTime = (date: string, time: string, notifyOffset: string): number => {
  const at = new Date(`${date}T${time || "00:00"}:00`).getTime();
  return at - getNotifyOffsetMinutes(notifyOffset) * 60_000;
};

/**
 * The next occurrence of a recurring reminder: the first one AFTER the occurrence that just fired whose notify time is still in
 * the future relative to `now`. Returns null for a one-time reminder or an unparseable date. Never loops unbounded.
 */
export function nextOccurrence(
  reminder: Pick<ProjectReminder, "reminderDate" | "reminderTime" | "notifyOffset" | "repeat" | "metadata">,
  now: Date
): { reminderDate: string; reminderTime: string; recurrenceAnchorDate: string; recurrenceIndex: number } | null {
  if (!isRecurring(reminder.repeat)) return null;
  const { anchor, index } = readMeta(reminder);
  if (!parseDate(anchor)) return null;
  for (let k = index + 1; k <= index + 4000; k++) {
    const date = occurrenceDate(anchor, reminder.repeat, k);
    if (!date) return null;
    if (triggerTime(date, reminder.reminderTime, reminder.notifyOffset) > now.getTime()) {
      return { reminderDate: date, reminderTime: reminder.reminderTime, recurrenceAnchorDate: anchor, recurrenceIndex: k };
    }
  }
  return null;
}
