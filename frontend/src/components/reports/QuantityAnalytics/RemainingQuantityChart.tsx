import { useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { formatIndianNumber } from "../../../utils/quantityCalculations";

interface Props {
  analytics: any;
}

export function RemainingQuantityChart({ analytics }: Props) {
  const pieData = useMemo(() => {
    return [
      { name: "Invoiced Quantity", value: analytics.totalInvoicedQty, color: "#10b981" },
      { name: "Remaining Quantity", value: analytics.remainingQty, color: "#f59e0b" },
    ];
  }, [analytics]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Total Deliverable Quantity Completion %
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">Portfolio Progress</span>
      </div>

      <div className="h-64 w-full flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
              label={({ name, percent }: { name?: string; percent?: number }) => `${name} (${((percent ?? 0) * 100).toFixed(1)}%)`}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(val: any) => [formatIndianNumber(Number(val)), "Units"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
