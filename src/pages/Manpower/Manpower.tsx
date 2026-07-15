import { useEffect, useMemo, useState, useRef } from "react";
import {
  Users,
  Plus,
  Search,
  ArrowUpDown,
  Download,
  Upload,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
  MapPin,
  CheckCircle,
} from "lucide-react";

import type { Employee } from "../../types/EmployeeModel";
import {
  getEmployees,
  deleteEmployee,
  exportEmployeesToExcel,
  importEmployeesFromExcel,
  downloadEmployeeTemplate,
} from "../../services/employeeService";
import EmployeeModal from "./components/EmployeeModal";

const Manpower = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live employee database state
  const [employees, setEmployees] = useState<Employee[]>(getEmployees());

  // Search & Filter State
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [locFilter, setLocFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [gradeFilter, setGradeFilter] = useState("All");

  // Sorting State
  const [sortField, setSortField] = useState<string>("employeeNo");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Active Modals / Confirmations State
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Clock State for Hero
  const [currentTime, setCurrentTime] = useState("");

  // Sync clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }) + " IST"
      );
    };
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, []);

  // Computed statistics (dynamic live summaries)
  const stats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter((e) => e.status === "Active").length;
    const depts = new Set(employees.map((e) => e.department).filter(Boolean)).size;
    const locations = new Set(employees.map((e) => e.location).filter(Boolean)).size;
    return { total, active, depts, locations };
  }, [employees]);

  // Unique lists for dropdown filters
  const uniqueDepts = useMemo(() => {
    return ["All", ...new Set(employees.map((e) => e.department).filter(Boolean))];
  }, [employees]);

  const uniqueLocs = useMemo(() => {
    return ["All", ...new Set(employees.map((e) => e.location).filter(Boolean))];
  }, [employees]);

  const uniqueGrades = useMemo(() => {
    return ["All", ...new Set(employees.map((e) => e.grade).filter(Boolean))];
  }, [employees]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, deptFilter, locFilter, statusFilter, gradeFilter]);

  // Handle Sort Toggle
  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Filtered & Sorted Employees
  const processedEmployees = useMemo(() => {
    let result = employees.filter((e) => {
      const matchSearch =
        !search ||
        (e.employeeNo || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.employeeName || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.designation || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.department || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.reportingManager || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.location || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.grade || "").toLowerCase().includes(search.toLowerCase());

      const matchDept = deptFilter === "All" || e.department === deptFilter;
      const matchLoc = locFilter === "All" || e.location === locFilter;
      const matchStatus = statusFilter === "All" || e.status === statusFilter;
      const matchGrade = gradeFilter === "All" || e.grade === gradeFilter;

      return matchSearch && matchDept && matchLoc && matchStatus && matchGrade;
    });

    // Sort
    result.sort((a, b) => {
      let valA: any = a[sortField as keyof Employee] ?? "";
      let valB: any = b[sortField as keyof Employee] ?? "";

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
  }, [employees, search, deptFilter, locFilter, statusFilter, gradeFilter, sortField, sortAsc]);

  // Pagination bounds
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedEmployees.slice(start, start + pageSize);
  }, [processedEmployees, currentPage]);

  const totalPages = Math.max(
    Math.ceil(processedEmployees.length / pageSize),
    1
  );

  // Clear & Reset Filter shortcuts
  const clr = () => setSearch("");
  const rst = () => {
    setSearch("");
    setDeptFilter("All");
    setLocFilter("All");
    setStatusFilter("All");
    setGradeFilter("All");
  };

  // Export Filtered to Excel
  const handleExportFiltered = () => {
    exportEmployeesToExcel(processedEmployees);
  };

  // File Import Logic
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await importEmployeesFromExcel(file);
      setEmployees(getEmployees());
      alert(
        `Import complete!\n\nEmployees Added: ${result.added}\nEmployees Updated: ${result.updated}\nTotal Imported: ${result.totalImported}`
      );
    } catch (err: any) {
      alert(err.message || "Failed to import Excel file. Verify file template format.");
    } finally {
      e.target.value = "";
    }
  };

  // Status Chip styling
  const renderStatusBadge = (status: string) => {
    let cls = "bg-blue-50 text-blue-700 dark:bg-blue-950/20 dark:text-blue-400";
    let dot = "bg-blue-500";
    if (status === "Inactive") {
      cls = "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-300";
      dot = "bg-red-500";
    } else if (status === "On Leave") {
      cls = "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300";
      dot = "bg-amber-500";
    } else if (status === "Resigned") {
      cls = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400";
      dot = "bg-slate-500";
    }
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cls}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
        {status}
      </span>
    );
  };

  // Department Chip styling
  const getDeptColorClass = (dept: string) => {
    const d = (dept || "").toLowerCase().trim();
    if (d.includes("instrument")) return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/20 dark:text-sky-400 dark:border-sky-850/20";
    if (d.includes("elect")) return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-850/20";
    if (d.includes("civil")) return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800/30";
    if (d.includes("mech")) return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-850/20";
    if (d.includes("process")) return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/20 dark:text-purple-300 dark:border-purple-850/20";
    return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/20 dark:text-slate-400 dark:border-slate-800/20";
  };

  return (
    <div className="manpower-workspace space-y-4">
      {/* ─── CUSTOM STYLES SCOPING ─── */}
      <style dangerouslySetInnerHTML={{ __html: `
        .pmo-hero {
          border-radius: 14px; overflow: hidden; position: relative;
          background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #0E7490 100%);
        }
        html.dark .pmo-hero {
          background: linear-gradient(-45deg, #152B68 0%, #1F52C4 30%, #0B6059 65%, #0892C8 100%) !important;
          background-size: 300% 300% !important; animation: gradientShift 22s ease-in-out infinite !important;
          border: 1px solid rgba(56,139,253,.16) !important;
          box-shadow: 0 8px 28px rgba(0,0,0,.48) !important;
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
              iFluids Engineering · Resource Control
            </div>
            <h1 className="pmo-hero-title text-3xl font-extrabold text-white tracking-tight leading-none">
              Manpower Master
            </h1>
            <p className="text-slate-300/80 text-sm mt-1 max-w-xl leading-relaxed">
              Manage employee records, project allocations, departments and engineering resources across the PMO Portal.
            </p>
            {/* Status counts */}
            <div className="chips flex items-center gap-2 mt-4">
              <div className="pmo-chip">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mb-1"></span>
                <span className="chip-count text-2xl font-black text-white leading-none tracking-tight">{stats.total}</span>
                <span className="chip-lbl text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Staff</span>
              </div>
              <div className="pmo-chip">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mb-1"></span>
                <span className="chip-count text-2xl font-black text-white leading-none tracking-tight">{stats.active}</span>
                <span className="chip-lbl text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active</span>
              </div>
              <div className="pmo-chip">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mb-1"></span>
                <span className="chip-count text-2xl font-black text-white leading-none tracking-tight">{stats.depts}</span>
                <span className="chip-lbl text-[9px] font-bold text-slate-400 uppercase tracking-widest">Departments</span>
              </div>
              <div className="pmo-chip">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mb-1"></span>
                <span className="chip-count text-2xl font-black text-white leading-none tracking-tight">{stats.locations}</span>
                <span className="chip-lbl text-[9px] font-bold text-slate-400 uppercase tracking-widest">Locations</span>
              </div>
            </div>
          </div>

          {/* Right actions & clock */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            <button
              onClick={() => setShowAddModal(true)}
              className="btn-add flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg transition duration-150 transform hover:-translate-y-px"
            >
              <Plus size={15} />
              Add Employee
            </button>
            <div className="text-right flex flex-col items-end gap-1.5">
              <span className="pmo-live-pill">
                <span className="pmo-live-dot"></span>
                Live Sync
              </span>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Users size={13} className="text-slate-500" />
                Manpower DB &nbsp;
                <strong className="text-slate-100 font-extrabold">{stats.total} Employees</strong>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <ChevronRight size={13} className="text-slate-500" />
                Updated &nbsp;
                <strong className="text-slate-100 font-extrabold">{currentTime || "Loading..."}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ KPI SUMMARY BAR ═══════════ */}
      <div className="grid grid-cols-4 gap-3">
        <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="mi w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center">
            <Users size={15} className="text-blue-500" />
          </div>
          <div>
            <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Total Employees</div>
            <div className="mv text-lg font-black text-slate-800 dark:text-slate-100 leading-none mt-1">{stats.total}</div>
          </div>
        </div>
        <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="mi w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center">
            <CheckCircle size={15} className="text-emerald-500" />
          </div>
          <div>
            <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Active Employees</div>
            <div className="mv text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1">{stats.active}</div>
          </div>
        </div>
        <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="mi w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center">
            <Layers size={15} className="text-indigo-500" />
          </div>
          <div>
            <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Departments</div>
            <div className="mv text-lg font-black text-indigo-600 dark:text-indigo-400 leading-none mt-1">{stats.depts}</div>
          </div>
        </div>
        <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
          <div className="mi w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center">
            <MapPin size={15} className="text-amber-500" />
          </div>
          <div>
            <div className="ml text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase">Locations</div>
            <div className="mv text-lg font-black text-amber-600 dark:text-amber-400 leading-none mt-1">{stats.locations}</div>
          </div>
        </div>
      </div>

      {/* ═══════════ EMPLOYEE REPOSITORY CARD ═══════════ */}
      <div className="pmo-repo bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0">
        
        {/* Card Header */}
        <div className="rh flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="rh-l flex items-center gap-3">
            <div className="rh-icon w-9 h-9 bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center rounded-xl">
              <Users size={16} className="text-blue-500" />
            </div>
            <div>
              <h2 className="rh-title text-base font-bold text-slate-800 dark:text-slate-100">
                Employee Repository
              </h2>
              <p className="rh-sub text-xs text-slate-400">
                Search, filter, and manage engineering resource pool records
              </p>
            </div>
          </div>
          <span className="cnt-badge text-xs font-bold px-3 py-1 bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 rounded-full border border-blue-100 dark:border-blue-900/30">
            Showing {processedEmployees.length} of {employees.length} Staff
          </span>
        </div>

        {/* Toolbar */}
        <div className="toolbar flex items-center justify-between gap-2 p-3 bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex-wrap">
          <div className="flex flex-1 items-center gap-2 min-w-0 flex-wrap">
            {/* Search */}
            <div className="sw relative flex-1 max-w-[280px]">
              <Search size={12} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search Emp No · Name · Grade..."
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
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="flt py-1.5 px-3 pr-8 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer"
            >
              <option value="All">All Departments</option>
              {uniqueDepts
                .filter((d) => d !== "All")
                .map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
            </select>

            {/* Location Filter */}
            <select
              value={locFilter}
              onChange={(e) => setLocFilter(e.target.value)}
              className="flt py-1.5 px-3 pr-8 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer"
            >
              <option value="All">All Locations</option>
              {uniqueLocs
                .filter((l) => l !== "All")
                .map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flt py-1.5 px-3 pr-8 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="On Leave">On Leave</option>
              <option value="Resigned">Resigned</option>
            </select>

            {/* Grade Filter */}
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="flt py-1.5 px-3 pr-8 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none cursor-pointer"
            >
              <option value="All">All Grades</option>
              {uniqueGrades
                .filter((g) => g !== "All")
                .map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
            </select>

            <div className="t-sep h-5 w-[1px] bg-slate-200 dark:bg-slate-800"></div>

            {/* Sort button */}
            <button
              onClick={() => toggleSort(sortField === "employeeNo" ? "employeeName" : "employeeNo")}
              className="tbtn flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-400"
            >
              <ArrowUpDown size={11} />
              Sort
            </button>

            {/* Export button */}
            <button
              onClick={handleExportFiltered}
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
          </div>

          {/* Download Template button */}
          <button
            onClick={downloadEmployeeTemplate}
            className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <Download size={10} />
            Download Sample Template
          </button>
        </div>

        {/* TABLE CONTAINER */}
        <div className="ts overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <th onClick={() => toggleSort("employeeNo")} className="p-3 font-extrabold uppercase select-none text-left">
                  Employee No <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("employeeName")} className="p-3 font-extrabold uppercase select-none text-left">
                  Employee Name <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("designation")} className="p-3 font-extrabold uppercase select-none text-left">
                  Designation <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("department")} className="p-3 font-extrabold uppercase select-none text-left">
                  Department <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("location")} className="p-3 font-extrabold uppercase select-none text-left">
                  Location <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("reportingManager")} className="p-3 font-extrabold uppercase select-none text-left">
                  Reporting Manager <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("grade")} className="p-3 font-extrabold uppercase select-none text-center">
                  Grade <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("manhourExpenses")} className="p-3 font-extrabold uppercase select-none text-right">
                  Man-Hour Expenses <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th onClick={() => toggleSort("status")} className="p-3 font-extrabold uppercase select-none text-center">
                  Status <span className="sic"><ArrowUpDown size={8} /></span>
                </th>
                <th className="p-3 font-extrabold uppercase select-none text-center">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    No Employees Found matching selected filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-blue-50/20 dark:hover:bg-slate-800/30 transition-all duration-100"
                  >
                    <td className="p-3 font-semibold pmo-prno">{e.employeeNo}</td>
                    <td className="p-3">
                      <div className="tclient font-bold text-slate-800 dark:text-slate-100">{e.employeeName}</div>
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 font-medium">{e.designation || "—"}</td>
                    <td className="p-3">
                      <span className={`dept ${getDeptColorClass(e.department)}`}>
                        {e.department || "—"}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 font-medium">{e.location || "—"}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 font-medium">{e.reportingManager || "—"}</td>
                    <td className="p-3 text-center font-bold text-slate-500">{e.grade || "—"}</td>
                    <td className="p-3 text-right font-bold text-slate-800 dark:text-slate-100 pmo-prno">
                      ₹ {(e.manhourExpenses || 0).toLocaleString("en-IN")}
                    </td>
                    <td className="p-3 text-center">
                      {renderStatusBadge(e.status)}
                    </td>
                    <td className="p-3 text-center">
                      <div className="acts">
                        <div className="pmo-act-wrap bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-900">
                          <button
                            onClick={() => setSelectedEmployee(e)}
                            className="pmo-act-btn act-e hover:bg-slate-100/50 hover:text-slate-600"
                            title="Edit Employee Details"
                          >
                            <Pencil />
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(e.id)}
                            className="pmo-act-btn act-d hover:bg-red-100/40 hover:text-red-600"
                            title="Delete Employee Record"
                          >
                            <Trash2 />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer & Pagination */}
        <div className="tf flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs">
          <div className="flex items-center gap-4">
            <span className="text-slate-400">
              Showing <strong>{paginatedEmployees.length}</strong> of <strong>{processedEmployees.length}</strong> employees
            </span>
            <div className="tf-prog flex items-center gap-1.5 text-[10.5px]">
              <span className="text-slate-400">Status</span>
              <div className="tf-prog-bar w-16 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="tf-prog-fill h-full bg-blue-500 rounded-full"
                  style={{ width: `${(processedEmployees.length / Math.max(employees.length, 1)) * 100}%` }}
                ></div>
              </div>
              <strong className="text-slate-500">{Math.round((processedEmployees.length / Math.max(employees.length, 1)) * 100)}% filtered</strong>
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

      {/* ─── ADD EMPLOYEE MODAL ─── */}
      {showAddModal && (
        <EmployeeModal
          employees={employees}
          setEmployees={setEmployees}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* ─── EDIT EMPLOYEE MODAL ─── */}
      {selectedEmployee && (
        <EmployeeModal
          employee={selectedEmployee}
          employees={employees}
          setEmployees={setEmployees}
          onClose={() => setSelectedEmployee(null)}
        />
      )}

      {/* ─── ENTERPRISE DELETE CONFIRMATION MODAL ─── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Delete Employee?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 border rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (deleteConfirmId) {
                    deleteEmployee(deleteConfirmId);
                    setEmployees(getEmployees());
                    setDeleteConfirmId(null);
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Manpower;
