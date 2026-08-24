import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  CalendarDays,
  AlertTriangle,
  FileText,
  Clock,
  Users,
  Search,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Plus,
  Upload,
  History,
} from "lucide-react";
import { GlassReflectionOverlay } from "../../components/ui/GlassReflectionOverlay";

import type { TimesheetEntry, TimesheetImportMonth } from "../../types/Timesheet";
import {
  formatDisplayDate,
  formatMonthDisplay,
  getMonthFromDate,
  getAllTimesheetImports,
  saveAllTimesheetImports,
  refreshTimesheetImportsFromBackend,
} from "../../services/timesheetService";
import { syncTimesheetToProjects } from "../../services/timesheetSyncService";
import { getProjects, updateProject } from "../../services/projectService";
import { getEmployees } from "../../services/employeeService";
import { apiClient, ApiError } from "../../services/apiClient";
import { useAuth } from "../../auth/authContext";
import type { Employee } from "../../types/EmployeeModel";
import { Card, CardHeader } from "../../components/ui/Card";
import { StatTile } from "../../components/ui/StatTile";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Input } from "../../components/ui/Input";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { usePmoToast } from "../../components/ui/usePmoToast";
import { TimesheetExcelImportModal } from "./components/TimesheetExcelImportModal";
import { TimesheetHistoricalResetModal } from "./components/TimesheetHistoricalResetModal";
import "./timesheets-theme.css";

const timesheetStorage = {
  getMonths: getAllTimesheetImports,
  save: saveAllTimesheetImports,
};

const controlClass =
  "h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 focus:border-[var(--nu-accent)] transition-shadow";

const fieldLabelClass = "block text-[11px] font-medium text-[var(--nu-text-secondary)] mb-1";

const toDateKey = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const computeSummary = (entries: TimesheetEntry[]) => ({
  totalEmployees: new Set(entries.map((e) => e.employeeNo)).size,
  totalHours: Math.round(entries.reduce((sum, e) => sum + e.hours, 0) * 100) / 100,
  totalWorkingDays: new Set(entries.map((e) => e.date)).size,
});

// Manually-added entries (this page's own local-only "Add Entry" modal) get
// a client-generated "manual-..." id and have no backing TimesheetEntry row
// in Postgres — only ids without this prefix are real backend rows that
// Edit/Delete/Delete-All may call the API for.
const isBackendEntryId = (id: string) => !id.startsWith("manual-");

interface EntryModalState {
  mode: "add" | "edit";
  original?: { employeeNo: string; projectCode: string; entryId: string | null };
}

interface EmployeeAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  onSelect: (employeeNo: string, displayText: string) => void;
  employees: Employee[];
}

// @ts-ignore
const EmployeeAutocomplete = ({ value, onChange, onSelect, employees }: EmployeeAutocompleteProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return employees.slice(0, 8);
    return employees
      .filter((emp) => emp.employeeName.toLowerCase().includes(q) || emp.employeeNo.toLowerCase().includes(q))
      .slice(0, 8);
  }, [value, employees]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Type employee name or number..."
        className="h-9 text-[12.5px]"
      />
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] py-1 shadow-[var(--nu-shadow-md)]">
          {suggestions.map((emp) => (
            <button
              key={emp.id}
              type="button"
              onClick={() => {
                onSelect(emp.employeeNo, `${emp.employeeNo} — ${emp.employeeName}`);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-[12.5px] text-[var(--nu-text)] hover:bg-[var(--nu-accent-soft)] transition-colors"
            >
              <span className="font-semibold">{emp.employeeNo}</span> — {emp.employeeName}
              <span className="text-[var(--nu-text-muted)]"> ({emp.designation})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const Timesheets = () => {
  const { showToast } = usePmoToast();
  const { user } = useAuth();
  const isAdministrator = user?.role === "Administrator";
  const [allMonths, setAllMonths] = useState<TimesheetImportMonth[]>(
    timesheetStorage.getMonths()
  );
  const [excelImportOpen, setExcelImportOpen] = useState(false);
  const [historicalResetOpen, setHistoricalResetOpen] = useState(false);

  // Shared refresh-after-mutation path for both the Excel import and the
  // historical reset — mirrors handleDeleteAllMonths()'s existing
  // "re-sync from backend, then swap local state" pattern exactly.
  const handleBackendDataChanged = async () => {
    try {
      await refreshTimesheetImportsFromBackend();
      setAllMonths(timesheetStorage.getMonths());
    } catch (err) {
      console.warn("Could not refresh Timesheet Records from backend after import/reset:", err);
    }
  };
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [searchEmployee, setSearchEmployee] = useState<string>("");

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 30;

  // Edit/Delete/Delete-All now call the real backend (Part 2/3 of the
  // Timesheet CRUD integration) — actionPending disables the relevant
  // buttons mid-request to prevent double-submits, actionError surfaces a
  // failed backend call instead of silently pretending it succeeded.
  const [actionPending, setActionPending] = useState(false);

  const masterEmployees = useMemo(() => getEmployees(), []);

  // Connects Timesheet Records to the real backend TimesheetEntry data
  // (KEKA import pipeline) instead of only whatever was last uploaded in
  // this browser. Non-fatal on failure — the page still works from
  // whatever local data already exists (e.g. offline, or backend down).
  useEffect(() => {
    refreshTimesheetImportsFromBackend()
      .then(() => setAllMonths(timesheetStorage.getMonths()))
      .catch((err) => console.warn("Could not refresh Timesheet Records from backend:", err));
  }, []);

  // Manual Add/Edit Entry modal state
  const [entryModal, setEntryModal] = useState<EntryModalState | null>(null);
  const [formEmployeeNo, setFormEmployeeNo] = useState("");
  // @ts-ignore
  const [formEmployeeSearch, setFormEmployeeSearch] = useState("");
  const [formProjectCode, setFormProjectCode] = useState("");
  const [formProjectName, setFormProjectName] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formTotalHours, setFormTotalHours] = useState("");
  const [formError, setFormError] = useState("");

  const currentMonthData = selectedMonth && selectedMonth !== "all" ? allMonths.find((m) => m.month === selectedMonth) : undefined;
  const entries: TimesheetEntry[] = useMemo(() => {
    if (selectedMonth === "all") {
      return allMonths.flatMap((m) => m.entries);
    }
    return currentMonthData?.entries || [];
  }, [selectedMonth, allMonths, currentMonthData]);

  const uniqueProjects = useMemo(() => {
    const projects = new Set(entries.map((e) => e.projectCode));
    return Array.from(projects).sort();
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const projectMatch = selectedProject === "all" || entry.projectCode === selectedProject;
      const employeeMatch =
        !searchEmployee ||
        entry.employeeName.toLowerCase().includes(searchEmployee.toLowerCase()) ||
        entry.employeeNo.toLowerCase().includes(searchEmployee.toLowerCase());
      return projectMatch && employeeMatch;
    });
  }, [entries, selectedProject, searchEmployee]);

  const employeeGroups: Record<string, TimesheetEntry[]> = {};
  filteredEntries.forEach((entry) => {
    const key = `${entry.employeeNo}___${entry.projectCode}`;
    if (!employeeGroups[key]) {
      employeeGroups[key] = [];
    }
    employeeGroups[key].push(entry);
  });

  const allEmployees = useMemo(() => {
    // Grouped by the internal `${employeeNo}___${projectCode}` key above
    // (kept, unchanged — needed so the same employee's entries for two
    // different projects stay in separate rows), but that composite key
    // itself must never be displayed. The real Employee No always comes
    // from the grouped entry's own .employeeNo field below, not the key.
    return Object.values(employeeGroups).map((empEntries) => {
      const first = empEntries[0];
      const totalHours = empEntries.reduce((sum, e) => sum + e.hours, 0);
      const workingDays = new Set(empEntries.map((e) => e.date)).size;
      return {
        employeeNo: first.employeeNo,
        employeeName: first.employeeName,
        projectCode: first.projectCode,
        projectName: first.projectName,
        department: "",
        reportingManager: "",
        startDate: empEntries.map((e) => e.date).sort()[0],
        endDate: empEntries.map((e) => e.date).sort().reverse()[0],
        workingDays,
        totalHours,
        employeeCost: 0,
        // Only a row backed by exactly one raw TimesheetEntry has an
        // unambiguous single record to PATCH — most rows aggregate several
        // dates/tasks (see the group-shape check that grounded this design:
        // 50 of 65 real employee+project groups span more than one entry).
        // null here disables Edit for that row rather than guessing how to
        // split an edited total back across multiple real database rows.
        entryId: empEntries.length === 1 ? empEntries[0].id : null,
      };
    });
  }, [employeeGroups]);

  const totalPages = Math.max(Math.ceil(allEmployees.length / pageSize), 1);
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return allEmployees.slice(start, start + pageSize);
  }, [allEmployees, currentPage]);

  const summaryStats = useMemo(() => {
    return {
      totalEmployees: new Set(filteredEntries.map((e) => e.employeeNo)).size,
      totalHours: Math.round(filteredEntries.reduce((sum, e) => sum + e.hours, 0) * 100) / 100,
      totalWorkingDays: new Set(filteredEntries.map((e) => e.date)).size,
    };
  }, [filteredEntries]);

  // Reset pagination when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedMonth, selectedProject, searchEmployee]);

  const [deleteMonthTarget, setDeleteMonthTarget] = useState<string | null>(null);

  const handleDeleteMonth = (month: string) => {
    const updated = allMonths.filter((m) => m.month !== month);
    timesheetStorage.save(updated);
    setAllMonths(updated);
    if (selectedMonth === month) {
      setSelectedMonth(updated[updated.length - 1]?.month || "");
    }
    showToast({ type: "success", message: `Timesheet data for ${formatMonthDisplay(month)} deleted.` });
  };

  // Real, protected backend operation (Part 2D) — deletes every
  // TimesheetEntry row in Postgres (Projects/Employees/KEKA config/
  // TimesheetImport history are untouched; affected ProjectResource rows
  // are recomputed server-side, see timesheet.service.ts's
  // deleteAllTimesheetEntries()). Local state is only cleared and
  // re-synced from the backend AFTER that call succeeds — a failure
  // leaves every existing record visible, per the "never pretend it
  // succeeded" requirement.
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);

  const handleDeleteAllMonths = async () => {
    setActionPending(true);
    try {
      await apiClient.delete("/timesheets/entries");
      saveAllTimesheetImports([]);
      await refreshTimesheetImportsFromBackend();
      setAllMonths(timesheetStorage.getMonths());
      setSelectedMonth("");
      showToast({ type: "success", message: "All timesheet records deleted successfully." });
    } catch (err) {
      showToast({
        type: "error",
        message: err instanceof ApiError ? err.message : "Failed to delete all timesheet records. Please try again.",
      });
    } finally {
      setActionPending(false);
    }
  };

  // Persist an updated entry set for the current month and re-sync matching
  // projects. Projects/Team Assigned reads timesheet data live (matching
  // Project Code = PR Number on every render), so saving here is enough for
  // that view to reflect the change immediately — no separate propagation
  // needed for add/edit/delete to show up there.
  const persistMonthEntries = (updatedEntries: TimesheetEntry[]) => {
    if (!currentMonthData) return;

    const updatedMonth: TimesheetImportMonth = {
      ...currentMonthData,
      entries: updatedEntries,
      summary: computeSummary(updatedEntries),
    };

    const updatedMonths = allMonths.map((m) => (m.month === selectedMonth ? updatedMonth : m));
    timesheetStorage.save(updatedMonths);
    setAllMonths(updatedMonths);

    try {
      const allProjects = getProjects();
      const synced = syncTimesheetToProjects(allProjects, updatedMonth);
      synced.forEach((project) => updateProject(project));
    } catch (syncErr) {
      console.warn("Sync warning:", syncErr);
    }
  };

  const openAddEntry = () => {
    setEntryModal({ mode: "add" });
    setFormEmployeeNo("");
    setFormEmployeeSearch("");
    setFormProjectCode("");
    setFormProjectName("");
    setFormStartDate("");
    setFormEndDate("");
    setFormTotalHours("");
    setFormError("");
  };

  const openEditEntry = (emp: (typeof allEmployees)[number]) => {
    setEntryModal({ mode: "edit", original: { employeeNo: emp.employeeNo, projectCode: emp.projectCode, entryId: emp.entryId } });
    setFormEmployeeNo(emp.employeeNo);
    setFormEmployeeSearch(`${emp.employeeNo} — ${emp.employeeName}`);
    setFormProjectCode(emp.projectCode);
    setFormProjectName(emp.projectName);
    setFormStartDate(emp.startDate);
    setFormEndDate(emp.endDate);
    setFormTotalHours(String(emp.totalHours));
    setFormError("");
  };

  const closeEntryModal = () => setEntryModal(null);

  const handleSaveEntry = async () => {
    if (!currentMonthData || !entryModal) return;

    if (!formEmployeeNo) {
      setFormError("Select an employee.");
      return;
    }
    if (!formProjectCode.trim()) {
      setFormError("Project Code is required.");
      return;
    }
    if (!formStartDate || !formEndDate) {
      setFormError("Start and End dates are required.");
      return;
    }
    if (new Date(formEndDate) < new Date(formStartDate)) {
      setFormError("End date must be on or after the start date.");
      return;
    }
    if (getMonthFromDate(formStartDate) !== selectedMonth || getMonthFromDate(formEndDate) !== selectedMonth) {
      setFormError(`Dates must fall within ${formatMonthDisplay(selectedMonth)}.`);
      return;
    }

    const hoursNum = Number(formTotalHours);
    if (!hoursNum || hoursNum <= 0) {
      setFormError("Enter a valid total hours value.");
      return;
    }

    const employee = masterEmployees.find((e) => e.employeeNo === formEmployeeNo);
    if (!employee) {
      setFormError("Selected employee not found in Employee Master.");
      return;
    }

    // A single real TimesheetEntry row — correct it via the backend API
    // (Part 2B) instead of only writing to localStorage. Project Code/Name
    // reassignment isn't sent: editTimesheetEntry() deliberately keeps
    // identity fields (employeeNo/projectId) frozen, so only Hours/Date
    // changes here have any effect on the real record.
    if (entryModal.mode === "edit" && entryModal.original?.entryId && isBackendEntryId(entryModal.original.entryId)) {
      setActionPending(true);
      try {
        await apiClient.patch(`/timesheets/entries/${entryModal.original.entryId}`, {
          hours: hoursNum,
          workDate: formStartDate,
        });
        await refreshTimesheetImportsFromBackend();
        setAllMonths(timesheetStorage.getMonths());
        setEntryModal(null);
        showToast({ type: "success", message: "Timesheet entry updated successfully." });
      } catch (err) {
        showToast({
          type: "error",
          message: err instanceof ApiError ? err.message : "Failed to update the timesheet entry. Please try again.",
        });
      } finally {
        setActionPending(false);
      }
      return;
    }

    const isDuplicate = currentMonthData.entries.some((e) => {
      if (e.employeeNo !== formEmployeeNo || e.projectCode.trim().toLowerCase() !== formProjectCode.trim().toLowerCase()) {
        return false;
      }
      if (entryModal.mode === "edit" && entryModal.original) {
        return !(e.employeeNo === entryModal.original.employeeNo && e.projectCode === entryModal.original.projectCode);
      }
      return true;
    });
    if (entryModal.mode === "add" && isDuplicate) {
      setFormError("This employee already has entries for this project in the selected period. Edit the existing entry instead.");
      return;
    }

    const dateKeys: string[] = [];
    const cursor = new Date(formStartDate);
    const end = new Date(formEndDate);
    while (cursor <= end) {
      dateKeys.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    const perDay = Math.round((hoursNum / dateKeys.length) * 100) / 100;
    const newEntries: TimesheetEntry[] = dateKeys.map((date, idx) => {
      const isLast = idx === dateKeys.length - 1;
      const hours = isLast ? Math.round((hoursNum - perDay * (dateKeys.length - 1)) * 100) / 100 : perDay;
      return {
        id: `manual-${formEmployeeNo}-${formProjectCode}-${date}-${idx}`,
        employeeNo: formEmployeeNo,
        employeeName: employee.employeeName,
        projectCode: formProjectCode.trim(),
        projectName: formProjectName.trim(),
        date,
        hours,
        status: "Active",
      };
    });

    const filteredExisting = currentMonthData.entries.filter((e) => {
      if (entryModal.mode === "edit" && entryModal.original) {
        return !(e.employeeNo === entryModal.original.employeeNo && e.projectCode === entryModal.original.projectCode);
      }
      return true;
    });

    persistMonthEntries([...filteredExisting, ...newEntries]);
    setEntryModal(null);
    showToast({
      type: "success",
      message: entryModal.mode === "add" ? "Timesheet entry added successfully." : "Timesheet entry updated successfully.",
    });
  };

  // Deletes every raw TimesheetEntry backing this row (Part 2C/3) — a row
  // in this table aggregates every date/task for one employee+project, so
  // "delete this row" means deleting each of its underlying real entries.
  // Falls back to the old local-only removal only when none of them are
  // real backend rows (a purely manually-added group).
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<(typeof allEmployees)[number] | null>(null);

  const handleDeleteEntry = async (emp: (typeof allEmployees)[number]) => {
    const targetMonthKey = selectedMonth !== "all" ? selectedMonth : getMonthFromDate(emp.startDate);
    const targetMonthData = allMonths.find((m) => m.month === targetMonthKey);
    if (!targetMonthData) return;

    const groupEntries = targetMonthData.entries.filter(
      (e) => e.employeeNo === emp.employeeNo && e.projectCode === emp.projectCode
    );
    const realEntryIds = groupEntries.map((e) => e.id).filter(isBackendEntryId);

    if (realEntryIds.length > 0) {
      setActionPending(true);
      try {
        await Promise.all(realEntryIds.map((id) => apiClient.delete(`/timesheets/entries/${id}`)));
        await refreshTimesheetImportsFromBackend();
        setAllMonths(timesheetStorage.getMonths());
        showToast({ type: "success", message: `Timesheet entry for ${emp.employeeName} removed.` });
      } catch (err) {
        showToast({
          type: "error",
          message: err instanceof ApiError ? err.message : "Failed to delete the timesheet entry. Please try again.",
        });
      } finally {
        setActionPending(false);
      }
      return;
    }

    // Purely local (manually-added) entries never had a backend row to
    // begin with — remove them from local state directly, as before.
    const updatedEntries = targetMonthData.entries.filter(
      (e) => !(e.employeeNo === emp.employeeNo && e.projectCode === emp.projectCode)
    );

    const updatedMonth: TimesheetImportMonth = {
      ...targetMonthData,
      entries: updatedEntries,
      summary: computeSummary(updatedEntries),
    };

    const updatedMonths = allMonths.map((m) => (m.month === targetMonthKey ? updatedMonth : m));
    timesheetStorage.save(updatedMonths);
    setAllMonths(updatedMonths);
    showToast({ type: "success", message: `Timesheet entry for ${emp.employeeName} removed.` });

    try {
      const allProjects = getProjects();
      const synced = syncTimesheetToProjects(allProjects, updatedMonth);
      synced.forEach((project) => updateProject(project));
    } catch (syncErr) {
      console.warn("Sync warning:", syncErr);
    }
  };

  return (
    <div className="timesheets-shell -m-6">
      <div className="p-4 space-y-3.5 nu-fade-in">
        {/* ═══ Hero Banner ═══ */}
        <div
          className="relative overflow-hidden rounded-[var(--nu-radius-lg)] px-5 py-4 md:py-0 flex items-center justify-between gap-6 flex-wrap md:h-[112px]"
          style={{ background: "linear-gradient(120deg, #0f2447 0%, #14335f 45%, #0e5a73 100%)" }}
        >
          <GlassReflectionOverlay />
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold text-white leading-tight">Timesheets</h1>
            <p className="text-[13px] text-[#a9bfda] mt-1 max-w-2xl leading-snug hidden md:block">
              Import employee timesheets — automatically synced to Projects by PR Number.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 z-10">
            {isAdministrator && (
              <Button
                variant="hero"
                size="sm"
                icon={<History size={14} />}
                onClick={() => setHistoricalResetOpen(true)}
              >
                Historical Reset
              </Button>
            )}
            <Button
              variant="hero"
              size="sm"
              icon={<Upload size={14} />}
              onClick={() => setExcelImportOpen(true)}
            >
              Upload Excel
            </Button>
          </div>
        </div>

        {/* ═══ KPI Strip ═══ */}
        {(selectedMonth === "all" ? allMonths.length > 0 : !!currentMonthData) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatTile emphasis="secondary" label="Total Employees" value={summaryStats.totalEmployees.toString()} icon={<Users size={14} />} tint="accent" />
            <StatTile
              emphasis="secondary"
              label="Total Hours"
              value={`${summaryStats.totalHours.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} hrs`}
              icon={<Clock size={14} />}
              tint="success"
            />
            <StatTile emphasis="secondary" label="Working Days" value={summaryStats.totalWorkingDays.toString()} icon={<FileText size={14} />} tint="info" />
          </div>
        )}

        {/* ═══ Records Card ═══ */}
        <Card padded={false} elevated>
          <CardHeader
            icon={<FileText size={15} />}
            title="Timesheet Records"
            subtitle="Filter imported entries by period, project or employee."
          />

          {/* Toolbar */}
          {allMonths.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-[var(--nu-border)]">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className={`${controlClass} px-2.5 shrink-0`}
                title="Period"
              >
                <option value="all">All Months</option>
                {allMonths.map((month) => (
                  <option key={month.month} value={month.month}>
                    {formatMonthDisplay(month.month)}
                  </option>
                ))}
              </select>

              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className={`${controlClass} px-2.5 shrink-0`}
                title="Project"
              >
                <option value="all">All Projects</option>
                {uniqueProjects.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>

              <div className="w-px h-6 bg-[var(--nu-border)] mx-0.5 shrink-0" />

              <div className="relative flex-1 min-w-[220px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--nu-text-muted)]" />
                <input
                  value={searchEmployee}
                  onChange={(e) => setSearchEmployee(e.target.value)}
                  placeholder="Search employee name or ID..."
                  className={`${controlClass} w-full pl-8 pr-3`}
                />
              </div>
            </div>
          )}

          {/* Body */}
          {allMonths.length === 0 ? (
            <div className="py-10">
              <div className="flex flex-col items-center text-center px-4">
                <div className="w-12 h-12 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] text-[var(--nu-text-muted)] flex items-center justify-center mb-3">
                  <FileText size={20} />
                </div>
                <p className="text-[14px] font-semibold text-[var(--nu-text)]">No Timesheets Imported</p>
                <p className="text-[12.5px] text-[var(--nu-text-muted)] mt-1 max-w-[300px] leading-snug">
                  Timesheet data will appear automatically once the KEKA daily report is processed.
                </p>
              </div>
            </div>
          ) : !selectedMonth ? (
            <EmptyState
              icon={<CalendarDays size={18} />}
              title="Select a Period"
              description="Choose a month or week above to view employee data."
            />
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--nu-border)]">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-[var(--nu-text)]">
                    {selectedMonth === "all" ? "All Months" : formatMonthDisplay(selectedMonth)}
                  </p>
                  <p className="text-[11.5px] text-[var(--nu-text-muted)] mt-0.5">
                    {allEmployees.length} total employees ({currentPage * pageSize > allEmployees.length ? allEmployees.length : currentPage * pageSize} showing)
                  </p>
                </div>
                {selectedMonth === "all" ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 size={13} />}
                      onClick={() => setDeleteAllConfirmOpen(true)}
                      disabled={actionPending}
                      className="!text-[var(--nu-danger)] hover:!bg-[var(--nu-danger-soft)]"
                    >
                      Delete All Timesheets
                    </Button>
                  </div>
                ) : (
                  currentMonthData && (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={openAddEntry}>
                        Add Entry
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Trash2 size={13} />}
                        onClick={() => setDeleteMonthTarget(selectedMonth)}
                        className="!text-[var(--nu-danger)] hover:!bg-[var(--nu-danger-soft)]"
                      >
                        Delete Period
                      </Button>
                    </div>
                  )
                )}
              </div>

              <div className="max-h-[560px] overflow-auto nu-scrollbar">
                {allEmployees.length === 0 ? (
                  <EmptyState icon={<Users size={18} />} title="No matching employees" description="Try adjusting the project filter or search term." />
                ) : (
                  <table className="w-full min-w-[980px] border-collapse text-left">
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-[var(--nu-surface-alt)] text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)] border-b border-[var(--nu-border)]">
                        <th className="px-4 py-2.5 font-medium sticky top-0 left-0 z-30 bg-[var(--nu-surface-alt)] border-r border-[var(--nu-border)] shadow-xs">
                          Employee No
                        </th>
                        <th className="px-4 py-2.5 font-medium">Employee Name</th>
                        <th className="px-4 py-2.5 font-medium">Project Code</th>
                        <th className="px-4 py-2.5 font-medium">Project Name</th>
                        <th className="px-4 py-2.5 font-medium w-28">Start Date</th>
                        <th className="px-4 py-2.5 font-medium w-28">End Date</th>
                        <th className="px-4 py-2.5 text-center font-medium w-24">Working Days</th>
                        <th className="px-4 py-2.5 text-right font-medium w-24">Total Hours</th>
                        <th className="px-4 py-2.5 text-center font-medium w-24">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedEmployees.map((emp, index) => (
                        <tr
                          key={`${emp.employeeNo}-${emp.projectCode}`}
                          className={`group border-b border-[var(--nu-border)] last:border-none hover:bg-[var(--nu-accent-soft)] transition-colors ${
                            index % 2 === 1 ? "bg-[var(--nu-surface-alt)]" : "bg-[var(--nu-surface)]"
                          }`}
                        >
                          <td
                            className={`px-4 py-3 text-[12.5px] font-semibold text-[var(--nu-text)] sticky left-0 z-10 border-r border-[var(--nu-border)] transition-colors ${
                              index % 2 === 1
                                ? "bg-[var(--nu-surface-alt)] group-hover:bg-[var(--nu-accent-soft)]"
                                : "bg-[var(--nu-surface)] group-hover:bg-[var(--nu-accent-soft)]"
                            }`}
                          >
                            {emp.employeeNo}
                          </td>
                          <td className="px-4 py-3 text-[12.5px] text-[var(--nu-text)]">{emp.employeeName}</td>
                          <td className="px-4 py-3">
                            <Badge tone="accent">{emp.projectCode}</Badge>
                          </td>
                          <td className="px-4 py-3 text-[12px] text-[var(--nu-text-secondary)]">{emp.projectName}</td>
                          <td className="px-4 py-3 text-[12px] text-[var(--nu-text-secondary)]">{formatDisplayDate(emp.startDate)}</td>
                          <td className="px-4 py-3 text-[12px] text-[var(--nu-text-secondary)]">{formatDisplayDate(emp.endDate)}</td>
                          <td className="px-4 py-3 text-center text-[12px] text-[var(--nu-text-secondary)]">{emp.workingDays} days</td>
                          <td className="px-4 py-3 text-right text-[12.5px] font-medium text-[var(--nu-text)]">
                            {emp.totalHours.toLocaleString("en-IN", {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 2,
                            })}{" "}
                            hrs
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                title={
                                  emp.entryId === null
                                    ? "Editing is only available for a record spanning a single date/task — this row aggregates several. Delete and re-add if it needs correcting."
                                    : "Edit"
                                }
                                onClick={() => emp.entryId !== null && openEditEntry(emp)}
                                disabled={emp.entryId === null || actionPending}
                                className="w-9 h-9 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center hover:shadow-[var(--nu-shadow-md)] hover:-translate-y-0.5 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                title="Delete"
                                disabled={actionPending}
                                onClick={() => setDeleteEntryTarget(emp)}
                                className="w-9 h-9 rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] text-[var(--nu-danger)] flex items-center justify-center hover:shadow-[var(--nu-shadow-md)] hover:-translate-y-0.5 transition-all duration-150"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination */}
              {allEmployees.length > pageSize && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--nu-border)]">
                  <p className="text-[11.5px] text-[var(--nu-text-muted)]">
                    Page <strong className="text-[var(--nu-text-secondary)]">{currentPage}</strong> of{" "}
                    <strong className="text-[var(--nu-text-secondary)]">{totalPages}</strong> ({allEmployees.length} total)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<ChevronLeft size={13} />}
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="flex-row-reverse"
                      icon={<ChevronRight size={13} />}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* ═══ Add / Edit Entry Modal ═══ */}
      {entryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="shrink-0 p-5 border-b border-[var(--nu-border)] flex items-start gap-3">
              <div className="w-10 h-10 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center shrink-0">
                {entryModal.mode === "add" ? <Plus size={18} /> : <Pencil size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-[var(--nu-text)]">
                  {entryModal.mode === "add" ? "Add Timesheet Entry" : "Edit Timesheet Entry"}
                </h2>
                <p className="text-[12.5px] text-[var(--nu-text-secondary)] mt-1">
                  {entryModal.mode === "add"
                    ? "Manually add an employee missing from the uploaded timesheet."
                    : `Update the record for ${formEmployeeNo}.`}
                </p>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className={fieldLabelClass}>Employee</label>
                  <EmployeeAutocomplete
                    value={formEmployeeSearch}
                    onChange={(val) => {
                      setFormEmployeeSearch(val);
                      setFormEmployeeNo("");
                    }}
                    onSelect={(employeeNo, displayText) => {
                      setFormEmployeeNo(employeeNo);
                      setFormEmployeeSearch(displayText);
                    }}
                    employees={masterEmployees}
                  />
                </div>

                <div>
                  <label className={fieldLabelClass}>Project Code</label>
                  <Input
                    type="text"
                    value={formProjectCode}
                    onChange={(e) => setFormProjectCode(e.target.value)}
                    placeholder="e.g. PR-11058"
                    className="h-9 text-[12.5px]"
                  />
                </div>

                <div>
                  <label className={fieldLabelClass}>Project Name</label>
                  <Input
                    type="text"
                    value={formProjectName}
                    onChange={(e) => setFormProjectName(e.target.value)}
                    placeholder="Optional"
                    className="h-9 text-[12.5px]"
                  />
                </div>

                <div>
                  <label className={fieldLabelClass}>Start Date</label>
                  <Input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="h-9 text-[12.5px]"
                  />
                </div>

                <div>
                  <label className={fieldLabelClass}>End Date</label>
                  <Input
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="h-9 text-[12.5px]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className={fieldLabelClass}>Total Hours</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={formTotalHours}
                    onChange={(e) => setFormTotalHours(e.target.value)}
                    placeholder="Enter total hours for this date range"
                    className="h-9 text-[12.5px]"
                  />
                </div>
              </div>

              {formError && (
                <div className="bg-[var(--nu-danger-soft)] border border-[var(--nu-danger)]/20 rounded-[var(--nu-radius-md)] p-3 flex items-start gap-2">
                  <AlertTriangle size={14} className="text-[var(--nu-danger)] shrink-0 mt-0.5" />
                  <p className="text-[12px] text-[var(--nu-danger)] font-medium">{formError}</p>
                </div>
              )}
            </div>

            {/* Sticky Footer */}
            <div className="shrink-0 sticky bottom-0 z-10 p-4 bg-[var(--nu-surface)] border-t border-[var(--nu-border)] flex items-center justify-end gap-2.5">
              <Button variant="secondary" size="sm" onClick={closeEntryModal}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveEntry}>
                {entryModal.mode === "add" ? "Add Entry" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteMonthTarget !== null}
        variant="danger"
        title="Delete Timesheet Period?"
        message={`Delete timesheet data for ${deleteMonthTarget ? formatMonthDisplay(deleteMonthTarget) : ""}?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setDeleteMonthTarget(null)}
        onConfirm={() => {
          if (!deleteMonthTarget) return;
          handleDeleteMonth(deleteMonthTarget);
          setDeleteMonthTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteAllConfirmOpen}
        variant="danger"
        title="Delete All Timesheets?"
        message="Are you sure you want to delete all imported timesheet records? This permanently removes every timesheet entry and cannot be undone."
        confirmLabel="Delete All"
        cancelLabel="Cancel"
        onCancel={() => setDeleteAllConfirmOpen(false)}
        onConfirm={async () => {
          setDeleteAllConfirmOpen(false);
          await handleDeleteAllMonths();
        }}
      />

      <ConfirmDialog
        open={deleteEntryTarget !== null}
        variant="danger"
        title="Remove Timesheet Entry?"
        message={
          deleteEntryTarget
            ? `Remove ${deleteEntryTarget.employeeName} (${deleteEntryTarget.employeeNo}) from ${deleteEntryTarget.projectCode} for ${formatMonthDisplay(
                selectedMonth !== "all" ? selectedMonth : getMonthFromDate(deleteEntryTarget.startDate)
              )}?`
            : ""
        }
        confirmLabel="Remove"
        cancelLabel="Cancel"
        onCancel={() => setDeleteEntryTarget(null)}
        onConfirm={async () => {
          if (!deleteEntryTarget) return;
          const target = deleteEntryTarget;
          setDeleteEntryTarget(null);
          await handleDeleteEntry(target);
        }}
      />

      <TimesheetExcelImportModal
        open={excelImportOpen}
        onClose={() => setExcelImportOpen(false)}
        onImported={handleBackendDataChanged}
      />

      {isAdministrator && (
        <TimesheetHistoricalResetModal
          open={historicalResetOpen}
          onClose={() => setHistoricalResetOpen(false)}
          onCleared={handleBackendDataChanged}
        />
      )}
    </div>
  );
};

export default Timesheets;
