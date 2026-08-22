import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  customerList: any[];
}

const COLORS = ["#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#3b82f6", "#10b981"];

export function OutstandingChart({ customerList }: Props) {
  const topOutstanding = useMemo(() => {
    return customerList
      .filter((c) => c.outstanding > 0)
      .slice(0, 6)
      .map((c) => ({
        client: c.client.length > 12 ? c.client.slice(0, 12) + "..." : c.client,
        Outstanding: c.outstanding,
      }));
  }, [customerList]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Top Outstanding Receivables by Client
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">Uncollected Receivables</span>
      </div>

      <div className="h-64 w-full">
        {topOutstanding.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-[var(--nu-text-muted)] italic">
            No outstanding receivables found for current filter.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topOutstanding} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="client" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => formatBusinessINR(v)} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value: any) => [formatBusinessINR(Number(value)), "Outstanding"]} />
              <Bar dataKey="Outstanding" fill="#f59e0b" radius={[4, 4, 0, 0]}>
                {topOutstanding.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
