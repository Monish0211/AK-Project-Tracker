import { Search, Plus, RotateCcw } from "lucide-react";
import { Button } from "../../../../components/ui/Button";

interface UserToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  roleFilter: string;
  onRoleFilterChange: (role: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  departmentFilter: string;
  onDepartmentFilterChange: (dept: string) => void;
  departments: string[];
  onReset: () => void;
  onAddUser: () => void;
}

const controlClass =
  "h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 focus:border-[var(--nu-accent)] transition-shadow px-2.5";

export const UserToolbar = ({
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
  departmentFilter,
  onDepartmentFilterChange,
  departments,
  onReset,
  onAddUser,
}: UserToolbarProps) => {
  const hasActiveFilters =
    search.trim() !== "" || roleFilter !== "All" || statusFilter !== "All" || departmentFilter !== "All";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[var(--nu-border)] bg-[var(--nu-surface)]">
      {/* Search & Filters Group */}
      <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nu-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search employee name, ID or email..."
            className={`${controlClass} w-full pl-8 pr-3`}
          />
        </div>

        {/* Role Filter */}
        <select
          value={roleFilter}
          onChange={(e) => onRoleFilterChange(e.target.value)}
          className={`${controlClass} shrink-0 cursor-pointer`}
          title="Filter by Role"
        >
          <option value="All">All Roles</option>
          <option value="Manager">Manager</option>
          <option value="Employee">Employee</option>
        </select>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className={`${controlClass} shrink-0 cursor-pointer`}
          title="Filter by Status"
        >
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>

        {/* Department Filter */}
        <select
          value={departmentFilter}
          onChange={(e) => onDepartmentFilterChange(e.target.value)}
          className={`${controlClass} shrink-0 cursor-pointer max-w-[180px] truncate`}
          title="Filter by Department"
        >
          <option value="All">All Departments</option>
          {departments.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </select>

        {/* Reset Filters */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--nu-radius-md)] text-[11.5px] font-medium text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] transition-colors"
          >
            <RotateCcw size={12} />
            Reset
          </button>
        )}
      </div>

      {/* Add User Action Button */}
      <Button
        variant="primary"
        size="sm"
        icon={<Plus size={14} />}
        onClick={onAddUser}
        className="shrink-0 shadow-sm font-semibold"
      >
        Add User
      </Button>
    </div>
  );
};
