import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Droplet,
  FolderKanban,
  LayoutDashboard,
  PauseCircle,
  PlayCircle,
  Settings,
  Users,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as XLSX from "xlsx";
import { getProjects } from "../../services/projectService";
import { getProjectCommercialSummary } from "../../services/invoiceProgressService";
import type { Project } from "../../types/Project";

interface NavChild {
  label: string;
  to: string;
  icon: LucideIcon;
}

interface NavItem {
  label: string;
  to?: string;
  icon: LucideIcon;
  children?: NavChild[];
  /**
   * Notification-ready but not wired to anything yet — no menu item sets
   * this today, so nothing renders. Kept as an explicit field so a future
   * "N unread" or "has updates" signal can flow in without touching the
   * rendering logic below.
   */
  hasNotification?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  {
    label: "Projects",
    icon: FolderKanban,
    children: [
      { label: "Project Repository", to: "/projects", icon: FolderKanban },
      { label: "Completed Projects", to: "/projects/completed", icon: CheckCircle2 },
    ],
  },
  { label: "Customer Master", to: "/customers", icon: Building2 },
  { label: "Manpower", to: "/manpower", icon: Users },
  { label: "Timesheets", to: "/timesheets", icon: Clock3 },
  { label: "Reports", to: "/reports", icon: BarChart3 },
  { label: "Settings", to: "/settings", icon: Settings },
];

interface SummaryRow {
  icon: LucideIcon;
  color: string;
  label: string;
  statusKey: string;
}

const SUMMARY_ROWS: SummaryRow[] = [
  { icon: PlayCircle, color: "text-emerald-400", label: "Active Projects", statusKey: "Active" },
  { icon: PauseCircle, color: "text-amber-400", label: "On Hold", statusKey: "On Hold" },
  { icon: CheckCircle2, color: "text-indigo-400", label: "Completed", statusKey: "Completed" },
  { icon: XCircle, color: "text-red-400", label: "Cancelled", statusKey: "Cancelled" },
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

  // View/Edit Project are shared routes reused by both modules, so their own
  // path can't tell us which one the user came from — Projects.tsx passes
  // { state: { source } } on navigate() for exactly this reason. Without
  // that context, viewing a completed project would always (incorrectly)
  // light up Project Repository just because /projects/view/:id starts with
  // /projects/.
  const routeState = location.state as { source?: "repository" | "completed" } | null;
  const isProjectDetailPath = /^\/projects\/(view|edit)\//.test(location.pathname);
  const cameFromCompleted = isProjectDetailPath && routeState?.source === "completed";

  // "Project Repository" covers /projects itself plus its add/view/edit
  // sub-routes, but NOT /projects/completed, and not a project opened from
  // Completed Projects.
  const isCompletedProjectsActive = location.pathname.startsWith("/projects/completed") || cameFromCompleted;
  const isRepositoryActive =
    !isCompletedProjectsActive &&
    (location.pathname === "/projects" || location.pathname.startsWith("/projects/"));
  const isProjectsSectionActive = isRepositoryActive || isCompletedProjectsActive;

  // Dropdown starts expanded whenever a Projects sub-page is already active,
  // and otherwise toggles manually.
  const [isProjectsOpen, setIsProjectsOpen] = useState(isProjectsSectionActive);

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
    // Completed projects live on their own dedicated page now, since the
    // Project Repository always excludes them regardless of the status filter.
    if (statusKey === "Completed") {
      navigate("/projects/completed");
    } else {
      navigate(`/projects?status=${statusKey}`);
    }
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
    if (statusKey === "Completed") {
      return location.pathname === "/projects/completed";
    }
    return location.pathname === "/projects" && searchParams.get("status") === statusKey;
  };

  return (
    <aside
      className="
        pmo-sidebar
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
        pmo-sidebar-shadow
        flex
        flex-col
        transition-all
        duration-300
      "
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        /* ══ Enterprise sidebar polish — visual only, no logic here ══ */

        .pmo-sidebar { position: relative; }
        .pmo-sidebar::before {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(120% 55% at 50% 0%, rgba(255,255,255,.035) 0%, transparent 62%);
          pointer-events: none;
        }
        .pmo-sidebar-shadow {
          box-shadow: 4px 0 24px rgba(0,0,0,.28), 1px 0 0 rgba(255,255,255,.04) inset;
        }

        /* ── Premium nav item hover ─────────────────────────────────── */
        .pmo-nav-item {
          position: relative;
          transition: transform 230ms cubic-bezier(.22,.68,0,1.05),
                      background-color 220ms ease,
                      box-shadow 230ms ease,
                      color 220ms ease;
        }
        .pmo-nav-item:hover:not(.pmo-nav-active) {
          transform: translate(3px, -1px);
          box-shadow: 0 4px 14px rgba(0,0,0,.22);
        }
        .pmo-nav-item:focus-visible {
          outline: 2px solid rgba(96,165,250,.6);
          outline-offset: 2px;
        }
        .pmo-nav-icon {
          transition: transform 220ms ease, filter 220ms ease;
          display: inline-flex;
        }
        .pmo-nav-item:hover .pmo-nav-icon { transform: scale(1.05); filter: brightness(1.25); }
        .pmo-nav-label { transition: color 220ms ease, opacity 220ms ease; }
        .pmo-nav-item:hover .pmo-nav-label { color: #ffffff; }

        /* ── Premium active state — soft glass gradient card ───────── */
        .pmo-nav-active {
          background: linear-gradient(135deg, rgba(37,99,235,.85) 0%, rgba(8,145,178,.75) 100%);
          border: 1px solid rgba(125,211,252,.35);
          box-shadow: 0 6px 20px rgba(37,99,235,.28), 0 2px 6px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.14);
          transform: translateY(-1px);
        }
        .pmo-nav-active:hover { transform: translateY(-1.5px); }

        /* ── Projects dropdown expand/collapse ─────────────────────── */
        .pmo-dropdown-panel {
          overflow: hidden;
          max-height: 0;
          opacity: 0;
          transform: translateY(-4px);
          transition: max-height 320ms cubic-bezier(.22,.68,0,1),
                      opacity 220ms ease,
                      transform 260ms ease;
        }
        .pmo-dropdown-panel.pmo-dropdown-open {
          max-height: 140px;
          opacity: 1;
          transform: translateY(0);
        }
        .pmo-dropdown-chevron { transition: transform 220ms ease; }
        .pmo-dropdown-chevron.pmo-rotated { transform: rotate(180deg); }

        /* ── Child list connector (wide sidebar only) ──────────────── */
        .pmo-child-list { position: relative; }
        @media (min-width: 1440px) {
          .pmo-child-list::before {
            content: '';
            position: absolute;
            left: 9px;
            top: -4px;
            bottom: 12px;
            width: 1px;
            background: linear-gradient(to bottom, rgba(255,255,255,.18), rgba(255,255,255,.04));
          }
        }

        /* ── Active child item ──────────────────────────────────────  */
        .pmo-child-active {
          position: relative;
          background: rgba(59,130,246,.14);
          border: 1px solid rgba(96,165,250,.28);
          box-shadow: 0 2px 8px rgba(37,99,235,.16);
        }
        @media (min-width: 1440px) {
          .pmo-child-active::before {
            content: '';
            position: absolute;
            left: -2px; top: 5px; bottom: 5px;
            width: 3px; border-radius: 0 3px 3px 0;
            background: #60a5fa;
          }
        }

        /* ── Quick Summary rows ─────────────────────────────────────── */
        .pmo-qs-card {
          transition: box-shadow 220ms ease, background-color 220ms ease;
        }
        .pmo-qs-row { transition: background-color 180ms ease, filter 180ms ease, transform 180ms ease; }
        .pmo-qs-row:hover { filter: brightness(1.1); }
        .pmo-qs-icon { transition: transform 200ms ease; }
        .pmo-qs-row:hover .pmo-qs-icon { transform: scale(1.08); }

        /* ── Divider ────────────────────────────────────────────────── */
        .pmo-divider {
          height: 1px;
          border: none;
          background: linear-gradient(to right, transparent, rgba(255,255,255,.16), transparent);
        }

        /* ── Notification pulse dot (future-ready; only renders when a
             nav item's hasNotification is true — none set one yet) ──── */
        .pmo-nav-dot {
          width: 6px; height: 6px; border-radius: 9999px;
          background: #ef4444;
          animation: pmoDotPulse 1.8s ease-in-out infinite;
        }
        @keyframes pmoDotPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,.55); }
          50%       { box-shadow: 0 0 0 4px rgba(239,68,68,0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .pmo-nav-item, .pmo-nav-icon, .pmo-nav-label, .pmo-nav-active,
          .pmo-dropdown-panel, .pmo-dropdown-chevron, .pmo-qs-row, .pmo-qs-icon {
            transition: none !important;
            animation: none !important;
          }
        }
      `,
        }}
      />

      {/* Branding — shrink-0 so it always keeps its natural size and never
          gets compressed by the flex column, regardless of how tall
          Navigation or Quick Summary end up being. */}
      <div className="shrink-0 relative px-3 min-[1440px]:px-6 py-6 flex justify-center min-[1440px]:justify-start">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 shadow-lg shadow-blue-900/40 shrink-0">
            <Droplet
              size={22}
              className="text-white"
            />
          </div>
          <div className="hidden min-[1440px]:block">
            <h1 className="text-lg font-bold tracking-tight">
              iFluids
            </h1>
            <p className="text-[10.5px] font-medium uppercase text-slate-400/80 tracking-[0.14em] leading-tight mt-0.5">
              Engineering PMO
            </p>
            <p className="text-[10px] font-medium text-slate-500/70 tracking-[0.1em] leading-tight">
              Enterprise Portal
            </p>
          </div>
        </div>
      </div>

      <hr className="pmo-divider shrink-0 mx-3 min-[1440px]:mx-6 my-1" />

      {/* Navigation — flex-1 lets this expand to fill whatever vertical
          space Branding/Quick Summary don't need (acting as the "flexible
          spacer" pushing Quick Summary to the bottom), while min-h-0
          overrides the flex default of never shrinking below content size —
          without it, a tall item list could never be capped/scrolled and
          would instead push Quick Summary down or off-screen. overflow-y-auto
          then makes ONLY this region scrollable if its content ever exceeds
          the space it was allocated. */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 min-[1440px]:px-4 py-5">
        <ul className="space-y-2">
          {NAV_ITEMS.map((item) => {
            if (item.children) {
              const ParentIcon = item.icon;
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => setIsProjectsOpen((v) => !v)}
                    aria-expanded={isProjectsOpen}
                    aria-controls="pmo-projects-submenu"
                    className={`
                      pmo-nav-item
                      w-full flex items-center justify-center min-[1440px]:justify-between
                      gap-3 rounded-xl px-3 min-[1440px]:px-4 py-3 text-sm font-medium
                      ${
                        isProjectsSectionActive
                          ? "pmo-nav-active text-white"
                          : "text-slate-300 hover:bg-white/10 hover:text-white"
                      }
                    `}
                  >
                    <span className="flex items-center gap-3">
                      <ParentIcon size={19} className="pmo-nav-icon shrink-0" />
                      <span className="pmo-nav-label hidden min-[1440px]:block font-semibold tracking-[0.01em]">
                        {item.label}
                      </span>
                      {item.hasNotification && <span className="pmo-nav-dot hidden min-[1440px]:inline-block" />}
                    </span>
                    <ChevronDown
                      size={15}
                      className={`pmo-dropdown-chevron hidden min-[1440px]:block shrink-0 ${
                        isProjectsOpen ? "pmo-rotated" : ""
                      }`}
                    />
                  </button>

                  <div
                    id="pmo-projects-submenu"
                    role="group"
                    className={`pmo-dropdown-panel ${isProjectsOpen ? "pmo-dropdown-open" : ""}`}
                  >
                    <ul className="pmo-child-list mt-1.5 space-y-1 min-[1440px]:pl-5 ml-1">
                      {item.children.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive =
                          child.to === "/projects" ? isRepositoryActive : isCompletedProjectsActive;
                        return (
                          <li key={child.to}>
                            <NavLink
                              to={child.to}
                              className={`
                                pmo-nav-item
                                flex items-center justify-center min-[1440px]:justify-start
                                gap-3 rounded-xl px-3 min-[1440px]:px-4 py-2.5 text-sm font-medium
                                ${
                                  childActive
                                    ? "pmo-child-active text-white"
                                    : "text-slate-400 hover:bg-white/10 hover:text-white"
                                }
                              `}
                            >
                              <ChildIcon size={16} className="pmo-nav-icon shrink-0" />
                              <span className="pmo-nav-label hidden min-[1440px]:block truncate">{child.label}</span>
                            </NavLink>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </li>
              );
            }

            const { label, to, icon: Icon, hasNotification } = item;
            return (
              <li key={to}>
                <NavLink
                  to={to!}
                  end={to === "/"}
                  className={({ isActive }) =>
                    `
                    pmo-nav-item
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
                    ${
                      isActive
                        ? "pmo-nav-active text-white"
                        : "text-slate-300 hover:bg-white/10 hover:text-white"
                    }
                  `
                  }
                >
                  <Icon
                    size={19}
                    className="pmo-nav-icon shrink-0"
                  />
                  <span className="pmo-nav-label hidden min-[1440px]:block font-semibold tracking-[0.01em]">{label}</span>
                  {hasNotification && <span className="pmo-nav-dot hidden min-[1440px]:inline-block" />}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom Summary — shrink-0 so it always renders at its natural
          height and stays anchored to the bottom, right after Navigation's
          flexible space, never compressed or pushed below the viewport. */}
      <div className="shrink-0 hidden min-[1440px]:block p-4">
        <div className="pmo-qs-card rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-sm p-4 shadow-xl">
          <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">
            Quick Summary
          </h3>

          <div className="space-y-2">
            {SUMMARY_ROWS.map(({ icon: Icon, color, label, statusKey }) => {
              const active = isStatusActive(statusKey);
              const value = counts[statusKey] ?? 0;
              return (
                <button
                  key={statusKey}
                  onClick={() => handleRowClick(statusKey)}
                  onContextMenu={(e) => handleContextMenu(e, statusKey)}
                  tabIndex={0}
                  className={`pmo-qs-row w-full relative flex items-center justify-between text-sm px-3.5 py-2.5 rounded-xl border border-transparent cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 select-none group active:scale-[0.98] ${
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
                    <Icon size={15} className={`pmo-qs-icon shrink-0 ${color}`} />
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
