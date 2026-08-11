import type { User, SystemRole, EmployeeType, AccountStatus, UserAccountSecurity, UserProjectRegionAccess } from "../types/UserModel";
import { ROLE_MODULE_DEFAULTS, ROLE_APPROVAL_DEFAULTS, ROLE_REGION_DEFAULTS } from "../utils/roleDefaults";

/**
 * Seed dataset for User Management's local list cache (see
 * userRepository.ts / userStore.ts) — intentionally empty now that Add User
 * creates real PortalUser rows via POST /users (see userManagementService.ts
 * and UserDrawer.tsx). SeedUser/buildUser are kept so sample rows can be
 * reintroduced easily for local testing, but none ship by default anymore.
 */

interface SeedUser {
  employeeId: string;
  employeeName: string;
  email: string;
  phone: string;
  department: string;
  designation: string;
  reportingManager: string;
  employeeType: EmployeeType;
  role: SystemRole;
  status: AccountStatus;
  regionOverride?: UserProjectRegionAccess;
  isFirstLogin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  security?: Partial<UserAccountSecurity>;
}

const DEFAULT_SECURITY = (isFirstLogin: boolean): UserAccountSecurity => ({
  forcePasswordChangeOnFirstLogin: true,
  accountLocked: false,
  twoFactorEnabled: false,
  passwordExpiryDays: null,
  lastPasswordResetAt: isFirstLogin ? null : "2026-01-05T09:00:00.000Z",
});

function buildUser(seed: SeedUser): User {
  return {
    id: `usr-${seed.employeeId.toLowerCase()}`,
    employeeId: seed.employeeId,
    employeeName: seed.employeeName,
    email: seed.email,
    phone: seed.phone,
    department: seed.department,
    designation: seed.designation,
    reportingManager: seed.reportingManager,
    employeeType: seed.employeeType,
    role: seed.role,
    status: seed.status,
    avatarUrl: "",
    temporaryPassword: seed.isFirstLogin ? "Welcome@123" : undefined,
    isFirstLogin: seed.isFirstLogin,
    lastLoginAt: seed.lastLoginAt,
    moduleAccess: ROLE_MODULE_DEFAULTS[seed.role],
    projectRegionAccess: seed.regionOverride ?? ROLE_REGION_DEFAULTS[seed.role],
    approvalRights: ROLE_APPROVAL_DEFAULTS[seed.role],
    accountSecurity: { ...DEFAULT_SECURITY(seed.isFirstLogin), ...seed.security },
    createdAt: seed.createdAt,
    createdBy: "Administrator",
  };
}

// User Management now runs against the real backend (Settings > User
// Management > Add User posts to POST /users) — the ~20 dummy iFluids
// accounts that used to seed this table have been removed so the table
// starts empty and only ever shows users actually created through that
// real flow, rather than mixing them with placeholder demo rows.
const SEED_USERS: SeedUser[] = [];

export const MOCK_USERS: User[] = SEED_USERS.map(buildUser);
