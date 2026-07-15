import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { PieChart as PieIcon } from "lucide-react";
import { getProjectStatusData } from "../../../services/dashboardService";
import { useTheme } from "../../../context/ThemeContext";

const COLORS = ["#2563eb", "#d97706", "#15803d", "#b91c1c"];
const COLORS_DARK = ["#3b82f6", "#fbbf24", "#34d399", "#f87171"];

const ProjectStatusChart = () => {
  const { theme } = useTheme();
  const data = getProjectStatusData();
  const palette = theme === "dark" ? COLORS_DARK : COLORS;
  const axisColor = theme === "dark" ? "#a6afc4" : "#4b5565";
  const hasData = data.some((entry) => entry.value > 0);

  return (
    <Card padded={false} elevated className="h-full flex flex-col">
      <CardHeader icon={<PieIcon size={15} />} title="Project Status" subtitle="By General Information status" action={<Badge tone="success">Live</Badge>} />
      <CardBody className="flex-1 py-1.5 flex flex-col">
        {hasData ? (
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} innerRadius={60} paddingAngle={2}>
                {data.map((entry, index) => (
                  <Cell key={entry.name} fill={palette[index % palette.length]} stroke="none" />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--nu-border)",
                  background: "var(--nu-surface)",
                  color: "var(--nu-text)",
                }}
              />
              <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: axisColor, paddingTop: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={<PieIcon size={18} />}
              title="No project status data available"
              description="Import projects to see their status distribution here."
            />
          </div>
        )}
      </CardBody>
    </Card>
  );
};

export default ProjectStatusChart;
