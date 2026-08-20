import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ExcelJS from "exceljs";
import { Search, Clock3 } from "lucide-react";
import { fetchTimesheetPendingProjects, type TimesheetPendingProjectRow } from "../../services/timesheetPendingService";
import { formatDisplayDate } from "../../services/timesheetService";
import { downloadWorkbook } from "../../services/projectWorkbookService";

/**
 * Project Timesheet Pending Repository — the "View All" destination for the
 * Dashboard's Project Timesheet Pending widget. Same backend source of
 * truth (GET /timesheets/pending-projects — see
 * Backend/src/modules/timesheets/services/timesheetPending.service.ts for
 * the confirmed rule), with search, filtering, pagination, and export.
 * Every row returned is already PENDING (a compliant project is simply
 * absent) — there is no separate status filter to apply here, since there
 * is nothing to distinguish between rows on that axis.
 */
export default function TimesheetPendingProjects() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<TimesheetPendingProjectRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [managerFilter, setManagerFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const load = () => {
    setLoadError(false);
    fetchTimesheetPendingProjects()
      .then(setRows)
      .catch((err) => {
        console.warn("Failed to load Timesheet Pending projects:", err);
        setRows([]);
        setLoadError(true);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
    window.addEventListener("pmo:data-changed", load);
    return () => window.removeEventListener("pmo:data-changed", load);
  }, []);

  const departments = useMemo(() => {
    const set = new Set(rows.map((r) => r.department).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [rows]);

  const managers = useMemo(() => {
    const set = new Set(rows.map((r) => r.projectManager).filter((m): m is string => !!m));
    return ["All", ...Array.from(set).sort()];
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (departmentFilter !== "All" && row.department !== departmentFilter) return false;
      if (managerFilter !== "All" && row.projectManager !== managerFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        row.prNo.toLowerCase().includes(q) ||
        row.projectTitle.toLowerCase().includes(q) ||
        row.department.toLowerCase().includes(q) ||
        (row.projectManager ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, departmentFilter, managerFilter]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage]);

  const totalPages = Math.max(Math.ceil(filteredRows.length / pageSize), 1);

  const handleExport = async () => {
    if (filteredRows.length === 0) {
      alert("No matching timesheet-pending projects to export.");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Timesheet Pending");
    sheet.columns = [
      { header: "PR Number", key: "prNo", width: 16 },
      { header: "Project Name", key: "projectTitle", width: 28 },
      { header: "Department", key: "department", width: 22 },
      { header: "Project Manager", key: "projectManager", width: 20 },
      { header: "Last Timesheet Date", key: "latestTimesheetDate", width: 18 },
      { header: "Tracking Since", key: "trackingStartDate", width: 18 },
      { header: "Days Pending", key: "daysSinceLatestTimesheet", width: 14 },
      { header: "Status", key: "status", width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };
    filteredRows.forEach((row) =>
      sheet.addRow({
        ...row,
        latestTimesheetDate: row.latestTimesheetDate ? formatDisplayDate(row.latestTimesheetDate) : "No Timesheet",
        trackingStartDate: row.trackingStartDate ? formatDisplayDate(row.trackingStartDate) : "—",
      })
    );

    await downloadWorkbook(workbook, "project_timesheet_pending_export.xlsx");
  };

  return (
    <div className="space-y-4">
      {/* Hero Header */}
      <div className="rounded-2xl p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-red-950 to-slate-900 text-white shadow-lg border border-red-900/40 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              PMO Timesheet Compliance Drill-Down
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Project Timesheet Pending Repository</h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              Active projects with no timesheet entry logged in the last 7 days.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-3.5 py-2 rounded-xl backdrop-blur-md transition-all text-xs cursor-pointer shadow-xs"
            >
              Export to Excel
            </button>
            <div className="bg-red-950/80 border border-red-800/60 rounded-xl px-3.5 py-2 text-right">
              <p className="text-[10px] uppercase font-bold text-red-300">Pending Timesheets</p>
              <p className="text-xl font-black text-white">{rows.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0">
        {/* Card Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-50 dark:bg-red-950/30 flex items-center justify-center rounded-xl text-red-600 dark:text-red-400">
              <Clock3 size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Timesheet Pending Repository</h2>
              <p className="text-xs text-slate-400">Ordered by days since last timesheet — highest (most overdue) first.</p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 rounded-full border border-red-200 dark:border-red-900/50">
            Showing {filteredRows.length} of {rows.length} Pending
          </span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 p-3 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex-wrap">
          <div className="flex flex-1 items-center gap-2 min-w-0 flex-wrap">
            <div className="relative flex-1 max-w-[320px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search PR · Project · Manager..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-8 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none focus:border-red-500"
              />
              {search && (
                <button onClick={() => { setSearch(""); setCurrentPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  ×
                </button>
              )}
            </div>

            <select
              value={departmentFilter}
              onChange={(e) => { setDepartmentFilter(e.target.value); setCurrentPage(1); }}
              className="py-1.5 px-2.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none focus:border-red-500"
            >
              {departments.map((d) => (
                <option key={d} value={d}>{d === "All" ? "All Departments" : d}</option>
              ))}
            </select>

            <select
              value={managerFilter}
              onChange={(e) => { setManagerFilter(e.target.value); setCurrentPage(1); }}
              className="py-1.5 px-2.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none focus:border-red-500"
            >
              {managers.map((m) => (
                <option key={m} value={m}>{m === "All" ? "All Project Managers" : m}</option>
              ))}
            </select>
          </div>

          <button
            onClick={load}
            className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 hover:underline cursor-pointer"
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
                <th className="py-3 px-4">PROJECT NAME</th>
                <th className="py-3 px-4">DEPARTMENT</th>
                <th className="py-3 px-4">PROJECT MANAGER</th>
                <th className="py-3 px-4">LAST TIMESHEET</th>
                <th className="py-3 px-4 text-right">DAYS PENDING</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Timesheet Pending could not be loaded from the server. Use Refresh Data to try again.
                  </td>
                </tr>
              ) : paginatedRows.length > 0 ? (
                paginatedRows.map((row) => (
                  <tr key={row.projectId} className="hover:bg-red-50/40 dark:hover:bg-slate-800/50 transition-colors group">
                    <td
                      className="py-3 px-4 font-bold text-red-600 dark:text-red-400 group-hover:underline whitespace-nowrap cursor-pointer"
                      onClick={() => navigate(`/projects/edit/${row.projectId}`, { state: { tab: "team" } })}
                    >
                      {row.prNo}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[220px] block" title={row.projectTitle}>
                        {row.projectTitle}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">{row.department}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">{row.projectManager ?? "—"}</td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
                      {row.latestTimesheetDate ? (
                        formatDisplayDate(row.latestTimesheetDate)
                      ) : (
                        <span>
                          No Timesheet
                          {row.trackingStartDate && (
                            <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                              Since {formatDisplayDate(row.trackingStartDate)}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span className="font-extrabold text-slate-900 dark:text-slate-100">{row.daysSinceLatestTimesheet} Days</span>
                      <span className="inline-flex items-center px-2.5 py-0.5 ml-2 rounded-full text-[10px] font-bold shadow-xs bg-orange-500 text-white">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No projects with a pending timesheet match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-800 text-xs">
            <span className="text-slate-500">Page {currentPage} of {totalPages}</span>
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
