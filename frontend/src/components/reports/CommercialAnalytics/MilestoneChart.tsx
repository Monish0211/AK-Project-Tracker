import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  projects: any[];
}

export function MilestoneChart({ projects }: Props) {
  const chartData = useMemo(() => {
    const catMap: Record<string, { category: string; woValue: number; billed: number }> = {};

    projects.forEach((p) => {
      const catName = p.prCategory || "Consultancy Services";
      if (!catMap[catName]) {
        catMap[catName] = { category: catName, woValue: 0, billed: 0 };
      }
      const woVal = p.workOrderValueINR ?? p.workOrderValue ?? 0;
      catMap[catName].woValue += woVal;

      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      items.forEach((item: any) => {
        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          if (line.status !== "Cancelled") catMap[catName].billed += line.invoiceAmountINR || 0;
        });
      });
    });

    return Object.values(catMap);
  }, [projects]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Commercial Contract Distribution by PR Category
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">By Contract Category</span>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="category" tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} tick={{ fontSize: 10 }} />
            <Tooltip formatter={(val: any) => [`₹ ${formatBusinessINR(Number(val))}`, ""]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="woValue" name="Contract WO Value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="billed" name="Billed Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
