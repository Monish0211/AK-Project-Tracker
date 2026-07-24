import React from "react";
import { ArrowRight, FolderKanban, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getProjectsWithHoursOverrun } from "../../../services/dashboardService";

const ProjectsInLossHoursWidget: React.FC = () => {
  const navigate = useNavigate();

  // Retrieve calculated overrun data from Dashboard Service fresh on every render
  const { totalMatchingProjects, top5Projects } = getProjectsWithHoursOverrun();

  const handleNavigateToProjects = (projectId?: string) => {
    if (projectId) {
      navigate(`/projects/view/${projectId}`);
    } else {
      navigate("/projects");
    }
  };

  const hasProjects = top5Projects.length > 0;

  return (
    <div className="bg-[var(--nu-surface)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] border border-[var(--nu-danger)]/30 p-3 sm:p-3.5 h-[275px] flex flex-col justify-between transition-all duration-200 hover:shadow-lg">
      {/* Header (Fixed) */}
      <div className="shrink-0 pb-1.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-full bg-red-600 shrink-0 animate-pulse shadow-xs" />
            <h3 className="text-xs sm:text-sm font-extrabold tracking-wide uppercase text-red-600 dark:text-red-400 leading-tight flex items-center gap-1 truncate">
              <span className="truncate">PROJECTS IN LOSS – FINANCIAL (HOURS OVERRUN)</span>
              <span title="Projects where actual engineering man-hours exceeded the approved budgeted hours.">
                <Info size={13} className="text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors cursor-help shrink-0" />
              </span>
            </h3>
          </div>

          <button
            type="button"
            onClick={() => handleNavigateToProjects()}
            className="text-[11px] font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer shrink-0"
          >
            <span>View All ({totalMatchingProjects})</span>
            <ArrowRight size={12} />
          </button>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight truncate">
          Projects where actual engineering man-hours exceeded the approved budgeted hours.
        </p>
      </div>

      {/* Scrollable Table Body Container */}
      {hasProjects ? (
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar my-1 pr-0.5">
          {/* Desktop & Tablet Table */}
          <div className="hidden sm:block">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shadow-xs">
                <tr className="border-b border-red-100 dark:border-red-900/40 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px] bg-red-50/60 dark:bg-slate-800/60">
                  <th className="py-1.5 px-2 rounded-l-lg">PR NO.</th>
                  <th className="py-1.5 px-2">PROJECT</th>
                  <th className="py-1.5 px-2">BUDGET HOURS</th>
                  <th className="py-1.5 px-2">ACTUAL HOURS</th>
                  <th className="py-1.5 px-2">HOURS OVERRUN</th>
                  <th className="py-1.5 px-2">% OVERRUN</th>
                  <th className="py-1.5 px-2 text-right rounded-r-lg">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[11px]">
                {top5Projects.map((project) => (
                  <tr
                    key={project.id}
                    onClick={() => handleNavigateToProjects(project.id)}
                    className="hover:bg-red-50/40 dark:hover:bg-slate-800/50 transition-colors duration-150 group cursor-pointer"
                  >
                    <td className="py-1.5 px-2 font-bold text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300 group-hover:underline whitespace-nowrap">
                      {project.prNumber}
                    </td>

                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <FolderKanban
                          size={13}
                          className="text-slate-400 dark:text-slate-500 shrink-0 group-hover:text-red-500 transition-colors"
                        />
                        <span
                          className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[130px] lg:max-w-[160px]"
                          title={project.projectName}
                        >
                          {project.projectName}
                        </span>
                      </div>
                    </td>

                    <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                      {project.formattedBudgetHours}
                    </td>

                    <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                      {project.formattedActualHours}
                    </td>

                    <td className="py-1.5 px-2 font-extrabold text-red-600 dark:text-red-400 whitespace-nowrap">
                      {project.formattedHoursOverrun}
                    </td>

                    <td className="py-1.5 px-2 font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                      {project.formattedPercentOverrun}
                    </td>

                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60 shadow-xs">
                        Loss
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked View */}
          <div className="sm:hidden space-y-2">
            {top5Projects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleNavigateToProjects(project.id)}
                className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 hover:bg-red-50/50 dark:hover:bg-slate-800/80 transition-all cursor-pointer space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-red-600 dark:text-red-400 hover:underline">
                    {project.prNumber}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60 shadow-xs">
                    Loss
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <FolderKanban size={13} className="text-slate-400 shrink-0" />
                  <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                    {project.projectName}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-[10.5px]">
                  <div>
                    <p className="text-slate-400 text-[9.5px] uppercase font-medium">Budget</p>
                    <p className="font-medium text-slate-700 dark:text-slate-300">{project.formattedBudgetHours}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[9.5px] uppercase font-medium">Actual</p>
                    <p className="font-medium text-slate-700 dark:text-slate-300">{project.formattedActualHours}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[9.5px] uppercase font-medium">Overrun</p>
                    <p className="font-extrabold text-red-600 dark:text-red-400">{project.formattedHoursOverrun}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[9.5px] uppercase font-medium">% Overrun</p>
                    <p className="font-bold text-red-600 dark:text-red-400">{project.formattedPercentOverrun}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center text-center p-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300/50 dark:border-emerald-800/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-1.5 shadow-xs">
            <CheckCircle2 size={20} />
          </div>
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1 justify-center">
            <span>✅ Excellent</span>
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm">
            No projects have exceeded their approved engineering hours.
          </p>
        </div>
      )}

      {/* Bottom Summary Strip (Fixed) */}
      <div className="shrink-0 bg-red-50/80 dark:bg-red-950/40 border-t border-red-100 dark:border-red-900/40 -mx-3 sm:-mx-3.5 -mb-3 sm:-mb-3.5 p-2 px-3 sm:px-4 rounded-b-2xl flex items-center justify-between flex-wrap gap-1.5 text-[11px] font-semibold text-red-800 dark:text-red-300">
        <div className="flex items-center gap-1.5 truncate">
          <AlertTriangle size={13} className="text-red-600 shrink-0" />
          <span className="truncate">⚠ {totalMatchingProjects} projects are in financial loss due to engineering man-hour overrun.</span>
        </div>

        <button
          type="button"
          onClick={() => handleNavigateToProjects()}
          className="text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-white transition-colors flex items-center gap-1 font-bold hover:underline cursor-pointer ml-auto sm:ml-0 shrink-0"
        >
          <span>View All Projects</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
};

export default ProjectsInLossHoursWidget;
