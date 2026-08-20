import { useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b"];

export function ContractValueChart({ projects }: Props) {
  const pieData = useMemo(() => {
    const regMap: Record<string, number> = {};

    projects.forEach((p) => {
      const reg = p.domesticForeign || "Domestic";
      const val = p.workOrderValueINR ?? p.workOrderValue ?? 0;
      regMap[reg] = (regMap[reg] || 0) + val;
    });

    const entries = Object.entries(regMap).map(([name, value], idx) => ({
      name,
      value,
      color: COLORS[idx % COLORS.length],
    }));

    return entries;
  }, [projects]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Regional Currency & Contract Type Breakdown
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">Regional Contract Mix</span>
      </div>

      {pieData.length === 0 ? (
        <EmptyState title="No Contract Value" description="No Work Order Value found for the selected filter parameters." />
      ) : (
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
            <Tooltip formatter={(val: any) => [`₹ ${formatBusinessINR(Number(val))}`, "Contract Value"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
