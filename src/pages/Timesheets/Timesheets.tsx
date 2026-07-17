import React, { useRef, useState, useMemo, useCallback } from "react";
import {
  Upload,
  Calendar,
  AlertTriangle,
  Check,
  FileText,
  Clock,
  Users,
  Search,
  Edit2,
  Trash2,
  Loader,
} from "lucide-react";
import type { TimesheetImportMonth, TimesheetEntry } from "../../types/Timesheet";
import {
  extractTimesheetEntries,
  createImportMonth,
  formatDisplayDate,
  formatMonthDisplay,
} from "../../services/timesheetService";
import {
  parseWorkbook,
  findHeaderRow,
  normalizeHeaders,
  validateHeaders,
  sheetToRows,
  type ImportReport,
} from "../../services/timesheetImportService";
import { syncTimesheetToProjects } from "../../services/timesheetSyncService";
import { getProjects, updateProject } from "../../services/projectService";

const timesheetStorage = {
  getMonths: (): TimesheetImportMonth[] => {
    try {
      const data = localStorage.getItem("timesheets_imports");
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  save: (months: TimesheetImportMonth[]): void => {
    localStorage.setItem("timesheets_imports", JSON.stringify(months));
  },
};

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

      try {
        const allProjects = getProjects();
        const syncedProjects = syncTimesheetToProjects(allProjects, newMonth);
        syncedProjects.forEach((project) => updateProject(project));
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
    <div className="space-y-4 pb-8">
      {/* Header - Hero Banner (matching Projects design) */}
      <style>{`
        .timesheet-hero {
          border-radius: 14px;
          overflow: hidden;
          position: relative;
          background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #0E7490 100%);
        }
        .timesheet-hero::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255,255,255,.032) 1px, transparent 1px);
          background-size: 22px 22px;
          pointer-events: none;
        }
        .timesheet-hero::after {
          content: '';
          position: absolute;
          left: -80px;
          top: -80px;
          width: 280px;
          height: 280px;
          background: radial-gradient(circle, rgba(59,130,246,.14) 0%, transparent 68%);
          pointer-events: none;
        }
        .timesheet-hero-inner {
          position: relative;
          z-index: 1;
          padding: 24px 28px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }
      `}</style>

      <div className="timesheet-hero shadow-lg">
        <div className="timesheet-hero-inner">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-extrabold text-white tracking-tight leading-none">
              Timesheets
            </h1>
            <p className="text-slate-300/80 text-sm mt-2 max-w-lg leading-relaxed">
              Import and manage employee timesheets. Automatically synced to projects.
            </p>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition shrink-0 shadow-lg hover:-translate-y-px duration-150 transform"
          >
            <Upload size={16} />
            Upload Timesheet
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      {allMonths.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Import Type */}
            <div className="flex-shrink-0">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Import Type
              </label>
              <select
                value={importType}
                onChange={(e) => setImportType(e.target.value as "monthly" | "weekly")}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            {/* Month Selector */}
            <div className="flex-shrink-0">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Period
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
              >
                <option value="">Select Period</option>
                {allMonths.map((month) => (
                  <option key={month.month} value={month.month}>
                    {formatMonthDisplay(month.month)}
                  </option>
                ))}
              </select>
            </div>

            {/* Project Filter */}
            <div className="flex-shrink-0">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
              >
                <option value="all">All Projects</option>
                {uniqueProjects.map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            </div>

            {/* Employee Search */}
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Search Employee
              </label>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="By name or ID..."
                  value={searchEmployee}
                  onChange={(e) => setSearchEmployee(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {currentMonthData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Users size={18} strokeWidth={2.25} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Employees
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-800">
              {summaryStats.totalEmployees}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
              <Clock size={18} strokeWidth={2.25} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Hours
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-800">
              {summaryStats.totalHours.toLocaleString("en-IN", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 2,
              })}
              {" hrs"}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <FileText size={18} strokeWidth={2.25} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Working Days
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-800">
              {summaryStats.totalWorkingDays}
            </p>
          </div>
        </div>
      )}

      {/* Employee Table */}
      {allMonths.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 shadow-sm text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-800 mb-2">No Timesheets Imported</h3>
          <p className="text-sm text-gray-500 mb-6">
            Upload your first Excel timesheet to get started.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition"
          >
            <Upload size={16} />
            Upload Timesheet
          </button>
        </div>
      ) : !selectedMonth ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 shadow-sm text-center">
          <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-800 mb-2">Select a Period</h3>
          <p className="text-sm text-gray-500">Choose a month or week to view employee data.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="border-b px-6 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {formatMonthDisplay(selectedMonth)}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {allEmployees.length} total employees ({currentPage * pageSize > allEmployees.length ? allEmployees.length : currentPage * pageSize} showing)
              </p>
            </div>
            {currentMonthData && (
              <button
                type="button"
                onClick={() => handleDeleteMonth(selectedMonth)}
                className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition font-medium"
              >
                Delete
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-slate-700">
              <thead className="bg-slate-100 text-slate-650 font-semibold uppercase text-xs tracking-wider border-b">
                <tr>
                  <th className="px-4 py-3">Employee No</th>
                  <th className="px-4 py-3">Employee Name</th>
                  <th className="px-4 py-3">Project Code</th>
                  <th className="px-4 py-3">Project Name</th>
                  <th className="px-4 py-3 w-28">Start Date</th>
                  <th className="px-4 py-3 w-28">End Date</th>
                  <th className="px-4 py-3 text-center w-24">Working Days</th>
                  <th className="px-4 py-3 text-right w-24">Total Hours</th>
                  <th className="px-4 py-3 text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-gray-500 font-medium">
                      No matching employees
                    </td>
                  </tr>
                ) : (
                  paginatedEmployees.map((emp) => (
                    <tr
                      key={`${emp.employeeNo}-${emp.projectCode}`}
                      className="border-b last:border-0 hover:bg-slate-50 transition"
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900">{emp.employeeNo}</td>
                      <td className="px-4 py-3">{emp.employeeName}</td>
                      <td className="px-4 py-3 font-medium text-blue-600">{emp.projectCode}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.projectName}</td>
                      <td className="px-4 py-3">{formatDisplayDate(emp.startDate)}</td>
                      <td className="px-4 py-3">{formatDisplayDate(emp.endDate)}</td>
                      <td className="px-4 py-3 text-center">{emp.workingDays} days</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {emp.totalHours.toLocaleString("en-IN", {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 2,
                        })}{" "}
                        hrs
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            type="button"
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            type="button"
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {allEmployees.length > pageSize && (
            <div className="border-t px-6 py-4 flex items-center justify-between bg-slate-50">
              <div className="text-sm text-slate-600">
                Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({allEmployees.length} total)
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-white transition disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && selectedFile && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3 max-h-[85vh] overflow-y-auto">
            {!importReport && !importError && (
              <>
                <div className="flex items-start gap-3">
                  <div className="mt-1 shrink-0 p-2 rounded-xl bg-blue-50 text-blue-600">
                    {importing ? (
                      <Loader size={24} className="animate-spin" />
                    ) : (
                      <Upload size={24} />
                    )}
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-800">
                      {importing ? "Importing Timesheet..." : "Import Timesheet"}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      File: {selectedFile.name}
                    </p>
                  </div>
                </div>

                {importing && (
                  <div className="bg-slate-50 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <Loader size={16} className="animate-spin" />
                      Processing timesheet entries...
                    </div>
                  </div>
                )}

                <p className="text-sm text-slate-600">
                  This timesheet will be validated for duplicates and synced to projects.
                </p>

                <div className="flex justify-end gap-3 pt-3 border-t">
                  <button
                    type="button"
                    onClick={closeImportModal}
                    disabled={importing}
                    className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-sm font-semibold transition disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={importing}
                    onClick={handleExecuteImport}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {importing && <Loader size={14} className="animate-spin" />}
                    {importing ? "Importing..." : "Import"}
                  </button>
                </div>
              </>
            )}

            {importError && (
              <>
                <div className="flex items-start gap-3">
                  <div className="mt-1 shrink-0 p-2 rounded-xl bg-red-50 text-red-600">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-800">Import Failed</h4>
                    <p className="text-xs text-red-600 mt-1 font-medium">{importError}</p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t">
                  <button
                    type="button"
                    onClick={closeImportModal}
                    className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-sm font-semibold transition"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportError(null)}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition"
                  >
                    Try Again
                  </button>
                </div>
              </>
            )}

            {importReport && (
              <>
                <div className="flex items-start gap-3">
                  <div className="mt-1 shrink-0 p-2 rounded-xl bg-green-50 text-green-600">
                    <Check size={24} />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-800">Import Completed</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      {importReport.matchedRows} entries imported successfully.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white rounded-lg border border-slate-200 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Total Rows</p>
                      <p className="text-sm font-bold text-slate-800">{importReport.importedRows}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Imported</p>
                      <p className="text-sm font-bold text-green-700">{importReport.matchedRows}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-slate-200 p-2 text-center">
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">Ignored</p>
                      <p className="text-sm font-bold text-slate-500">{importReport.ignoredRows}</p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t">
                  <button
                    type="button"
                    onClick={closeImportModal}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition"
                  >
                    Done
                  </button>
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
