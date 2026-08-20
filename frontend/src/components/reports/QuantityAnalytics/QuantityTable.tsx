import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { formatIndianNumber } from "../../../utils/quantityCalculations";
import { ReportExportButtons } from "../Shared/ReportExportButtons";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

export function QuantityTable({ projects }: Props) {
  const [search, setSearch] = useState("");

  const quantityRows = useMemo(() => {
    const list: any[] = [];

    projects.forEach((p) => {
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      items.forEach((item: any) => {
        let billed = 0;
        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          if (line.status !== "Cancelled") billed += line.quantityBilled || 0;
        });

        // InvoiceItem's real ordered-quantity field is `qty` (types/InvoiceItem.ts).
        const totalQty = item.qty || 0;
        const remaining = Math.max(0, totalQty - billed);
        const completionPct = totalQty > 0 ? (billed / totalQty) * 100 : 0;

        list.push({
          id: item.id || `${p.id}-${item.description}`,
          prNo: p.prNo || "-",
          client: p.client || "-",
          projectTitle: p.projectTitle || "-",
          activityName: item.description || "Engineering Activity",
          uom: item.uom || "NOS",
          orderedQty: totalQty,
          billedQty: billed,
          remainingQty: remaining,
          completionPct,
        });
      });
    });

    return list;
  }, [projects]);

  const filtered = useMemo(() => {
    if (!search.trim()) return quantityRows;
    const term = search.toLowerCase();
    return quantityRows.filter(
      (r) =>
        r.prNo.toLowerCase().includes(term) ||
        r.client.toLowerCase().includes(term) ||
        r.activityName.toLowerCase().includes(term)
    );
  }, [quantityRows, search]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-2xl space-y-3 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--nu-border)] pb-3">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Deliverable Quantity Tracking & Activity Ledger
          </h3>
          <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">
            Activity-level audit of contracted quantities, UOM, invoiced quantities, and remaining deliverable balances.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-2.5 text-[var(--nu-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Activity, PR, Client..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
            />
          </div>

          <ReportExportButtons data={filtered} filename="Deliverable_Quantity_Ledger" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No Quantity Items" description="No activity deliverables match your search criteria." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)] font-extrabold text-[var(--nu-text-muted)] uppercase tracking-wider">
                <th className="p-2.5">PR No</th>
                <th className="p-2.5">Client</th>
                <th className="p-2.5">Activity Particulars</th>
                <th className="p-2.5 text-center">UOM</th>
                <th className="p-2.5 text-center">Ordered Qty</th>
                <th className="p-2.5 text-center">Invoiced Qty</th>
                <th className="p-2.5 text-center">Remaining Qty</th>
                <th className="p-2.5 text-right">Completion %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)]">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--nu-surface-alt)]/50 transition">
                  <td className="p-2.5 font-bold font-mono text-[var(--nu-accent)]">{row.prNo}</td>
                  <td className="p-2.5 font-semibold text-[var(--nu-text)] max-w-[130px] truncate">{row.client}</td>
                  <td className="p-2.5 font-medium text-[var(--nu-text)] max-w-[200px] truncate">{row.activityName}</td>
                  <td className="p-2.5 text-center font-mono font-bold">{row.uom}</td>
                  <td className="p-2.5 text-center font-mono font-bold text-blue-600 dark:text-blue-400">{formatIndianNumber(row.orderedQty)}</td>
                  <td className="p-2.5 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatIndianNumber(row.billedQty)}</td>
                  <td className="p-2.5 text-center font-mono font-bold text-amber-600 dark:text-amber-400">{formatIndianNumber(row.remainingQty)}</td>
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
