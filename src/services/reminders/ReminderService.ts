import type { ProjectReminder } from "../../types/ProjectReminder";
import { ClientReminderRepository } from "./ClientReminderRepository";

// Future Migration: Replace `ClientReminderRepository` with `RestReminderRepository` here.
const repository = new ClientReminderRepository();

export type SnoozeOption = "5m" | "10m" | "30m" | "1h" | "tomorrow";

const SNOOZE_MINUTES: Record<Exclude<SnoozeOption, "tomorrow">, number> = {
  "5m": 5,
  "10m": 10,
  "30m": 30,
  "1h": 60,
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

const toDateTimeParts = (d: Date): { date: string; time: string } => ({
  date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
  time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
});

class ReminderServiceFacade {
  getAllReminders(): ProjectReminder[] {
    return repository.getAll();
  }

  getRemindersByProject(projectId: string): ProjectReminder[] {
    return this.getAllReminders().filter((r) => r.projectId === projectId);
  }

  getPendingReminders(): ProjectReminder[] {
    return this.getAllReminders().filter((r) => r.status === "Pending");
  }

  addReminder(reminder: Omit<ProjectReminder, "id" | "createdDate" | "isCompleted">) {
    const newReminder: ProjectReminder = {
      ...reminder,
      id: crypto.randomUUID(),
      createdDate: new Date().toISOString(),
      isCompleted: reminder.status === "Completed",
    };
    const reminders = this.getAllReminders();
    reminders.push(newReminder);
    repository.saveAll(reminders);
    this.emitChange();
    return newReminder;
  }

  updateReminder(id: string, updates: Partial<ProjectReminder>) {
    let reminders = this.getAllReminders();
    reminders = reminders.map((r) => {
      if (r.id === id) {
        const updated = { ...r, ...updates };
        if (updated.status === "Completed" && r.status !== "Completed") {
          updated.isCompleted = true;
          updated.completedDate = new Date().toISOString();
        } else if (updated.status !== "Completed") {
          updated.isCompleted = false;
        }
        return updated;
      }
      return r;
    });
    repository.saveAll(reminders);
    this.emitChange();
  }

  deleteReminder(id: string) {
    let reminders = this.getAllReminders();
    reminders = reminders.filter((r) => r.id !== id);
    repository.saveAll(reminders);
    this.emitChange();
  }

  /**
   * Creates the next occurrence of a reminder at now + the snooze duration
   * (or, for "tomorrow", at the same time of day one day out). The original
   * reminder is left completely untouched — it already carries
   * notificationGenerated: true from having just fired, so it simply stays
   * as history and won't fire again. The new occurrence always uses "At Due
   * Time" so it fires exactly when the snooze period elapses.
   */
  snoozeReminder(reminder: ProjectReminder, option: SnoozeOption): ProjectReminder {
    const now = new Date();
    let target: Date;

    if (option === "tomorrow") {
      const [h, m] = reminder.reminderTime.split(":").map(Number);
      target = new Date(now);
      target.setDate(target.getDate() + 1);
      target.setHours(h || 0, m || 0, 0, 0);
    } else {
      target = new Date(now.getTime() + SNOOZE_MINUTES[option] * 60_000);
    }

    const { date, time } = toDateTimeParts(target);

    return this.addReminder({
      projectId: reminder.projectId,
      projectCode: reminder.projectCode,
      title: reminder.title,
      description: reminder.description,
      reminderType: reminder.reminderType,
      priority: reminder.priority,
      status: "Pending",
      reminderDate: date,
      reminderTime: time,
      notifyOffset: "At Due Time",
      repeat: "None",
      createdBy: reminder.createdBy,
    });
  }

  private emitChange() {
    // Notify the application that data changed (this triggers the Notification Engine)
    window.dispatchEvent(new Event("pmo:data-changed"));
    window.dispatchEvent(new Event("pmo:reminders-changed")); // specific event if UI needs to refresh just reminders
  }
}

export const reminderService = new ReminderServiceFacade();
