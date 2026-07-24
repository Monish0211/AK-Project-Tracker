import { IndianRupee } from "lucide-react";
import type { NonManhourExpense } from "../../../../types/NonManhourExpense";

import {
  getTotalNonManhourCost,
} from "../../../../services/expenseService";

import { formatBusinessINR, formatFullINR } from "../../../../utils/formatCurrency";

interface Props {
  manpowerCost: number;
  nonManhourExpenses: NonManhourExpense[];
}

const CostSummaryCard = ({
  manpowerCost,
  nonManhourExpenses,
}: Props) => {
  const totalOtherExpenses =
    getTotalNonManhourCost(nonManhourExpenses);

  const totalProjectCost = manpowerCost + totalOtherExpenses;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] shadow-sm">

      {/* Header */}

      <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 px-6 py-5">

        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-100">

          <IndianRupee
            size={22}
            className="text-green-600"
          />

        </div>

        <div>

          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Cost Breakdown Summary
          </h2>

          <p className="text-sm text-slate-500">
            Automatically calculated from project expenses.
          </p>

        </div>

      </div>

      {/* Body */}

      <div className="space-y-5 p-6">

        <div className="flex items-center justify-between">

          <span className="text-sm text-slate-600">
            Total Manpower Budget
          </span>

          <span className="text-lg font-semibold text-blue-700 whitespace-nowrap" title={formatFullINR(manpowerCost)}>
            {formatBusinessINR(manpowerCost)}
          </span>

        </div>

        <div className="flex items-center justify-between">

          <span className="text-sm text-slate-600">
            Total Other Expenses
          </span>

          <span className="text-lg font-semibold text-orange-700 whitespace-nowrap" title={formatFullINR(totalOtherExpenses)}>
            {formatBusinessINR(totalOtherExpenses)}
          </span>

        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-5">

          <div className="flex items-center justify-between">

            <span className="text-lg font-bold text-slate-800 dark:text-slate-100">
              Total Project Cost
            </span>

            <span className="text-2xl font-bold text-green-700 whitespace-nowrap" title={formatFullINR(totalProjectCost)}>
              {formatBusinessINR(totalProjectCost)}
            </span>

          </div>

        </div>

      </div>

    </div>
  );
};

export default CostSummaryCard;