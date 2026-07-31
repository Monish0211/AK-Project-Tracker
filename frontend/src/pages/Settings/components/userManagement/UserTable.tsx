import { Eye, Pencil, KeyRound, UserCheck, UserX } from "lucide-react";
import type { User } from "../../../../types/UserModel";
import { Badge } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { Users } from "lucide-react";

interface UserTableProps {
  users: User[];
  onView: (user: User) => void;
  onEdit: (user: User) => void;
  onResetPassword: (user: User) => void;
  onToggleStatus: (user: User) => void;
}

const getInitials = (name: string): string => {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

const formatDate = (isoStr?: string): string => {
  if (!isoStr || isoStr === "Never") return "Never";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
};

export const UserTable = ({
  users,
  onView,
  onEdit,
  onResetPassword,
  onToggleStatus,
}: UserTableProps) => {
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
              <th className="px-4 py-3 font-medium">Department</th>
              <th className="px-4 py-3 font-medium">Designation</th>
              <th className="px-4 py-3 font-medium text-center">Role</th>
              <th className="px-4 py-3 font-medium text-center">Status</th>
              <th className="px-4 py-3 font-medium">Last Login</th>
              <th className="px-4 py-3 font-medium text-center w-36">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user, index) => {
              const isManager = user.role === "Manager";
              const isActive = user.status === "Active";

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

                  {/* Employee Name & Email */}
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--nu-text)] truncate">{user.employeeName}</p>
                      <p className="text-[11px] text-[var(--nu-text-muted)] truncate">{user.email}</p>
                    </div>
                  </td>

                  {/* Employee ID */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-[12px] font-medium text-[var(--nu-text-secondary)]">
                      {user.employeeId}
                    </span>
                  </td>

                  {/* Department */}
                  <td className="px-4 py-3 text-[12.5px] text-[var(--nu-text-secondary)]">
                    {user.department}
                  </td>

                  {/* Designation */}
                  <td className="px-4 py-3 text-[12.5px] text-[var(--nu-text-secondary)]">
                    {user.designation}
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3 text-center">
                    <Badge tone={isManager ? "accent" : "neutral"} className="font-semibold">
                      {user.role}
                    </Badge>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    <Badge tone={isActive ? "success" : "danger"} dot>
                      {user.status}
                    </Badge>
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
                        className="w-7 h-7 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-accent-soft)] hover:text-[var(--nu-accent)] border border-[var(--nu-border)] flex items-center justify-center transition-colors"
                      >
                        <Eye size={13} />
                      </button>

                      {/* Edit */}
                      <button
                        type="button"
                        title="Edit User"
                        onClick={() => onEdit(user)}
                        className="w-7 h-7 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-accent-soft)] hover:text-[var(--nu-accent)] border border-[var(--nu-border)] flex items-center justify-center transition-colors"
                      >
                        <Pencil size={13} />
                      </button>

                      {/* Reset Password */}
                      <button
                        type="button"
                        title="Reset Password"
                        onClick={() => onResetPassword(user)}
                        className="w-7 h-7 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-amber-500/15 hover:text-amber-600 border border-[var(--nu-border)] flex items-center justify-center transition-colors"
                      >
                        <KeyRound size={13} />
                      </button>

                      {/* Disable / Enable User */}
                      <button
                        type="button"
                        title={isActive ? "Disable User" : "Enable User"}
                        onClick={() => onToggleStatus(user)}
                        className={`w-7 h-7 rounded-[var(--nu-radius-md)] border flex items-center justify-center transition-colors ${
                          isActive
                            ? "bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-danger-soft)] hover:text-[var(--nu-danger)] border-[var(--nu-border)]"
                            : "bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] hover:bg-[var(--nu-success-soft)] hover:text-[var(--nu-success)] border-[var(--nu-border)]"
                        }`}
                      >
                        {isActive ? <UserX size={13} /> : <UserCheck size={13} />}
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
