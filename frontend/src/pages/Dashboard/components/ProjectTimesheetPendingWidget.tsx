import React from "react";
import { ArrowRight, Clock3, Info, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getMissingTimesheetProjects, type MissingTimesheetStatus } from "../../../services/timesheetPendingService";

const STATUS_BADGE_CLASS: Record<MissingTimesheetStatus, string> = {
  "No Timesheet": "bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/60",
  Pending: "bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/60",
};

const VISIBLE_ROWS = 5;

/**
 * Project Timesheet Pending — PMO compliance monitor: active projects whose
 * CURRENT required reporting month has no timesheet submission at all, not
 * "projects with old timesheet history." A project disappears from this
 * list the instant that month's timesheet lands, regardless of how stale
 * its prior history is. See getMissingTimesheetProjects() for the exact
 * reporting-month/due-date logic. Refreshes with the rest of the dashboard
 * on pmo:data-changed (project create/edit, timesheet import/sync).
 */
const ProjectTimesheetPendingWidget: React.FC = () => {
  const navigate = useNavigate();
  const rows = getMissingTimesheetProjects();
  const visibleRows = rows.slice(0, VISIBLE_ROWS);
  const hasMissing = rows.length > 0;

  const goToTimesheetSection = (projectId: string) => {
    navigate(`/projects/edit/${projectId}`, { state: { tab: "team" } });
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-red-200 dark:border-red-900/60 p-3 sm:p-3.5 h-[300px] flex flex-col justify-between transition-all duration-200 hover:shadow-lg">
      {/* Header (Fixed) */}
      <div className="shrink-0 pb-1.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-full bg-red-500 shrink-0 animate-pulse shadow-xs" />
            <h3 className="text-xs sm:text-sm font-extrabold tracking-wide uppercase text-red-600 dark:text-red-400 leading-tight flex items-center gap-1 truncate">
              <span className="truncate">PROJECT TIMESHEET PENDING</span>
              <span title="Active projects whose current reporting month's timesheet has not been submitted.">
                <Info size={13} className="text-slate-400 dark:text-slate-500 hover:text-red-500 transition-colors cursor-help shrink-0" />
              </span>
            </h3>
          </div>

          <button
            type="button"
            onClick={() => navigate("/projects/timesheet-pending")}
            className="text-[11px] font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer shrink-0"
          >
            <span>View All ({rows.length})</span>
            <ArrowRight size={12} />
          </button>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight truncate">
          Projects missing the current reporting month's timesheet.
        </p>
      </div>

      {/* Scrollable List */}
      {hasMissing ? (
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar my-1 pr-0.5">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs">
              <tr className="border-b border-red-100 dark:border-red-900/40 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px] bg-red-50/60 dark:bg-slate-800/60">
                <th className="py-1.5 px-2 rounded-l-lg">PR NO. / PROJECT</th>
                <th className="py-1.5 px-2">MISSING MONTH</th>
                <th className="py-1.5 px-2 text-right rounded-r-lg">OVERDUE / STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[11px]">
              {visibleRows.map((row) => (
                <tr
                  key={row.projectId}
                  onClick={() => goToTimesheetSection(row.projectId)}
                  className="hover:bg-red-50/40 dark:hover:bg-slate-800/50 transition-colors duration-150 cursor-pointer"
                >
                  <td className="py-1.5 px-2 align-top">
                    <p className="font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">{row.prNo}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[110px]" title={row.projectName}>
                      {row.projectName}
                    </p>
                  </td>
                  <td className="py-1.5 px-2 align-top">
                    <p className="font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">{row.missingMonthLabel}</p>
                  </td>
                  <td className="py-1.5 px-2 text-right align-top">
                    <p className="font-extrabold text-slate-900 dark:text-white whitespace-nowrap">{row.overdueSinceDays} Days</p>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border mt-0.5 ${STATUS_BADGE_CLASS[row.status]}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Empty State */
        <div className="flex-1 flex flex-col items-center justify-center text-center p-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300/50 dark:border-emerald-800/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-1.5 shadow-xs">
            <CheckCircle2 size={20} />
          </div>
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100">All Caught Up</h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm">
            Every active project has submitted this reporting month's timesheet.
          </p>
        </div>
      )}

      {/* Bottom Summary Strip (Fixed) */}
      <div className="shrink-0 bg-red-50/80 dark:bg-red-950/30 border-t border-red-100 dark:border-red-900/40 -mx-3 sm:-mx-3.5 -mb-3 sm:-mb-3.5 p-2 px-3 sm:px-4 rounded-b-2xl flex items-center justify-between flex-wrap gap-1.5 text-[11px] font-semibold text-red-800 dark:text-red-300">
        <div className="flex items-center gap-1.5 truncate">
          <Clock3 size={13} className="text-red-600 shrink-0" />
          <span className="truncate">{rows.length} project{rows.length === 1 ? "" : "s"} missing this month's timesheet.</span>
        </div>

        <button
          type="button"
          onClick={() => navigate("/projects/timesheet-pending")}
          className="text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-white transition-colors flex items-center gap-1 font-bold hover:underline cursor-pointer ml-auto sm:ml-0 shrink-0"
        >
          <span>View All</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
};

export default ProjectTimesheetPendingWidget;
