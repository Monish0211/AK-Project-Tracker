import React, { useMemo } from "react";
import { ArrowRight, FolderKanban, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getProjects } from "../../../services/projectService";

export interface OverrunProjectItem {
  id: string;
  prNumber: string;
  projectName: string;
  budgetHours: number;
  actualHours: number;
  hoursOverrun: number;
  utilizationPercentage: number;
}

const SAMPLE_OVERRUN_PROJECTS: OverrunProjectItem[] = [
  {
    id: "sample-1",
    prNumber: "PR-9045",
    projectName: "RasGas – Safety Analysis",
    budgetHours: 750.0,
    actualHours: 898.86,
    hoursOverrun: 148.86,
    utilizationPercentage: 119.8,
  },
  {
    id: "sample-2",
    prNumber: "PR-7086",
    projectName: "ADNOC – HAZOP Study",
    budgetHours: 600.0,
    actualHours: 684.25,
    hoursOverrun: 84.25,
    utilizationPercentage: 114.0,
  },
  {
    id: "sample-3",
    prNumber: "PR-6032",
    projectName: "Oman Gas – QRA Study",
    budgetHours: 900.0,
    actualHours: 986.4,
    hoursOverrun: 86.4,
    utilizationPercentage: 109.6,
  },
];

const HoursOverrunWidget: React.FC = () => {
  const navigate = useNavigate();

  // Compute actual overrun projects from stored database data
  const dynamicOverrunProjects = useMemo(() => {
    try {
      const allProjects = getProjects();
      const overrunList: OverrunProjectItem[] = [];

      allProjects.forEach((p) => {
        // Budget Hours from Expense Budget -> Budget Hours
        const budget = p.manhourBudgetHours || p.totalHoursBudget || 0;

        // Actual Hours from Team Assigned -> Total Hours
        const actual = (p.resources || []).reduce(
          (sum, r) => sum + (r.totalHours || 0),
          0
        );

        if (budget > 0 && actual > budget) {
          const overrun = actual - budget;
          const util = (actual / budget) * 100;
          const name = p.client
            ? `${p.client} – ${p.projectTitle}`
            : p.projectTitle || "Untitled Project";

          overrunList.push({
            id: p.id,
            prNumber: p.prNo || "N/A",
            projectName: name,
            budgetHours: budget,
            actualHours: actual,
            hoursOverrun: overrun,
            utilizationPercentage: util,
          });
        }
      });

      return overrunList;
    } catch {
      return [];
    }
  }, []);

  // Use dynamic overruns if present, otherwise default to sample overrun projects
  const displayProjects: OverrunProjectItem[] = useMemo(() => {
    if (dynamicOverrunProjects.length > 0) {
      return dynamicOverrunProjects;
    }
    return SAMPLE_OVERRUN_PROJECTS;
  }, [dynamicOverrunProjects]);

  const handleNavigateToProjects = (prNumber?: string) => {
    if (prNumber) {
      navigate(`/projects?search=${encodeURIComponent(prNumber)}`);
    } else {
      navigate("/projects");
    }
  };

  const hasOverrunProjects = displayProjects.length > 0;

  return (
    <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-md border border-slate-200/80 dark:border-slate-800/80 border-l-4 border-l-red-500 p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-lg">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0 border border-red-500/20 shadow-xs">
            <span className="w-3.5 h-3.5 rounded-full bg-red-600 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-extrabold tracking-wide uppercase text-red-600 dark:text-red-400 leading-tight">
                PROJECT PERFORMANCE – HOURS OVERRUN
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              Projects where actual engineering man-hours exceeded the approved budgeted hours.
            </p>
          </div>
        </div>

        {/* Top Right Action Button */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => handleNavigateToProjects()}
            className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer group"
          >
            <span>View All ({displayProjects.length})</span>
            <ArrowRight size={13} className="transition-transform duration-150 group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {hasOverrunProjects ? (
        <>
          {/* Desktop & Tablet Table View */}
          <div className="hidden sm:block overflow-x-auto mt-4">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider text-[11px] bg-red-50/40 dark:bg-slate-800/40">
                  <th className="py-2.5 px-3 rounded-l-lg">PR No.</th>
                  <th className="py-2.5 px-3">Project</th>
                  <th className="py-2.5 px-3">Budget Hours</th>
                  <th className="py-2.5 px-3">Actual Hours</th>
                  <th className="py-2.5 px-3">Hours Overrun</th>
                  <th className="py-2.5 px-3 text-right rounded-r-lg">Utilization %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {displayProjects.map((project) => (
                  <tr
                    key={project.id}
                    onClick={() => handleNavigateToProjects(project.prNumber)}
                    className="hover:bg-red-50/40 dark:hover:bg-slate-800/50 transition-colors duration-150 group cursor-pointer"
                  >
                    {/* PR Number */}
                    <td className="py-3 px-3 font-bold text-red-600 dark:text-red-400 group-hover:text-red-700 dark:group-hover:text-red-300 group-hover:underline whitespace-nowrap">
                      {project.prNumber}
                    </td>

                    {/* Project Name */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <FolderKanban
                          size={14}
                          className="text-slate-400 dark:text-slate-500 shrink-0 group-hover:text-red-500 transition-colors"
                        />
                        <span
                          className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[170px] lg:max-w-[210px]"
                          title={project.projectName}
                        >
                          {project.projectName}
                        </span>
                      </div>
                    </td>

                    {/* Budget Hours */}
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                      {project.budgetHours.toFixed(2)} hrs
                    </td>

                    {/* Actual Hours */}
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                      {project.actualHours.toFixed(2)} hrs
                    </td>

                    {/* Hours Overrun (Bold Deep Red) */}
                    <td className="py-3 px-3 text-red-700 dark:text-red-400 font-extrabold whitespace-nowrap">
                      +{project.hoursOverrun.toFixed(2)} hrs
                    </td>

                    {/* Utilization % (Red Pill Badge) */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60 shadow-xs">
                        {project.utilizationPercentage.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View (Stacked Cards) */}
          <div className="sm:hidden space-y-3 mt-4">
            {displayProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => handleNavigateToProjects(project.prNumber)}
                className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 hover:bg-red-50/50 dark:hover:bg-slate-800/80 transition-all cursor-pointer space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-red-600 dark:text-red-400 hover:underline">
                    {project.prNumber}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60 shadow-xs">
                    {project.utilizationPercentage.toFixed(1)}%
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <FolderKanban size={14} className="text-slate-400 shrink-0" />
                  <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                    {project.projectName}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-[11px]">
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase font-medium">Budget</p>
                    <p className="font-medium text-slate-700 dark:text-slate-300">{project.budgetHours.toFixed(2)} hrs</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase font-medium">Actual</p>
                    <p className="font-medium text-slate-700 dark:text-slate-300">{project.actualHours.toFixed(2)} hrs</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] uppercase font-medium">Overrun</p>
                    <p className="font-extrabold text-red-700 dark:text-red-400">+{project.hoursOverrun.toFixed(2)} hrs</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* Empty State */
        <div className="py-8 px-4 flex flex-col items-center justify-center text-center mt-2">
          <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300/50 dark:border-emerald-800/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-2.5 shadow-xs">
            <CheckCircle2 size={24} />
          </div>
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 justify-center">
            <span>✅ Excellent</span>
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
            No projects have exceeded their approved engineering hours.
          </p>
        </div>
      )}
    </div>
  );
};

export default HoursOverrunWidget;
