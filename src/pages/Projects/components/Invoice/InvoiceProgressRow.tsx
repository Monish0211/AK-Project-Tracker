import { History, Plus } from "lucide-react";

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

const STATUS_BADGE_STYLES: Record<InvoiceStatus, string> = {
  Pending: "bg-gray-100 text-gray-600 border-gray-200",
  "Partially Invoiced": "bg-orange-50 text-orange-700 border-orange-200",
  Completed: "bg-green-50 text-green-700 border-green-200",
};

interface Props {
  item: InvoiceItem;
  index: number;
  readOnly: boolean;
  onRaiseInvoice: (itemId: string) => void;
  onViewHistory: (itemId: string) => void;
}

const InvoiceProgressRow = ({
  item,
  index,
  readOnly,
  onRaiseInvoice,
  onViewHistory,
}: Props) => {
  const invoiceRaised = getInvoiceRaisedAmount(item);
  const invoicePercentage = getRowInvoicePercentage(item);
  const balancePercentage = getRowBalancePercentage(item);
  const status = getInvoiceStatus(item);

  return (
    <tr className="text-sm text-gray-700 hover:bg-gray-50">
      <td className="px-3 py-3 text-center text-slate-500">{index + 1}</td>

      <td className="px-3 py-3">
        <span className="font-medium text-gray-800" title={item.description}>
          {item.description || "—"}
        </span>
      </td>

      <td className="px-3 py-3 text-right">
        {formatIndianNumber(item.qty)}
      </td>

      <td className="px-3 py-3 text-center">
        <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
          {item.uom}
        </span>
      </td>

      <td className="px-3 py-3 text-right">
        {formatIndianCurrency(item.unitPrice)}
      </td>

      <td className="px-3 py-3 text-right font-semibold text-slate-800">
        {formatIndianCurrency(item.totalPrice)}
      </td>

      <td className="px-3 py-3 text-right font-semibold text-blue-700">
        {formatIndianCurrency(invoiceRaised)}
      </td>

      <td className="px-3 py-3 text-right">
        {invoicePercentage.toFixed(2)}%
      </td>

      <td className="px-3 py-3 text-right">
        {balancePercentage.toFixed(2)}%
      </td>

      <td className="px-3 py-3 text-center">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE_STYLES[status]}`}
        >
          {status}
        </span>
      </td>

      {!readOnly && (
        <td className="px-3 py-3">
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => onRaiseInvoice(item.id)}
              title="Update Billing Progress"
              className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition"
            >
              <Plus size={16} />
            </button>

            <button
              onClick={() => onViewHistory(item.id)}
              title="Billing History"
              disabled={item.invoices.length === 0}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              <History size={16} />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
};

export default InvoiceProgressRow;
