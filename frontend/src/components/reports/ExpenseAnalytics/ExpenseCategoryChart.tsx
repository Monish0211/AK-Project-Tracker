import { useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

const COLORS = ["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4"];

export function ExpenseCategoryChart({ projects }: Props) {
  const categoryData = useMemo(() => {
    const catMap: Record<string, number> = {};

    projects.forEach((p) => {
      const nonManhour = Array.isArray(p.nonManhourExpenses) ? p.nonManhourExpenses : [];
      nonManhour.forEach((e: any) => {
        const categoryName = e.category || e.expenseCategory || "Other Expenses";
        const cost = e.totalCost || e.amount || (e.quantity || 1) * (e.unitCost || 0);
        catMap[categoryName] = (catMap[categoryName] || 0) + cost;
      });

      const manhour = (p.manhourExpenses || []).reduce((acc: number, e: any) => acc + (e.totalCost || e.amount || 0), 0);
      if (manhour > 0) {
        catMap["Manhour Costs"] = (catMap["Manhour Costs"] || 0) + manhour;
      }
    });

    const entries = Object.entries(catMap).map(([name, value], idx) => ({
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
          Expense Category Breakdown
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">By Category</span>
      </div>

      {categoryData.length === 0 ? (
        <EmptyState title="No Expenses Recorded" description="No Other Project Expenses or Manhour costs found for the selected filter parameters." />
      ) : (
      <div className="h-64 w-full flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={categoryData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
              label={({ name, value }) => `${name}: ₹${formatBusinessINR(value)}`}
            >
              {categoryData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(val: any) => [`₹ ${formatBusinessINR(Number(val))}`, "Cost"]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
