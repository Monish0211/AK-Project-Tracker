import { IndianRupee, TrendingDown, TrendingUp } from "lucide-react";

import type { ManhourExpense } from "../../../../types/ManhourExpense";
import type { NonManhourExpense } from "../../../../types/NonManhourExpense";

import {
  getGrossProfit,
  getProfitMargin,
  getTotalProjectCost,
} from "../../../../services/expenseService";
import {
  formatIndianCurrency,
  formatIndianNumber,
} from "../../../../utils/quantityCalculations";

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
  const totalProjectCost = getTotalProjectCost(
    manhourExpenses,
    nonManhourExpenses
  );

  const grossProfit = getGrossProfit(revenue, totalProjectCost);

  const profitMargin = getProfitMargin(revenue, grossProfit);

  const isProfit = grossProfit >= 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200">

      {/* Header */}

      <div className="flex items-center gap-3 border-b px-6 py-5">

        <div className="h-11 w-11 rounded-xl bg-indigo-100 flex items-center justify-center">

          <TrendingUp
            size={22}
            className="text-indigo-600"
          />

        </div>

        <div>

          <h2 className="text-lg font-semibold text-gray-800">
            Profit Analysis
          </h2>

          <p className="text-sm text-gray-500">
            Revenue, profit and margin are calculated automatically.
          </p>

        </div>

      </div>

      {/* Body */}

      <div className="p-6">

        <div className="grid grid-cols-2 gap-5">

          {/* Revenue */}

          <div className="rounded-xl bg-blue-50 p-5">

            <div className="flex items-center gap-2">

              <IndianRupee
                size={18}
                className="text-blue-600"
              />

              <span className="text-sm text-gray-600">
                Project Revenue
              </span>

            </div>

            <h3 className="mt-3 text-2xl font-bold text-blue-700">
              {formatIndianCurrency(revenue)}
            </h3>

          </div>

          {/* Total Cost */}

          <div className="rounded-xl bg-red-50 p-5">

            <div className="flex items-center gap-2">

              <IndianRupee
                size={18}
                className="text-red-600"
              />

              <span className="text-sm text-gray-600">
                Total Cost
              </span>

            </div>

            <h3 className="mt-3 text-2xl font-bold text-red-700">
              {formatIndianCurrency(totalProjectCost)}
            </h3>

          </div>

          {/* Gross Profit */}

          <div
            className={`rounded-xl p-5 ${
              isProfit ? "bg-green-50" : "bg-red-50"
            }`}
          >

            <div className="flex items-center gap-2">

              {isProfit ? (
                <TrendingUp size={18} className="text-green-600" />
              ) : (
                <TrendingDown size={18} className="text-red-600" />
              )}

              <span className="text-sm text-gray-600">
                Gross Profit
              </span>

            </div>

            <h3
              className={`mt-3 text-2xl font-bold ${
                isProfit ? "text-green-700" : "text-red-700"
              }`}
            >
              {formatIndianCurrency(grossProfit)}
            </h3>

          </div>

          {/* Margin */}

          <div
            className={`rounded-xl p-5 ${
              isProfit ? "bg-purple-50" : "bg-red-50"
            }`}
          >

            <div className="flex items-center gap-2">

              {isProfit ? (
                <TrendingUp size={18} className="text-purple-600" />
              ) : (
                <TrendingDown size={18} className="text-red-600" />
              )}

              <span className="text-sm text-gray-600">
                Gross Margin
              </span>

            </div>

            <h3
              className={`mt-3 text-2xl font-bold ${
                isProfit ? "text-purple-700" : "text-red-700"
              }`}
            >
              {formatIndianNumber(profitMargin)}%
            </h3>

          </div>

        </div>

      </div>

    </div>
  );
};

export default ProfitAnalysisCard;
