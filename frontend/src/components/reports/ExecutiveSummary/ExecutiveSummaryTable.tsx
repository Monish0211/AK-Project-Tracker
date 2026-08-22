import { useState, useMemo } from "react";
import { Search, ChevronDown, ChevronUp } from "lucide-react";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { ReportExportButtons } from "../Shared/ReportExportButtons";
import { getTotalInvoiceRaised, getTotalPaymentReceived } from "../../../services/invoiceProgressService";

interface Props {
  projects: any[];
}

export function ExecutiveSummaryTable({ projects }: Props) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("prNo");
  const [sortAsc, setSortAsc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const tableData = useMemo(() => {
    return projects.map((p) => {
      const woVal = p.workOrderValueINR ?? p.workOrderValue ?? 0;
      // Delegates to the same canonical invoiceProgressService.ts functions
      // Dashboard/View Project use, rather than re-deriving the status rule
      // here a second time — never the legacy project.paymentReceivedINR field.
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      const raised = getTotalInvoiceRaised(items);
      const received = Math.min(getTotalPaymentReceived(items), raised);
      // Outstanding — Executive Summary's management-level KPI: Work Order
      // Value minus Payment Received. Deliberately NOT Invoice Raised
      // minus Payment Received (that's the Invoice module's own, separate
      // Outstanding concept, left unchanged in invoiceProgressService.ts),
      // and never the same as Balance to Invoice.
      const outstanding = Math.max(0, woVal - received);
      const nonManhour = (p.nonManhourExpenses || []).reduce((acc: number, e: any) => acc + (e.totalCost || e.amount || 0), 0);
      const manhour = (p.resources || []).reduce((acc: number, r: any) => acc + (r.manhourCost || 0), 0);
      const expenses = nonManhour + manhour;
      const profit = raised - expenses;
      const profitPct = raised > 0 ? (profit / raised) * 100 : 0;

      return {
        id: p.id,
        prNo: p.prNo || "-",
        client: p.client || "-",
        projectTitle: p.projectTitle || "-",
        department: p.department || "-",
        status: p.projectStatus || "Active",
        woValue: woVal,
        raised,
        received,
        outstanding,
        expenses,
        profit,
        profitPct,
      };
    });
  }, [projects]);

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
    return [...filteredData].sort((a: any, b: any) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortField, sortAsc]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

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
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)]">
              {paginatedData.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--nu-surface-alt)]/50 transition">
                  <td className="p-3.5 px-4 font-bold font-mono text-[var(--nu-accent)]">{row.prNo}</td>
                  <td className="p-3.5 px-4 font-semibold text-[var(--nu-text)] max-w-[140px] truncate">{row.client}</td>
                  <td className="p-3.5 px-4 font-medium text-[var(--nu-text)] max-w-[200px] truncate">{row.projectTitle}</td>
                  <td className="p-3.5 px-4 text-right font-mono font-bold">{formatBusinessINR(row.woValue)}</td>
                  <td className="p-3.5 px-4 text-right font-mono text-blue-600 dark:text-blue-400 font-bold">{formatBusinessINR(row.raised)}</td>
                  <td className="p-3.5 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">{formatBusinessINR(row.received)}</td>
                  <td className="p-3.5 px-4 text-right font-mono text-amber-600 dark:text-amber-400 font-bold">{formatBusinessINR(row.outstanding)}</td>
                  <td className="p-3.5 px-4 text-right font-mono text-rose-600 dark:text-rose-400">{formatBusinessINR(row.expenses)}</td>
                  <td className={`p-3.5 px-4 text-right font-mono font-bold ${row.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                    {formatBusinessINR(row.profit)}
                  </td>
                  <td className="p-3.5 px-4 text-right font-mono font-extrabold">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${row.profitPct >= 20 ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"}`}>
                      {row.profitPct.toFixed(1)}%
                    </span>
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
