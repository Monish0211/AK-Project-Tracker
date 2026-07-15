import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from "recharts";

import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { BarChart3 } from "lucide-react";
import { getDashboardMetrics } from "../../../services/dashboardService";
import { useTheme } from "../../../context/ThemeContext";
import { formatCompactINR, formatFullINR } from "../../../utils/formatCurrency";

/* Meaningful, fixed color coding per financial category — presentation only. */
const SERIES = [
  { key: "WO", label: "Work Order Value", light: "#2563eb", dark: "#3b82f6" },
  { key: "Invoice", label: "Invoice Raised", light: "#4f46e5", dark: "#6366f1" },
  { key: "Received", label: "Payment Received", light: "#16a34a", dark: "#22c55e" },
  { key: "Outstanding", label: "Outstanding", light: "#dc2626", dark: "#f87171" },
  { key: "Expenses", label: "Expenses", light: "#ea580c", dark: "#fb923c" },
  { key: "Profit", label: "Profit", light: "#0d9488", dark: "#2dd4bf" },
] as const;

const RevenueChart = () => {
  const { theme } = useTheme();
  const metrics = getDashboardMetrics();
  const gridColor = theme === "dark" ? "#262f42" : "#e2e5eb";
  const axisColor = theme === "dark" ? "#a6afc4" : "#4b5565";

  const data = [
    { name: "WO", value: metrics.totalWOValue },
    { name: "Invoice", value: metrics.totalInvoiceRaised },
    { name: "Received", value: metrics.totalPaymentReceived },
    { name: "Outstanding", value: metrics.totalOutstanding },
    { name: "Expenses", value: metrics.totalExpenses },
    { name: "Profit", value: metrics.totalProfit },
  ];
  const hasData = data.some((entry) => entry.value > 0);
  const colorFor = (name: string) => {
    const series = SERIES.find((s) => s.key === name);
    if (!series) return axisColor;
    return theme === "dark" ? series.dark : series.light;
  };

  return (
    <Card padded={false} elevated className="h-full flex flex-col">
      <CardHeader icon={<BarChart3 size={15} />} title="Financial Overview" subtitle="Work order to profit breakdown" action={<Badge tone="success">Live</Badge>} />
      <CardBody className="flex-1 py-1.5 flex flex-col">
        {hasData ? (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor }} axisLine={{ stroke: gridColor }} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: axisColor }}
                  axisLine={{ stroke: gridColor }}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v: number) => formatCompactINR(v)}
                />
                <Tooltip
                  cursor={{ fill: theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)" }}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: "1px solid var(--nu-border)",
                    background: "var(--nu-surface)",
                    color: "var(--nu-text)",
                  }}
                  formatter={(value) => [formatFullINR(Number(value)), "Amount"]}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={colorFor(entry.name)} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(v) => formatCompactINR(Number(v))}
                    style={{ fontSize: 10.5, fontWeight: 600, fill: axisColor }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 justify-center pt-2 pb-1">
              {SERIES.map((series) => (
                <span key={series.key} className="inline-flex items-center gap-1.5 text-[10.5px] text-[var(--nu-text-secondary)]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: theme === "dark" ? series.dark : series.light }} />
                  {series.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<BarChart3 size={18} />}
              title="No financial data yet"
              description="Add work orders and invoices to populate this chart."
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
};

export default RevenueChart;
