import { Users } from "lucide-react";

import type { ManhourExpense } from "../../../types/ManhourExpense";

import {
  formatIndianCurrency,
  formatIndianNumber,
} from "../../../utils/quantityCalculations";

interface Props {
  expenses: ManhourExpense[];
}

const ManhourExpenseView = ({ expenses }: Props) => {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-[#1E293B] shadow-sm overflow-hidden">

      <div className="border-b border-gray-100 dark:border-slate-800 px-6 py-5">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
          Man-Hour Expenses
        </h3>
        <p className="text-sm text-slate-500">
          Employee-wise booked hours and manpower cost.
        </p>
      </div>

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
                Manhour Rate
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

            </tr>

          </thead>

          <tbody className="divide-y divide-gray-100">

            {expenses.length === 0 ? (

              <tr>

                <td colSpan={8} className="py-14 text-center">

                  <div className="flex flex-col items-center">

                    <div className="h-16 w-16 rounded-full bg-blue-50 flex items-center justify-center">
                      <Users size={30} className="text-blue-500" />
                    </div>

                    <h3 className="mt-4 text-lg font-semibold text-gray-700 dark:text-slate-200">
                      No Man-Hour Expenses Recorded
                    </h3>

                    <p className="mt-2 text-sm text-gray-500 max-w-md">
                      No employee working hours have been logged for this
                      project.
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
                    {expense.department || "—"}
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

                </tr>

              ))

            )}

          </tbody>

        </table>

      </div>

    </div>
  );
};

export default ManhourExpenseView;
