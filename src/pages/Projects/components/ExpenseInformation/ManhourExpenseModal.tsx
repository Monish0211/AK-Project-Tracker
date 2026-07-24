import { useState } from "react";
import { X } from "lucide-react";

import type { Employee } from "../../../../types/EmployeeModel";
import type { ManhourExpense } from "../../../../types/ManhourExpense";

import { getEmployees } from "../../../../services/employeeService";

interface Props {
  expense?: ManhourExpense | null;
  onClose: () => void;
  onSave: (expense: ManhourExpense) => void;
}

const DEPARTMENT_OPTIONS = [
  "Design Engineering Services",
  "Environment",
  "Risk Management",
  "Training",
  "Others",
];

const MAX_SUGGESTIONS = 8;

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
}

const AutocompleteInput = ({
  value,
  onChange,
  onSelect,
  suggestions,
  placeholder,
}: AutocompleteInputProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const query = value.trim().toLowerCase();

  const filteredSuggestions = (
    query === ""
      ? suggestions
      : suggestions.filter((item) => item.toLowerCase().includes(query))
  ).slice(0, MAX_SUGGESTIONS);

  const handleSuggestionClick = (item: string) => {
    onChange(item);
    onSelect?.(item);
    setIsOpen(false);
  };

  return (
    <div className="relative mt-2">

      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        className="w-full border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {isOpen && filteredSuggestions.length > 0 && (

        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] shadow-lg">

          {filteredSuggestions.map((item) => (

            <button
              key={item}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSuggestionClick(item)}
              className="block w-full px-4 py-2.5 text-left text-sm hover:bg-blue-50"
            >
              {item}
            </button>

          ))}

        </div>

      )}

    </div>
  );
};

const ManhourExpenseModal = ({ expense, onClose, onSave }: Props) => {
  const isEditMode = Boolean(expense);

  const [employees] = useState<Employee[]>(() => getEmployees());

  const [employeeName, setEmployeeName] = useState(
    expense?.employeeName ?? ""
  );

  const [employeeNo, setEmployeeNo] = useState(expense?.employeeNo ?? "");

  const [department, setDepartment] = useState(expense?.department ?? "");

  const [reportingManager, setReportingManager] = useState(
    expense?.reportingManager ?? ""
  );

  const [manhourRate, setManhourRate] = useState<number | "">(
    expense?.manhourRate ?? ""
  );

  const [bookedHours, setBookedHours] = useState<number | "">(
    expense?.bookedHours ?? ""
  );

  const [remarks, setRemarks] = useState(expense?.remarks ?? "");

  const [error, setError] = useState("");

  const employeeNameSuggestions = Array.from(
    new Set(employees.map((employee) => employee.employeeName).filter(Boolean))
  );

  const reportingManagerSuggestions = Array.from(
    new Set(
      employees.map((employee) => employee.reportingManager).filter(Boolean)
    )
  );

  const totalCost =
    manhourRate === "" || bookedHours === "" ? 0 : manhourRate * bookedHours;

  const handleEmployeeNameSelect = (name: string) => {
    const matchedEmployee = employees.find(
      (employee) =>
        employee.employeeName.trim().toLowerCase() ===
        name.trim().toLowerCase()
    );

    if (!matchedEmployee) return;

    setDepartment(matchedEmployee.department);

    if (matchedEmployee.employeeNo) {
      setEmployeeNo(matchedEmployee.employeeNo);
    }
  };

  const handleSave = () => {
    if (!employeeName.trim()) {
      setError("Employee name is required.");
      return;
    }

    if (!department) {
      setError("Department is required.");
      return;
    }

    if (manhourRate === "" || manhourRate <= 0) {
      setError("Manhour rate must be greater than 0.");
      return;
    }

    if (bookedHours === "" || bookedHours <= 0) {
      setError("Booked hours must be greater than 0.");
      return;
    }

    onSave({
      id: expense?.id ?? crypto.randomUUID(),
      employeeName: employeeName.trim(),
      employeeNo: employeeNo.trim(),
      department,
      reportingManager: reportingManager.trim(),
      manhourRate,
      bookedHours,
      totalCost: manhourRate * bookedHours,
      remarks: remarks.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50 p-5">

      <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl w-full max-w-3xl">

        {/* Header */}

        <div className="flex justify-between items-center border-b px-6 py-5">

          <div>

            <h2 className="text-2xl font-bold">
              {isEditMode ? "Edit Man-Hour Expense" : "Add Man-Hour Expense"}
            </h2>

            <p className="text-gray-500 text-sm mt-1">
              Select an employee and record booked hours.
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

        <div className="p-6">

          <div className="grid grid-cols-2 gap-5">

            {/* Employee Name */}

            <div>

              <label className="text-sm font-medium">
                Employee Name
              </label>

              <AutocompleteInput
                value={employeeName}
                onChange={setEmployeeName}
                onSelect={handleEmployeeNameSelect}
                suggestions={employeeNameSuggestions}
                placeholder="Type to search employees..."
              />

            </div>

            {/* Employee No */}

            <div>

              <label className="text-sm font-medium">
                Employee No
              </label>

              <input
                value={employeeNo}
                onChange={(e) => setEmployeeNo(e.target.value)}
                placeholder="Enter Employee No"
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

            </div>

            {/* Department */}

            <div>

              <label className="text-sm font-medium">
                Department
              </label>

              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >

                <option value="">
                  Select Department
                </option>

                {DEPARTMENT_OPTIONS.map((option) => (

                  <option key={option} value={option}>
                    {option}
                  </option>

                ))}

              </select>

            </div>

            {/* Reporting Manager */}

            <div>

              <label className="text-sm font-medium">
                Reporting Manager
              </label>

              <AutocompleteInput
                value={reportingManager}
                onChange={setReportingManager}
                suggestions={reportingManagerSuggestions}
                placeholder="Type to search reporting managers..."
              />

            </div>

            {/* Manhour Rate */}

            <div>

              <label className="text-sm font-medium">
                Manhour Rate
              </label>

              <input
                type="number"
                min={0}
                value={manhourRate}
                onChange={(e) => {
                  const raw = e.target.value;
                  setManhourRate(raw === "" ? "" : Number(raw));
                }}
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

            </div>

            {/* Booked Hours */}

            <div>

              <label className="text-sm font-medium">
                Booked Hours
              </label>

              <input
                type="number"
                min={0}
                value={bookedHours}
                onChange={(e) => {
                  const raw = e.target.value;
                  setBookedHours(raw === "" ? "" : Number(raw));
                }}
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

            </div>

            {/* Remarks */}

            <div className="col-span-2">

              <label className="text-sm font-medium">
                Remarks
              </label>

              <textarea
                rows={4}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full border rounded-xl mt-2 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

            </div>

            {error && (

              <div className="col-span-2 text-red-600 text-sm font-medium">
                {error}
              </div>

            )}

          </div>

        </div>

        {/* Footer */}

        <div className="border-t px-6 py-5 flex justify-between items-center">

          <div>

            <p className="text-sm text-gray-500">
              Total Cost
            </p>

            <h2 className="text-3xl font-bold text-blue-700">
              ₹ {totalCost.toLocaleString("en-IN")}
            </h2>

          </div>

          <div className="flex gap-3">

            <button
              onClick={onClose}
              className="border rounded-xl px-5 py-2.5 hover:bg-gray-100"
            >
              Cancel
            </button>

            <button
              onClick={handleSave}
              className="bg-blue-600 text-white rounded-xl px-5 py-2.5 hover:bg-blue-700"
            >
              {isEditMode ? "Update Expense" : "Save Expense"}
            </button>

          </div>

        </div>

      </div>

    </div>
  );
};

export default ManhourExpenseModal;
