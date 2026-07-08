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
  "Design Engineering Services",
  "Environment",
  "Risk Management",
  "Training",
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

  const [reportingManager, setReportingManager] = useState(
    employee?.reportingManager ?? ""
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

  const [manhourRate, setManhourRate] = useState(
    employee ? String(employee.manhourRate) : ""
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

    if (!reportingManager.trim()) {
      setError("Reporting manager is required.");
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

    const rate = Number(manhourRate);

    if (!manhourRate.trim() || Number.isNaN(rate) || rate <= 0) {
      setError("Manhour rate must be greater than 0.");
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
              reportingManager: reportingManager.trim(),
              department: finalDepartment,
              manhourRate: rate,
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
          reportingManager: reportingManager.trim(),
          department: finalDepartment,
          manhourRate: rate,
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">

      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">

        {/* Header */}

        <div className="flex justify-between items-center border-b p-6">

          <div>

            <h2 className="text-2xl font-bold text-slate-800">
              {isEditMode ? "Edit Employee" : "Add Employee"}
            </h2>

            <p className="text-sm text-gray-500 mt-1">
              {isEditMode
                ? "Update employee details."
                : "Create a new employee record."}
            </p>

          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>

        </div>

        {/* Body */}

        <div className="p-6 space-y-5">

          <div>

            <label className="block text-sm font-medium mb-2">
              Employee Number
            </label>

            <input
              type="text"
              value={employeeNo}
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
              "
            />

          </div>

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

          <div>

            <label className="block text-sm font-medium mb-2">
              Manhour Rate
            </label>

            <input
              type="number"
              value={manhourRate}
              onChange={(e) => {
                setManhourRate(e.target.value);
                setError("");
              }}
              placeholder="Enter Manhour Rate"
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

        <div className="flex justify-end gap-3 border-t p-6">

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
