import { IndianRupee } from "lucide-react";

const CostSummaryCard = () => {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200">

      {/* Header */}

      <div className="flex items-center gap-3 border-b px-6 py-5">

        <div className="h-11 w-11 rounded-xl bg-green-100 flex items-center justify-center">
          <IndianRupee
            size={22}
            className="text-green-600"
          />
        </div>

        <div>

          <h2 className="text-lg font-semibold text-gray-800">
            Cost Breakdown Summary
          </h2>

          <p className="text-sm text-gray-500">
            Auto calculated from manpower and project expenses.
          </p>

        </div>

      </div>

      {/* Body */}

      <div className="p-6">

        <div className="space-y-4">

          <div className="flex justify-between">

            <span className="text-gray-600">
              Total Man-Hour Cost
            </span>

            <span className="font-semibold">
              ₹ 0.00
            </span>

          </div>

          <div className="flex justify-between">

            <span className="text-gray-600">
              Total Other Expenses
            </span>

            <span className="font-semibold">
              ₹ 0.00
            </span>

          </div>

          <hr />

          <div className="flex justify-between text-lg font-bold text-green-700">

            <span>
              Total Project Cost
            </span>

            <span>
              ₹ 0.00
            </span>

          </div>

        </div>

      </div>

    </div>
  );
};

export default CostSummaryCard;