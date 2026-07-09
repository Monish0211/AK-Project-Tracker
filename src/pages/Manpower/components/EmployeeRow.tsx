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
    <tr className="border-b last:border-b-0 hover:bg-slate-50 transition text-sm text-slate-700">

      {/* Sl No */}
      <td className="px-6 py-4 text-center font-medium">
        {index + 1}
      </td>

      {/* Employee No */}
      <td className="px-6 py-4">
        {employee.employeeNo}
      </td>

      {/* Employee Name */}
      <td className="px-6 py-4 font-medium text-slate-800">
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

      {/* Manhour Rate */}
      <td className="px-6 py-4 text-right font-semibold">
        ₹ {(employee.manhourRate || 0).toLocaleString("en-IN")}
      </td>

      {/* Status */}
      <td className="px-6 py-4 text-center">
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${
            employee.status === "Active"
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-700"
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
            className="w-10 h-10 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center transition"
          >
            <Pencil
              size={18}
              className="text-blue-600"
            />
          </button>

          <button
            onClick={() => onDelete(employee.id)}
            title="Delete Employee"
            className="w-10 h-10 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center transition"
          >
            <Trash2
              size={18}
              className="text-red-600"
            />
          </button>
        </div>
      </td>

    </tr>
  );
};

export default EmployeeRow;