import { Landmark, Info } from "lucide-react";

import { formatIndianCurrency } from "../../../utils/quantityCalculations";

interface Props {
  currency: string;
  workOrderValueINR: number;
  gstApplicable: boolean;
  gstRate: number;
  gstAmount: number;
  grandTotal: number;
  /** When true, shows the GST dropdown. When false (View Project / reference), renders a read-only badge. */
  editable: boolean;
  onGstApplicableChange?: (value: boolean) => void;
}

const CommercialSummaryCard = ({
  currency,
  workOrderValueINR,
  gstApplicable,
  gstRate,
  gstAmount,
  grandTotal,
  editable,
  onGstApplicableChange,
}: Props) => {
  const isGstEligible = currency === "INR";
  const isGstEffective = isGstEligible && gstApplicable;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-600 text-white shadow-sm">
            <Landmark size={20} strokeWidth={2.25} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Commercial Summary
            </h2>
            <p className="text-sm text-slate-500">
              Project Commercial Calculation Overview
            </p>
          </div>
        </div>

        {editable ? (
          <div className="w-full sm:w-48">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              GST
            </label>
            <select
              value={gstApplicable ? "Applicable" : "Not Applicable"}
              disabled={!isGstEligible}
              onChange={(e) =>
                onGstApplicableChange?.(e.target.value === "Applicable")
              }
              className={`h-10 w-full rounded-lg border px-3 text-sm font-medium outline-none transition-all duration-150 focus:ring-2 ${
                isGstEligible
                  ? "border-gray-200 bg-white text-slate-800 focus:border-blue-500 focus:ring-blue-500/20"
                  : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
              }`}
            >
              <option value="Not Applicable">Not Applicable</option>
              <option value="Applicable">Applicable</option>
            </select>
          </div>
        ) : (
          <span
            className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${
              isGstEffective
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            GST: {isGstEffective ? "Applicable" : "Not Applicable"}
          </span>
        )}
      </div>

      {!isGstEligible && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <Info size={16} strokeWidth={2.25} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">GST Not Applicable.</span>{" "}
            GST calculations are available only for INR projects.
          </p>
        </div>
      )}

      {/* Rows */}
      <div className="divide-y divide-slate-100">
        <div className="flex items-center justify-between py-3">
          <span className="text-sm font-medium text-slate-600">
            Total Work Order Value
          </span>
          <span className="text-sm font-bold text-blue-600">
            {formatIndianCurrency(workOrderValueINR)}
          </span>
        </div>

        <div className="flex items-center justify-between py-3">
          <span className="text-sm font-medium text-slate-600">
            GST Applicability
          </span>
          <span className="text-sm font-semibold text-slate-800">
            {isGstEffective ? "Applicable" : "Not Applicable"}
          </span>
        </div>

        <div className="flex items-center justify-between py-3">
          <span className="text-sm font-medium text-slate-600">
            GST Rate
          </span>
          <span className="text-sm font-semibold text-slate-800">
            {gstRate}%
          </span>
        </div>

        <div className="flex items-center justify-between py-3">
          <span className="text-sm font-medium text-slate-600">
            GST Amount
          </span>
          <span className="text-sm font-bold text-orange-600">
            {formatIndianCurrency(gstAmount)}
          </span>
        </div>
      </div>

      {/* Grand Total */}
      <div className="mt-4 flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-5 py-4">
        <span className="text-sm font-semibold uppercase tracking-wide text-green-700">
          Grand Total (Incl. GST)
        </span>
        <span className="text-xl font-bold text-green-700">
          {formatIndianCurrency(grandTotal)}
        </span>
      </div>
    </div>
  );
};

export default CommercialSummaryCard;
