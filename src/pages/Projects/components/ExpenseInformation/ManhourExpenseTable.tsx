import { Pencil, Trash2, Users } from "lucide-react";

import type { ManhourExpense } from "../../../../types/ManhourExpense";

import {
  formatIndianCurrency,
  formatIndianNumber,
} from "../../../../utils/quantityCalculations";

interface Props {
  expenses: ManhourExpense[];
  onEdit: (expense: ManhourExpense) => void;
  onDelete: (id: string) => void;
}

const ManhourExpenseTable = ({ expenses, onEdit, onDelete }: Props) => {
  const handleDelete = (id: string) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) {
      return;
    }

    onDelete(id);
  };

  return (
    <div className="max-h-[26rem] overflow-auto">

      <table className="min-w-full">

        <thead className="sticky top-0 z-10 bg-gray-50">

          <tr className="text-sm text-gray-600">

            <th className="px-4 py-3 text-left">
              Employee Name
            </th>

            <th className="px-4 py-3 text-left">
              Employee No
            </th>

            <th className="px-4 py-3 text-left">
              Department
            </th>

            <th className="px-4 py-3 text-left">
              Reporting Manager
            </th>

            <th className="px-4 py-3 text-right">
              Rate
            </th>

            <th className="px-4 py-3 text-right">
              Booked Hours
            </th>

            <th className="px-4 py-3 text-right">
              Total Cost
            </th>

            <th className="px-4 py-3 text-left">
              Remarks
            </th>

            <th className="px-4 py-3 text-center">
              Action
            </th>

          </tr>

        </thead>

        <tbody className="divide-y divide-gray-100">

          {expenses.length === 0 ? (

            <tr>

              <td colSpan={9} className="py-14 text-center">

                <div className="flex flex-col items-center">

                  <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
                    <Users size={30} className="text-blue-500" />
                  </div>

                  <h3 className="mt-4 text-lg font-semibold text-gray-700 dark:text-slate-200">
                    No Employees Added
                  </h3>

                  <p className="mt-2 text-sm text-gray-500 max-w-md">
                    Click <strong>Add Employee</strong> to record man-hour
                    expenses.
                  </p>

                </div>

              </td>

            </tr>

          ) : (

            expenses.map((expense) => (

              <tr
                key={expense.id}
                className="text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50"
              >

                <td className="px-4 py-3 font-medium text-gray-800 dark:text-slate-100">
                  {expense.employeeName}
                </td>

                <td className="px-4 py-3">
                  {expense.employeeNo || "—"}
                </td>

                <td className="px-4 py-3">
                  {expense.department}
                </td>

                <td className="px-4 py-3">
                  {expense.reportingManager || "—"}
                </td>

                <td className="px-4 py-3 text-right">
                  {formatIndianCurrency(expense.manhourRate)}
                </td>

                <td className="px-4 py-3 text-right">
                  {formatIndianNumber(expense.bookedHours)}
                </td>

                <td className="px-4 py-3 text-right font-semibold text-blue-700">
                  {formatIndianCurrency(expense.totalCost)}
                </td>

                <td
                  className="px-4 py-3 max-w-[12rem] truncate"
                  title={expense.remarks}
                >
                  {expense.remarks || "—"}
                </td>

                <td className="px-4 py-3">

                  <div className="flex items-center justify-center gap-2">

                    <button
                      onClick={() => onEdit(expense)}
                      title="Edit"
                      className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                    >
                      <Pencil size={16} />
                    </button>

                    <button
                      onClick={() => handleDelete(expense.id)}
                      title="Delete"
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition"
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
  );
};

export default ManhourExpenseTable;
