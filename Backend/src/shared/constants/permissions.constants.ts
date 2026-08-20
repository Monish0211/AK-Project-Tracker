/**
 * Reference lists used ONLY by `prisma/seed.ts` to populate the PortalRole /
 * Module / Region / ApprovalType lookup tables on first setup. Application
 * code must never import these to make an access decision — that would
 * defeat the point of storing access in the database. Once seeded, the
 * database rows are the single source of truth; these arrays only exist so
 * "what are the eligible values on day one" lives somewhere reviewable.
 */

export const PORTAL_ROLES = [
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
] as const;

export const MODULES = [
  "Dashboard",
  "Projects",
  "Customer Master",
  "Timesheets",
  "Invoices",
  "Reports",
  "Manpower",
  "Documents",
  "Settings",
  "Notifications",
  "Reminders",
] as const;

export const REGIONS = [
  "India",
  "Qatar",
  "Malaysia",
  "Oman",
  "Abu Dhabi",
  "FZI",
  "Elixir Qatar",
] as const;

export const APPROVAL_TYPES = [
  "Approve Timesheets",
  "Approve Expenses",
  "Approve Invoices",
  "Approve Customers",
  "Approve Budget Changes",
  "Approve Project Creation",
  "Approve Reminders",
  "Archive Projects",
  "Delete Project Permanently",
] as const;

/**
 * The only departments allowed to hold a PortalUser login, per the business
 * rule that Engineers/Draftsmen/Consultants/Technical Staff never log in —
 * they exist only as (future) Employee records. Enforced in
 * `auth.service.ts` at login time, not as a DB constraint, since
 * `PortalUser.department` is a free-text display field, not an FK.
 */
export const PORTAL_ELIGIBLE_DEPARTMENTS = ["PMO", "IT", "Accounts"] as const;
