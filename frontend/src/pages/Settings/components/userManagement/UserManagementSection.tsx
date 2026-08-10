import { useState, useMemo, useEffect } from "react";
import type { User, AccountStatus } from "../../../../types/UserModel";
import {
  getUsers,
  setUserStatus,
  deleteUser,
  addUserToLocalList,
  getUserLookups,
} from "../../../../services/userManagementService";
import type { UserLookups } from "../../../../services/userManagementService";
import { Card, CardHeader } from "../../../../components/ui/Card";
import { UserManagementHero } from "./UserManagementHero";
import { UserToolbar } from "./UserToolbar";
import { UserTable } from "./UserTable";
import { UserDrawer } from "./UserDrawer";
import { UserViewDrawer } from "./UserViewDrawer";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { Users } from "lucide-react";

interface FormDrawerState {
  isOpen: boolean;
  mode: "add" | "edit";
  user?: User;
}

export const UserManagementSection = () => {
  const [users, setUsers] = useState<User[]>(getUsers());
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");

  const [formDrawer, setFormDrawer] = useState<FormDrawerState>({ isOpen: false, mode: "add" });
  const [viewUser, setViewUser] = useState<User | undefined>(undefined);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | undefined>(undefined);
  const [deleteTargetUser, setDeleteTargetUser] = useState<User | undefined>(undefined);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Real role/module/region/approval ids the Add User form needs to submit
  // a valid POST /users payload — fetched once, on mount.
  const [lookups, setLookups] = useState<UserLookups | null>(null);

  useEffect(() => {
    const handleDataChange = () => setUsers(getUsers());
    window.addEventListener("pmo:data-changed", handleDataChange);
    return () => window.removeEventListener("pmo:data-changed", handleDataChange);
  }, []);

  useEffect(() => {
    getUserLookups()
      .then(setLookups)
      .catch((error) => console.error("Failed to load user lookups:", error));
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const stats = useMemo(() => {
    return {
      total: users.length,
      administrators: users.filter((u) => u.role === "Administrator").length,
      projectManagers: users.filter((u) => u.role === "Project Manager").length,
      active: users.filter((u) => u.status === "Active").length,
      inactive: users.filter((u) => u.status === "Inactive").length,
    };
  }, [users]);

  const departments = useMemo(() => {
    const set = new Set(users.map((u) => u.department).filter(Boolean));
    return Array.from(set).sort();
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const searchMatch =
        !q ||
        u.employeeName.toLowerCase().includes(q) ||
        u.employeeId.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.designation.toLowerCase().includes(q);

      const roleMatch = roleFilter === "All" || u.role === roleFilter;
      const statusMatch = statusFilter === "All" || u.status === statusFilter;
      const deptMatch = departmentFilter === "All" || u.department === departmentFilter;

      return searchMatch && roleMatch && statusMatch && deptMatch;
    });
  }, [users, search, roleFilter, statusFilter, departmentFilter]);

  const handleResetFilters = () => {
    setSearch("");
    setRoleFilter("All");
    setStatusFilter("All");
    setDepartmentFilter("All");
  };

  const handleToggleStatus = (targetUser: User) => {
    const nextStatus: AccountStatus = targetUser.status === "Active" ? "Inactive" : "Active";
    setUserStatus(targetUser.id, nextStatus);
    showToast(`${targetUser.employeeName} is now ${nextStatus}.`);
  };

  const handleConfirmDelete = () => {
    if (!deleteTargetUser) return;
    deleteUser(deleteTargetUser.id);
    showToast(`${deleteTargetUser.employeeName} has been removed.`);
    setDeleteTargetUser(undefined);
  };

  return (
    <div className="space-y-4 nu-fade-in">
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 px-4 py-2.5 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent)] text-white font-medium text-[12.5px] shadow-[var(--nu-shadow-lg)] transition-all">
          {toastMessage}
        </div>
      )}

      <UserManagementHero
        total={stats.total}
        administrators={stats.administrators}
        projectManagers={stats.projectManagers}
        active={stats.active}
        inactive={stats.inactive}
      />

      <Card padded={false} elevated>
        <CardHeader
          icon={<Users size={15} />}
          title="User Directory & Permissions"
          subtitle="Manage accounts, system roles, module permissions, project region access and approval rights."
        />

        <UserToolbar
          search={search}
          onSearchChange={setSearch}
          roleFilter={roleFilter}
          onRoleFilterChange={setRoleFilter}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          departmentFilter={departmentFilter}
          onDepartmentFilterChange={setDepartmentFilter}
          departments={departments}
          onReset={handleResetFilters}
          onAddUser={() => setFormDrawer({ isOpen: true, mode: "add" })}
        />

        <UserTable
          users={filteredUsers}
          onView={(user) => setViewUser(user)}
          onEdit={(user) => setFormDrawer({ isOpen: true, mode: "edit", user })}
          onResetPassword={(user) => setResetPasswordUser(user)}
          onToggleStatus={handleToggleStatus}
          onDelete={(user) => setDeleteTargetUser(user)}
        />
      </Card>

      <UserDrawer
        isOpen={formDrawer.isOpen}
        mode={formDrawer.mode}
        user={formDrawer.user}
        lookups={lookups}
        onClose={() => setFormDrawer({ isOpen: false, mode: "add" })}
        onSaved={(saved) => {
          // A real, backend-created user isn't in the mock store yet (there's
          // no GET /users listing endpoint in this phase) — inserting it here
          // is what makes it show up in the table immediately. Edit-mode saves
          // already went through the mock store directly, so nothing extra is
          // needed there.
          if (formDrawer.mode === "add") {
            addUserToLocalList(saved);
          }
          showToast(`${saved.employeeName} has been ${formDrawer.mode === "add" ? "added" : "updated"}.`);
        }}
        onRequestResetPassword={(user) => {
          setFormDrawer({ isOpen: false, mode: "add" });
          setResetPasswordUser(user);
        }}
        existingUsers={users}
      />

      <UserViewDrawer
        isOpen={!!viewUser}
        user={viewUser}
        onClose={() => setViewUser(undefined)}
        onEdit={(user) => {
          setViewUser(undefined);
          setFormDrawer({ isOpen: true, mode: "edit", user });
        }}
      />

      {resetPasswordUser && (
        <ResetPasswordDialog
          user={resetPasswordUser}
          onCancel={() => setResetPasswordUser(undefined)}
          onDone={() => {
            showToast(`Password reset for ${resetPasswordUser.employeeName}.`);
            setResetPasswordUser(undefined);
          }}
        />
      )}

      {deleteTargetUser && (
        <DeleteUserDialog
          user={deleteTargetUser}
          onCancel={() => setDeleteTargetUser(undefined)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
};
