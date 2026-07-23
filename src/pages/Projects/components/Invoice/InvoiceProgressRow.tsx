import type { InvoiceItem } from "../../../../types/InvoiceItem";
import type { InvoiceStatus } from "../../../../services/invoiceProgressService";

import {
  getInvoiceRaisedAmount,
  getInvoiceStatus,
  getRowBalancePercentage,
  getRowInvoicePercentage,
} from "../../../../services/invoiceProgressService";
import {
  formatIndianCurrency,
  formatIndianNumber,
} from "../../../../utils/quantityCalculations";
import { Badge } from "../../../../components/ui/Badge";
import type { Tone } from "../../../../components/ui/Badge";

const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  Pending: "neutral",
  "Partially Invoiced": "warning",
  Completed: "success",
};

interface Props {
  item: InvoiceItem;
  index: number;
}

const InvoiceProgressRow = ({ item, index }: Props) => {
  const invoiceRaised = getInvoiceRaisedAmount(item);
  const invoicePercentage = getRowInvoicePercentage(item);
  const balancePercentage = getRowBalancePercentage(item);
  const status = getInvoiceStatus(item);

  return (
    <tr className="text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)]">
      <td className="px-3 py-2.5 text-center text-[var(--nu-text-muted)] sticky left-0 z-10 bg-[var(--nu-surface)]">{index + 1}</td>

      <td className="px-3 py-2.5">
        <span className="font-medium text-[var(--nu-text)]" title={item.description}>
          {item.description || "—"}
        </span>
      </td>

      <td className="px-3 py-2.5 text-right">{formatIndianNumber(item.qty)}</td>

      <td className="px-3 py-2.5 text-center">
        <Badge tone="accent">{item.uom}</Badge>
      </td>

      <td className="px-3 py-2.5 text-right">{formatIndianCurrency(item.unitPrice)}</td>

      <td className="px-3 py-2.5 text-right font-semibold text-[var(--nu-text)]">
        {formatIndianCurrency(item.totalPrice)}
      </td>

      <td className="px-3 py-2.5 text-right font-semibold text-[var(--nu-accent)]">
        {formatIndianCurrency(invoiceRaised)}
      </td>

      <td className="px-3 py-2.5 text-right">{invoicePercentage.toFixed(2)}%</td>

      <td className="px-3 py-2.5 text-right">{balancePercentage.toFixed(2)}%</td>

      <td className="px-3 py-2.5 text-center">
        <Badge tone={STATUS_TONE[status]}>{status}</Badge>
      </td>
    </tr>
  );
};

export default InvoiceProgressRow;
