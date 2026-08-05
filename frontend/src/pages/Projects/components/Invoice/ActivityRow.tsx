import type { InvoiceItem } from "../../../../types/InvoiceItem";
import { Badge, type Tone } from "../../../../components/ui/Badge";
import { MoneyValue } from "../../../../components/ui/MoneyTooltip";
import { formatIndianCurrency } from "../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../utils/quantityCalculations";
import {
  getInvoiceRaisedAmount,
  calculateInvoiceStatus,
  calculateCumulativeProgress,
  type InvoiceStatus,
} from "./InvoiceCalculations";

interface Props {
  item: InvoiceItem;
  slNo: number;
  /** Lump Sum bills against Payment Milestones, not execution quantities — Completed Qty/Remaining Qty are meaningless for it and must not render at all. */
  isLumpSum: boolean;
}

const STATUS_BADGE: Record<InvoiceStatus, Tone> = {
  Pending: "neutral",
  "Partially Invoiced": "warning",
  Completed: "success",
};

/**
 * A single, flat read-only progress row — Quantity-Based Billing only, no
 * expand/collapse, no milestone breakdown. Everything here is a cumulative
 * roll-up across every invoice ever raised for this activity (see
 * calculateCumulativeProgress / getInvoiceRaisedAmount) — all invoicing
 * itself happens through the single project-wide "+ Raise Invoice" workflow,
 * never from this table.
 */
export function ActivityRow({ item, slNo, isLumpSum }: Props) {
  const invoiceRaised = getInvoiceRaisedAmount(item);
  const balance = Math.max(item.totalPrice - invoiceRaised, 0);
  const status = calculateInvoiceStatus(item);

  // Completed/Remaining Qty only ever needs computing for the Quantity
  // Billing column set — never call this for a Lump Sum project.
  const { completedQty, remainingQty } = isLumpSum
    ? { completedQty: 0, remainingQty: 0 }
    : calculateCumulativeProgress(item);

  return (
    <tr id={`activity-row-${item.id}`} className="nu-table-row">
      <td className="px-3 py-3 text-center text-[var(--nu-text-muted)] whitespace-nowrap">{slNo}</td>
      <td className="px-3 py-3 font-semibold text-[var(--nu-text)] max-w-[220px] break-words">{item.description}</td>
      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{formatIndianNumber(item.qty)} {item.uom}</td>
      {!isLumpSum && (
        <>
          <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{formatIndianNumber(completedQty)}</td>
          <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-[var(--nu-text-secondary)]">{formatIndianNumber(remainingQty)}</td>
        </>
      )}
      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{formatIndianCurrency(item.unitPrice)}</td>
      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
        <MoneyValue value={item.totalPrice} />
      </td>
      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
        <MoneyValue value={invoiceRaised} className="font-semibold text-[var(--nu-accent)]" />
      </td>
      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
        <MoneyValue value={balance} />
      </td>
      <td className="px-3 py-3 text-center whitespace-nowrap">
        <Badge tone={STATUS_BADGE[status]} dot className="text-[10.5px]">{status}</Badge>
      </td>
    </tr>
  );
}
