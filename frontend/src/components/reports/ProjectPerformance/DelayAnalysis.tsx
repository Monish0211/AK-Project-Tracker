import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

interface Props {
  projects: any[];
}

export function DelayAnalysis({ projects }: Props) {
  const deptProgressData = useMemo(() => {
    const deptMap: Record<string, { dept: string; total: number; completed: number }> = {};

    projects.forEach((p) => {
      const dName = p.department || "General Engineering";
      if (!deptMap[dName]) {
        deptMap[dName] = { dept: dName.length > 12 ? dName.slice(0, 12) + "..." : dName, total: 0, completed: 0 };
      }
      deptMap[dName].total += 1;
      if ((p.projectStatus || "").toLowerCase().includes("completed")) {
        deptMap[dName].completed += 1;
      }
    });

    return Object.values(deptMap);
  }, [projects]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Departmental Project Progress & Completion
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">By Engineering Dept</span>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={deptProgressData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="dept" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="total" name="Total Contracts" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="completed" name="Completed Contracts" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
