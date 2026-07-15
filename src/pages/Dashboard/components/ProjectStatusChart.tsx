import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { getProjectStatusData } from "../../../services/dashboardService";
import { useTheme } from "../../../context/ThemeContext";

const COLORS = [
  "#3B82F6", // Active (Blue)
  "#EAB308", // On Hold (Yellow)
  "#22C55E", // Completed (Green)
  "#EF4444", // Cancelled (Red)
];

const ProjectStatusChart = () => {
  const { theme } = useTheme();
  const data = getProjectStatusData();

  const getFillColor = (name: string, index: number) => {
    if (theme === "light") {
      return COLORS[index % COLORS.length];
    }
    switch (name) {
      case "Active":
        return "url(#activeGrad)";
      case "On Hold":
        return "url(#onHoldGrad)";
      case "Completed":
        return "url(#completedGrad)";
      case "Cancelled":
        return "url(#cancelledGrad)";
      default:
        return COLORS[index % COLORS.length];
    }
  };

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
          <defs>
            {/* Glow Filters */}
            <filter id="donutGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feComponentTransfer in="blur" result="glow">
                <feFuncA type="linear" slope="0.45" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <filter id="donutGlowHover" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feComponentTransfer in="blur" result="glow">
                <feFuncA type="linear" slope="0.75" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Gradients */}
            <linearGradient id="activeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#06B6D4" />
            </linearGradient>
            <linearGradient id="onHoldGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#F97316" />
            </linearGradient>
            <linearGradient id="completedGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#22C55E" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>
            <linearGradient id="cancelledGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#EF4444" />
              <stop offset="100%" stopColor="#B91C1C" />
            </linearGradient>
          </defs>

          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={120}
            innerRadius={60}
            paddingAngle={3}
            label={theme === "dark" ? { fill: "#FFFFFF", fontSize: 13, fontWeight: 700 } : undefined}
          >
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={getFillColor(entry.name, index)}
                style={{
                  filter: theme === "dark" ? "url(#donutGlow)" : "none",
                  transition: "all 0.3s ease",
                  outline: "none",
                }}
              />
            ))}
          </Pie>

          <Tooltip />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            wrapperStyle={{ paddingTop: "20px" }}
          />
        </PieChart>
      </ResponsiveContainer>

    </div>
  );
};

export default ProjectStatusChart;