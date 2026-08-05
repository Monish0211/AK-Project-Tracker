import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  customerList: any[];
}

export function CustomerOutstanding({ customerList }: Props) {
  const chartData = useMemo(() => {
    return customerList
      .filter((c) => c.outstanding > 0)
      .slice(0, 7)
      .map((c) => ({
        client: c.client.length > 12 ? c.client.slice(0, 12) + "..." : c.client,
        Outstanding: c.outstanding,
      }));
  }, [customerList]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Outstanding Receivables Exposure by Client
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">Receivable Exposure</span>
      </div>

      <div className="h-64 w-full">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-[var(--nu-text-muted)] italic">
            Zero outstanding balance across all active customer accounts.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="client" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(val: any) => [`₹ ${formatBusinessINR(Number(val))}`, "Outstanding"]} />
              <Bar dataKey="Outstanding" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "#f59e0b" : "#ef4444"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
