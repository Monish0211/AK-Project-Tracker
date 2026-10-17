import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { ReportExportButtons } from "../Shared/ReportExportButtons";
import { buildRegistryRow } from "../../../utils/reportRegistryRows";
import { ProjectPdfButton } from "./ProjectPdfButton";

interface Props {
  projects: any[];
  /** The Reports PR No. filter ("ALL" when unset) — enables the header Export PDF button for exactly one project. */
  selectedPrNo?: string;
  /** false = the viewer has no Invoices module access: Raised/Received/Outstanding are "Not available" (blank in CSV/Excel). */
  invoiceDataAvailable?: boolean;
}

const NOT_AVAILABLE = "Not available";
const DASH = "—";

/** Missing values (null) always sort after real numbers, whatever the direction. */
function compareRows(valA: unknown, valB: unknown, asc: boolean): number {
  const missingA = valA === null || valA === undefined;
  const missingB = valB === null || valB === undefined;
  if (missingA || missingB) return missingA === missingB ? 0 : missingA ? 1 : -1;
  const a = typeof valA === "string" ? valA.toLowerCase() : valA;
  const b = typeof valB === "string" ? valB.toLowerCase() : valB;
  if ((a as number) < (b as number)) return asc ? -1 : 1;
  if ((a as number) > (b as number)) return asc ? 1 : -1;
  return 0;
}

export function ExecutiveSummaryTable({ projects, selectedPrNo = "ALL", invoiceDataAvailable = true }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("prNo");
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Same calculation as the Project Financial Report PDF — see buildRegistryRow().
  const tableData = useMemo(() => projects.map((p) => buildRegistryRow(p, invoiceDataAvailable)), [projects, invoiceDataAvailable]);

  // Search filter
  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return tableData;
    const term = searchTerm.toLowerCase();
    return tableData.filter(
      (r) =>
        r.prNo.toLowerCase().includes(term) ||
        r.client.toLowerCase().includes(term) ||
        r.projectTitle.toLowerCase().includes(term) ||
        r.department.toLowerCase().includes(term)
    );
  }, [tableData, searchTerm]);

  // Sort
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a: any, b: any) => compareRows(a[sortField], b[sortField], sortAsc));
  }, [filteredData, sortField, sortAsc]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  // Header Export PDF: only when the PR No. filter narrows the registry to exactly one project.
  const singleProject = selectedPrNo !== "ALL" && projects.length === 1 ? projects[0] : null;

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 sm:p-5 rounded-2xl space-y-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--nu-border)] pb-4">
        <div>
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Project Commercial Registry & Financial Performance
          </h4>
          <p className="text-[11px] text-[var(--nu-text-muted)] pt-0.5">
            Audit-ready project balance sheet with live work order values, invoicing, and margins.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nu-text-muted)]" />
            <input
              type="text"
              placeholder="Search contracts..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-8 pr-3 py-1.5 rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-xs text-[var(--nu-text)] placeholder-[var(--nu-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--nu-accent)] w-44 sm:w-56"
            />
          </div>

          <ReportExportButtons data={sortedData} filename="PMO_Executive_Summary_Report" />
          <ProjectPdfButton
            variant="button"
            projectId={singleProject?.id ?? null}
            prNo={singleProject?.prNo ?? ""}
            disabledReason="Select a PR No. in the filters to export a project PDF"
          />
        </div>
      </div>

      {paginatedData.length === 0 ? (
        <div className="py-12 text-center text-xs text-[var(--nu-text-muted)]">No matching projects found.</div>
      ) : (
        <div className="overflow-x-auto nu-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--nu-border)] text-[11px] font-extrabold uppercase text-[var(--nu-text-muted)] select-none">
                <th className="p-3.5 px-4 cursor-pointer" onClick={() => handleSort("prNo")}>
                  <div className="flex items-center gap-1">
                    <span>PR No</span>
                    {sortField === "prNo" && (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </div>
                </th>
                <th className="p-3.5 px-4 cursor-pointer" onClick={() => handleSort("client")}>
                  Client
                </th>
                <th className="p-3.5 px-4 cursor-pointer" onClick={() => handleSort("projectTitle")}>
                  Project Title
                </th>
                <th className="p-3.5 px-4 cursor-pointer text-right" onClick={() => handleSort("woValue")}>
                  WO Value
                </th>
                <th className="p-3.5 px-4 cursor-pointer text-right" onClick={() => handleSort("raised")}>
                  Raised
                </th>
                <th className="p-3.5 px-4 cursor-pointer text-right" onClick={() => handleSort("received")}>
                  Received
                </th>
                <th className="p-3.5 px-4 cursor-pointer text-right" onClick={() => handleSort("outstanding")}>
                  Outstanding
                </th>
                <th className="p-3.5 px-4 cursor-pointer text-right" onClick={() => handleSort("expenses")}>
                  Expenses
                </th>
                <th className="p-3.5 px-4 cursor-pointer text-right" onClick={() => handleSort("profit")}>
                  Profit
                </th>
                <th className="p-3.5 px-4 cursor-pointer text-right" onClick={() => handleSort("profitPct")}>
                  Profit %
                </th>
                <th className="p-3.5 px-4 text-center no-print">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)]">
              {paginatedData.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--nu-surface-alt)]/50 transition">
                  <td className="p-3.5 px-4 font-bold font-mono text-[var(--nu-accent)]">{row.prNo}</td>
                  <td className="p-3.5 px-4 font-semibold text-[var(--nu-text)] max-w-[140px] truncate">{row.client}</td>
                  <td className="p-3.5 px-4 font-medium text-[var(--nu-text)] max-w-[200px] truncate">{row.projectTitle}</td>
                  <td className="p-3.5 px-4 text-right font-mono font-bold">{formatBusinessINR(row.woValue)}</td>
                  {row.raised === null ? (
                    <td colSpan={3} className="p-3.5 px-4 text-center text-[11px] italic text-[var(--nu-text-muted)]" title="Your account has no invoice access">
                      {NOT_AVAILABLE}
                    </td>
                  ) : (
                    <>
                      <td className="p-3.5 px-4 text-right font-mono text-blue-600 dark:text-blue-400 font-bold">{formatBusinessINR(row.raised)}</td>
                      <td className="p-3.5 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">{formatBusinessINR(row.received ?? 0)}</td>
                      <td className="p-3.5 px-4 text-right font-mono text-amber-600 dark:text-amber-400 font-bold">{formatBusinessINR(row.outstanding ?? 0)}</td>
                    </>
                  )}
                  <td className="p-3.5 px-4 text-right font-mono text-rose-600 dark:text-rose-400">{formatBusinessINR(row.expenses)}</td>
                  <td className={`p-3.5 px-4 text-right font-mono font-bold ${row.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                    {formatBusinessINR(row.profit)}
                  </td>
                  <td className="p-3.5 px-4 text-right font-mono font-extrabold">
                    {row.profitPct === null ? (
                      <span className="text-[var(--nu-text-muted)]" title="Work Order Value is zero">
                        {DASH}
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${row.profitPct >= 20 ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : row.profitPct >= 0 ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300" : "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"}`}>
                        {row.profitPct.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 px-4 text-center no-print">
                    <ProjectPdfButton variant="icon" projectId={row.id} prNo={row.prNo === "-" ? "" : row.prNo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      <div className="flex items-center justify-between border-t border-[var(--nu-border)] pt-3.5 text-xs text-[var(--nu-text-muted)]">
        <span>
          Showing {Math.min(sortedData.length, (currentPage - 1) * pageSize + 1)} - {Math.min(sortedData.length, currentPage * pageSize)} of {sortedData.length} records
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-lg border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] disabled:opacity-40 cursor-pointer font-medium"
          >
            Prev
          </button>
          <span className="px-3 font-bold font-mono text-[var(--nu-text)]">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1.5 rounded-lg border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] disabled:opacity-40 cursor-pointer font-medium"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
