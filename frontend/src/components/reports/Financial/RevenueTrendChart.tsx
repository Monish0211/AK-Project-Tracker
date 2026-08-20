import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

export function RevenueTrendChart({ projects }: Props) {
  const trendData = useMemo(() => {
    const monthMap: Record<string, { month: string; raised: number; received: number }> = {};

    projects.forEach((p) => {
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      items.forEach((item: any) => {
        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          if (line.status !== "Cancelled" && line.invoiceDate) {
            const mKey = line.invoiceDate.slice(0, 7); // YYYY-MM
            if (!monthMap[mKey]) {
              const d = new Date(line.invoiceDate);
              const mLabel = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
              monthMap[mKey] = { month: mLabel, raised: 0, received: 0 };
            }
            const amt = line.invoiceAmountINR || 0;
            monthMap[mKey].raised += amt;
            // Payment Received — matches invoiceProgressService.ts's rule:
            // Raised / Submitted, PartiallyPaid, and Paid all count as
            // received; only Draft (not yet submitted) and Cancelled don't.
            if (line.status === "Raised" || line.status === "PartiallyPaid" || line.status === "Paid") {
              monthMap[mKey].received += amt;
            }
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
          Monthly Revenue & Collection Trend
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">INR Trend</span>
      </div>

      {trendData.length === 0 ? (
        <EmptyState title="No Invoice Activity" description="No dated invoice lines found for the selected filter parameters." />
      ) : (
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRaised" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorReceived" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value: any) => [`₹ ${formatBusinessINR(Number(value))}`, ""]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="raised" name="Invoiced Raised" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRaised)" />
            <Area type="monotone" dataKey="received" name="Payment Received" stroke="#10b981" fillOpacity={1} fill="url(#colorReceived)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
