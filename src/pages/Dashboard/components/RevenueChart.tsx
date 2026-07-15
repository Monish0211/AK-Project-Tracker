import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

import { getDashboardMetrics } from "../../../services/dashboardService";

const RevenueChart = () => {
  const metrics = getDashboardMetrics();

  const data = [
    {
      name: "WO",
      value: metrics.totalWOValue,
    },
    {
      name: "Invoice",
      value: metrics.totalInvoiceRaised,
    },
    {
      name: "Received",
      value: metrics.totalPaymentReceived,
    },
    {
      name: "Outstanding",
      value: metrics.totalOutstanding,
    },
    {
      name: "Expenses",
      value: metrics.totalExpenses,
    },
    {
      name: "Profit",
      value: metrics.totalProfit,
    },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-md p-6">

      <div className="flex justify-between items-center mb-6">

        <h2 className="text-xl font-semibold">
          Financial Overview
        </h2>

        <span className="text-sm text-gray-500">
          Live Data
        </span>

      </div>

      <ResponsiveContainer
        width="100%"
        height={350}
      >
        <BarChart data={data}>
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" />

          <XAxis dataKey="name" />

          <YAxis />

          <Tooltip />

          <Bar
            dataKey="value"
            radius={[8, 8, 0, 0]}
            fill="url(#barGradient)"
          />

        </BarChart>
      </ResponsiveContainer>

    </div>
  );
};

export default RevenueChart;