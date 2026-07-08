import { IndianRupee, TrendingUp } from "lucide-react";

import type { ManhourExpense } from "../../../../types/ManhourExpense";
import type { NonManhourExpense } from "../../../../types/NonManhourExpense";

import {
  getTotalProjectCost,
  getGrossProfit,
  getProfitMargin,
} from "../../../../services/expenseService";

import { formatIndianCurrency } from "../../../../utils/quantityCalculations";

interface Props {
  manhourExpenses: ManhourExpense[];
  nonManhourExpenses: NonManhourExpense[];
  revenue: number;
}

const ProfitAnalysisCard = ({
  manhourExpenses,
  nonManhourExpenses,
  revenue,
}: Props) => {
  const totalCost = getTotalProjectCost(
    manhourExpenses,
    nonManhourExpenses
  );

  const grossProfit = getGrossProfit(
    revenue,
    totalCost
  );

  const grossMargin = getProfitMargin(
    revenue,
    grossProfit
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">

      {/* Header */}

      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">

        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-100">

          <TrendingUp
            size={22}
            className="text-indigo-600"
          />

        </div>

        <div>

          <h2 className="text-lg font-semibold text-slate-800">
            Profit Analysis
          </h2>

          <p className="text-sm text-slate-500">
            Revenue, profit and margin are calculated automatically.
          </p>

        </div>

      </div>

      {/* KPI Grid */}

      <div className="grid grid-cols-1 gap-5 p-6 md:grid-cols-2">

        {/* Revenue */}

        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">

          <div className="flex items-center gap-2">

            <IndianRupee
              size={18}
              className="text-blue-600"
            />

            <span className="text-sm font-medium text-slate-600">
              Revenue
            </span>

          </div>

          <h3 className="mt-3 text-2xl font-bold text-blue-700">
            {formatIndianCurrency(revenue)}
          </h3>

        </div>

        {/* Total Cost */}

        <div className="rounded-xl border border-red-200 bg-red-50 p-5">

          <div className="flex items-center gap-2">

            <IndianRupee
              size={18}
              className="text-red-600"
            />

            <span className="text-sm font-medium text-slate-600">
              Total Cost
            </span>

          </div>

          <h3 className="mt-3 text-2xl font-bold text-red-700">
            {formatIndianCurrency(totalCost)}
          </h3>

        </div>

        {/* Gross Profit */}

        <div className="rounded-xl border border-green-200 bg-green-50 p-5">

          <div className="flex items-center gap-2">

            <TrendingUp
              size={18}
              className="text-green-600"
            />

            <span className="text-sm font-medium text-slate-600">
              Gross Profit
            </span>

          </div>

          <h3
            className={`mt-3 text-2xl font-bold ${
              grossProfit >= 0
                ? "text-green-700"
                : "text-red-700"
            }`}
          >
            {formatIndianCurrency(grossProfit)}
          </h3>

        </div>

        {/* Gross Margin */}

        <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">

          <div className="flex items-center gap-2">

            <TrendingUp
              size={18}
              className="text-purple-600"
            />

            <span className="text-sm font-medium text-slate-600">
              Gross Margin
            </span>

          </div>

          <h3
            className={`mt-3 text-2xl font-bold ${
              grossMargin >= 0
                ? "text-purple-700"
                : "text-red-700"
            }`}
          >
            {grossMargin.toFixed(2)}%
          </h3>

        </div>

      </div>

    </div>
  );
};

export default ProfitAnalysisCard;