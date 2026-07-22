import { getProjects } from "../services/projectService";
import { evaluateProjectRules } from "./notificationRules";
import type { PMONotification } from "./notificationTypes";
import { NotificationStore } from "./notificationStore";
import { getAllTimesheetImports } from "../services/timesheetService";
import { getProjectActualHours } from "../services/timesheetSyncService";

/**
 * The NotificationEngine is responsible for continuous evaluation of Rule Notifications.
 * It periodically (or event-driven) queries current data states, runs them through the Rule Engine,
 * and synchronizes the output with the NotificationStore.
 *
 * Reminders are NOT evaluated here — they are one-shot events (fire once, then
 * stay in history) rather than auto-resolving rules, so they're handled by the
 * dedicated ReminderScheduler (src/notifications/reminderScheduler.ts), which
 * calls notificationService.dispatchEvent() directly. Keeping that as the only
 * code path that decides when a reminder becomes a notification avoids two
 * systems disagreeing about the same reminder.
 */
export class NotificationEngine {
  private store: NotificationStore;

  constructor(store: NotificationStore) {
    this.store = store;
  }

  /**
   * Evaluates all active business rules against current system data.
   * Dispatches the active rules to the store, which will handle auto-resolving
   * rules that are no longer active.
   */
  public evaluateRules() {
    const projects = getProjects();
    const timesheetImports = getAllTimesheetImports();
    const activeRules: PMONotification[] = [];

    // Evaluate project-level rules
    for (const project of projects) {
      if (!project.prNo) continue; // safety check
      const totalInvoiceQty = project.totalInvoiceQty || 0;
      const totalActualHours = getProjectActualHours(project.prNo, timesheetImports);
      const pendingAmount = project.pendingAmount || 0;

      const financials = {
        totalActualHours,
        totalCost: 0,
        totalInvoiced: totalInvoiceQty,
        totalOutstanding: pendingAmount,
      };

      const projectRules = evaluateProjectRules(project, financials);
      activeRules.push(...projectRules);
    }

    // Sync evaluated rules with the store
    this.store.syncRuleNotifications(activeRules);
  }

  /**
   * Mounts the engine to the global PMO data event.
   * Whenever data changes (Project saved, Timesheet imported, Reminder added, etc),
   * this engine automatically re-evaluates rules.
   */
  public mount() {
    this.evaluateRules(); // initial run

    const listener = () => {
      this.evaluateRules();
    };
    window.addEventListener("pmo:data-changed", listener);
    // Reminders specifically trigger pmo:data-changed so it's already covered.

    return () => {
      window.removeEventListener("pmo:data-changed", listener);
    };
  }
}
