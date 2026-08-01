import type { PMONotification } from "./notificationTypes";
import type { Project } from "../types/Project";
import { NotificationRoutes } from "./notificationRoutes";

/**
 * Creates a deterministic Rule ID so that duplicate notifications are not generated
 * when the engine runs multiple times.
 */
export const createRuleId = (rulePrefix: string, projectId: string): string => {
  return `${rulePrefix}_${projectId}`;
};

/**
 * Evaluates a project and returns an array of active Rule Notifications.
 * These notifications auto-resolve when they are no longer returned.
 */
export const evaluateProjectRules = (
  project: Project,
  financials: { totalActualHours: number; totalCost: number; totalInvoiced: number; totalOutstanding: number }
): PMONotification[] => {
  const notifications: PMONotification[] = [];
  const now = new Date().toISOString();

  // Rule 1: Hours Overrun
  const budgetHours = project.manhourBudgetHours || project.totalHoursBudget || 0;
  if (budgetHours > 0 && financials.totalActualHours > budgetHours) {
    notifications.push({
      id: createRuleId("HRS_OVERRUN", project.id),
      ruleId: "HRS_OVERRUN",
      version: 1,
      title: "Hours Overrun",
      message: `Project ${project.prNo} has exceeded its budget of ${budgetHours} hours (Actual: ${financials.totalActualHours}).`,
      category: "Critical",
      severity: "Critical",
      source: "Projects",
      targetAudience: "Project Manager",
      deliveryChannels: ["InApp"],
      module: "Projects",
      projectId: project.id,
      projectCode: project.prNo,
      timestamp: now,
      isRead: false,
      isArchived: false,
      persistent: false,
      autoResolve: true,
      actionLabel: "Review Project",
      actionRoute: NotificationRoutes.PROJECT_EDIT(project.id),
    });
  } else if (budgetHours > 0) {
    // Rule 2: Budget Utilization (80%, 90%, 95%)
    const utilization = financials.totalActualHours / budgetHours;
    if (utilization >= 0.95) {
      notifications.push({
        id: createRuleId("BUDGET_95", project.id),
        ruleId: "BUDGET_95",
        version: 1,
        title: "Budget Critical (95%)",
        message: `Project ${project.prNo} has consumed ${(utilization * 100).toFixed(1)}% of its budgeted hours.`,
        category: "Warning",
        severity: "High",
        source: "Projects",
        targetAudience: "Project Manager",
        deliveryChannels: ["InApp"],
        module: "Projects",
        projectId: project.id,
        projectCode: project.prNo,
        timestamp: now,
        isRead: false,
        isArchived: false,
        persistent: false,
        autoResolve: true,
        actionLabel: "Review Project",
        actionRoute: NotificationRoutes.PROJECT_EDIT(project.id),
      });
    } else if (utilization >= 0.90) {
      notifications.push({
        id: createRuleId("BUDGET_90", project.id),
        ruleId: "BUDGET_90",
        version: 1,
        title: "Budget Warning (90%)",
        message: `Project ${project.prNo} has consumed ${(utilization * 100).toFixed(1)}% of its budgeted hours.`,
        category: "Warning",
        severity: "Medium",
        source: "Projects",
        targetAudience: "Project Manager",
        deliveryChannels: ["InApp"],
        module: "Projects",
        projectId: project.id,
        projectCode: project.prNo,
        timestamp: now,
        isRead: false,
        isArchived: false,
        persistent: false,
        autoResolve: true,
        actionLabel: "Review Project",
        actionRoute: NotificationRoutes.PROJECT_EDIT(project.id),
      });
    }
  }

  // Rule 3: Proactive Project Timeline Alerts (14-day, 7-day, Due Today, Overdue)
  if (project.projectStatus === "Active" && project.projectEndDate) {
    const endDateObj = new Date(project.projectEndDate);
    if (!isNaN(endDateObj.getTime())) {
      const currentDate = new Date();
      const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
      const endCal = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate());
      const diffTime = endCal.getTime() - today.getTime();
      const daysRemaining = Math.round(diffTime / (1000 * 3600 * 24));

      if (daysRemaining < 0) {
        // Overdue
        const overdueDays = Math.abs(daysRemaining);
        notifications.push({
          id: createRuleId("TIME_OVERRUN", project.id),
          ruleId: "TIME_OVERRUN",
          version: 1,
          title: "Project Overdue",
          message: `Project ${project.prNo} is active but passed its end date (${project.projectEndDate}) by ${overdueDays} day${overdueDays === 1 ? "" : "s"}.`,
          category: "Critical",
          severity: "Critical",
          source: "Projects",
          targetAudience: "Project Manager",
          deliveryChannels: ["InApp"],
          module: "Projects",
          projectId: project.id,
          projectCode: project.prNo,
          timestamp: now,
          isRead: false,
          isArchived: false,
          persistent: false,
          autoResolve: true,
          actionLabel: "Update Schedule",
          actionRoute: NotificationRoutes.PROJECT_EDIT(project.id),
        });
      } else if (daysRemaining === 0) {
        // Due Today
        notifications.push({
          id: createRuleId("PROJECT_DUE_TODAY", project.id),
          ruleId: "PROJECT_DUE_TODAY",
          version: 1,
          title: "Project Due Today",
          message: `Project ${project.prNo} end date is today (${project.projectEndDate}).`,
          category: "Critical",
          severity: "High",
          source: "Projects",
          targetAudience: "Project Manager",
          deliveryChannels: ["InApp"],
          module: "Projects",
          projectId: project.id,
          projectCode: project.prNo,
          timestamp: now,
          isRead: false,
          isArchived: false,
          persistent: false,
          autoResolve: true,
          actionLabel: "Review Project",
          actionRoute: NotificationRoutes.PROJECT_EDIT(project.id),
        });
      } else if (daysRemaining <= 7) {
        // Due Soon (1 to 7 days)
        notifications.push({
          id: createRuleId("PROJECT_ENDING", project.id),
          ruleId: "PROJECT_ENDING",
          version: 1,
          title: "Project Ending Soon (Within 7 Days)",
          message: `Project ${project.prNo} is due in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} (${project.projectEndDate}).`,
          category: "Warning",
          severity: "High",
          source: "Projects",
          targetAudience: "Project Manager",
          deliveryChannels: ["InApp"],
          module: "Projects",
          projectId: project.id,
          projectCode: project.prNo,
          timestamp: now,
          isRead: false,
          isArchived: false,
          persistent: false,
          autoResolve: true,
          actionLabel: "Review Project",
          actionRoute: NotificationRoutes.PROJECT_EDIT(project.id),
        });
      } else if (daysRemaining <= 14) {
        // Upcoming (8 to 14 days)
        notifications.push({
          id: createRuleId("PROJECT_ENDING_14", project.id),
          ruleId: "PROJECT_ENDING_14",
          version: 1,
          title: "Project Ending in 14 Days",
          message: `Project ${project.prNo} is due in ${daysRemaining} days (${project.projectEndDate}).`,
          category: "Warning",
          severity: "Medium",
          source: "Projects",
          targetAudience: "Project Manager",
          deliveryChannels: ["InApp"],
          module: "Projects",
          projectId: project.id,
          projectCode: project.prNo,
          timestamp: now,
          isRead: false,
          isArchived: false,
          persistent: false,
          autoResolve: true,
          actionLabel: "Review Project",
          actionRoute: NotificationRoutes.PROJECT_EDIT(project.id),
        });
      }
    }
  }

  // Rule 5: Cost > Work Order Value (Negative Profit)
  // Assuming Work Order Value is part of the project object or calculated.
  // For simplicity, we use totalWOQty (Wait, typically we need getProjectFinancials for this).
  // I will use totalCost compared to some budget/WO value if provided.
  // We'll skip for now if not strictly accessible.

  // Rule 6: Outstanding Payment High
  if (financials.totalOutstanding > 100000) { // arbitrary threshold, could be 0
    notifications.push({
      id: createRuleId("OUTSTANDING_PAYMENT", project.id),
      ruleId: "OUTSTANDING_PAYMENT",
      version: 1,
      title: "High Outstanding Payment",
      message: `Project ${project.prNo} has an outstanding balance of ₹${financials.totalOutstanding.toLocaleString("en-IN")}.`,
      category: "Critical",
      severity: "High",
      source: "Invoices",
      targetAudience: "Finance",
      deliveryChannels: ["InApp"],
      module: "Invoices",
      projectId: project.id,
      projectCode: project.prNo,
      timestamp: now,
      isRead: false,
      isArchived: false,
      persistent: false,
      autoResolve: true,
      actionLabel: "View Invoices",
      // Invoice Management now lives inside Edit Project's Invoices step
      // (Step 7) — the standalone Invoices module is gone. actionState.tab
      // tells EditProject/ProjectForm to open straight onto that step.
      actionRoute: NotificationRoutes.PROJECT_EDIT(project.id),
      actionState: { tab: "invoices" },
    });
  }

  // Rule 7: Active Project Missing Budget
  if (project.projectStatus === "Active" && budgetHours === 0) {
    notifications.push({
      id: createRuleId("MISSING_BUDGET", project.id),
      ruleId: "MISSING_BUDGET",
      version: 1,
      title: "Missing Budget",
      message: `Project ${project.prNo} is active but has no budget hours defined.`,
      category: "Critical",
      severity: "Medium",
      source: "Projects",
      targetAudience: "Project Manager",
      deliveryChannels: ["InApp"],
      module: "Projects",
      projectId: project.id,
      projectCode: project.prNo,
      timestamp: now,
      isRead: false,
      isArchived: false,
      persistent: false,
      autoResolve: true,
      actionLabel: "Update Budget",
      actionRoute: NotificationRoutes.PROJECT_EDIT(project.id),
    });
  }

  return notifications;
};
