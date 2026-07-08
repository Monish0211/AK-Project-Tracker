import { Briefcase } from "lucide-react";

import type { NonManhourExpense } from "../../../types/NonManhourExpense";

import {
  formatIndianCurrency,
  formatIndianNumber,
} from "../../../utils/quantityCalculations";

interface Props {
  expenses: NonManhourExpense[];
}

const NonManhourExpenseView = ({ expenses }: Props) => {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">

      <div className="border-b border-gray-100 px-6 py-5">
        <h3 className="text-base font-semibold text-slate-800">
          Other Project Expenses
        </h3>
        <p className="text-sm text-slate-500">
          Travel, accommodation and other project-related expenses.
        </p>
      </div>

      <div className="max-h-[26rem] overflow-auto">

        <table className="min-w-full">

          <thead className="sticky top-0 z-10 bg-gray-50">

            <tr className="text-sm text-gray-600">

              <th className="px-4 py-3 text-left">
                Category
              </th>

              <th className="px-4 py-3 text-left">
                Description
              </th>

              <th className="px-4 py-3 text-center">
                Quantity
              </th>

              <th className="px-4 py-3 text-right">
                Unit Cost
              </th>

              <th className="px-4 py-3 text-right">
                Total Cost
              </th>

              <th className="px-4 py-3 text-left">
                Remarks
              </th>

            </tr>

          </thead>

          <tbody className="divide-y divide-gray-100">

            {expenses.length === 0 ? (

              <tr>

                <td colSpan={6} className="py-14 text-center">

                  <div className="flex flex-col items-center">

                    <div className="h-16 w-16 rounded-full bg-orange-50 flex items-center justify-center">
                      <Briefcase size={30} className="text-orange-500" />
                    </div>

                    <h3 className="mt-4 text-lg font-semibold text-gray-700">
                      No Other Expenses Recorded
                    </h3>

                    <p className="mt-2 text-sm text-gray-500 max-w-md">
                      No non man-hour expenses have been added for this
                      project.
                    </p>

                  </div>

                </td>

              </tr>

            ) : (

              expenses.map((expense) => (

                <tr
                  key={expense.id}
                  className="text-sm text-gray-700 hover:bg-gray-50"
                >

                  <td className="px-4 py-3 font-medium text-gray-800">
                    {expense.category}
                  </td>

                  <td className="px-4 py-3">
                    {expense.description || "—"}
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

                </tr>

              ))

            )}

          </tbody>

        </table>

      </div>

    </div>
  );
};

export default NonManhourExpenseView;
