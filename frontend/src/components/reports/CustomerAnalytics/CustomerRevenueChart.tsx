import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  customerList: any[];
}

export function CustomerRevenueChart({ customerList }: Props) {
  const chartData = useMemo(() => {
    return customerList.slice(0, 7).map((c) => ({
      client: c.client.length > 12 ? c.client.slice(0, 12) + "..." : c.client,
      "Contract Value": c.woValue,
      "Invoiced Revenue": c.raised,
    }));
  }, [customerList]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Top Clients by Revenue & Contract Value
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">Top Customers</span>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="client" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => formatBusinessINR(v)} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(val: any) => [formatBusinessINR(Number(val)), ""]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Contract Value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Invoiced Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
