import { Search, RotateCcw, Filter } from "lucide-react";
import type { AuditFilterOptions } from "../../../../types/AuditLog";

interface Props {
  filters: AuditFilterOptions;
  onChange: (newFilters: AuditFilterOptions) => void;
  onReset: () => void;
  uniqueUsers: { name: string; email: string }[];
  eventTypes: string[];
}

export function AuditFilterBar({
  filters,
  onChange,
  onReset,
  uniqueUsers,
  eventTypes,
}: Props) {
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...filters, searchQuery: e.target.value });
  };

  const handleSelect = (key: keyof AuditFilterOptions, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const hasActiveFilters =
    filters.searchQuery !== "" ||
    filters.eventType !== "all" ||
    filters.userEmail !== "all" ||
    filters.module !== "all" ||
    filters.dateRange !== "all" ||
    filters.status !== "all";

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)] space-y-3">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--nu-border)] pb-2.5">
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-[var(--nu-accent)]" />
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Audit Filters & Search
          </h4>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        {/* Search Input */}
        <div className="lg:col-span-2 relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nu-text-muted)]" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={handleSearch}
            placeholder="Search by Employee, Email, ID, PR#, Module..."
            className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] pl-9 pr-3 py-2 text-[12px] text-[var(--nu-text)] placeholder-[var(--nu-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)] transition"
          />
        </div>

        {/* Event Type Filter */}
        <div>
          <select
            value={filters.eventType}
            onChange={(e) => handleSelect("eventType", e.target.value)}
            className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-3 py-2 text-[12px] text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)] transition cursor-pointer"
          >
            <option value="all">All Event Types</option>
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        {/* User Filter */}
        <div>
          <select
            value={filters.userEmail}
            onChange={(e) => handleSelect("userEmail", e.target.value)}
            className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-3 py-2 text-[12px] text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)] transition cursor-pointer"
          >
            <option value="all">All Users</option>
            {uniqueUsers.map((u) => (
              <option key={u.email} value={u.email}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </div>

        {/* Module Filter */}
        <div>
          <select
            value={filters.module}
            onChange={(e) => handleSelect("module", e.target.value)}
            className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-3 py-2 text-[12px] text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)] transition cursor-pointer"
          >
            <option value="all">All Modules</option>
            <option value="Dashboard">Dashboard</option>
            <option value="Projects">Projects</option>
            <option value="Customer Master">Customer Master</option>
            <option value="Timesheets">Timesheets</option>
            <option value="Invoices">Invoices</option>
            <option value="Reports">Reports</option>
            <option value="Settings">Settings</option>
            <option value="User Management">User Management</option>
            <option value="Notifications">Notifications</option>
          </select>
        </div>

        {/* Date Range Filter */}
        <div>
          <select
            value={filters.dateRange}
            onChange={(e) => handleSelect("dateRange", e.target.value as any)}
            className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-3 py-2 text-[12px] text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)] transition cursor-pointer"
          >
            <option value="all">All Time</option>
            <option value="today">Today (04 Aug 2026)</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
          </select>
        </div>
      </div>
    </div>
  );
}
