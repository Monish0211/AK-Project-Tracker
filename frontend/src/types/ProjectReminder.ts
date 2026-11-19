export type ReminderPriority = "Critical" | "High" | "Medium" | "Low";
export type ReminderStatus = "Pending" | "Completed" | "Dismissed" | "Cancelled";
export type ReminderRepeat = "None" | "Daily" | "Weekly" | "Monthly" | "Yearly";

export type ReminderNotifyOffset =
  | "At Due Time"
  | "1 Minute Before"
  | "5 Minutes Before"
  | "10 Minutes Before"
  | "30 Minutes Before"
  | "1 Hour Before"
  | "1 Day Before";

export const NOTIFY_OFFSET_OPTIONS: ReminderNotifyOffset[] = [
  "At Due Time",
  "1 Minute Before",
  "5 Minutes Before",
  "10 Minutes Before",
  "30 Minutes Before",
  "1 Hour Before",
  "1 Day Before",
];

const NOTIFY_OFFSET_MINUTES: Record<string, number> = {
  "At Due Time": 0,
  "1 Minute Before": 1,
  "5 Minutes Before": 5,
  "10 Minutes Before": 10,
  "30 Minutes Before": 30,
  "1 Hour Before": 60,
  "1 Day Before": 24 * 60,
  // Legacy values from the earlier day-only offset model — mapped so any
  // reminder saved before this change still evaluates to a sane trigger
  // time instead of throwing or silently never firing.
  "On Due Date": 0,
  "3 Days Before": 3 * 24 * 60,
  "7 Days Before": 7 * 24 * 60,
  "Custom Offset": 0,
};

/** Minutes before the reminder's due date+time that its notification should fire. */
export const getNotifyOffsetMinutes = (offset: string): number => NOTIFY_OFFSET_MINUTES[offset] ?? 0;

export interface ProjectReminder {
  id: string;
  projectId: string;
  projectCode: string;
  title: string;
  description?: string;
  reminderType: string; // e.g., Invoice, Client Meeting, Payment Follow-up, etc.
  priority: ReminderPriority;
  status: ReminderStatus;
  reminderDate: string; // YYYY-MM-DD
  reminderTime: string; // HH:mm
  notifyOffset: ReminderNotifyOffset;
  repeat: ReminderRepeat;
  createdBy: string;
  createdDate: string;
  completedDate?: string;
  isCompleted: boolean;
  /** Set once the Reminder Scheduler has fired this reminder's toast + notification, so it never fires twice. */
  notificationGenerated?: boolean;
  /** ISO timestamp of when notificationGenerated was set. */
  triggeredAt?: string;
  metadata?: any;
  /** The project's stored country (from the reminders API). Used only to show each country's reminders in its own section; the server already limits which are returned. */
  regionId?: string | null;
  country?: string | null;
  /**
   * Project-country time zones: reminderDate + reminderTime are the PROJECT's local time in this IANA zone (from the project's country, chosen by the server), and dueAt
   * is that moment as an exact UTC instant. Absent on a reminder saved before this change: it keeps its old behaviour (read in the viewer's clock) and is never shifted.
   */
  dueAt?: string | null;
  timeZone?: string | null;
}
