import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { ReportExportButtons } from "../Shared/ReportExportButtons";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

export function CommercialTable({ projects }: Props) {
  const [search, setSearch] = useState("");

  const commercialRows = useMemo(() => {
    return projects.map((p) => {
      const woVal = p.workOrderValueINR ?? p.workOrderValue ?? 0;
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      let raised = 0;
      items.forEach((item: any) => {
        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          if (line.status !== "Cancelled") raised += line.invoiceAmountINR || 0;
        });
      });

      const balanceBilling = Math.max(0, woVal - raised);
      const completionPct = woVal > 0 ? (raised / woVal) * 100 : 0;

      return {
        id: p.id,
        prNo: p.prNo || "-",
        client: p.client || "-",
        projectTitle: p.projectTitle || "-",
        category: p.prCategory || "-",
        region: p.domesticForeign || "Domestic",
        paymentTerms: p.paymentTerms || "Net 30 Days",
        woVal,
        raised,
        balanceBilling,
        completionPct,
      };
    });
  }, [projects]);

  const filtered = useMemo(() => {
    if (!search.trim()) return commercialRows;
    const term = search.toLowerCase();
    return commercialRows.filter(
      (r) =>
        r.prNo.toLowerCase().includes(term) ||
        r.client.toLowerCase().includes(term) ||
        r.category.toLowerCase().includes(term)
    );
  }, [commercialRows, search]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-2xl space-y-3 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--nu-border)] pb-3">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Commercial Master & Contract Milestone Ledger
          </h3>
          <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">
            Commercial audit of Work Order terms, PR category, payment terms, unbilled contract balance, and completion %.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-2.5 text-[var(--nu-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Category, PR, Client..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
            />
          </div>

          <ReportExportButtons data={filtered} filename="Commercial_Master_Ledger" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No Commercial Records" description="No contracts match your search parameters." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)] font-extrabold text-[var(--nu-text-muted)] uppercase tracking-wider">
                <th className="p-2.5">PR No</th>
                <th className="p-2.5">Client</th>
                <th className="p-2.5">PR Category</th>
                <th className="p-2.5">Payment Terms</th>
                <th className="p-2.5 text-center">Region</th>
                <th className="p-2.5 text-right">WO Contract Value</th>
                <th className="p-2.5 text-right">Invoiced Revenue</th>
                <th className="p-2.5 text-right">Balance to Bill</th>
                <th className="p-2.5 text-right">Commercial Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)]">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--nu-surface-alt)]/50 transition">
                  <td className="p-2.5 font-bold font-mono text-[var(--nu-accent)]">{row.prNo}</td>
                  <td className="p-2.5 font-semibold text-[var(--nu-text)] max-w-[130px] truncate">{row.client}</td>
                  <td className="p-2.5 font-medium text-[var(--nu-text)]">{row.category}</td>
                  <td className="p-2.5 text-[var(--nu-text-muted)]">{row.paymentTerms}</td>
                  <td className="p-2.5 text-center font-extrabold text-[var(--nu-text-muted)]">{row.region}</td>
                  <td className="p-2.5 text-right font-mono font-bold">₹{formatBusinessINR(row.woVal)}</td>
                  <td className="p-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    ₹{formatBusinessINR(row.raised)}
                  </td>
                  <td className="p-2.5 text-right font-mono text-amber-600 dark:text-amber-400 font-bold">
                    ₹{formatBusinessINR(row.balanceBilling)}
                  </td>
                  <td className="p-2.5 text-right font-mono font-extrabold">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] ${
                        row.completionPct >= 100
                          ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                          : row.completionPct >= 50
                          ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                          : "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                      }`}
                    >
                      {row.completionPct.toFixed(1)}%
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
