import React, { useState, useEffect } from "react";
import { X, User as UserIcon, Shield, CheckSquare, Settings2, KeyRound, Camera, Save, Info, MapPin } from "lucide-react";
import type {
  User,
  SystemRole,
  EmployeeType,
  AccountStatus,
  UserModuleAccess,
  UserProjectRegionAccess,
  UserApprovalRights,
} from "../../../../types/UserModel";
import { SYSTEM_ROLES, EMPLOYEE_TYPES } from "../../../../types/UserModel";
import { createUser, updateUser } from "../../../../services/userManagementService";
import type { CreatedPortalUser, UserLookupItem, UserLookups } from "../../../../services/userManagementService";
import { ApiError } from "../../../../services/apiClient";
import { generateCompanyEmail, generateTemporaryPassword } from "../../../../utils/userProvisioning";
import { MODULE_FIELDS, REGION_FIELDS, APPROVAL_FIELDS } from "../../../../utils/accessFields";
import { ROLE_MODULE_DEFAULTS, ROLE_APPROVAL_DEFAULTS, ROLE_REGION_DEFAULTS } from "../../../../utils/roleDefaults";
import { getDepartmentOptions, addDepartment } from "../../../../services/departmentDirectoryService";
import { getReportingManagerOptions, addReportingManager } from "../../../../services/reportingManagerDirectoryService";
import { Button } from "../../../../components/ui/Button";
import { Badge } from "../../../../components/ui/Badge";
import { Toggle } from "../../../../components/ui/Toggle";
import { CreatableCombobox } from "../../../../components/ui/CreatableCombobox";

interface UserDrawerProps {
  isOpen: boolean;
  mode: "add" | "edit";
  user?: User;
  onClose: () => void;
  onSaved: (user: User) => void;
  onRequestResetPassword: (user: User) => void;
  existingUsers: User[];
  /** Real role/module/region/approval ids for the backend — null while still loading. */
  lookups: UserLookups | null;
}

const ROLE_DESCRIPTIONS: Record<SystemRole, string> = {
  Administrator: "Full system access & user management",
  "PMO Manager": "Cross-project oversight & approvals",
  "Project Manager": "Manages assigned projects end-to-end",
  "Project Coordinator": "Day-to-day project coordination",
  "Department Head": "Departmental oversight & sign-off",
  Engineer: "Standard project execution access",
  Finance: "Financial records & invoicing",
  Accounts: "Accounts & collections",
  "Management Viewer": "Read-only executive visibility",
  "Read Only": "View-only, no edit permissions",
};

/** Maps this form's selected labels (module/region/approval field labels already match the backend's seeded names) to real database ids. */
function resolveSelectedIds(lookupItems: UserLookupItem[], selectedLabels: string[]): string[] {
  return selectedLabels
    .map((label) => lookupItems.find((item) => item.name === label)?.id)
    .filter((id): id is string => Boolean(id));
}

/**
 * Merges the real backend response (id, canonical email, createdAt, etc.)
 * with the rest of this form's local state (moduleAccess/projectRegionAccess/
 * approvalRights, and fields Phase 1's backend doesn't persist yet) into the
 * frontend's display User shape, so the new user can appear in the existing
 * mock-backed table without that table needing a real listing endpoint yet.
 */
function buildLocalUserFromBackendResponse(
  created: CreatedPortalUser,
  form: {
    role: SystemRole;
    status: AccountStatus;
    phone: string;
    designation: string;
    reportingManager: string;
    employeeType: EmployeeType;
    moduleAccess: UserModuleAccess;
    projectRegionAccess: UserProjectRegionAccess;
    approvalRights: UserApprovalRights;
    accountLocked: boolean;
    temporaryPassword: string;
  }
): User {
  return {
    id: created.id,
    // Employee ID is a generated business field the backend doesn't assign
    // yet (Phase 1 is Create User only) — left blank until that lands.
    employeeId: "",
    employeeName: created.fullName,
    email: created.email,
    phone: form.phone,
    department: created.department ?? "",
    designation: created.designation ?? form.designation,
    reportingManager: form.reportingManager,
    employeeType: form.employeeType,
    role: form.role,
    status: form.status,
    avatarUrl: "",
    temporaryPassword: form.temporaryPassword,
    isFirstLogin: true,
    lastLoginAt: null,
    moduleAccess: form.moduleAccess,
    projectRegionAccess: form.projectRegionAccess,
    approvalRights: form.approvalRights,
    accountSecurity: {
      forcePasswordChangeOnFirstLogin: created.forcePasswordChange,
      accountLocked: form.accountLocked,
      twoFactorEnabled: false,
      passwordExpiryDays: null,
      lastPasswordResetAt: null,
    },
    createdAt: created.createdAt,
    createdBy: "Administrator",
  };
}

const formatDateTime = (iso?: string | null): string => {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const DEFAULT_ROLE: SystemRole = "Engineer";

export const UserDrawer = ({ isOpen, mode, user, onClose, onSaved, onRequestResetPassword, existingUsers, lookups }: UserDrawerProps) => {
  const [animateShow, setAnimateShow] = useState(false);

  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [emailManuallyEdited, setEmailManuallyEdited] = useState(false);
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [reportingManager, setReportingManager] = useState("");
  const [employeeType, setEmployeeType] = useState<EmployeeType>("Permanent");
  const [role, setRole] = useState<SystemRole>(DEFAULT_ROLE);
  const [status, setStatus] = useState<AccountStatus>("Active");

  const [moduleAccess, setModuleAccess] = useState<UserModuleAccess>(ROLE_MODULE_DEFAULTS[DEFAULT_ROLE]);
  const [projectRegionAccess, setProjectRegionAccess] = useState<UserProjectRegionAccess>(ROLE_REGION_DEFAULTS[DEFAULT_ROLE]);
  const [approvalRights, setApprovalRights] = useState<UserApprovalRights>(ROLE_APPROVAL_DEFAULTS[DEFAULT_ROLE]);

  const [forcePasswordChange, setForcePasswordChange] = useState(true);
  const [accountLocked, setAccountLocked] = useState(false);
  const [lastPasswordResetAt, setLastPasswordResetAt] = useState<string | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState("");

  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => setAnimateShow(false), 0);
      return;
    }

    setTimeout(() => setAnimateShow(true), 50);

    setTimeout(() => {
      setFormError("");
      setEmailManuallyEdited(mode === "edit");

      if (user && mode === "edit") {
        setEmployeeName(user.employeeName);
        setEmployeeId(user.employeeId);
        setEmail(user.email);
        setPhone(user.phone || "");
        setDepartment(user.department || "");
        setDesignation(user.designation || "");
        setReportingManager(user.reportingManager || "");
        setEmployeeType(user.employeeType || "Permanent");
        setRole(user.role || DEFAULT_ROLE);
        setStatus(user.status || "Active");
        setModuleAccess(user.moduleAccess);
        setProjectRegionAccess(user.projectRegionAccess);
        setApprovalRights(user.approvalRights);
        setForcePasswordChange(user.accountSecurity.forcePasswordChangeOnFirstLogin);
        setAccountLocked(user.accountSecurity.accountLocked);
        setLastPasswordResetAt(user.accountSecurity.lastPasswordResetAt);
        setTemporaryPassword("");
      } else {
        setEmployeeName("");
        setEmployeeId("Generated on save");
        setEmail("");
        setPhone("");
        setDepartment("");
        setDesignation("");
        setReportingManager("");
        setEmployeeType("Permanent");
        setRole(DEFAULT_ROLE);
        setStatus("Active");
        setModuleAccess(ROLE_MODULE_DEFAULTS[DEFAULT_ROLE]);
        setProjectRegionAccess(ROLE_REGION_DEFAULTS[DEFAULT_ROLE]);
        setApprovalRights(ROLE_APPROVAL_DEFAULTS[DEFAULT_ROLE]);
        setForcePasswordChange(true);
        setAccountLocked(false);
        setLastPasswordResetAt(null);
        setTemporaryPassword(generateTemporaryPassword());
      }
    }, 0);
  }, [isOpen, mode, user]);

  // Live-suggest the Company Email from the name while adding a new user,
  // until the Administrator explicitly edits the email field themselves.
  useEffect(() => {
    if (mode !== "add" || emailManuallyEdited) return;
    const suggested = employeeName.trim() ? generateCompanyEmail(employeeName, existingUsers) : "";
    setTimeout(() => setEmail(suggested), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeName, mode, emailManuallyEdited]);

  if (!isOpen) return null;

  const handleRoleChange = (newRole: SystemRole) => {
    setRole(newRole);
    // Only pre-fill recommended permissions for a brand-new user — never
    // silently overwrite an existing user's already-customized permissions
    // just because their role changed in Edit mode.
    if (mode === "add") {
      setModuleAccess(ROLE_MODULE_DEFAULTS[newRole]);
      setProjectRegionAccess(ROLE_REGION_DEFAULTS[newRole]);
      setApprovalRights(ROLE_APPROVAL_DEFAULTS[newRole]);
    }
  };

  const handleToggleModule = (key: keyof UserModuleAccess) => {
    setModuleAccess((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleRegion = (key: keyof UserProjectRegionAccess) => {
    setProjectRegionAccess((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleApproval = (key: keyof UserApprovalRights) => {
    setApprovalRights((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!employeeName.trim()) {
      setFormError("Full Name is required.");
      return;
    }
    if (!department.trim()) {
      setFormError("Department is required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setFormError("A valid Company Email address is required.");
      return;
    }

    if (mode === "add") {
      if (!lookups) {
        setFormError("Form reference data is still loading. Please try again in a moment.");
        return;
      }

      const roleId = lookups.roles.find((r) => r.name === role)?.id;
      if (!roleId) {
        setFormError(`Role "${role}" is not configured in the system yet.`);
        return;
      }

      const moduleIds = resolveSelectedIds(
        lookups.modules,
        MODULE_FIELDS.filter((f) => moduleAccess[f.key]).map((f) => f.label)
      );
      const regionIds = resolveSelectedIds(
        lookups.regions,
        REGION_FIELDS.filter((f) => projectRegionAccess[f.key]).map((f) => f.label)
      );
      const approvalIds = resolveSelectedIds(
        lookups.approvalTypes,
        APPROVAL_FIELDS.filter((f) => approvalRights[f.key]).map((f) => f.label)
      );

      setIsSaving(true);
      try {
        const created = await createUser({
          fullName: employeeName.trim(),
          email: email.trim(),
          phoneNumber: phone.trim() || null,
          department,
          designation: designation.trim() || "Engineer",
          // Reporting Manager here is a free-text mock directory, not a real
          // PortalUser id yet — Phase 1 has no user-lookup/search endpoint to
          // resolve a typed name against, so it's intentionally left unset.
          reportingManagerId: null,
          employeeType,
          isActive: status === "Active",
          temporaryPassword,
          forcePasswordChange,
          roleId,
          moduleIds,
          regionIds,
          approvalIds,
        });

        onSaved(
          buildLocalUserFromBackendResponse(created, {
            role,
            status,
            phone: phone.trim(),
            designation: designation.trim() || "Engineer",
            reportingManager,
            employeeType,
            moduleAccess,
            projectRegionAccess,
            approvalRights,
            accountLocked,
            temporaryPassword,
          })
        );
      } catch (error) {
        setFormError(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
        return;
      } finally {
        setIsSaving(false);
      }
    } else if (user) {
      if (!lookups) {
        setFormError("Form reference data is still loading. Please try again in a moment.");
        return;
      }

      const roleId = lookups.roles.find((r) => r.name === role)?.id;
      if (!roleId) {
        setFormError(`Role "${role}" is not configured in the system yet.`);
        return;
      }

      const moduleIds = resolveSelectedIds(
        lookups.modules,
        MODULE_FIELDS.filter((f) => moduleAccess[f.key]).map((f) => f.label)
      );
      const regionIds = resolveSelectedIds(
        lookups.regions,
        REGION_FIELDS.filter((f) => projectRegionAccess[f.key]).map((f) => f.label)
      );
      const approvalIds = resolveSelectedIds(
        lookups.approvalTypes,
        APPROVAL_FIELDS.filter((f) => approvalRights[f.key]).map((f) => f.label)
      );

      setIsSaving(true);
      try {
        const updated = await updateUser(user.id, {
          fullName: employeeName.trim(),
          email: email.trim(),
          phoneNumber: phone.trim() || null,
          department,
          designation: designation.trim() || null,
          employeeType,
          isActive: status === "Active",
          roleId,
          moduleIds,
          regionIds,
          approvalIds,
          forcePasswordChange,
          accountLocked,
        });
        onSaved(updated);
      } catch (error) {
        setFormError(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
        return;
      } finally {
        setIsSaving(false);
      }
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className={`absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs transition-opacity duration-300 ${
          animateShow ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

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
                  {mode === "add" ? "Add New User" : "Edit User Profile"}
                </h2>
                <Badge tone="accent" className="font-semibold">
                  {role}
                </Badge>
              </div>
              <p className="text-[11.5px] text-[var(--nu-text-muted)] mt-0.5 font-mono">{employeeId || "EMP-XXXXX"}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-[var(--nu-radius-md)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface)] flex items-center justify-center transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Form Body */}
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

              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-[var(--nu-accent)]/15 text-[var(--nu-accent)] border border-[var(--nu-accent)]/30 flex items-center justify-center font-bold text-lg shrink-0 shadow-xs">
                  {employeeName ? employeeName.slice(0, 2).toUpperCase() : "U"}
                </div>
                <div>
                  <p className="text-[12.5px] font-semibold text-[var(--nu-text)]">Profile Photo</p>
                  <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">JPG or PNG up to 2MB</p>
                  <button
                    type="button"
                    onClick={() => alert("Photo upload is ready for backend integration.")}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--nu-accent)] hover:underline cursor-pointer"
                  >
                    <Camera size={12} /> Upload Photo
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="e.g. Rajesh Sharma"
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">Employee ID (Auto Generated)</label>
                  <input
                    type="text"
                    disabled
                    value={employeeId}
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] font-mono text-[var(--nu-text-muted)] outline-none opacity-70 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">
                    Company Email {mode === "edit" && <span className="font-normal text-[var(--nu-text-muted)]">(Administrator only)</span>}
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailManuallyEdited(true);
                    }}
                    placeholder="Auto-generated from Full Name"
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">Department *</label>
                  <CreatableCombobox
                    key={`dept-${mode}-${user?.id ?? "new"}`}
                    value={department}
                    onChange={setDepartment}
                    options={getDepartmentOptions()}
                    onCreateOption={addDepartment}
                    entityLabel="Department"
                    placeholder="Type to search or add a department..."
                    emptyMessage="No matching departments"
                    aria-label="Department"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">Designation</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Senior Controls Engineer"
                    className="w-full h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-3 text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30"
                  />
                </div>

                <div>
                  <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1">Reporting Manager</label>
                  <CreatableCombobox
                    key={`mgr-${mode}-${user?.id ?? "new"}`}
                    value={reportingManager}
                    onChange={setReportingManager}
                    options={getReportingManagerOptions()}
                    onCreateOption={addReportingManager}
                    entityLabel="Reporting Manager"
                    placeholder="Type to search or add a reporting manager..."
                    emptyMessage="No Results Found"
                    aria-label="Reporting Manager"
                  />
                </div>
              </div>

              {/* Employee Type */}
              <div>
                <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1.5">Employee Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {EMPLOYEE_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setEmployeeType(type)}
                      className={`py-2 rounded-[var(--nu-radius-md)] border text-[11.5px] font-semibold transition-all cursor-pointer ${
                        employeeType === type
                          ? "border-[var(--nu-accent)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] ring-1 ring-[var(--nu-accent)]"
                          : "border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)]"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Account Status */}
              <div>
                <label className="block text-[11.5px] font-semibold text-[var(--nu-text-secondary)] mb-1.5">Account Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["Active", "Inactive"] as AccountStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`py-2 rounded-[var(--nu-radius-md)] border text-[12px] font-bold transition-all cursor-pointer ${
                        status === s
                          ? s === "Active"
                            ? "border-[var(--nu-success)] bg-[var(--nu-success-soft)] text-[var(--nu-success)] ring-1 ring-[var(--nu-success)]"
                            : "border-[var(--nu-danger)] bg-[var(--nu-danger-soft)] text-[var(--nu-danger)] ring-1 ring-[var(--nu-danger)]"
                          : "border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* SECTION 2: Login Information */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--nu-border)]">
                <KeyRound size={16} className="text-[var(--nu-accent)]" />
                <h3 className="text-[14px] font-bold text-[var(--nu-text)]">Login Information</h3>
              </div>

              {mode === "add" ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)]">
                      <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">Company Email</p>
                      <p className="text-[12.5px] font-mono font-semibold text-[var(--nu-text)] mt-0.5 truncate">{email || "—"}</p>
                    </div>
                    <div className="p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)]">
                      <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">Temporary Password</p>
                      <p className="text-[12.5px] font-mono font-semibold text-[var(--nu-text)] mt-0.5">{temporaryPassword}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-info)]/10 border border-[var(--nu-info)]/30 text-[11.5px] leading-snug text-[var(--nu-text-secondary)]">
                    <Info size={14} className="text-[var(--nu-info)] shrink-0 mt-0.5" />
                    <span>
                      This temporary password will be used only during the employee's first login. The user must create a new
                      password before accessing the PMO Portal.
                    </span>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                  <div className="p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)]">
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">First Login</p>
                    <p className="font-semibold text-[var(--nu-text)] mt-0.5">{user?.isFirstLogin ? "Pending" : "Completed"}</p>
                  </div>
                  <div className="p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)]">
                    <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">Last Login</p>
                    <p className="font-semibold text-[var(--nu-text)] mt-0.5">{formatDateTime(user?.lastLoginAt)}</p>
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 3: System Role */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--nu-border)]">
                <Shield size={16} className="text-[var(--nu-accent)]" />
                <h3 className="text-[14px] font-bold text-[var(--nu-text)]">System Role</h3>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {SYSTEM_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleRoleChange(r)}
                    className={`p-2.5 rounded-[var(--nu-radius-md)] border text-left transition-all cursor-pointer ${
                      role === r
                        ? "border-[var(--nu-accent)] bg-[var(--nu-accent-soft)] text-[var(--nu-text)] ring-1 ring-[var(--nu-accent)]"
                        : "border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)]"
                    }`}
                  >
                    <p className="text-[12px] font-bold">{r}</p>
                    <p className="text-[10px] text-[var(--nu-text-muted)] mt-0.5 leading-tight">{ROLE_DESCRIPTIONS[r]}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* SECTION 4: Module Access */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--nu-border)]">
                <Settings2 size={16} className="text-[var(--nu-accent)]" />
                <h3 className="text-[14px] font-bold text-[var(--nu-text)]">Module Access</h3>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {MODULE_FIELDS.map(({ key, label }) => {
                  const isChecked = moduleAccess[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleToggleModule(key)}
                      className={`flex items-center justify-between p-2.5 rounded-[var(--nu-radius-md)] border text-left transition-all cursor-pointer ${
                        isChecked
                          ? "border-[var(--nu-accent)]/40 bg-[var(--nu-surface-alt)] text-[var(--nu-text)]"
                          : "border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text-muted)]"
                      }`}
                    >
                      <span className="text-[12px] font-medium">{label}</span>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                          isChecked ? "bg-[var(--nu-accent)] border-[var(--nu-accent)] text-white" : "border-[var(--nu-border)] bg-transparent"
                        }`}
                      >
                        {isChecked && <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-[#1E293B]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 5: Project Region Access */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--nu-border)]">
                <MapPin size={16} className="text-[var(--nu-accent)]" />
                <h3 className="text-[14px] font-bold text-[var(--nu-text)]">Project Region Access</h3>
              </div>
              <p className="text-[11px] text-[var(--nu-text-muted)] -mt-1.5">
                This user will only see projects belonging to the regions selected below.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {REGION_FIELDS.map(({ key, label }) => {
                  const isAssigned = projectRegionAccess[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleToggleRegion(key)}
                      className={`flex items-center justify-between p-2.5 rounded-[var(--nu-radius-md)] border text-left transition-all cursor-pointer ${
                        isAssigned
                          ? "border-[var(--nu-accent)]/40 bg-[var(--nu-surface-alt)] text-[var(--nu-text)]"
                          : "border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text-muted)]"
                      }`}
                    >
                      <span className="text-[12px] font-medium">{label}</span>
                      <span
                        className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors ${
                          isAssigned ? "bg-[var(--nu-accent)] border-[var(--nu-accent)] text-white" : "border-[var(--nu-border)] bg-transparent"
                        }`}
                      >
                        {isAssigned && <span className="text-[10px] font-bold">✓</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 6: Approval Rights */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--nu-border)]">
                <CheckSquare size={16} className="text-[var(--nu-accent)]" />
                <h3 className="text-[14px] font-bold text-[var(--nu-text)]">Approval Rights</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {APPROVAL_FIELDS.map(({ key, label }) => {
                  const isEnabled = approvalRights[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleToggleApproval(key)}
                      className={`flex items-center justify-between p-2.5 rounded-[var(--nu-radius-md)] border text-left transition-all cursor-pointer ${
                        isEnabled ? "border-emerald-500/40 bg-emerald-500/10 text-[var(--nu-text)]" : "border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text-muted)]"
                      }`}
                    >
                      <span className="text-[12px] font-medium">{label}</span>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                          isEnabled ? "bg-emerald-600 border-emerald-600 text-white" : "border-[var(--nu-border)] bg-transparent"
                        }`}
                      >
                        {isEnabled && <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-[#1E293B]" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* SECTION 7: Account Security */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--nu-border)]">
                <KeyRound size={16} className="text-[var(--nu-accent)]" />
                <h3 className="text-[14px] font-bold text-[var(--nu-text)]">Account Security</h3>
              </div>

              <div className="p-3.5 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] space-y-3">
                <Toggle
                  checked={forcePasswordChange}
                  onChange={setForcePasswordChange}
                  label="Force Password Change on First Login"
                />

                <div className="pt-3 border-t border-[var(--nu-border)]">
                  <Toggle checked={accountLocked} onChange={setAccountLocked} label="Account Lock" />
                </div>

                <div className="pt-3 border-t border-[var(--nu-border)]">
                  <Toggle checked={false} onChange={() => {}} disabled label="Two-Factor Authentication (Coming Soon)" />
                </div>

                <div className="pt-3 border-t border-[var(--nu-border)] flex items-center justify-between">
                  <span className="text-[12px] text-[var(--nu-text-secondary)]">Password Expiry</span>
                  <span className="text-[11.5px] font-semibold text-[var(--nu-text-muted)]">Not Enforced</span>
                </div>

                <div className="pt-3 border-t border-[var(--nu-border)] flex items-center justify-between">
                  <span className="text-[12px] text-[var(--nu-text-secondary)]">Last Password Reset</span>
                  <span className="text-[11.5px] font-semibold text-[var(--nu-text-muted)]">{formatDateTime(lastPasswordResetAt)}</span>
                </div>

                {mode === "edit" && user && (
                  <div className="pt-3 border-t border-[var(--nu-border)] flex items-center justify-between">
                    <span className="text-[11.5px] text-[var(--nu-text-muted)]">Manual Credential Reset</span>
                    <button
                      type="button"
                      onClick={() => onRequestResetPassword(user)}
                      className="px-2.5 py-1 rounded-[var(--nu-radius-md)] bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 text-[11.5px] font-bold border border-amber-500/30 transition-colors cursor-pointer"
                    >
                      Reset Password
                    </button>
                  </div>
                )}
              </div>
            </div>

            <button type="submit" className="hidden" />
          </form>

          {/* Sticky Footer */}
          <div className="px-6 py-3.5 border-t border-[var(--nu-border)] bg-[var(--nu-surface)] flex justify-end gap-2.5 shrink-0 shadow-[var(--nu-shadow-md)]">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" icon={<Save size={14} />} onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? "Saving..." : mode === "add" ? "Save User" : "Update User"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
