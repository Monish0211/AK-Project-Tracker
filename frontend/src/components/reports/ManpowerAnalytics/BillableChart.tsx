import { useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

export function BillableChart({ projects }: Props) {
  const pieData = useMemo(() => {
    const deptMap: Record<string, number> = {};

    projects.forEach((p) => {
      const resources = Array.isArray(p.resources) ? p.resources : [];
      resources.forEach((r: any) => {
        const dName = r.department || p.department || "General Engineering";
        deptMap[dName] = (deptMap[dName] || 0) + (r.totalHours || 0);
      });
    });

    return Object.entries(deptMap)
      .map(([name, value], idx) => ({
        name,
        value,
        color: COLORS[idx % COLORS.length],
      }))
      .filter((d) => d.value > 0);
  }, [projects]);

  const hasData = pieData.some((d) => d.value > 0);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Departmental Hours Distribution
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">By Department</span>
      </div>

      {!hasData ? (
        <EmptyState title="No Manhour Data" description="No Project Resource timesheet hours found for the selected filter parameters." />
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
            <Tooltip formatter={(val: any) => [`${val} Hours`, "Hours Logged"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
