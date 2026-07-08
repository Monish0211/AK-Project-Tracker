import { Clock, Package, Receipt, Wallet } from "lucide-react";

import type { Project } from "../../../types/Project";

import {
  formatIndianCurrency,
  formatIndianNumber,
} from "../../../utils/quantityCalculations";

interface Props {
  project: Project;
}

interface QuantityKpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "blue" | "purple" | "orange" | "green";
}

const ACCENT_STYLES: Record<
  QuantityKpiCardProps["accent"],
  { iconBg: string; iconText: string; valueText: string }
> = {
  blue: { iconBg: "bg-blue-50", iconText: "text-blue-600", valueText: "text-slate-800" },
  purple: { iconBg: "bg-purple-50", iconText: "text-purple-600", valueText: "text-slate-800" },
  orange: { iconBg: "bg-orange-50", iconText: "text-orange-600", valueText: "text-slate-800" },
  green: { iconBg: "bg-green-50", iconText: "text-green-600", valueText: "text-green-600" },
};

const QuantityKpiCard = ({ icon, label, value, accent }: QuantityKpiCardProps) => {
  const styles = ACCENT_STYLES[accent];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles.iconBg} ${styles.iconText}`}>
        {icon}
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${styles.valueText}`}>{value}</p>
    </div>
  );
};

const QuantityTable = ({ project }: Props) => {
  const items = project.quantityItems;

  return (
    <div className="space-y-6">

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">

        <div className="border-b border-gray-100 px-6 py-5">
          <h3 className="text-base font-semibold text-slate-800">
            Quantity Details
          </h3>
          <p className="text-sm text-slate-500">
            Work order quantities, invoice progress and pending values.
          </p>
        </div>

        <div className="max-h-[28rem] overflow-auto">

          <table className="w-full min-w-[680px] table-fixed border-collapse text-sm">

            <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">

              <tr>
                <th className="w-14 border-b border-slate-200 px-3 py-3 text-center font-semibold">
                  Sl No
                </th>

                <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">
                  Description
                </th>

                <th className="w-28 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                  WO Qty
                </th>

                <th className="w-24 border-b border-slate-200 px-3 py-3 text-center font-semibold">
                  Currency
                </th>

                <th className="w-28 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                  Unit Rate
                </th>

                <th className="w-36 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                  Pending Amount
                </th>
              </tr>

            </thead>

            <tbody className="divide-y divide-gray-100">

              {items.length === 0 ? (

                <tr>
                  <td colSpan={6} className="py-14 text-center text-slate-400">
                    No Quantity Details Available
                  </td>
                </tr>

              ) : (

                items.map((item, index) => (

                  <tr key={item.id} className="text-sm text-gray-700 hover:bg-gray-50">

                    <td className="px-3 py-3 text-center text-slate-500">
                      {index + 1}
                    </td>

                    <td className="px-3 py-3 font-medium text-gray-800">
                      {item.description || "—"}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatIndianNumber(item.woQty)}
                    </td>

                    <td className="px-3 py-3 text-center">
                      {item.currency || "INR"}
                    </td>

                    <td className="px-3 py-3 text-right">
                      {formatIndianNumber(item.unitRate)}
                    </td>

                    <td className="px-3 py-3 text-right font-semibold text-green-600">
                      {formatIndianCurrency(item.pendingAmount)}
                    </td>

                  </tr>

                ))

              )}

            </tbody>

          </table>

        </div>

      </div>

      {/* KPI Cards */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <QuantityKpiCard
          icon={<Package size={18} strokeWidth={2.25} />}
          label="Total WO Qty"
          value={formatIndianNumber(project.totalWOQty)}
          accent="blue"
        />

        <QuantityKpiCard
          icon={<Receipt size={18} strokeWidth={2.25} />}
          label="Total Invoice Qty"
          value={formatIndianNumber(project.totalInvoiceQty)}
          accent="purple"
        />

        <QuantityKpiCard
          icon={<Clock size={18} strokeWidth={2.25} />}
          label="Total Pending Qty"
          value={formatIndianNumber(project.totalPendingQty)}
          accent="orange"
        />

        <QuantityKpiCard
          icon={<Wallet size={18} strokeWidth={2.25} />}
          label="Total Pending Amount"
          value={formatIndianCurrency(project.pendingAmount)}
          accent="green"
        />

      </div>

    </div>
  );
};

export default QuantityTable;
