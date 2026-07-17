import React, { useRef, useState, useMemo, useCallback } from "react";
import {
  Upload,
  CalendarDays,
  AlertTriangle,
  Check,
  FileText,
  Clock,
  Users,
  Search,
  Pencil,
  Trash2,
  Loader,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ReactNode } from "react";
import type { TimesheetEntry, TimesheetImportMonth } from "../../types/Timesheet";
import {
  extractTimesheetEntries,
  createImportMonth,
  formatDisplayDate,
  formatMonthDisplay,
  getAllTimesheetImports,
  saveAllTimesheetImports,
} from "../../services/timesheetService";
import {
  parseWorkbook,
  findHeaderRow,
  normalizeHeaders,
  validateHeaders,
  sheetToRows,
  normalizeProjectCode,
  type ImportReport,
} from "../../services/timesheetImportService";
import { syncTimesheetToProjects } from "../../services/timesheetSyncService";
import { getProjects, updateProject } from "../../services/projectService";
import { Card, CardHeader } from "../../components/ui/Card";
import { StatTile } from "../../components/ui/StatTile";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import "./timesheets-theme.css";

const timesheetStorage = {
  getMonths: getAllTimesheetImports,
  save: saveAllTimesheetImports,
};

const controlClass =
  "h-9 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 focus:border-[var(--nu-accent)] transition-shadow";

const InfoChip = ({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) => (
  <div className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--nu-radius-md)] bg-white/[0.07] border border-white/[0.1] shrink-0">
    <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center shrink-0">{icon}</div>
    <div className="leading-tight">
      <p className="text-[9.5px] uppercase tracking-wide text-white/55 font-medium">{label}</p>
      <p className="text-[12.5px] font-semibold text-white whitespace-nowrap">{value}</p>
    </div>
  </div>
);

const Timesheets = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [allMonths, setAllMonths] = useState<TimesheetImportMonth[]>(
    timesheetStorage.getMonths()
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(
    allMonths[allMonths.length - 1]?.month || ""
  );
  const [importType, setImportType] = useState<"monthly" | "weekly">("monthly");
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [searchEmployee, setSearchEmployee] = useState<string>("");

  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [syncedProjects, setSyncedProjects] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 30;

  const currentMonthData = selectedMonth ? allMonths.find((m) => m.month === selectedMonth) : undefined;
  const entries: TimesheetEntry[] = currentMonthData?.entries || [];

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
    if (!employeeGroups[entry.employeeNo]) {
      employeeGroups[entry.employeeNo] = [];
    }
    employeeGroups[entry.employeeNo].push(entry);
  });

  const allEmployees = useMemo(() => {
    return Object.entries(employeeGroups).map(([empNo, empEntries]) => {
      const first = empEntries[0];
      const totalHours = empEntries.reduce((sum, e) => sum + e.hours, 0);
      const workingDays = new Set(empEntries.map((e) => e.date)).size;
      return {
        employeeNo: empNo,
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportReport(null);
      setImportError(null);
      setShowImportModal(true);
    }
    e.target.value = "";
  };

  const closeImportModal = useCallback(() => {
    setShowImportModal(false);
    setSelectedFile(null);
    setImportReport(null);
    setImportError(null);
  }, []);

  const handleExecuteImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportReport(null);
    setImportError(null);

    try {
      const workbook = await parseWorkbook(selectedFile);
      const detectedSheets = workbook.SheetNames;

      let found = false;
      let selectedSheetName = "";
      let headerRowIndex = 0;
      let headerRow: unknown[] = [];
      let dataRows: unknown[][] = [];

      for (const sheetName of detectedSheets) {
        const sheet = workbook.Sheets[sheetName];
        const rows = sheetToRows(sheet);
        const headerMatch = findHeaderRow(rows);

        if (!headerMatch) continue;

        const normalized = normalizeHeaders(headerMatch.row);
        const hasRequiredFields = [
          "employeeNo",
          "employeeName",
          "projectCode",
          "date",
          "totalHours",
        ].every((field) => {
          const synonyms: Record<string, string[]> = {
            employeeNo: ["employee number", "employee no", "emp no"],
            employeeName: ["employee name", "full name", "name"],
            projectCode: ["project code", "pr number", "pr no"],
            date: ["date", "working date"],
            totalHours: ["total hours", "hours"],
          };
          return synonyms[field].some((syn) =>
            normalized.includes(syn.toLowerCase().replace(/\s+/g, " "))
          );
        });

        if (hasRequiredFields) {
          found = true;
          selectedSheetName = sheetName;
          headerRowIndex = headerMatch.rowIndex;
          headerRow = headerMatch.row;
          dataRows = rows.slice(headerMatch.rowIndex + 1);
          break;
        }
      }

      if (!found) {
        throw new Error(
          "Could not find timesheet data. Required columns: Employee No, Employee Name, Project Code, Date, Hours"
        );
      }

      const normalizedHeaders = normalizeHeaders(headerRow);
      const { indices, missing } = validateHeaders(normalizedHeaders);

      if (missing.length > 0) {
        throw new Error(`Missing columns: ${missing.join(", ")}`);
      }

      const allEntries = extractTimesheetEntries(
        dataRows.filter((row) => row.some((cell) => cell !== "" && cell !== null && cell !== undefined)),
        indices as Record<string, number>
      );

      if (allEntries.length === 0) {
        throw new Error("No valid timesheet entries found.");
      }

      const existingMonth = allMonths.find((m) => m.month === allEntries[0].date.substring(0, 7));
      if (existingMonth) {
        const duplicateCheck = allEntries.filter((newEntry) =>
          existingMonth.entries.some(
            (existing) =>
              existing.employeeNo === newEntry.employeeNo &&
              existing.projectCode === newEntry.projectCode &&
              existing.date === newEntry.date
          )
        );

        if (duplicateCheck.length > 0) {
          throw new Error(
            `Found ${duplicateCheck.length} duplicate entries. Update the existing import or use a different month.`
          );
        }
      }

      const newMonth = createImportMonth(allEntries, "Admin", importType);
      const updatedMonths = allMonths.filter((m) => m.month !== newMonth.month);
      updatedMonths.push(newMonth);
      updatedMonths.sort((a, b) => a.month.localeCompare(b.month));

      timesheetStorage.save(updatedMonths);
      setAllMonths(updatedMonths);
      setSelectedMonth(newMonth.month);
      setSelectedProject("all");
      setSearchEmployee("");

      // AUTO-SYNC: push the latest resource snapshot onto matching projects
      // (kept for Reports/other views that read project.resources directly).
      // The Team Members tab itself no longer depends on this snapshot — it
      // matches Project Code = PR Number live, so it can never go stale.
      try {
        const allProjects = getProjects();
        const importEntryCodes = new Set(
          allEntries.map((e) => normalizeProjectCode(e.projectCode)).filter(Boolean)
        );

        const matchedPrNos = allProjects
          .filter((p) => importEntryCodes.has(normalizeProjectCode(p.prNo)))
          .map((p) => p.prNo);
        setSyncedProjects(matchedPrNos);

        const synced = syncTimesheetToProjects(allProjects, newMonth);
        synced.forEach((project) => updateProject(project));
      } catch (syncErr) {
        console.warn("Sync warning:", syncErr);
      }

      const report: ImportReport = {
        workbookName: selectedFile.name,
        detectedSheets,
        selectedSheet: selectedSheetName,
        headerRowNumber: headerRowIndex + 1,
        detectedHeaders: headerRow.map((h) => String(h ?? "")),
        missingHeaders: [],
        importedRows: dataRows.length,
        matchedRows: allEntries.length,
        ignoredRows: 0,
      };

      setImportReport(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      setImportError(message);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteMonth = (month: string) => {
    if (window.confirm(`Delete timesheet data for ${formatMonthDisplay(month)}?`)) {
      const updated = allMonths.filter((m) => m.month !== month);
      timesheetStorage.save(updated);
      setAllMonths(updated);
      if (selectedMonth === month) {
        setSelectedMonth(updated[updated.length - 1]?.month || "");
      }
    }
  };

  return (
    <div className="timesheets-shell -m-6">
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx,.xls"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="p-4 space-y-3.5 nu-fade-in">
        {/* ═══ Hero Banner ═══ */}
        <div
          className="relative overflow-hidden rounded-[var(--nu-radius-lg)] px-5 py-4 md:py-0 flex items-center justify-between gap-6 flex-wrap md:h-[112px]"
          style={{ background: "linear-gradient(120deg, #0f2447 0%, #14335f 45%, #0e5a73 100%)" }}
        >
          <div className="min-w-0">
            <h1 className="text-[26px] font-bold text-white leading-tight">Timesheets</h1>
            <p className="text-[13px] text-[#a9bfda] mt-1 max-w-2xl leading-snug hidden md:block">
              Import employee timesheets — automatically synced to Projects by PR Number.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap justify-end">
            {currentMonthData && (
              <>
                <InfoChip icon={<Users size={13} className="text-sky-300" />} label="Employees" value={summaryStats.totalEmployees} />
                <InfoChip
                  icon={<Clock size={13} className="text-emerald-300" />}
                  label="Total Hours"
                  value={summaryStats.totalHours.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                />
                <InfoChip icon={<CalendarDays size={13} className="text-amber-300" />} label="Working Days" value={summaryStats.totalWorkingDays} />
              </>
            )}

            <Button variant="primary" size="sm" icon={<Upload size={14} />} onClick={() => fileInputRef.current?.click()} className="ml-1">
              Upload Timesheet
            </Button>
          </div>
        </div>

        {/* ═══ KPI Strip ═══ */}
        {currentMonthData && (
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
                value={importType}
                onChange={(e) => setImportType(e.target.value as "monthly" | "weekly")}
                className={`${controlClass} px-2.5 shrink-0`}
                title="Import Type"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>

              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className={`${controlClass} px-2.5 shrink-0`}
                title="Period"
              >
                <option value="">Select Period</option>
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
                  Upload your first Excel timesheet to get started.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Upload size={14} />}
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4"
                >
                  Upload Timesheet
                </Button>
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
                    {formatMonthDisplay(selectedMonth)}
                  </p>
                  <p className="text-[11.5px] text-[var(--nu-text-muted)] mt-0.5">
                    {allEmployees.length} total employees ({currentPage * pageSize > allEmployees.length ? allEmployees.length : currentPage * pageSize} showing)
                  </p>
                </div>
                {currentMonthData && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={13} />}
                    onClick={() => handleDeleteMonth(selectedMonth)}
                    className="!text-[var(--nu-danger)] hover:!bg-[var(--nu-danger-soft)] shrink-0"
                  >
                    Delete Period
                  </Button>
                )}
              </div>

              <div className="max-h-[560px] overflow-auto nu-scrollbar">
                {allEmployees.length === 0 ? (
                  <EmptyState icon={<Users size={18} />} title="No matching employees" description="Try adjusting the project filter or search term." />
                ) : (
                  <table className="w-full border-collapse text-left">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-[var(--nu-surface-alt)] text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)] border-b border-[var(--nu-border)]">
                        <th className="px-4 py-2.5 font-medium">Employee No</th>
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
                          className={`border-b border-[var(--nu-border)] last:border-none hover:bg-[var(--nu-accent-soft)] transition-colors ${
                            index % 2 === 1 ? "bg-[var(--nu-surface-alt)]" : "bg-[var(--nu-surface)]"
                          }`}
                        >
                          <td className="px-4 py-3 text-[12.5px] font-semibold text-[var(--nu-text)]">{emp.employeeNo}</td>
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
                                title="Edit"
                                className="w-9 h-9 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center hover:shadow-[var(--nu-shadow-md)] hover:-translate-y-0.5 transition-all duration-150"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                title="Delete"
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

      {/* ═══ Import Modal ═══ */}
      {showImportModal && selectedFile && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] w-full max-w-md p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            {!importReport && !importError && (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center shrink-0">
                    {importing ? <Loader size={18} className="animate-spin" /> : <Upload size={18} />}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-[var(--nu-text)]">
                      {importing ? "Importing Timesheet…" : "Import Timesheet"}
                    </h2>
                    <p className="text-[12.5px] text-[var(--nu-text-secondary)] mt-1 truncate">
                      File: {selectedFile.name}
                    </p>
                  </div>
                </div>

                {importing && (
                  <div className="bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] p-3">
                    <div className="flex items-center gap-2 text-[12.5px] text-[var(--nu-text-secondary)]">
                      <Loader size={14} className="animate-spin" />
                      Processing timesheet entries...
                    </div>
                  </div>
                )}

                <p className="text-[12.5px] text-[var(--nu-text-secondary)]">
                  This timesheet will be validated for duplicates and synced to projects.
                </p>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--nu-border)]">
                  <Button variant="secondary" size="sm" onClick={closeImportModal} disabled={importing}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={importing}
                    onClick={handleExecuteImport}
                    icon={importing ? <Loader size={13} className="animate-spin" /> : undefined}
                  >
                    {importing ? "Importing..." : "Import"}
                  </Button>
                </div>
              </>
            )}

            {importError && (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] text-[var(--nu-danger)] flex items-center justify-center shrink-0">
                    <AlertTriangle size={18} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-[var(--nu-text)]">Import Failed</h2>
                    <p className="text-[12.5px] text-[var(--nu-danger)] mt-1 font-medium">{importError}</p>
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--nu-border)]">
                  <Button variant="secondary" size="sm" onClick={closeImportModal}>
                    Close
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => setImportError(null)}>
                    Try Again
                  </Button>
                </div>
              </>
            )}

            {importReport && (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-[var(--nu-radius-md)] bg-[var(--nu-success-soft)] text-[var(--nu-success)] flex items-center justify-center shrink-0">
                    <Check size={18} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-[var(--nu-text)]">Import Completed</h2>
                    <p className="text-[12.5px] text-[var(--nu-text-secondary)] mt-1">
                      {importReport.matchedRows} entries imported successfully.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-[var(--nu-surface-alt)] rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-[var(--nu-text-muted)]">Total Rows</p>
                      <p className="text-[13px] font-bold text-[var(--nu-text)]">{importReport.importedRows}</p>
                    </div>
                    <div className="bg-[var(--nu-surface-alt)] rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-[var(--nu-text-muted)]">Imported</p>
                      <p className="text-[13px] font-bold text-[var(--nu-success)]">{importReport.matchedRows}</p>
                    </div>
                    <div className="bg-[var(--nu-surface-alt)] rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-[var(--nu-text-muted)]">Ignored</p>
                      <p className="text-[13px] font-bold text-[var(--nu-text-secondary)]">{importReport.ignoredRows}</p>
                    </div>
                  </div>

                  {syncedProjects.length > 0 ? (
                    <div className="bg-[var(--nu-accent-soft)] border border-[var(--nu-accent)]/20 rounded-[var(--nu-radius-md)] p-3">
                      <p className="text-[10px] font-bold text-[var(--nu-accent)] uppercase tracking-wide mb-1.5">
                        Synced to Projects
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {syncedProjects.map((prNo) => (
                          <Badge key={prNo} tone="accent">
                            {prNo}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[var(--nu-warning-soft)] border border-[var(--nu-warning)]/20 rounded-[var(--nu-radius-md)] p-3">
                      <p className="text-[11.5px] font-bold text-[var(--nu-warning)] uppercase tracking-wide flex items-center gap-1.5">
                        <AlertTriangle size={13} />
                        No Projects Matched
                      </p>
                      <p className="text-[11.5px] text-[var(--nu-text-secondary)] mt-1">
                        Verify that the Project Code in your Excel matches the PR Number in the Projects list.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--nu-border)]">
                  <Button variant="primary" size="sm" onClick={closeImportModal}>
                    Done
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Timesheets;
