import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { ReportExportButtons } from "../Shared/ReportExportButtons";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

export function OverdueTable({ projects }: Props) {
  const [search, setSearch] = useState("");

  const pendingLines = useMemo(() => {
    const list: any[] = [];

    projects.forEach((p) => {
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      items.forEach((item: any) => {
        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          if (line.status === "Raised" || line.status === "Submitted" || line.status === "PartiallyPaid") {
            let ageDays = 0;
            if (line.invoiceDate) {
              ageDays = Math.floor((new Date().getTime() - new Date(line.invoiceDate).getTime()) / (1000 * 3600 * 24));
            }
            list.push({
              id: line.id,
              invoiceNo: line.invoiceNo,
              invoiceDate: line.invoiceDate || "-",
              status: line.status === "PartiallyPaid" ? "Partially Paid" : "Raised",
              statusCode: line.status,
              prNo: p.prNo || "-",
              client: p.client || "-",
              projectTitle: p.projectTitle || "-",
              amountINR: line.invoiceAmountINR || 0,
              ageDays: Math.max(0, ageDays),
            });
          }
        });
      });
    });

    return list.sort((a, b) => b.ageDays - a.ageDays);
  }, [projects]);

  const filtered = useMemo(() => {
    if (!search.trim()) return pendingLines;
    const term = search.toLowerCase();
    return pendingLines.filter(
      (l) =>
        l.invoiceNo.toLowerCase().includes(term) ||
        l.client.toLowerCase().includes(term) ||
        l.prNo.toLowerCase().includes(term) ||
        l.status.toLowerCase().includes(term)
    );
  }, [pendingLines, search]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-2xl space-y-3 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--nu-border)] pb-3">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Pending & Overdue Collections Register
          </h3>
          <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">
            Real-time aging breakdown of outstanding customer invoices.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-2.5 text-[var(--nu-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Invoice, Client..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
            />
          </div>

          <ReportExportButtons data={filtered} filename="Overdue_Collections_Register" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No Pending Collections" description="All raised invoices have been fully collected." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)] font-extrabold text-[var(--nu-text-muted)] uppercase tracking-wider">
                <th className="p-2.5">Invoice No</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5">Invoice Date</th>
                <th className="p-2.5">PR No</th>
                <th className="p-2.5">Client</th>
                <th className="p-2.5">Project Title</th>
                <th className="p-2.5 text-right">Outstanding Amount</th>
                <th className="p-2.5 text-center">Age (Days)</th>
                <th className="p-2.5 text-center">Risk Bucket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)]">
              {filtered.map((row) => {
                const bucket =
                  row.ageDays <= 30
                    ? "0-30 Days"
                    : row.ageDays <= 60
                    ? "31-60 Days"
                    : row.ageDays <= 90
                    ? "61-90 Days"
                    : "90+ Days";

                return (
                  <tr key={row.id} className="hover:bg-[var(--nu-surface-alt)]/50 transition">
                    <td className="p-2.5 font-bold font-mono text-[var(--nu-accent)]">{row.invoiceNo}</td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          row.statusCode === "PartiallyPaid"
                            ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                            : "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono text-[var(--nu-text-muted)]">{row.invoiceDate}</td>
                    <td className="p-2.5 font-mono font-semibold">{row.prNo}</td>
                    <td className="p-2.5 font-semibold text-[var(--nu-text)] max-w-[130px] truncate">{row.client}</td>
                    <td className="p-2.5 font-medium text-[var(--nu-text)] max-w-[180px] truncate">{row.projectTitle}</td>
                    <td className="p-2.5 text-right font-mono font-extrabold text-amber-600 dark:text-amber-400">
                      {formatBusinessINR(row.amountINR)}
                    </td>
                    <td className="p-2.5 text-center font-mono font-bold">{row.ageDays}</td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          bucket === "90+ Days"
                            ? "bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
                            : bucket === "61-90 Days"
                            ? "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                            : "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                        }`}
                      >
                        {bucket}
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
