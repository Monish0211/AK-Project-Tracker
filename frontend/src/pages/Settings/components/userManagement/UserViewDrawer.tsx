import type { ReactNode } from "react";
import { X, User as UserIcon, Shield, CheckSquare, Settings2, KeyRound, MapPin, Pencil, Info } from "lucide-react";
import type { User, UserModuleAccess, UserProjectRegionAccess, UserApprovalRights } from "../../../../types/UserModel";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";

interface UserViewDrawerProps {
  isOpen: boolean;
  user?: User;
  onClose: () => void;
  onEdit: (user: User) => void;
}

const MODULE_FIELDS: { key: keyof UserModuleAccess; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "projects", label: "Projects" },
  { key: "customerMaster", label: "Customer Master" },
  { key: "timesheets", label: "Timesheets" },
  { key: "invoices", label: "Invoices" },
  { key: "reports", label: "Reports" },
  { key: "manpower", label: "Manpower" },
  { key: "documents", label: "Documents" },
  { key: "settings", label: "Settings" },
  { key: "notifications", label: "Notifications" },
  { key: "reminders", label: "Reminders" },
];

const REGION_FIELDS: { key: keyof UserProjectRegionAccess; label: string }[] = [
  { key: "india", label: "India" },
  { key: "qatar", label: "Qatar" },
  { key: "malaysia", label: "Malaysia" },
  { key: "oman", label: "Oman" },
  { key: "abuDhabi", label: "Abu Dhabi" },
  { key: "fzi", label: "FZI" },
  { key: "elixirQatar", label: "Elixir Qatar" },
];

const APPROVAL_FIELDS: { key: keyof UserApprovalRights; label: string }[] = [
  { key: "archiveProjects", label: "Archive Projects" },
  { key: "deleteProjectPermanently", label: "Delete Project Permanently" },
];

const formatDateTime = (iso?: string | null): string => {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">{label}</p>
    <p className="text-[12.5px] font-semibold text-[var(--nu-text)] mt-0.5 truncate">{value || "—"}</p>
  </div>
);

const SectionHeading = ({ icon, title }: { icon: ReactNode; title: string }) => (
  <div className="flex items-center gap-2 pb-2 border-b border-[var(--nu-border)]">
    {icon}
    <h3 className="text-[14px] font-bold text-[var(--nu-text)]">{title}</h3>
  </div>
);

export const UserViewDrawer = ({ isOpen, user, onClose, onEdit }: UserViewDrawerProps) => {
  if (!isOpen || !user) return null;

  const isActive = user.status === "Active";

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs transition-opacity duration-300" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
        <div className="w-screen max-w-md sm:max-w-lg bg-[var(--nu-surface)] border-l border-[var(--nu-border)] shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-full bg-[var(--nu-accent)]/15 text-[var(--nu-accent)] border border-[var(--nu-accent)]/30 flex items-center justify-center font-bold text-[13px] shrink-0 shadow-xs">
                {user.employeeName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="text-[15.5px] font-bold text-[var(--nu-text)] truncate">{user.employeeName}</h2>
                <p className="text-[11px] text-[var(--nu-text-muted)] font-mono">{user.employeeId}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-[var(--nu-radius-md)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface)] flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 nu-scrollbar">
            <div className="flex items-center gap-2">
              <Badge tone="accent" className="font-semibold">
                {user.role}
              </Badge>
              <Badge tone={isActive ? "success" : "danger"} dot>
                {user.status}
              </Badge>
              <Badge tone="neutral">{user.employeeType}</Badge>
            </div>

            {/* General Information */}
            <div className="space-y-3">
              <SectionHeading icon={<UserIcon size={16} className="text-[var(--nu-accent)]" />} title="General Information" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <InfoRow label="Company Email" value={user.email} />
                <InfoRow label="Phone Number" value={user.phone || "—"} />
                <InfoRow label="Department" value={user.department} />
                <InfoRow label="Designation" value={user.designation} />
                <InfoRow label="Reporting Manager" value={user.reportingManager || "—"} />
                <InfoRow label="Employee Type" value={user.employeeType} />
              </div>
            </div>

            {/* Login Information */}
            <div className="space-y-3 pt-2">
              <SectionHeading icon={<KeyRound size={16} className="text-[var(--nu-accent)]" />} title="Login Information" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <InfoRow label="First Login" value={user.isFirstLogin ? "Pending" : "Completed"} />
                <InfoRow label="Last Login" value={formatDateTime(user.lastLoginAt)} />
              </div>
              {user.isFirstLogin && (
                <div className="flex items-start gap-2 p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-info)]/10 border border-[var(--nu-info)]/30 text-[11.5px] leading-snug text-[var(--nu-text-secondary)]">
                  <Info size={14} className="text-[var(--nu-info)] shrink-0 mt-0.5" />
                  <span>This user has not yet completed their first login. A temporary password is active on this account.</span>
                </div>
              )}
            </div>

            {/* System Role */}
            <div className="space-y-3 pt-2">
              <SectionHeading icon={<Shield size={16} className="text-[var(--nu-accent)]" />} title="System Role" />
              <div className="p-3 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)]">
                <p className="text-[13px] font-bold text-[var(--nu-text)]">{user.role}</p>
              </div>
            </div>

            {/* Module Access */}
            <div className="space-y-3 pt-2">
              <SectionHeading icon={<Settings2 size={16} className="text-[var(--nu-accent)]" />} title="Module Access" />
              <div className="grid grid-cols-2 gap-2.5">
                {MODULE_FIELDS.map(({ key, label }) => {
                  const isChecked = user.moduleAccess[key];
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between p-2.5 rounded-[var(--nu-radius-md)] border ${
                        isChecked ? "border-[var(--nu-accent)]/40 bg-[var(--nu-surface-alt)] text-[var(--nu-text)]" : "border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text-muted)]"
                      }`}
                    >
                      <span className="text-[12px] font-medium">{label}</span>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isChecked ? "bg-[var(--nu-accent)] border-[var(--nu-accent)] text-white" : "border-[var(--nu-border)] bg-transparent"
                        }`}
                      >
                        {isChecked && <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-[#1E293B]" />}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Project Region Access */}
            <div className="space-y-3 pt-2">
              <SectionHeading icon={<MapPin size={16} className="text-[var(--nu-accent)]" />} title="Project Region Access" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {REGION_FIELDS.map(({ key, label }) => {
                  const isAssigned = user.projectRegionAccess[key];
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between p-2.5 rounded-[var(--nu-radius-md)] border ${
                        isAssigned ? "border-[var(--nu-accent)]/40 bg-[var(--nu-surface-alt)] text-[var(--nu-text)]" : "border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text-muted)]"
                      }`}
                    >
                      <span className="text-[12px] font-medium">{label}</span>
                      <span
                        className={`w-4 h-4 rounded-sm border flex items-center justify-center ${
                          isAssigned ? "bg-[var(--nu-accent)] border-[var(--nu-accent)] text-white" : "border-[var(--nu-border)] bg-transparent"
                        }`}
                      >
                        {isAssigned && <span className="text-[10px] font-bold">✓</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Approval Rights */}
            <div className="space-y-3 pt-2">
              <SectionHeading icon={<CheckSquare size={16} className="text-[var(--nu-accent)]" />} title="Approval Rights" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {APPROVAL_FIELDS.map(({ key, label }) => {
                  const isEnabled = user.approvalRights[key];
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between p-2.5 rounded-[var(--nu-radius-md)] border ${
                        isEnabled ? "border-emerald-500/40 bg-emerald-500/10 text-[var(--nu-text)]" : "border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text-muted)]"
                      }`}
                    >
                      <span className="text-[12px] font-medium">{label}</span>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isEnabled ? "bg-emerald-600 border-emerald-600 text-white" : "border-[var(--nu-border)] bg-transparent"
                        }`}
                      >
                        {isEnabled && <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-[#1E293B]" />}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Account Security */}
            <div className="space-y-3 pt-2">
              <SectionHeading icon={<KeyRound size={16} className="text-[var(--nu-accent)]" />} title="Account Security" />
              <div className="p-3.5 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] space-y-2.5 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--nu-text-secondary)]">Force Password Change on First Login</span>
                  <Badge tone={user.accountSecurity.forcePasswordChangeOnFirstLogin ? "success" : "neutral"}>
                    {user.accountSecurity.forcePasswordChangeOnFirstLogin ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-2.5 border-t border-[var(--nu-border)]">
                  <span className="text-[var(--nu-text-secondary)]">Account Lock</span>
                  <Badge tone={user.accountSecurity.accountLocked ? "danger" : "neutral"}>
                    {user.accountSecurity.accountLocked ? "Locked" : "Unlocked"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-2.5 border-t border-[var(--nu-border)]">
                  <span className="text-[var(--nu-text-secondary)]">Two-Factor Authentication</span>
                  <Badge tone="neutral">Coming Soon</Badge>
                </div>
                <div className="flex items-center justify-between pt-2.5 border-t border-[var(--nu-border)]">
                  <span className="text-[var(--nu-text-secondary)]">Password Expiry</span>
                  <span className="font-semibold text-[var(--nu-text-muted)]">Not Enforced</span>
                </div>
                <div className="flex items-center justify-between pt-2.5 border-t border-[var(--nu-border)]">
                  <span className="text-[var(--nu-text-secondary)]">Last Password Reset</span>
                  <span className="font-semibold text-[var(--nu-text-muted)]">{formatDateTime(user.accountSecurity.lastPasswordResetAt)}</span>
                </div>
              </div>
            </div>

            {/* Account Information (Audit) */}
            <div className="space-y-3 pt-2">
              <SectionHeading icon={<Info size={16} className="text-[var(--nu-accent)]" />} title="Account Information" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <InfoRow label="Created On" value={formatDateTime(user.createdAt)} />
                <InfoRow label="Created By" value={user.createdBy} />
                <InfoRow label="Last Modified" value={formatDateTime(user.lastModifiedAt)} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-3.5 border-t border-[var(--nu-border)] bg-[var(--nu-surface)] flex justify-end gap-2.5 shrink-0 shadow-[var(--nu-shadow-md)]">
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
            <Button variant="primary" size="sm" icon={<Pencil size={14} />} onClick={() => onEdit(user)}>
              Edit User
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
