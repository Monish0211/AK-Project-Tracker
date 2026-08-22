import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";

interface Props {
  projects: any[];
}

export function MarginChart({ projects }: Props) {
  const marginData = useMemo(() => {
    return projects.slice(0, 6).map((p) => {
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      let raised = 0;
      items.forEach((item: any) => {
        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          if (line.status !== "Cancelled") raised += line.invoiceAmountINR || 0;
        });
      });
      const nonManhour = (p.nonManhourExpenses || []).reduce((acc: number, e: any) => acc + (e.totalCost || e.amount || 0), 0);
      const manhour = (p.resources || []).reduce((acc: number, r: any) => acc + (r.manhourCost || 0), 0);
      const profit = raised - (nonManhour + manhour);
      const marginPct = raised > 0 ? (profit / raised) * 100 : 0;

      return {
        name: p.prNo || p.client?.slice(0, 10) || "Project",
        marginPct: Number(marginPct.toFixed(1)),
      };
    });
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
