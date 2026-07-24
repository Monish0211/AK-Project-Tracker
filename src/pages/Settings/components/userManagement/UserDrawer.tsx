import React, { useState, useEffect } from "react";
import { X, User as UserIcon, Shield, CheckSquare, Settings2, KeyRound, Camera, Save } from "lucide-react";
import type { User, UserRole, AccountStatus, UserModuleAccess, UserAssignedProjects, UserApprovalRights } from "../../../../types/UserModel";
import { saveUser, resetUserPassword } from "../../../../services/userManagementService";
import { Button } from "../../../../components/ui/Button";
import { Badge } from "../../../../components/ui/Badge";

interface UserDrawerProps {
  isOpen: boolean;
  mode: "add" | "edit" | "view";
  user?: User;
  onClose: () => void;
  managersList: string[];
}

const DEPARTMENTS = [
  "PMO & Engineering",
  "Automation & Controls",
  "Electrical Engineering",
  "Mechanical Engineering",
  "Instrument Engineering",
  "Civil & Structural",
  "Finance & Operations",
];

const DEFAULT_MODULE_ACCESS: UserModuleAccess = {
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
};

const DEFAULT_ASSIGNED_PROJECTS: UserAssignedProjects = {
  qatar: true,
  malaysia: false,
  india: true,
  oman: false,
  abuDhabi: false,
};

const DEFAULT_APPROVAL_RIGHTS: UserApprovalRights = {
  approveTimesheets: false,
  approveExpenses: false,
  approveReminders: false,
  archiveProjects: false,
};

export const UserDrawer = ({ isOpen, mode, user, onClose, managersList }: UserDrawerProps) => {
  const isViewOnly = mode === "view";
  const [animateShow, setAnimateShow] = useState(false);

  // Form State
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [designation, setDesignation] = useState("");
  const [reportingManager, setReportingManager] = useState("");
  const [role, setRole] = useState<UserRole>("Employee");
  const [status, setStatus] = useState<AccountStatus>("Active");
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [passwordResetNotice, setPasswordResetNotice] = useState<string | null>(null);

  const [moduleAccess, setModuleAccess] = useState<UserModuleAccess>(DEFAULT_MODULE_ACCESS);
  const [assignedProjects, setAssignedProjects] = useState<UserAssignedProjects>(DEFAULT_ASSIGNED_PROJECTS);
  const [approvalRights, setApprovalRights] = useState<UserApprovalRights>(DEFAULT_APPROVAL_RIGHTS);

  const [formError, setFormError] = useState("");

  // Sync state when drawer opens or user changes
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => setAnimateShow(true), 50);
      setPasswordResetNotice(null);

      if (user && (mode === "edit" || mode === "view")) {
        setEmployeeName(user.employeeName || "");
        setEmployeeId(user.employeeId || "");
        setEmail(user.email || "");
        setPhone(user.phone || "");
        setDepartment(user.department || DEPARTMENTS[0]);
        setDesignation(user.designation || "");
        setReportingManager(user.reportingManager || managersList[0] || "Rajesh Sharma");
        setRole(user.role || "Employee");
        setStatus(user.status || "Active");
        setForcePasswordChange(user.forcePasswordChange ?? false);
        setModuleAccess(user.moduleAccess || DEFAULT_MODULE_ACCESS);
        setAssignedProjects(user.assignedProjects || DEFAULT_ASSIGNED_PROJECTS);
        setApprovalRights(user.approvalRights || DEFAULT_APPROVAL_RIGHTS);
      } else {
        // Add Mode
        setEmployeeName("");
        setEmployeeId(`EMP-${Math.floor(10000 + Math.random() * 90000)}`);
        setEmail("");
        setPhone("");
        setDepartment(DEPARTMENTS[0]);
        setDesignation("Engineer");
        setReportingManager(managersList[0] || "Rajesh Sharma");
        setRole("Employee");
        setStatus("Active");
        setForcePasswordChange(true);
        setModuleAccess(DEFAULT_MODULE_ACCESS);
        setAssignedProjects(DEFAULT_ASSIGNED_PROJECTS);
        setApprovalRights(DEFAULT_APPROVAL_RIGHTS);
      }
      setFormError("");
    } else {
      setAnimateShow(false);
    }
  }, [isOpen, mode, user, managersList]);

  if (!isOpen) return null;

  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
    if (newRole === "Manager") {
      setApprovalRights({
        approveTimesheets: true,
        approveExpenses: true,
        approveReminders: true,
        archiveProjects: true,
      });
      setModuleAccess((prev) => ({
        ...prev,
        customerMaster: true,
        invoices: true,
        reports: true,
        settings: true,
      }));
    }
  };

  const handleToggleModule = (key: keyof UserModuleAccess) => {
    if (isViewOnly) return;
    setModuleAccess((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleProject = (key: keyof UserAssignedProjects) => {
    if (isViewOnly) return;
    setAssignedProjects((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleApproval = (key: keyof UserApprovalRights) => {
    if (isViewOnly) return;
    setApprovalRights((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTriggerResetPassword = () => {
    if (user?.id) {
      resetUserPassword(user.id);
      setPasswordResetNotice("Password reset link generated. Force password change enabled for next login.");
    } else {
      setPasswordResetNotice("Password reset token generated for new user.");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isViewOnly) return;

    if (!employeeName.trim()) {
      setFormError("Full Name is required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setFormError("A valid Email address is required.");
      return;
    }

    saveUser({
      id: user?.id,
      employeeId,
      employeeName: employeeName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      department,
      designation: designation.trim(),
      reportingManager,
      role,
      status,
      forcePasswordChange,
      moduleAccess,
      assignedProjects,
      approvalRights,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs transition-opacity duration-300 ${
          animateShow ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
        <div
          className={`w-screen max-w-md sm:max-w-lg bg-[var(--nu-surface)] border-l border-[var(--nu-border)] shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out ${
            animateShow ? "translate-x-0" : "translate-x-full"
          }`}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)] flex items-center justify-between shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[17px] font-bold text-[var(--nu-text)] truncate">
                  {mode === "add" ? "Add New User" : mode === "edit" ? "Edit User Profile" : "User Details"}
                </h2>
                <Badge tone={role === "Manager" ? "accent" : "neutral"} className="font-semibold">
                  {role}
                </Badge>
              </div>
              <p className="text-[11.5px] text-[var(--nu-text-muted)] mt-0.5 font-mono">
                {employeeId || "EMP-XXXXX"}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-[var(--nu-radius-md)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface)] flex items-center justify-center transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Form Body Scrollable Container */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 nu-scrollbar">
            {formError && (
              <div className="p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] border border-[var(--nu-danger)]/30 text-[var(--nu-danger)] text-[12px] font-semibold">
                {formError}
              </div>
            )}

            {/* SECTION 1: General Information */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--nu-border)]">
                <UserIcon size={16} className="text-[var(--nu-accent)]" />
                <h3 className="text-[14px] font-bold text-[var(--nu-text)]">General Information</h3>
              </div>

              {/* Profile Photo Placeholder */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[var(--nu-accent)]/15 text-[var(--nu-accent)] border border-[var(--nu-accent)]/30 flex items-center justify-center font-bold text-lg shrink-0 shadow-xs">
                  {employeeName ? employeeName.slice(0, 2).toUpperCase() : "U"}
                </div>
                <div>
                  <p className="text-[12.5px] font-semibold text-[var(--nu-text)]">Profile Photo</p>
                  <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">JPG or PNG up to 2MB</p>
                  {!isViewOnly && (
                    <button
                      type="button"
                      onClick={() => alert("Photo upload feature ready for backend integration.")}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--nu-accent)] hover:underline"
                    >
                      <Camera size={12} /> Upload Photo
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    disabled={isViewOnly}
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="e.g. Rajesh Sharma"
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                    Employee ID *
                  </label>
                  <input
                    type="text"
                    disabled={isViewOnly}
                    value={employeeId}
                    onChange={(e) => setEmployeeId(e.target.value)}
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] font-mono text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    disabled={isViewOnly}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. name@ifluids.com"
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    disabled={isViewOnly}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                    Department
                  </label>
                  <select
                    disabled={isViewOnly}
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 disabled:opacity-60 cursor-pointer"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                    Designation
                  </label>
                  <input
                    type="text"
                    disabled={isViewOnly}
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Senior Controls Engineer"
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                    Reporting Manager
                  </label>
                  <select
                    disabled={isViewOnly}
                    value={reportingManager}
                    onChange={(e) => setReportingManager(e.target.value)}
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 disabled:opacity-60 cursor-pointer"
                  >
                    {managersList.map((mgr) => (
                      <option key={mgr} value={mgr}>
                        {mgr}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                    Account Status
                  </label>
                  <select
                    disabled={isViewOnly}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AccountStatus)}
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 disabled:opacity-60 cursor-pointer font-semibold"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1.5">
                  System Role
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => handleRoleChange("Manager")}
                    className={`p-3 rounded-[var(--nu-radius-md)] border text-left transition-all ${
                      role === "Manager"
                        ? "border-[var(--nu-accent)] bg-[var(--nu-accent-soft)] text-[var(--nu-text)] ring-1 ring-[var(--nu-accent)]"
                        : "border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)]"
                    }`}
                  >
                    <p className="text-[13px] font-bold">Manager</p>
                    <p className="text-[10.5px] text-[var(--nu-text-muted)] mt-0.5">
                      Full approval rights & operational management
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={isViewOnly}
                    onClick={() => handleRoleChange("Employee")}
                    className={`p-3 rounded-[var(--nu-radius-md)] border text-left transition-all ${
                      role === "Employee"
                        ? "border-[var(--nu-accent)] bg-[var(--nu-accent-soft)] text-[var(--nu-text)] ring-1 ring-[var(--nu-accent)]"
                        : "border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)]"
                    }`}
                  >
                    <p className="text-[13px] font-bold">Employee</p>
                    <p className="text-[10.5px] text-[var(--nu-text-muted)] mt-0.5">
                      Standard module access for daily work
                    </p>
                  </button>
                </div>
              </div>
            </div>

            {/* SECTION 2: Module Access */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--nu-border)]">
                <Settings2 size={16} className="text-[var(--nu-accent)]" />
                <h3 className="text-[14px] font-bold text-[var(--nu-text)]">Module Access</h3>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {(
                  [
                    { key: "dashboard", label: "Dashboard" },
                    { key: "projects", label: "Projects" },
                    { key: "customerMaster", label: "Customer Master" },
                    { key: "invoices", label: "Invoices" },
                    { key: "timesheets", label: "Timesheets" },
                    { key: "reports", label: "Reports" },
                    { key: "manpower", label: "Manpower" },
                    { key: "documents", label: "Documents" },
                    { key: "settings", label: "Settings" },
                    { key: "reminders", label: "Reminders" },
                  ] as const
                ).map(({ key, label }) => {
                  const isChecked = moduleAccess[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isViewOnly}
                      onClick={() => handleToggleModule(key)}
                      className={`flex items-center justify-between p-2.5 rounded-[var(--nu-radius-md)] border text-left transition-all ${
                        isChecked
                          ? "border-[var(--nu-accent)]/40 bg-[var(--nu-surface-alt)] text-[var(--nu-text)]"
                          : "border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text-muted)]"
                      }`}
                    >
                      <span className="text-[12px] font-medium">{label}</span>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                          isChecked
                            ? "bg-[var(--nu-accent)] border-[var(--nu-accent)] text-white"
                            : "border-[var(--nu-border)] bg-transparent"
                        }`}
                      >
                        {isChecked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 3: Assigned Projects */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--nu-border)]">
                <CheckSquare size={16} className="text-[var(--nu-accent)]" />
                <h3 className="text-[14px] font-bold text-[var(--nu-text)]">Assigned Projects</h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {(
                  [
                    { key: "qatar", label: "Qatar" },
                    { key: "malaysia", label: "Malaysia" },
                    { key: "india", label: "India" },
                    { key: "oman", label: "Oman" },
                    { key: "abuDhabi", label: "Abu Dhabi" },
                  ] as const
                ).map(({ key, label }) => {
                  const isAssigned = assignedProjects[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isViewOnly}
                      onClick={() => handleToggleProject(key)}
                      className={`flex items-center justify-between p-2.5 rounded-[var(--nu-radius-md)] border text-left transition-all ${
                        isAssigned
                          ? "border-[var(--nu-accent)]/40 bg-[var(--nu-surface-alt)] text-[var(--nu-text)]"
                          : "border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text-muted)]"
                      }`}
                    >
                      <span className="text-[12px] font-medium">{label}</span>
                      <span
                        className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                          isAssigned
                            ? "bg-[var(--nu-accent)] border-[var(--nu-accent)] text-white"
                            : "border-[var(--nu-border)] bg-transparent"
                        }`}
                      >
                        {isAssigned && <span className="text-[10px] font-bold">✓</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 4: Approval Rights (Manager Only) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--nu-border)]">
                <Shield size={16} className="text-[var(--nu-accent)]" />
                <h3 className="text-[14px] font-bold text-[var(--nu-text)]">Approval Rights</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(
                  [
                    { key: "approveTimesheets", label: "Approve Timesheets" },
                    { key: "approveExpenses", label: "Approve Expenses" },
                    { key: "approveReminders", label: "Approve Reminders" },
                    { key: "archiveProjects", label: "Archive Projects" },
                  ] as const
                ).map(({ key, label }) => {
                  const isEnabled = approvalRights[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isViewOnly}
                      onClick={() => handleToggleApproval(key)}
                      className={`flex items-center justify-between p-2.5 rounded-[var(--nu-radius-md)] border text-left transition-all ${
                        isEnabled
                          ? "border-emerald-500/40 bg-emerald-500/10 text-[var(--nu-text)]"
                          : "border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text-muted)]"
                      }`}
                    >
                      <span className="text-[12px] font-medium">{label}</span>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                          isEnabled
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-[var(--nu-border)] bg-transparent"
                        }`}
                      >
                        {isEnabled && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 5: Account & Password Controls */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--nu-border)]">
                <KeyRound size={16} className="text-[var(--nu-accent)]" />
                <h3 className="text-[14px] font-bold text-[var(--nu-text)]">Account & Security</h3>
              </div>

              {passwordResetNotice && (
                <div className="p-3 rounded-[var(--nu-radius-md)] bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11.5px] font-medium leading-snug">
                  {passwordResetNotice}
                </div>
              )}

              <div className="p-3.5 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[var(--nu-text-secondary)]">Force Password Change on Next Login</span>
                  <input
                    type="checkbox"
                    disabled={isViewOnly}
                    checked={forcePasswordChange}
                    onChange={(e) => setForcePasswordChange(e.target.checked)}
                    className="w-4 h-4 accent-[var(--nu-accent)] cursor-pointer"
                  />
                </div>

                {!isViewOnly && (
                  <div className="pt-2 border-t border-[var(--nu-border)] flex items-center justify-between">
                    <span className="text-[11.5px] text-[var(--nu-text-muted)]">Manual Credential Reset</span>
                    <button
                      type="button"
                      onClick={handleTriggerResetPassword}
                      className="px-2.5 py-1 rounded-[var(--nu-radius-md)] bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 text-[11.5px] font-bold border border-amber-500/30 transition-colors"
                    >
                      Reset Password
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button type="submit" className="hidden" />
          </form>

          {/* Sticky Action Footer */}
          <div className="px-6 py-3.5 border-t border-[var(--nu-border)] bg-[var(--nu-surface)] flex justify-end gap-2.5 shrink-0 shadow-[var(--nu-shadow-md)]">
            <Button variant="secondary" size="sm" onClick={onClose}>
              {isViewOnly ? "Close" : "Cancel"}
            </Button>
            {!isViewOnly && (
              <Button variant="primary" size="sm" icon={<Save size={14} />} onClick={handleSubmit}>
                {mode === "add" ? "Save User" : "Update User"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
