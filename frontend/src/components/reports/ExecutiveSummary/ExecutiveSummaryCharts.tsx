import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  projects: any[];
  analytics: any;
}

export function ExecutiveSummaryCharts({ projects, analytics }: Props) {
  // Chart 1: Top 6 Projects Revenue vs Expense
  const topProjectsData = useMemo(() => {
    return projects.slice(0, 6).map((p) => {
      const woVal = p.workOrderValueINR ?? p.workOrderValue ?? 0;
      const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
      let raised = 0;
      items.forEach((item: any) => {
        (Array.isArray(item.invoices) ? item.invoices : []).forEach((line: any) => {
          if (line.status !== "Cancelled") raised += line.invoiceAmountINR || 0;
        });
      });
      const nonManhour = (p.nonManhourExpenses || []).reduce((acc: number, e: any) => acc + (e.totalCost || e.amount || 0), 0);
      const manhour = (p.manhourExpenses || []).reduce((acc: number, e: any) => acc + (e.totalCost || e.amount || 0), 0);
      const expenses = nonManhour + manhour;

      return {
        name: p.prNo || p.client?.slice(0, 10) || "Project",
        "WO Value": woVal,
        "Invoice Raised": raised,
        Expenses: expenses,
      };
    });
  }, [projects]);

  // Chart 2: Project Status Distribution
  const statusPieData = useMemo(() => {
    const counts = analytics.projectCounts;
    return [
      { name: "Active", value: counts.active, color: "#10b981" },
      { name: "Completed", value: counts.completed, color: "#3b82f6" },
      { name: "On Hold", value: counts.hold, color: "#f59e0b" },
      { name: "Cancelled", value: counts.cancelled, color: "#ef4444" },
    ].filter((item) => item.value > 0);
  }, [analytics]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Revenue vs Expense Bar Chart (8 cols) */}
      <div className="lg:col-span-8 bg-[var(--nu-surface)] border border-[var(--nu-border)] p-5 rounded-2xl space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Contract Financial Comparisons (WO vs Raised vs Expenses)
          </h4>
          <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">Top Projects</span>
        </div>

        <div className="h-72 sm:h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topProjectsData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value: any) => [`₹ ${formatBusinessINR(Number(value))}`, ""]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="WO Value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Invoice Raised" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Project Status Pie Chart (4 cols) */}
      <div className="lg:col-span-4 bg-[var(--nu-surface)] border border-[var(--nu-border)] p-5 rounded-2xl space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-3">
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Project Status Portfolio
          </h4>
          <span className="text-[11px] text-[var(--nu-text-muted)] font-mono">
            {analytics.projectCounts.total} Total
          </span>
        </div>

        <div className="h-72 sm:h-80 w-full flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statusPieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={4}
                dataKey="value"
                label={({ name, percent }: { name?: string; percent?: number }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
              >
                {statusPieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(val: any) => [val, "Projects"]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
