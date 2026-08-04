import type {
  SystemRole,
  UserModuleAccess,
  UserProjectRegionAccess,
  UserApprovalRights,
} from "../types/UserModel";

/**
 * Recommended module/approval defaults per System Role — shared by the mock
 * dataset (mockUsers.ts) and the Add User drawer, so picking a role while
 * creating a new user pre-fills sensible permissions instead of starting
 * from a blank grid every time. Only ever applied when creating a NEW user;
 * changing an existing user's role in Edit mode never silently overwrites
 * permissions an Administrator already customized.
 */

const NO_MODULES: UserModuleAccess = {
  dashboard: false,
  projects: false,
  customerMaster: false,
  timesheets: false,
  invoices: false,
  reports: false,
  manpower: false,
  documents: false,
  settings: false,
  notifications: false,
  reminders: false,
};

const ALL_MODULES: UserModuleAccess = {
  dashboard: true,
  projects: true,
  customerMaster: true,
  timesheets: true,
  invoices: true,
  reports: true,
  manpower: true,
  documents: true,
  settings: true,
  notifications: true,
  reminders: true,
};

function modules(...keys: (keyof UserModuleAccess)[]): UserModuleAccess {
  const result = { ...NO_MODULES };
  keys.forEach((key) => {
    result[key] = true;
  });
  return result;
}

export const NO_REGIONS: UserProjectRegionAccess = {
  india: false,
  qatar: false,
  malaysia: false,
  oman: false,
  abuDhabi: false,
  fzi: false,
  elixirQatar: false,
};

export const ALL_REGIONS: UserProjectRegionAccess = {
  india: true,
  qatar: true,
  malaysia: true,
  oman: true,
  abuDhabi: true,
  fzi: true,
  elixirQatar: true,
};

export function regions(...keys: (keyof UserProjectRegionAccess)[]): UserProjectRegionAccess {
  const result = { ...NO_REGIONS };
  keys.forEach((key) => {
    result[key] = true;
  });
  return result;
}

const NO_APPROVALS: UserApprovalRights = {
  approveTimesheets: false,
  approveExpenses: false,
  approveInvoices: false,
  approveCustomers: false,
  approveBudgetChanges: false,
  approveProjectCreation: false,
  approveReminders: false,
  archiveProjects: false,
};

const ALL_APPROVALS: UserApprovalRights = {
  approveTimesheets: true,
  approveExpenses: true,
  approveInvoices: true,
  approveCustomers: true,
  approveBudgetChanges: true,
  approveProjectCreation: true,
  approveReminders: true,
  archiveProjects: true,
};

function approvals(...keys: (keyof UserApprovalRights)[]): UserApprovalRights {
  const result = { ...NO_APPROVALS };
  keys.forEach((key) => {
    result[key] = true;
  });
  return result;
}

export const ROLE_MODULE_DEFAULTS: Record<SystemRole, UserModuleAccess> = {
  Administrator: ALL_MODULES,
  "PMO Manager": modules(
    "dashboard", "projects", "customerMaster", "timesheets", "invoices",
    "reports", "manpower", "documents", "notifications", "reminders"
  ),
  "Project Manager": modules(
    "dashboard", "projects", "timesheets", "invoices", "reports",
    "manpower", "documents", "notifications", "reminders"
  ),
  "Project Coordinator": modules("dashboard", "projects", "timesheets", "documents", "notifications", "reminders"),
  "Department Head": modules(
    "dashboard", "projects", "timesheets", "reports", "manpower",
    "documents", "notifications", "reminders"
  ),
  Engineer: modules("dashboard", "projects", "timesheets", "documents", "notifications"),
  Finance: modules("dashboard", "projects", "invoices", "reports", "customerMaster", "documents", "notifications"),
  Accounts: modules("dashboard", "invoices", "reports", "documents", "notifications"),
  "Management Viewer": modules("dashboard", "projects", "reports", "notifications"),
  "Read Only": modules("dashboard", "projects", "notifications"),
};

export const ROLE_APPROVAL_DEFAULTS: Record<SystemRole, UserApprovalRights> = {
  Administrator: ALL_APPROVALS,
  "PMO Manager": approvals(
    "approveTimesheets", "approveExpenses", "approveProjectCreation",
    "approveReminders", "archiveProjects"
  ),
  "Project Manager": approvals("approveTimesheets", "approveExpenses", "approveProjectCreation"),
  "Project Coordinator": NO_APPROVALS,
  "Department Head": approvals("approveTimesheets", "approveBudgetChanges", "archiveProjects"),
  Engineer: NO_APPROVALS,
  Finance: approvals("approveInvoices", "approveExpenses", "approveBudgetChanges"),
  Accounts: approvals("approveInvoices", "approveExpenses"),
  "Management Viewer": NO_APPROVALS,
  "Read Only": NO_APPROVALS,
};

/** Sensible default region scope for a brand-new user of this role — broad for senior roles, empty for the rest (an Administrator assigns regions explicitly). */
export const ROLE_REGION_DEFAULTS: Record<SystemRole, UserProjectRegionAccess> = {
  Administrator: ALL_REGIONS,
  "PMO Manager": ALL_REGIONS,
  "Project Manager": regions("india"),
  "Project Coordinator": regions("india"),
  "Department Head": regions("india"),
  Engineer: regions("india"),
  Finance: regions("india"),
  Accounts: regions("india"),
  "Management Viewer": ALL_REGIONS,
  "Read Only": NO_REGIONS,
};
