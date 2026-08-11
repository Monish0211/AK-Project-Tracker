import type { User, AccountStatus, EmployeeType, SystemRole } from "../types/UserModel";
import { MOCK_USERS } from "../data/mockUsers";
import { InMemoryUserRepository } from "./userRepository";
import { UserStore } from "./userStore";
import { DEFAULT_TEMP_PASSWORD } from "../utils/userProvisioning";
import { buildModuleAccess, buildRegionAccess, buildApprovalRights } from "../utils/accessFields";
import { apiClient } from "./apiClient";

/**
 * User Management — Create User, User Listing, Delete User, Edit User, and
 * Admin Reset Password are all real (against the backend). Toggle Status
 * is NOT yet backed by a real endpoint — it still calls the frontend-only
 * in-memory mock below, which has no live connection to what getUsers() now
 * shows: the directory always reflects real database truth, so a
 * toggle-status click will not persist and will not survive the next
 * refresh. That's a known gap, not something this change introduces — it
 * needs its own backend work, following the same pattern Edit User just
 * established here.
 */

const repository = new InMemoryUserRepository(MOCK_USERS);
const store = new UserStore(repository);

export const getUserById = (id: string): User | undefined => store.getById(id);

export interface UserLookupItem {
  id: string;
  name: string;
}

/** Real database ids for every role/module/region/approval type — the Add User form needs these to submit valid foreign keys. */
export interface UserLookups {
  roles: UserLookupItem[];
  modules: UserLookupItem[];
  regions: UserLookupItem[];
  approvalTypes: UserLookupItem[];
}

export const getUserLookups = (): Promise<UserLookups> => apiClient.get<UserLookups>("/users/lookups");

export interface CreateUserPayload {
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  department?: string | null;
  designation?: string | null;
  reportingManagerId?: string | null;
  employeeType?: string | null;
  isActive?: boolean;
  temporaryPassword: string;
  forcePasswordChange?: boolean;
  roleId: string;
  moduleIds: string[];
  regionIds: string[];
  approvalIds: string[];
}

export interface CreatedPortalUser {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  department: string | null;
  designation: string | null;
  employeeType: string | null;
  reportingManagerId: string | null;
  role: { id: string; name: string };
  isActive: boolean;
  forcePasswordChange: boolean;
  createdAt: string;
}

/** Creates a new portal login via the real backend (POST /users). */
export const createUser = (payload: CreateUserPayload): Promise<CreatedPortalUser> =>
  apiClient.post<CreatedPortalUser>("/users", payload);

/** Raw shape of each row GET /users returns — see Backend's UserListItemDto. */
interface BackendUserListItem {
  id: string;
  employeeCode: string | null;
  fullName: string;
  email: string;
  phoneNumber: string | null;
  department: string | null;
  designation: string | null;
  employeeType: string | null;
  reportingManagerId: string | null;
  reportingManagerName: string | null;
  role: { id: string; name: string };
  isActive: boolean;
  forcePasswordChange: boolean;
  accountLocked: boolean;
  lastLogin: string | null;
  passwordResetAt: string | null;
  createdAt: string;
  updatedAt: string;
  modules: string[];
  regions: string[];
  approvals: string[];
}

/**
 * Maps one backend row into this app's display User shape — the same
 * boolean-flag access objects (moduleAccess/projectRegionAccess/
 * approvalRights) the table, filters, and drawers already expect, built
 * from the backend's name arrays via the shared accessFields helpers so
 * Create User and Listing can never label things differently.
 */
function toLocalUser(u: BackendUserListItem): User {
  return {
    id: u.id,
    employeeId: u.employeeCode ?? "",
    employeeName: u.fullName,
    email: u.email,
    phone: u.phoneNumber ?? undefined,
    department: u.department ?? "",
    designation: u.designation ?? "",
    reportingManager: u.reportingManagerName ?? undefined,
    employeeType: (u.employeeType as EmployeeType | null) ?? "Permanent",
    role: u.role.name as SystemRole,
    status: u.isActive ? "Active" : "Inactive",
    avatarUrl: undefined,
    temporaryPassword: undefined,
    isFirstLogin: u.forcePasswordChange,
    lastLoginAt: u.lastLogin,
    moduleAccess: buildModuleAccess(u.modules),
    projectRegionAccess: buildRegionAccess(u.regions),
    approvalRights: buildApprovalRights(u.approvals),
    accountSecurity: {
      forcePasswordChangeOnFirstLogin: u.forcePasswordChange,
      accountLocked: u.accountLocked,
      twoFactorEnabled: false,
      passwordExpiryDays: null,
      lastPasswordResetAt: u.passwordResetAt,
    },
    createdAt: u.createdAt,
    createdBy: "—",
    lastModifiedAt: u.updatedAt,
  };
}

/** The User Directory — every PortalUser in Postgres, mapped to this app's display shape. */
export const getUsers = async (): Promise<User[]> => {
  const rows = await apiClient.get<BackendUserListItem[]>("/users");
  return rows.map(toLocalUser);
};

export interface UpdateUserPayload {
  fullName?: string;
  email?: string;
  phoneNumber?: string | null;
  department?: string | null;
  designation?: string | null;
  employeeType?: string | null;
  isActive?: boolean;
  roleId?: string;
  moduleIds?: string[];
  regionIds?: string[];
  approvalIds?: string[];
  forcePasswordChange?: boolean;
  accountLocked?: boolean;
}

/** Updates a portal user via the real backend (PATCH /users/:id) and returns the same directory row shape getUsers() does. */
export const updateUser = async (id: string, payload: UpdateUserPayload): Promise<User> => {
  const row = await apiClient.patch<BackendUserListItem>(`/users/${id}`, payload);
  return toLocalUser(row);
};

/** Permanently deletes a portal login via the real backend (DELETE /users/:id). */
export const deleteUser = (id: string): Promise<void> => apiClient.delete(`/users/${id}`);

export const setUserStatus = (id: string, status: AccountStatus): void => store.setStatus(id, status);

/**
 * Resets a user's password via the real backend (POST /users/:id/reset-password)
 * — the account is set back to the shared DEFAULT_TEMP_PASSWORD and forced
 * to change it on next login. Returns the temp password so the caller can
 * display it once.
 */
export const resetUserPassword = async (id: string): Promise<string> => {
  await apiClient.post(`/users/${id}/reset-password`);
  return DEFAULT_TEMP_PASSWORD;
};
