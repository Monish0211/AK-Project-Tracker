import { useState } from "react";
import { Briefcase, Pencil, Trash2 } from "lucide-react";

import type { NonManhourExpense } from "../../../../types/NonManhourExpense";

import {
  formatIndianCurrency,
  formatIndianNumber,
} from "../../../../utils/quantityCalculations";
import { ConfirmDialog } from "../../../../components/ui/ConfirmDialog";

interface Props {
  expenses: NonManhourExpense[];
  onEdit: (expense: NonManhourExpense) => void;
  onDelete: (id: string) => void;
}

const NonManhourExpenseTable = ({ expenses, onEdit, onDelete }: Props) => {
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleDelete = (id: string) => setDeleteTargetId(id);

  return (
    <div className="max-h-[26rem] overflow-auto">

      <table className="min-w-full">

        <thead className="sticky top-0 z-10 bg-gray-50">

          <tr className="text-sm text-gray-600">

            <th className="px-4 py-3 text-left sticky left-0 z-30 bg-gray-50">
              Category
            </th>

            <th className="px-4 py-3 text-left">
              Description
            </th>

            <th className="px-4 py-3 text-center">
              Qty
            </th>

            <th className="px-4 py-3 text-right">
              Unit Cost
            </th>

            <th className="px-4 py-3 text-right">
              Total
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

              <td colSpan={7} className="py-14 text-center">

                <div className="flex flex-col items-center">

                  <div className="h-16 w-16 rounded-full bg-orange-50 flex items-center justify-center">
                    <Briefcase size={30} className="text-orange-500" />
                  </div>

                  <h3 className="mt-4 text-lg font-semibold text-gray-700 dark:text-slate-200">
                    No Expenses Added
                  </h3>

                  <p className="mt-2 text-sm text-gray-500 max-w-md">
                    Click <strong>Add Expense</strong> to record
                    project-related expenses.
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

                <td className="px-4 py-3 font-medium text-gray-800 dark:text-slate-100 sticky left-0 z-10 bg-white dark:bg-[#1E293B]">
                  {expense.category}
                </td>

                <td className="px-4 py-3">
                  {expense.description}
                </td>

                <td className="px-4 py-3 text-center">
                  {formatIndianNumber(expense.quantity)}
                </td>

                <td className="px-4 py-3 text-right">
                  {formatIndianCurrency(expense.unitCost)}
                </td>

                <td className="px-4 py-3 text-right font-semibold text-orange-700">
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

      <ConfirmDialog
        open={deleteTargetId !== null}
        variant="danger"
        title="Delete Expense?"
        message="Are you sure you want to delete this expense? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (!deleteTargetId) return;
          onDelete(deleteTargetId);
          setDeleteTargetId(null);
        }}
      />
    </div>
  );
};

export default NonManhourExpenseTable;
