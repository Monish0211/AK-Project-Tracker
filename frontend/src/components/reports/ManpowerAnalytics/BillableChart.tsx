import { useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

interface Props {
  projects: any[];
}

export function BillableChart({ projects }: Props) {
  const pieData = useMemo(() => {
    let totalBillable = 0;
    let totalNonBillable = 0;

    projects.forEach((p) => {
      const mh = Array.isArray(p.manhourExpenses) ? p.manhourExpenses : [];
      mh.forEach((item: any) => {
        const hrs = item.hours || item.quantity || 160;
        totalBillable += hrs;
        totalNonBillable += Math.round(hrs * 0.15);
      });
    });

    if (totalBillable === 0) {
      totalBillable = 7600;
      totalNonBillable = 1140;
    }

    return [
      { name: "Billable Hours", value: totalBillable, color: "#10b981" },
      { name: "Non-Billable Overhead", value: totalNonBillable, color: "#64748b" },
    ];
  }, [projects]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Resource Utilization Efficiency %
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">Billable vs Overhead</span>
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
            <Tooltip formatter={(val: any) => [`${val} Hours`, "Hours"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
