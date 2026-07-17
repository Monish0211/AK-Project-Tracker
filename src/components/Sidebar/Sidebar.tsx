import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  Building2,
  Clock3,
  Droplet,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as XLSX from "xlsx";
import { getProjects } from "../../services/projectService";
import { getProjectCommercialSummary } from "../../services/invoiceProgressService";
import type { Project } from "../../types/Project";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Projects", to: "/projects", icon: FolderKanban },
  { label: "Customer Master", to: "/customers", icon: Building2 },
  { label: "Manpower", to: "/manpower", icon: Users },
  { label: "Timesheets", to: "/timesheets", icon: Clock3 },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Settings", to: "/settings", icon: Settings },
];

interface SummaryRow {
  dot: string;
  label: string;
  statusKey: string;
}

const SUMMARY_ROWS: SummaryRow[] = [
  { dot: "bg-emerald-500", label: "Active Projects", statusKey: "Active" },
  { dot: "bg-amber-500", label: "On Hold", statusKey: "On Hold" },
  { dot: "bg-indigo-400", label: "Completed", statusKey: "Completed" },
  { dot: "bg-red-400", label: "Cancelled", statusKey: "Cancelled" },
];

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Live project state
  const [projects, setProjects] = useState<Project[]>(getProjects());

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    statusKey: string;
  } | null>(null);

  // Sync projects dynamically when data changes
  useEffect(() => {
    const handleDataChange = () => {
      setProjects(getProjects());
    };
    window.addEventListener("pmo:data-changed", handleDataChange);
    return () => {
      window.removeEventListener("pmo:data-changed", handleDataChange);
    };
  }, []);

  // Close context menu on click or scroll
  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    window.addEventListener("click", handleCloseMenu);
    window.addEventListener("scroll", handleCloseMenu, { capture: true, passive: true });
    return () => {
      window.removeEventListener("click", handleCloseMenu);
      window.removeEventListener("scroll", handleCloseMenu, { capture: true });
    };
  }, []);

  // Counts calculated live
  const counts: Record<string, number> = {
    Active: projects.filter((p) => p.projectStatus === "Active").length,
    "On Hold": projects.filter((p) => p.projectStatus === "On Hold").length,
    Completed: projects.filter((p) => p.projectStatus === "Completed").length,
    Cancelled: projects.filter((p) => p.projectStatus === "Cancelled").length,
  };

  const handleRowClick = (statusKey: string) => {
    navigate(`/projects?status=${statusKey}`);
  };

  const handleContextMenu = (e: React.MouseEvent, statusKey: string) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      statusKey,
    });
  };

  const handleExportStatus = (statusKey: string) => {
    const filtered = projects.filter((p) => p.projectStatus === statusKey);
    if (filtered.length === 0) {
      alert(`No project data available with status "${statusKey}" to export.`);
      return;
    }

    const exportRows = filtered.map((p) => {
      const comm = getProjectCommercialSummary(p);
      return {
        "PR No": p.prNo || "",
        "PO Month": p.poMonth || "",
        "Client Name": p.client || "",
        "Department": p.department || "",
        "Project Title": p.projectTitle || "",
        "Project Manager": p.primaryProjectManager || "",
        "Project Engineer": p.projectEngineer || "",
        "Project Coordinator": p.projectCoordinator || "",
        "PMO Coordinator": p.pmoCoordinator || "",
        "Project Status": p.projectStatus || "",
        "Contract Type": p.contractType || "",
        "Work Order Value": p.workOrderValue || 0,
        "Currency": p.currency || "INR",
        "Exchange Rate": p.currentExchangeRate || 1,
        "Invoice Raised": comm.totalInvoiceRaised || 0,
        "Payment Received": p.paymentReceived || 0,
        "Outstanding": comm.pendingDue || 0,
        "Start Date": p.projectStartDate || "",
        "End Date": p.projectEndDate || "",
        "Remarks": p.remarks || "",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Projects");
    XLSX.writeFile(workbook, `projects_export_${statusKey.toLowerCase().replace(/\s+/g, "_")}.xlsx`);
  };

  // Determine if a status is currently active (path is /projects and param matches)
  const isStatusActive = (statusKey: string) => {
    return location.pathname === "/projects" && searchParams.get("status") === statusKey;
  };

  return (
    <aside
      className="
        sticky
        top-0
        h-screen
        w-[72px]
        min-[1440px]:w-[260px]
        flex-shrink-0
        bg-gradient-to-b
        from-[var(--sidebar-from)]
        via-[var(--sidebar-via)]
        to-[var(--sidebar-to)]
        text-white
        shadow-2xl
        flex
        flex-col
        transition-all
        duration-300
      "
    >
      {/* Branding */}
      <div className="px-3 min-[1440px]:px-6 py-6 flex justify-center min-[1440px]:justify-start">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-900/40 shrink-0">
            <Droplet
              size={22}
              className="text-white"
            />
          </div>
          <div className="hidden min-[1440px]:block">
            <h1 className="text-lg font-bold">
              iFluids
            </h1>
            <p className="text-xs uppercase tracking-wider text-slate-400">
              PMO Portal
            </p>
          </div>
        </div>
      </div>

      <div className="mx-3 min-[1440px]:mx-6 border-t border-white/10" />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 min-[1440px]:px-4 py-5">
        <ul className="space-y-2">
          {NAV_ITEMS.map(({ label, to, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `
                  flex
                  items-center
                  justify-center
                  min-[1440px]:justify-start
                  gap-3
                  rounded-xl
                  px-3
                  min-[1440px]:px-4
                  py-3
                  text-sm
                  font-medium
                  transition-all
                  duration-300
                  ${
                    isActive
                      ? "bg-gradient-to-r from-blue-600 to-cyan-500 shadow-lg shadow-blue-900/40 active-nav-link"
                      : "text-slate-300 hover:bg-white/10 hover:text-white min-[1440px]:hover:translate-x-1"
                  }
                `
                }
              >
                <Icon
                  size={19}
                  className="shrink-0"
                />
                <span className="hidden min-[1440px]:block">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom Summary */}
      <div className="hidden min-[1440px]:block p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 shadow-xl">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">
            Quick Summary
          </h3>

          <div className="space-y-2">
            {SUMMARY_ROWS.map(({ dot, label, statusKey }) => {
              const active = isStatusActive(statusKey);
              const value = counts[statusKey] ?? 0;
              return (
                <button
                  key={statusKey}
                  onClick={() => handleRowClick(statusKey)}
                  onContextMenu={(e) => handleContextMenu(e, statusKey)}
                  tabIndex={0}
                  className={`w-full relative flex items-center justify-between text-sm px-3.5 py-2.5 rounded-xl border border-transparent transition-all duration-200 cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-blue-500/40 select-none group active:scale-[0.98] ${
                    active
                      ? "bg-white/10 text-white font-bold border-white/5 shadow-inner"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {/* Glowing left accent indicator */}
                  <span
                    className={`absolute left-0 top-2 bottom-2 w-0.5 rounded-r-md transition-all duration-200 ${
                      active
                        ? "bg-blue-500 opacity-100 scale-y-100"
                        : "bg-blue-500/60 opacity-0 scale-y-50 group-hover:opacity-100 group-hover:scale-y-100"
                    }`}
                  />

                  <div className="flex items-center gap-2.5 pl-1">
                    {/* Status dot */}
                    <span
                      className={`h-2 w-2 rounded-full transition-transform duration-200 group-hover:scale-125 shrink-0 ${dot}`}
                    />
                    <span className="text-xs font-semibold tracking-wide">
                      {label}
                    </span>
                  </div>

                  {/* Count indicator */}
                  <span className="text-sm font-extrabold tracking-tight transition-transform duration-200 group-hover:scale-110">
                    {value}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Floating Context Menu (fixed for viewport alignment) */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-[9999] min-w-[140px] bg-slate-900 border border-white/10 backdrop-blur-md rounded-xl shadow-2xl p-1.5 animate-fade-in text-xs font-semibold text-slate-200 select-none"
        >
          <button
            onClick={() => handleRowClick(contextMenu.statusKey)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-left border-none bg-transparent cursor-pointer text-slate-200"
          >
            View Projects
          </button>
          <button
            onClick={() => handleExportStatus(contextMenu.statusKey)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-left border-none bg-transparent cursor-pointer text-slate-200"
          >
            Export List
          </button>
          <button
            onClick={() => navigate("/reports")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/10 text-left border-none bg-transparent cursor-pointer text-slate-200"
          >
            View Report
          </button>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;