import React from "react";
import { ArrowRight, User, Users, Info, CheckCircle2, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDashboardSummary } from "../DashboardSummaryContext";

const TeamLeadsWorkloadWidget: React.FC = () => {
  const navigate = useNavigate();

  const { teamLeads } = useDashboardSummary();
  const totalReportingManagers = teamLeads.totalReportingManagers;
  const top5Leads = teamLeads.top5;
  // Sept 2026 — Missing Assignee: active projects (same scope as the rest
  // of this widget) with at least one Quantity Details row that has no
  // Assigned To. Server-computed (see Backend's buildTeamLeads()) — never
  // recomputed here from raw Quantity data, and never a fake "Unassigned"
  // person entry in the table above.
  const missingAssignee = teamLeads.missingAssignee;
  // Compact by design — this card has fixed, limited height. Shows the
  // first few PR numbers inline and folds the rest into a "+N more" chip
  // that opens the full drill-down instead of growing the card. The total
  // count shown above (missingAssignee.length) is never truncated — only
  // the visible chip list is capped, so the card stays compact at any
  // scale (10, 30, 100+ missing-assignee projects).
  const MAX_VISIBLE_MISSING = 5;
  const visibleMissing = missingAssignee.slice(0, MAX_VISIBLE_MISSING);
  const hiddenMissingCount = missingAssignee.length - visibleMissing.length;

  // Phase 2.2 — this used to navigate to /manpower, which isn't this
  // widget's data at all (Manpower Master shows Employee records; this
  // widget shows QuantityItem.assignedTo workload). Opens the dedicated
  // Team Leads Workload page instead, same route-registration pattern as
  // the other Dashboard drill-downs (financial-loss, timeline-alerts,
  // timesheet-pending — see MainLayout.tsx).
  const handleNavigateToLeads = (managerName?: string) => {
    if (managerName) {
      navigate(`/projects/team-leads-workload?search=${encodeURIComponent(managerName)}`);
    } else {
      navigate("/projects/team-leads-workload");
    }
  };

  // Aug 2026 — each workload row now carries its own assigned projects
  // (see Backend's buildTeamLeads(), sourced from QuantityItem.assignedTo).
  // Opens the SAME project edit route every other project-click already
  // uses in this app (e.g. ProjectsInLossHoursWidget.tsx) — not a new
  // routing system. stopPropagation so clicking a PR chip doesn't also
  // trigger the row's own onClick (which navigates to Manpower search).
  //
  // Sept 2026 — now also requests the Quantity tab via the SAME
  // location.state navigation mechanism EditProject.tsx already reads
  // elsewhere in the app (see ProjectTimesheetPendingWidget.tsx /
  // TimesheetPendingProjects.tsx's identical `{ state: { tab: "team" } }`
  // precedent) — not a new query-param/routing scheme. This is a workload
  // row for a person's Assigned To, so landing directly on Quantity Details
  // (where Assigned To actually lives) is the useful destination; every
  // OTHER Edit Project entry point (Project Repository, etc.) is untouched
  // and keeps opening on its own default tab, since none of them pass this
  // state.
  const handleOpenProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    navigate(`/projects/edit/${projectId}`, { state: { tab: "quantity" } });
  };

  // Missing Assignee PR chips — previously opened the read-only View page;
  // now open Edit Project on the Quantity tab instead (same mechanism as
  // handleOpenProject() above), since the whole point of a Missing Assignee
  // chip is to let the user immediately fill in Quantity Details → Assigned
  // To for that row, not just look at the project.
  const handleOpenMissingAssigneeProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    navigate(`/projects/edit/${projectId}`, { state: { tab: "quantity" } });
  };

  const renderProjectChips = (projects: { id: string; prNo: string }[]) => (
    <div className="flex flex-wrap gap-1 mt-1">
      {projects.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={(e) => handleOpenProject(e, p.id)}
          title={`Open ${p.prNo}`}
          className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:underline cursor-pointer truncate max-w-[110px]"
        >
          {p.prNo}
        </button>
      ))}
    </div>
  );

  const hasLeads = top5Leads.length > 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-blue-200 dark:border-blue-900/60 p-3 sm:p-3.5 h-[300px] flex flex-col justify-between transition-all duration-200 hover:shadow-lg">
      {/* Header (Fixed) */}
      <div className="shrink-0 pb-1.5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-full bg-blue-600 shrink-0 animate-pulse shadow-xs" />
            <h3 className="text-xs sm:text-sm font-extrabold tracking-wide uppercase text-blue-600 dark:text-blue-400 leading-tight flex items-center gap-1 truncate">
              <span className="truncate">TEAM LEADS – PROJECT WORKLOAD</span>
              <span title="Active projects and total work order value by assigned person (Quantity → Assigned To).">
                <Info size={13} className="text-slate-400 dark:text-slate-500 hover:text-blue-500 transition-colors cursor-help shrink-0" />
              </span>
            </h3>
          </div>

          <button
            type="button"
            onClick={() => handleNavigateToLeads()}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer shrink-0"
          >
            <span>View All ({totalReportingManagers})</span>
            <ArrowRight size={12} />
          </button>
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight truncate">
          Active projects and total work order value by assigned person.
        </p>
      </div>

      {/* Scrollable Table Body Container */}
      {hasLeads ? (
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar my-1 pr-0.5">
          {/* Desktop & Tablet Table */}
          <div className="hidden sm:block">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shadow-xs">
                <tr className="border-b border-blue-100 dark:border-blue-900/40 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[9.5px] bg-blue-50/60 dark:bg-slate-800/60">
                  <th className="py-1.5 px-2 rounded-l-lg">ASSIGNED TO</th>
                  <th className="py-1.5 px-2">ACTIVE PROJECTS</th>
                  <th className="py-1.5 px-2 rounded-r-lg">TOTAL WORK ORDER VALUE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-[11px]">
                {top5Leads.map((lead) => (
                  <tr
                    key={lead.reportingManager}
                    onClick={() => handleNavigateToLeads(lead.reportingManager)}
                    className="hover:bg-blue-50/40 dark:hover:bg-slate-800/50 transition-colors duration-150 group cursor-pointer"
                  >
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <User
                          size={13}
                          className="text-slate-400 dark:text-slate-500 shrink-0 group-hover:text-blue-500 transition-colors"
                        />
                        <span
                          className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:underline truncate max-w-[140px] lg:max-w-[180px]"
                          title={lead.reportingManager}
                        >
                          {lead.reportingManager}
                        </span>
                      </div>
                      {renderProjectChips(lead.projects)}
                    </td>

                    <td className="py-1.5 px-2 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {lead.activeProjectsCount}
                    </td>

                    <td className="py-1.5 px-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {lead.formattedWorkOrderValue}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked View */}
          <div className="sm:hidden space-y-2">
            {top5Leads.map((lead) => (
              <div
                key={lead.reportingManager}
                onClick={() => handleNavigateToLeads(lead.reportingManager)}
                className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 hover:bg-blue-50/50 dark:hover:bg-slate-800/80 transition-all cursor-pointer space-y-1.5"
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <User size={13} className="text-slate-400 shrink-0" />
                  <span className="font-bold text-blue-600 dark:text-blue-400 hover:underline truncate">
                    {lead.reportingManager}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60 text-[10.5px]">
                  <div>
                    <p className="text-slate-400 text-[9.5px] uppercase font-medium">Active Projects</p>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{lead.activeProjectsCount}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-[9.5px] uppercase font-medium">Work Order Value</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-300">{lead.formattedWorkOrderValue}</p>
                  </div>
                </div>

                {renderProjectChips(lead.projects)}
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
            <span>✅ All Balanced</span>
          </h4>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 max-w-sm">
            No one is assigned (Quantity → Assigned To) on any authorized Active project yet.
          </p>
        </div>
      )}

      {/* Missing Assignee (Fixed, compact — only rendered when non-empty) */}
      {missingAssignee.length > 0 && (
        <div className="shrink-0 mt-1.5 pt-1.5 border-t border-amber-200/70 dark:border-amber-900/40">
          <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            <AlertTriangle size={12} className="shrink-0" />
            <span>Missing Assignee · {missingAssignee.length} Project{missingAssignee.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {visibleMissing.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={(e) => handleOpenMissingAssigneeProject(e, p.id)}
                title={`Open ${p.prNo}${p.projectTitle ? ` — ${p.projectTitle}` : ""}`}
                className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 hover:underline cursor-pointer truncate max-w-[110px]"
              >
                {p.prNo}
              </button>
            ))}
            {hiddenMissingCount > 0 && (
              <button
                type="button"
                onClick={() => handleNavigateToLeads()}
                className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
              >
                +{hiddenMissingCount} more
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Summary Strip (Fixed) */}
      <div className="shrink-0 bg-blue-50/80 dark:bg-blue-950/40 border-t border-blue-100 dark:border-blue-900/40 -mx-3 sm:-mx-3.5 -mb-3 sm:-mb-3.5 p-2 px-3 sm:px-4 rounded-b-2xl flex items-center justify-between flex-wrap gap-1.5 text-[11px] font-semibold text-blue-800 dark:text-blue-300">
        <div className="flex items-center gap-1.5 truncate">
          <Users size={13} className="text-blue-600 shrink-0" />
          <span className="truncate">{totalReportingManagers} people are assigned to active projects.</span>
        </div>

        <button
          type="button"
          onClick={() => handleNavigateToLeads()}
          className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-white transition-colors flex items-center gap-1 font-bold hover:underline cursor-pointer ml-auto sm:ml-0 shrink-0"
        >
          <span>View All Leads</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
};

export default TeamLeadsWorkloadWidget;
