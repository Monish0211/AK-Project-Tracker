import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { getProjectStatusData } from "../../../services/dashboardService";

const COLORS = [
  "#22C55E", // Active
  "#3B82F6", // Completed
  "#F59E0B", // On Hold
  "#EF4444", // Cancelled
];

const ProjectStatusChart = () => {
  const data = getProjectStatusData();

  return (
    <div className="bg-white rounded-2xl shadow-md p-6">

      <div className="flex justify-between items-center mb-6">

        <h2 className="text-xl font-semibold text-slate-800">
          Project Status
        </h2>

        <span className="text-sm text-gray-500">
          Live Data
        </span>

      </div>

      <ResponsiveContainer
        width="100%"
        height={350}
      >
        <PieChart>

          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={120}
            innerRadius={60}
            paddingAngle={3}
            label
          >
            {data.map((_, index) => (
              <Cell
                key={index}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>

          <Tooltip />

          <Legend verticalAlign="bottom" />

        </PieChart>
      </ResponsiveContainer>

    </div>
  );
};

export default ProjectStatusChart;