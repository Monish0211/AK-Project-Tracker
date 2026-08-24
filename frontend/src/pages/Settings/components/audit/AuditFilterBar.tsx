import { Search, RotateCcw, Filter } from "lucide-react";
import { EVENT_LABELS } from "../../../../services/authAuditLogService";
import type { AuditEventCategory } from "../../../../services/authAuditLogService";

export type DateRangeOption = "all" | "today" | "7days" | "30days";

export interface AuditFilterState {
  email: string;
  ipAddress: string;
  event: string; // "" = all
  eventCategory: AuditEventCategory | ""; // "" = all
  dateRange: DateRangeOption;
}

export const DEFAULT_AUDIT_FILTERS: AuditFilterState = {
  email: "",
  ipAddress: "",
  event: "",
  eventCategory: "",
  dateRange: "all",
};

interface Props {
  filters: AuditFilterState;
  onChange: (next: AuditFilterState) => void;
  onReset: () => void;
}

/**
 * Only filters the real AuthAuditLog API actually supports: free-text search
 * (matched against email OR IP address server-side — see
 * SecurityAuditSection.tsx), event type (populated from the same
 * EVENT_LABELS map the table uses, so every option is a real, currently-
 * emitted event), success/failure, and a date range. The previous version's
 * "Module" and "User" (name) dropdowns are gone — AuthAuditLog has no
 * module concept and no separate display-name field to filter by.
 */
export function AuditFilterBar({ filters, onChange, onReset }: Props) {
  const hasActiveFilters =
    filters.email !== "" ||
    filters.ipAddress !== "" ||
    filters.event !== "" ||
    filters.eventCategory !== "" ||
    filters.dateRange !== "all";

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nu-text-muted)]" />
          <input
            type="text"
            value={filters.email}
            onChange={(e) => onChange({ ...filters, email: e.target.value })}
            placeholder="Search by email..."
            className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] pl-9 pr-3 py-2 text-[12px] text-[var(--nu-text)] placeholder-[var(--nu-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)] transition"
          />
        </div>

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nu-text-muted)]" />
          <input
            type="text"
            value={filters.ipAddress}
            onChange={(e) => onChange({ ...filters, ipAddress: e.target.value })}
            placeholder="Search by IP address..."
            className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] pl-9 pr-3 py-2 text-[12px] text-[var(--nu-text)] placeholder-[var(--nu-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)] transition"
          />
        </div>

        <div>
          <select
            value={filters.event}
            onChange={(e) => onChange({ ...filters, event: e.target.value })}
            className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-3 py-2 text-[12px] text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)] transition cursor-pointer"
          >
            <option value="">All Event Types</option>
            {Object.entries(EVENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={filters.dateRange}
            onChange={(e) => onChange({ ...filters, dateRange: e.target.value as DateRangeOption })}
            className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] px-3 py-2 text-[12px] text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)] transition cursor-pointer"
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="7days">Last 7 Days</option>
            <option value="30days">Last 30 Days</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(["", "success", "failure"] as const).map((option) => (
          <button
            key={option || "all"}
            type="button"
            onClick={() => onChange({ ...filters, eventCategory: option })}
            className={`px-3 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
              filters.eventCategory === option
                ? "bg-[var(--nu-accent)] text-white border-[var(--nu-accent)]"
                : "bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)] border-[var(--nu-border)] hover:text-[var(--nu-text)]"
            }`}
          >
            {option === "" ? "All Outcomes" : option === "success" ? "Success" : "Failure"}
          </button>
        ))}
      </div>
    </div>
  );
}
