import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { PieChart as PieIcon, ArrowRight, Info } from "lucide-react";
import { getProjectStatusData } from "../../../services/dashboardService";

const STATUS_COLORS: Record<string, string> = {
  Active: "#2563eb",     // Blue
  Completed: "#10b981",  // Green/Emerald
  "On Hold": "#f59e0b",  // Orange/Yellow
  Cancelled: "#ef4444",  // Red
  Closed: "#8b5cf6",     // Purple
};

const ProjectStatusChart: React.FC = () => {
  const navigate = useNavigate();
  const data = getProjectStatusData();

  // Calculate total projects across statuses
  const totalProjects = data.reduce((sum, item) => sum + item.value, 0);
  const hasData = totalProjects > 0;

  return (
    <Card padded={false} className="h-[300px] flex flex-col justify-between bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-md rounded-2xl hover:shadow-lg transition-all duration-200">
      {/* Header */}
      <CardHeader
        icon={<PieIcon size={14} className="text-blue-600 dark:text-blue-400" />}
        title="PROJECT STATUS OVERVIEW"
        subtitle="Current status of all projects."
        action={
          <button
            type="button"
            onClick={() => navigate("/projects")}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer shrink-0"
          >
            <span>View All ({totalProjects})</span>
            <ArrowRight size={12} />
          </button>
        }
      />

      {/* Content Area */}
      <CardBody className="flex-1 py-1.5 flex flex-col justify-center min-h-0">
        {hasData ? (
          <div className="flex items-center justify-between gap-3 h-[180px]">
            {/* Left: Donut Chart */}
            <div className="relative w-[45%] h-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={46}
                    paddingAngle={2}
                  >
                    {data.map((entry) => (
                      <Cell key={entry.name} fill={STATUS_COLORS[entry.name] || "#94a3b8"} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 8,
                      border: "1px solid var(--nu-border)",
                      background: "var(--nu-surface)",
                      color: "var(--nu-text)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              
              {/* Center Label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-[25px] font-extrabold text-slate-800 dark:text-slate-100 leading-none">
                  {totalProjects}
                </span>
                <span className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider mt-0.5">
                  Total Projects
                </span>
              </div>
            </div>

            {/* Right: Custom Vertical Legend */}
            <div className="w-[55%] pr-1.5 flex flex-col justify-center space-y-1.5 text-[11px]">
              {data.map((entry) => {
                const pct = totalProjects > 0 ? ((entry.value / totalProjects) * 100).toFixed(2) : "0.00";
                const color = STATUS_COLORS[entry.name] || "#94a3b8";
                return (
                  <div
                    key={entry.name}
                    onClick={() =>
                      navigate(
                        entry.name === "Completed" ? "/projects/completed" : `/projects?status=${entry.name}`
                      )
                    }
                    className="flex items-center justify-between text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-semibold cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="truncate">{entry.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                      <span>{entry.value}</span>
                      <span className="text-slate-400 dark:text-slate-500 font-normal">({pct}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-3 text-center text-slate-500 text-[11.5px]">
            No status data available
          </div>
        )}
      </CardBody>

      {/* Bottom Summary Strip (Fixed) */}
      <div className="shrink-0 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-200/60 dark:border-slate-800/60 p-2 px-3 sm:px-4 rounded-b-2xl flex items-center justify-between flex-wrap gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-1.5 truncate">
          <Info size={13} className="text-slate-400 shrink-0" />
          <span className="truncate">General Information Project Status rollup.</span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/projects")}
          className="text-blue-600 dark:text-blue-400 hover:underline transition-colors flex items-center gap-1 font-bold cursor-pointer ml-auto sm:ml-0"
        >
          <span>View All Projects</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </Card>
  );
};

export default ProjectStatusChart;
