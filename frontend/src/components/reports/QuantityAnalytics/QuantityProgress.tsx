import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { formatIndianNumber } from "../../../utils/quantityCalculations";

interface Props {
  projects: any[];
}

export function QuantityProgress({ projects }: Props) {
  const chartData = useMemo(() => {
    return projects
      .map((p) => {
        const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
        let ordered = 0;
        let invoiced = 0;
        items.forEach((item: any) => {
          // InvoiceItem's real ordered-quantity field is `qty` (types/InvoiceItem.ts).
          ordered += item.qty || 0;
          (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
            if (line.status !== "Cancelled") invoiced += line.quantityBilled || 0;
          });
        });

        return {
          name: p.prNo || p.client?.slice(0, 10) || "Project",
          "Ordered Qty": ordered,
          "Invoiced Qty": invoiced,
          "Remaining Qty": Math.max(0, ordered - invoiced),
        };
      })
      .sort((a, b) => b["Ordered Qty"] - a["Ordered Qty"])
      .slice(0, 6);
  }, [projects]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] p-4 rounded-2xl space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
          Deliverable Quantity Progress (Ordered vs Billed)
        </h4>
        <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">Deliverable Quantities</span>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(val: any) => [formatIndianNumber(Number(val)), ""]} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Ordered Qty" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Invoiced Qty" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Remaining Qty" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
