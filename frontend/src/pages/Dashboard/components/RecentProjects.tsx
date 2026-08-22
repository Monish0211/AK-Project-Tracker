import React from "react";
import { Clock3, ArrowRight, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";
import { statusTone } from "../../../components/ui/statusTone";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { useDashboardSummary } from "../DashboardSummaryContext";

const RecentProjects: React.FC = () => {
  const navigate = useNavigate();
  const projects = useDashboardSummary().recentProjects;

  return (
    <Card padded={false} elevated className="h-[325px] flex flex-col justify-between transition-all duration-200">
      {/* Header */}
      <CardHeader
        icon={<Clock3 size={14} className="text-slate-500 dark:text-slate-400" />}
        title="RECENT PROJECTS"
        subtitle="Latest project entries"
        action={
          <button
            type="button"
            onClick={() => navigate("/projects")}
            className="text-[11px] font-semibold text-slate-655 hover:text-blue-650 dark:text-slate-350 dark:hover:text-blue-400 transition-colors flex items-center gap-1 hover:underline cursor-pointer shrink-0"
          >
            <span>View All</span>
            <ArrowRight size={12} />
          </button>
        }
      />

      {/* Content Area */}
      <CardBody className="flex-1 overflow-y-auto custom-scrollbar my-1 pr-0.5 min-h-0">
        {projects.length === 0 ? (
          <EmptyState
            icon={<Clock3 size={18} />}
            title="No recent projects yet"
            description="Newly created projects will appear here, most recent first."
          />
        ) : (
          <table className="w-full table-fixed text-left text-[11px] border-collapse">
            <thead>
              <tr className="text-[9.5px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-extrabold border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-800/30">
                <th className="py-1 px-2 rounded-l-lg">PR NO.</th>
                <th className="py-1 px-2">CLIENT</th>
                <th className="py-1 px-2 text-center">STATUS</th>
                <th className="py-1 px-2 text-right rounded-r-lg">WO VALUE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/30 text-[11px]">
              {projects.map((project) => (
                <tr
                  key={project.id}
                  onClick={() => navigate(`/projects/view/${project.id}`)}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-850 transition-colors cursor-pointer"
                >
                  <td className="py-2.5 px-2 font-bold text-slate-800 dark:text-slate-200">{project.prNo}</td>
                  <td className="py-2.5 px-2">
                    <div className="truncate font-semibold text-slate-600 dark:text-slate-400" title={project.client}>
                      {project.client}
                    </div>
                  </td>
                  <td className="text-center py-2.5 px-2">
                    <Badge tone={statusTone(project.projectStatus)} dot>
                      {project.projectStatus || "—"}
                    </Badge>
                  </td>
                  <td className="text-right py-2.5 px-2 font-extrabold text-slate-800 dark:text-slate-100" title={`₹ ${project.workOrderValueINR.toLocaleString("en-IN")}`}>
                    {formatBusinessINR(project.workOrderValueINR)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>

      {/* Bottom Summary Strip (Fixed) */}
      <div className="shrink-0 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-200/60 dark:border-slate-800/60 p-2 px-3 sm:px-4 rounded-b-[var(--nu-radius-lg)] flex items-center justify-between flex-wrap gap-1.5 text-[11px] font-semibold text-slate-650 dark:text-slate-400">
        <div className="flex items-center gap-1.5 truncate">
          <Info size={13} className="text-slate-450 shrink-0" />
          <span className="truncate">Showing most recently created project entries.</span>
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

export default RecentProjects;
