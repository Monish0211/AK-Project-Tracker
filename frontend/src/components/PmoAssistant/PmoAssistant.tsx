import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Bot,
  X,
  Search,
  User,
  Building2,
  FolderKanban,
  Clock,
  HelpCircle,
  ArrowLeft,
  ExternalLink,
  ShieldAlert,
  ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/authContext";
import { hasModuleAccess } from "../../auth/permissions";
import { getEmployees, loadEmployeesForApp } from "../../services/employeeService";
import { getCustomers, loadCustomersForApp } from "../../services/customerService";
import { getProjects, fetchAllProjectsFromApi } from "../../services/projectService";
import { getAllTimesheetImports, waitForTimesheetHydration } from "../../services/timesheetService";
import { PmoAssistantOrb } from "./PmoAssistantOrb";

type ViewMode = "home" | "employee" | "customer" | "project" | "timesheet" | "help";

export const PmoAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewMode>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [customers, setCustomers] = useState(() => getCustomers());
  const [employees, setEmployees] = useState(() => getEmployees());
  const [projects, setProjects] = useState(() => getProjects());
  const [timesheetImports, setTimesheetImports] = useState(() => getAllTimesheetImports());
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleOpenView = (view: ViewMode) => {
    setActiveView(view);
    setSearchQuery("");
  };

  const handleBackToHome = () => {
    setActiveView("home");
    setSearchQuery("");
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. MODULE ACCESS CHECKS
  // ─────────────────────────────────────────────────────────────────────────────
  const canAccessManpower = hasModuleAccess(user, "Manpower");
  const canAccessCustomerMaster = hasModuleAccess(user, "Customer Master");
  const canAccessProjects = hasModuleAccess(user, "Projects");
  const canAccessTimesheets = hasModuleAccess(user, "Timesheets");

  useEffect(() => {
    if (!isOpen || !canAccessCustomerMaster) return;
    let isMounted = true;
    loadCustomersForApp()
      .then((items) => {
        if (isMounted) setCustomers(items);
      })
      .catch(() => {
        /* keep cache / empty — assistant search is best-effort */
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen, canAccessCustomerMaster]);

  // getEmployees() is a pure localStorage read (see employeeService.ts) —
  // it only has data once something has already called loadEmployeesForApp()
  // to hydrate that mirror from PostgreSQL. Manpower.tsx does that on its
  // own mount, but the assistant can be opened from any page (e.g.
  // Dashboard) before the user ever visits Manpower in this session, so
  // without its own load here "Find Employee" silently searches an empty
  // cache and always reports no matches — same reasoning as the customer
  // load effect above, mirrored for employees.
  useEffect(() => {
    if (!isOpen || !canAccessManpower) return;
    let isMounted = true;
    loadEmployeesForApp()
      .then((result) => {
        if (isMounted) setEmployees(result.employees);
      })
      .catch(() => {
        /* keep cache / empty — assistant search is best-effort */
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen, canAccessManpower]);

  // getProjects() is the same pure-localStorage-mirror pattern as
  // getEmployees() — it only has data once fetchProjectsFromApi() (the
  // Projects page) or fetchAllProjectsFromApi() (Reports) has already
  // written through in this session. Loads the FULL set via
  // fetchAllProjectsFromApi() (the same bulk loop Reports already uses),
  // not the Projects page's own paginated fetchProjectsFromApi(), since
  // the assistant needs to search everything, not one filtered page.
  useEffect(() => {
    if (!isOpen || !canAccessProjects) return;
    let isMounted = true;
    fetchAllProjectsFromApi()
      .then((items) => {
        if (isMounted) setProjects(items);
      })
      .catch(() => {
        /* keep cache / empty — assistant search is best-effort */
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen, canAccessProjects]);

  // getAllTimesheetImports() self-triggers its own IndexedDB hydration and
  // doesn't require visiting Timesheets first (unlike Employees/Projects
  // above), but hydration finishing doesn't itself trigger a re-render —
  // if the assistant is opened and searched moments after the app loads,
  // before that background hydration settles, this re-reads once it does
  // via waitForTimesheetHydration() instead of leaving a stale/incomplete
  // snapshot on screen until the user happens to type again.
  useEffect(() => {
    if (!isOpen || !canAccessTimesheets) return;
    let isMounted = true;
    waitForTimesheetHydration()
      .then((months) => {
        if (isMounted) setTimesheetImports(months);
      })
      .catch(() => {
        /* keep cache / empty — assistant search is best-effort */
      });
    return () => {
      isMounted = false;
    };
  }, [isOpen, canAccessTimesheets]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SEARCH & LOOKUP RESULTS (Consuming existing services)
  // ─────────────────────────────────────────────────────────────────────────────
  const employeeResults = useMemo(() => {
    if (!searchQuery.trim() || !canAccessManpower) return [];
    const q = searchQuery.trim().toLowerCase();
    return employees.filter(
      (emp) =>
        emp.employeeNo?.toLowerCase().includes(q) ||
        emp.employeeName?.toLowerCase().includes(q)
    );
  }, [searchQuery, canAccessManpower, employees]);

  const customerResults = useMemo(() => {
    if (!searchQuery.trim() || !canAccessCustomerMaster) return [];
    const q = searchQuery.trim().toLowerCase();
    return customers.filter(
      (c) =>
        c.customerName?.toLowerCase().includes(q) ||
        c.customerId?.toLowerCase().includes(q) ||
        c.companyName?.toLowerCase().includes(q)
    );
  }, [searchQuery, canAccessCustomerMaster, customers]);

  const projectResults = useMemo(() => {
    if (!searchQuery.trim() || !canAccessProjects) return [];
    const q = searchQuery.trim().toLowerCase();
    return projects.filter(
      (p) =>
        p.prNo?.toLowerCase().includes(q) ||
        p.projectTitle?.toLowerCase().includes(q) ||
        p.client?.toLowerCase().includes(q)
    );
  }, [searchQuery, canAccessProjects, projects]);

  const timesheetResults = useMemo(() => {
    if (!searchQuery.trim() || !canAccessTimesheets) return [];
    const q = searchQuery.trim().toLowerCase();
    const imports = timesheetImports;

    const matches: Array<{
      employeeNo: string;
      employeeName: string;
      rawProjectCode: string;
      rawProjectName: string;
      hours: number;
      date: string;
    }> = [];

    imports.forEach((m) => {
      (m.entries || []).forEach((entry) => {
        const empNo = entry.employeeNo || "";
        const empName = entry.employeeName || "";
        const prCode = entry.projectCode || "";
        const rawName = entry.projectName || "";

        if (
          empNo.toLowerCase().includes(q) ||
          empName.toLowerCase().includes(q) ||
          prCode.toLowerCase().includes(q) ||
          rawName.toLowerCase().includes(q)
        ) {
          matches.push({
            employeeNo: empNo,
            employeeName: empName,
            rawProjectCode: prCode,
            rawProjectName: rawName,
            hours: entry.hours || 0,
            date: entry.date || m.month,
          });
        }
      });
    });

    return matches.slice(0, 10); // Display top 10 relevant matches
  }, [searchQuery, canAccessTimesheets, timesheetImports]);
  const [anchorPos, setAnchorPos] = useState<{ left: number; top: number }>({ left: 24, top: 120 });

  const handleOrbTogglePanel = (rect: DOMRect) => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    const panelWidth = Math.min(380, window.innerWidth - 32);
    const panelHeight = Math.min(520, window.innerHeight - 32);

    // Intelligent Viewport Placement relative to Draggable Orb position
    let targetLeft = rect.left;
    let targetTop = rect.top - panelHeight - 12; // Default: Open above orb

    // If orb is in top half of screen, open panel below orb
    if (rect.top < window.innerHeight / 2) {
      targetTop = rect.bottom + 12;
    }

    // Align horizontal edge if orb is on right half of screen
    if (rect.left > window.innerWidth / 2) {
      targetLeft = rect.right - panelWidth;
    }

    // Strict clamping within viewport boundaries
    targetLeft = Math.max(16, Math.min(targetLeft, window.innerWidth - panelWidth - 16));
    targetTop = Math.max(16, Math.min(targetTop, window.innerHeight - panelHeight - 16));

    setAnchorPos({ left: targetLeft, top: targetTop });
    setIsOpen(true);
    setActiveView("home");
    setSearchQuery("");
  };

  React.useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvt = e as CustomEvent<{ rect?: DOMRect }>;
      const rect = customEvt.detail?.rect;

      if (rect) {
        handleOrbTogglePanel(rect);
      } else {
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("pmo:open-assistant", handleOpen as EventListener);
    return () => window.removeEventListener("pmo:open-assistant", handleOpen as EventListener);
  }, [isOpen]);

  return (
    <>
      {/* Draggable Floating Spherical PMO Assistant Orb */}
      <PmoAssistantOrb onTogglePanel={handleOrbTogglePanel} />

      {/* Floating Assistant Panel (Fixed Viewport Overlay Anchored Relative to
          Draggable Orb). Portaled directly into document.body for the same
          reason PmoAssistantOrb is: this div was rendering inside
          MainLayout's wrapper, which carries `.animate-pmo-fade-up`
          (index.css's `pmoFadeUp` keyframe ends at `filter: blur(0)`, not
          `filter: none`, and with `animation-fill-mode: forwards` that
          leaves a permanent non-none `filter` on the wrapper). Per the CSS
          Filter Effects spec, any non-none `filter` on an ancestor creates a
          new containing block for `position: fixed` descendants, so the
          panel's "fixed" left/top were being resolved against that
          scrolling wrapper's box instead of the true viewport — placing it
          far from the orb (worse the more the page had scrolled) even
          though anchorPos itself was already computed correctly from the
          orb's real getBoundingClientRect(). The orb was already immune to
          this (it has its own portal); the panel did not, and is not a
          child of the orb or vice versa either way — this portal is the
          only change needed to make the panel immune too. */}
      {isOpen &&
        createPortal(
          <div
            style={{ position: "fixed", left: `${anchorPos.left}px`, top: `${anchorPos.top}px` }}
            className="z-[100000] font-sans no-print w-[min(380px,calc(100vw-32px))] h-[min(520px,calc(100vh-32px))] max-h-[calc(100vh-32px)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-200"
          >
          {/* Left Popover Arrow Connector pointing to Sidebar Spherical Mascot */}
          <div className="absolute -left-2 top-24 w-4 h-4 bg-slate-900 border-l border-b border-blue-900/40 transform rotate-45 hidden sm:block z-10" />

          {/* Header */}
          <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-3.5 text-white flex items-center justify-between border-b border-blue-900/40">
            <div className="flex items-center gap-2.5">
              {activeView !== "home" && (
                <button
                  type="button"
                  onClick={handleBackToHome}
                  className="p-1 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition"
                  title="Back to menu"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-400/40 flex items-center justify-center">
                <Bot size={16} className="text-blue-300" />
              </div>
              <div>
                <h3 className="text-xs font-bold leading-none text-white">PMO Assistant</h3>
                <p className="text-[10px] text-blue-200/70 mt-0.5 font-medium">System Helper</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Panel Content Body */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50 dark:bg-slate-900/50">
            {/* ── HOME VIEW ── */}
            {activeView === "home" && (
              <div className="space-y-3.5">
                <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 flex items-start gap-2.5">
                  <Bot size={20} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-relaxed">
                    Hi! What would you like to find? Select an action below:
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenView("employee")}
                    className="w-full p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 hover:border-blue-500 dark:hover:border-blue-500 text-left flex items-center justify-between group transition cursor-pointer shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                        <User size={16} />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Find Employee</span>
                    </div>
                    <ChevronRight size={14} className="text-slate-400 group-hover:text-blue-600 transition" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenView("customer")}
                    className="w-full p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 hover:border-blue-500 dark:hover:border-blue-500 text-left flex items-center justify-between group transition cursor-pointer shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                        <Building2 size={16} />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Find Customer</span>
                    </div>
                    <ChevronRight size={14} className="text-slate-400 group-hover:text-indigo-600 transition" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenView("project")}
                    className="w-full p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 hover:border-blue-500 dark:hover:border-blue-500 text-left flex items-center justify-between group transition cursor-pointer shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                        <FolderKanban size={16} />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Find Project</span>
                    </div>
                    <ChevronRight size={14} className="text-slate-400 group-hover:text-emerald-600 transition" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenView("timesheet")}
                    className="w-full p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 hover:border-blue-500 dark:hover:border-blue-500 text-left flex items-center justify-between group transition cursor-pointer shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                        <Clock size={16} />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Find Timesheet</span>
                    </div>
                    <ChevronRight size={14} className="text-slate-400 group-hover:text-amber-600 transition" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenView("help")}
                    className="w-full p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 hover:border-blue-500 dark:hover:border-blue-500 text-left flex items-center justify-between group transition cursor-pointer shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                        <HelpCircle size={16} />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Portal Help</span>
                    </div>
                    <ChevronRight size={14} className="text-slate-400 group-hover:text-purple-600 transition" />
                  </button>
                </div>
              </div>
            )}

            {/* ── FIND EMPLOYEE VIEW ── */}
            {activeView === "employee" && (
              <div className="space-y-3.5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Find Employee
                </h4>

                {!canAccessManpower ? (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 text-xs font-semibold flex items-center gap-2.5">
                    <ShieldAlert size={18} className="shrink-0 text-amber-600" />
                    <span>Manpower access is not enabled for your account.</span>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by Employee Name or ID..."
                        className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="space-y-2">
                      {searchQuery.trim() && employeeResults.length === 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                          No matching employee found.
                        </p>
                      )}

                      {employeeResults.map((emp) => (
                        <div
                          key={emp.id || emp.employeeNo}
                          className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 space-y-1.5"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider block">
                                ID: {emp.employeeNo}
                              </span>
                              <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {emp.employeeName}
                              </h5>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setIsOpen(false);
                                navigate("/manpower");
                              }}
                              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                            >
                              <span>View</span>
                              <ExternalLink size={10} />
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 grid grid-cols-2 gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                            <div>Dept: <span className="font-medium text-slate-700 dark:text-slate-300">{emp.department || "—"}</span></div>
                            <div>Desig: <span className="font-medium text-slate-700 dark:text-slate-300">{emp.designation || "—"}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── FIND CUSTOMER VIEW ── */}
            {activeView === "customer" && (
              <div className="space-y-3.5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Find Customer
                </h4>

                {!canAccessCustomerMaster ? (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 text-xs font-semibold flex items-center gap-2.5">
                    <ShieldAlert size={18} className="shrink-0 text-amber-600" />
                    <span>Customer Master access is not enabled for your account.</span>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by Customer Name or Code..."
                        className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="space-y-2">
                      {searchQuery.trim() && customerResults.length === 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                          No matching customer found.
                        </p>
                      )}

                      {customerResults.map((c) => (
                        <div
                          key={c.id || c.customerId}
                          className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 space-y-1.5"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                                Code: {c.customerId || "—"}
                              </span>
                              <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {c.customerName}
                              </h5>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setIsOpen(false);
                                navigate("/customers");
                              }}
                              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                            >
                              <span>View</span>
                              <ExternalLink size={10} />
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 grid grid-cols-2 gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                            <div>Country: <span className="font-medium text-slate-700 dark:text-slate-300">{c.country || "India"}</span></div>
                            <div>Status: <span className="font-medium text-slate-700 dark:text-slate-300">{c.status}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── FIND PROJECT VIEW ── */}
            {activeView === "project" && (
              <div className="space-y-3.5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Find Project
                </h4>

                {!canAccessProjects ? (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 text-xs font-semibold flex items-center gap-2.5">
                    <ShieldAlert size={18} className="shrink-0 text-amber-600" />
                    <span>Projects access is not enabled for your account.</span>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by PR Number, Name, Customer..."
                        className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="space-y-2">
                      {searchQuery.trim() && projectResults.length === 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                          No matching project found.
                        </p>
                      )}

                      {projectResults.map((p) => (
                        <div
                          key={p.id}
                          className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 space-y-1.5"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block">
                                PR {p.prNo}
                              </span>
                              <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                                {p.projectTitle}
                              </h5>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setIsOpen(false);
                                navigate(`/projects/view/${p.id}`);
                              }}
                              className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 shrink-0 ml-2"
                            >
                              <span>Open</span>
                              <ExternalLink size={10} />
                            </button>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 grid grid-cols-2 gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                            <div>Client: <span className="font-medium text-slate-700 dark:text-slate-300">{p.client || "—"}</span></div>
                            <div>Status: <span className="font-medium text-slate-700 dark:text-slate-300">{p.projectStatus || "Active"}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── FIND TIMESHEET VIEW ── */}
            {activeView === "timesheet" && (
              <div className="space-y-3.5">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Find Timesheet
                </h4>

                {!canAccessTimesheets ? (
                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 text-xs font-semibold flex items-center gap-2.5">
                    <ShieldAlert size={18} className="shrink-0 text-amber-600" />
                    <span>Timesheet access is not enabled for your account.</span>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by Emp ID, Name, or PR Number..."
                        className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="space-y-2">
                      {searchQuery.trim() && timesheetResults.length === 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                          No matching timesheet record found.
                        </p>
                      )}

                      {timesheetResults.map((ts, idx) => (
                        <div
                          key={`${ts.employeeNo}-${ts.rawProjectCode}-${idx}`}
                          className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80 space-y-1.5 text-xs"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] font-extrabold text-amber-600 dark:text-amber-400 uppercase tracking-wider block">
                                Emp ID: {ts.employeeNo} ({ts.employeeName})
                              </span>
                              {/* RULE 15: Use rawProjectCode and rawProjectName (NEVER substitute Project.projectTitle) */}
                              <h5 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                Project Code: {ts.rawProjectCode}
                              </h5>
                            </div>
                            <span className="font-extrabold text-amber-600 dark:text-amber-400 text-xs shrink-0">
                              {ts.hours} hrs
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300 font-medium line-clamp-2">
                            Project Name: {ts.rawProjectName || "—"}
                          </p>
                          <div className="text-[10.5px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                            <span>Date/Month: {ts.date}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsOpen(false);
                                navigate("/timesheets");
                              }}
                              className="font-bold text-amber-600 dark:text-amber-400 hover:underline"
                            >
                              Open Timesheets
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── PORTAL HELP VIEW ── */}
            {activeView === "help" && (
              <div className="space-y-3.5 text-xs">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Portal Navigation Help
                </h4>

                <div className="space-y-2.5">
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                    <p className="font-bold text-slate-900 dark:text-slate-100">How do I add a project?</p>
                    <p className="text-slate-600 dark:text-slate-300">Go to: Projects → Project Repository → Add Project</p>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                    <p className="font-bold text-slate-900 dark:text-slate-100">Where can I find employees?</p>
                    <p className="text-slate-600 dark:text-slate-300">Open Manpower module from sidebar navigation.</p>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                    <p className="font-bold text-slate-900 dark:text-slate-100">Where can I find customers?</p>
                    <p className="text-slate-600 dark:text-slate-300">Open Customer Master module from sidebar navigation.</p>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                    <p className="font-bold text-slate-900 dark:text-slate-100">Where can I view timesheets?</p>
                    <p className="text-slate-600 dark:text-slate-300">Open Timesheets module from sidebar navigation.</p>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                    <p className="font-bold text-slate-900 dark:text-slate-100">Where can I find completed projects?</p>
                    <p className="text-slate-600 dark:text-slate-300">Go to: Projects → Completed Projects</p>
                  </div>
                </div>
              </div>
            )}
          </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default PmoAssistant;
