import { Clock, Package, Wallet, Layers, ListChecks } from "lucide-react";
import type { Project } from "../../../types/Project";
import {
  formatIndianCurrency,
  formatIndianNumber,
  calculateProjectDuration,
} from "../../../utils/quantityCalculations";
import CommercialSummaryCard from "./CommercialSummaryCard";
import { Card, CardHeader } from "../../../components/ui/Card";
import { StatTile } from "../../../components/ui/StatTile";
import { Badge } from "../../../components/ui/Badge";

interface Props {
  project: Project;
}

const QuantityTable = ({ project }: Props) => {
  const items = project.quantityItems;
  const projectDuration = calculateProjectDuration(
    project.projectStartDate,
    project.projectEndDate
  );

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

  return (
    <div className="space-y-3.5">
      <Card padded={false}>
        <CardHeader
          icon={<ListChecks size={16} />}
          title="Quantity Details"
          subtitle="Work order quantities, units, and assignment details"
          action={
            <div className="flex items-center gap-4 text-[12px]">
              <span className="text-[var(--nu-text-muted)]">
                Currency: <span className="font-semibold text-[var(--nu-text)]">{project.currency || "INR"}</span>
              </span>
              {(project.currency || "INR") !== "INR" && (
                <span className="text-[var(--nu-text-muted)]">
                  Exchange Rate:{" "}
                  <span className="font-semibold text-[var(--nu-text)]">{formatIndianNumber(project.currentExchangeRate || 1)}</span>
                </span>
              )}
            </div>
          }
        />

        <div className="max-h-[28rem] overflow-auto nu-scrollbar">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-[var(--nu-surface-alt)] text-[11px] uppercase tracking-wide text-[var(--nu-text-muted)]">
              <tr>
                <th className="w-14 border-b border-[var(--nu-border)] px-3 py-2.5 text-center font-semibold">Sl No</th>
                <th className="border-b border-[var(--nu-border)] px-3 py-2.5 text-left font-semibold">Description</th>
                <th className="w-24 border-b border-[var(--nu-border)] px-3 py-2.5 text-right font-semibold">Qty</th>
                <th className="w-28 border-b border-[var(--nu-border)] px-3 py-2.5 text-center font-semibold">UOM</th>
                <th className="w-28 border-b border-[var(--nu-border)] px-3 py-2.5 text-right font-semibold">Unit Rate</th>
                <th className="w-32 border-b border-[var(--nu-border)] px-3 py-2.5 text-right font-semibold">Unit Rate (INR)</th>
                <th className="w-32 border-b border-[var(--nu-border)] px-3 py-2.5 text-right font-semibold">WO Value</th>
                <th className="w-40 border-b border-[var(--nu-border)] px-3 py-2.5 text-left font-semibold">Assigned To</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[var(--nu-border)]">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-[var(--nu-text-muted)]">
                    No Quantity Details Available
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr key={item.id} className="text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)]">
                    <td className="px-3 py-2.5 text-center text-[var(--nu-text-muted)]">{index + 1}</td>
                    <td className="px-3 py-2.5 font-medium text-[var(--nu-text)] truncate" title={item.description}>
                      {item.description || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatIndianNumber(item.woQty || 0)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <Badge tone="accent">{item.uom || "DAY"}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatIndianNumber(item.unitRate || 0)}</td>
                    <td className="px-3 py-2.5 text-right">{formatIndianNumber(item.unitRateINR || 0)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-[var(--nu-success)]">
                      {formatIndianCurrency(item.woValue || 0)}
                    </td>
                    <td className="px-3 py-2.5 text-left font-medium text-[var(--nu-text-secondary)] truncate" title={item.assignedTo}>
                      {item.assignedTo || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={<Package size={15} />} label="Activities" value={formatIndianNumber(items.length)} tint="accent" />

        <Card>
          <div className="flex items-center justify-between shrink-0 mb-2.5">
            <div className="w-7 h-7 rounded-[var(--nu-radius-md)] flex items-center justify-center bg-[var(--nu-accent-soft)] text-[var(--nu-accent)]">
              <Layers size={15} />
            </div>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--nu-success)] bg-[var(--nu-success-soft)] px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Live
            </span>
          </div>
          <p className="text-[12px] font-medium text-[var(--nu-text-muted)] uppercase tracking-wide">UOM Summary</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-[4.5rem] overflow-y-auto pr-1 nu-scrollbar">
            {sortedUomEntries.length === 0 ? (
              <span className="text-[var(--nu-text-muted)] text-[12px]">No UOM</span>
            ) : (
              sortedUomEntries.map(([uom, qty]) => (
                <span
                  key={uom}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-2 py-0.5 text-[11px] font-semibold text-[var(--nu-text-secondary)]"
                >
                  <span>{uom}</span>
                  <span className="font-bold text-[var(--nu-text)]">{formatIndianNumber(qty)}</span>
                </span>
              ))
            )}
          </div>
        </Card>

        <StatTile icon={<Clock size={15} />} label="Project Duration" value={projectDuration} tint="warning" />

        <StatTile
          icon={<Wallet size={15} />}
          label="Total WO Value"
          value={formatIndianCurrency(project.workOrderValueINR || 0)}
          tint="success"
        />
      </div>

      <CommercialSummaryCard
        currency={project.currency}
        workOrderValueINR={project.workOrderValueINR}
        gstApplicable={project.gstApplicable}
        gstRate={project.gstRate}
        gstAmount={project.gstAmount}
        grandTotal={project.grandTotal}
        editable={false}
      />
    </div>
  );
};

export default QuantityTable;
