import { reminderService } from "../services/reminders/ReminderService";
import { notificationService } from "./notificationService";
import { toastStore } from "./toastStore";
import { NotificationRoutes } from "./notificationRoutes";
import { reminderSoundService } from "../services/audio/ReminderSoundService";
import { reminderLedger } from "./reminderLedger";
import { ReminderSchedulerCore, type FiredReminderDetail } from "./reminderSchedulerCore";

/** Dispatched on `window` once per batch of reminders the scheduler actually fires; `detail` is a FiredReminderDetail[]. */
export const REMINDER_FIRED_EVENT = "pmo:reminder-fired";

/**
 * ReminderScheduler — the sole authority for turning a pending reminder into a notification (Bell entry + Toast + chime +
 * robot alert), once its configured notify time arrives. The logic, and the guarantee that a reminder occurrence fires only
 * once, live in reminderSchedulerCore.ts (testable with fake timers); this file only connects it to the real services.
 *
 * Compares full Date+Time (reminderDate + reminderTime, minus the configured offset) against the current moment on every
 * tick — never day-only — so a reminder due 25-Jul 05:00 AM with "1 Minute Before" only fires at 04:59 AM.
 */
export const reminderScheduler = new ReminderSchedulerCore({
  getPendingReminders: () => reminderService.getPendingReminders(),
  updateReminder: (id, updates) => reminderService.updateReminder(id, updates),
  addReminder: (reminder) => reminderService.addReminder(reminder),
  notifyBell: ({ id, reminder, isDueNow, now }) => {
    // Notification Bell entry — a one-shot Event (persistent, never auto-resolves). The deterministic `id` makes a second
    // dispatch for the same occurrence a no-op in the store, so even a replay can never add a duplicate history row.
    notificationService.dispatchEvent({
      id,
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
  },
  // Toast — the ephemeral popup. Its own due-now/countdown styling is re-derived live from `dueAt` on every render.
  pushToast: (toast) => toastStore.push(toast),
  playSound: (keys) => {
    void reminderSoundService.playForReminders(keys);
  },
  emitFired: (batch: FiredReminderDetail[]) => {
    window.dispatchEvent(new CustomEvent(REMINDER_FIRED_EVENT, { detail: batch }));
  },
  ledger: reminderLedger,
  now: () => new Date(),
  eventTarget: window,
  setInterval: (handler, ms) => window.setInterval(handler, ms),
  clearInterval: (handle) => window.clearInterval(handle as number),
  setTimeout: (handler, ms) => window.setTimeout(handler, ms),
  log: console,
});
