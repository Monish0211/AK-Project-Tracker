import React from "react";
import { ArrowRight, FolderKanban, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getProjectTimelineAlerts, type TimelineAlertPriority } from "../../../services/dashboardService";

const ProjectsInLossTimeWidget: React.FC = () => {
  const navigate = useNavigate();

  // Retrieve proactive timeline alert data from Dashboard Service
  const {
    totalMatchingProjects,
    allAlertProjects,
    dueSoonCount,
    upcomingCount,
    dueTodayCount,
    overdueCount,
    onTrackCount,
  } = getProjectTimelineAlerts();

  // The Dashboard stays lightweight by rendering only the first ten projects
  // from the existing urgency-ordered timeline dataset. Counts remain global.
  const displayedProjects = allAlertProjects.slice(0, 10);

  const handleNavigateToProjects = (projectId?: string) => {
    if (projectId) {
      navigate(`/projects/edit/${projectId}`);
    } else {
      navigate("/projects/timeline-alerts");
    }
  };

  const hasProjects = displayedProjects.length > 0;



  const renderStatusBadge = (priority: TimelineAlertPriority, status: string) => {
    let bgCls = "bg-orange-500 text-white font-bold";
    if (priority === "Yellow") {
      bgCls = "bg-amber-500 text-white font-bold";
    } else if (priority === "Red" || priority === "DarkRed") {
      bgCls = "bg-red-500 text-white font-bold";
    } else if (priority === "Green") {
      bgCls = "bg-emerald-600 text-white font-bold";
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] shadow-xs ${bgCls}`}>
        {status}
      </span>
    );
  };

  const getDaysDisplayClass = (priority: TimelineAlertPriority) => {
    switch (priority) {
      case "Orange":
        return "text-orange-600 dark:text-orange-400 font-bold";
      case "Yellow":
        return "text-amber-600 dark:text-amber-400 font-semibold";
      case "Red":
      case "DarkRed":
        return "text-red-600 dark:text-red-400 font-extrabold";
      case "Green":
        return "text-emerald-600 dark:text-emerald-400 font-medium";
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-orange-200 dark:border-orange-900/60 p-3 sm:p-3.5 h-[275px] flex flex-col justify-between transition-all duration-200 hover:shadow-lg">
      {/* Header (Fixed) */}
      <div className="shrink-0 pb-1.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-3 h-3 rounded-full shrink-0 animate-pulse shadow-xs ${
                dueSoonCount > 0
                  ? "bg-orange-500"
                  : upcomingCount > 0
                  ? "bg-amber-500"
                  : dueTodayCount > 0 || overdueCount > 0
                  ? "bg-red-500"
                  : "bg-emerald-500"
              }`}
            />
            <h3 className="text-xs sm:text-sm font-extrabold tracking-wide uppercase text-orange-600 dark:text-orange-400 leading-tight flex items-center gap-1 truncate">
              <span className="truncate">PROJECT TIMELINE ALERTS</span>
              <span title="Proactive monitoring for project completion deadlines & overdue schedules.">
                <Info size={13} className="text-slate-400 dark:text-slate-500 hover:text-orange-500 transition-colors cursor-help shrink-0" />
              </span>
            </h3>
          </div>

          <button
            type="button"
            onClick={() => handleNavigateToProjects()}
            className="text-[11px] font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer shrink-0"
          >
            <span>View All ({totalMatchingProjects})</span>
            <ArrowRight size={12} />
          </button>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight truncate">
          Proactive tracking for upcoming project completion deadlines & overdue schedules.
        </p>
      </div>

      {/* Scrollable Table Body Container */}
      {hasProjects ? (
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar my-1 pr-0.5">
          {/* Desktop & Tablet Table */}
          <div className="hidden sm:block">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shadow-xs">
                <tr className="border-b border-orange-100 dark:border-orange-900/40 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px] bg-orange-50/60 dark:bg-slate-800/60">
                  <th className="py-1.5 px-2 rounded-l-lg">PR NO.</th>
                  <th className="py-1.5 px-2">PROJECT</th>
                  <th className="py-1.5 px-2">DAYS REMAINING / OVERDUE</th>
                  <th className="py-1.5 px-2">START DATE</th>
                  <th className="py-1.5 px-2">END DATE</th>
                  <th className="py-1.5 px-2 text-right rounded-r-lg">STATUS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[11px]">
                {displayedProjects.map((project) => (
                  <tr
                    key={project.id}
                    onClick={() => handleNavigateToProjects(project.id)}
                    className="hover:bg-orange-50/40 dark:hover:bg-slate-800/50 transition-colors duration-150 group cursor-pointer"
                  >
                    <td className="py-1.5 px-2 font-bold text-orange-600 dark:text-orange-400 group-hover:text-orange-700 dark:group-hover:text-orange-300 group-hover:underline whitespace-nowrap">
                      {project.prNumber}
                    </td>

                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <FolderKanban
                          size={13}
                          className="text-slate-400 dark:text-slate-500 shrink-0 group-hover:text-orange-500 transition-colors"
                        />
                        <span
                          className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[130px] lg:max-w-[160px]"
                          title={project.projectName}
                        >
                          {project.projectName}
                        </span>
                      </div>
                    </td>

                    <td className="py-1.5 px-2 whitespace-nowrap">
                      <span className={getDaysDisplayClass(project.priority)}>
                        {project.daysDisplay}
                      </span>
                    </td>

                    <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                      {project.startDate}
                    </td>

                    <td className="py-1.5 px-2 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                      {project.endDate}
                    </td>

                    <td className="py-1.5 px-2 text-right whitespace-nowrap">
                      {renderStatusBadge(project.priority, project.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked View */}
          <div className="sm:hidden space-y-2">
            {displayedProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleNavigateToProjects(project.id)}
                className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 hover:bg-orange-50/50 dark:hover:bg-slate-800/80 transition-all cursor-pointer space-y-1.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-orange-600 dark:text-orange-400 hover:underline">
                    {project.prNumber}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {renderStatusBadge(project.priority, project.status)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <FolderKanban size={13} className="text-slate-400 shrink-0" />
                  <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                    {project.projectName}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-[10.5px]">
                  <div>
                    <p className="text-slate-400 text-[9.5px] uppercase font-medium">Start Date</p>
                    <p className="font-medium text-slate-700 dark:text-slate-300">{project.startDate}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[9.5px] uppercase font-medium">End Date</p>
                    <p className="font-medium text-slate-700 dark:text-slate-300">{project.endDate}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[9.5px] uppercase font-medium">Remaining / Overdue</p>
                    <p className={getDaysDisplayClass(project.priority)}>
                      {project.daysDisplay}
                    </p>
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
            All active projects are currently on schedule.
          </p>
        </div>
      )}

      {/* Bottom Summary Strip (Fixed) */}
      <div className="shrink-0 bg-slate-50/90 dark:bg-slate-800/60 border-t border-slate-200/70 dark:border-slate-800/80 -mx-3 sm:-mx-3.5 -mb-3 sm:-mb-3.5 p-2 px-3 sm:px-4 rounded-b-2xl flex items-center justify-between flex-wrap gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
        <div className="flex items-center gap-1.5 flex-wrap truncate">
          <AlertTriangle size={13} className="text-orange-600 shrink-0" />
          <span className="truncate flex items-center gap-1.5 flex-wrap">
            <span className="font-extrabold text-orange-600 dark:text-orange-400">{dueSoonCount} Due Soon</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="font-extrabold text-amber-600 dark:text-amber-400">{upcomingCount} Upcoming</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="font-extrabold text-red-600 dark:text-red-400">{dueTodayCount} Due Today</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{onTrackCount} On Track</span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="font-extrabold text-red-600 dark:text-red-400">{overdueCount} Overdue</span>
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
            Showing {displayedProjects.length} of {totalMatchingProjects} Timeline Projects
          </span>
          <button
            type="button"
            onClick={() => handleNavigateToProjects()}
            className="text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300 transition-colors flex items-center gap-1 font-bold hover:underline cursor-pointer"
          >
            <span>View All Projects</span>
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectsInLossTimeWidget;
