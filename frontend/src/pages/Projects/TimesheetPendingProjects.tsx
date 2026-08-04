import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ExcelJS from "exceljs";
import { Search, Clock3 } from "lucide-react";
import {
  getMissingTimesheetProjects,
  type MissingTimesheetProjectRow,
  type MissingTimesheetStatus,
} from "../../services/timesheetPendingService";
import { downloadWorkbook } from "../../services/projectWorkbookService";

const STATUS_FILTERS = ["All", "Pending", "No Timesheet"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_BADGE_CLASS: Record<MissingTimesheetStatus, string> = {
  "No Timesheet": "bg-red-500 text-white",
  Pending: "bg-orange-500 text-white",
};

const FILTER_CHIP_CLASS: Record<StatusFilter, { active: string; inactive: string }> = {
  All: {
    active: "bg-slate-800 border-slate-800 text-white dark:bg-slate-100 dark:border-slate-100 dark:text-slate-900",
    inactive: "bg-white border-slate-200 text-slate-700 hover:bg-slate-100 dark:bg-slate-950 dark:border-slate-800 dark:text-slate-300",
  },
  Pending: {
    active: "bg-orange-500 border-orange-500 text-white",
    inactive: "bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 dark:bg-orange-950/30 dark:border-orange-900/60 dark:text-orange-300",
  },
  "No Timesheet": {
    active: "bg-red-500 border-red-500 text-white",
    inactive: "bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-950/30 dark:border-red-900/60 dark:text-red-300",
  },
};

/**
 * Project Timesheet Pending Repository — the "View All" destination for the
 * dashboard's Project Timesheet Pending widget. Same underlying
 * getMissingTimesheetProjects() compliance data (current reporting month
 * submitted or not — never "last submission is old"), with full search,
 * filtering, pagination, and export.
 */
export default function TimesheetPendingProjects() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<MissingTimesheetProjectRow[]>(() => getMissingTimesheetProjects());

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [managerFilter, setManagerFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    const handleDataChange = () => setRows(getMissingTimesheetProjects());
    window.addEventListener("pmo:data-changed", handleDataChange);
    return () => window.removeEventListener("pmo:data-changed", handleDataChange);
  }, []);

  const departments = useMemo(() => {
    const set = new Set(rows.map((r) => r.department).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [rows]);

  const managers = useMemo(() => {
    const set = new Set(rows.map((r) => r.projectManager).filter((m) => m && m !== "—"));
    return ["All", ...Array.from(set).sort()];
  }, [rows]);

  const statusCounts = useMemo(
    () => ({
      All: rows.length,
      Pending: rows.filter((r) => r.status === "Pending").length,
      "No Timesheet": rows.filter((r) => r.status === "No Timesheet").length,
    }),
    [rows]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "All" && row.status !== statusFilter) return false;
      if (departmentFilter !== "All" && row.department !== departmentFilter) return false;
      if (managerFilter !== "All" && row.projectManager !== managerFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        row.prNo.toLowerCase().includes(q) ||
        row.projectName.toLowerCase().includes(q) ||
        row.department.toLowerCase().includes(q) ||
        row.projectManager.toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter, departmentFilter, managerFilter]);

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
      { header: "Project Name", key: "projectName", width: 28 },
      { header: "Department", key: "department", width: 22 },
      { header: "Project Manager", key: "projectManager", width: 20 },
      { header: "Missing Timesheet Month", key: "missingMonthLabel", width: 20 },
      { header: "Overdue Since (Days)", key: "overdueSinceDays", width: 16 },
      { header: "Status", key: "status", width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };
    filteredRows.forEach((row) => sheet.addRow(row));

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
              Active projects that have not submitted the current reporting month's timesheet.
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
              <p className="text-[10px] uppercase font-bold text-red-300">Missing Timesheets</p>
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
              <p className="text-xs text-slate-400">Ordered by Overdue Since — highest (most overdue) first.</p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 rounded-full border border-red-200 dark:border-red-900/50">
            Showing {filteredRows.length} of {rows.length} Missing
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

            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 max-w-full" aria-label="Status filters">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => { setStatusFilter(filter); setCurrentPage(1); }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                    statusFilter === filter ? FILTER_CHIP_CLASS[filter].active : FILTER_CHIP_CLASS[filter].inactive
                  }`}
                  aria-pressed={statusFilter === filter}
                >
                  {filter} ({statusCounts[filter]})
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setRows(getMissingTimesheetProjects())}
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
                <th className="py-3 px-4">MISSING TIMESHEET MONTH</th>
                <th className="py-3 px-4 text-right">OVERDUE SINCE</th>
                <th className="py-3 px-4 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {paginatedRows.length > 0 ? (
                paginatedRows.map((row) => (
                  <tr key={row.projectId} className="hover:bg-red-50/40 dark:hover:bg-slate-800/50 transition-colors group">
                    <td
                      className="py-3 px-4 font-bold text-red-600 dark:text-red-400 group-hover:underline whitespace-nowrap cursor-pointer"
                      onClick={() => navigate(`/projects/edit/${row.projectId}`, { state: { tab: "team" } })}
                    >
                      {row.prNo}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[220px] block" title={row.projectName}>
                        {row.projectName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">{row.department}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">{row.projectManager}</td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">{row.missingMonthLabel}</td>
                    <td className="py-3 px-4 text-right font-extrabold text-slate-900 dark:text-slate-100 whitespace-nowrap">{row.overdueSinceDays} Days</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-xs ${STATUS_BADGE_CLASS[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No projects missing this reporting month's timesheet matching your filters.
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
