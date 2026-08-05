import { Filter, RotateCcw } from "lucide-react";
import type { ReportFilterState } from "../useReportsData";
import { SearchableAutocomplete } from "./SearchableAutocomplete";

interface Props {
  filters: ReportFilterState;
  setFilters: (filters: ReportFilterState) => void;
  resetFilters: () => void;
  options: {
    departments: string[];
    clients: string[];
    projectTitles: string[];
    prNumbers: string[];
    categories: string[];
    statuses: string[];
    projectManagers: string[];
    regions: string[];
  };
}

export function ReportFilters({ filters, setFilters, resetFilters, options }: Props) {
  const updateField = (key: keyof ReportFilterState, value: any) => {
    setFilters({ ...filters, [key]: value });
  };

  const activeFilterCount = Object.entries(filters).filter(([k, v]) => {
    if (k === "dateRange") return Boolean(v.start || v.end);
    return v !== "ALL" && v !== "";
  }).length;

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-3 sm:p-3.5 rounded-xl space-y-2.5 shadow-xs">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-[var(--nu-accent)]" />
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Universal Report Filters
          </h3>
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.2 rounded-full text-[9.5px] font-extrabold bg-[var(--nu-accent)] text-white">
              {activeFilterCount} Active
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={resetFilters}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[10.5px] font-bold text-[var(--nu-text-muted)] hover:text-[var(--nu-text)] hover:bg-[var(--nu-surface)] transition cursor-pointer"
        >
          <RotateCcw size={12} />
          <span>Reset Filters</span>
        </button>
      </div>

      {/* Structured Grid: Autocomplete Search Inputs for Client, Project, PR Number */}
      <div className="space-y-2 text-xs">
        {/* Row 1: Start Date, End Date, Client (Searchable Autocomplete), Department */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          <div>
            <label className="block text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--nu-text-muted)] mb-0.5">
              Start Date
            </label>
            <input
              type="date"
              value={filters.dateRange.start}
              onChange={(e) =>
                updateField("dateRange", { ...filters.dateRange, start: e.target.value })
              }
              className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-1.5 text-xs text-[var(--nu-text)] focus:outline-none focus:ring-1 focus:ring-[var(--nu-accent)]"
            />
          </div>

          <div>
            <label className="block text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--nu-text-muted)] mb-0.5">
              End Date
            </label>
            <input
              type="date"
              value={filters.dateRange.end}
              onChange={(e) =>
                updateField("dateRange", { ...filters.dateRange, end: e.target.value })
              }
              className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-1.5 text-xs text-[var(--nu-text)] focus:outline-none focus:ring-1 focus:ring-[var(--nu-accent)]"
            />
          </div>

          {/* Client — Searchable Autocomplete */}
          <SearchableAutocomplete
            label="Client"
            placeholder="Search Client..."
            value={filters.client}
            onChange={(val) => updateField("client", val)}
            options={options.clients}
          />

          {/* Department — Dropdown */}
          <div>
            <label className="block text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--nu-text-muted)] mb-0.5">
              Department
            </label>
            <select
              value={filters.department}
              onChange={(e) => updateField("department", e.target.value)}
              className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-1.5 text-xs text-[var(--nu-text)] focus:outline-none focus:ring-1 focus:ring-[var(--nu-accent)]"
            >
              <option value="ALL">All Departments</option>
              {options.departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Project (Searchable Autocomplete), Status, Manager, Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* Project — Searchable Autocomplete */}
          <SearchableAutocomplete
            label="Project"
            placeholder="Search Project..."
            value={filters.project}
            onChange={(val) => updateField("project", val)}
            options={options.projectTitles}
          />

          <div>
            <label className="block text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--nu-text-muted)] mb-0.5">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => updateField("status", e.target.value)}
              className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-1.5 text-xs text-[var(--nu-text)] focus:outline-none focus:ring-1 focus:ring-[var(--nu-accent)]"
            >
              <option value="ALL">All Statuses</option>
              {options.statuses.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--nu-text-muted)] mb-0.5">
              Project Manager
            </label>
            <select
              value={filters.projectManager}
              onChange={(e) => updateField("projectManager", e.target.value)}
              className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-1.5 text-xs text-[var(--nu-text)] focus:outline-none focus:ring-1 focus:ring-[var(--nu-accent)]"
            >
              <option value="ALL">All Managers</option>
              {options.projectManagers.map((pm) => (
                <option key={pm} value={pm}>
                  {pm}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--nu-text-muted)] mb-0.5">
              Category
            </label>
            <select
              value={filters.category}
              onChange={(e) => updateField("category", e.target.value)}
              className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-1.5 text-xs text-[var(--nu-text)] focus:outline-none focus:ring-1 focus:ring-[var(--nu-accent)]"
            >
              <option value="ALL">All Categories</option>
              {options.categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: Region, PR Number (Searchable Autocomplete) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
          <div>
            <label className="block text-[9.5px] font-extrabold uppercase tracking-wider text-[var(--nu-text-muted)] mb-0.5">
              Country / Region
            </label>
            <select
              value={filters.countryRegion}
              onChange={(e) => updateField("countryRegion", e.target.value)}
              className="w-full bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-lg p-1.5 text-xs text-[var(--nu-text)] focus:outline-none focus:ring-1 focus:ring-[var(--nu-accent)]"
            >
              <option value="ALL">All Regions</option>
              {options.regions.map((reg) => (
                <option key={reg} value={reg}>
                  {reg}
                </option>
              ))}
            </select>
          </div>

          {/* PR Number — Searchable Autocomplete */}
          <SearchableAutocomplete
            label="PR Number"
            placeholder="Search PR Number..."
            value={filters.prNo}
            onChange={(val) => updateField("prNo", val)}
            options={options.prNumbers}
          />
        </div>
      </div>
    </div>
  );
}
