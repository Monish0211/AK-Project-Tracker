import type { ProjectReminder } from "../types/ProjectReminder";

/**
 * A single reminder toast. Deliberately NOT persisted to localStorage —
 * toasts are an ephemeral, session-only UI layer ("live popup while the PMO
 * Portal is open"), fully separate from the Notification Bell's permanent
 * history (src/notifications/notificationStore.ts, backed by localStorage).
 * Dismissing a toast only ever removes it from this in-memory list; it never
 * touches the reminder or its Notification Bell entry.
 */
export interface ReminderToastData {
  id: string;
  reminder: ProjectReminder;
  /** ISO timestamp of the reminder's actual due date+time (reminderDate + reminderTime). */
  dueAt: string;
  /** ISO timestamp of when this toast was fired by the scheduler. */
  createdAt: string;
}

const TOAST_CHANGED_EVENT = "pmo:toast-changed";

class ToastStore {
  private toasts: ReminderToastData[] = [];

  getAll(): ReminderToastData[] {
    return this.toasts;
  }

  /** Newest reminder appears on top, per the stacking requirement. */
  push(toast: ReminderToastData): void {
    this.toasts = [toast, ...this.toasts];
    this.emit();
  }

  dismiss(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  private emit(): void {
    window.dispatchEvent(new Event(TOAST_CHANGED_EVENT));
  }
}

export const toastStore = new ToastStore();
export { TOAST_CHANGED_EVENT };
