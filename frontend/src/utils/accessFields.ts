import type { UserModuleAccess, UserProjectRegionAccess, UserApprovalRights } from "../types/UserModel";

/**
 * The single canonical mapping between this app's boolean-flag access
 * objects (UserModuleAccess/UserProjectRegionAccess/UserApprovalRights) and
 * the backend's Module/Region/ApprovalType row names. Every label here is
 * an exact match for a seeded database name (see Backend/prisma/seed.ts) —
 * both directions of the Create User form (labels -> ids, in UserDrawer.tsx)
 * and User Listing (names -> booleans, in userManagementService.ts) read
 * from these same three arrays, so the two can never drift apart.
 */

export const MODULE_FIELDS: { key: keyof UserModuleAccess; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "projects", label: "Projects" },
  { key: "customerMaster", label: "Customer Master" },
  { key: "timesheets", label: "Timesheets" },
  { key: "invoices", label: "Invoices" },
  { key: "reports", label: "Reports" },
  { key: "manpower", label: "Manpower" },
  { key: "documents", label: "Documents" },
  { key: "settings", label: "Settings" },
  { key: "notifications", label: "Notifications" },
  { key: "reminders", label: "Reminders" },
];

export const REGION_FIELDS: { key: keyof UserProjectRegionAccess; label: string }[] = [
  { key: "india", label: "India" },
  { key: "qatar", label: "Qatar" },
  { key: "malaysia", label: "Malaysia" },
  { key: "oman", label: "Oman" },
  { key: "abuDhabi", label: "Abu Dhabi" },
  { key: "fzi", label: "FZI" },
  { key: "elixirQatar", label: "Elixir Qatar" },
];

export const APPROVAL_FIELDS: { key: keyof UserApprovalRights; label: string }[] = [
  { key: "approveTimesheets", label: "Approve Timesheets" },
  { key: "approveExpenses", label: "Approve Expenses" },
  { key: "approveInvoices", label: "Approve Invoices" },
  { key: "approveCustomers", label: "Approve Customers" },
  { key: "approveBudgetChanges", label: "Approve Budget Changes" },
  { key: "approveProjectCreation", label: "Approve Project Creation" },
  { key: "approveReminders", label: "Approve Reminders" },
  { key: "archiveProjects", label: "Archive Projects" },
];

/** Names present (from the backend) -> the boolean-flag object the UI renders. */
export function buildModuleAccess(moduleNames: string[]): UserModuleAccess {
  const result = {} as UserModuleAccess;
  for (const { key, label } of MODULE_FIELDS) {
    result[key] = moduleNames.includes(label);
  }
  return result;
}

export function buildRegionAccess(regionNames: string[]): UserProjectRegionAccess {
  const result = {} as UserProjectRegionAccess;
  for (const { key, label } of REGION_FIELDS) {
    result[key] = regionNames.includes(label);
  }
  return result;
}

export function buildApprovalRights(approvalNames: string[]): UserApprovalRights {
  const result = {} as UserApprovalRights;
  for (const { key, label } of APPROVAL_FIELDS) {
    result[key] = approvalNames.includes(label);
  }
  return result;
}
