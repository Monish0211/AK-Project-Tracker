import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Archive as ArchiveIcon, Eye, RotateCcw, Download, ArrowUpDown, FolderKanban, ShieldAlert } from "lucide-react";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import type { Project } from "../../types/Project";
import {
  fetchArchivedProjectsFromApi,
  permanentlyDeleteProjectViaApi,
  restoreProjectViaApi,
} from "../../services/projectService";
import { buildExportWorkbook, downloadWorkbook } from "../../services/projectWorkbookService";
import { getDepartmentOptions } from "../../services/departmentDirectoryService";
import { ApiError } from "../../services/apiClient";
import { useAuth } from "../../auth/authContext";
import { canMutateData, hasApprovalPermission } from "../../auth/permissions";

/** Sort fields the backend's GET /projects can order by — see listProjectsQuerySchema. */
const BACKEND_SORTABLE_FIELDS = new Set(["prNo", "client", "projectTitle", "department", "projectStartDate", "createdAt"]);

const renderProjectStatusBadge = (status: string) => {
  const map: Record<string, string> = {
    Active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50",
    "On Hold": "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50",
    Completed: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50",
    Cancelled: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
  };
  const cls = map[status] || map.Cancelled;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>{status || "—"}</span>;
};

const formatArchivedOn = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Archived Projects — the "Recycle Bin" for the Projects module. Backend
 * source of truth: GET /projects?isDeleted=true (see
 * fetchArchivedProjectsFromApi in projectService.ts). Deliberately does NOT
 * read/write the localStorage "projects" mirror — archived rows never enter
 * it (see archiveProjectViaApi), so this page is purely API-driven, same
 * precedent as TimesheetPendingProjects.tsx. View + Restore are available to
 * every user with Projects module access; Permanent Delete reuses the same
 * "Delete Project Permanently" approval gate and DELETE /projects/:id/permanent
 * API as Project Repository (see Projects.tsx).
 */
export default function ArchivedProjects() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canMutate = canMutateData(user);
  const canPermanentlyDelete = canMutate && hasApprovalPermission(user, "Delete Project Permanently");

  const [rows, setRows] = useState<Project[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [sortField, setSortField] = useState("deletedAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [recoverTarget, setRecoverTarget] = useState<Project | null>(null);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<Project | null>(null);

  const departments = useMemo(() => ["All", ...getDepartmentOptions()], []);

  const load = () => {
    setLoadError(false);
    const backendSortField = BACKEND_SORTABLE_FIELDS.has(sortField) ? sortField : "prNo";
    fetchArchivedProjectsFromApi({
      search: search || undefined,
      department: department !== "All" ? department : undefined,
      page: currentPage,
      pageSize,
      sortField: backendSortField,
      sortDirection: sortAsc ? "asc" : "desc",
    })
      .then((result) => {
        setRows(result.items);
        setTotal(result.total);
      })
      .catch((err) => {
        console.warn("Failed to load Archived Projects:", err);
        setRows([]);
        setTotal(0);
        setLoadError(true);
      })
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, department, sortField, sortAsc, currentPage]);

  useEffect(() => {
    window.addEventListener("pmo:data-changed", load);
    return () => window.removeEventListener("pmo:data-changed", load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, department]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleRecover = async (project: Project) => {
    try {
      await restoreProjectViaApi(project.id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Failed to recover project. Please try again.");
      return;
    }
    setSuccessMessage(`"${project.prNo}" recovered to the Project Repository.`);
    load();
  };

  /** Same DELETE /projects/:id/permanent as Project Repository — backend enforces the approval permission. */
  const handlePermanentDelete = async (project: Project) => {
    try {
      await permanentlyDeleteProjectViaApi(project.id);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          alert("You do not have permission to permanently delete projects.");
        } else if (err.status === 404) {
          alert("This project is no longer available. It may have already been deleted.");
        } else if (err.status === 409) {
          alert(err.message || "This project cannot be permanently deleted right now.");
        } else if (err.status === 401) {
          alert("Your session has expired. Please sign in again.");
        } else {
          alert(err.message || "Failed to permanently delete project. Please try again.");
        }
      } else {
        alert("Failed to permanently delete project. Please try again.");
      }
      return;
    }
    setSuccessMessage(`"${project.prNo}" permanently deleted.`);
    load();
  };

  const handleExport = async () => {
    if (rows.length === 0) {
      alert("No archived projects to export.");
      return;
    }
    const workbook = await buildExportWorkbook(rows);
    await downloadWorkbook(workbook, "archived_projects_export.xlsx");
  };

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <div className="space-y-4">
      {/* Hero Header */}
      <div className="rounded-2xl p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white shadow-lg border border-slate-700/50 relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              iFluids Engineering · Project Management Office
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Archived Projects</h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
              These projects are archived and can be recovered. All project information and history remains intact.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-3.5 py-2 rounded-xl backdrop-blur-md transition-all text-xs cursor-pointer shadow-xs"
            >
              <Download size={14} />
              Export
            </button>
            <div className="bg-slate-950/70 border border-slate-700/60 rounded-xl px-3.5 py-2 text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1 justify-end">
                <FolderKanban size={11} /> Archived
              </p>
              <p className="text-xl font-black text-white">{total}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0">
        {/* Card Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-100 dark:bg-slate-800 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300">
              <ArchiveIcon size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Archived Projects</h2>
              <p className="text-xs text-slate-400">Soft-deleted projects — view, recover, or permanently delete when permitted.</p>
            </div>
          </div>
        </div>

        {successMessage && (
          <div className="mx-4 mt-3 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50 flex items-center justify-between gap-2">
            <span>{successMessage}</span>
            <button
              type="button"
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-700/70 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 p-3 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex-wrap">
          <div className="flex flex-1 items-center gap-2 min-w-0 flex-wrap">
            <div className="relative flex-1 max-w-[320px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search PR No · Client · Project..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none focus:border-slate-500"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  ×
                </button>
              )}
            </div>

            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="py-1.5 px-2.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none focus:border-slate-500"
            >
              {departments.map((d) => (
                <option key={d} value={d}>{d === "All" ? "All Departments" : d}</option>
              ))}
            </select>
          </div>

          <button onClick={load} className="text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-400 hover:underline cursor-pointer">
            Refresh Data
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th onClick={() => toggleSort("prNo")} className="py-3 px-4 cursor-pointer select-none">
                  PR NO. <ArrowUpDown size={8} className="inline ml-0.5" />
                </th>
                <th onClick={() => toggleSort("client")} className="py-3 px-4 cursor-pointer select-none">
                  CLIENT <ArrowUpDown size={8} className="inline ml-0.5" />
                </th>
                <th onClick={() => toggleSort("projectTitle")} className="py-3 px-4 cursor-pointer select-none">
                  PROJECT TITLE <ArrowUpDown size={8} className="inline ml-0.5" />
                </th>
                <th onClick={() => toggleSort("department")} className="py-3 px-4 cursor-pointer select-none">
                  DEPARTMENT <ArrowUpDown size={8} className="inline ml-0.5" />
                </th>
                <th className="py-3 px-4 text-center">STATUS</th>
                <th onClick={() => toggleSort("deletedAt")} className="py-3 px-4 cursor-pointer select-none">
                  ARCHIVED ON <ArrowUpDown size={8} className="inline ml-0.5" />
                </th>
                <th className="py-3 px-4 text-center">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">Loading…</td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Archived Projects could not be loaded from the server. Use Refresh Data to try again.
                  </td>
                </tr>
              ) : rows.length > 0 ? (
                rows.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-700 dark:text-slate-200 whitespace-nowrap">{p.prNo}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400" title={p.client}>{p.client}</td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[220px] block" title={p.projectTitle}>
                        {p.projectTitle}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">{p.department || "—"}</td>
                    <td className="py-3 px-4 text-center">{renderProjectStatusBadge(p.projectStatus)}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatArchivedOn(p.deletedAt)}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => navigate(`/projects/view/${p.id}`, { state: { source: "archived" } })}
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-blue-100/40 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-950/40"
                          aria-label="View Project Details"
                        >
                          <Eye size={15} />
                        </button>
                        {canMutate && (
                          <button
                            onClick={() => setRecoverTarget(p)}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-emerald-100/40 hover:text-emerald-600 dark:text-slate-400 dark:hover:bg-emerald-950/40"
                            aria-label="Recover Project"
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}
                        {canPermanentlyDelete && (
                          <button
                            onClick={() => setPermanentDeleteTarget(p)}
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-100/50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                            aria-label="Delete Project Permanently"
                            title="Delete Project Permanently"
                          >
                            <ShieldAlert size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No archived projects match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <div className="flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-800 text-xs">
          <span className="text-slate-500">
            Showing <strong>{rows.length}</strong> of <strong>{total}</strong> archived projects
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
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

      <ConfirmDialog
        open={recoverTarget !== null}
        title="Recover Project"
        message={`"${recoverTarget?.prNo ?? ""}" will be restored to the active Project Repository.\n\nAll project information and history remains exactly as it was.`}
        confirmLabel="Recover Project"
        icon={<RotateCcw size={18} />}
        onCancel={() => setRecoverTarget(null)}
        onConfirm={async () => {
          if (!recoverTarget) return;
          await handleRecover(recoverTarget);
          setRecoverTarget(null);
        }}
      />

      <ConfirmDialog
        open={permanentDeleteTarget !== null}
        title="Delete Project Permanently?"
        message={
          "This will permanently remove this archived project and its project-owned records. This action cannot be undone.\n\nHistorical timesheet entries for this PR are preserved for audit and will remain visible on Timesheets, with Project Name shown as —."
        }
        confirmLabel="Delete Permanently"
        cancelLabel="Cancel"
        variant="danger"
        icon={<ShieldAlert size={18} />}
        onCancel={() => setPermanentDeleteTarget(null)}
        onConfirm={async () => {
          if (!permanentDeleteTarget) return;
          await handlePermanentDelete(permanentDeleteTarget);
          setPermanentDeleteTarget(null);
        }}
      />
    </div>
  );
}
