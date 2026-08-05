import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { ReportExportButtons } from "../Shared/ReportExportButtons";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

export function ProjectPerformanceTable({ projects }: Props) {
  const [search, setSearch] = useState("");

  const tableData = useMemo(() => {
    return projects.map((p) => {
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      let totalQty = 0;
      let billedQty = 0;
      items.forEach((item: any) => {
        totalQty += item.totalQuantity || 0;
        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          if (line.status !== "Cancelled") billedQty += line.quantityBilled || 0;
        });
      });
      const progressPct = totalQty > 0 ? (billedQty / totalQty) * 100 : 0;

      return {
        id: p.id,
        prNo: p.prNo || "-",
        client: p.client || "-",
        projectTitle: p.projectTitle || "-",
        department: p.department || "-",
        status: p.projectStatus || "Active",
        startDate: p.projectStartDate || "-",
        endDate: p.projectEndDate || "-",
        actualCompletionDate: p.actualCompletionDate || "-",
        pm: p.primaryProjectManager || p.projectManager || "-",
        progressPct,
      };
    });
  }, [projects]);

  const filtered = useMemo(() => {
    if (!search.trim()) return tableData;
    const term = search.toLowerCase();
    return tableData.filter(
      (r) =>
        r.prNo.toLowerCase().includes(term) ||
        r.client.toLowerCase().includes(term) ||
        r.projectTitle.toLowerCase().includes(term) ||
        r.pm.toLowerCase().includes(term)
    );
  }, [tableData, search]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-2xl space-y-3 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--nu-border)] pb-3">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Project Performance & Delivery Progress Table
          </h3>
          <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">
            Operational progress, start/end schedules, project managers, and quantity billing completion %.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-2.5 text-[var(--nu-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PR, PM, Project..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
            />
          </div>

          <ReportExportButtons data={filtered} filename="Project_Performance_Ledger" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No Performance Records" description="No projects match your filter parameters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)] font-extrabold text-[var(--nu-text-muted)] uppercase tracking-wider">
                <th className="p-2.5">PR No</th>
                <th className="p-2.5">Client</th>
                <th className="p-2.5">Project Title</th>
                <th className="p-2.5">Department</th>
                <th className="p-2.5">Project Manager</th>
                <th className="p-2.5">Start Date</th>
                <th className="p-2.5">End Date</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-right">Completion %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)]">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--nu-surface-alt)]/50 transition">
                  <td className="p-2.5 font-bold font-mono text-[var(--nu-accent)]">{row.prNo}</td>
                  <td className="p-2.5 font-semibold text-[var(--nu-text)] max-w-[130px] truncate">{row.client}</td>
                  <td className="p-2.5 font-medium text-[var(--nu-text)] max-w-[180px] truncate">{row.projectTitle}</td>
                  <td className="p-2.5 text-[var(--nu-text-muted)]">{row.department}</td>
                  <td className="p-2.5 text-[var(--nu-text)]">{row.pm}</td>
                  <td className="p-2.5 font-mono text-[var(--nu-text-muted)]">{row.startDate}</td>
                  <td className="p-2.5 font-mono text-[var(--nu-text-muted)]">
                    {row.actualCompletionDate !== "-" ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold" title="Actual Completion Date">
                        {row.actualCompletionDate}
                      </span>
                    ) : (
                      row.endDate
                    )}
                  </td>
                  <td className="p-2.5 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        row.status.toLowerCase().includes("completed")
                          ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                          : row.status.toLowerCase().includes("hold")
                          ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                          : row.status.toLowerCase().includes("cancelled")
                          ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
                          : "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-mono font-extrabold">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-16 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[var(--nu-accent)] h-full transition-all"
                          style={{ width: `${Math.min(100, row.progressPct)}%` }}
                        />
                      </div>
                      <span>{row.progressPct.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
