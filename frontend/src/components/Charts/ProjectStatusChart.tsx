import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

const data = [
  { name: "Completed", value: 18 },
  { name: "In Progress", value: 22 },
  { name: "Pending", value: 8 },
];

const COLORS = [
  "#22C55E",
  "#3B82F6",
  "#F59E0B",
];

const ProjectStatusChart = () => {
  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-xl shadow-md p-6 h-96">
      <h2 className="text-xl font-semibold mb-6">
        Project Status
      </h2>

      <ResponsiveContainer width="100%" height="90%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            outerRadius={110}
            label
          >
            {data.map((_, index) => (
              <Cell
                key={index}
                fill={COLORS[index]}
              />
            ))}
          </Pie>

          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ProjectStatusChart;