import type { User, AccountStatus } from "../types/UserModel";
import { MOCK_USERS } from "../data/mockUsers";
import { InMemoryUserRepository } from "./userRepository";
import { UserStore } from "./userStore";
import { generateCompanyEmail, generateEmployeeId, generateTemporaryPassword } from "../utils/userProvisioning";

/**
 * User Management — frontend-only mock module.
 *
 * Deliberately NOT backed by SQL, a real API, or localStorage: this facade
 * sits on top of an in-memory UserStore (see userStore.ts) seeded once from
 * mockUsers.ts, so all data resets to the seed set on every page reload.
 * That's intentional per this module's spec, not a bug — User Management is
 * a frontend-only preview of the eventual PostgreSQL + API-backed feature.
 *
 * Every function below is written as the exact seam a future backend swap
 * would replace: getUsers()/getUserById() become GET requests, createUser/
 * updateUser/deleteUser become POST/PUT/DELETE, and resetUserPassword /
 * setUserStatus become their own dedicated endpoints. No caller anywhere in
 * the UI needs to change shape when that happens — only these function
 * bodies do.
 */

const repository = new InMemoryUserRepository(MOCK_USERS);
const store = new UserStore(repository);

export const getUsers = (): User[] => store.getAll();

export const getUserById = (id: string): User | undefined => store.getById(id);

/** Every field the Add User drawer collects, minus what the system generates itself (id, employeeId, email, temporaryPassword, audit fields). */
export type NewUserInput = Omit<
  User,
  "id" | "employeeId" | "email" | "temporaryPassword" | "isFirstLogin" | "lastLoginAt" | "createdAt" | "createdBy" | "lastModifiedAt"
>;

/**
 * Creates a new user, auto-generating Employee ID + Company Email +
 * Temporary Password exactly per the future auth workflow this module
 * prepares for (see module doc). Returns the created User so the caller can
 * display the generated email/temp password immediately.
 */
export const createUser = (input: NewUserInput): User => {
  const existing = store.getAll();
  const now = new Date().toISOString();

  const newUser: User = {
    ...input,
    id: `usr-${Date.now()}`,
    employeeId: generateEmployeeId(existing),
    email: generateCompanyEmail(input.employeeName, existing),
    temporaryPassword: generateTemporaryPassword(),
    isFirstLogin: true,
    lastLoginAt: null,
    createdAt: now,
    createdBy: "Administrator",
  };

  store.create(newUser);
  return newUser;
};

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
