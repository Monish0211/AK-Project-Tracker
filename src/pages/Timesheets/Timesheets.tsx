import React, { useRef, useState } from "react";
import {
  Upload,
  Calendar,
  AlertTriangle,
  Check,
  FileText,
  Clock,
  Users,
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

// Local state for managing imported timesheets
// In production, this would be persisted to a database or localStorage
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

  // State
  const [allMonths, setAllMonths] = useState<TimesheetImportMonth[]>(
    timesheetStorage.getMonths()
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(
    allMonths[allMonths.length - 1]?.month || ""
  );
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const currentMonthData =
    selectedMonth && allMonths.find((m) => m.month === selectedMonth);
  const entries: TimesheetEntry[] = (currentMonthData && 'entries' in currentMonthData ? currentMonthData.entries : []);

  // Group entries by employee for table display
  const employeeGroups: Record<string, TimesheetEntry[]> = {};
  entries.forEach((entry: TimesheetEntry) => {
    if (!employeeGroups[entry.employeeNo]) {
      employeeGroups[entry.employeeNo] = [];
    }
    employeeGroups[entry.employeeNo].push(entry);
  });

  const employees = Object.entries(employeeGroups).map(([empNo, empEntries]) => {
    const first = empEntries[0];
    const totalHours = empEntries.reduce((sum, e) => sum + e.hours, 0);
    const workingDays = new Set(empEntries.map((e) => e.date)).size;
    return {
      employeeNo: empNo,
      employeeName: first.employeeName,
      projectCode: first.projectCode,
      projectName: first.projectName,
      designation: "", // Would come from Employee Master
      department: "", // Would come from Employee Master
      reportingManager: "", // Would come from Employee Master
      startDate: empEntries.map((e) => e.date).sort()[0],
      endDate: empEntries.map((e) => e.date).sort().reverse()[0],
      workingDays,
      totalHours,
      manHourExpenses: 0, // Would come from Employee Master
      employeeCost: 0, // Would be calculated
      status: first.status || "Active",
    };
  });

  // Handlers
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

  const closeImportModal = () => {
    setShowImportModal(false);
    setSelectedFile(null);
    setImportReport(null);
    setImportError(null);
  };

  const handleExecuteImport = async () => {
    if (!selectedFile) return;
    setImporting(true);
    setImportReport(null);
    setImportError(null);

    try {
      // Parse workbook
      const workbook = await parseWorkbook(selectedFile);
      const detectedSheets = workbook.SheetNames;

      // Find worksheet with timesheet data
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
          "Could not find a worksheet containing timesheet data. Required columns: Employee No, Employee Name, Project Code, Date, Hours"
        );
      }

      // Validate headers
      const normalizedHeaders = normalizeHeaders(headerRow);
      const { indices, missing } = validateHeaders(normalizedHeaders);

      if (missing.length > 0) {
        throw new Error(
          `Missing required columns: ${missing.join(", ")}`
        );
      }

      // Extract entries
      const allEntries = extractTimesheetEntries(
        dataRows.filter((row) => row.some((cell) => cell !== "" && cell !== null && cell !== undefined)),
        indices as Record<string, number>
      );

      if (allEntries.length === 0) {
        throw new Error("No valid timesheet entries found in the Excel file.");
      }

      // Create month import
      const newMonth = createImportMonth(allEntries, "Admin"); // Would be current user
      const updatedMonths = allMonths.filter((m) => m.month !== newMonth.month);
      updatedMonths.push(newMonth);
      updatedMonths.sort((a, b) => a.month.localeCompare(b.month));

      // Save and update state
      timesheetStorage.save(updatedMonths);
      setAllMonths(updatedMonths);
      setSelectedMonth(newMonth.month);

      // AUTO-SYNC: Sync to all projects
      try {
        const allProjects = getProjects();
        const syncedProjects = syncTimesheetToProjects(allProjects, newMonth);

        // Update all affected projects
        syncedProjects.forEach((project) => {
          updateProject(project);
        });
      } catch (syncErr) {
        // Log sync errors but don't fail the import
        console.warn("Timesheet sync warning:", syncErr);
      }

      // Show success
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
      const message = err instanceof Error ? err.message : "Failed to import timesheet";
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
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Timesheets</h1>
          <p className="text-sm text-slate-500 mt-1">
            Import and manage employee timesheets. Data is automatically synchronized to projects.
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
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition shrink-0"
        >
          <Upload size={16} />
          Import Timesheet
        </button>
      </div>

      {/* Month Selector */}
      {allMonths.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={18} className="text-blue-600" />
            <h3 className="text-lg font-bold text-slate-800">Select Month</h3>
          </div>

          <div className="flex flex-wrap gap-2">
            {allMonths.map((month) => (
              <button
                key={month.month}
                onClick={() => setSelectedMonth(month.month)}
                className={`px-4 py-2.5 rounded-xl font-medium text-sm transition ${
                  selectedMonth === month.month
                    ? "bg-blue-100 text-blue-700 border-2 border-blue-600"
                    : "bg-slate-100 text-slate-700 border-2 border-gray-200 hover:bg-slate-200"
                }`}
              >
                {formatMonthDisplay(month.month)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Statistics Cards */}
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
              {currentMonthData.summary?.totalEmployees || 0}
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
              {(currentMonthData.summary?.totalHours || 0).toLocaleString("en-IN", {
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
              {currentMonthData.summary?.totalWorkingDays || 0}
            </p>
          </div>
        </div>
      )}

      {/* Timesheets Table */}
      {allMonths.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 shadow-sm text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-800 mb-2">No Timesheets Imported</h3>
          <p className="text-sm text-gray-500 mb-6">
            Import your first Excel timesheet to get started. The system will automatically sync
            employees to their projects.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition"
          >
            <Upload size={16} />
            Import Timesheet
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                {formatMonthDisplay(selectedMonth)}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {employees.length} unique employees with daily timesheet entries
              </p>
            </div>
            {currentMonthData && (
              <button
                type="button"
                onClick={() => handleDeleteMonth(selectedMonth)}
                className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition font-medium"
              >
                Delete Month
              </button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-sm text-slate-700">
              <thead className="bg-slate-100 text-slate-650 font-semibold uppercase text-xs tracking-wider border-b">
                <tr>
                  <th className="px-4 py-3">Employee No</th>
                  <th className="px-4 py-3">Employee Name</th>
                  <th className="px-4 py-3">Project Code</th>
                  <th className="px-4 py-3">Project Name</th>
                  <th className="px-4 py-3 w-32">Start Date</th>
                  <th className="px-4 py-3 w-32">End Date</th>
                  <th className="px-4 py-3 text-center w-24">Working Days</th>
                  <th className="px-4 py-3 text-right w-24">Total Hours</th>
                  <th className="px-4 py-3 text-center w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-gray-500 font-medium">
                      No timesheet entries for this month
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
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
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            emp.status === "Active"
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {emp.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && selectedFile && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            {!importReport && !importError && (
              <>
                <div className="flex items-start gap-3">
                  <div className="mt-1 shrink-0 p-2 rounded-xl bg-blue-50 text-blue-600">
                    <Upload size={24} />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-800">Import Timesheet</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      File: {selectedFile.name}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-slate-600">
                  This timesheet will be processed and automatically synced to projects matching their Project Codes.
                </p>

                <div className="flex justify-end gap-3 pt-3 border-t">
                  <button
                    type="button"
                    onClick={closeImportModal}
                    className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-sm font-semibold transition"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    disabled={importing}
                    onClick={handleExecuteImport}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition disabled:opacity-50"
                  >
                    {importing ? "Importing..." : "Import Timesheet"}
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
                      {importReport.matchedRows} timesheet entries imported successfully.
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
