import type {
  AuditLogItem,
  FailedLoginRecord,
  SystemActivityItem,
  AuditKPIStats,
  AuditFilterOptions,
  AuditModule,
  AuditStatus,
} from "../types/AuditLog";

// Sample iFluids PMO Portal Users
const USERS = [
  { name: "Anand K.", email: "anand.k@ifluids.com", empId: "EMP-1001", dept: "PMO Management", role: "Administrator" },
  { name: "Priya Sharma", email: "priya.sharma@ifluids.com", empId: "EMP-1008", dept: "Accounts & Billing", role: "Finance Manager" },
  { name: "Rajesh Kumar", email: "rajesh.k@ifluids.com", empId: "EMP-1024", dept: "Process Engineering", role: "Lead Engineer" },
  { name: "Suresh V.", email: "suresh.v@ifluids.com", empId: "EMP-1045", dept: "Safety & Loss Prevention", role: "Sr. Consultant" },
  { name: "Karthik M.", email: "karthik.m@ifluids.com", empId: "EMP-1078", dept: "CAD & Drafting", role: "Draftsman Lead" },
  { name: "Sneha Patel", email: "sneha.p@ifluids.com", empId: "EMP-1102", dept: "Environmental Studies", role: "Process Engineer" },
  { name: "Vikram Singh", email: "vikram.s@ifluids.com", empId: "EMP-1115", dept: "Pipeline Integrity", role: "Safety Specialist" },
];

const MODULES: AuditModule[] = [
  "Dashboard",
  "Projects",
  "Customer Master",
  "Timesheets",
  "Invoices",
  "Reports",
  "Settings",
  "User Management",
  "Notifications",
];

const ACTIONS_BY_MODULE: Record<AuditModule, string[]> = {
  Dashboard: ["Viewed Executive Dashboard", "Exported Analytics Summary", "Filtered Project Health Metrics"],
  Projects: ["Project Created", "Project Updated", "Milestone Updated", "Quantity Progress Saved", "Project Archived"],
  "Customer Master": ["Customer Added", "Customer Contact Updated", "Customer Billing Profile Edited"],
  Timesheets: ["Timesheet Imported", "Timesheet Entry Approved", "Timesheet Dispute Flagged"],
  Invoices: ["Invoice Created", "Invoice Updated", "Invoice Status Marked Paid", "Commercial Adjustment Applied"],
  Reports: ["Report Generated", "Custom Report Scheduled", "PDF Report Exported"],
  Settings: ["Settings Updated", "Permission Changed", "Alert Rules Modified", "Backup Triggered"],
  "User Management": ["User Created", "User Updated", "Role Updated", "Password Reset", "User Deactivated"],
  Notifications: ["Reminder Created", "Notification Sent", "Alert Cleared"],
};

const IPS = [
  "182.73.194.10", "182.73.194.12", "115.248.112.45", "49.207.210.88",
  "122.176.45.19", "182.73.194.55", "106.51.78.22", "182.73.194.89"
];

const BROWSERS = [
  { browser: "Chrome 127.0", os: "Windows 11", device: "Desktop Workstation" },
  { browser: "Edge 126.0", os: "Windows 11", device: "Dell Latitude Laptop" },
  { browser: "Safari 17.5", os: "macOS Sonoma", device: "MacBook Pro 16\"" },
  { browser: "Chrome Mobile 127", os: "Android 14", device: "Samsung Galaxy S24" },
];

const LOCATIONS = [
  "Chennai HQ (IN)", "Mumbai Office (IN)", "Dubai Hub (AE)", "Kuala Lumpur (MY)", "Bangalore R&D (IN)"
];

// Helper to format dates
function formatLogDate(d: Date): { timestamp: string; dateKey: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = pad(d.getDate());
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());

  const dateKey = `${year}-${pad(d.getMonth() + 1)}-${day}`;
  const timestamp = `${day} ${month} ${year}, ${hours}:${mins}:${secs}`;
  return { timestamp, dateKey };
}

// Generate 200 Audit Logs
function generateMockAuditLogs(): AuditLogItem[] {
  const logs: AuditLogItem[] = [];
  const now = new Date(2026, 7, 4, 14, 30); // 04 Aug 2026

  const projectRefs = ["PR-11040_3", "PR-11042_1", "PR-10988_4", "PR-11055_2", "PR-11012_5"];
  const invoiceRefs = ["PR-11040-3-INV-001", "PR-11040-3-INV-002", "PR-11042-1-INV-005"];

  for (let i = 0; i < 200; i++) {
    // Generate dates spread across today (04 Aug 2026) and last 30 days
    const minutesAgo = i < 45 ? i * 8 : 400 + (i - 45) * 180;
    const dateObj = new Date(now.getTime() - minutesAgo * 60 * 1000);
    const { timestamp, dateKey } = formatLogDate(dateObj);

    const user = USERS[i % USERS.length];
    const module = MODULES[i % MODULES.length];
    const actions = ACTIONS_BY_MODULE[module];
    const action = actions[i % actions.length];

    // Status distribution: ~80% Success, 12% Warning, 8% Failed
    const rand = (i * 37) % 100;
    let status: AuditStatus = "Success";
    let failureReason: string | undefined = undefined;

    if (rand > 88) {
      status = "Failed";
      failureReason = action.includes("Login")
        ? "Invalid Employee ID / Password combination"
        : action.includes("Import")
        ? "File validation schema mismatch (Column 'EmployeeID' missing)"
        : "Permission Denied: Insufficient Role Privileges";
    } else if (rand > 76) {
      status = "Warning";
      failureReason = "Non-critical discrepancy detected during execution";
    }

    const env = BROWSERS[i % BROWSERS.length];
    const ip = IPS[i % IPS.length];
    const location = LOCATIONS[i % LOCATIONS.length];

    let refNo = "-";
    let affected = "-";
    if (module === "Projects") {
      refNo = projectRefs[i % projectRefs.length];
      affected = `Project ${refNo} (Engineering Control)`;
    } else if (module === "Invoices") {
      refNo = invoiceRefs[i % invoiceRefs.length];
      affected = `Invoice Cycle ${refNo}`;
    } else if (module === "Timesheets") {
      refNo = "TS-2026-07";
      affected = "July 2026 Manhour Timesheet Batch";
    } else if (module === "User Management") {
      refNo = user.empId;
      affected = `User Profile (${user.email})`;
    } else {
      refNo = `REF-${1000 + i}`;
      affected = `${module} System Record`;
    }

    const logItem: AuditLogItem = {
      id: `AUD-${2026000 + i}`,
      timestamp,
      dateKey,
      employeeName: user.name,
      employeeId: user.empId,
      companyEmail: user.email,
      department: user.dept,
      role: user.role,
      module,
      action,
      referenceNo: refNo,
      affectedRecord: affected,
      ipAddress: ip,
      device: env.device,
      browser: env.browser,
      operatingSystem: env.os,
      location,
      sessionId: `SESS-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      status,
      description: `${action} initiated by ${user.name} (${user.role}) from IP ${ip} [${location}].`,
      failureReason,
      timeline: [
        { time: `${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2, "0")}:01`, title: "Request Received", detail: `HTTP POST /api/v1/audit/${module.toLowerCase().replace(" ", "-")}` },
        { time: `${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2, "0")}:02`, title: "Authentication Check", detail: `Bearer Token validated for ${user.email}` },
        { time: `${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2, "0")}:03`, title: "Execution Completed", detail: status === "Success" ? "Operation completed cleanly with HTTP 200 OK." : `Operation logged status: ${status}.` }
      ],
    };

    logs.push(logItem);
  }

  return logs;
}

// Generate Failed Logins dataset
function generateFailedLogins(): FailedLoginRecord[] {
  return [
    { id: "FL-101", companyEmail: "unknown.user@ifluids.com", attemptTime: "04 Aug 2026, 14:12:05", ipAddress: "49.207.210.88", reason: "Invalid Employee ID", status: "Failed" },
    { id: "FL-102", companyEmail: "priya.sharma@ifluids.com", attemptTime: "04 Aug 2026, 13:45:19", ipAddress: "182.73.194.10", reason: "Password mismatch (Attempt 1/3)", status: "Failed" },
    { id: "FL-103", companyEmail: "guest_contractor@external.com", attemptTime: "04 Aug 2026, 12:10:44", ipAddress: "106.51.78.22", reason: "Unauthorized Domain Access", status: "Blocked" },
    { id: "FL-104", companyEmail: "suresh.v@ifluids.com", attemptTime: "04 Aug 2026, 10:22:30", ipAddress: "115.248.112.45", reason: "Expired Session Token", status: "Failed" },
    { id: "FL-105", companyEmail: "admin_test@ifluids.com", attemptTime: "04 Aug 2026, 09:15:12", ipAddress: "182.73.194.89", reason: "Account Temporarily Locked", status: "Blocked" },
    { id: "FL-106", companyEmail: "vikram.s@ifluids.com", attemptTime: "03 Aug 2026, 18:40:02", ipAddress: "182.73.194.55", reason: "Password mismatch", status: "Failed" },
  ];
}

// Generate System Activity Timeline dataset
function generateSystemTimeline(): SystemActivityItem[] {
  return [
    { id: "ACT-01", time: "09:10 AM", title: "Project PR-11040_3 Updated", detail: "PM Execution quantity progress updated for Draftsman & Sr. Consultant roles.", module: "Projects", user: "Rajesh Kumar", badgeColor: "bg-blue-500" },
    { id: "ACT-02", time: "09:25 AM", title: "Invoice PR-11040-3-INV-001 Created", detail: "New Invoice Cycle 1 raised for ₹51.56K Commercial Adjustment ₹0.", module: "Invoices", user: "Priya Sharma", badgeColor: "bg-emerald-500" },
    { id: "ACT-03", time: "10:05 AM", title: "Timesheet July 2026 Batch Imported", detail: "42 employee timesheet records processed from Keka HR integration.", module: "Timesheets", user: "Anand K.", badgeColor: "bg-purple-500" },
    { id: "ACT-04", time: "10:20 AM", title: "New User Profile Created", detail: "Account created for Suresh V. (Sr. Consultant - Safety & Loss Prevention).", module: "User Management", user: "Anand K.", badgeColor: "bg-cyan-500" },
    { id: "ACT-05", time: "11:00 AM", title: "Password Reset Completed", detail: "Self-service password reset confirmed via email verification.", module: "Settings", user: "Sneha Patel", badgeColor: "bg-amber-500" },
    { id: "ACT-06", time: "12:15 PM", title: "Commercial Milestone Billing Configured", detail: "Payment Milestone 2 (30% Completion) verified for PR-11042_1.", module: "Projects", user: "Priya Sharma", badgeColor: "bg-indigo-500" },
    { id: "ACT-07", time: "01:40 PM", title: "Executive Report PDF Exported", detail: "Financial Loss & Timeline Alert project summary report downloaded.", module: "Reports", user: "Anand K.", badgeColor: "bg-teal-500" },
  ];
}

// Global cached dataset
let cachedAuditLogs: AuditLogItem[] | null = null;

export const auditLogService = {
  getAuditLogs(): AuditLogItem[] {
    if (!cachedAuditLogs) {
      cachedAuditLogs = generateMockAuditLogs();
    }
    return cachedAuditLogs;
  },

  getFailedLogins(): FailedLoginRecord[] {
    return generateFailedLogins();
  },

  getSystemTimeline(): SystemActivityItem[] {
    return generateSystemTimeline();
  },

  calculateKPIStats(logs: AuditLogItem[]): AuditKPIStats {
    const todayKey = "2026-08-04";

    const totalEvents = logs.length;
    const successfulLoginsToday = logs.filter(
      (l) => l.dateKey === todayKey && l.action.toLowerCase().includes("login") && l.status === "Success"
    ).length + 38; // realistic total

    const failedLoginAttempts = generateFailedLogins().length + logs.filter(l => l.status === "Failed" && l.action.toLowerCase().includes("login")).length;
    const projectChangesToday = logs.filter((l) => l.dateKey === todayKey && l.module === "Projects").length;
    const activeSessions = 29;

    return {
      totalEvents,
      successfulLoginsToday,
      failedLoginAttempts,
      projectChangesToday,
      activeSessions,
    };
  },

  filterLogs(logs: AuditLogItem[], filters: AuditFilterOptions): AuditLogItem[] {
    return logs.filter((item) => {
      // Search Query Filter
      if (filters.searchQuery.trim()) {
        const q = filters.searchQuery.toLowerCase().trim();
        const matchesName = item.employeeName.toLowerCase().includes(q);
        const matchesEmail = item.companyEmail.toLowerCase().includes(q);
        const matchesId = item.employeeId.toLowerCase().includes(q);
        const matchesRef = item.referenceNo?.toLowerCase().includes(q);
        const matchesModule = item.module.toLowerCase().includes(q);
        const matchesAction = item.action.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesId && !matchesRef && !matchesModule && !matchesAction) {
          return false;
        }
      }

      // Event Type Filter
      if (filters.eventType && filters.eventType !== "all") {
        if (item.action !== filters.eventType) return false;
      }

      // User Email Filter
      if (filters.userEmail && filters.userEmail !== "all") {
        if (item.companyEmail !== filters.userEmail) return false;
      }

      // Module Filter
      if (filters.module && filters.module !== "all") {
        if (item.module !== filters.module) return false;
      }

      // Status Filter
      if (filters.status && filters.status !== "all") {
        if (item.status !== filters.status) return false;
      }

      // Date Range Filter
      if (filters.dateRange && filters.dateRange !== "all") {
        const todayKey = "2026-08-04";
        if (filters.dateRange === "today") {
          if (item.dateKey !== todayKey) return false;
        } else if (filters.dateRange === "7days") {
          // Keep top ~50 logs
          if (logs.indexOf(item) > 60) return false;
        } else if (filters.dateRange === "30days") {
          if (logs.indexOf(item) > 160) return false;
        }
      }

      return true;
    });
  },

  exportToCSV(logs: AuditLogItem[]): void {
    const headers = [
      "Audit ID",
      "Timestamp",
      "Employee Name",
      "Employee ID",
      "Company Email",
      "Department",
      "System Role",
      "Module",
      "Action",
      "Reference No",
      "Affected Record",
      "IP Address",
      "Device",
      "Browser",
      "OS",
      "Location",
      "Session ID",
      "Status",
      "Description",
      "Failure Reason",
    ];

    const rows = logs.map((l) => [
      l.id,
      `"${l.timestamp}"`,
      `"${l.employeeName}"`,
      `"${l.employeeId}"`,
      `"${l.companyEmail}"`,
      `"${l.department}"`,
      `"${l.role}"`,
      `"${l.module}"`,
      `"${l.action}"`,
      `"${l.referenceNo || "-"}"`,
      `"${l.affectedRecord || "-"}"`,
      `"${l.ipAddress}"`,
      `"${l.device}"`,
      `"${l.browser}"`,
      `"${l.operatingSystem}"`,
      `"${l.location}"`,
      `"${l.sessionId}"`,
      `"${l.status}"`,
      `"${l.description.replace(/"/g, '""')}"`,
      `"${(l.failureReason || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pmo_security_audit_logs_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
};
