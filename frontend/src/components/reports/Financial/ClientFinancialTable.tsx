import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { ReportExportButtons } from "../Shared/ReportExportButtons";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  customerList: any[];
}

export function ClientFinancialTable({ customerList }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return customerList;
    return customerList.filter((c) => c.client.toLowerCase().includes(search.toLowerCase()));
  }, [customerList, search]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-2xl space-y-3 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--nu-border)] pb-3">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Client Commercial & Financial Summary
          </h3>
          <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">
            Rollup of Work Order value, Raised Invoices, Payments Received, and Outstanding Receivables per client.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-2.5 text-[var(--nu-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Client..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
            />
          </div>

          <ReportExportButtons data={filtered} filename="Client_Financial_Summary" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No Client Financial Records" description="No clients match your filter." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)] font-extrabold text-[var(--nu-text-muted)] uppercase tracking-wider">
                <th className="p-2.5">Client Name</th>
                <th className="p-2.5 text-center">Projects</th>
                <th className="p-2.5 text-right">WO Value</th>
                <th className="p-2.5 text-right">Invoice Raised</th>
                <th className="p-2.5 text-right">Payment Received</th>
                <th className="p-2.5 text-right">Outstanding</th>
                <th className="p-2.5 text-right">Collection %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)]">
              {filtered.map((row) => {
                const colPct = row.raised > 0 ? (row.received / row.raised) * 100 : 0;
                return (
                  <tr key={row.client} className="hover:bg-[var(--nu-surface-alt)]/50 transition">
                    <td className="p-2.5 font-extrabold text-[var(--nu-text)]">{row.client}</td>
                    <td className="p-2.5 text-center font-mono font-bold">{row.projectCount}</td>
                    <td className="p-2.5 text-right font-mono font-bold">{formatBusinessINR(row.woValue)}</td>
                    <td className="p-2.5 text-right font-mono text-blue-600 dark:text-blue-400 font-bold">
                      {formatBusinessINR(row.raised)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {formatBusinessINR(row.received)}
                    </td>
                    <td className="p-2.5 text-right font-mono text-amber-600 dark:text-amber-400 font-bold">
                      {formatBusinessINR(row.outstanding)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-extrabold">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] ${
                          colPct >= 80
                            ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                            : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {colPct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
