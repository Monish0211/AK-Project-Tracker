import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderKanban,
  Search,
  ArrowUpDown,
  Download,
  AlertTriangle,
} from "lucide-react";
import { getProjects } from "../../services/projectService";
import {
  fetchDashboardSummary,
  type HoursOverrunProject,
} from "../../services/dashboardSummaryService";
import {
  buildExportWorkbook,
  downloadWorkbook,
} from "../../services/projectWorkbookService";
import { usePmoToast } from "../../components/ui/usePmoToast";
import { useLiveRefresh } from "../../hooks/useLiveRefresh";
import { ApiError } from "../../services/apiClient";

export default function FinancialLossProjects() {
  const navigate = useNavigate();
  const { showToast } = usePmoToast();
  const { refreshKey, refresh } = useLiveRefresh();

  // P2-05 — server-authoritative: the exact same calculation
  // (Backend/src/modules/dashboard/services/dashboard.service.ts's
  // buildHoursOverrun()) the Dashboard tile (ProjectsInLossHoursWidget)
  // renders, via the same GET /dashboard/summary endpoint. No
  // client-side recomputation of budget/actual hours, no read of the
  // frontend project localStorage mirror for the Financial Loss
  // determination itself — see hoursOverrun.allMatching's own comment in
  // dashboardSummaryService.ts.
  const [lossProjects, setLossProjects] = useState<HoursOverrunProject[]>([]);
  const [totalMatchingProjects, setTotalMatchingProjects] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);

    fetchDashboardSummary()
      .then((summary) => {
        if (!isMounted) return;
        setLossProjects(summary.hoursOverrun.allMatching);
        setTotalMatchingProjects(summary.hoursOverrun.totalMatchingProjects);
      })
      .catch((err) => {
        if (!isMounted) return;
        const message =
          err instanceof ApiError
            ? err.message
            : "Unable to load Financial Loss data. Please try again.";
        setLoadError(message);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  // Search & Sorting state
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<string>("hoursOverrun");
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Filtered & Sorted list
  const processedProjects = useMemo(() => {
    let result = lossProjects.filter((item) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        item.prNumber.toLowerCase().includes(q) ||
        item.projectName.toLowerCase().includes(q) ||
        (item.projectManager || "").toLowerCase().includes(q)
      );
    });

    result.sort((a, b) => {
      let valA: any = a[sortField as keyof typeof a] ?? "";
      let valB: any = b[sortField as keyof typeof b] ?? "";

      if (typeof valA === "string") {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
      }
    });

    return result;
  }, [lossProjects, search, sortField, sortAsc]);

  // Reset pagination when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Paginated slice
  const paginatedProjects = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedProjects.slice(start, start + pageSize);
  }, [processedProjects, currentPage]);

  const totalPages = Math.max(Math.ceil(processedProjects.length / pageSize), 1);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleExport = async () => {
    const allProjects = getProjects();
    const lossIds = new Set(lossProjects.map((p) => p.id));
    const exportData = allProjects.filter((p) => lossIds.has(p.id));

    if (exportData.length === 0) {
      showToast({ type: "info", message: "No financial loss project data available to export." });
      return;
    }
    const workbook = await buildExportWorkbook(exportData);
    await downloadWorkbook(workbook, "financial_loss_projects_export.xlsx");
  };

  return (
    <div className="space-y-4">
      {/* Hero Header */}
      <div className="rounded-2xl p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-rose-950 to-slate-900 text-white shadow-lg border border-rose-900/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              Executive Financial Alert Drill-Down
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Financial Loss Projects
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              Dedicated repository for projects where actual engineering man-hours have exceeded approved budgeted hours.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-3.5 py-2 rounded-xl backdrop-blur-md transition-all text-xs cursor-pointer shadow-xs"
            >
              <Download size={14} />
              Export List
            </button>
            <div className="bg-rose-950/80 border border-rose-800/60 rounded-xl px-3.5 py-2 text-right">
              <p className="text-[10px] uppercase font-bold text-rose-300">Loss Projects</p>
              <p className="text-xl font-black text-white">{totalMatchingProjects}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0">
        {/* Card Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center rounded-xl text-rose-600 dark:text-rose-400">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Financial Loss Repository
              </h2>
              <p className="text-xs text-slate-400">
                Proactive tracking for engineering hours overrun & budget variance
              </p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded-full border border-rose-200 dark:border-rose-900/50">
            Showing {processedProjects.length} of {totalMatchingProjects} Loss Projects
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 p-3 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex-wrap">
          <div className="flex flex-1 items-center gap-2 min-w-0 flex-wrap">
            <div className="relative flex-1 max-w-[320px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search PR No · Project · Manager..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none focus:border-rose-500"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  ×
                </button>
              )}
            </div>

            <button
              onClick={() => toggleSort("hoursOverrun")}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              <ArrowUpDown size={12} />
              <span>Sort by Overrun</span>
            </button>
          </div>

          <button
            onClick={refresh}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 hover:underline cursor-pointer"
          >
            Refresh Data
          </button>
        </div>

        {/* Loading / error states — same GET /dashboard/summary call the
        Dashboard tile uses, so these mirror Dashboard.tsx's own states. */}
        {isLoading && lossProjects.length === 0 && !loadError && (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Loading Financial Loss data…</p>
            <p className="text-xs text-slate-400 mt-1.5">Fetching the authoritative figures from the server.</p>
          </div>
        )}

        {loadError && lossProjects.length === 0 && !isLoading && (
          <div className="p-10 text-center">
            <p className="text-sm font-bold text-red-600 dark:text-red-400">Unable to load Financial Loss data</p>
            <p className="text-xs text-slate-400 mt-1.5 max-w-lg mx-auto">{loadError}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-4 text-xs font-semibold text-rose-600 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Table */}
        {!(isLoading && lossProjects.length === 0) && !(loadError && lossProjects.length === 0) && (
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">PR NO.</th>
                <th className="py-3 px-4">PROJECT</th>
                <th className="py-3 px-4">PROJECT MANAGER</th>
                <th className="py-3 px-4 text-right">BUDGET HOURS</th>
                <th className="py-3 px-4 text-right">ACTUAL HOURS</th>
                <th className="py-3 px-4 text-right">HOURS OVERRUN</th>
                <th className="py-3 px-4 text-right">% OVERRUN</th>
                <th className="py-3 px-4 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {paginatedProjects.length > 0 ? (
                paginatedProjects.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => navigate(`/projects/edit/${item.id}`)}
                    className="hover:bg-rose-50/40 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-bold text-rose-600 dark:text-rose-400 group-hover:underline whitespace-nowrap">
                      {item.prNumber}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 max-w-xs">
                        <FolderKanban size={14} className="text-slate-400 shrink-0 group-hover:text-rose-500 transition-colors" />
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate" title={item.projectName}>
                          {item.projectName}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {item.projectManager || "Unassigned"}
                    </td>

                    <td className="py-3 px-4 text-right tabular-nums font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {item.formattedBudgetHours}
                    </td>

                    <td className="py-3 px-4 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {item.formattedActualHours}
                    </td>

                    <td className="py-3 px-4 text-right tabular-nums font-extrabold text-red-600 dark:text-red-400 whitespace-nowrap">
                      {item.formattedHoursOverrun}
                    </td>

                    <td className="py-3 px-4 text-right tabular-nums font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                      {item.formattedPercentOverrun}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60 shadow-xs">
                        Loss
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    No financial loss projects found matching search.
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
