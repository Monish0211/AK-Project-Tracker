import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Users, Search, ArrowUpDown, User, AlertTriangle } from "lucide-react";
import {
  fetchDashboardSummary,
  type MissingAssigneeProject,
  type TeamLeadWorkload,
} from "../../services/dashboardSummaryService";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { ApiError } from "../../services/apiClient";

/**
 * Phase 2.2 — dedicated "View All" drill-down for the Dashboard's Team
 * Leads – Project Workload widget, which shows only its top 5 (see
 * TeamLeadsWorkloadWidget.tsx). Mirrors FinancialLossProjects.tsx's own
 * pattern: same GET /dashboard/summary call, reading teamLeads.allAssigned —
 * the exact same server-computed, authorization-scoped, QuantityItem.
 * assignedTo-grouped list top5 is sliced from (see Backend's
 * buildTeamLeads()) — never a second calculation, never a fresh fetch of
 * every project into the browser just to filter client-side.
 */
export default function TeamLeadsWorkloadProjects() {
  const navigate = useNavigate();
  const { refreshKey, refresh } = useLiveRefresh();
  const [searchParams] = useSearchParams();

  const [leads, setLeads] = useState<TeamLeadWorkload[]>([]);
  const [totalReportingManagers, setTotalReportingManagers] = useState(0);
  // Sept 2026 — Missing Assignee, same server-computed list the Dashboard
  // widget shows (Backend's buildTeamLeads()) — reused as-is from the same
  // GET /dashboard/summary response this page already fetches, never a
  // second calculation.
  const [missingAssignee, setMissingAssignee] = useState<MissingAssigneeProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);

    fetchDashboardSummary()
      .then((summary) => {
        if (!isMounted) return;
        setLeads(summary.teamLeads.allAssigned);
        setTotalReportingManagers(summary.teamLeads.totalReportingManagers);
        setMissingAssignee(summary.teamLeads.missingAssignee);
      })
      .catch((err) => {
        if (!isMounted) return;
        const message =
          err instanceof ApiError
            ? err.message
            : "Unable to load Team Leads Workload data. Please try again.";
        setLoadError(message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  // Pre-filled from the Dashboard widget's row click (?search=<name>) —
  // still just the initial value of a normal, editable search box below.
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [sortField, setSortField] = useState<"activeProjectsCount" | "totalWorkOrderValue" | "reportingManager">(
    "activeProjectsCount"
  );
  const [sortAsc, setSortAsc] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const processedLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = q
      ? leads.filter((lead) => lead.reportingManager.toLowerCase().includes(q))
      : leads;

    result = [...result].sort((a, b) => {
      if (sortField === "reportingManager") {
        return sortAsc
          ? a.reportingManager.localeCompare(b.reportingManager)
          : b.reportingManager.localeCompare(a.reportingManager);
      }
      const valA = a[sortField];
      const valB = b[sortField];
      return sortAsc ? valA - valB : valB - valA;
    });

    return result;
  }, [leads, search, sortField, sortAsc]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedLeads.slice(start, start + pageSize);
  }, [processedLeads, currentPage]);

  const totalPages = Math.max(Math.ceil(processedLeads.length / pageSize), 1);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  // Sept 2026 — requests the Quantity tab via the same location.state
  // navigation mechanism EditProject.tsx already reads elsewhere in the app
  // (see ProjectTimesheetPendingWidget.tsx / TimesheetPendingProjects.tsx's
  // identical `{ state: { tab: "team" } }` precedent) — not a new
  // query-param/routing scheme. Assigned To lives in Quantity Details, so
  // landing there directly is the useful destination for this table's own
  // PR chips; every other Edit Project entry point is unaffected.
  const handleOpenProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    navigate(`/projects/edit/${projectId}`, { state: { tab: "quantity" } });
  };

  // Missing Assignee PR chips — previously opened the read-only View page;
  // now open Edit Project on the Quantity tab instead (same mechanism as
  // handleOpenProject() above), same as the Dashboard widget's own Missing
  // Assignee chips, so the user can immediately fill in Quantity Details ->
  // Assigned To for that row.
  const handleOpenMissingAssigneeProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    navigate(`/projects/edit/${projectId}`, { state: { tab: "quantity" } });
  };

  return (
    <div className="space-y-4">
      {/* Hero Header */}
      <div className="rounded-2xl p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white shadow-lg border border-blue-900/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              Dashboard Workload Drill-Down
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Team Leads – Project Workload
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              Complete list of active projects and total work order value by assigned person (Quantity → Assigned To).
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-blue-950/80 border border-blue-800/60 rounded-xl px-3.5 py-2 text-right">
              <p className="text-[10px] uppercase font-bold text-blue-300">Assigned People</p>
              <p className="text-xl font-black text-white">{totalReportingManagers}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Missing Assignee — same active-project scope as the table below, server-computed (see Backend's buildTeamLeads()); only rendered when non-empty. */}
      {missingAssignee.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-3.5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-400 shrink-0">
            <AlertTriangle size={14} className="shrink-0" />
            <span>Missing Assignee · {missingAssignee.length} Project{missingAssignee.length === 1 ? "" : "s"}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {missingAssignee.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={(e) => handleOpenMissingAssigneeProject(e, p.id)}
                title={`Open ${p.prNo}${p.projectTitle ? ` — ${p.projectTitle}` : ""}`}
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60 hover:bg-amber-200 dark:hover:bg-amber-900/60 hover:underline cursor-pointer"
              >
                {p.prNo}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0">
        {/* Card Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center rounded-xl text-blue-600 dark:text-blue-400">
              <Users size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Team Leads Workload Repository
              </h2>
              <p className="text-xs text-slate-400">
                Active projects grouped by Quantity Details' Assigned To
              </p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-900/50">
            Showing {processedLeads.length} of {totalReportingManagers} Assigned People
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 p-3 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex-wrap">
          <div className="flex flex-1 items-center gap-2 min-w-0 flex-wrap">
            <div className="relative flex-1 max-w-[320px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search assigned person..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none focus:border-blue-500"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  ×
                </button>
              )}
            </div>

            <button
              onClick={() => toggleSort("activeProjectsCount")}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              <ArrowUpDown size={12} />
              <span>Sort by Active Projects</span>
            </button>

            <button
              onClick={() => toggleSort("totalWorkOrderValue")}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              <ArrowUpDown size={12} />
              <span>Sort by WO Value</span>
            </button>
          </div>

          <button
            onClick={refresh}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
          >
            Refresh Data
          </button>
        </div>

        {/* Loading / error states — same GET /dashboard/summary call the
        Dashboard tile uses, so these mirror Dashboard.tsx's own states. */}
        {isLoading && leads.length === 0 && !loadError && (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Loading Team Leads Workload data…</p>
            <p className="text-xs text-slate-400 mt-1.5">Fetching the authoritative figures from the server.</p>
          </div>
        )}

        {loadError && leads.length === 0 && !isLoading && (
          <div className="p-10 text-center">
            <p className="text-sm font-bold text-red-600 dark:text-red-400">Unable to load Team Leads Workload data</p>
            <p className="text-xs text-slate-400 mt-1.5 max-w-lg mx-auto">{loadError}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-4 text-xs font-semibold text-blue-600 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Table */}
        {!(isLoading && leads.length === 0) && !(loadError && leads.length === 0) && (
          <div className="overflow-x-auto min-h-[300px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">ASSIGNED TO</th>
                  <th className="py-3 px-4">ACTIVE PROJECTS</th>
                  <th className="py-3 px-4 text-right">TOTAL WORK ORDER VALUE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                {paginatedLeads.length > 0 ? (
                  paginatedLeads.map((lead) => (
                    <tr
                      key={lead.reportingManager}
                      className="hover:bg-blue-50/40 dark:hover:bg-slate-800/50 transition-colors group align-top"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <User size={14} className="text-slate-400 shrink-0" />
                          <span className="font-bold text-slate-900 dark:text-slate-100" title={lead.reportingManager}>
                            {lead.reportingManager}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5 max-w-md">
                          {lead.projects.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={(e) => handleOpenProject(e, p.id)}
                              title={`Open ${p.prNo}`}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 hover:underline cursor-pointer"
                            >
                              {p.prNo}
                            </button>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {lead.activeProjectsCount}
                      </td>

                      <td className="py-3 px-4 text-right font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {lead.formattedWorkOrderValue}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-12 text-center text-slate-400">
                      {leads.length === 0
                        ? "No one is assigned (Quantity → Assigned To) on any authorized Active project yet."
                        : "No assigned people found matching search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-800 text-xs">
            <span className="text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                className="px-2.5 py-1 border border-slate-200 dark:border-slate-800 rounded-lg disabled:opacity-40"
              >
                Previous
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                className="px-2.5 py-1 border border-slate-200 dark:border-slate-800 rounded-lg disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
