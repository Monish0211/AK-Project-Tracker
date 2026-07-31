import { Plus, RotateCcw, Search } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import CustomerImportMenu from "./CustomerImportMenu";
import CustomerExportMenu from "./CustomerExportMenu";

export type StatusFilter = "All" | "Active" | "Inactive";
export type SortKey = "name-asc" | "name-desc" | "newest" | "oldest";

interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  sortKey: SortKey;
  onSortChange: (value: SortKey) => void;
  onUploadClick: () => void;
  onDownloadTemplate: () => void;
  onExport: (format: "xlsx" | "csv") => void;
  onReset: () => void;
  onAddCustomer: () => void;
}

const controlClass =
  "h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 focus:border-[var(--nu-accent)] transition-shadow";

const CustomerToolbar = ({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortKey,
  onSortChange,
  onUploadClick,
  onDownloadTemplate,
  onExport,
  onReset,
  onAddCustomer,
}: Props) => {
  return (
    <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-[var(--nu-border)]">
      <div className="relative flex-1 min-w-[220px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nu-text-muted)]" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search customer name, company or ID..."
          className={`${controlClass} w-full pl-8 pr-3`}
        />
      </div>

      <select
        value={statusFilter}
        onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
        className={`${controlClass} px-2.5 shrink-0`}
      >
        <option value="All">All Statuses</option>
        <option value="Active">Active</option>
        <option value="Inactive">Inactive</option>
      </select>

      <select
        value={sortKey}
        onChange={(e) => onSortChange(e.target.value as SortKey)}
        className={`${controlClass} px-2.5 shrink-0`}
      >
        <option value="newest">Newest First</option>
        <option value="oldest">Oldest First</option>
        <option value="name-asc">Name A-Z</option>
        <option value="name-desc">Name Z-A</option>
      </select>

      <div className="w-px h-6 bg-[var(--nu-border)] mx-0.5 shrink-0" />

      <CustomerImportMenu onUploadClick={onUploadClick} onDownloadTemplate={onDownloadTemplate} />
      <CustomerExportMenu onExport={onExport} />

      <Button variant="ghost" size="sm" icon={<RotateCcw size={13} />} onClick={onReset} className="h-9 shrink-0">
        Reset
      </Button>

      <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={onAddCustomer} className="h-9 shrink-0">
        Add Customer
      </Button>
    </div>
  );
};

export default CustomerToolbar;
