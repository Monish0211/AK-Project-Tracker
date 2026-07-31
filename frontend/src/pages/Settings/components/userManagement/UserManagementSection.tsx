import { useState, useMemo, useEffect } from "react";
import type { User, AccountStatus } from "../../../../types/UserModel";
import {
  getUsers,
  updateUserStatus,
  resetUserPassword as triggerResetPassword,
} from "../../../../services/userManagementService";
import { Card, CardHeader } from "../../../../components/ui/Card";
import { UserManagementHero } from "./UserManagementHero";
import { UserToolbar } from "./UserToolbar";
import { UserTable } from "./UserTable";
import { UserDrawer } from "./UserDrawer";
import { Users } from "lucide-react";

interface DrawerState {
  isOpen: boolean;
  mode: "add" | "edit" | "view";
  user?: User;
}

export const UserManagementSection = () => {
  const [users, setUsers] = useState<User[]>(getUsers());
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");

  const [drawerState, setDrawerState] = useState<DrawerState>({
    isOpen: false,
    mode: "add",
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync users when localStorage / pmo:data-changed triggers
  useEffect(() => {
    const handleDataChange = () => {
      setUsers(getUsers());
    };
    window.addEventListener("pmo:data-changed", handleDataChange);
    return () => {
      window.removeEventListener("pmo:data-changed", handleDataChange);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // KPI Calculations
  const stats = useMemo(() => {
    return {
      total: users.length,
      managers: users.filter((u) => u.role === "Manager").length,
      employees: users.filter((u) => u.role === "Employee").length,
      active: users.filter((u) => u.status === "Active").length,
      inactive: users.filter((u) => u.status === "Inactive").length,
    };
  }, [users]);

  // Unique departments for filter
  const departments = useMemo(() => {
    const set = new Set(users.map((u) => u.department).filter(Boolean));
    return Array.from(set).sort();
  }, [users]);

  // Managers list for Reporting Manager select
  const managersList = useMemo(() => {
    const mgrs = users.filter((u) => u.role === "Manager").map((u) => u.employeeName);
    if (mgrs.length === 0) return ["Rajesh Sharma"];
    return mgrs;
  }, [users]);

  // Filtered Users
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
    updateUserStatus(targetUser.id, nextStatus);
    showToast(`User ${targetUser.employeeName} status updated to ${nextStatus}.`);
  };

  const handleResetPassword = (targetUser: User) => {
    triggerResetPassword(targetUser.id);
    showToast(`Password reset triggered for ${targetUser.employeeName}. Force change enabled.`);
  };

  return (
    <div className="space-y-4 nu-fade-in">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 px-4 py-2.5 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent)] text-white font-medium text-[12.5px] shadow-[var(--nu-shadow-lg)] transition-all animate-bounce">
          {toastMessage}
        </div>
      )}

      {/* Summary KPI Cards */}
      <UserManagementHero
        total={stats.total}
        managers={stats.managers}
        employees={stats.employees}
        active={stats.active}
        inactive={stats.inactive}
      />

      {/* Main Users Card */}
      <Card padded={false} elevated>
        <CardHeader
          icon={<Users size={15} />}
          title="User Directory & Permissions"
          subtitle="Manage accounts, module permissions, project assignments and approval rights."
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
          onAddUser={() => setDrawerState({ isOpen: true, mode: "add" })}
        />

        <UserTable
          users={filteredUsers}
          onView={(user) => setDrawerState({ isOpen: true, mode: "view", user })}
          onEdit={(user) => setDrawerState({ isOpen: true, mode: "edit", user })}
          onResetPassword={handleResetPassword}
          onToggleStatus={handleToggleStatus}
        />
      </Card>

      {/* Slide-over User Form Drawer */}
      <UserDrawer
        isOpen={drawerState.isOpen}
        mode={drawerState.mode}
        user={drawerState.user}
        onClose={() => setDrawerState({ isOpen: false, mode: "add" })}
        managersList={managersList}
      />
    </div>
  );
};
