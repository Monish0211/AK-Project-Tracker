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
  approvals: false,
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
  approvals: true,
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
  archiveProjects: false,
  deleteProjectPermanently: false,
};

const ALL_APPROVALS: UserApprovalRights = {
  archiveProjects: true,
  deleteProjectPermanently: true,
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
    "reports", "manpower", "documents", "notifications", "reminders", "approvals"
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
  // "approvals" defaulted on for Accounts too — this is the role the single
  // designated Accounts approver (see Settings > PR Requests) is normally
  // chosen from, though the actual routing decision is the separate
  // PRRequestApproverConfig row, not this role-based default.
  Accounts: modules("dashboard", "invoices", "reports", "documents", "notifications", "approvals"),
  "Management Viewer": modules("dashboard", "projects", "reports", "notifications"),
  "Read Only": modules("dashboard", "projects", "notifications"),
  // PR Request User — a deliberately narrow role: no Projects/Dashboard/etc
  // access at all, only the ability to submit and track their own PR
  // Requests via the Approvals module (see prRequests.service.ts's
  // requireModuleAccess("Approvals") gate).
  "PR Request User": modules("approvals"),
};

export const ROLE_APPROVAL_DEFAULTS: Record<SystemRole, UserApprovalRights> = {
  Administrator: ALL_APPROVALS,
  "PMO Manager": approvals("archiveProjects"),
  "Project Manager": NO_APPROVALS,
  "Project Coordinator": NO_APPROVALS,
  "Department Head": approvals("archiveProjects"),
  Engineer: NO_APPROVALS,
  Finance: NO_APPROVALS,
  Accounts: NO_APPROVALS,
  "Management Viewer": NO_APPROVALS,
  "Read Only": NO_APPROVALS,
  "PR Request User": NO_APPROVALS,
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
  // No Projects module access at all — region scoping is meaningless here.
  "PR Request User": NO_REGIONS,
};
