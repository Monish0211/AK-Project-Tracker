import { ClientNotificationRepository } from "./notificationRepository";
import { NotificationStore } from "./notificationStore";
import { NotificationEngine } from "./notificationEngine";
import type { PMONotification } from "./notificationTypes";

// 1. Initialize dependencies
// Future Migration: Replace `ClientNotificationRepository` with `RestNotificationRepository` here.
const repository = new ClientNotificationRepository();
const store = new NotificationStore(repository);
const engine = new NotificationEngine(store);

// Start the continuous rule evaluation engine. Deferred to a microtask:
// projectService.ts imports this module, and notificationEngine.ts imports
// getProjects back from projectService.ts, so calling mount() synchronously
// here would invoke getProjects() while projectService.ts is still mid-
// evaluation (its own `var`-hoisted export not yet assigned), throwing
// "getProjects is not a function" before React ever mounts.
queueMicrotask(() => engine.mount());

/**
 * Public facade for the Notification System.
 * Use this service to dispatch events and query the store.
 */
class NotificationServiceFacade {
  
  // --- UI Queries (Store Access) ---

  getAll(): PMONotification[] {
    return store.getAll();
  }

  getUnreadCount(): number {
    return store.getUnreadCount();
  }

  markAsRead(id: string) {
    store.markAsRead(id);
  }

  markAllAsRead() {
    store.markAllAsRead();
  }

  archive(id: string) {
    store.archive(id);
  }

  clearRead() {
    store.clearRead();
  }

  // --- Event Generation ---

  /**
   * Dispatches a one-time Event Notification (e.g., Project Created, Timesheet Imported).
   * Events are persistent and do not auto-resolve.
   *
   * `id`/`isRead` are optional (Priority #6 Phase 3B) — omitted, this is
   * byte-identical to before: a fresh random id, always unread, exactly
   * reminderScheduler.ts's existing usage. Passed explicitly, this is how
   * backendNotificationSync.ts feeds a REAL backend Notification's own id/
   * read-state through this same entry point, so NotificationStore's
   * existing id-based dedup (addEventNotification()) applies to backend
   * events too, without a second dedup mechanism.
   */
  dispatchEvent(
    event: Omit<PMONotification, "id" | "persistent" | "autoResolve" | "isRead" | "isArchived"> & {
      id?: string;
      isRead?: boolean;
    }
  ) {
    const { id, isRead, ...rest } = event;
    const newEvent: PMONotification = {
      ...rest,
      id: id ?? crypto.randomUUID(),
      persistent: true,
      autoResolve: false,
      isRead: isRead ?? false,
      isArchived: false,
    };
    store.addEventNotification(newEvent);
  }

  /**
   * Forces the Rule Engine to re-evaluate all rules.
   * Typically not needed manually as `pmo:data-changed` triggers it automatically.
   */
  refreshRules() {
    engine.evaluateRules();
  }
}

export const notificationService = new NotificationServiceFacade();
