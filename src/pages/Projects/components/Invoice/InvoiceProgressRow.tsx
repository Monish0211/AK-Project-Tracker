import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { History, Plus, Trash2 } from "lucide-react";

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

const NUMBER_INPUT_PATTERN = /^\d*\.?\d*$/;

const STATUS_BADGE_STYLES: Record<InvoiceStatus, string> = {
  Pending: "bg-gray-100 text-gray-600 border-gray-200",
  "Partially Invoiced": "bg-orange-50 text-orange-700 border-orange-200",
  Completed: "bg-green-50 text-green-700 border-green-200",
};

interface NumericInputProps {
  value: number;
  ariaLabel: string;
  onChange: (nextValue: number) => void;
}

const NumericInput = ({ value, ariaLabel, onChange }: NumericInputProps) => {
  const [rawValue, setRawValue] = useState<string>(
    value === 0 ? "" : String(value)
  );

  const lastCommittedValue = useRef<number>(value);

  useEffect(() => {
    if (value !== lastCommittedValue.current) {
      lastCommittedValue.current = value;
      setRawValue(value === 0 ? "" : String(value));
    }
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextRaw = event.target.value;

    if (nextRaw !== "" && !NUMBER_INPUT_PATTERN.test(nextRaw)) {
      return;
    }

    const parsedValue = nextRaw.trim() === "" ? 0 : Number(nextRaw);

    lastCommittedValue.current = parsedValue;
    setRawValue(nextRaw);
    onChange(parsedValue);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder="0"
      aria-label={ariaLabel}
      value={rawValue}
      onChange={handleChange}
      className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-right text-sm text-slate-800 outline-none transition-all duration-150 placeholder:text-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
    />
  );
};

interface Props {
  item: InvoiceItem;
  index: number;
  readOnly: boolean;
  canRemove: boolean;
  onFieldChange: (
    itemId: string,
    field: "description" | "location",
    value: string
  ) => void;
  onNumericFieldChange: (
    itemId: string,
    field: "numberOfDays" | "unitPrice",
    value: number
  ) => void;
  onRaiseInvoice: (itemId: string) => void;
  onViewHistory: (itemId: string) => void;
  onDeleteRow: (itemId: string) => void;
}

const InvoiceProgressRow = ({
  item,
  index,
  readOnly,
  canRemove,
  onFieldChange,
  onNumericFieldChange,
  onRaiseInvoice,
  onViewHistory,
  onDeleteRow,
}: Props) => {
  const invoiceRaised = getInvoiceRaisedAmount(item);
  const invoicePercentage = getRowInvoicePercentage(item);
  const balancePercentage = getRowBalancePercentage(item);
  const status = getInvoiceStatus(item);

  const handleDeleteRow = () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this work package? All invoices raised against it will be removed."
      )
    ) {
      return;
    }

    onDeleteRow(item.id);
  };

  return (
    <tr className="text-sm text-gray-700 hover:bg-gray-50">
      <td className="px-3 py-3 text-center text-slate-500">{index + 1}</td>

      <td className="px-3 py-3">
        {readOnly ? (
          <span className="font-medium text-gray-800">
            {item.description || "—"}
          </span>
        ) : (
          <input
            type="text"
            value={item.description}
            placeholder="Work package description"
            aria-label={`Description for row ${index + 1}`}
            onChange={(e) =>
              onFieldChange(item.id, "description", e.target.value)
            }
            className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        )}
      </td>

      <td className="px-3 py-3">
        {readOnly ? (
          <span className="block text-right">
            {formatIndianNumber(item.numberOfDays)}
          </span>
        ) : (
          <NumericInput
            value={item.numberOfDays}
            ariaLabel={`Number of days for row ${index + 1}`}
            onChange={(value) =>
              onNumericFieldChange(item.id, "numberOfDays", value)
            }
          />
        )}
      </td>

      <td className="px-3 py-3">
        {readOnly ? (
          <span>{item.location || "—"}</span>
        ) : (
          <input
            type="text"
            value={item.location}
            placeholder="Site / location"
            aria-label={`Location for row ${index + 1}`}
            onChange={(e) =>
              onFieldChange(item.id, "location", e.target.value)
            }
            className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        )}
      </td>

      <td className="px-3 py-3">
        {readOnly ? (
          <span className="block text-right">
            {formatIndianCurrency(item.unitPrice)}
          </span>
        ) : (
          <NumericInput
            value={item.unitPrice}
            ariaLabel={`Unit price for row ${index + 1}`}
            onChange={(value) =>
              onNumericFieldChange(item.id, "unitPrice", value)
            }
          />
        )}
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
              title="Raise Invoice"
              className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition"
            >
              <Plus size={16} />
            </button>

            <button
              onClick={() => onViewHistory(item.id)}
              title="Invoice History"
              disabled={item.invoices.length === 0}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              <History size={16} />
            </button>

            <button
              onClick={handleDeleteRow}
              disabled={!canRemove}
              title={
                canRemove
                  ? "Delete work package"
                  : "At least one work package is required"
              }
              className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
};

export default InvoiceProgressRow;
