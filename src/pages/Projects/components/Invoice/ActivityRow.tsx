import { Fragment } from "react";
import { ChevronDown, ChevronUp, PlusCircle } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { InvoiceItem } from "../../../../types/InvoiceItem";
import { Badge, type Tone } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { formatBusinessINR, formatFullINR } from "../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../utils/quantityCalculations";
import {
  getInvoiceRaisedAmount,
  calculateInvoiceStatus,
  calculateExecutionProgress,
  getBillingTypeLabel,
  type InvoiceStatus,
} from "./InvoiceCalculations";
import { ActivityDetails } from "./ActivityDetails";

interface Props {
  project: Project;
  item: InvoiceItem;
  isExpanded: boolean;
  readOnly?: boolean;
  onToggleExpand: () => void;
  onRaiseInvoice: () => void;
}

const STATUS_BADGE: Record<InvoiceStatus, Tone> = {
  Pending: "neutral",
  "Partially Invoiced": "warning",
  Completed: "success",
};

export function ActivityRow({ project, item, isExpanded, readOnly = false, onToggleExpand, onRaiseInvoice }: Props) {
  const { completedQty, remainingQty } = calculateExecutionProgress(item);
  const invoiceRaised = getInvoiceRaisedAmount(item);
  const balance = Math.max(item.totalPrice - invoiceRaised, 0);
  const status = calculateInvoiceStatus(item);
  const billingType = getBillingTypeLabel(project);

  return (
    <Fragment>
      <tr className="nu-table-row">
        <td className="px-3 py-3 font-semibold text-[var(--nu-text)] max-w-[220px] break-words">{item.description}</td>
        <td className="px-3 py-3 text-center whitespace-nowrap">
          <Badge tone="info" className="text-[10.5px]">{billingType}</Badge>
        </td>
        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{formatIndianNumber(item.qty)} {item.uom}</td>
        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{formatIndianNumber(completedQty)}</td>
        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-[var(--nu-text-secondary)]">{formatIndianNumber(remainingQty)}</td>
        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap" title={formatFullINR(item.totalPrice)}>
          {formatBusinessINR(item.totalPrice)}
        </td>
        <td className="px-3 py-3 text-right tabular-nums font-semibold text-[var(--nu-accent)] whitespace-nowrap" title={formatFullINR(invoiceRaised)}>
          {formatBusinessINR(invoiceRaised)}
        </td>
        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap" title={formatFullINR(balance)}>
          {formatBusinessINR(balance)}
        </td>
        <td className="px-3 py-3 text-center whitespace-nowrap">
          <Badge tone={STATUS_BADGE[status]} dot className="text-[10.5px]">{status}</Badge>
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center justify-center gap-1.5">
            {!readOnly && balance > 0 && (
              <Button variant="primary" size="sm" icon={<PlusCircle size={12} />} onClick={onRaiseInvoice}>
                Raise Invoice
              </Button>
            )}
            <button
              type="button"
              onClick={onToggleExpand}
              className="inline-flex items-center justify-center w-7 h-7 rounded-[var(--nu-radius-sm)] text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] transition-colors cursor-pointer shrink-0"
              aria-label={isExpanded ? "Collapse activity details" : "Expand activity details"}
            >
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={10} className="bg-[var(--nu-surface-alt)] px-4 py-4 border-b border-[var(--nu-border)]">
            <ActivityDetails project={project} item={item} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}
