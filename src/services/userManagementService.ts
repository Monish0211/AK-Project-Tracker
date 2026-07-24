import type { User, AccountStatus } from "../types/UserModel";

const USER_STORAGE_KEY = "pmo_users_v1";

const INITIAL_MOCK_USERS: User[] = [
  {
    id: "usr-10001",
    employeeId: "EMP-10001",
    employeeName: "Rajesh Sharma",
    email: "rajesh.sharma@ifluids.com",
    phone: "+91 98401 12345",
    department: "PMO & Engineering",
    designation: "Engineering Project Manager",
    reportingManager: "Self (Head of PMO)",
    role: "Manager",
    status: "Active",
    avatarUrl: "",
    lastLoginAt: "2026-07-24T09:15:00.000Z",
    createdAt: "2024-01-15T08:00:00.000Z",
    forcePasswordChange: false,
    moduleAccess: {
      dashboard: true,
      projects: true,
      customerMaster: true,
      invoices: true,
      timesheets: true,
      reports: true,
      manpower: true,
      documents: true,
      settings: true,
      reminders: true,
    },
    assignedProjects: {
      qatar: true,
      malaysia: true,
      india: true,
      oman: true,
      abuDhabi: true,
    },
    approvalRights: {
      approveTimesheets: true,
      approveExpenses: true,
      approveReminders: true,
      archiveProjects: true,
    },
  },
  {
    id: "usr-10002",
    employeeId: "EMP-10002",
    employeeName: "Ananya Roy",
    email: "ananya.roy@ifluids.com",
    phone: "+91 98402 23456",
    department: "Automation & Controls",
    designation: "Senior Automation Engineer",
    reportingManager: "Rajesh Sharma",
    role: "Employee",
    status: "Active",
    avatarUrl: "",
    lastLoginAt: "2026-07-24T08:30:00.000Z",
    createdAt: "2024-03-10T10:00:00.000Z",
    forcePasswordChange: false,
    moduleAccess: {
      dashboard: true,
      projects: true,
      customerMaster: false,
      invoices: false,
      timesheets: true,
      reports: false,
      manpower: true,
      documents: true,
      settings: false,
      reminders: true,
    },
    assignedProjects: {
      qatar: true,
      malaysia: true,
      india: false,
      oman: true,
      abuDhabi: false,
    },
    approvalRights: {
      approveTimesheets: false,
      approveExpenses: false,
      approveReminders: false,
      archiveProjects: false,
    },
  },
  {
    id: "usr-10003",
    employeeId: "EMP-10003",
    employeeName: "Vikram Patel",
    email: "vikram.patel@ifluids.com",
    phone: "+91 98403 34567",
    department: "Electrical Engineering",
    designation: "Lead Controls Engineer",
    reportingManager: "Rajesh Sharma",
    role: "Employee",
    status: "Active",
    avatarUrl: "",
    lastLoginAt: "2026-07-23T17:45:00.000Z",
    createdAt: "2024-04-01T09:30:00.000Z",
    forcePasswordChange: false,
    moduleAccess: {
      dashboard: true,
      projects: true,
      customerMaster: false,
      invoices: true,
      timesheets: true,
      reports: false,
      manpower: true,
      documents: false,
      settings: false,
      reminders: true,
    },
    assignedProjects: {
      qatar: true,
      malaysia: false,
      india: true,
      oman: false,
      abuDhabi: true,
    },
    approvalRights: {
      approveTimesheets: false,
      approveExpenses: false,
      approveReminders: false,
      archiveProjects: false,
    },
  },
  {
    id: "usr-10004",
    employeeId: "EMP-10004",
    employeeName: "Priya Nair",
    email: "priya.nair@ifluids.com",
    phone: "+91 98404 45678",
    department: "PMO & Engineering",
    designation: "PMO Coordinator",
    reportingManager: "Rajesh Sharma",
    role: "Employee",
    status: "Active",
    avatarUrl: "",
    lastLoginAt: "2026-07-24T09:00:00.000Z",
    createdAt: "2024-05-12T11:15:00.000Z",
    forcePasswordChange: false,
    moduleAccess: {
      dashboard: true,
      projects: true,
      customerMaster: true,
      invoices: true,
      timesheets: true,
      reports: true,
      manpower: true,
      documents: true,
      settings: false,
      reminders: true,
    },
    assignedProjects: {
      qatar: true,
      malaysia: true,
      india: true,
      oman: true,
      abuDhabi: true,
    },
    approvalRights: {
      approveTimesheets: false,
      approveExpenses: false,
      approveReminders: false,
      archiveProjects: false,
    },
  },
  {
    id: "usr-10005",
    employeeId: "EMP-10005",
    employeeName: "Rahul Verma",
    email: "rahul.verma@ifluids.com",
    phone: "+91 98405 56789",
    department: "Mechanical Engineering",
    designation: "Mechanical Design Engineer",
    reportingManager: "Rajesh Sharma",
    role: "Employee",
    status: "Inactive",
    avatarUrl: "",
    lastLoginAt: "2026-06-15T14:10:00.000Z",
    createdAt: "2024-02-20T14:00:00.000Z",
    forcePasswordChange: true,
    moduleAccess: {
      dashboard: true,
      projects: true,
      customerMaster: false,
      invoices: false,
      timesheets: false,
      reports: false,
      manpower: false,
      documents: true,
      settings: false,
      reminders: false,
    },
    assignedProjects: {
      qatar: false,
      malaysia: false,
      india: true,
      oman: false,
      abuDhabi: true,
    },
    approvalRights: {
      approveTimesheets: false,
      approveExpenses: false,
      approveReminders: false,
      archiveProjects: false,
    },
  },
];

export const getUsers = (): User[] => {
  const data = localStorage.getItem(USER_STORAGE_KEY);
  if (!data) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(INITIAL_MOCK_USERS));
    return INITIAL_MOCK_USERS;
  }
  try {
    return JSON.parse(data);
  } catch {
    return INITIAL_MOCK_USERS;
  }
};

export const getUserById = (id: string): User | undefined => {
  const users = getUsers();
  return users.find((u) => u.id === id);
};

export const saveUser = (userData: Partial<User>): User => {
  const users = getUsers();
  let updatedUser: User;

  if (userData.id) {
    const index = users.findIndex((u) => u.id === userData.id);
    if (index !== -1) {
      updatedUser = {
        ...users[index],
        ...userData,
      } as User;
      users[index] = updatedUser;
    } else {
      updatedUser = userData as User;
      users.push(updatedUser);
    }
  } else {
    const newId = `usr-${Date.now()}`;
    const newEmpId = userData.employeeId || `EMP-${Math.floor(10000 + Math.random() * 90000)}`;
    updatedUser = {
      id: newId,
      employeeId: newEmpId,
      employeeName: userData.employeeName || "New Employee",
      email: userData.email || "",
      phone: userData.phone || "",
      department: userData.department || "PMO & Engineering",
      designation: userData.designation || "Engineer",
      reportingManager: userData.reportingManager || "Rajesh Sharma",
      role: userData.role || "Employee",
      status: userData.status || "Active",
      avatarUrl: userData.avatarUrl || "",
      createdAt: new Date().toISOString(),
      lastLoginAt: "Never",
      forcePasswordChange: userData.forcePasswordChange ?? true,
      moduleAccess: userData.moduleAccess || {
        dashboard: true,
        projects: true,
        customerMaster: false,
        invoices: false,
        timesheets: true,
        reports: false,
        manpower: true,
        documents: true,
        settings: false,
        reminders: true,
      },
      assignedProjects: userData.assignedProjects || {
        qatar: true,
        malaysia: false,
        india: true,
        oman: false,
        abuDhabi: false,
      },
      approvalRights: userData.approvalRights || {
        approveTimesheets: false,
        approveExpenses: false,
        approveReminders: false,
        archiveProjects: false,
      },
    };
    users.unshift(updatedUser);
  }

  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(users));
  window.dispatchEvent(new Event("pmo:data-changed"));
  return updatedUser;
};

export const updateUserStatus = (id: string, newStatus: AccountStatus): void => {
  const users = getUsers();
  const user = users.find((u) => u.id === id);
  if (user) {
    user.status = newStatus;
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(users));
    window.dispatchEvent(new Event("pmo:data-changed"));
  }
};

export const resetUserPassword = (id: string): void => {
  const users = getUsers();
  const user = users.find((u) => u.id === id);
  if (user) {
    user.forcePasswordChange = true;
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(users));
    window.dispatchEvent(new Event("pmo:data-changed"));
  }
};
