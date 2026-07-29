import { ClipboardList } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { InvoiceItem } from "../../../../types/InvoiceItem";
import { Badge, type Tone } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { formatIndianNumber } from "../../../../utils/quantityCalculations";
import {
  getActivityCompletedQty,
  getActivityRemainingQty,
  getMilestonesForProject,
  getMilestoneSummaryForActivity,
  type MilestoneRowStatus,
} from "./InvoiceCalculations";

interface Props {
  project: Project;
  item: InvoiceItem;
}

const MILESTONE_STATUS_BADGE: Record<MilestoneRowStatus, { label: string; tone: Tone }> = {
  completed: { label: "Completed", tone: "success" },
  partial: { label: "Partial", tone: "warning" },
  pending: { label: "Pending", tone: "neutral" },
};

/**
 * Expanded row content — Quantity Progress + Milestone Summary. The
 * Billing Summary cards and Raise Invoice quick action were dropped since
 * they duplicated figures/actions already on the collapsed row itself
 * (see ActivityRow.tsx).
 */
export function ActivityDetails({ project, item }: Props) {
  const completedQty = getActivityCompletedQty(item);
  const remainingQty = getActivityRemainingQty(item);
  const progressPercent = item.qty > 0 ? Math.min((completedQty / item.qty) * 100, 100) : 0;

  const milestones = getMilestonesForProject(project);
  const milestoneRows = getMilestoneSummaryForActivity(item, milestones);

  return (
    <div className="space-y-4">
      {/* Quantity Progress */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] mb-2.5">Quantity Progress</p>
        <div className="h-2 w-full rounded-full bg-[var(--nu-surface-alt)] overflow-hidden mb-2.5">
          <div className="h-full rounded-full bg-[var(--nu-accent)] transition-all duration-500" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-3.5">
          <div>
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Contract Qty</p>
            <p className="text-[14px] font-bold text-[var(--nu-text)] tabular-nums">{formatIndianNumber(item.qty)} {item.uom}</p>
          </div>
          <div>
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Completed Qty</p>
            <p className="text-[14px] font-bold text-[var(--nu-success)] tabular-nums">{formatIndianNumber(completedQty)} {item.uom}</p>
          </div>
          <div>
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Remaining Qty</p>
            <p className="text-[14px] font-bold text-[var(--nu-warning)] tabular-nums">{formatIndianNumber(remainingQty)} {item.uom}</p>
          </div>
        </div>
      </div>

      {/* Milestone Summary */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] overflow-hidden">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] px-4 pt-4 pb-2.5">Milestone Summary</p>
        {milestoneRows.length === 0 ? (
          <div className="pb-2">
            <EmptyState
              icon={<ClipboardList size={20} />}
              title="No Payment Milestones Configured"
              description="Define payment milestones for this project in the Payments tab to reference them here — not required to raise an invoice."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <th className="nu-table-th px-4 py-2 text-left">Milestone</th>
                  <th className="nu-table-th px-4 py-2 text-center">%</th>
                  <th className="nu-table-th px-4 py-2 text-right">Completed Qty</th>
                  <th className="nu-table-th px-4 py-2 text-right">Invoiced Qty</th>
                  <th className="nu-table-th px-4 py-2 text-right">Pending Qty</th>
                  <th className="nu-table-th px-4 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {milestoneRows.map((row) => {
                  const badge = MILESTONE_STATUS_BADGE[row.status];
                  return (
                    <tr key={row.id} className="nu-table-row">
                      <td className="px-4 py-2.5 font-semibold text-[var(--nu-text)] break-words">{row.label}</td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-[var(--nu-text-secondary)]">{row.percent}%</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatIndianNumber(row.completedQty)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatIndianNumber(row.invoicedQty)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-[var(--nu-text-secondary)]">{formatIndianNumber(row.pendingQty)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge tone={badge.tone} dot className="text-[10.5px]">
                          {badge.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
