import type { ProjectReminder } from "../types/ProjectReminder";
import { getNotifyOffsetMinutes } from "../types/ProjectReminder";
import { reminderService } from "../services/reminders/ReminderService";
import { notificationService } from "./notificationService";
import { toastStore } from "./toastStore";
import { NotificationRoutes } from "./notificationRoutes";
import { reminderSoundService } from "../services/audio/ReminderSoundService";

// Poll every 15s: frequent enough that a 1-minute notify offset never slips
// noticeably late, cheap enough (one array filter/map over pending reminders
// only — never all reminders, never raw timesheet/project data) to run
// indefinitely without meaningful CPU cost.
const POLL_INTERVAL_MS = 15_000;

const parseDueDateTime = (reminder: ProjectReminder): Date =>
  new Date(`${reminder.reminderDate}T${reminder.reminderTime || "00:00"}:00`);

const computeTriggerTime = (reminder: ProjectReminder): Date => {
  const due = parseDueDateTime(reminder);
  const offsetMinutes = getNotifyOffsetMinutes(reminder.notifyOffset);
  return new Date(due.getTime() - offsetMinutes * 60_000);
};

/**
 * ReminderScheduler — the sole authority for turning a pending reminder into
 * a notification (Bell entry + Toast), once its configured notify time
 * arrives. Runs entirely against reminderService (never localStorage
 * directly), so swapping ClientReminderRepository for a future REST-backed
 * repository requires zero changes here.
 *
 * Compares full Date+Time (reminderDate + reminderTime, minus the configured
 * offset) against the current moment on every tick — never day-only — so a
 * reminder due 25-Jul 05:00 AM with "1 Minute Before" only fires at 04:59 AM,
 * not merely because today's date matches.
 */
class ReminderScheduler {
  private timerId: number | null = null;
  private onDataChanged = (): void => {
    // Deferred rather than called inline: this listener also fires as a
    // side effect of this scheduler's own fire() (via updateReminder ->
    // emitChange), so running synchronously would re-enter tick() from
    // inside its own forEach. Deferring to a fresh task breaks that chain
    // while still re-checking effectively immediately.
    setTimeout(() => this.tick(), 0);
  };

  start(): void {
    if (this.timerId !== null) return; // already running — idempotent
    this.tick(); // catch up immediately (covers reminders that became due while the app was closed)
    this.timerId = window.setInterval(() => this.tick(), POLL_INTERVAL_MS);

    // Re-check immediately whenever a reminder is created, edited, snoozed,
    // completed, or deleted — reminderService.emitChange() fires this event
    // on every one of those — instead of waiting up to POLL_INTERVAL_MS for
    // the next scheduled poll. No page refresh is ever required.
    window.addEventListener("pmo:reminders-changed", this.onDataChanged);
  }

  stop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    window.removeEventListener("pmo:reminders-changed", this.onDataChanged);
  }

  private tick(): void {
    const now = new Date();

    // Only pending, not-yet-triggered reminders are ever evaluated — a
    // reminder marked notificationGenerated never re-enters this check, so
    // refreshing the app (or any later tick) can never fire it twice.
    const candidates = reminderService.getPendingReminders().filter((r) => !r.notificationGenerated);

    let firedCount = 0;
    candidates.forEach((reminder) => {
      const triggerAt = computeTriggerTime(reminder);
      if (now.getTime() >= triggerAt.getTime()) {
        this.fire(reminder, now);
        firedCount++;
      }
    });

    if (firedCount > 0) {
      reminderSoundService.play();
    }
  }

  private fire(reminder: ProjectReminder, now: Date): void {
    const dueAt = parseDueDateTime(reminder);
    const isDueNow = now.getTime() >= dueAt.getTime();

    // Notification Bell entry — a one-shot Event (persistent, never
    // auto-resolves), generated from the exact same reminder + moment as the
    // toast below. This is the only place reminder notifications originate.
    notificationService.dispatchEvent({
      ruleId: "REMINDER_TRIGGER",
      version: 1,
      title: isDueNow ? "Reminder Due Now" : "Reminder",
      message: `${reminder.title} — ${reminder.projectCode}`,
      category: isDueNow ? "Critical" : "Warning",
      severity: reminder.priority === "Critical" || isDueNow ? "Critical" : "Medium",
      source: "Reminders",
      targetAudience: "Everyone",
      deliveryChannels: ["InApp", "Toast"],
      module: "Projects",
      projectId: reminder.projectId,
      projectCode: reminder.projectCode,
      timestamp: now.toISOString(),
      actionLabel: "Open Project",
      actionRoute: NotificationRoutes.PROJECT_EDIT(reminder.projectId),
      metadata: { reminderId: reminder.id, isDueNow },
    });

    // Toast — the ephemeral popup. Its own due-now/countdown styling is
    // re-derived live from `dueAt` on every render, so it keeps updating even
    // though this fire() only ever runs once per reminder.
    toastStore.push({
      id: `toast-${reminder.id}-${now.getTime()}`,
      reminder,
      dueAt: dueAt.toISOString(),
      createdAt: now.toISOString(),
    });

    reminderService.updateReminder(reminder.id, {
      notificationGenerated: true,
      triggeredAt: now.toISOString(),
    });
  }
}

export const reminderScheduler = new ReminderScheduler();
