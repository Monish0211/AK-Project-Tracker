import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { getTotalNonManhourCost } from "../../../services/expenseService";

interface Props {
  projects: any[];
}

export function MarginChart({ projects }: Props) {
  const marginData = useMemo(() => {
    return projects
      .map((p) => {
        const woVal = p.workOrderValueINR ?? p.workOrderValue ?? 0;
        const nonManhour = getTotalNonManhourCost(p.nonManhourExpenses || []);
        const manhour = (p.resources || []).reduce((acc: number, r: any) => acc + (r.manhourCost || 0), 0);
        const actualCost = nonManhour + manhour;
        const profit = woVal - actualCost;
        const marginPct = woVal === 0 ? 0 : (profit / woVal) * 100;

        return {
          name: p.prNo || p.client?.slice(0, 10) || "Project",
          woVal,
          marginPct: Number(marginPct.toFixed(1)),
        };
      })
      .sort((a, b) => b.marginPct - a.marginPct)
      .slice(0, 6);
  }, [projects]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Contract Profit Margin % Comparison
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">Net Profit Margin %</span>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={marginData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(val: any) => [`${val}%`, "Margin %"]} />
            <Bar dataKey="marginPct" radius={[4, 4, 0, 0]}>
              {marginData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.marginPct >= 20 ? "#10b981" : entry.marginPct >= 0 ? "#f59e0b" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
