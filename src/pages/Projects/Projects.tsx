import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatBusinessINR } from "../../utils/formatCurrency";
import {
  FolderKanban,
  Plus,
  Search,
  ArrowUpDown,
  Download,
  Upload,
  Eye,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import ExcelJS from "exceljs";

import { Button } from "../../components/ui/Button";
import type { Project } from "../../types/Project";
import {
  getProjects,
  deleteProject,
  saveProjects,
} from "../../services/projectService";
import { getProjectCommercialSummary } from "../../services/invoiceProgressService";
import {
  getProjectsWithHoursOverrun,
  getProjectTimelineAlerts,
} from "../../services/dashboardService";
import {
  buildExportWorkbook,
  buildSampleTemplateWorkbook,
  downloadWorkbook,
  parseProjectsWorkbook,
} from "../../services/projectWorkbookService";

type ProjectsMode = "repository" | "completed";

interface ProjectsProps {
  mode?: ProjectsMode;
}

const scopeProjectsByMode = (all: Project[], mode: ProjectsMode): Project[] =>
  mode === "completed"
    ? all.filter((p) => p.projectStatus === "Completed")
    : all.filter((p) => p.projectStatus !== "Completed");

const Projects = ({ mode = "repository" }: ProjectsProps) => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status") || "All";
  const filterParam = searchParams.get("filter");

  const pageTitle = mode === "completed" ? "Completed Projects" : "Projects";
  const repoCardTitle = mode === "completed" ? "Completed Projects" : "Project Repository";
  const repoCardSubtitle =
    mode === "completed"
      ? "Search, filter, and review all completed engineering projects"
      : "Search, filter, and manage all engineering projects";

  // Live project state — already scoped to this page's dataset
  const [projects, setProjects] = useState<Project[]>(() => scopeProjectsByMode(getProjects(), mode));

  // Search & Filter State
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("All");
  const [status, setStatus] = useState(statusParam);

  useEffect(() => {
    setStatus(statusParam);
  }, [statusParam]);

  // Sorting State
  const [sortField, setSortField] = useState<string>("prNo");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  useEffect(() => {
    const handleDataChange = () => {
      setProjects(scopeProjectsByMode(getProjects(), mode));
    };
    window.addEventListener("pmo:data-changed", handleDataChange);
    return () => {
      window.removeEventListener("pmo:data-changed", handleDataChange);
    };
  }, [mode]);

  // Computed statistics
  const stats = useMemo(() => {
    const active = projects.filter((p) => p.projectStatus === "Active").length;
    const onHold = projects.filter((p) => p.projectStatus === "On Hold").length;
    const completed = projects.filter((p) => p.projectStatus === "Completed").length;
    const cancelled = projects.filter((p) => p.projectStatus === "Cancelled").length;
    const totalWOValue = projects.reduce(
      (sum, p) => sum + (p.workOrderValueINR || 0),
      0
    );

    let pendingInvoice = 0;
    let totalOutstanding = 0;

    projects.forEach((p) => {
      const comm = getProjectCommercialSummary(p);
      if (comm.invoiceStatus !== "Completed") {
        pendingInvoice++;
      }
      totalOutstanding += comm.outstandingCollection;
    });

    return {
      active,
      onHold,
      completed,
      cancelled,
      totalWOValue,
      pendingInvoice,
      totalOutstanding,
    };
  }, [projects]);

  // Unique departments for filter
  const departments = useMemo(() => {
    return [
      "All",
      ...new Set(projects.map((p) => p.department).filter(Boolean)),
    ];
  }, [projects]);

  // Handle Sort Toggle
  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Delete Action
  const handleDelete = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this project?")) {
      return;
    }
    deleteProject(id);
    setProjects(scopeProjectsByMode(getProjects(), mode));
  };

  const clr = () => {
    setSearch("");
  };

  const rst = () => {
    setSearch("");
    setDepartment("All");
    setStatus("All");
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("status");
    newParams.delete("filter");
    setSearchParams(newParams);
  };

  const handleClearFilter = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("filter");
    setSearchParams(newParams);
  };

  // Filtered & Sorted Projects
  const processedProjects = useMemo(() => {
    let result = projects;

    // Apply URL contextual drill-down filters from Dashboard
    if (filterParam === "financial-loss") {
      const lossProjects = getProjectsWithHoursOverrun().allMatchingProjects;
      const lossIds = new Set(lossProjects.map((p) => p.id));
      result = result.filter((p) => lossIds.has(p.id));
    } else if (filterParam === "timeline-alerts") {
      const alertProjects = getProjectTimelineAlerts().allAlertProjects;
      const alertIds = new Set(alertProjects.map((p) => p.id));
      result = result.filter((p) => alertIds.has(p.id));
    }

    result = result.filter((p) => {
      const matchSearch =
        !search ||
        (p.prNo || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.client || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.projectTitle || "").toLowerCase().includes(search.toLowerCase()) ||
        (p.primaryProjectManager || "").toLowerCase().includes(search.toLowerCase());

      const matchDept = department === "All" || p.department === department;
      const matchStatus = status === "All" || p.projectStatus === status;

      return matchSearch && matchDept && matchStatus;
    });

    // Sort
    result.sort((a, b) => {
      let valA: any = a[sortField as keyof Project] ?? "";
      let valB: any = b[sortField as keyof Project] ?? "";

      if (sortField === "pendingDue") {
        valA = getProjectCommercialSummary(a).pendingDue;
        valB = getProjectCommercialSummary(b).pendingDue;
      } else if (sortField === "invoiceStatus") {
        valA = getProjectCommercialSummary(a).invoiceStatus;
        valB = getProjectCommercialSummary(b).invoiceStatus;
      }

      if (typeof valA === "string") {
        return sortAsc
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return sortAsc
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      }
    });

    return result;
  }, [projects, search, department, status, sortField, sortAsc, filterParam]);

  // Reset page when filters modify result counts
  useEffect(() => {
    setCurrentPage(1);
  }, [search, department, status, filterParam]);

  // Pagination bounds
  const paginatedProjects = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedProjects.slice(start, start + pageSize);
  }, [processedProjects, currentPage]);

  const totalPages = Math.max(
    Math.ceil(processedProjects.length / pageSize),
    1
  );

  // Format currency helpers
  const fmtWOValue = (v: number) => formatBusinessINR(v || 0);

  const fmtCurrency = (v: number) => {
    if (v === 0) return <span className="text-gray-400 dark:text-gray-600 font-medium">—</span>;
    return "₹\u202F" + v.toLocaleString("en-IN");
  };

  // Export to Excel
  const handleExport = async () => {
    if (projects.length === 0) {
      alert("No project data available to export.");
      return;
    }

    const workbook = await buildExportWorkbook(projects);
    await downloadWorkbook(workbook, "projects_pmo_export.xlsx");
  };

  // Download Sample Template — same sheet structure as Export, just
  // pre-filled with one illustrative sample project instead of real data.
  const handleDownloadTemplate = async () => {
    const workbook = await buildSampleTemplateWorkbook();
    await downloadWorkbook(workbook, "projects_import_template.xlsx");
  };

  // File Import Logic — reads Projects / Quantity Details / Payment
  // Milestones / Expense Budget together and reconstructs each project with
  // all of its child records (never flattened into a single summary row).
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const existing = getProjects();
      const { projects: imported, errors } = parseProjectsWorkbook(workbook, existing);

      if (errors.length > 0) {
        alert(
          `Import aborted. Fix the following validation issues:\n\n${errors
            .slice(0, 10)
            .join("\n")}${errors.length > 10 ? `\n...and ${errors.length - 10} more` : ""}`
        );
        return;
      }

      if (imported.length === 0) {
        alert("No valid projects found to import.");
        return;
      }

      saveProjects([...existing, ...imported]);
      alert(`Import complete! Successfully added ${imported.length} project(s).`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error while reading the file.";
      alert(`Error reading file: ${message}`);
    } finally {
      e.target.value = ""; // clear file
    }
  };

  // Render department chip colors
  const getDeptColorClass = (dept: string) => {
    const d = (dept || "").toLowerCase().trim();
    if (d.includes("instrument")) return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-850/20";
    if (d.includes("elect")) return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-850/20";
    if (d.includes("civil")) return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800/30";
    if (d.includes("mech")) return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-850/20";
    if (d.includes("process")) return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-300 dark:border-purple-850/20";
    return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/20 dark:text-slate-400 dark:border-slate-800/20";
  };

  // Render project status badges
  const renderProjectStatusBadge = (status: string) => {
    let cls = "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400";
    let dot = "bg-blue-500";
    if (status === "On Hold") {
      cls = "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300";
      dot = "bg-amber-500";
    } else if (status === "Completed") {
      cls = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300";
      dot = "bg-emerald-500";
    } else if (status === "Cancelled") {
      cls = "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300";
      dot = "bg-red-500";
    }
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
        {status || "Active"}
      </span>
    );
  };

  // Render invoice status badges
  const renderInvoiceStatusBadge = (status: string) => {
    let cls = "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300";
    let dot = "bg-orange-500";
    if (status === "Completed") {
      cls = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300";
      dot = "bg-emerald-500";
    } else if (status === "Not Started") {
      cls = "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300";
      dot = "bg-red-500";
    }
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* ─── CUSTOM STYLES PRESERVATION ─── */}
      <style dangerouslySetInnerHTML={{ __html: `
        .pmo-hero {
          border-radius: 14px; overflow: hidden; position: relative;
          background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #0E7490 100%);
        }
        html.dark .pmo-hero {
          background: linear-gradient(-45deg, #152B68 0%, #1F52C4 30%, #0B6059 65%, #0892C8 100%);
          background-size: 300% 300%; animation: gradientShift 22s ease-in-out infinite;
          border: 1px solid rgba(56,139,253,.16);
          box-shadow: 0 8px 28px rgba(0,0,0,.48);
        }
        .pmo-hero::before {
          content: ''; position: absolute; inset: 0;
          background-image: radial-gradient(rgba(255,255,255,.032) 1px, transparent 1px);
          background-size: 22px 22px; pointer-events: none;
        }
        .pmo-hero::after {
          content: ''; position: absolute; left: -80px; top: -80px;
          width: 280px; height: 280px;
          background: radial-gradient(circle, rgba(59,130,246,.14) 0%, transparent 68%);
          pointer-events: none;
        }
        .pmo-hero-in {
          position: relative; z-index: 1;
          padding: 16px 22px;
          display: flex; align-items: center; justify-content: space-between; gap: 20px;
        }
        .pmo-live-pill {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 9999px;
          background: rgba(52,211,153,.12); border: 1px solid rgba(52,211,153,.22);
          font-size: 9.5px; font-weight: 700; color: #34D399;
          letter-spacing: .05em;
        }
        .pmo-live-dot {
          width: 5px; height: 5px; border-radius: 50%; background: #34D399;
          animation: livePulse 1.8s ease-in-out infinite;
        }
        @keyframes livePulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(52,211,153,.5); }
          50%     { box-shadow: 0 0 0 5px rgba(52,211,153,0); }
        }
        .pmo-chip {
          display: flex; flex-direction: column; align-items: flex-start;
          padding: 6px 12px; border-radius: 9px;
          background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.09);
          backdrop-filter: blur(10px); min-width: 64px; gap: 1px;
        }
        .pmo-chip:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.2); }
        .pmo-mc {
          border-left: 3px solid transparent;
          position: relative;
        }
        .pmo-mc::before {
          content: ''; position: absolute; left: 0; top: 0; bottom: 0;
          width: 3px; border-radius: 10px 0 0 10px;
        }
        .pmo-mc:nth-child(1)::before { background: #3B82F6; }
        .pmo-mc:nth-child(2)::before { background: #22C55E; }
        .pmo-mc:nth-child(3)::before { background: #818CF8; }
        .pmo-mc:nth-child(4)::before { background: #F97316; }
        .pmo-mc:nth-child(5)::before { background: #EF4444; }
        .pmo-repo {
          border-top: 2px solid var(--accent);
        }
        .pmo-prno {
          font-variant-numeric: tabular-nums;
        }
        .pmo-act-wrap {
          display: inline-flex; align-items: center;
          border-radius: 8px; padding: 2px; gap: 2px;
        }
        .pmo-act-btn {
          width: 38px; height: 38px; border-radius: 7px;
          display: flex; align-items: center; justify-content: center;
          border: none; background: transparent; position: relative;
        }
        .pmo-act-btn svg { width: 15px; height: 15px; }
        .pmo-act-btn::after {
          content: attr(title);
          position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
          background: #111827; color: #fff;
          font-size: 9.5px; font-weight: 600; white-space: nowrap;
          padding: 3px 7px; border-radius: 5px;
          opacity: 0; pointer-events: none; z-index: 20;
          transition: opacity 150ms ease;
        }
        html.dark .pmo-act-btn::after { background: #E6EDF3; color: #111827; }
        .pmo-act-btn:hover::after { opacity: 1; }
      ` }} />

      {/* ═══════════ HERO BANNER ═══════════ */}
      <div className="pmo-hero shadow-lg">
        <div className="pmo-hero-in">
          {/* Left info */}
          <div className="text-left flex-1 min-w-0">
            <div className="hero-eye text-xs font-bold tracking-wider text-slate-400/90 mb-1.5 flex items-center gap-1.5 uppercase">
              <span className="eye-dot w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-sm"></span>
              iFluids Engineering · Project Management Office
            </div>
            <h1 className="pmo-hero-title text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-none">
              {pageTitle}
            </h1>
            <p className="text-slate-300/80 text-xs sm:text-sm mt-1.5 max-w-lg leading-relaxed">
              Engineering project tracking · Commercial management · Invoicing · Execution lifecycle
            </p>
          </div>

          {/* Right actions & count */}
          <div className="flex flex-col items-end gap-2.5 shrink-0 z-10">
            {mode === "completed" ? (
              <button
                onClick={handleExport}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-4 py-2 rounded-lg backdrop-blur-md transition-all duration-200 text-sm shadow-sm"
              >
                <Download size={14} />
                Export Archive
              </button>
            ) : (
              <Button
                variant="hero"
                onClick={() => navigate("/projects/add")}
                className="btn-add transform hover:-translate-y-px"
                icon={<Plus size={15} />}
              >
                Add Project
              </Button>
            )}
            <div className="flex items-center gap-1.5 text-xs text-slate-300/90 font-medium">
              <FolderKanban size={13} className="text-slate-400" />
              Total Projects &nbsp;
              <strong className="text-white font-extrabold">{projects.length}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ KPI SUMMARY BAR ═══════════ */}
      {mode !== "completed" && (
        <div className="grid grid-cols-5 gap-3">
          <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="mi w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center">
              <FolderKanban size={15} className="text-blue-500" />
            </div>
            <div>
              <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Total Projects</div>
              <div className="mv text-lg font-black text-slate-800 dark:text-slate-100 leading-none mt-1">{projects.length}</div>
            </div>
          </div>
          <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="mi w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center">
              <FolderKanban size={15} className="text-emerald-500" />
            </div>
            <div>
              <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Active</div>
              <div className="mv text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1">{stats.active}</div>
            </div>
          </div>
          <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="mi w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center">
              <FolderKanban size={15} className="text-indigo-500" />
            </div>
            <div>
              <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Completed</div>
              <div className="mv text-lg font-black text-indigo-600 dark:text-indigo-400 leading-none mt-1">{stats.completed}</div>
            </div>
          </div>
          <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="mi w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center">
              <FolderKanban size={15} className="text-amber-500" />
            </div>
            <div>
              <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Pending Invoice</div>
              <div className="mv text-lg font-black text-amber-600 dark:text-amber-400 leading-none mt-1">{stats.pendingInvoice}</div>
            </div>
          </div>
          <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
            <div className="mi w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center">
              <FolderKanban size={15} className="text-rose-500" />
            </div>
            <div>
              <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Outstanding</div>
              <div className="mv text-lg font-black text-rose-600 dark:text-rose-400 leading-none mt-1">{fmtWOValue(stats.totalOutstanding)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ PROJECT REPOSITORY CARD ═══════════ */}
      <div className="pmo-repo bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0">
        
        {/* Card Header */}
        <div className="rh flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="rh-l flex items-center gap-3">
            <div className="rh-icon w-9 h-9 bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center rounded-xl">
              <FolderKanban size={16} className="text-blue-500" />
            </div>
            <div>
              <h2 className="rh-title text-base font-bold text-slate-800 dark:text-slate-100">
                {repoCardTitle}
              </h2>
              <p className="rh-sub text-xs text-slate-400">
                {repoCardSubtitle}
              </p>
            </div>
          </div>
          <span className="cnt-badge text-xs font-bold px-3 py-1 bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 rounded-full border border-blue-100 dark:border-blue-900/30">
            Showing {processedProjects.length} of {projects.length} Projects
          </span>
        </div>

        {/* ── Contextual Drill-Down Filter Banner ── */}
        {filterParam === "financial-loss" && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2 text-red-800 dark:text-red-300 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
              <span>Showing: Projects in Financial Loss ({processedProjects.length})</span>
            </div>
            <button
              type="button"
              onClick={handleClearFilter}
              className="px-3 py-1 text-[11px] font-bold text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-white bg-white dark:bg-slate-900 border border-red-300 dark:border-red-800 rounded-lg shadow-xs hover:bg-red-50 transition-all cursor-pointer"
            >
              Clear Filter
            </button>
          </div>
        )}

        {filterParam === "timeline-alerts" && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/50 flex items-center justify-between gap-3 text-xs shadow-xs">
            <div className="flex items-center gap-2 text-orange-800 dark:text-orange-300 font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></span>
              <span>Showing: Project Timeline Alerts ({processedProjects.length})</span>
            </div>
            <button
              type="button"
              onClick={handleClearFilter}
              className="px-3 py-1 text-[11px] font-bold text-orange-700 hover:text-orange-900 dark:text-orange-300 dark:hover:text-white bg-white dark:bg-slate-900 border border-orange-300 dark:border-orange-800 rounded-lg shadow-xs hover:bg-orange-50 transition-all cursor-pointer"
            >
              Clear Filter
            </button>
          </div>
        )}


        {/* Toolbar */}
        <div className="toolbar flex items-center justify-between gap-2 p-3 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex-wrap">
          <div className="flex flex-1 items-center gap-2 min-w-0 flex-wrap">
            {/* Search */}
            <div className="sw relative flex-1 max-w-[280px]">
              <Search size={12} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search PR No · Client · Title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="si w-full pl-8 pr-8 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none focus:border-blue-500"
              />
              {search && (
                <button onClick={clr} className="sc absolute right-2.5 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  ×
                </button>
              )}
            </div>

            {/* Department Filter */}
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="flt py-1.5 px-3 pr-8 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer"
            >
              <option value="All">All Departments</option>
              {departments
                .filter((d) => d !== "All")
                .map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
            </select>

            {/* Status Filter — Completed Projects has only one possible status,
                so a filter is meaningless there; show a read-only badge instead.
                Project Repository never offers "Completed" as an option, since
                that dataset already excludes completed projects entirely. */}
            {mode === "completed" ? (
              <span
                className="flt inline-flex items-center gap-1.5 py-1.5 px-3 border border-emerald-200 dark:border-emerald-900/40 rounded-lg text-xs font-bold bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 select-none"
                title="All projects on this page are Completed"
              >
                ✅ Completed
              </span>
            ) : (
              <select
                value={status}
                onChange={(e) => {
                  const nextStatus = e.target.value;
                  setStatus(nextStatus);
                  const newParams = new URLSearchParams(searchParams);
                  if (nextStatus === "All") {
                    newParams.delete("status");
                  } else {
                    newParams.set("status", nextStatus);
                  }
                  setSearchParams(newParams);
                }}
                className="flt py-1.5 px-3 pr-8 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            )}

            <div className="t-sep h-5 w-[1px] bg-slate-200 dark:bg-slate-800"></div>

            {/* Sort button */}
            <button
              onClick={() => toggleSort(sortField === "prNo" ? "projectTitle" : "prNo")}
              className="tbtn flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400"
            >
              <ArrowUpDown size={11} />
              Sort
            </button>

            {mode !== "completed" && (
              <>
                {/* Export button */}
                <button
                  onClick={handleExport}
                  className="tbtn flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400"
                >
                  <Download size={11} />
                  Export
                </button>

                {/* Import Button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="tbtn flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400"
                >
                  <Upload size={11} />
                  Import
                </button>

                {/* Hidden Input for Import */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImportFile}
                  accept=".xlsx, .csv"
                  className="hidden"
                />

                {/* Reset Filters */}
                <button
                  onClick={rst}
                  className="tbtn rst flex items-center gap-1 px-3 py-1.5 border border-red-200 rounded-lg text-xs bg-red-50/50 text-red-600"
                >
                  Reset
                </button>
              </>
            )}
          </div>

          {/* Download Template button */}
          {mode !== "completed" && (
            <button
              onClick={handleDownloadTemplate}
              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <Download size={10} />
              Download Sample Template
            </button>
          )}
        </div>

        {/* TABLE CONTAINER — headers stay visible while scrolling the page
            (sticky top-0), and PR No stays visible while scrolling the table
            horizontally (sticky left-0), so orientation never gets lost in a
            wide/long table. */}
        <div className="ts overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th
                  onClick={() => toggleSort("prNo")}
                  className="p-3 font-extrabold uppercase select-none text-left sticky top-0 left-0 z-30 bg-slate-50 dark:bg-slate-900"
                >
                  PR No <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("client")} className="p-3 font-extrabold uppercase select-none text-left sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Client <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("projectTitle")} className="p-3 font-extrabold uppercase select-none text-left sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Project Title <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("primaryProjectManager")} className="p-3 font-extrabold uppercase select-none text-left sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Manager <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("department")} className="p-3 font-extrabold uppercase select-none text-left sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Department <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("projectStatus")} className="p-3 font-extrabold uppercase select-none text-center sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Project Status <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("invoiceStatus")} className="p-3 font-extrabold uppercase select-none text-center sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Invoice Status <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("workOrderValueINR")} className="p-3 font-extrabold uppercase select-none text-right grp sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  WO Value (INR) <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("pendingDue")} className="p-3 font-extrabold uppercase select-none text-right sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Pending Due <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th className="p-3 font-extrabold uppercase select-none text-center sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedProjects.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    No Projects Found matching selected filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedProjects.map((p) => {
                  const comm = getProjectCommercialSummary(p);
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-blue-50/20 dark:hover:bg-slate-800/30 transition-all duration-100"
                    >
                      <td className="p-3 sticky left-0 z-10 bg-white dark:bg-slate-900">
                        <span className="prno pmo-prno">{p.prNo}</span>
                      </td>
                      <td className="p-3">
                        <div className="tclient font-semibold" title={p.client}>
                          {p.client}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="ttitle">
                          <span className="font-semibold block truncate max-w-[210px]" title={p.projectTitle}>
                            {p.projectTitle}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300 font-medium">
                        {p.primaryProjectManager || "—"}
                      </td>
                      <td className="p-3">
                        <span className={`dept ${getDeptColorClass(p.department)}`}>
                          {p.department || "—"}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {renderProjectStatusBadge(p.projectStatus)}
                      </td>
                      <td className="p-3 text-center">
                        {renderInvoiceStatusBadge(comm.invoiceStatus)}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-100 grp pmo-prno">
                        {fmtCurrency(p.workOrderValueINR)}
                      </td>
                      <td className={`p-3 text-right font-bold pmo-prno ${comm.pendingDue === 0 ? "text-emerald-600" : "text-amber-600"}`}>
                        {fmtCurrency(comm.pendingDue)}
                      </td>
                      <td className="p-3 text-center">
                        <div className="acts">
                          <div className="pmo-act-wrap bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900">
                            <button
                              onClick={() => navigate(`/projects/view/${p.id}`, { state: { source: mode } })}
                              className="pmo-act-btn act-v hover:bg-blue-100/40 hover:text-blue-600"
                              title="View Project Details"
                            >
                              <Eye />
                            </button>
                            <button
                              onClick={() => navigate(`/projects/edit/${p.id}`, { state: { source: mode } })}
                              className="pmo-act-btn act-e hover:bg-slate-100/50 hover:text-slate-600"
                              title="Edit Project Details"
                            >
                              <Pencil />
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="pmo-act-btn act-d hover:bg-red-100/40 hover:text-red-600"
                              title="Delete Project Record"
                            >
                              <Trash2 />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer & Pagination */}
        <div className="tf flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-slate-400">
              Showing <strong>{paginatedProjects.length}</strong> of <strong>{processedProjects.length}</strong> projects
            </span>
            <div className="tf-prog flex items-center gap-1.5 text-[10.5px]">
              <span className="text-slate-400">Status</span>
              <div className="tf-prog-bar w-16 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="tf-prog-fill h-full bg-blue-500 rounded-full"
                  style={{ width: `${(processedProjects.length / Math.max(projects.length, 1)) * 100}%` }}
                ></div>
              </div>
              <strong className="text-slate-500">{Math.round((processedProjects.length / Math.max(projects.length, 1)) * 100)}% filtered</strong>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Pagination controls */}
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className="w-7 h-7 flex items-center justify-center border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-950 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
              >
                <ChevronLeft size={13} />
              </button>
              <span className="text-xs text-slate-500 px-2 select-none">
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className="w-7 h-7 flex items-center justify-center border border-slate-200 dark:border-slate-800 rounded bg-white dark:bg-slate-950 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const clearSearch = () => {};
export const resetFilters = () => {};

export default Projects;