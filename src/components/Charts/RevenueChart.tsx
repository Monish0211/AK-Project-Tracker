import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

const data = [
  { month: "Jan", revenue: 8 },
  { month: "Feb", revenue: 12 },
  { month: "Mar", revenue: 18 },
  { month: "Apr", revenue: 15 },
  { month: "May", revenue: 22 },
  { month: "Jun", revenue: 28 },
];

const RevenueChart = () => {
  return (
    <div className="bg-white rounded-xl shadow-md p-6 h-96">
      <h2 className="text-xl font-semibold mb-6">
        Revenue Trend (₹ Cr)
      </h2>

      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />

          <XAxis dataKey="month" />

          <YAxis />

          <Tooltip />

          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#2563EB"
            strokeWidth={3}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RevenueChart;