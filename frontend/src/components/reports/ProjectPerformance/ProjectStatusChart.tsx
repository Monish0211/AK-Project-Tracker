import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";

interface Props {
  analytics: any;
}

export function ProjectStatusChart({ analytics }: Props) {
  const chartData = useMemo(() => {
    const c = analytics.projectCounts;
    return [
      { status: "Active", count: c.active, color: "#10b981" },
      { status: "Completed", count: c.completed, color: "#3b82f6" },
      { status: "On Hold", count: c.hold, color: "#f59e0b" },
      { status: "Cancelled", count: c.cancelled, color: "#ef4444" },
    ];
  }, [analytics]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Contract Lifecycle Status Distribution
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">{analytics.projectCounts.total} Contracts</span>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="status" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(val: any) => [val, "Projects"]} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
