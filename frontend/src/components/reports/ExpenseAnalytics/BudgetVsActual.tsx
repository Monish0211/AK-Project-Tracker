import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  projects: any[];
}

export function BudgetVsActual({ projects }: Props) {
  const chartData = useMemo(() => {
    return projects.slice(0, 6).map((p) => {
      const nonManhour = (p.nonManhourExpenses || []).reduce((acc: number, e: any) => acc + (e.totalCost || e.amount || 0), 0);
      const manhour = (p.manhourExpenses || []).reduce((acc: number, e: any) => acc + (e.totalCost || e.amount || 0), 0);
      const actual = nonManhour + manhour;
      const budget = (p.manhourBudgetAmount || 0) + (p.nonManhourBudgetAmount || 0) || (p.workOrderValueINR || 100000);

      return {
        name: p.prNo || p.client?.slice(0, 10) || "Project",
        Budget: budget,
        "Actual Expense": actual,
      };
    });
  }, [projects]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Budget vs Actual Expenses (Top Projects)
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">Variance</span>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(val: any) => [`₹ ${formatBusinessINR(Number(val))}`, ""]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Budget" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Actual Expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
