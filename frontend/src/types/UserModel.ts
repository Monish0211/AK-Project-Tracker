export type UserRole = "Manager" | "Employee" | string;

export type AccountStatus = "Active" | "Inactive" | "Pending";

export interface UserModuleAccess {
  dashboard: boolean;
  projects: boolean;
  customerMaster: boolean;
  invoices: boolean;
  timesheets: boolean;
  reports: boolean;
  manpower: boolean;
  documents: boolean;
  settings: boolean;
  reminders: boolean;
}

export interface UserAssignedProjects {
  qatar: boolean;
  malaysia: boolean;
  india: boolean;
  oman: boolean;
  abuDhabi: boolean;
}

export interface UserApprovalRights {
  approveTimesheets: boolean;
  approveExpenses: boolean;
  approveReminders: boolean;
  archiveProjects: boolean;
}

export interface User {
  id: string;
  employeeId: string;
  employeeName: string;
  email: string;
  phone?: string;
  department: string;
  designation: string;
  reportingManager?: string;
  role: UserRole;
  status: AccountStatus;
  avatarUrl?: string;
  lastLoginAt?: string;
  createdAt: string;
  forcePasswordChange?: boolean;
  moduleAccess: UserModuleAccess;
  assignedProjects: UserAssignedProjects;
  approvalRights: UserApprovalRights;
}
