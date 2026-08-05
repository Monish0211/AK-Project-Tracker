import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { ReportExportButtons } from "../Shared/ReportExportButtons";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

export function InvoiceLedger({ projects }: Props) {
  const [search, setSearch] = useState("");

  const invoiceLines = useMemo(() => {
    const lines: any[] = [];
    projects.forEach((p) => {
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      items.forEach((item: any) => {
        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          lines.push({
            id: line.id,
            invoiceNo: line.invoiceNo,
            invoiceDate: line.invoiceDate || "-",
            prNo: p.prNo || "-",
            client: p.client || "-",
            projectTitle: p.projectTitle || "-",
            activityName: item.description || "-",
            quantityBilled: line.quantityBilled || 0,
            amountINR: line.invoiceAmountINR || 0,
            status: line.status || "Draft",
          });
        });
      });
    });
    return lines.sort((a, b) => b.invoiceNo.localeCompare(a.invoiceNo));
  }, [projects]);

  const filtered = useMemo(() => {
    if (!search.trim()) return invoiceLines;
    const term = search.toLowerCase();
    return invoiceLines.filter(
      (l) =>
        l.invoiceNo.toLowerCase().includes(term) ||
        l.prNo.toLowerCase().includes(term) ||
        l.client.toLowerCase().includes(term) ||
        l.activityName.toLowerCase().includes(term)
    );
  }, [invoiceLines, search]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-2xl space-y-3 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--nu-border)] pb-3">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Invoice Register & Transaction Ledger
          </h3>
          <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">
            Detailed list of all raised invoice cycles, quantities, activities, and settlement statuses.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-2.5 text-[var(--nu-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Invoice No, PR, Client..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
            />
          </div>

          <ReportExportButtons data={filtered} filename="Invoice_Transaction_Ledger" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No Invoice Transactions" description="No invoice lines match your search filter." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)] font-extrabold text-[var(--nu-text-muted)] uppercase tracking-wider">
                <th className="p-2.5">Invoice No</th>
                <th className="p-2.5">Invoice Date</th>
                <th className="p-2.5">PR No</th>
                <th className="p-2.5">Client</th>
                <th className="p-2.5">Activity Description</th>
                <th className="p-2.5 text-center">Billed Qty</th>
                <th className="p-2.5 text-right">Invoiced Amount</th>
                <th className="p-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)]">
              {filtered.map((row) => (
                <tr key={row.id} className="hover:bg-[var(--nu-surface-alt)]/50 transition">
                  <td className="p-2.5 font-extrabold font-mono text-[var(--nu-accent)]">{row.invoiceNo}</td>
                  <td className="p-2.5 font-mono text-[var(--nu-text-muted)]">{row.invoiceDate}</td>
                  <td className="p-2.5 font-mono font-semibold">{row.prNo}</td>
                  <td className="p-2.5 font-semibold text-[var(--nu-text)] max-w-[130px] truncate">{row.client}</td>
                  <td className="p-2.5 font-medium text-[var(--nu-text)] max-w-[180px] truncate">{row.activityName}</td>
                  <td className="p-2.5 text-center font-mono font-bold">{row.quantityBilled}</td>
                  <td className="p-2.5 text-right font-mono font-extrabold text-blue-600 dark:text-blue-400">
                    ₹{formatBusinessINR(row.amountINR)}
                  </td>
                  <td className="p-2.5 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        row.status === "Paid"
                          ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                          : row.status === "Raised" || row.status === "Submitted"
                          ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                          : row.status === "Cancelled"
                          ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {row.status}
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
