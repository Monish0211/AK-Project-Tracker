export type SystemRole =
  | "Administrator"
  | "PMO Manager"
  | "Project Manager"
  | "Project Coordinator"
  | "Department Head"
  | "Engineer"
  | "Finance"
  | "Accounts"
  | "Management Viewer"
  | "Read Only";

export const SYSTEM_ROLES: SystemRole[] = [
  "Administrator",
  "PMO Manager",
  "Project Manager",
  "Project Coordinator",
  "Department Head",
  "Engineer",
  "Finance",
  "Accounts",
  "Management Viewer",
  "Read Only",
];

export type AccountStatus = "Active" | "Inactive";

export type EmployeeType = "Permanent" | "Contract" | "Consultant" | "Intern";

export const EMPLOYEE_TYPES: EmployeeType[] = ["Permanent", "Contract", "Consultant", "Intern"];

export interface UserModuleAccess {
  dashboard: boolean;
  projects: boolean;
  customerMaster: boolean;
  timesheets: boolean;
  invoices: boolean;
  reports: boolean;
  manpower: boolean;
  documents: boolean;
  settings: boolean;
  notifications: boolean;
  reminders: boolean;
}

/**
 * Which project regions this user's assignments are scoped to — renamed
 * from the earlier "Assigned Projects" concept. Users only ever see/act on
 * projects belonging to a region they're granted here (enforced wherever
 * project region access is eventually checked — this module only carries
 * the permission flags, it doesn't filter Project Repository itself).
 */
export interface UserProjectRegionAccess {
  india: boolean;
  qatar: boolean;
  malaysia: boolean;
  oman: boolean;
  abuDhabi: boolean;
  fzi: boolean;
  elixirQatar: boolean;
}

export interface UserApprovalRights {
  archiveProjects: boolean;
  deleteProjectPermanently: boolean;
}

export interface UserAccountSecurity {
  /** Policy toggle — whether a first-time login is forced to set a new password. Defaults on for new users. */
  forcePasswordChangeOnFirstLogin: boolean;
  /** Manually locked by an Administrator — distinct from Active/Inactive status. */
  accountLocked: boolean;
  /** Disabled placeholder — no real 2FA flow exists yet; always false today. */
  twoFactorEnabled: boolean;
  /** Placeholder — null means "not enforced." No expiry logic runs anywhere yet. */
  passwordExpiryDays: number | null;
  /** ISO datetime of the most recent password reset (manual or self-service), or null if never reset. */
  lastPasswordResetAt: string | null;
}

export interface User {
  id: string;
  employeeId: string;
  employeeName: string;
  /** Company Email — the identity a user logs in with. */
  email: string;
  phone?: string;
  department: string;
  designation: string;
  reportingManager?: string;
  employeeType: EmployeeType;
  role: SystemRole;
  status: AccountStatus;
  avatarUrl?: string;

  // ── Login Information ──────────────────────────────────────────────
  /** Only meaningful while isFirstLogin is true — the password an Administrator generated for the employee's first sign-in. */
  temporaryPassword?: string;
  /** True until the employee has completed their first sign-in and set their own password. */
  isFirstLogin: boolean;
  /** ISO datetime of the most recent successful login, or null if the account has never logged in. */
  lastLoginAt: string | null;

  moduleAccess: UserModuleAccess;
  projectRegionAccess: UserProjectRegionAccess;
  approvalRights: UserApprovalRights;
  accountSecurity: UserAccountSecurity;

  // ── Account Information (audit) ─────────────────────────────────────
  createdAt: string;
  createdBy: string;
  lastModifiedAt?: string;
}
