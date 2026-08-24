import { useState, useMemo, useEffect, useCallback } from "react";
import type { User, AccountStatus } from "../../../../types/UserModel";
import {
  getUsers,
  setUserStatus,
  deleteUser,
  getUserLookups,
} from "../../../../services/userManagementService";
import type { UserLookups } from "../../../../services/userManagementService";
import { ApiError } from "../../../../services/apiClient";
import { Card, CardHeader } from "../../../../components/ui/Card";
import { UserManagementHero } from "./UserManagementHero";
import { UserToolbar } from "./UserToolbar";
import { UserTable } from "./UserTable";
import { UserDrawer } from "./UserDrawer";
import { UserViewDrawer } from "./UserViewDrawer";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { Users } from "lucide-react";
import { usePmoToast } from "../../../../components/ui/usePmoToast";

interface FormDrawerState {
  isOpen: boolean;
  mode: "add" | "edit";
  user?: User;
}

export const UserManagementSection = () => {
  const { showToast } = usePmoToast();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");

  const [formDrawer, setFormDrawer] = useState<FormDrawerState>({ isOpen: false, mode: "add" });
  const [viewUser, setViewUser] = useState<User | undefined>(undefined);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | undefined>(undefined);
  const [deleteTargetUser, setDeleteTargetUser] = useState<User | undefined>(undefined);

  // Real role/module/region/approval ids the Add User form needs to submit
  // a valid POST /users payload — fetched once, on mount.
  const [lookups, setLookups] = useState<UserLookups | null>(null);

  const refreshUsers = useCallback(async () => {
    try {
      const fetched = await getUsers();
      setUsers(fetched);
    } catch (error) {
      console.error("Failed to load users:", error);
    }
  }, []);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  useEffect(() => {
    const handleDataChange = () => refreshUsers();
    window.addEventListener("pmo:data-changed", handleDataChange);
    return () => window.removeEventListener("pmo:data-changed", handleDataChange);
  }, [refreshUsers]);

  useEffect(() => {
    getUserLookups()
      .then(setLookups)
      .catch((error) => console.error("Failed to load user lookups:", error));
  }, []);

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
    showToast({ type: "success", message: `${targetUser.employeeName} is now ${nextStatus}.` });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetUser) return;
    const target = deleteTargetUser;
    try {
      await deleteUser(target.id);
      await refreshUsers();
      showToast({ type: "success", message: `${target.employeeName} has been removed.` });
    } catch (error) {
      showToast({
        type: "error",
        message: error instanceof ApiError ? error.message : "Failed to delete user. Please try again.",
      });
    } finally {
      setDeleteTargetUser(undefined);
    }
  };

  return (
    <div className="space-y-4 nu-fade-in">
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
          // Create and Edit are both real (POST /users, PATCH /users/:id) —
          // re-fetching from the backend is what makes the change appear
          // immediately, no page reload needed.
          refreshUsers();
          showToast({
            type: "success",
            message: `${saved.employeeName} has been ${formDrawer.mode === "add" ? "added" : "updated"}.`,
          });
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
            showToast({ type: "success", message: `Password reset for ${resetPasswordUser.employeeName}.` });
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
