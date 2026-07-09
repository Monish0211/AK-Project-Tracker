import { Clock, Package, Wallet, Layers } from "lucide-react";
import type { Project } from "../../../types/Project";
import {
  formatIndianCurrency,
  formatIndianNumber,
  calculateProjectDuration,
} from "../../../utils/quantityCalculations";

interface Props {
  project: Project;
}

interface QuantityKpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
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
      <div className={`mt-1 ${typeof value === "string" ? "text-2xl font-bold " + styles.valueText : ""}`}>
        {value}
      </div>
    </div>
  );
};

const QuantityTable = ({ project }: Props) => {
  const items = project.quantityItems;
  const projectDuration = calculateProjectDuration(
    project.projectStartDate,
    project.projectEndDate
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {/* Header with Currency info */}
        <div className="border-b border-gray-100 px-6 py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              Quantity Details
            </h3>
            <p className="text-sm text-slate-500">
              Work order quantities, units, and assignment details.
            </p>
          </div>
          <div className="flex gap-6 text-sm text-slate-600 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
            <div>
              <span className="font-semibold text-slate-500 uppercase tracking-wider text-xs mr-2">Currency:</span>
              <span className="font-bold text-slate-800">{project.currency || "INR"}</span>
            </div>
            {(project.currency || "INR") !== "INR" && (
              <div>
                <span className="font-semibold text-slate-500 uppercase tracking-wider text-xs mr-2">Exchange Rate:</span>
                <span className="font-bold text-slate-800">{formatIndianNumber(project.currentExchangeRate || 1)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-14 border-b border-slate-200 px-3 py-3 text-center font-semibold">
                  Sl No
                </th>
                <th className="border-b border-slate-200 px-3 py-3 text-left font-semibold">
                  Description
                </th>
                <th className="w-24 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                  Qty
                </th>
                <th className="w-28 border-b border-slate-200 px-3 py-3 text-center font-semibold">
                  UOM
                </th>
                <th className="w-28 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                  Unit Rate
                </th>
                <th className="w-32 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                  Unit Rate (INR)
                </th>
                <th className="w-32 border-b border-slate-200 px-3 py-3 text-right font-semibold">
                  WO Value
                </th>
                <th className="w-40 border-b border-slate-200 px-3 py-3 text-left font-semibold">
                  Assigned To
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-slate-400">
                    No Quantity Details Available
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.id} className="text-sm text-gray-700 hover:bg-gray-50">
                    <td className="px-3 py-3 text-center text-slate-500">
                      {index + 1}
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-800 truncate" title={item.description}>
                      {item.description || "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatIndianNumber(item.woQty || 0)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                        {item.uom || "DAY"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatIndianNumber(item.unitRate || 0)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatIndianNumber(item.unitRateINR || 0)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-green-600">
                      {formatIndianCurrency(item.woValue || 0)}
                    </td>
                    <td className="px-3 py-3 text-left font-medium text-slate-600 truncate" title={item.assignedTo}>
                      {item.assignedTo || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* KPI Cards */}
      {(() => {
        const uomGroups: Record<string, number> = {};
        items.forEach((item) => {
          const uom = (item.uom || "DAY").trim().toUpperCase();
          uomGroups[uom] = (uomGroups[uom] || 0) + (item.woQty || 0);
        });

        const UOM_SORT_ORDER = [
          "LUMP SUM",
          "MAN-HOUR",
          "MAN-DAY",
          "DAY",
          "MONTH",
          "VISIT",
          "PERSON",
          "JOB",
          "PACKAGE",
          "NOS",
          "LOT",
          "SET",
          "TRIP",
        ];

        const sortedUomEntries = Object.entries(uomGroups).sort(([a], [b]) => {
          const idxA = UOM_SORT_ORDER.indexOf(a);
          const idxB = UOM_SORT_ORDER.indexOf(b);
          if (idxA === -1 && idxB === -1) return a.localeCompare(b);
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });

        const uomSummaryNode = (
          <div className="flex flex-wrap gap-1.5 mt-1 max-h-[4.5rem] overflow-y-auto pr-1">
            {sortedUomEntries.length === 0 ? (
              <span className="text-slate-400 text-sm">No UOM</span>
            ) : (
              sortedUomEntries.map(([uom, qty]) => (
                <span
                  key={uom}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 shadow-sm"
                >
                  <span>{uom}</span>
                  <span className="h-4 w-px bg-purple-250/50" />
                  <span className="font-bold text-slate-800">{formatIndianNumber(qty)}</span>
                </span>
              ))
            )}
          </div>
        );

        return (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <QuantityKpiCard
              icon={<Package size={18} strokeWidth={2.25} />}
              label="Activities"
              value={formatIndianNumber(items.length)}
              accent="blue"
            />

            <QuantityKpiCard
              icon={<Layers size={18} strokeWidth={2.25} />}
              label="UOM Summary"
              value={uomSummaryNode}
              accent="purple"
            />

            <QuantityKpiCard
              icon={<Clock size={18} strokeWidth={2.25} />}
              label="Project Duration"
              value={projectDuration}
              accent="orange"
            />

            <QuantityKpiCard
              icon={<Wallet size={18} strokeWidth={2.25} />}
              label="Total WO Value"
              value={formatIndianCurrency(project.workOrderValueINR || 0)}
              accent="green"
            />
          </div>
        );
      })()}
    </div>
  );
};

export default QuantityTable;
