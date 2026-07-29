import { Banknote, ClipboardList, History, PlusCircle, Receipt, RefreshCcw, Wallet } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { InvoiceItem } from "../../../../types/InvoiceItem";
import { Badge, type Tone } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { formatBusinessINR, formatFullINR } from "../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../utils/quantityCalculations";
import { getInvoiceRaisedAmount, getInvoiceStatus, getPaymentReceivedAmount } from "../../../../services/invoiceProgressService";
import {
  getActivityCompletedQty,
  getActivityRemainingQty,
  getMilestonesForProject,
  getMilestoneSummaryForActivity,
  type MilestoneRowStatus,
} from "./InvoiceCalculations";
import { SummaryCards } from "./SummaryCards";

interface Props {
  project: Project;
  item: InvoiceItem;
  readOnly?: boolean;
  onRaiseInvoice: () => void;
  onViewHistory: () => void;
}

const MILESTONE_STATUS_BADGE: Record<MilestoneRowStatus, { label: string; tone: Tone }> = {
  completed: { label: "Completed", tone: "success" },
  partial: { label: "Partial", tone: "warning" },
  pending: { label: "Pending", tone: "neutral" },
};

export function ActivityDetails({ project, item, readOnly = false, onRaiseInvoice, onViewHistory }: Props) {
  const milestones = getMilestonesForProject(project);
  const completedQty = getActivityCompletedQty(item);
  const remainingQty = getActivityRemainingQty(item);
  const invoiceRaised = getInvoiceRaisedAmount(item);
  const balance = Math.max(item.totalPrice - invoiceRaised, 0);
  const paymentReceived = Math.min(getPaymentReceivedAmount(item), invoiceRaised);
  const outstanding = Math.max(invoiceRaised - paymentReceived, 0);
  const status = getInvoiceStatus(item);
  const progressPercent = item.qty > 0 ? Math.min((completedQty / item.qty) * 100, 100) : 0;
  const milestoneRows = getMilestoneSummaryForActivity(item, milestones);

  const billingTiles = [
    { key: "value", label: "Contract Value", value: formatBusinessINR(item.totalPrice), icon: <Banknote size={15} />, tint: "accent" as const },
    { key: "raised", label: "Invoice Raised", value: formatBusinessINR(invoiceRaised), icon: <Receipt size={15} />, tint: "info" as const },
    { key: "balance", label: "Balance", value: formatBusinessINR(balance), icon: <Wallet size={15} />, tint: "warning" as const },
    { key: "outstanding", label: "Outstanding", value: formatBusinessINR(outstanding), icon: <Wallet size={15} />, tint: "danger" as const },
  ];

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

      {/* Billing Summary */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-md)] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] mb-2.5">Billing Summary</p>
        <SummaryCards tiles={billingTiles} className="grid grid-cols-2 lg:grid-cols-4 gap-3" />
        <p className="mt-2.5 text-[11px] font-semibold whitespace-nowrap" title={formatFullINR(invoiceRaised)}>
          <span className="text-[var(--nu-text-muted)]">Status: </span>
          <span className="text-[var(--nu-text)]">{status}</span>
        </p>
      </div>

      {/* Quick Actions */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2.5">
          {remainingQty <= 0 ? (
            <Button variant="primary" size="sm" disabled className="disabled:cursor-not-allowed disabled:opacity-50">
              Fully Invoiced — No Remaining Quantity
            </Button>
          ) : (
            <Button variant="primary" size="sm" icon={<PlusCircle size={14} />} onClick={onRaiseInvoice}>
              Raise Invoice
            </Button>
          )}
          <Button variant="outline" size="sm" icon={<History size={14} />} onClick={onViewHistory}>
            View History
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCcw size={14} />}
            disabled
            title="Quantity Revisions — coming soon"
            className="disabled:cursor-not-allowed disabled:opacity-50"
          >
            Revise Quantity
          </Button>
        </div>
      )}
    </div>
  );
}
