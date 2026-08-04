import { Eye, Pencil, KeyRound, UserCheck, UserX, Trash2, Users } from "lucide-react";
import type { User, UserProjectRegionAccess } from "../../../../types/UserModel";
import { Badge } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";

interface UserTableProps {
  users: User[];
  onView: (user: User) => void;
  onEdit: (user: User) => void;
  onResetPassword: (user: User) => void;
  onToggleStatus: (user: User) => void;
  onDelete: (user: User) => void;
}

const REGION_LABELS: Record<keyof UserProjectRegionAccess, string> = {
  india: "India",
  qatar: "Qatar",
  malaysia: "Malaysia",
  oman: "Oman",
  abuDhabi: "Abu Dhabi",
  fzi: "FZI",
  elixirQatar: "Elixir Qatar",
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const formatDate = (isoStr?: string | null): string => {
  if (!isoStr) return "Never";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return "Never";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getAssignedRegions = (regions: UserProjectRegionAccess): string[] =>
  (Object.keys(regions) as (keyof UserProjectRegionAccess)[]).filter((key) => regions[key]).map((key) => REGION_LABELS[key]);

export const UserTable = ({ users, onView, onEdit, onResetPassword, onToggleStatus, onDelete }: UserTableProps) => {
  return (
    <div className="flex-1 min-h-[460px] max-h-[calc(100vh-320px)] overflow-auto nu-scrollbar">
      {users.length === 0 ? (
        <EmptyState
          icon={<Users size={20} />}
          title="No users found"
          description="Try adjusting your search criteria or filter options."
        />
      ) : (
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--nu-surface-alt)] text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)] border-b border-[var(--nu-border)]">
              <th className="px-4 py-3 font-medium w-14 text-center">Profile</th>
              <th className="px-4 py-3 font-medium">Employee Name</th>
              <th className="px-4 py-3 font-medium">Employee ID</th>
              <th className="px-4 py-3 font-medium">Company Email</th>
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Designation</th>
              <th className="px-4 py-3 font-medium text-center">System Role</th>
              <th className="px-4 py-3 font-medium text-center">Status</th>
              <th className="px-4 py-3 font-medium">Project Region Access</th>
              <th className="px-4 py-3 font-medium">Last Login</th>
              <th className="px-4 py-3 font-medium text-center w-44">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => {
              const isActive = user.status === "Active";
              const regions = getAssignedRegions(user.projectRegionAccess);

              return (
                <tr
                  key={user.id}
                  className={`border-b border-[var(--nu-border)] last:border-none hover:bg-[var(--nu-accent-soft)] transition-colors ${
                    index % 2 === 1 ? "bg-[var(--nu-surface-alt)]" : "bg-[var(--nu-surface)]"
                  }`}
                >
                  {/* Profile Avatar */}
                  <td className="px-4 py-3 text-center">
                    <div className="w-8 h-8 rounded-full bg-[var(--nu-accent)]/15 text-[var(--nu-accent)] border border-[var(--nu-accent)]/30 flex items-center justify-center font-bold text-[11px] mx-auto shrink-0 shadow-xs">
                      {getInitials(user.employeeName)}
                    </div>
                  </td>

                  {/* Employee Name */}
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--nu-text)] truncate">{user.employeeName}</p>
                      <p className="text-[10.5px] text-[var(--nu-text-muted)] truncate">{user.designation}</p>
                    </div>
                  </td>

                  {/* Employee ID */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-[12px] font-medium text-[var(--nu-text-secondary)]">{user.employeeId}</span>
                  </td>

                  {/* Company Email */}
                  <td className="px-4 py-3 max-w-[180px]">
                    <span className="text-[12px] text-[var(--nu-text-secondary)] truncate block" title={user.email}>
                      {user.email}
                    </span>
                  </td>

                  {/* Department */}
                  <td className="px-4 py-3 text-[12.5px] text-[var(--nu-text-secondary)]">{user.department}</td>

                  {/* Designation */}
                  <td className="px-4 py-3 text-[12.5px] text-[var(--nu-text-secondary)]">{user.designation}</td>

                  {/* System Role */}
                  <td className="px-4 py-3 text-center">
                    <Badge tone="accent" className="font-semibold">
                      {user.role}
                    </Badge>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    <Badge tone={isActive ? "success" : "danger"} dot>
                      {user.status}
                    </Badge>
                  </td>

                  {/* Project Region Access */}
                  <td className="px-4 py-3 max-w-[160px]">
                    {regions.length === 0 ? (
                      <span className="text-[11px] text-[var(--nu-text-muted)]">None</span>
                    ) : (
                      <span className="text-[11px] text-[var(--nu-text-secondary)] truncate block" title={regions.join(", ")}>
                        {regions.length > 2 ? `${regions.slice(0, 2).join(", ")} +${regions.length - 2}` : regions.join(", ")}
                      </span>
                    )}
                  </td>

                  {/* Last Login */}
                  <td className="px-4 py-3 text-[11.5px] text-[var(--nu-text-muted)] whitespace-nowrap">
                    {formatDate(user.lastLoginAt)}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {/* View */}
                      <button
                        type="button"
                        title="View Details"
                        onClick={() => onView(user)}
                        className="w-7 h-7 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-accent-soft)] hover:text-[var(--nu-accent)] border border-[var(--nu-border)] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Eye size={13} />
                      </button>

                      {/* Edit */}
                      <button
                        type="button"
                        title="Edit User"
                        onClick={() => onEdit(user)}
                        className="w-7 h-7 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-accent-soft)] hover:text-[var(--nu-accent)] border border-[var(--nu-border)] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Pencil size={13} />
                      </button>

                      {/* Reset Password */}
                      <button
                        type="button"
                        title="Reset Password"
                        onClick={() => onResetPassword(user)}
                        className="w-7 h-7 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-amber-500/15 hover:text-amber-600 border border-[var(--nu-border)] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <KeyRound size={13} />
                      </button>

                      {/* Activate / Deactivate */}
                      <button
                        type="button"
                        title={isActive ? "Deactivate User" : "Activate User"}
                        onClick={() => onToggleStatus(user)}
                        className={`w-7 h-7 rounded-[var(--nu-radius-md)] border flex items-center justify-center transition-colors cursor-pointer ${
                          isActive
                            ? "bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-danger-soft)] hover:text-[var(--nu-danger)] border-[var(--nu-border)]"
                            : "bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-success-soft)] hover:text-[var(--nu-success)] border-[var(--nu-border)]"
                        }`}
                      >
                        {isActive ? <UserX size={13} /> : <UserCheck size={13} />}
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        title="Delete User"
                        onClick={() => onDelete(user)}
                        className="w-7 h-7 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-danger-soft)] hover:text-[var(--nu-danger)] border border-[var(--nu-border)] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
};
