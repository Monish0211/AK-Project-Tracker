import { useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  ageing: Record<string, number>;
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444"];

export function InvoiceAgeingChart({ ageing }: Props) {
  const ageingData = useMemo(() => {
    return Object.entries(ageing).map(([key, val], idx) => ({
      name: key,
      value: val,
      color: COLORS[idx % COLORS.length],
    }));
  }, [ageing]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Accounts Receivable Ageing Breakdown
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">0-30 to 90+ Days</span>
      </div>

      <div className="h-64 w-full flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={ageingData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
              label={({ name, value }) => `${name}: ₹${formatBusinessINR(value)}`}
            >
              {ageingData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(val: any) => [`₹ ${formatBusinessINR(Number(val))}`, "Outstanding Amount"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
