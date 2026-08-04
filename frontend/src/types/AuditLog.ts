export type AuditModule =
  | "Dashboard"
  | "Projects"
  | "Customer Master"
  | "Timesheets"
  | "Invoices"
  | "Reports"
  | "Settings"
  | "User Management"
  | "Notifications";

export type AuditStatus = "Success" | "Warning" | "Failed";

export interface AuditLogTimelineStep {
  time: string;
  title: string;
  detail: string;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  dateKey: string; // YYYY-MM-DD for date filtering
  employeeName: string;
  employeeId: string;
  companyEmail: string;
  department: string;
  role: string;
  module: AuditModule;
  action: string;
  referenceNo?: string;
  affectedRecord?: string;
  ipAddress: string;
  device: string;
  browser: string;
  operatingSystem: string;
  location: string;
  sessionId: string;
  status: AuditStatus;
  description: string;
  timeline: AuditLogTimelineStep[];
  failureReason?: string;
}

export interface FailedLoginRecord {
  id: string;
  companyEmail: string;
  attemptTime: string;
  ipAddress: string;
  reason: string;
  status: "Failed" | "Blocked";
}

export interface SystemActivityItem {
  id: string;
  time: string;
  title: string;
  detail: string;
  module: AuditModule;
  user: string;
  badgeColor?: string;
}

export interface AuditKPIStats {
  totalEvents: number;
  successfulLoginsToday: number;
  failedLoginAttempts: number;
  projectChangesToday: number;
  activeSessions: number;
}

export interface AuditFilterOptions {
  searchQuery: string;
  eventType: string;
  userEmail: string;
  module: string;
  dateRange: "all" | "today" | "7days" | "30days";
  status: string;
}
