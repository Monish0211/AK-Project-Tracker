import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";
import type { QuantityItem } from "../../../types/QuantityItem";
import {
  calculateQuantity,
  canRemoveQuantityItem,
  createEmptyQuantityItem,
  formatIndianCurrency,
  formatIndianNumber,
  getInvoiceQtyError,
  parseNumericInput,
  recalcQuantityItem,
} from "../../../utils/quantityCalculations";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

type QuantityField = "woQty" | "invoiceQty" | "unitRate";

const NUMBER_INPUT_PATTERN = /^\d*\.?\d*$/;

const DESCRIPTION_PLACEHOLDERS = [
  "Pressure Gauge",
  "Temperature Sensor",
  "Calibration",
  "Inspection",
  "Valve Testing",
];

const LAST_ROW_WARNING = "At least one quantity item is required.";

interface NumericInputProps {
  value: number;
  ariaLabel: string;
  onChange: (nextValue: number) => boolean | void;
  hasError?: boolean;
}

const NumericInput = ({
  value,
  ariaLabel,
  onChange,
  hasError = false,
}: NumericInputProps) => {
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

    const parsedValue = parseNumericInput(nextRaw);
    const isAccepted = onChange(parsedValue) !== false;

    if (!isAccepted) {
      return;
    }

    lastCommittedValue.current = parsedValue;
    setRawValue(nextRaw);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder="0"
      aria-label={ariaLabel}
      aria-invalid={hasError}
      value={rawValue}
      onChange={handleChange}
      className={`w-full rounded-md border bg-transparent px-2 py-1.5 text-right text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:ring-2 ${
        hasError
          ? "border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100"
          : "border-transparent focus:border-blue-400 focus:bg-blue-50 focus:ring-blue-100"
      }`}
    />
  );
};

const applyFieldValue = (
  item: QuantityItem,
  field: QuantityField,
  value: number
): QuantityItem => {
  switch (field) {
    case "woQty":
      return { ...item, woQty: value };

    case "invoiceQty":
      return { ...item, invoiceQty: value };

    case "unitRate":
      return { ...item, unitRate: value };
  }
};

const QuantityCard = ({ project, setProject }: Props) => {
  const handleDescriptionChange = useCallback(
    (index: number, value: string) => {
      setProject((prev) => {
        const updatedItems = prev.quantityItems.map((item, i) =>
          i === index ? { ...item, description: value } : item
        );

        return {
          ...prev,
          quantityItems: updatedItems,
        };
      });
    },
    [setProject]
  );

  const handleFieldChange = useCallback(
    (index: number, field: QuantityField, value: number): boolean => {
      setProject((prev) => {
        const updatedItems = prev.quantityItems.map((item, i) =>
          i === index
            ? recalcQuantityItem(applyFieldValue(item, field, value))
            : item
        );

        return {
          ...prev,
          quantityItems: updatedItems,
          ...calculateQuantity(updatedItems),
        };
      });

      return true;
    },
    [setProject]
  );

  const handleAddItem = useCallback(() => {
    setProject((prev) => {
      const updatedItems = [...prev.quantityItems, createEmptyQuantityItem()];

      return {
        ...prev,
        quantityItems: updatedItems,
        ...calculateQuantity(updatedItems),
      };
    });
  }, [setProject]);

  const handleRemoveItem = useCallback(
    (index: number) => {
      setProject((prev) => {
        if (!canRemoveQuantityItem(prev.quantityItems)) {
          return prev;
        }

        const updatedItems = prev.quantityItems.filter((_, i) => i !== index);

        return {
          ...prev,
          quantityItems: updatedItems,
          ...calculateQuantity(updatedItems),
        };
      });
    },
    [setProject]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">
            Quantity Details
          </h2>
          <p className="text-sm text-slate-500">
            Track work order quantity, invoicing progress, and pending value.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAddItem}
          title="Add a new quantity item"
          className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 active:bg-blue-800 sm:self-auto"
        >
          <Plus size={16} strokeWidth={2.5} />
          Add Item
        </button>
      </div>

      <div className="max-h-[28rem] overflow-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-blue-50 text-xs uppercase tracking-wide text-blue-700">
            <tr>
              <th className="w-14 border-b border-blue-100 px-3 py-3 text-center font-semibold">
                Sl No
              </th>

              <th className="border-b border-blue-100 px-3 py-3 text-left font-semibold">
                Description
              </th>

              <th className="w-32 border-b border-blue-100 px-3 py-3 text-right font-semibold">
                WO Qty
              </th>

              <th className="w-32 border-b border-blue-100 px-3 py-3 text-right font-semibold">
                Invoice Qty
              </th>

              <th className="w-36 border-b border-blue-100 px-3 py-3 text-right font-semibold">
                Pending Qty
              </th>

              <th className="w-32 border-b border-blue-100 px-3 py-3 text-right font-semibold">
                Unit Rate
              </th>

              <th className="w-40 border-b border-blue-100 px-3 py-3 text-right font-semibold">
                Pending Amount
              </th>

              <th className="w-16 border-b border-blue-100 px-3 py-3 text-center font-semibold">
                Delete
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {project.quantityItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-400">
                  No quantity items added. Click "Add Item" to get started.
                </td>
              </tr>
            ) : (
              project.quantityItems.map((item, index) => {
                const invoiceQtyError = getInvoiceQtyError(item);
                const canRemove = canRemoveQuantityItem(project.quantityItems);

                return (
                  <tr
                    key={item.id}
                    className="bg-white transition hover:bg-blue-50/40"
                  >
                    <td className="px-3 py-2 text-center text-slate-500">
                      {index + 1}
                    </td>

                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.description}
                        placeholder={
                          DESCRIPTION_PLACEHOLDERS[
                            index % DESCRIPTION_PLACEHOLDERS.length
                          ]
                        }
                        aria-label={`Description for row ${index + 1}`}
                        onChange={(e) =>
                          handleDescriptionChange(index, e.target.value)
                        }
                        className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:bg-blue-50 focus:ring-2 focus:ring-blue-100"
                      />
                    </td>

                    <td className="px-3 py-2">
                      <NumericInput
                        value={item.woQty}
                        ariaLabel={`WO Qty for row ${index + 1}`}
                        onChange={(value) =>
                          handleFieldChange(index, "woQty", value)
                        }
                      />
                    </td>

                    <td className="px-3 py-2">
                      <NumericInput
                        value={item.invoiceQty}
                        ariaLabel={`Invoice Qty for row ${index + 1}`}
                        hasError={Boolean(invoiceQtyError)}
                        onChange={(value) =>
                          handleFieldChange(index, "invoiceQty", value)
                        }
                      />
                      {invoiceQtyError && (
                        <p
                          role="alert"
                          className="mt-1 text-right text-xs font-medium text-red-600"
                        >
                          {invoiceQtyError}
                        </p>
                      )}
                    </td>

                    <td className="bg-slate-50 px-3 py-2 text-right font-medium text-slate-700">
                      {formatIndianNumber(item.pendingQty)}
                    </td>

                    <td className="px-3 py-2">
                      <NumericInput
                        value={item.unitRate}
                        ariaLabel={`Unit Rate for row ${index + 1}`}
                        onChange={(value) =>
                          handleFieldChange(index, "unitRate", value)
                        }
                      />
                    </td>

                    <td className="bg-slate-50 px-3 py-2 text-right font-semibold text-slate-800">
                      {formatIndianCurrency(item.pendingAmount)}
                    </td>

                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        disabled={!canRemove}
                        aria-label={
                          canRemove
                            ? `Delete row ${index + 1}`
                            : LAST_ROW_WARNING
                        }
                        title={canRemove ? "Delete row" : LAST_ROW_WARNING}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-red-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {project.quantityItems.length === 1 && (
        <p className="mt-2 text-xs font-medium text-slate-400">
          {LAST_ROW_WARNING}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total WO Qty
          </p>
          <p className="mt-1 text-xl font-bold text-slate-800">
            {formatIndianNumber(project.totalWOQty)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Invoice Qty
          </p>
          <p className="mt-1 text-xl font-bold text-slate-800">
            {formatIndianNumber(project.totalInvoiceQty)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Pending Qty
          </p>
          <p className="mt-1 text-xl font-bold text-slate-800">
            {formatIndianNumber(project.totalPendingQty)}
          </p>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-600">
            Total Pending Amount
          </p>
          <p className="mt-1 text-xl font-bold text-blue-700">
            {formatIndianCurrency(project.pendingAmount)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default QuantityCard;
