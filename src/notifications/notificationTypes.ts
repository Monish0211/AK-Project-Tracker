export type NotificationCategory = "Critical" | "Warning" | "Information" | "Success";
export type NotificationSeverity = "Critical" | "High" | "Medium" | "Low" | "Info";
export type NotificationSource =
  | "Projects"
  | "Timesheets"
  | "Invoices"
  | "Payments"
  | "Expense Budget"
  | "Dashboard"
  | "Resources"
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
  metadata?: Record<string, any>;
}
