import { useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

export function CollectionTrend({ projects }: Props) {
  const collectionTrendData = useMemo(() => {
    const monthMap: Record<string, { month: string; collection: number }> = {};

    projects.forEach((p) => {
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      items.forEach((item: any) => {
        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          if (line.status === "Paid" && line.invoiceDate) {
            const mKey = line.invoiceDate.slice(0, 7);
            if (!monthMap[mKey]) {
              const d = new Date(line.invoiceDate);
              const mLabel = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
              monthMap[mKey] = { month: mLabel, collection: 0 };
            }
            monthMap[mKey].collection += line.invoiceAmountINR || 0;
          }
        });
      });
    });

    const sortedKeys = Object.keys(monthMap).sort();
    return sortedKeys.map((k) => monthMap[k]);
  }, [projects]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Realized Cash Collection Trend
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">Realized Cashflow</span>
      </div>

      {collectionTrendData.length === 0 ? (
        <EmptyState title="No Payments Recorded" description="No Paid invoice lines with an invoice date found for the selected filter parameters." />
      ) : (
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={collectionTrendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCol" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(val: any) => [`₹ ${formatBusinessINR(Number(val))}`, "Collected"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="collection" name="Cash Realized" stroke="#10b981" fillOpacity={1} fill="url(#colorCol)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
