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
  addProject: false,
  prRequest: false,
  manpowerConversionRates: false,
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
  addProject: true,
  prRequest: true,
  // Never pre-ticked, not even for an Administrator: this capability is granted explicitly, per user (it decides who manages the manpower conversion rates).
  manpowerConversionRates: false,
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
  raiseInvoice: false,
  editInvoice: false,
  deleteInvoice: false,
  viewAllProjects: false,
};

const ALL_APPROVALS: UserApprovalRights = {
  archiveProjects: true,
  deleteProjectPermanently: true,
  raiseInvoice: true,
  editInvoice: true,
  deleteInvoice: true,
  viewAllProjects: true,
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
  // "addProject" / "prRequest" (Oct 2026): pre-ticked for exactly the roles that could already create projects ("projects",
  // not Read Only) or submit PR Requests ("approvals", not Read Only) before these two modules existed — the same rule the
  // backend migration used to backfill existing users. Only a starting point for a NEW user; the Administrator can untick them.
  "PMO Manager": modules(
    "dashboard", "projects", "addProject", "customerMaster", "timesheets", "invoices",
    "reports", "manpower", "documents", "notifications", "reminders", "approvals", "prRequest"
  ),
  "Project Manager": modules(
    "dashboard", "projects", "addProject", "timesheets", "invoices", "reports",
    "manpower", "documents", "notifications", "reminders"
  ),
  "Project Coordinator": modules("dashboard", "projects", "addProject", "timesheets", "documents", "notifications", "reminders"),
  "Department Head": modules(
    "dashboard", "projects", "addProject", "timesheets", "reports", "manpower",
    "documents", "notifications", "reminders"
  ),
  Engineer: modules("dashboard", "projects", "addProject", "timesheets", "documents", "notifications"),
  Finance: modules("dashboard", "projects", "addProject", "invoices", "reports", "customerMaster", "documents", "notifications"),
  // "approvals" defaulted on for Accounts too — this is the role the single
  // designated Accounts approver (see Settings > PR Requests) is normally
  // chosen from, though the actual routing decision is the separate
  // PRRequestApproverConfig row, not this role-based default.
  Accounts: modules("dashboard", "invoices", "reports", "documents", "notifications", "approvals", "prRequest"),
  "Management Viewer": modules("dashboard", "projects", "reports", "notifications"),
  "Read Only": modules("dashboard", "projects", "notifications"),
  // PR Request User — a deliberately narrow role: no Projects/Dashboard/etc
  // access at all, only the ability to submit and track their own PR
  // Requests via the Approvals module (see prRequests.service.ts's
  // requireModuleAccess("Approvals") gate).
  "PR Request User": modules("approvals", "prRequest"),
};

// Edit/Delete Invoice (Oct 2026) — pre-ticked for exactly the roles whose
// default modules include Invoices, mirroring the backend migration that
// preserved existing edit/delete access. Only a starting point for a NEW
// user; the Administrator can untick them before saving.
export const ROLE_APPROVAL_DEFAULTS: Record<SystemRole, UserApprovalRights> = {
  Administrator: ALL_APPROVALS,
  "PMO Manager": approvals("archiveProjects", "editInvoice", "deleteInvoice"),
  "Project Manager": approvals("editInvoice", "deleteInvoice"),
  "Project Coordinator": NO_APPROVALS,
  "Department Head": approvals("archiveProjects"),
  Engineer: NO_APPROVALS,
  Finance: approvals("editInvoice", "deleteInvoice"),
  Accounts: approvals("editInvoice", "deleteInvoice"),
  "Management Viewer": NO_APPROVALS,
  "Read Only": NO_APPROVALS,
  "PR Request User": NO_APPROVALS,
};

/** Sensible default region scope for a brand-new user of this role — broad for senior roles, empty for the rest (an Administrator assigns regions explicitly). */
// Global Multi-Country Phase 1: NO role pre-selects any country. Country access is assigned explicitly by an Administrator and
// is never derived from a role name (so no role gets India, and no role gets every country, by default). The previous
// templates (Administrator, PMO Manager and Management Viewer: all regions; most other roles: India) are intentionally gone.
export const ROLE_REGION_DEFAULTS: Record<SystemRole, UserProjectRegionAccess> = {
  Administrator: NO_REGIONS,
  "PMO Manager": NO_REGIONS,
  "Project Manager": NO_REGIONS,
  "Project Coordinator": NO_REGIONS,
  "Department Head": NO_REGIONS,
  Engineer: NO_REGIONS,
  Finance: NO_REGIONS,
  Accounts: NO_REGIONS,
  "Management Viewer": NO_REGIONS,
  "Read Only": NO_REGIONS,
  // No Projects module access at all — region scoping is meaningless here.
  "PR Request User": NO_REGIONS,
};
