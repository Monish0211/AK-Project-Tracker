import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { getTotalNonManhourCost } from "../../../services/expenseService";
import { ReportExportButtons } from "../Shared/ReportExportButtons";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

export function ProfitTable({ projects }: Props) {
  const [search, setSearch] = useState("");

  const tableData = useMemo(() => {
    return projects.map((p) => {
      const woValue = p.workOrderValueINR ?? p.workOrderValue ?? 0;
      const nonManhour = getTotalNonManhourCost(p.nonManhourExpenses || []);
      const manhour = (p.resources || []).reduce((acc: number, r: any) => acc + (r.manhourCost || 0), 0);
      const totalExpenses = nonManhour + manhour;
      const profit = woValue - totalExpenses;
      const marginPct = woValue === 0 ? 0 : (profit / woValue) * 100;

      return {
        id: p.id,
        prNo: p.prNo || "-",
        client: p.client || "-",
        projectTitle: p.projectTitle || "-",
        department: p.department || "-",
        woValue,
        manhour,
        nonManhour,
        totalExpenses,
        profit,
        marginPct,
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
        r.department.toLowerCase().includes(term)
    );
  }, [tableData, search]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-2xl space-y-3 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--nu-border)] pb-3">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Contract Profitability & Margin Ledger
          </h3>
          <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">
            Full audit of contract work order values, manhour cost, non-manhour expenses, net profit, and profit margin %.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-2.5 text-[var(--nu-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PR, Client..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
            />
          </div>

          <ReportExportButtons data={filtered} filename="Contract_Profitability_Ledger" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No Profitability Records" description="No contracts match your search query." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)] font-extrabold text-[var(--nu-text-muted)] uppercase tracking-wider">
                <th className="p-2.5">PR No</th>
                <th className="p-2.5">Client</th>
                <th className="p-2.5">Project Title</th>
                <th className="p-2.5">Department</th>
                <th className="p-2.5 text-right">WO Value</th>
                <th className="p-2.5 text-right">Manhour Cost</th>
                <th className="p-2.5 text-right">Non-MH Cost</th>
                <th className="p-2.5 text-right">Total Expenses</th>
                <th className="p-2.5 text-right">Net Profit</th>
                <th className="p-2.5 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)]">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--nu-surface-alt)]/50 transition">
                  <td className="p-2.5 font-bold font-mono text-[var(--nu-accent)]">{row.prNo}</td>
                  <td className="p-2.5 font-semibold text-[var(--nu-text)] max-w-[130px] truncate">{row.client}</td>
                  <td className="p-2.5 font-medium text-[var(--nu-text)] max-w-[180px] truncate">{row.projectTitle}</td>
                  <td className="p-2.5 text-[var(--nu-text-muted)]">{row.department}</td>
                  <td className="p-2.5 text-right font-mono font-bold text-blue-600 dark:text-blue-400">{formatBusinessINR(row.woValue)}</td>
                  <td className="p-2.5 text-right font-mono text-[var(--nu-text-muted)]">{formatBusinessINR(row.manhour)}</td>
                  <td className="p-2.5 text-right font-mono text-[var(--nu-text-muted)]">{formatBusinessINR(row.nonManhour)}</td>
                  <td className="p-2.5 text-right font-mono text-rose-600 dark:text-rose-400">{formatBusinessINR(row.totalExpenses)}</td>
                  <td className={`p-2.5 text-right font-mono font-extrabold ${row.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                    {formatBusinessINR(row.profit)}
                  </td>
                  <td className="p-2.5 text-right font-mono font-extrabold">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] ${
                        row.marginPct >= 20
                          ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                          : row.marginPct >= 0
                          ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                          : "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
                      }`}
                    >
                      {row.marginPct.toFixed(1)}%
                    </span>
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
