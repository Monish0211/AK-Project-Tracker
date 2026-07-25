import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderKanban,
  Search,
  ArrowUpDown,
  Download,
  Clock,
} from "lucide-react";
import { getProjects } from "../../services/projectService";
import {
  getProjectTimelineAlerts,
  type DurationOverrunProjectSummary,
  type TimelineAlertPriority,
} from "../../services/dashboardService";
import {
  buildExportWorkbook,
  downloadWorkbook,
} from "../../services/projectWorkbookService";

export default function TimelineAlertProjects() {
  const navigate = useNavigate();

  // Retrieve timeline alert data live (excludes On Track projects for drill-down)
  const [alertProjects, setAlertProjects] = useState<DurationOverrunProjectSummary[]>(
    () => getProjectTimelineAlerts().allAlertProjects
  );

  // Search & Sorting state
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<string>("sortRank");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Live synchronization whenever project or dates data changes
  useEffect(() => {
    const handleDataChange = () => {
      setAlertProjects(getProjectTimelineAlerts().allAlertProjects);
    };
    window.addEventListener("pmo:data-changed", handleDataChange);
    return () => {
      window.removeEventListener("pmo:data-changed", handleDataChange);
    };
  }, []);

  // Enrich with client & PM info
  const enrichedProjects = useMemo(() => {
    const allProjects = getProjects();
    const map = new Map(allProjects.map((p) => [p.id, p]));

    return alertProjects.map((item) => {
      const p = map.get(item.id);
      return {
        ...item,
        clientName: p?.client || "Unknown Client",
        projectManager: p?.primaryProjectManager || "Unassigned",
        projectTitleOnly: p?.projectTitle || item.projectName,
      };
    });
  }, [alertProjects]);

  // Filtered & Sorted list
  const processedProjects = useMemo(() => {
    let result = enrichedProjects.filter((item) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        item.prNumber.toLowerCase().includes(q) ||
        item.clientName.toLowerCase().includes(q) ||
        item.projectName.toLowerCase().includes(q) ||
        item.projectManager.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q)
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
  }, [enrichedProjects, search, sortField, sortAsc]);

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
      setSortAsc(true);
    }
  };

  const handleExport = async () => {
    const allProjects = getProjects();
    const alertIds = new Set(alertProjects.map((p) => p.id));
    const exportData = allProjects.filter((p) => alertIds.has(p.id));

    if (exportData.length === 0) {
      alert("No timeline alert project data available to export.");
      return;
    }
    const workbook = await buildExportWorkbook(exportData);
    await downloadWorkbook(workbook, "timeline_alert_projects_export.xlsx");
  };



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
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] shadow-xs ${bgCls}`}>
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
    <div className="space-y-4">
      {/* Hero Header */}
      <div className="rounded-2xl p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-orange-950 to-slate-900 text-white shadow-lg border border-orange-900/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
              Executive Schedule Alert Drill-Down
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Timeline Alert Projects
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              Dedicated repository for projects requiring schedule attention (Due Soon, Upcoming, Due Today, Overdue). Excludes On Track projects.
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
            <div className="bg-orange-950/80 border border-orange-800/60 rounded-xl px-3.5 py-2 text-right">
              <p className="text-[10px] uppercase font-bold text-orange-300">Alert Projects</p>
              <p className="text-xl font-black text-white">{alertProjects.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0">
        {/* Card Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-50 dark:bg-orange-950/30 flex items-center justify-center rounded-xl text-orange-600 dark:text-orange-400">
              <Clock size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Timeline Alert Repository
              </h2>
              <p className="text-xs text-slate-400">
                Proactive schedule monitoring ordered by urgency (Due Soon → Upcoming → Due Today → Overdue)
              </p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 rounded-full border border-orange-200 dark:border-orange-900/50">
            Showing {processedProjects.length} of {alertProjects.length} Alert Projects
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 p-3 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex-wrap">
          <div className="flex flex-1 items-center gap-2 min-w-0 flex-wrap">
            <div className="relative flex-1 max-w-[320px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search PR No · Client · Project · Manager · Status..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none focus:border-orange-500"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  ×
                </button>
              )}
            </div>

            <button
              onClick={() => toggleSort("sortRank")}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors"
            >
              <ArrowUpDown size={12} />
              <span>Sort by Priority</span>
            </button>
          </div>

          <button
            onClick={() => setAlertProjects(getProjectTimelineAlerts().allAlertProjects)}
            className="text-xs font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 hover:underline cursor-pointer"
          >
            Refresh Data
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">PR NO.</th>
                <th className="py-3 px-4">CLIENT</th>
                <th className="py-3 px-4">PROJECT</th>
                <th className="py-3 px-4">DAYS REMAINING / OVERDUE</th>
                <th className="py-3 px-4">START DATE</th>
                <th className="py-3 px-4">END DATE</th>
                <th className="py-3 px-4 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {paginatedProjects.length > 0 ? (
                paginatedProjects.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => navigate(`/projects/edit/${item.id}`)}
                    className="hover:bg-orange-50/40 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-bold text-orange-600 dark:text-orange-400 group-hover:underline whitespace-nowrap">
                      {item.prNumber}
                    </td>

                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                      {item.clientName}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 max-w-xs">
                        <FolderKanban size={14} className="text-slate-400 shrink-0 group-hover:text-orange-500 transition-colors" />
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate" title={item.projectTitleOnly}>
                          {item.projectTitleOnly}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={getDaysDisplayClass(item.priority)}>
                        {item.daysDisplay}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">
                      {item.startDate}
                    </td>

                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                      {item.endDate}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {renderStatusBadge(item.priority, item.status)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No timeline alert projects found matching search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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
