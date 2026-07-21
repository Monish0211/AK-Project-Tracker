import React from "react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from "recharts";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { BarChart3, ArrowRight, Info } from "lucide-react";
import { getDashboardMetrics } from "../../../services/dashboardService";
import { useTheme } from "../../../context/ThemeContext";
import { formatCompactINR, formatFullINR } from "../../../utils/formatCurrency";

const SERIES = [
  { key: "WO", label: "Work Order Value", light: "#2563eb", dark: "#3b82f6" },
  { key: "Invoice", label: "Invoice Raised", light: "#4f46e5", dark: "#6366f1" },
  { key: "Received", label: "Payment Received", light: "#16a34a", dark: "#22c55e" },
  { key: "Outstanding", label: "Outstanding", light: "#dc2626", dark: "#f87171" },
  { key: "Expenses", label: "Expenses", light: "#ea580c", dark: "#fb923c" },
  { key: "Profit", label: "Profit", light: "#0d9488", dark: "#2dd4bf" },
] as const;

const RevenueChart: React.FC = () => {
  const navigate = useNavigate();
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
    <Card padded={false} className="h-[300px] flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-md rounded-2xl hover:shadow-lg transition-all duration-200">
      {/* Header */}
      <CardHeader
        icon={<BarChart3 size={14} className="text-emerald-600 dark:text-emerald-400" />}
        title="FINANCIAL OVERVIEW"
        subtitle="Work order to profit breakdown."
        action={
          <button
            type="button"
            onClick={() => navigate("/reports")}
            className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer shrink-0"
          >
            <span>View Reports</span>
            <ArrowRight size={12} />
          </button>
        }
      />

      {/* Content Area */}
      <CardBody className="flex-1 py-1 flex flex-col justify-between min-h-0">
        {hasData ? (
          <>
            <div className="flex-1 h-[146px] min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 6, left: -20, bottom: 0 }} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: axisColor }} axisLine={{ stroke: gridColor }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 9.5, fill: axisColor }}
                    axisLine={{ stroke: gridColor }}
                    tickLine={false}
                    width={48}
                    tickFormatter={(v: number) => formatCompactINR(v)}
                  />
                  <Tooltip
                    cursor={{ fill: theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)" }}
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 8,
                      border: "1px solid var(--nu-border)",
                      background: "var(--nu-surface)",
                      color: "var(--nu-text)",
                    }}
                    formatter={(value) => [formatFullINR(Number(value)), "Amount"]}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={32}>
                    {data.map((entry) => (
                      <Cell key={entry.name} fill={colorFor(entry.name)} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="top"
                      formatter={(v) => formatCompactINR(Number(v))}
                      style={{ fontSize: 9, fontWeight: 700, fill: axisColor }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Custom Series Legend Indicators */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center py-1 mt-1 border-t border-slate-100 dark:border-slate-800/60">
              {SERIES.map((series) => (
                <span key={series.key} className="inline-flex items-center gap-1 text-[9.5px] font-bold text-slate-500 dark:text-slate-400">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: theme === "dark" ? series.dark : series.light }} />
                  {series.label}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-3 text-center text-slate-500 text-[11.5px]">
            No financial data available
          </div>
        )}
      </CardBody>

      {/* Bottom Summary Strip (Fixed) */}
      <div className="shrink-0 bg-emerald-50/85 dark:bg-emerald-950/40 border-t border-emerald-100 dark:border-emerald-900/40 p-2 px-3 sm:px-4 rounded-b-2xl flex items-center justify-between flex-wrap gap-1.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
        <div className="flex items-center gap-1.5 truncate">
          <Info size={13} className="text-emerald-600 shrink-0" />
          <span className="truncate">Active projects commercial overview rollup.</span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/reports")}
          className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-950 dark:hover:text-white transition-colors flex items-center gap-1 font-bold hover:underline cursor-pointer ml-auto sm:ml-0 shrink-0"
        >
          <span>View Reports</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </Card>
  );
};

export default RevenueChart;
