import { Pencil, Trash2 } from "lucide-react";

import type { Employee } from "../../../types/EmployeeModel";

interface Props {
  index: number;
  employee: Employee;
  onEdit: (employee: Employee) => void;
  onDelete: (id: string) => void;
}

const EmployeeRow = ({
  index,
  employee,
  onEdit,
  onDelete,
}: Props) => {
  return (
    <tr className="nu-table-row transition text-sm text-slate-700 dark:text-slate-300">

      {/* Sl No */}
      <td className="px-6 py-4 text-center font-medium">
        {index + 1}
      </td>

      {/* Employee No */}
      <td className="px-6 py-4">
        {employee.employeeNo}
      </td>

      {/* Employee Name */}
      <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-100">
        {employee.employeeName}
      </td>

      {/* Designation */}
      <td className="px-6 py-4 truncate max-w-[150px]" title={employee.designation}>
        {employee.designation || "—"}
      </td>

      {/* Department */}
      <td className="px-6 py-4">
        {employee.department}
      </td>

      {/* Location */}
      <td className="px-6 py-4">
        {employee.location || "—"}
      </td>

      {/* Reporting Manager */}
      <td className="px-6 py-4">
        {employee.reportingManager || "—"}
      </td>

      {/* Employee Grade */}
      <td className="px-6 py-4 text-center">
        {employee.grade || "—"}
      </td>

      {/* Man-hour Expenses */}
      <td className="px-6 py-4 text-right font-medium text-slate-800 dark:text-slate-100">
        ₹{(employee.manhourExpenses || 0).toLocaleString("en-IN")}
      </td>

      {/* Status */}
      <td className="px-6 py-4 text-center">
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${
            employee.status === "Active"
              ? "bg-green-100 dark:bg-emerald-950/60 text-green-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40"
              : "bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200/50 dark:border-red-800/40"
          }`}
        >
          {employee.status}
        </span>
      </td>

      {/* Actions */}
      <td className="px-6 py-4">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => onEdit(employee)}
            title="Edit Employee"
            className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 flex items-center justify-center transition"
          >
            <Pencil
              size={18}
              className="text-blue-600 dark:text-blue-400"
            />
          </button>

          <button
            onClick={() => onDelete(employee.id)}
            title="Delete Employee"
            className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center justify-center transition"
          >
            <Trash2
              size={18}
              className="text-red-600 dark:text-red-400"
            />
          </button>
        </div>
      </td>

    </tr>
  );
};

export default EmployeeRow;