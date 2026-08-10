import type { User, AccountStatus } from "../types/UserModel";
import { MOCK_USERS } from "../data/mockUsers";
import { InMemoryUserRepository } from "./userRepository";
import { UserStore } from "./userStore";
import { generateTemporaryPassword } from "../utils/userProvisioning";
import { apiClient } from "./apiClient";

/**
 * User Management — Create User is real (POST /users against the backend);
 * everything else below (listing/edit/delete/status/reset) is still the
 * frontend-only in-memory mock this module started as, until those get
 * their own backend phases. Deliberately NOT backed by SQL, a real API, or
 * localStorage for those: this facade sits on top of an in-memory UserStore
 * (see userStore.ts) seeded once from mockUsers.ts, so mock data resets to
 * the seed set on every page reload.
 *
 * Every mock function below is written as the exact seam a future backend
 * swap would replace: getUsers()/getUserById() become GET requests,
 * updateUser/deleteUser become PUT/DELETE, and resetUserPassword/
 * setUserStatus become their own dedicated endpoints. No caller anywhere in
 * the UI needs to change shape when that happens — only these function
 * bodies do.
 */

const repository = new InMemoryUserRepository(MOCK_USERS);
const store = new UserStore(repository);

export const getUsers = (): User[] => store.getAll();

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

/**
 * Inserts an already backend-created user into the local in-memory list so
 * it appears immediately — there is no GET /users listing endpoint yet
 * (Phase 1 is Create User only), so this is what "refresh users" means
 * today. Takes a fully-formed display User (mapped from the real backend
 * response by the caller), not raw input — no fake data is generated here.
 */
export const addUserToLocalList = (user: User): void => store.create(user);

export const updateUser = (id: string, patch: Partial<User>): User | undefined => store.update(id, patch);

export const deleteUser = (id: string): void => store.remove(id);

export const setUserStatus = (id: string, status: AccountStatus): void => store.setStatus(id, status);

/** Generates and stores a new temporary password, returning it so the caller can display it once. */
export const resetUserPassword = (id: string): string | undefined => {
  const user = store.getById(id);
  if (!user) return undefined;

  const temporaryPassword = generateTemporaryPassword();
  store.update(id, {
    temporaryPassword,
    isFirstLogin: true,
    accountSecurity: {
      ...user.accountSecurity,
      lastPasswordResetAt: new Date().toISOString(),
    },
  });

  return temporaryPassword;
};
