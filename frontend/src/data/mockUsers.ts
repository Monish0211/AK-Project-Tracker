import type { User, SystemRole, EmployeeType, AccountStatus, UserAccountSecurity } from "../types/UserModel";
import { ROLE_MODULE_DEFAULTS, ROLE_APPROVAL_DEFAULTS, ROLE_REGION_DEFAULTS, regions } from "../utils/roleDefaults";

/**
 * Single source of truth for User Management's mock dataset — ~20
 * realistic iFluids Engineering accounts covering every System Role. This
 * file is read once (by InMemoryUserRepository, see userRepository.ts) and
 * never written back to; all runtime add/edit/delete/status changes live
 * only in that in-memory copy for the current browser tab, never here and
 * never in localStorage. Replacing this file's contents (or the repository
 * that reads it) with a real API response is the entire migration path to
 * a live backend — nothing above the repository layer needs to change.
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
  regionOverride?: ReturnType<typeof regions>;
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

const SEED_USERS: SeedUser[] = [
  {
    employeeId: "EMP-10001", employeeName: "Rajesh Sharma", email: "rajesh.sharma@ifluids.com",
    phone: "+91 98401 12345", department: "PMO & Engineering", designation: "Head of PMO",
    reportingManager: "Board of Directors", employeeType: "Permanent", role: "Administrator", status: "Active",
    isFirstLogin: false, lastLoginAt: "2026-08-03T09:15:00.000Z", createdAt: "2023-01-15T08:00:00.000Z",
  },
  {
    employeeId: "EMP-10002", employeeName: "Meera Iyer", email: "meera.iyer@ifluids.com",
    phone: "+91 98402 23456", department: "IT & Systems", designation: "IT Systems Administrator",
    reportingManager: "Rajesh Sharma", employeeType: "Permanent", role: "Administrator", status: "Active",
    isFirstLogin: false, lastLoginAt: "2026-08-04T08:05:00.000Z", createdAt: "2023-02-10T08:00:00.000Z",
  },
  {
    employeeId: "EMP-10003", employeeName: "Ananya Roy", email: "ananya.roy@ifluids.com",
    phone: "+91 98403 34567", department: "PMO & Engineering", designation: "Senior PMO Manager",
    reportingManager: "Rajesh Sharma", employeeType: "Permanent", role: "PMO Manager", status: "Active",
    isFirstLogin: false, lastLoginAt: "2026-08-03T18:30:00.000Z", createdAt: "2023-03-10T10:00:00.000Z",
  },
  {
    employeeId: "EMP-10004", employeeName: "Karthik Subramaniam", email: "karthik.subramaniam@ifluids.com",
    phone: "+91 98404 45678", department: "PMO & Engineering", designation: "PMO Manager",
    reportingManager: "Rajesh Sharma", employeeType: "Permanent", role: "PMO Manager", status: "Active",
    regionOverride: regions("india", "qatar", "malaysia"),
    isFirstLogin: false, lastLoginAt: "2026-08-02T12:20:00.000Z", createdAt: "2023-06-01T10:00:00.000Z",
  },
  {
    employeeId: "EMP-10005", employeeName: "Vikram Patel", email: "vikram.patel@ifluids.com",
    phone: "+91 98405 56789", department: "Electrical Engineering", designation: "Engineering Project Manager",
    reportingManager: "Ananya Roy", employeeType: "Permanent", role: "Project Manager", status: "Active",
    regionOverride: regions("india", "qatar"),
    isFirstLogin: false, lastLoginAt: "2026-08-04T07:45:00.000Z", createdAt: "2024-04-01T09:30:00.000Z",
  },
  {
    employeeId: "EMP-10006", employeeName: "Sneha Reddy", email: "sneha.reddy@ifluids.com",
    phone: "+91 98406 67890", department: "Mechanical Engineering", designation: "Project Manager",
    reportingManager: "Ananya Roy", employeeType: "Permanent", role: "Project Manager", status: "Active",
    regionOverride: regions("india", "oman"),
    isFirstLogin: false, lastLoginAt: "2026-08-01T16:10:00.000Z", createdAt: "2024-05-15T09:30:00.000Z",
  },
  {
    employeeId: "EMP-10007", employeeName: "Arjun Mehta", email: "arjun.mehta@ifluids.com",
    phone: "+91 98407 78901", department: "Automation & Controls", designation: "Project Manager",
    reportingManager: "Ananya Roy", employeeType: "Permanent", role: "Project Manager", status: "Inactive",
    regionOverride: regions("india"),
    isFirstLogin: false, lastLoginAt: "2026-05-20T11:00:00.000Z", createdAt: "2024-02-20T09:30:00.000Z",
  },
  {
    employeeId: "EMP-10008", employeeName: "Priya Nair", email: "priya.nair@ifluids.com",
    phone: "+91 98408 89012", department: "PMO & Engineering", designation: "PMO Coordinator",
    reportingManager: "Ananya Roy", employeeType: "Permanent", role: "Project Coordinator", status: "Active",
    regionOverride: regions("india", "qatar", "malaysia"),
    isFirstLogin: false, lastLoginAt: "2026-08-04T09:00:00.000Z", createdAt: "2024-05-12T11:15:00.000Z",
  },
  {
    employeeId: "EMP-10009", employeeName: "Divya Krishnan", email: "divya.krishnan@ifluids.com",
    phone: "+91 98409 90123", department: "PMO & Engineering", designation: "Project Coordinator",
    reportingManager: "Ananya Roy", employeeType: "Contract", role: "Project Coordinator", status: "Active",
    regionOverride: regions("india"),
    isFirstLogin: false, lastLoginAt: "2026-08-02T10:30:00.000Z", createdAt: "2025-01-10T11:15:00.000Z",
  },
  {
    employeeId: "EMP-10010", employeeName: "Suresh Kumar", email: "suresh.kumar@ifluids.com",
    phone: "+91 98410 01234", department: "Electrical Engineering", designation: "Head of Electrical Engineering",
    reportingManager: "Rajesh Sharma", employeeType: "Permanent", role: "Department Head", status: "Active",
    regionOverride: regions("india", "abuDhabi"),
    isFirstLogin: false, lastLoginAt: "2026-08-03T14:20:00.000Z", createdAt: "2023-08-01T09:00:00.000Z",
  },
  {
    employeeId: "EMP-10011", employeeName: "Lakshmi Menon", email: "lakshmi.menon@ifluids.com",
    phone: "+91 98411 12340", department: "Instrument Engineering", designation: "Head of Instrumentation",
    reportingManager: "Rajesh Sharma", employeeType: "Permanent", role: "Department Head", status: "Active",
    regionOverride: regions("india"),
    isFirstLogin: false, lastLoginAt: "2026-07-31T15:40:00.000Z", createdAt: "2023-09-05T09:00:00.000Z",
  },
  {
    employeeId: "EMP-10012", employeeName: "Rahul Verma", email: "rahul.verma@ifluids.com",
    phone: "+91 98412 23451", department: "Mechanical Engineering", designation: "Mechanical Design Engineer",
    reportingManager: "Sneha Reddy", employeeType: "Permanent", role: "Engineer", status: "Inactive",
    regionOverride: regions("india"),
    isFirstLogin: false, lastLoginAt: "2026-06-15T14:10:00.000Z", createdAt: "2024-02-20T14:00:00.000Z",
    security: { accountLocked: true },
  },
  {
    employeeId: "EMP-10013", employeeName: "Anitha Raman", email: "anitha.raman@ifluids.com",
    phone: "+91 98413 34562", department: "Civil & Structural", designation: "Civil Engineer",
    reportingManager: "Vikram Patel", employeeType: "Permanent", role: "Engineer", status: "Active",
    regionOverride: regions("india"),
    isFirstLogin: true, lastLoginAt: null, createdAt: "2026-07-20T09:00:00.000Z",
  },
  {
    employeeId: "EMP-10014", employeeName: "Kiran Desai", email: "kiran.desai@ifluids.com",
    phone: "+91 98414 45673", department: "Automation & Controls", designation: "Automation Engineer",
    reportingManager: "Arjun Mehta", employeeType: "Contract", role: "Engineer", status: "Active",
    regionOverride: regions("qatar"),
    isFirstLogin: true, lastLoginAt: null, createdAt: "2026-07-25T09:00:00.000Z",
  },
  {
    employeeId: "EMP-10015", employeeName: "Ramesh Gupta", email: "ramesh.gupta@ifluids.com",
    phone: "+91 98415 56784", department: "Finance & Operations", designation: "Finance Manager",
    reportingManager: "Rajesh Sharma", employeeType: "Permanent", role: "Finance", status: "Active",
    regionOverride: regions("india", "qatar", "malaysia", "oman"),
    isFirstLogin: false, lastLoginAt: "2026-08-04T09:30:00.000Z", createdAt: "2023-11-01T09:00:00.000Z",
  },
  {
    employeeId: "EMP-10016", employeeName: "Pooja Agarwal", email: "pooja.agarwal@ifluids.com",
    phone: "+91 98416 67895", department: "Finance & Operations", designation: "Senior Finance Executive",
    reportingManager: "Ramesh Gupta", employeeType: "Permanent", role: "Finance", status: "Active",
    regionOverride: regions("india"),
    isFirstLogin: false, lastLoginAt: "2026-08-03T13:15:00.000Z", createdAt: "2024-06-10T09:00:00.000Z",
  },
  {
    employeeId: "EMP-10017", employeeName: "Suresh Babu", email: "suresh.babu@ifluids.com",
    phone: "+91 98417 78906", department: "Finance & Operations", designation: "Accounts Manager",
    reportingManager: "Ramesh Gupta", employeeType: "Permanent", role: "Accounts", status: "Active",
    regionOverride: regions("india"),
    isFirstLogin: false, lastLoginAt: "2026-08-02T11:00:00.000Z", createdAt: "2023-12-05T09:00:00.000Z",
  },
  {
    employeeId: "EMP-10018", employeeName: "Kavya Nair", email: "kavya.nair@ifluids.com",
    phone: "+91 98418 89017", department: "Finance & Operations", designation: "Accounts Executive",
    reportingManager: "Suresh Babu", employeeType: "Consultant", role: "Accounts", status: "Active",
    regionOverride: regions("india"),
    isFirstLogin: true, lastLoginAt: null, createdAt: "2026-07-28T09:00:00.000Z",
  },
  {
    employeeId: "EMP-10019", employeeName: "Deepak Chawla", email: "deepak.chawla@ifluids.com",
    phone: "+91 98419 90128", department: "PMO & Engineering", designation: "Regional Director",
    reportingManager: "Board of Directors", employeeType: "Permanent", role: "Management Viewer", status: "Active",
    isFirstLogin: false, lastLoginAt: "2026-07-30T17:00:00.000Z", createdAt: "2023-04-18T09:00:00.000Z",
  },
  {
    employeeId: "EMP-10020", employeeName: "Sanjay Mishra", email: "sanjay.mishra@ifluids.com",
    phone: "+91 98420 01239", department: "PMO & Engineering", designation: "PMO Intern",
    reportingManager: "Priya Nair", employeeType: "Intern", role: "Read Only", status: "Active",
    isFirstLogin: true, lastLoginAt: null, createdAt: "2026-07-29T09:00:00.000Z",
  },
];

export const MOCK_USERS: User[] = SEED_USERS.map(buildUser);
