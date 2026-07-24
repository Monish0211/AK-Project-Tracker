import React, { useRef, useState } from "react";
import {
  Users,
  Clock,
  Plus,
  Upload,
  Trash2,
  Check,
  AlertTriangle,
  User,
  X,
  Pencil,
  IndianRupee,
} from "lucide-react";

import type { Project, ProjectResource } from "../../../types/Project";
import { getEmployees } from "../../../services/employeeService";
import {
  importTimesheet,
  calculateWorkingDays,
  TimesheetImportError,
  type ImportReport,
} from "../../../services/timesheetImportService";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";


interface Props {
  project: Project;
  onChange: (updatedProject: Project) => void;
}

interface AutocompleteInputProps {
  value: string;
  onChange: (val: string) => void;
  suggestionsList: string[];
  placeholder: string;
  required?: boolean;
}

const AutocompleteInput = ({
  value,
  onChange,
  suggestionsList,
  placeholder,
  required,
}: AutocompleteInputProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getFilteredSuggestions = (val: string) => {
    if (!val.trim()) {
      return suggestionsList;
    }
    return suggestionsList.filter((name) =>
      name.toLowerCase().includes(val.toLowerCase())
    );
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    const filtered = getFilteredSuggestions(val);
    setSuggestions(filtered);
    setIsOpen(true);
  };

  const handleFocus = () => {
    const filtered = getFilteredSuggestions(value);
    setSuggestions(filtered);
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <Input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
      />
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                onChange(name);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors duration-100"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default function TeamAssignedCard({ project, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterEmployees = getEmployees();

  const employeeNames = Array.from(
    new Set(
      masterEmployees
        .map((emp) => emp.employeeName?.trim())
        .filter((name): name is string => typeof name === "string" && name !== "")
    )
  ).sort((a, b) => a.localeCompare(b));

  const reportingManagers = React.useMemo(() => {
    return Array.from(
      new Set(
        masterEmployees
          .map((emp) => emp.reportingManager?.trim())
          .filter((name): name is string => typeof name === "string" && name !== "")
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [masterEmployees]);


  // Dialog State
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace" | "skip">("merge");
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState<{ message: string; report: ImportReport } | null>(null);

  // Manual Add Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedEmpNo, setSelectedEmpNo] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [totalHours, setTotalHours] = useState("");
  const [status, setStatus] = useState<ProjectResource["status"]>("Active");
  const [addError, setAddError] = useState("");

  // Inline Editing State
  const [editingResourceId, setEditingResourceId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Omit<ProjectResource, "id"> | null>(null);

  // PROJECT LEADERSHIP HANDLERS
  const handleLeadershipChange = (field: keyof Project, value: string) => {
    onChange({
      ...project,
      [field]: value,
    });
  };

  // UPLOAD TIMESHEET HANDLERS
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportReport(null);
      setImportError(null);
      setShowImportModal(true);
    }
    e.target.value = ""; // Reset file input
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
      const result = await importTimesheet(
        selectedFile,
        project.prNo,
        importMode,
        project.resources
      );

      const todayStr = new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      onChange({
        ...project,
        resources: result.resources,
        lastImportedDate: todayStr,
        lastImportedBy: "Monish", // Default active operator from spec example
        lastImportedRowsCount: result.report.matchedRows,
      });

      setImportReport(result.report);
    } catch (err) {
      if (err instanceof TimesheetImportError) {
        setImportError({ message: err.message, report: err.report });
      } else {
        const msg = err instanceof Error ? err.message : "Failed to import Timesheet file.";
        setImportError({
          message: msg,
          report: {
            workbookName: selectedFile.name,
            detectedSheets: [],
            selectedSheet: "",
            headerRowNumber: 0,
            detectedHeaders: [],
            missingHeaders: [],
            importedRows: 0,
            matchedRows: 0,
            ignoredRows: 0,
          },
        });
      }
    } finally {
      setImporting(false);
    }
  };

  // MANUAL ADD TEAM MEMBER
  const handleAddMember = () => {
    if (!selectedEmpNo) {
      setAddError("Please select an employee.");
      return;
    }
    if (!startDate || !endDate) {
      setAddError("Start and End dates are required.");
      return;
    }
    const emp = masterEmployees.find((e) => e.employeeNo === selectedEmpNo);
    if (!emp) {
      setAddError("Selected employee not found.");
      return;
    }

    const workingDays = calculateWorkingDays(startDate, endDate);
    const hoursNum = Number(totalHours) || 0;

    const newResource: ProjectResource = {
      id: crypto.randomUUID(),
      employeeNo: emp.employeeNo,
      employeeName: emp.employeeName,
      department: emp.department,
      designation: emp.designation,
      reportingManager: emp.reportingManager,
      startDate,
      endDate,
      workingDays,
      totalHours: hoursNum,
      status,
      location: emp.location,
    };

    // Check duplicate
    const exists = project.resources.some(
      (r) => r.employeeNo.trim().toLowerCase() === emp.employeeNo.trim().toLowerCase()
    );
    if (exists) {
      setAddError("This team member is already assigned to the project.");
      return;
    }

    onChange({
      ...project,
      resources: [...project.resources, newResource],
    });

    // Reset State
    setShowAddModal(false);
    setSelectedEmpNo("");
    setStartDate("");
    setEndDate("");
    setTotalHours("");
    setStatus("Active");
    setAddError("");
  };

  // DELETE TEAM MEMBER
  const handleDeleteMember = (id: string) => {
    if (window.confirm("Are you sure you want to remove this team member from the project?")) {
      const filtered = project.resources.filter((r) => r.id !== id);
      onChange({
        ...project,
        resources: filtered,
      });
    }
  };

  // INLINE EDIT RESOURCE ROW
  const startInlineEdit = (res: ProjectResource) => {
    setEditingResourceId(res.id);
    setEditForm({
      employeeNo: res.employeeNo,
      employeeName: res.employeeName,
      reportingManager: res.reportingManager,
      department: res.department,
      designation: res.designation,
      startDate: res.startDate,
      endDate: res.endDate,
      workingDays: res.workingDays,
      totalHours: res.totalHours,
      status: res.status,
    });
  };

  const handleInlineSave = (id: string) => {
    if (!editForm) return;

    // Recalculate working days on save if dates changed
    const workingDays = calculateWorkingDays(editForm.startDate, editForm.endDate);

    const updatedResources = project.resources.map((r) =>
      r.id === id ? { ...r, ...editForm, workingDays } : r
    );

    onChange({
      ...project,
      resources: updatedResources,
    });
    setEditingResourceId(null);
    setEditForm(null);
  };

  // KPI calculations
  const uniqueEmployeesCount = new Set(project.resources.map(r => r.employeeNo.trim().toLowerCase())).size;
  const totalHoursSum = project.resources.reduce((sum, r) => sum + (r.totalHours || 0), 0);
  const totalManpowerBudget = project.resources.reduce((sum, r) => {
    const emp = masterEmployees.find(e => e.employeeNo.trim().toLowerCase() === r.employeeNo.trim().toLowerCase());
    const rate = emp ? (emp.manhourExpenses || 0) : 0;
    return sum + (r.totalHours || 0) * rate;
  }, 0);

  return (
    <div className="space-y-6">
      {/* ================= SECTION 1: PROJECT LEADERSHIP ================= */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm space-y-4">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 border-b border-[var(--nu-border)] pb-3 flex items-center gap-2">
          <User size={20} className="text-blue-500 dark:text-blue-400" />
          Project Leadership
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Primary Project Manager */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Primary Project Manager <span className="text-red-500">*</span>
            </label>
            <AutocompleteInput
              value={project.primaryProjectManager}
              onChange={(val) => handleLeadershipChange("primaryProjectManager", val)}
              suggestionsList={reportingManagers}
              placeholder="Search or enter Primary Project Manager"
              required
            />
          </div>

          {/* Secondary Project Manager */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Secondary Project Manager
            </label>
            <AutocompleteInput
              value={project.secondaryProjectManager}
              onChange={(val) => handleLeadershipChange("secondaryProjectManager", val)}
              suggestionsList={reportingManagers}
              placeholder="Search or enter Secondary Project Manager"
            />
          </div>

          {/* Project Coordinator */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Project Coordinator
            </label>
            <AutocompleteInput
              value={project.projectCoordinator}
              onChange={(val) => handleLeadershipChange("projectCoordinator", val)}
              suggestionsList={employeeNames}
              placeholder="Search or enter Coordinator"
            />
          </div>

          {/* Project Engineer */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Project Engineer
            </label>
            <AutocompleteInput
              value={project.projectEngineer}
              onChange={(val) => handleLeadershipChange("projectEngineer", val)}
              suggestionsList={employeeNames}
              placeholder="Search or enter Project Engineer"
            />
          </div>

          {/* Client Coordinator */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Client Coordinator
            </label>
            <input
              type="text"
              value={project.clientCoordinator || ""}
              onChange={(e) => handleLeadershipChange("clientCoordinator", e.target.value)}
              placeholder="Enter Client Coordinator Name"
              className="w-full border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* ================= SECTION 2: SUMMARY CARDS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Team Members */}
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl p-5 border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
              <Users size={18} strokeWidth={2.25} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Team Members
            </p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100">{uniqueEmployeesCount}</p>
        </div>

        {/* Total Hours Budget */}
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl p-5 border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 dark:bg-emerald-900/40 text-green-600 dark:text-emerald-400">
              <Clock size={18} strokeWidth={2.25} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Hours Budget
            </p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {totalHoursSum.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Hrs
          </p>
        </div>

        {/* Total Project Budget */}
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl p-5 border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400">
              <IndianRupee size={18} strokeWidth={2.25} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Project Budget
            </p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
            ₹{(project.workOrderValueINR || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </p>
        </div>

        {/* Total Manpower Budget */}
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl p-5 border border-gray-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 dark:bg-amber-900/40 text-orange-600 dark:text-amber-400">
              <IndianRupee size={18} strokeWidth={2.25} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Total Manpower Budget
            </p>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
            ₹{totalManpowerBudget.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* ================= SECTION 3: ACTIONS AND TEAM TABLE ================= */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl p-6 border border-gray-100 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--nu-border)] pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Team Members</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Assigned project engineers, designers and inspectors.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-blue-600 text-blue-600 hover:bg-blue-50 font-medium text-sm transition"
            >
              <Upload size={16} />
              Import Timesheet
            </button>

            <Button
              type="button"
              variant="primary"
              onClick={() => setShowAddModal(true)}
              className="gap-2 px-4 py-2.5 text-sm"
            >
              <Plus size={16} />
              Add Team Member
            </Button>
          </div>
        </div>

        {/* History Tracker */}
        {(project.lastImportedDate || project.lastImportedBy) && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap gap-x-8 gap-y-2 text-xs text-slate-500 font-medium">
            <div>
              <span className="text-slate-400">Last Imported:</span>{" "}
              <span className="text-slate-700">{project.lastImportedDate || "—"}</span>
            </div>
            <div>
              <span className="text-slate-400">Imported By:</span>{" "}
              <span className="text-slate-700">{project.lastImportedBy || "—"}</span>
            </div>
            <div>
              <span className="text-slate-400">Rows Processed:</span>{" "}
              <span className="text-slate-700 font-semibold">{project.lastImportedRowsCount || 0}</span>
            </div>
          </div>
        )}

        {/* Table layout */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left text-sm text-slate-700">
            <thead className="bg-slate-100 text-slate-650 font-semibold uppercase text-xs tracking-wider border-b">
              <tr>
                <th className="px-4 py-3">Employee No</th>
                <th className="px-4 py-3">Employee Name</th>
                <th className="px-4 py-3">Designation</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Reporting Manager</th>
                <th className="px-4 py-3 w-32">Start Date</th>
                <th className="px-4 py-3 w-32">End Date</th>
                <th className="px-4 py-3 text-center w-28">Working Days</th>
                <th className="px-4 py-3 text-right w-28">Total Hours</th>
                <th className="px-4 py-3 text-right w-32">Man-hour Expenses</th>
                <th className="px-4 py-3 text-right w-36">Employee Cost</th>
                <th className="px-4 py-3 text-center w-28">Status</th>
                <th className="px-4 py-3 text-center w-24">Action</th>
              </tr>
            </thead>
            <tbody>
              {project.resources.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-10 text-center text-gray-500 font-medium">
                    No Team Members Assigned. Import a Timesheet or Add manually.
                  </td>
                </tr>
              ) : (
                project.resources.map((res) => {
                  const isEditing = editingResourceId === res.id;
                  const empMaster = masterEmployees.find(
                    (e) => e.employeeNo.trim().toLowerCase() === res.employeeNo.trim().toLowerCase()
                  );
                  const rate = empMaster ? (empMaster.manhourExpenses || 0) : 0;
                  const cost = (res.totalHours || 0) * rate;

                  return (
                    <tr key={res.id} className="border-b last:border-0 hover:bg-slate-50 transition">
                      {/* Emp No */}
                      <td className="px-4 py-3 font-semibold text-slate-900">{res.employeeNo}</td>

                      {/* Emp Name */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm?.employeeName}
                            onChange={(e) => setEditForm({ ...editForm!, employeeName: e.target.value })}
                            className="border rounded p-1 w-full text-xs"
                          />
                        ) : (
                          res.employeeName
                        )}
                      </td>

                      {/* Designation */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm?.designation}
                            onChange={(e) => setEditForm({ ...editForm!, designation: e.target.value })}
                            className="border rounded p-1 w-full text-xs"
                          />
                        ) : (
                          res.designation
                        )}
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm?.department}
                            onChange={(e) => setEditForm({ ...editForm!, department: e.target.value })}
                            className="border rounded p-1 w-full text-xs"
                          />
                        ) : (
                          res.department
                        )}
                      </td>

                      {/* Manager */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm?.reportingManager}
                            onChange={(e) => setEditForm({ ...editForm!, reportingManager: e.target.value })}
                            className="border rounded p-1 w-full text-xs"
                          />
                        ) : (
                          res.reportingManager || "—"
                        )}
                      </td>

                      {/* Start Date */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editForm?.startDate}
                            onChange={(e) => setEditForm({ ...editForm!, startDate: e.target.value })}
                            className="border rounded p-1 w-full text-xs"
                          />
                        ) : (
                          res.startDate || "—"
                        )}
                      </td>

                      {/* End Date */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editForm?.endDate}
                            onChange={(e) => setEditForm({ ...editForm!, endDate: e.target.value })}
                            className="border rounded p-1 w-full text-xs"
                          />
                        ) : (
                          res.endDate || "—"
                        )}
                      </td>

                      {/* Working Days */}
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <span className="text-slate-400">
                            {calculateWorkingDays(editForm!.startDate, editForm!.endDate)} Days
                          </span>
                        ) : (
                          `${res.workingDays || 0} Days`
                        )}
                      </td>

                      {/* Total Hours */}
                      <td className="px-4 py-3 text-right font-medium">
                        {isEditing ? (
                          <input
                            type="number"
                            value={editForm?.totalHours}
                            onChange={(e) => setEditForm({ ...editForm!, totalHours: Number(e.target.value) || 0 })}
                            className="border rounded p-1 w-20 text-xs text-right"
                          />
                        ) : (
                          `${(res.totalHours || 0).toLocaleString("en-IN")} Hrs`
                        )}
                      </td>

                      {/* Man-hour Expenses */}
                      <td className="px-4 py-3 text-right font-medium">
                        ₹{rate.toLocaleString("en-IN")}
                      </td>

                      {/* Employee Cost */}
                      <td className="px-4 py-3 text-right font-semibold text-slate-800">
                        ₹{cost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <select
                            value={editForm?.status}
                            onChange={(e) => setEditForm({ ...editForm!, status: e.target.value as any })}
                            className="border rounded p-1 text-xs"
                          >
                            <option value="Active">Active</option>
                            <option value="Released">Released</option>
                          </select>
                        ) : (
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                              res.status === "Active"
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {res.status}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleInlineSave(res.id)}
                                className="w-8 h-8 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 flex items-center justify-center transition"
                                title="Save"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingResourceId(null);
                                  setEditForm(null);
                                }}
                                className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition"
                                title="Cancel"
                              >
                                <X size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startInlineEdit(res)}
                                className="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center transition"
                                title="Edit"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMember(res.id)}
                                className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition"
                                title="Remove"
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= MODAL: TIMESHEET IMPORT ================= */}
      {showImportModal && selectedFile && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            {!importReport && !importError && (
              <>
                <div className="flex items-start gap-3">
                  <div className="mt-1 shrink-0 p-2 rounded-xl bg-orange-50 text-orange-600">
                    <AlertTriangle size={24} />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-800">Duplicate Resource Strategy</h4>
                    <p className="text-xs text-gray-500 mt-1">
                      How should the system resolve employees that already exist in this project team?
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-slate-50 cursor-pointer transition">
                    <input
                      type="radio"
                      name="importMode"
                      value="merge"
                      checked={importMode === "merge"}
                      onChange={() => setImportMode("merge")}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <div>
                      <span className="block text-sm font-semibold text-slate-850">Merge (Default)</span>
                      <span className="block text-xs text-slate-400 mt-0.5">
                        Accumulate working days/hours and expand working dates.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-slate-50 cursor-pointer transition">
                    <input
                      type="radio"
                      name="importMode"
                      value="replace"
                      checked={importMode === "replace"}
                      onChange={() => setImportMode("replace")}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <div>
                      <span className="block text-sm font-semibold text-slate-850">Replace Existing</span>
                      <span className="block text-xs text-slate-400 mt-0.5">
                        Overwrite matching employees completely with new data.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-slate-50 cursor-pointer transition">
                    <input
                      type="radio"
                      name="importMode"
                      value="skip"
                      checked={importMode === "skip"}
                      onChange={() => setImportMode("skip")}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <div>
                      <span className="block text-sm font-semibold text-slate-850">Skip Existing</span>
                      <span className="block text-xs text-slate-400 mt-0.5">
                        Keep current data and skip matched employees.
                      </span>
                    </div>
                  </label>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t">
                  <button
                    type="button"
                    onClick={closeImportModal}
                    className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-sm font-semibold transition"
                  >
                    Cancel
                  </button>

                  <Button
                    type="button"
                    variant="primary"
                    disabled={importing}
                    onClick={handleExecuteImport}
                    className="px-5 py-2 text-sm disabled:opacity-50"
                  >
                    {importing ? "Importing..." : "Execute Import"}
                  </Button>
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
                    <p className="text-xs text-red-600 mt-1 font-medium">{importError.message}</p>
                  </div>
                </div>

                <ImportDiagnostics report={importError.report} />

                <div className="flex justify-end gap-3 pt-3 border-t">
                  <button
                    type="button"
                    onClick={closeImportModal}
                    className="px-4 py-2 border rounded-xl hover:bg-gray-50 text-sm font-semibold transition"
                  >
                    Close
                  </button>
                  <Button
                    type="button"
                    variant="primary"
                    onClick={() => setImportError(null)}
                    className="px-5 py-2 text-sm"
                  >
                    Try Again
                  </Button>
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
                      {importReport.matchedRows} row(s) matched and imported using the "{importMode}" strategy.
                    </p>
                  </div>
                </div>

                <ImportDiagnostics report={importReport} />

                <div className="flex justify-end gap-3 pt-3 border-t">
                  <Button
                    type="button"
                    variant="primary"
                    onClick={closeImportModal}
                    className="px-5 py-2 text-sm"
                  >
                    Done
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD RESOURCE MANUALLY ================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex justify-between items-center border-b p-6 shrink-0">
              <div>
                <h4 className="text-xl font-bold text-slate-800">Add Team Member</h4>
                <p className="text-xs text-gray-500 mt-0.5">Assign resource from the Employee Master.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowAddModal(false)}
              >
                <X size={20} />
              </Button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm text-slate-700">
              {/* Employee Master dropdown */}
              <div>
                <label className="block font-medium mb-1.5">Select Employee</label>
                <select
                  value={selectedEmpNo}
                  onChange={(e) => {
                    setSelectedEmpNo(e.target.value);
                    setAddError("");
                  }}
                  className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Choose Employee</option>
                  {masterEmployees.map((e) => (
                    <option key={e.id} value={e.employeeNo}>
                      {e.employeeNo} — {e.employeeName} ({e.designation})
                    </option>
                  ))}
                </select>
              </div>

              {/* Start/End Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setAddError("");
                    }}
                    className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setAddError("");
                    }}
                    className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Hours Worked */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-1.5">Total Hours</label>
                  <input
                    type="number"
                    value={totalHours}
                    onChange={(e) => {
                      setTotalHours(e.target.value);
                      setAddError("");
                    }}
                    placeholder="Enter total hours"
                    className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1.5">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full border rounded-xl p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="Active">Active</option>
                    <option value="Released">Released</option>
                  </select>
                </div>
              </div>

              {addError && (
                <div className="p-3 bg-red-50 text-red-650 text-xs font-semibold rounded-xl flex items-center gap-2 border border-red-205">
                  <AlertTriangle size={15} />
                  {addError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 border-t p-6 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setAddError("");
                }}
                className="px-4 py-2 border rounded-xl hover:bg-gray-150 transition font-semibold"
              >
                Cancel
              </button>
              <Button
                type="button"
                variant="primary"
                onClick={handleAddMember}
                className="px-5 py-2 font-semibold"
              >
                Add Resource
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function ImportDiagnostics({ report }: { report: ImportReport }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-2">
      <DiagnosticRow label="Workbook" value={report.workbookName || "—"} />
      <DiagnosticRow
        label="Detected Sheets"
        value={report.detectedSheets.length ? report.detectedSheets.join(", ") : "—"}
      />
      <DiagnosticRow label="Selected Sheet" value={report.selectedSheet || "—"} />
      <DiagnosticRow label="Header Row" value={report.headerRowNumber ? String(report.headerRowNumber) : "—"} />
      <DiagnosticRow
        label="Detected Headers"
        value={report.detectedHeaders.length ? report.detectedHeaders.join(", ") : "—"}
      />
      {report.missingHeaders.length > 0 && (
        <DiagnosticRow
          label="Missing Headers"
          value={report.missingHeaders.join(", ")}
          valueClassName="text-red-600 font-semibold"
        />
      )}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="bg-white rounded-lg border border-slate-200 p-2 text-center">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Imported</p>
          <p className="text-sm font-bold text-slate-800">{report.importedRows}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-2 text-center">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Matched</p>
          <p className="text-sm font-bold text-green-700">{report.matchedRows}</p>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-2 text-center">
          <p className="text-[10px] uppercase tracking-wide text-slate-400">Ignored</p>
          <p className="text-sm font-bold text-slate-500">{report.ignoredRows}</p>
        </div>
      </div>
    </div>
  );
}

function DiagnosticRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 w-32 text-slate-400 font-medium">{label}</span>
      <span className={`break-words ${valueClassName || "text-slate-700"}`}>{value}</span>
    </div>
  );
}
