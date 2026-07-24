import { useState } from "react";
import { X } from "lucide-react";

import type { Employee } from "../../../types/EmployeeModel";

import {
  getEmployees,
  saveEmployees,
} from "../../../services/employeeService";

interface Props {
  employee?: Employee | null;
  employees: Employee[];
  setEmployees: React.Dispatch<
    React.SetStateAction<Employee[]>
  >;
  onClose: () => void;
}

const DEPARTMENT_OPTIONS = [
  "Process",
  "Mechanical",
  "Civil",
  "Instrumentation",
  "Electrical",
  "Training",
  "Design Engineering Services",
  "Others",
];

const EmployeeModal = ({
  employee,
  employees,
  setEmployees,
  onClose,
}: Props) => {
  const isEditMode = Boolean(employee);

  const isKnownDepartment = employee
    ? DEPARTMENT_OPTIONS.includes(employee.department)
    : true;

  const [employeeNo, setEmployeeNo] = useState(
    employee?.employeeNo ?? ""
  );

  const [employeeName, setEmployeeName] = useState(
    employee?.employeeName ?? ""
  );

  const [designation, setDesignation] = useState(
    employee?.designation ?? ""
  );

  const [department, setDepartment] = useState(
    employee
      ? isKnownDepartment
        ? employee.department
        : "Others"
      : ""
  );

  const [otherDepartment, setOtherDepartment] = useState(
    employee && !isKnownDepartment ? employee.department : ""
  );

  const [location, setLocation] = useState(
    employee?.location ?? ""
  );

  const [reportingManager, setReportingManager] = useState(
    employee?.reportingManager ?? ""
  );

  const [grade, setGrade] = useState(
    employee?.grade ?? ""
  );

  const [manhourExpenses, setManhourExpenses] = useState(
    employee?.manhourExpenses ?? 0
  );

  const [status, setStatus] = useState<Employee["status"]>(
    employee?.status ?? "Active"
  );

  const [error, setError] = useState("");

  const handleSave = () => {
    if (!employeeNo.trim()) {
      setError("Employee number is required.");
      return;
    }

    if (!employeeName.trim()) {
      setError("Employee name is required.");
      return;
    }

    if (!designation.trim()) {
      setError("Designation is required.");
      return;
    }

    if (!department) {
      setError("Department is required.");
      return;
    }

    if (department === "Others" && !otherDepartment.trim()) {
      setError("Please specify the department.");
      return;
    }

    if (!location.trim()) {
      setError("Location is required.");
      return;
    }

    if (!reportingManager.trim() && reportingManager.trim() === undefined) {
      // Note: Reporting Manager can be empty if it's blank in seed data, but the validation spec says:
      // "Reporting Manager: Required"
      // Wait, in the seed data Suresh Kumar G has reportingManager: ""
      // So reportingManager might be optional or blank.
      // But the validation rules list says: "Reporting Manager: Required".
      // Let's enforce required check, but if the user wants it to be empty for Suresh Kumar G, it is fine since seed data bypasses form validation.
      // But for new manual entries, we'll check it. Let's make sure if reporting manager is empty we allow it if they really want, but to match "Required" spec:
      // "Reporting Manager: Required"
      // Let's enforce it here:
    }

    if (!reportingManager.trim()) {
      setError("Reporting manager is required.");
      return;
    }

    if (!grade.trim()) {
      setError("Employee grade is required.");
      return;
    }

    if (!status) {
      setError("Status is required.");
      return;
    }

    const duplicate = employees.some(
      (e) =>
        e.employeeNo.trim().toLowerCase() ===
          employeeNo.trim().toLowerCase() &&
        e.id !== employee?.id
    );

    if (duplicate) {
      setError("Employee number already exists.");
      return;
    }

    const finalDepartment =
      department === "Others"
        ? otherDepartment.trim()
        : department;

    if (employee) {
      const updatedEmployees = employees.map((e) =>
        e.id === employee.id
          ? {
              ...e,
              employeeNo: employeeNo.trim(),
              employeeName: employeeName.trim(),
              designation: designation.trim(),
              department: finalDepartment,
              location: location.trim(),
              reportingManager: reportingManager.trim(),
              grade: grade.trim(),
              manhourExpenses,
              status,
            }
          : e
      );

      saveEmployees(updatedEmployees);
    } else {
      const updatedEmployees = [
        ...employees,
        {
          id: crypto.randomUUID(),
          employeeNo: employeeNo.trim(),
          employeeName: employeeName.trim(),
          designation: designation.trim(),
          department: finalDepartment,
          location: location.trim(),
          reportingManager: reportingManager.trim(),
          grade: grade.trim(),
          manhourExpenses,
          status,
          createdAt: new Date().toISOString(),
        },
      ];

      saveEmployees(updatedEmployees);
    }

    setEmployees(getEmployees());

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">

      <div className="bg-white dark:bg-[#1E293B] border border-gray-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}

        <div className="flex justify-between items-center border-b border-gray-200 dark:border-slate-700 p-6 shrink-0">

          <div>

            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {isEditMode ? "Edit Employee" : "Add Employee"}
            </h2>

            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {isEditMode
                ? "Update employee details."
                : "Create a new employee record."}
            </p>

          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition"
          >
            <X size={20} />
          </button>

        </div>

        {/* Body */}

        <div className="p-6 space-y-5 overflow-y-auto flex-1">

          {/* Employee Number */}
          <div>

            <label className="block text-sm font-medium mb-2">
              Employee Number
            </label>

            <input
              type="text"
              value={employeeNo}
              disabled={isEditMode}
              onChange={(e) => {
                setEmployeeNo(e.target.value);
                setError("");
              }}
              placeholder="Enter Employee Number"
              className="
                w-full
                border
                rounded-xl
                p-3
                focus:ring-2
                focus:ring-blue-500
                outline-none
                disabled:bg-slate-50
                disabled:text-slate-400
                disabled:cursor-not-allowed
              "
            />

          </div>

          {/* Employee Name */}
          <div>

            <label className="block text-sm font-medium mb-2">
              Employee Name
            </label>

            <input
              type="text"
              value={employeeName}
              onChange={(e) => {
                setEmployeeName(e.target.value);
                setError("");
              }}
              placeholder="Enter Employee Name"
              className="
                w-full
                border
                rounded-xl
                p-3
                focus:ring-2
                focus:ring-blue-500
                outline-none
              "
            />

          </div>

          {/* Designation */}
          <div>

            <label className="block text-sm font-medium mb-2">
              Designation
            </label>

            <input
              type="text"
              value={designation}
              onChange={(e) => {
                setDesignation(e.target.value);
                setError("");
              }}
              placeholder="Enter Designation (e.g. Lead Engineer)"
              className="
                w-full
                border
                rounded-xl
                p-3
                focus:ring-2
                focus:ring-blue-500
                outline-none
              "
            />

          </div>

          {/* Department */}
          <div>

            <label className="block text-sm font-medium mb-2">
              Department
            </label>

            <select
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setError("");

                if (e.target.value !== "Others") {
                  setOtherDepartment("");
                }
              }}
              className="
                w-full
                border
                rounded-xl
                p-3
                focus:ring-2
                focus:ring-blue-500
                outline-none
              "
            >
              <option value="">Select Department</option>

              {DEPARTMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            {department === "Others" && (
              <div className="mt-3">

                <label className="block text-sm font-medium mb-2">
                  Specify Department
                </label>

                <input
                  type="text"
                  value={otherDepartment}
                  onChange={(e) => {
                    setOtherDepartment(e.target.value);
                    setError("");
                  }}
                  placeholder="Enter Department Name"
                  className="
                    w-full
                    border
                    rounded-xl
                    p-3
                    focus:ring-2
                    focus:ring-blue-500
                    outline-none
                  "
                />

              </div>
            )}

          </div>

          {/* Location */}
          <div>

            <label className="block text-sm font-medium mb-2">
              Location
            </label>

            <input
              type="text"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setError("");
              }}
              placeholder="Enter Location (e.g. Chennai, Bangalore, Site)"
              className="
                w-full
                border
                rounded-xl
                p-3
                focus:ring-2
                focus:ring-blue-500
                outline-none
              "
            />

          </div>

          {/* Reporting Manager */}
          <div>

            <label className="block text-sm font-medium mb-2">
              Reporting Manager
            </label>

            <input
              type="text"
              value={reportingManager}
              onChange={(e) => {
                setReportingManager(e.target.value);
                setError("");
              }}
              placeholder="Enter Reporting Manager"
              className="
                w-full
                border
                rounded-xl
                p-3
                focus:ring-2
                focus:ring-blue-500
                outline-none
              "
            />

          </div>

          {/* Employee Grade */}
          <div>

            <label className="block text-sm font-medium mb-2">
              Employee Grade
            </label>

            <input
              type="text"
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value);
                setError("");
              }}
              placeholder="Enter Employee Grade (e.g. MG1, SG2)"
              className="
                w-full
                border
                rounded-xl
                p-3
                focus:ring-2
                focus:ring-blue-500
                outline-none
              "
            />

          </div>

          {/* Man-hour Expenses */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Man-hour Expenses
            </label>
            <input
              type="number"
              value={manhourExpenses === 0 ? "" : manhourExpenses}
              onChange={(e) => setManhourExpenses(Number(e.target.value) || 0)}
              placeholder="Enter Hourly Cost (₹ / Hour)"
              className="
                w-full
                border
                rounded-xl
                p-3
                focus:ring-2
                focus:ring-blue-500
                outline-none
              "
            />
          </div>

          {/* Status */}
          <div>

            <label className="block text-sm font-medium mb-2">
              Status
            </label>

            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as Employee["status"]);
                setError("");
              }}
              className="
                w-full
                border
                rounded-xl
                p-3
                focus:ring-2
                focus:ring-blue-500
                outline-none
              "
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>

          </div>

          {error && (
            <div className="text-red-600 text-sm font-medium">
              {error}
            </div>
          )}

        </div>

        {/* Footer */}

        <div className="flex justify-end gap-3 border-t p-6 shrink-0">

          <button
            onClick={onClose}
            className="
              px-5
              py-2.5
              rounded-xl
              border
              hover:bg-gray-100
            "
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            className="
              px-5
              py-2.5
              rounded-xl
              bg-blue-600
              hover:bg-blue-700
              text-white
            "
          >
            {isEditMode ? "Update Employee" : "Save Employee"}
          </button>

        </div>

      </div>

    </div>
  );
};

export default EmployeeModal;
