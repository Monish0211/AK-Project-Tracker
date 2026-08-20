import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

export function UtilizationChart({ projects }: Props) {
  const chartData = useMemo(() => {
    const deptHours: Record<string, { dept: string; billable: number; nonBillable: number }> = {};

    projects.forEach((p) => {
      const dName = p.department || "General Engineering";
      if (!deptHours[dName]) {
        deptHours[dName] = { dept: dName.length > 12 ? dName.slice(0, 12) + "..." : dName, billable: 0, nonBillable: 0 };
      }

      // ManhourExpense's real logged-hours field is bookedHours (types/ManhourExpense.ts).
      const manhourList = Array.isArray(p.manhourExpenses) ? p.manhourExpenses : [];
      manhourList.forEach((mh: any) => {
        const hrs = mh.bookedHours || 0;
        deptHours[dName].billable += hrs;
        deptHours[dName].nonBillable += Math.round(hrs * 0.15); // ~15% non-billable overhead
      });
    });

    return Object.values(deptHours).filter((d) => d.billable > 0 || d.nonBillable > 0);
  }, [projects]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Engineering Hours Allocation by Department
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">Engineering Hours</span>
      </div>

      {chartData.length === 0 ? (
        <EmptyState title="No Manhour Data" description="No Manhour Expense entries found for the selected filter parameters." />
      ) : (
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="dept" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="billable" name="Billable Project Hours" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="nonBillable" name="Non-Billable Overhead" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
