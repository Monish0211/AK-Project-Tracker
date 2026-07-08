import {
  TrendingUp,
  IndianRupee,
} from "lucide-react";

const ProfitAnalysisCard = () => {
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
                Revenue
              </span>

            </div>

            <h3 className="mt-3 text-2xl font-bold text-blue-700">
              ₹ 0.00
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
              ₹ 0.00
            </h3>

          </div>

          {/* Gross Profit */}

          <div className="rounded-xl bg-green-50 p-5">

            <div className="flex items-center gap-2">

              <TrendingUp
                size={18}
                className="text-green-600"
              />

              <span className="text-sm text-gray-600">
                Gross Profit
              </span>

            </div>

            <h3 className="mt-3 text-2xl font-bold text-green-700">
              ₹ 0.00
            </h3>

          </div>

          {/* Margin */}

          <div className="rounded-xl bg-purple-50 p-5">

            <div className="flex items-center gap-2">

              <TrendingUp
                size={18}
                className="text-purple-600"
              />

              <span className="text-sm text-gray-600">
                Gross Margin
              </span>

            </div>

            <h3 className="mt-3 text-2xl font-bold text-purple-700">
              0%
            </h3>

          </div>

        </div>

      </div>

    </div>
  );
};

export default ProfitAnalysisCard;