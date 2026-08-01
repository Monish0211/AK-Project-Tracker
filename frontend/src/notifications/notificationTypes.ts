export type NotificationCategory = "Critical" | "Warning" | "Information" | "Success";
export type NotificationSeverity = "Critical" | "High" | "Medium" | "Low" | "Info";
export type NotificationSource =
  | "Projects"
  | "Timesheets"
  | "Invoices"
  | "Payments"
  | "Expense Budget"
  | "Dashboard"
  | "Documents"
  | "System"
  | "Reminders";

export type TargetAudience =
  | "Everyone"
  | "Administrator"
  | "Management"
  | "Project Manager"
  | "Project Engineer"
  | "Finance"
  | "HR";

export type DeliveryChannel = "InApp" | "Toast" | "Email" | "Push" | "Teams" | "Slack";

/**
 * Extra react-router navigation `state` carried alongside actionRoute — lets
 * an action deep-link into a specific tab/record instead of just the bare
 * route. Used to open Edit Project straight onto its Invoices step (Step 7 —
 * Invoice Management) and, when known, expand the activity/highlight the
 * invoice line the notification is about.
 */
export interface NotificationActionState {
  tab?: string;
  activityId?: string;
  invoiceLineId?: string;
}

export interface PMONotification {
  id: string; // Deterministic ID for rules (e.g., HRS_OVERRUN_PR1001), random UUID for events
  ruleId: string; // e.g., HRS_OVERRUN, PROJECT_CREATED
  version: number; // Rule version to support future changes
  title: string;
  message: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  source: NotificationSource;
  targetAudience: TargetAudience;
  deliveryChannels: DeliveryChannel[];
  module?: string;
  projectId?: string;
  projectCode?: string;
  timestamp: string; // ISO date string
  isRead: boolean;
  isArchived: boolean;
  persistent: boolean; // True for Events, False for Rules (which auto-resolve)
  autoResolve: boolean; // True for Rules, False for Events
  actionLabel?: string;
  actionRoute?: string;
  actionState?: NotificationActionState;
  metadata?: Record<string, any>;
}
