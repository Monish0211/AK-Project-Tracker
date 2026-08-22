import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { getTotalNonManhourCost } from "../../../services/expenseService";
import { ReportExportButtons } from "../Shared/ReportExportButtons";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

export function ExpenseLedger({ projects }: Props) {
  const [search, setSearch] = useState("");

  const expenseRows = useMemo(() => {
    const list: any[] = [];

    projects.forEach((p) => {
      // Non-manhour expenses
      (p.nonManhourExpenses || []).forEach((e: any, idx: number) => {
        const cost = getTotalNonManhourCost([e]);
        list.push({
          id: `nm-${p.id}-${idx}`,
          prNo: p.prNo || "-",
          client: p.client || "-",
          projectTitle: p.projectTitle || "-",
          category: e.category || e.expenseCategory || "General Expense",
          description: e.description || e.item || "-",
          quantity: e.quantity || 1,
          unitCost: e.unitCost || cost,
          totalCost: cost,
          type: "Non-Manhour",
        });
      });

      // Manhour cost summary if present
      const manhour = (p.resources || []).reduce((acc: number, r: any) => acc + (r.manhourCost || 0), 0);
      if (manhour > 0) {
        list.push({
          id: `mh-${p.id}`,
          prNo: p.prNo || "-",
          client: p.client || "-",
          projectTitle: p.projectTitle || "-",
          category: "Manhour Cost",
          description: "Engineering Team Timesheet Cost",
          quantity: 1,
          unitCost: manhour,
          totalCost: manhour,
          type: "Manhour",
        });
      }
    });

    return list;
  }, [projects]);

  const filtered = useMemo(() => {
    if (!search.trim()) return expenseRows;
    const term = search.toLowerCase();
    return expenseRows.filter(
      (r) =>
        r.prNo.toLowerCase().includes(term) ||
        r.client.toLowerCase().includes(term) ||
        r.projectTitle.toLowerCase().includes(term) ||
        r.category.toLowerCase().includes(term) ||
        r.description.toLowerCase().includes(term)
    );
  }, [expenseRows, search]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-2xl space-y-3 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--nu-border)] pb-3">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Detailed Project Expense Ledger
          </h3>
          <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">
            Audit register of non-manhour project expenses and timesheet-backed engineering costs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-2.5 text-[var(--nu-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search expenses..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
            />
          </div>

          <ReportExportButtons data={filtered} filename="Project_Expense_Ledger" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No Expense Records" description="No expense items match your search filter." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)] font-extrabold text-[var(--nu-text-muted)] uppercase tracking-wider">
                <th className="p-2.5">PR No</th>
                <th className="p-2.5">Client</th>
                <th className="p-2.5">Category</th>
                <th className="p-2.5">Description</th>
                <th className="p-2.5 text-center">Type</th>
                <th className="p-2.5 text-center">Qty</th>
                <th className="p-2.5 text-right">Unit Cost</th>
                <th className="p-2.5 text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)]">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--nu-surface-alt)]/50 transition">
                  <td className="p-2.5 font-bold font-mono text-[var(--nu-accent)]">{row.prNo}</td>
                  <td className="p-2.5 font-semibold text-[var(--nu-text)] max-w-[130px] truncate">{row.client}</td>
                  <td className="p-2.5 font-extrabold text-[var(--nu-text)]">{row.category}</td>
                  <td className="p-2.5 font-medium text-[var(--nu-text-muted)] max-w-[180px] truncate">{row.description}</td>
                  <td className="p-2.5 text-center font-extrabold">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] ${
                        row.type === "Manhour"
                          ? "bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300"
                          : "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
                      }`}
                    >
                      {row.type}
                    </span>
                  </td>
                  <td className="p-2.5 text-center font-mono">{row.quantity}</td>
                  <td className="p-2.5 text-right font-mono text-[var(--nu-text-muted)]">{formatBusinessINR(row.unitCost)}</td>
                  <td className="p-2.5 text-right font-mono font-bold text-rose-600 dark:text-rose-400">
                    {formatBusinessINR(row.totalCost)}
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
