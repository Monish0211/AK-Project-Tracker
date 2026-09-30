import { useEffect } from "react";
import { ClipboardList, ListChecks, PlusCircle, Send } from "lucide-react";
import type { Project } from "../../../../types/Project";
import { Card, CardBody, CardHeader } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { ActivityRow } from "./ActivityRow";
import { getInvoiceMethod } from "./InvoiceCalculations";

interface Props {
  project: Project;
  readOnly?: boolean;
  onRaiseInvoice: () => void;
  /** Request Invoice workflow — whether the current user holds the "Raise Invoice" approval permission. Raise Invoice stays disabled (not hidden — see Backend's requireApprovalPermission gate, the real enforcement) when false, and "Request Invoice" renders beside it instead. */
  canRaiseInvoice?: boolean;
  /** Request Invoice workflow — opens the Request Invoice form. Omit to hide the action entirely (e.g. read-only contexts). */
  onRequestInvoice?: () => void;
  /** Request Invoice workflow — true while this project already has an Open Invoice Request, so "Request Invoice" can show its pending state instead of allowing a duplicate submission. */
  hasOpenInvoiceRequest?: boolean;
  /** Scrolls this activity's row into view on mount — e.g. when opened via a notification's deep link to a specific invoice/activity. */
  highlightItemId?: string | null;
}

/**
 * Section 2 — read-only, Quantity-Based Billing progress, one flat row per
 * Quantity Details activity (always mirrored automatically, see
 * services/invoiceSyncService.ts). No expand/collapse, no milestone
 * breakdown, no per-row action — every figure is a cumulative roll-up
 * across every invoice ever raised. Invoicing is triggered once,
 * project-wide, via the single "+ Raise Invoice" button in this card's
 * header, which opens the Invoice Cycle picker → Invoice Workspace covering
 * every activity at once.
 */
export function ActivitiesTable({
  project,
  readOnly = false,
  onRaiseInvoice,
  canRaiseInvoice = true,
  onRequestInvoice,
  hasOpenInvoiceRequest = false,
  highlightItemId,
}: Props) {
  const items = project.invoiceItems ?? [];
  // Lump Sum bills against Payment Milestones, not execution quantities —
  // Completed Qty/Remaining Qty don't apply and must not render at all.
  // Quantity Billing's column set stays exactly as it was.
  const isLumpSum = getInvoiceMethod(project) === "lump_sum";
  // MLMP bills against per-SET milestones (cloned from the project's
  // existing Payment Milestones), not activity completion — Completed
  // Qty/Remaining Qty/Progress don't apply and must not render at all,
  // exactly like Lump Sum.
  const isMlmp = getInvoiceMethod(project) === "mlmp";
  // Amount Based bills a direct amount against an activity's remaining
  // Contract Value — no quantity at all, so Order Qty/Completed/Remaining/
  // Progress AND Unit Rate (there's no rate × qty here either) are all
  // meaningless and must not render.
  const isAmountBased = getInvoiceMethod(project) === "amount_based";

  useEffect(() => {
    if (!highlightItemId) return;
    document.getElementById(`activity-row-${highlightItemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Only ever run for the deep-linked activity, once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card padded={false}>
      <CardHeader
        icon={<ListChecks size={16} />}
        title="Activities Billing"
        subtitle="Project billing progress — every activity mirrors Quantity Details automatically"
        action={
          !readOnly && items.length > 0 ? (
            <div className="flex items-center gap-2">
              {onRequestInvoice && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Send size={14} />}
                  onClick={onRequestInvoice}
                  disabled={hasOpenInvoiceRequest}
                  title={hasOpenInvoiceRequest ? "An invoice request is already pending for this project." : undefined}
                >
                  {hasOpenInvoiceRequest ? "Request Pending" : "Request Invoice"}
                </Button>
              )}
              <Button
                variant={canRaiseInvoice ? "primary" : "outline"}
                size="sm"
                icon={<PlusCircle size={14} />}
                onClick={onRaiseInvoice}
                title={!canRaiseInvoice ? "You do not have the Raise Invoice permission — click for details." : undefined}
              >
                Raise Invoice
              </Button>
            </div>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <CardBody>
          <EmptyState
            icon={<ClipboardList size={22} />}
            title="No Work Packages Added"
            description="Add activities in Quantity Details to enable invoicing."
          />
        </CardBody>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="nu-table-th px-3 py-2.5 text-center">Sl No.</th>
                <th className="nu-table-th px-3 py-2.5 text-left">Activity Description</th>
                {!isAmountBased && <th className="nu-table-th px-3 py-2.5 text-right">Order Qty</th>}
                {!isLumpSum && !isMlmp && !isAmountBased && (
                  <>
                    <th className="nu-table-th px-3 py-2.5 text-right">Completed Qty</th>
                    <th className="nu-table-th px-3 py-2.5 text-right">Remaining Qty</th>
                  </>
                )}
                {!isAmountBased && <th className="nu-table-th px-3 py-2.5 text-right">Unit Rate</th>}
                <th className="nu-table-th px-3 py-2.5 text-right">Contract Value</th>
                <th className="nu-table-th px-3 py-2.5 text-right">Invoice Raised</th>
                <th className="nu-table-th px-3 py-2.5 text-right">Balance Value</th>
                <th className="nu-table-th px-3 py-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  slNo={index + 1}
                  isLumpSum={isLumpSum}
                  isMlmp={isMlmp}
                  isAmountBased={isAmountBased}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
