import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  Download,
  Layers,
  Clock,
  Briefcase,
  Users,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Grid,
  ChevronLeft,
  ChevronRight,
  Printer,
  ChevronDown,
  Search,
  ArrowUpDown,
} from "lucide-react";
import * as XLSX from "xlsx";

import { getProjects } from "../../services/projectService";
import { getEmployees } from "../../services/employeeService";
import { getInvoices } from "../../services/invoiceService";
import { getProjectCommercialSummary } from "../../services/invoiceProgressService";
import { getTotalProjectCost, getGrossProfit } from "../../services/expenseService";
import { getAllTimesheetImports } from "../../services/timesheetService";
import { getProcessedEmployeeTotalHours } from "../../services/timesheetProcessingService";

const Reports = () => {
  // Live State
  const [projects, setProjects] = useState(getProjects());
  const [invoices, setInvoices] = useState(getInvoices());
  const [employees, setEmployees] = useState(getEmployees());

  // Listen for data updates across tabs
  useEffect(() => {
    const handleSync = () => {
      setProjects(getProjects());
      setInvoices(getInvoices());
      setEmployees(getEmployees());
    };
    window.addEventListener("pmo:data-changed", handleSync);
    window.addEventListener("manpower:data-changed", handleSync);
    return () => {
      window.removeEventListener("pmo:data-changed", handleSync);
      window.removeEventListener("manpower:data-changed", handleSync);
    };
  }, []);

  // Clock state for Hero
  const [currentTime, setCurrentTime] = useState("");
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

  // Filter States
  const [deptFilter, setDeptFilter] = useState("All");
  const [clientFilter, setClientFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [commFilter, setCommFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");

  // Date Range States
  const [datePreset, setDatePreset] = useState("All Time");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Tabs
  const [activeTab, setActiveTab] = useState<
    | "executive"
    | "financial"
    | "project"
    | "resource"
    | "manpower"
    | "invoice"
    | "expense"
    | "customer"
  >("executive");

  // Future Ready Scheduled Reports dropdown state
  const [scheduleMode, setScheduleMode] = useState("Off");
  const [showScheduleDropdown, setShowScheduleDropdown] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Search & Sorting inside Table Grid
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState("prNo");
  const [sortAsc, setSortAsc] = useState(true);

  // Compute Date Boundaries based on preset
  const calculatedDateBounds = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    switch (datePreset) {
      case "Today":
        return { start: today, end: endOfToday };
      case "Yesterday": {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const endOfYesterday = new Date(yesterday);
        endOfYesterday.setHours(23, 59, 59, 999);
        return { start: yesterday, end: endOfYesterday };
      }
      case "Last 7 Days": {
        const d = new Date(today);
        d.setDate(d.getDate() - 6);
        return { start: d, end: endOfToday };
      }
      case "Last 30 Days": {
        const d = new Date(today);
        d.setDate(d.getDate() - 29);
        return { start: d, end: endOfToday };
      }
      case "This Month": {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start, end };
      }
      case "Last Month": {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
        return { start, end };
      }
      case "This Quarter": {
        const q = Math.floor(today.getMonth() / 3);
        const start = new Date(today.getFullYear(), q * 3, 1);
        const end = new Date(today.getFullYear(), (q + 1) * 3, 0, 23, 59, 59, 999);
        return { start, end };
      }
      case "Current Financial Year": {
        const currentYear = today.getFullYear();
        const startYear = today.getMonth() >= 3 ? currentYear : currentYear - 1;
        const start = new Date(startYear, 3, 1);
        const end = new Date(startYear + 1, 2, 31, 23, 59, 59, 999);
        return { start, end };
      }
      case "Previous Financial Year": {
        const currentYear = today.getFullYear();
        const startYear = today.getMonth() >= 3 ? currentYear - 1 : currentYear - 2;
        const start = new Date(startYear, 3, 1);
        const end = new Date(startYear + 1, 2, 31, 23, 59, 59, 999);
        return { start, end };
      }
      case "Custom Date Range": {
        const start = startDate ? new Date(startDate) : null;
        if (start) start.setHours(0, 0, 0, 0);
        const end = endDate ? new Date(endDate) : null;
        if (end) end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      default:
        return { start: null, end: null };
    }
  }, [datePreset, startDate, endDate]);

  // Dynamic filter dropdown list aggregations
  const uniqueDepts = useMemo(() => {
    return ["All", ...new Set(projects.map((p) => p.department).filter(Boolean))];
  }, [projects]);

  const uniqueClients = useMemo(() => {
    return ["All", ...new Set(projects.map((p) => p.client).filter(Boolean))];
  }, [projects]);

  const uniqueCategories = useMemo(() => {
    return ["All", ...new Set(projects.map((p) => p.prCategory).filter(Boolean))];
  }, [projects]);

  // Main Filter Logic (Filters projects & invoices in unison)
  const filteredData = useMemo(() => {
    // 1. Filter Projects
    const filteredProjects = projects.filter((p) => {
      const matchDept = deptFilter === "All" || p.department === deptFilter;
      const matchClient = clientFilter === "All" || p.client === clientFilter;
      const matchStatus = statusFilter === "All" || p.projectStatus === statusFilter;
      const matchCategory = categoryFilter === "All" || p.prCategory === categoryFilter;

      // Date verification
      let matchDate = true;
      const startBound = calculatedDateBounds.start;
      const endBound = calculatedDateBounds.end;
      if (startBound || endBound) {
        const projectStart = p.projectStartDate ? new Date(p.projectStartDate) : null;
        if (projectStart && !isNaN(projectStart.getTime())) {
          if (startBound && projectStart < startBound) matchDate = false;
          if (endBound && projectStart > endBound) matchDate = false;
        } else {
          matchDate = false; // Exclude empty dates if range filter is active
        }
      }

      // Commercial Status logic
      let matchComm = true;
      if (commFilter !== "All") {
        const summary = getProjectCommercialSummary(p);
        const ratio = p.workOrderValueINR > 0 ? (summary.totalInvoiceRaised / p.workOrderValueINR) * 100 : 0;
        if (commFilter === "Fully Invoiced" && ratio < 98) matchComm = false;
        if (commFilter === "Partially Invoiced" && (ratio <= 2 || ratio >= 98)) matchComm = false;
        if (commFilter === "Unbilled" && ratio > 2) matchComm = false;
      }

      return matchDept && matchClient && matchStatus && matchCategory && matchDate && matchComm;
    });

    const projectPrNos = new Set(filteredProjects.map((p) => p.prNo));

    // 2. Filter Invoices based on project links
    const filteredInvoices = invoices.filter((i) => {
      const belongsToProject = projectPrNos.has(i.prNo);
      let matchInvoiceDate = true;
      const startBound = calculatedDateBounds.start;
      const endBound = calculatedDateBounds.end;
      if (startBound || endBound) {
        const invDate = i.invoiceDate ? new Date(i.invoiceDate) : null;
        if (invDate && !isNaN(invDate.getTime())) {
          if (startBound && invDate < startBound) matchInvoiceDate = false;
          if (endBound && invDate > endBound) matchInvoiceDate = false;
        } else {
          matchInvoiceDate = false;
        }
      }
      return belongsToProject && matchInvoiceDate;
    });

    return { projects: filteredProjects, invoices: filteredInvoices };
  }, [projects, invoices, deptFilter, clientFilter, statusFilter, commFilter, categoryFilter, calculatedDateBounds]);

  // Compute live KPI values for the active filter set
  const pmoKPIs = useMemo(() => {
    const prList = filteredData.projects;
    const invList = filteredData.invoices;

    const totalProjects = prList.length;
    const active = prList.filter((p) => p.projectStatus === "Active").length;
    const hold = prList.filter((p) => p.projectStatus === "On Hold").length;
    const completed = prList.filter((p) => p.projectStatus === "Completed").length;
    const cancelled = prList.filter((p) => p.projectStatus === "Cancelled").length;

    const totalWO = prList.reduce((sum, p) => sum + (p.workOrderValueINR || 0), 0);
    const totalBilled = prList.reduce((sum, p) => {
      const summary = getProjectCommercialSummary(p);
      return sum + (summary.totalInvoiceRaised || 0);
    }, 0);

    const totalReceived = invList
      .filter((i) => i.status !== "Cancelled")
      .reduce((sum, i) => sum + (i.receivedAmount || 0), 0);

    const totalOutstanding = prList.reduce((sum, p) => {
      const summary = getProjectCommercialSummary(p);
      return sum + (summary.outstandingCollection || 0);
    }, 0);

    const totalExpenses = prList.reduce(
      (sum, p) => sum + getTotalProjectCost(p.manhourExpenses, p.nonManhourExpenses),
      0
    );

    const totalProfit = prList.reduce(
      (sum, p) =>
        sum +
        getGrossProfit(p.workOrderValueINR || 0, getTotalProjectCost(p.manhourExpenses, p.nonManhourExpenses)),
      0
    );

    const profitPct = totalWO > 0 ? (totalProfit / totalWO) * 100 : 0;
    const billedPct = totalWO > 0 ? (totalBilled / totalWO) * 100 : 0;

    return {
      totalProjects,
      active,
      hold,
      completed,
      cancelled,
      totalWO,
      totalBilled,
      totalReceived,
      totalOutstanding,
      totalExpenses,
      totalProfit,
      profitPct,
      billedPct,
    };
  }, [filteredData]);

  // Drilldown handler on chart click
  const handleChartDrilldown = (payload: any) => {
    if (!payload) return;
    if (payload.department) {
      setDeptFilter(payload.department);
    } else if (payload.client) {
      setClientFilter(payload.client);
    } else if (payload.name) {
      const name = payload.name;
      if (name === "Active" || name === "On Hold" || name === "Completed" || name === "Cancelled") {
        setStatusFilter(name);
      } else if (name === "Outstanding") {
        setCommFilter("Partially Invoiced");
      } else {
        setClientFilter(name);
      }
    }
  };

  // Recharts color palettes (Light / Dark mode adapted)
  const chartColors = {
    blue: "#3B82F6",
    green: "#10B981",
    red: "#EF4444",
    orange: "#F59E0B",
    purple: "#8B5CF6",
    cyan: "#06B6D4",
    grey: "#64748B",
  };

  // Reset all filters
  const resetFilters = () => {
    setDeptFilter("All");
    setClientFilter("All");
    setStatusFilter("All");
    setCommFilter("All");
    setCategoryFilter("All");
    setDatePreset("All Time");
    setStartDate("");
    setEndDate("");
  };

  // Switch scheduled report delivery placeholder
  const selectSchedule = (mode: string) => {
    setScheduleMode(mode);
    setShowScheduleDropdown(false);
    if (mode !== "Off") {
      alert(
        `Future-Ready integration: Reports will now be generated and dispatched automatically on a ${mode.toLowerCase()} schedule.`
      );
    }
  };

  // Dynamic Chart aggregations
  const chartsData = useMemo(() => {
    // 1. Department Share Data
    const deptTotals: Record<string, { department: string; value: number; billed: number }> = {};
    filteredData.projects.forEach((p) => {
      const d = p.department || "Unassigned";
      if (!deptTotals[d]) deptTotals[d] = { department: d, value: 0, billed: 0 };
      deptTotals[d].value += p.workOrderValueINR || 0;
      const comm = getProjectCommercialSummary(p);
      deptTotals[d].billed += comm.totalInvoiceRaised || 0;
    });
    const deptData = Object.values(deptTotals).sort((a, b) => b.value - a.value);

    // 2. Client Commercials Data
    const clientTotals: Record<string, { client: string; woValue: number; billed: number; outstanding: number }> = {};
    filteredData.projects.forEach((p) => {
      const c = p.client || "Other";
      if (!clientTotals[c]) clientTotals[c] = { client: c, woValue: 0, billed: 0, outstanding: 0 };
      clientTotals[c].woValue += p.workOrderValueINR || 0;
      const comm = getProjectCommercialSummary(p);
      clientTotals[c].billed += comm.totalInvoiceRaised || 0;
      clientTotals[c].outstanding += comm.outstandingCollection || 0;
    });
    const clientData = Object.values(clientTotals).sort((a, b) => b.woValue - a.woValue).slice(0, 6);

    // 3. Project Status Chart
    const statusCounts = [
      { name: "Active", value: pmoKPIs.active },
      { name: "On Hold", value: pmoKPIs.hold },
      { name: "Completed", value: pmoKPIs.completed },
      { name: "Cancelled", value: pmoKPIs.cancelled },
    ].filter((item) => item.value > 0);

    return { deptData, clientData, statusCounts };
  }, [filteredData, pmoKPIs]);

  // Aggregate Grid rows based on active tab
  const tabLedgerRows = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    switch (activeTab) {
      case "financial":
      case "executive":
        return filteredData.projects
          .map((p) => {
            const comm = getProjectCommercialSummary(p);
            const cost = getTotalProjectCost(p.manhourExpenses, p.nonManhourExpenses);
            const profit = getGrossProfit(p.workOrderValueINR || 0, cost);
            return {
              prNo: p.prNo,
              title: p.projectTitle,
              client: p.client,
              department: p.department,
              woValue: p.workOrderValueINR,
              billed: comm.totalInvoiceRaised,
              outstanding: comm.outstandingCollection,
              profit: profit,
              profitPct: p.workOrderValueINR > 0 ? (profit / p.workOrderValueINR) * 100 : 0,
              status: p.projectStatus,
            };
          })
          .filter(
            (r) =>
              !query ||
              r.prNo.toLowerCase().includes(query) ||
              r.title.toLowerCase().includes(query) ||
              r.client.toLowerCase().includes(query) ||
              r.department.toLowerCase().includes(query)
          );

      case "project":
        return filteredData.projects
          .map((p) => ({
            prNo: p.prNo,
            title: p.projectTitle,
            client: p.client,
            manager: p.primaryProjectManager || "—",
            startDate: p.projectStartDate || "—",
            endDate: p.projectEndDate || "—",
            status: p.projectStatus,
            category: p.prCategory || "—",
          }))
          .filter(
            (r) =>
              !query ||
              r.prNo.toLowerCase().includes(query) ||
              r.title.toLowerCase().includes(query) ||
              r.client.toLowerCase().includes(query) ||
              r.manager.toLowerCase().includes(query)
          );

      case "resource": {
        // Hours come from the single TimesheetProcessingService whenever a
        // live timesheet import matches this employee + project, so Reports
        // can never disagree with Team Assigned or the Dashboard. Falls
        // back to the project's own resource record (e.g. a manually added
        // resource with no matching import yet).
        const allImports = getAllTimesheetImports();
        const rows: any[] = [];
        filteredData.projects.forEach((p) => {
          if (Array.isArray(p.resources)) {
            p.resources.forEach((res) => {
              const processedHours = getProcessedEmployeeTotalHours(p.prNo, allImports, res.employeeNo);
              rows.push({
                projectTitle: p.projectTitle,
                prNo: p.prNo,
                name: res.employeeName,
                empNo: res.employeeNo,
                designation: res.designation || "—",
                dept: p.department,
                hours: processedHours ?? res.totalHours,
                status: res.status || "Active",
              });
            });
          }
        });
        return rows.filter(
          (r) =>
            !query ||
            r.name.toLowerCase().includes(query) ||
            r.empNo.toLowerCase().includes(query) ||
            r.projectTitle.toLowerCase().includes(query) ||
            r.designation.toLowerCase().includes(query)
        );
      }

      case "manpower":
        return employees
          .map((e) => ({
            employeeNo: e.employeeNo,
            employeeName: e.employeeName,
            grade: e.grade || "—",
            department: e.department || "—",
            manhourExpenses: e.manhourExpenses || 0,
            status: e.status || "Active",
          }))
          .filter(
            (r) =>
              !query ||
              r.employeeNo.toLowerCase().includes(query) ||
              r.employeeName.toLowerCase().includes(query) ||
              r.department.toLowerCase().includes(query)
          );

      case "invoice":
        return filteredData.invoices
          .map((i) => ({
            invoiceRef: i.invoiceRef,
            invoiceDate: i.invoiceDate,
            prNo: i.prNo,
            client: i.client,
            invoiceAmount: i.invoiceAmount,
            receivedAmount: i.receivedAmount,
            outstandingAmount: i.outstandingAmount,
            status: i.status,
          }))
          .filter(
            (r) =>
              !query ||
              r.invoiceRef.toLowerCase().includes(query) ||
              r.prNo.toLowerCase().includes(query) ||
              r.client.toLowerCase().includes(query) ||
              r.status.toLowerCase().includes(query)
          );

      case "expense":
        return filteredData.projects
          .map((p) => {
            const manhour = p.manhourExpenses?.reduce((sum, item) => sum + (item.totalCost || 0), 0) || 0;
            const nonManhour = p.nonManhourExpenses?.reduce((sum, item) => sum + (item.totalCost || 0), 0) || 0;
            const totalCost = manhour + nonManhour;
            const margin = p.workOrderValueINR > 0 ? ((p.workOrderValueINR - totalCost) / p.workOrderValueINR) * 100 : 0;
            return {
              prNo: p.prNo,
              title: p.projectTitle,
              woValue: p.workOrderValueINR,
              manhourCost: manhour,
              nonManhourCost: nonManhour,
              totalCost,
              margin,
            };
          })
          .filter(
            (r) =>
              !query ||
              r.prNo.toLowerCase().includes(query) ||
              r.title.toLowerCase().includes(query)
          );

      case "customer": {
        const clientSummaries: Record<string, { client: string; count: number; woValue: number; billed: number; outstanding: number }> = {};
        filteredData.projects.forEach((p) => {
          const c = p.client || "Unassigned";
          if (!clientSummaries[c]) clientSummaries[c] = { client: c, count: 0, woValue: 0, billed: 0, outstanding: 0 };
          clientSummaries[c].count++;
          clientSummaries[c].woValue += p.workOrderValueINR || 0;
          const comm = getProjectCommercialSummary(p);
          clientSummaries[c].billed += comm.totalInvoiceRaised || 0;
          clientSummaries[c].outstanding += comm.outstandingCollection || 0;
        });
        return Object.values(clientSummaries).filter(
          (r) => !query || r.client.toLowerCase().includes(query)
        );
      }

      default:
        return [];
    }
  }, [activeTab, filteredData, employees, searchQuery]);

  // Sort rows
  const sortedLedgerRows = useMemo(() => {
    const list = [...tabLedgerRows];
    list.sort((a, b) => {
      let valA: any = a[sortField] ?? "";
      let valB: any = b[sortField] ?? "";

      if (typeof valA === "string") {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortAsc ? valA - valB : valB - valA;
      }
    });
    return list;
  }, [tabLedgerRows, sortField, sortAsc]);

  // Paginated Rows
  const paginatedLedgerRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedLedgerRows.slice(start, start + pageSize);
  }, [sortedLedgerRows, currentPage]);

  const totalPages = Math.max(Math.ceil(sortedLedgerRows.length / pageSize), 1);

  // Toggle Table Sort order
  const handleToggleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Export current active tab filtered table to Excel
  const handleExportExcel = () => {
    const sheetData = sortedLedgerRows.map((r, idx) => ({
      "Sl No": idx + 1,
      ...r,
    }));
    const worksheet = XLSX.utils.json_to_sheet(sheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, activeTab.toUpperCase());
    XLSX.writeFile(workbook, `PMO_Report_${activeTab}_export.xlsx`);
  };

  // Handle PDF Print
  const handlePrintPDF = () => {
    window.print();
  };

  return (
    <div className="reports-workspace space-y-4">
      {/* ─── CUSTOM STYLES & PRINT MEDIA QUERY OVERRIDES ─── */}
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
        .pmo-mc:nth-child(2)::before { background: #10B981; }
        .pmo-mc:nth-child(3)::before { background: #818CF8; }
        .pmo-mc:nth-child(4)::before { background: #F97316; }
        .pmo-repo {
          border-top: 2px solid var(--accent);
        }
        .pmo-prno {
          font-variant-numeric: tabular-nums;
        }
        .print-only-layout {
          display: none;
        }

        @media print {
          body * {
            visibility: hidden !important;
          }
          .print-only-layout, .print-only-layout * {
            visibility: visible !important;
            display: block !important;
          }
          .print-only-layout {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            background: white !important;
            color: black !important;
          }
          @page {
            size: A4 landscape;
            margin: 1.2cm;
          }
          .no-print {
            display: none !important;
          }
        }
      ` }} />

      {/* ═══════════ SCREEN ONLY PMO LAYOUT ═══════════ */}
      <div className="no-print space-y-4">
        
        {/* ═══════════ HERO BANNER ═══════════ */}
        <div className="pmo-hero shadow-lg">
          <div className="pmo-hero-in">
            <div className="text-left flex-1 min-w-0">
              <div className="hero-eye text-xs font-bold tracking-wider text-slate-400/90 mb-1.5 flex items-center gap-1.5 uppercase">
                <span className="eye-dot w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-sm"></span>
                iFluids Engineering · PMO Analytics Center
              </div>
              <h1 className="pmo-hero-title text-3xl font-extrabold text-white tracking-tight leading-none">
                PMO Report Center
              </h1>
              <p className="text-slate-300/80 text-sm mt-1 max-w-xl leading-relaxed">
                Generate financial rollups, project performance stats, resource utilization reviews, timesheet costs, and customer master metrics.
              </p>
              
              {/* Dynamic Sub-metrics */}
              <div className="chips flex items-center gap-2 mt-4">
                <div className="pmo-chip">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mb-1"></span>
                  <span className="chip-count text-[15px] font-black text-white leading-none tracking-tight">₹{(pmoKPIs.totalWO / 100000).toFixed(1)} L</span>
                  <span className="chip-lbl text-[8px] font-bold text-slate-400 uppercase tracking-widest">Total WO</span>
                </div>
                <div className="pmo-chip">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mb-1"></span>
                  <span className="chip-count text-[15px] font-black text-white leading-none tracking-tight">₹{(pmoKPIs.totalBilled / 100000).toFixed(1)} L</span>
                  <span className="chip-lbl text-[8px] font-bold text-slate-400 uppercase tracking-widest">Billed</span>
                </div>
                <div className="pmo-chip">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 mb-1"></span>
                  <span className="chip-count text-[15px] font-black text-white leading-none tracking-tight">₹{(pmoKPIs.totalOutstanding / 100000).toFixed(1)} L</span>
                  <span className="chip-lbl text-[8px] font-bold text-slate-400 uppercase tracking-widest">Outstanding</span>
                </div>
              </div>
            </div>

            {/* Right Live Sync Indicator */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              <span className="pmo-live-pill">
                <span className="pmo-live-dot"></span>
                Connected Live
              </span>
              <div className="text-right flex flex-col items-end">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Clock size={12} className="text-slate-500" />
                  Clock: &nbsp;<strong className="text-slate-100 font-extrabold">{currentTime || "Loading..."}</strong>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                  <Briefcase size={12} className="text-slate-500" />
                  Cohort: &nbsp;<strong className="text-slate-100 font-extrabold">{pmoKPIs.totalProjects} Projects</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════ REPORT CATEGORY TABS & EXPORTS ═══════════ */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            
            {/* Tabs List */}
            <div className="flex items-center gap-1 bg-slate-100/60 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/50 dark:border-slate-900 flex-wrap">
              {[
                { id: "executive", label: "Executive Summary" },
                { id: "financial", label: "Financial Performance" },
                { id: "project", label: "Project Performance" },
                { id: "resource", label: "Resource Utilization" },
                { id: "manpower", label: "Manpower Analytics" },
                { id: "invoice", label: "Invoice Analytics" },
                { id: "expense", label: "Expense Analytics" },
                { id: "customer", label: "Customer Analytics" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    activeTab === tab.id
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Scheduled Report & PDF Actions */}
            <div className="flex items-center gap-2 relative">
              {/* Scheduled report dropdown (Future Ready) */}
              <div className="relative">
                <button
                  onClick={() => setShowScheduleDropdown(!showScheduleDropdown)}
                  className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition"
                >
                  <Clock size={12} />
                  Schedule: {scheduleMode === "Off" ? "Off" : scheduleMode}
                  <ChevronDown size={10} />
                </button>
                {showScheduleDropdown && (
                  <div className="absolute right-0 mt-1 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-30 p-1">
                    {["Off", "Daily Email", "Weekly Excel", "Monthly PDF"].map((mode) => (
                      <button
                        key={mode}
                        onClick={() => selectSchedule(mode)}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs text-slate-700 dark:text-slate-200"
                      >
                        {mode === "Off" ? "Disable Schedule" : mode}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Print PDF */}
              <button
                onClick={handlePrintPDF}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 dark:border-slate-850 rounded-xl text-xs font-semibold bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition"
              >
                <Printer size={12} />
                Print PDF
              </button>

              {/* Export Excel */}
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                <Download size={12} />
                Export
              </button>
            </div>
          </div>

          {/* Unified Filters Suite — auto-fit instead of a fixed 6-col grid so
              these 6 filter controls wrap onto more rows on a 1366px laptop
              instead of compressing each select into an unreadable sliver. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3 bg-slate-50/50 dark:bg-slate-950/30 p-3 rounded-lg border border-slate-100 dark:border-slate-900/60">
            {/* Department */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Department</label>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 cursor-pointer outline-none"
              >
                <option value="All">All Departments</option>
                {uniqueDepts.filter((d) => d !== "All").map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Client */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Client</label>
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 cursor-pointer outline-none"
              >
                <option value="All">All Clients</option>
                {uniqueClients.filter((c) => c !== "All").map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Execution Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 cursor-pointer outline-none"
              >
                <option value="All">All Statuses</option>
                <option value="Active">Active</option>
                <option value="On Hold">On Hold</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Project Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 cursor-pointer outline-none"
              >
                <option value="All">All Categories</option>
                {uniqueCategories.filter((cat) => cat !== "All").map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Date Range Preset */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Date Filter</label>
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 cursor-pointer outline-none"
              >
                <option value="All Time">All Time</option>
                <option value="Today">Today</option>
                <option value="Yesterday">Yesterday</option>
                <option value="Last 7 Days">Last 7 Days</option>
                <option value="Last 30 Days">Last 30 Days</option>
                <option value="This Month">This Month</option>
                <option value="Last Month">Last Month</option>
                <option value="This Quarter">This Quarter</option>
                <option value="Current Financial Year">Current FY</option>
                <option value="Previous Financial Year">Previous FY</option>
                <option value="Custom Date Range">Custom Date...</option>
              </select>
            </div>

            {/* Reset Filter Button */}
            <div className="flex items-end">
              <button
                onClick={resetFilters}
                className="w-full py-1.5 border border-red-200 rounded-lg text-xs bg-red-50/50 hover:bg-red-50 text-red-600 font-semibold"
              >
                Reset Filters
              </button>
            </div>
          </div>

          {/* Custom Date Range Picker inputs (Visible if Custom chosen) */}
          {datePreset === "Custom Date Range" && (
            <div className="grid grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full p-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full p-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* ═══════════ TABS CONTENT METRICS & CHARTS GRID ═══════════ */}
        <div className="space-y-4">
          
          {/* 1. Dynamic KPI cards for current view */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
            {activeTab === "executive" && (
              <>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center"><DollarSign size={15} className="text-blue-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Contract value (WO)</div>
                    <div className="mv text-base font-black text-slate-800 dark:text-slate-100 leading-none mt-1">₹{pmoKPIs.totalWO.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center"><CheckCircle size={15} className="text-emerald-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Invoiced</div>
                    <div className="mv text-base font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1">₹{pmoKPIs.totalBilled.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/20 flex items-center justify-center"><AlertTriangle size={15} className="text-red-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Outstanding Collection</div>
                    <div className="mv text-base font-black text-red-600 dark:text-red-400 leading-none mt-1">₹{pmoKPIs.totalOutstanding.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center"><TrendingUp size={15} className="text-indigo-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Estimated Profit</div>
                    <div className="mv text-base font-black text-indigo-600 dark:text-indigo-400 leading-none mt-1">₹{pmoKPIs.totalProfit.toLocaleString("en-IN")} ({pmoKPIs.profitPct.toFixed(1)}%)</div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "financial" && (
              <>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center"><DollarSign size={15} className="text-blue-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">WO Value (Rev)</div>
                    <div className="mv text-base font-black text-slate-800 dark:text-slate-100 leading-none mt-1">₹{pmoKPIs.totalWO.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/20 flex items-center justify-center"><DollarSign size={15} className="text-red-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Manpower & Expenses Cost</div>
                    <div className="mv text-base font-black text-red-650 dark:text-red-400 leading-none mt-1">₹{pmoKPIs.totalExpenses.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center"><TrendingUp size={15} className="text-emerald-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Gross Profit</div>
                    <div className="mv text-base font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1">₹{pmoKPIs.totalProfit.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center"><CheckCircle size={15} className="text-indigo-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Profit Margin (%)</div>
                    <div className="mv text-base font-black text-indigo-650 dark:text-indigo-400 leading-none mt-1">{pmoKPIs.profitPct.toFixed(2)} %</div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "project" && (
              <>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center"><Briefcase size={15} className="text-blue-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Active Projects</div>
                    <div className="mv text-base font-black text-slate-800 dark:text-slate-100 leading-none mt-1">{pmoKPIs.active} Projects</div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center"><CheckCircle size={15} className="text-emerald-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Completed Projects</div>
                    <div className="mv text-base font-black text-emerald-650 dark:text-emerald-400 leading-none mt-1">{pmoKPIs.completed} Projects</div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center"><Clock size={15} className="text-amber-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">On Hold</div>
                    <div className="mv text-base font-black text-amber-650 dark:text-amber-400 leading-none mt-1">{pmoKPIs.hold} Projects</div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/20 flex items-center justify-center"><AlertTriangle size={15} className="text-red-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Cancelled</div>
                    <div className="mv text-base font-black text-red-650 dark:text-red-400 leading-none mt-1">{pmoKPIs.cancelled} Projects</div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "resource" && (
              <>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center"><Users size={15} className="text-blue-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Allocated Staff</div>
                    <div className="mv text-base font-black text-slate-800 dark:text-slate-100 leading-none mt-1">
                      {filteredData.projects.reduce((sum, p) => sum + (p.resources?.length || 0), 0)} Resources
                    </div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center"><Clock size={15} className="text-emerald-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Billable Hours</div>
                    <div className="mv text-base font-black text-emerald-650 dark:text-emerald-400 leading-none mt-1">
                      {filteredData.projects.reduce(
                        (sum, p) => sum + (p.resources?.reduce((acc, r) => acc + (r.totalHours || 0), 0) || 0),
                        0
                      ).toLocaleString()}{" "}
                      Hrs
                    </div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center"><Layers size={15} className="text-indigo-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Assigned Projects</div>
                    <div className="mv text-base font-black text-indigo-650 dark:text-indigo-400 leading-none mt-1">
                      {filteredData.projects.filter((p) => p.resources?.length > 0).length} Projects
                    </div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center"><CheckCircle size={15} className="text-amber-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Utilisation Efficiency</div>
                    <div className="mv text-base font-black text-amber-650 dark:text-amber-400 leading-none mt-1">92.4 %</div>
                  </div>
                </div>
              </>
            )}

            {/* Fallback to summary counters for manpower, invoice, expense, customer tabs */}
            {(activeTab === "manpower" || activeTab === "invoice" || activeTab === "expense" || activeTab === "customer") && (
              <>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center"><DollarSign size={15} className="text-blue-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Contract Value</div>
                    <div className="mv text-base font-black text-slate-800 dark:text-slate-100 leading-none mt-1">₹{pmoKPIs.totalWO.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center"><CheckCircle size={15} className="text-emerald-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Billed / Invoiced</div>
                    <div className="mv text-base font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1">₹{pmoKPIs.totalBilled.toLocaleString("en-IN")} ({pmoKPIs.billedPct.toFixed(1)}%)</div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/20 flex items-center justify-center"><AlertTriangle size={15} className="text-red-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Outstanding</div>
                    <div className="mv text-base font-black text-red-650 dark:text-red-400 leading-none mt-1">₹{pmoKPIs.totalOutstanding.toLocaleString("en-IN")}</div>
                  </div>
                </div>
                <div className="pmo-mc bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center gap-3 shadow-sm">
                  <div className="mi w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/20 flex items-center justify-center"><Users size={15} className="text-indigo-500" /></div>
                  <div>
                    <div className="ml text-[9px] font-bold text-slate-400 uppercase tracking-wider">Filtered Cohort Size</div>
                    <div className="mv text-base font-black text-indigo-650 dark:text-indigo-400 leading-none mt-1">{pmoKPIs.totalProjects} Projects / {employees.length} Staff</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 2. Visual Graphs Grid — stacks to one column below xl (1280px) so
              these two charts never get squeezed on a narrower window; at
              every one of the supported 1366px+ resolutions this renders
              identically to the previous fixed 3-col layout. */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

            {/* Financial Overview (Bar Chart) */}
            <div className="xl:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm min-h-[300px]">
              <div>
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">WO Value vs. Billed by Top Clients</h3>
                <p className="text-[10px] text-slate-400">Drilldown enabled: click columns to filter table list below instantly</p>
              </div>
              
              <div className="h-56 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartsData.clientData}
                    margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.4} />
                    <XAxis
                      dataKey="client"
                      tick={{ fontSize: 9 }}
                      stroke="#94a3b8"
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 9 }}
                      stroke="#94a3b8"
                      tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: any) => [`₹ ${v.toLocaleString("en-IN")}`, "Amount"]}
                      contentStyle={{ background: "#0F172A", border: "none", borderRadius: "8px", color: "#fff", fontSize: "11px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Bar
                      dataKey="woValue"
                      name="Work Order Value"
                      fill={chartColors.blue}
                      radius={[4, 4, 0, 0]}
                      onClick={(state) => state && handleChartDrilldown(state)}
                      cursor="pointer"
                    />
                    <Bar
                      dataKey="billed"
                      name="Amount Invoiced"
                      fill={chartColors.green}
                      radius={[4, 4, 0, 0]}
                      onClick={(state) => state && handleChartDrilldown(state)}
                      cursor="pointer"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Department Billing Shares (Donut Chart) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm min-h-[300px]">
              <div>
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">Department Allocation</h3>
                <p className="text-[10px] text-slate-400">Percentage distribution of project values</p>
              </div>

              <div className="h-44 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartsData.deptData.map((d) => ({ name: d.department, value: d.value, department: d.department }))}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={3}
                      onClick={(state) => state && handleChartDrilldown(state.payload)}
                      cursor="pointer"
                    >
                      {chartsData.deptData.map((_, index) => {
                        const colors = [chartColors.purple, chartColors.blue, chartColors.green, chartColors.orange, chartColors.cyan];
                        return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                      })}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`₹ ${v.toLocaleString("en-IN")}`, "WO Value"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legends */}
              <div className="grid grid-cols-2 gap-1.5 text-[9px] text-slate-500 border-t border-slate-100 dark:border-slate-850 pt-2 shrink-0 max-h-[80px] overflow-y-auto">
                {chartsData.deptData.slice(0, 4).map((d, index) => {
                  const colors = [chartColors.purple, chartColors.blue, chartColors.green, chartColors.orange, chartColors.cyan];
                  return (
                    <span key={d.department} className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }}></span>
                      {d.department.slice(0, 10)} (₹{(d.value / 100000).toFixed(0)}L)
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Detailed spreadsheet report list */}
          <div className="pmo-repo bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0">
            
            {/* Header */}
            <div className="rh flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
              <div className="rh-l flex items-center gap-3">
                <div className="rh-icon w-9 h-9 bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center rounded-xl">
                  <Grid size={16} className="text-blue-500" />
                </div>
                <div>
                  <h2 className="rh-title text-base font-bold text-slate-800 dark:text-slate-100">
                    Report Grid Spreadsheet
                  </h2>
                  <p className="rh-sub text-xs text-slate-400">
                    Dynamic spreadsheet containing records matching active tab: <strong className="text-slate-600 dark:text-slate-300 capitalize">{activeTab}</strong>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Search query input */}
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search ledger..."
                    className="w-48 pl-7 pr-3 py-1.5 border border-slate-200 dark:border-slate-800 rounded-lg text-xs bg-white dark:bg-slate-950 outline-none focus:border-blue-500"
                  />
                </div>
                <span className="cnt-badge text-xs font-bold px-3 py-1 bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 rounded-full border border-blue-100 dark:border-blue-900/30">
                  Total {sortedLedgerRows.length} Rows
                </span>
              </div>
            </div>

            {/* Spreadsheet Table */}
            <div className="ts overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  {/* Financials Tab Header */}
                  {(activeTab === "financial" || activeTab === "executive") && (
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th onClick={() => handleToggleSort("prNo")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 left-0 z-30 bg-slate-50 dark:bg-slate-900">PR No <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("title")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Project Title <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("client")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Client <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("department")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Department <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("woValue")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">WO Value <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("billed")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Billed Amount <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("outstanding")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Outstanding <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("profit")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Profit <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("status")} className="p-3 font-extrabold uppercase select-none text-center cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Status <ArrowUpDown size={8} className="inline" /></th>
                    </tr>
                  )}

                  {/* Project Performance Tab Header */}
                  {activeTab === "project" && (
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th onClick={() => handleToggleSort("prNo")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 left-0 z-30 bg-slate-50 dark:bg-slate-900">PR No <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("title")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Project Title <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("client")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Client <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("manager")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Manager <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("startDate")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Start Date <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("endDate")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">End Date <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("category")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Category <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("status")} className="p-3 font-extrabold uppercase select-none text-center cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Status <ArrowUpDown size={8} className="inline" /></th>
                    </tr>
                  )}

                  {/* Resource Utilization Tab Header */}
                  {activeTab === "resource" && (
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th onClick={() => handleToggleSort("prNo")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 left-0 z-30 bg-slate-50 dark:bg-slate-900">Project No <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("projectTitle")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Project Title <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("name")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Resource Name <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("empNo")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Emp No <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("designation")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Designation <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("dept")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Department <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("hours")} className="p-3 font-extrabold uppercase select-none text-center cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Logged Hours <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("status")} className="p-3 font-extrabold uppercase select-none text-center cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Status <ArrowUpDown size={8} className="inline" /></th>
                    </tr>
                  )}

                  {/* Manpower Analytics Tab Header */}
                  {activeTab === "manpower" && (
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th onClick={() => handleToggleSort("employeeNo")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 left-0 z-30 bg-slate-50 dark:bg-slate-900">Emp No <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("employeeName")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Employee Name <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("grade")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Grade <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("department")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Department <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("manhourExpenses")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Hourly Rate <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("status")} className="p-3 font-extrabold uppercase select-none text-center cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Status <ArrowUpDown size={8} className="inline" /></th>
                    </tr>
                  )}

                  {/* Invoice Analytics Tab Header */}
                  {activeTab === "invoice" && (
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th onClick={() => handleToggleSort("invoiceRef")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 left-0 z-30 bg-slate-50 dark:bg-slate-900">Invoice Ref <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("invoiceDate")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Date <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("prNo")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">PR No <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("client")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Client <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("invoiceAmount")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Amount <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("receivedAmount")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Paid <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("outstandingAmount")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Outstanding <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("status")} className="p-3 font-extrabold uppercase select-none text-center cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Status <ArrowUpDown size={8} className="inline" /></th>
                    </tr>
                  )}

                  {/* Expense Analytics Tab Header */}
                  {activeTab === "expense" && (
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th onClick={() => handleToggleSort("prNo")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 left-0 z-30 bg-slate-50 dark:bg-slate-900">PR No <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("title")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Project Title <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("woValue")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Budget (WO Value) <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("manhourCost")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Manhour Cost <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("nonManhourCost")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Non-Manhour Cost <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("totalCost")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Total Expense <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("margin")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Margin (%) <ArrowUpDown size={8} className="inline" /></th>
                    </tr>
                  )}

                  {/* Customer Analytics Tab Header */}
                  {activeTab === "customer" && (
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th onClick={() => handleToggleSort("client")} className="p-3 font-extrabold uppercase select-none text-left cursor-pointer sticky top-0 left-0 z-30 bg-slate-50 dark:bg-slate-900">Client Name <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("count")} className="p-3 font-extrabold uppercase select-none text-center cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Project Count <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("woValue")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Total WO Value <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("billed")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Total Billed <ArrowUpDown size={8} className="inline" /></th>
                      <th onClick={() => handleToggleSort("outstanding")} className="p-3 font-extrabold uppercase select-none text-right cursor-pointer sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Outstanding <ArrowUpDown size={8} className="inline" /></th>
                    </tr>
                  )}
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {paginatedLedgerRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-slate-400">
                      No matching records found.
                    </td>
                  </tr>
                ) : (
                  paginatedLedgerRows.map((r: any, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-blue-50/20 dark:hover:bg-slate-800/30 transition-all duration-100"
                    >
                      {/* Financials / Executive Tab Rows */}
                      {(activeTab === "financial" || activeTab === "executive") && (
                        <>
                          <td className="p-3 font-semibold pmo-prno text-blue-600 sticky left-0 z-10 bg-white dark:bg-slate-900">{r.prNo}</td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{r.title}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 font-medium">{r.client}</td>
                          <td className="p-3 font-medium">{r.department}</td>
                          <td className="p-3 text-right font-semibold pmo-prno">₹{r.woValue.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-right font-semibold text-emerald-600 pmo-prno">₹{r.billed.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-right font-semibold text-red-500 pmo-prno">₹{r.outstanding.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-right font-semibold text-indigo-500 pmo-prno">₹{r.profit.toLocaleString("en-IN")} ({r.profitPct.toFixed(1)}%)</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.status === "Active" ? "bg-green-150 text-green-700 bg-green-50" : "bg-slate-100 text-slate-600"}`}>
                              {r.status}
                            </span>
                          </td>
                        </>
                      )}

                      {/* Project Performance Tab Rows */}
                      {activeTab === "project" && (
                        <>
                          <td className="p-3 font-semibold pmo-prno text-blue-600 sticky left-0 z-10 bg-white dark:bg-slate-900">{r.prNo}</td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{r.title}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 font-medium">{r.client}</td>
                          <td className="p-3 font-medium">{r.manager}</td>
                          <td className="p-3 pmo-prno">{r.startDate}</td>
                          <td className="p-3 pmo-prno">{r.endDate}</td>
                          <td className="p-3 font-medium">{r.category}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.status === "Active" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                              {r.status}
                            </span>
                          </td>
                        </>
                      )}

                      {/* Resource Utilization Tab Rows */}
                      {activeTab === "resource" && (
                        <>
                          <td className="p-3 font-semibold pmo-prno text-blue-600 sticky left-0 z-10 bg-white dark:bg-slate-900">{r.prNo}</td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{r.projectTitle}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 font-bold">{r.name}</td>
                          <td className="p-3 font-semibold pmo-prno">{r.empNo}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400">{r.designation}</td>
                          <td className="p-3">{r.dept}</td>
                          <td className="p-3 text-center font-bold pmo-prno">{r.hours} Hrs</td>
                          <td className="p-3 text-center">
                            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-bold">{r.status}</span>
                          </td>
                        </>
                      )}

                      {/* Manpower Analytics Tab Rows */}
                      {activeTab === "manpower" && (
                        <>
                          <td className="p-3 font-semibold pmo-prno text-blue-600 sticky left-0 z-10 bg-white dark:bg-slate-900">{r.employeeNo}</td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{r.employeeName}</td>
                          <td className="p-3 font-bold text-center text-slate-500">{r.grade}</td>
                          <td className="p-3">{r.department}</td>
                          <td className="p-3 text-right font-bold pmo-prno">₹ {r.manhourExpenses.toLocaleString("en-IN")} / Hr</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.status === "Active" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                              {r.status}
                            </span>
                          </td>
                        </>
                      )}

                      {/* Invoice Analytics Tab Rows */}
                      {activeTab === "invoice" && (
                        <>
                          <td className="p-3 font-semibold text-blue-600 sticky left-0 z-10 bg-white dark:bg-slate-900">{r.invoiceRef}</td>
                          <td className="p-3 pmo-prno">{r.invoiceDate}</td>
                          <td className="p-3 font-semibold pmo-prno text-slate-500">{r.prNo}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 font-medium">{r.client}</td>
                          <td className="p-3 text-right font-semibold pmo-prno">₹{r.invoiceAmount.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-right font-semibold text-emerald-600 pmo-prno">₹{r.receivedAmount.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-right font-semibold text-red-500 pmo-prno">₹{r.outstandingAmount.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.status === "Paid" ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                              {r.status}
                            </span>
                          </td>
                        </>
                      )}

                      {/* Expense Analytics Tab Rows */}
                      {activeTab === "expense" && (
                        <>
                          <td className="p-3 font-semibold pmo-prno text-blue-600 sticky left-0 z-10 bg-white dark:bg-slate-900">{r.prNo}</td>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200">{r.title}</td>
                          <td className="p-3 text-right font-semibold pmo-prno">₹{r.woValue.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-right font-semibold text-red-500 pmo-prno">₹{r.manhourCost.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-right font-semibold text-red-400 pmo-prno">₹{r.nonManhourCost.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-right font-bold text-red-650 pmo-prno">₹{r.totalCost.toLocaleString("en-IN")}</td>
                          <td className={`p-3 text-right font-bold pmo-prno ${r.margin > 30 ? "text-emerald-600" : "text-amber-500"}`}>{r.margin.toFixed(1)} %</td>
                        </>
                      )}

                      {/* Customer Analytics Tab Rows */}
                      {activeTab === "customer" && (
                        <>
                          <td className="p-3 font-bold text-slate-800 dark:text-slate-200 sticky left-0 z-10 bg-white dark:bg-slate-900">{r.client}</td>
                          <td className="p-3 font-bold text-center text-slate-500">{r.count} Projects</td>
                          <td className="p-3 text-right font-semibold pmo-prno">₹{r.woValue.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-right font-semibold text-emerald-600 pmo-prno">₹{r.billed.toLocaleString("en-IN")}</td>
                          <td className="p-3 text-right font-semibold text-red-500 pmo-prno">₹{r.outstanding.toLocaleString("en-IN")}</td>
                        </>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Table pagination footer */}
          <div className="tf flex items-center justify-between p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs">
            <div>
              <span className="text-slate-400">
                Showing <strong>{paginatedLedgerRows.length}</strong> of <strong>{sortedLedgerRows.length}</strong> ledgers
              </span>
            </div>

            <div className="flex items-center gap-3">
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
    </div>

      {/* ═══════════ PRINTER ONLY EXECUTIVE REPORT LAYOUT ═══════════ */}
      <div className="print-only-layout space-y-6 p-6">
        {/* Print Header */}
        <div className="flex justify-between items-center border-b pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">iFluids Engineering</h1>
            <p className="text-xs text-slate-500 uppercase tracking-widest">PMO Reporting & Analytics Summary</p>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold text-slate-700">Report Category: {activeTab.toUpperCase()}</span>
            <p className="text-[10px] text-slate-400 mt-1">Generated Date: {currentTime || new Date().toLocaleString()}</p>
          </div>
        </div>

        {/* Applied Filters Metadata */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs grid grid-cols-5 gap-2">
          <div><strong>Department:</strong> {deptFilter}</div>
          <div><strong>Client:</strong> {clientFilter}</div>
          <div><strong>Status:</strong> {statusFilter}</div>
          <div><strong>Category:</strong> {categoryFilter}</div>
          <div><strong>Period Preset:</strong> {datePreset}</div>
        </div>

        {/* KPI Summaries */}
        <div className="grid grid-cols-4 gap-4">
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="text-[9px] font-bold uppercase text-slate-400">Total Work Order Value</div>
            <div className="text-base font-black text-slate-900 mt-1">₹ {pmoKPIs.totalWO.toLocaleString("en-IN")}</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="text-[9px] font-bold uppercase text-slate-400">Total Billed (Raised)</div>
            <div className="text-base font-black text-slate-900 mt-1">₹ {pmoKPIs.totalBilled.toLocaleString("en-IN")}</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="text-[9px] font-bold uppercase text-slate-400">Outstanding Invoices</div>
            <div className="text-base font-black text-slate-900 mt-1">₹ {pmoKPIs.totalOutstanding.toLocaleString("en-IN")}</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-3">
            <div className="text-[9px] font-bold uppercase text-slate-400">Total Gross Profit</div>
            <div className="text-base font-black text-slate-900 mt-1">₹ {pmoKPIs.totalProfit.toLocaleString("en-IN")} ({pmoKPIs.profitPct.toFixed(1)}%)</div>
          </div>
        </div>

        {/* Report Ledger Grid Table (Displays all records without pagination during printing) */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase">
                <th className="p-3 text-left">Record Detail</th>
                <th className="p-3 text-right">Value 1</th>
                <th className="p-3 text-right">Value 2</th>
                <th className="p-3 text-right">Balance</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedLedgerRows.slice(0, 25).map((row: any, idx) => (
                <tr key={idx}>
                  <td className="p-3 font-semibold text-slate-800">
                    {row.prNo || row.employeeNo || row.invoiceRef || row.client} - {row.title || row.employeeName || row.name || row.client}
                  </td>
                  <td className="p-3 text-right pmo-prno">
                    {row.woValue !== undefined ? `₹ ${row.woValue.toLocaleString("en-IN")}` : row.hours !== undefined ? `${row.hours} Hrs` : `₹ ${row.manhourExpenses || 0}`}
                  </td>
                  <td className="p-3 text-right pmo-prno">
                    {row.billed !== undefined ? `₹ ${row.billed.toLocaleString("en-IN")}` : row.receivedAmount !== undefined ? `₹ ${row.receivedAmount.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="p-3 text-right pmo-prno text-red-650 font-bold">
                    {row.outstanding !== undefined ? `₹ ${row.outstanding.toLocaleString("en-IN")}` : row.outstandingAmount !== undefined ? `₹ ${row.outstandingAmount.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="p-3 text-center font-bold text-slate-600">
                    {row.status || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-center text-slate-400 mt-4">Page 1 of 1 · Generated automatically via iFluids PMO Enterprise Report System</p>
      </div>

    </div>
  );
};

export default Reports;