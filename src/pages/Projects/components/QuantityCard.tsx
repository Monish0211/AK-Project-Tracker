import { Clock, Package, Plus, Trash2, Wallet, Layers } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";
import type { QuantityItem } from "../../../types/QuantityItem";
import { getEmployees } from "../../../services/employeeService";
import {
  calculateQuantity,
  canRemoveQuantityItem,
  createEmptyQuantityItem,
  formatIndianCurrency,
  formatIndianNumber,
  parseNumericInput,
  recalcQuantityItem,
  calculateProjectDuration,
  UOM_OPTIONS,
} from "../../../utils/quantityCalculations";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

const NUMBER_INPUT_PATTERN = /^\d*\.?\d*$/;

const DESCRIPTION_PLACEHOLDERS = [
  "Pressure Gauge",
  "Temperature Sensor",
  "Calibration",
  "Inspection",
  "Valve Testing",
];

const LAST_ROW_WARNING = "At least one quantity item is required.";

const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "AED", "MYR", "QAR", "OMR"];

const DEFAULT_CURRENCY = "INR";

interface NumericInputProps {
  value: number;
  ariaLabel: string;
  onChange: (nextValue: number) => boolean | void;
  hasError?: boolean;
  prefix?: string;
  disabled?: boolean;
}

const NumericInput = ({
  value,
  ariaLabel,
  onChange,
  hasError = false,
  prefix,
  disabled = false,
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

  const input = (
    <input
      type="text"
      inputMode="decimal"
      placeholder="0"
      aria-label={ariaLabel}
      aria-invalid={hasError}
      value={rawValue}
      disabled={disabled}
      onChange={handleChange}
      className={`h-10 w-full rounded-lg border text-right text-sm outline-none transition-all duration-150 placeholder:text-slate-300 focus:ring-2 ${
        prefix ? "pl-7 pr-3" : "px-3"
      } ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
          : hasError
          ? "border-red-300 bg-red-50 text-slate-800 focus:border-red-400 focus:ring-red-100"
          : "border-gray-200 bg-white text-slate-800 focus:border-blue-500 focus:ring-blue-500/20"
      }`}
    />
  );

  if (!prefix) {
    return input;
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">
        {prefix}
      </span>
      {input}
    </div>
  );
};

interface AssignedToInputProps {
  value: string;
  onChange: (val: string) => void;
  ariaLabel: string;
}

const AssignedToInput = ({ value, onChange, ariaLabel }: AssignedToInputProps) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
    if (!val.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    const list = getEmployees()
      .map((emp) => emp.employeeName)
      .filter((name) => name.toLowerCase().includes(val.toLowerCase()));
    const uniqueList = Array.from(new Set(list));
    setSuggestions(uniqueList);
    setIsOpen(true);
  };

  const handleFocus = () => {
    if (value.trim()) {
      const list = getEmployees()
        .map((emp) => emp.employeeName)
        .filter((name) => name.toLowerCase().includes(value.toLowerCase()));
      const uniqueList = Array.from(new Set(list));
      setSuggestions(uniqueList);
      setIsOpen(true);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        aria-label={ariaLabel}
        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 placeholder:text-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        placeholder="Search employee..."
      />
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-36 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                onChange(name);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-blue-50 transition-colors duration-100"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "blue" | "purple" | "orange" | "green";
  highlight?: boolean;
}

const ACCENT_STYLES: Record<
  KpiCardProps["accent"],
  { iconBg: string; iconText: string; valueText: string }
> = {
  blue: {
    iconBg: "bg-blue-50",
    iconText: "text-blue-600",
    valueText: "text-slate-800",
  },
  purple: {
    iconBg: "bg-purple-50",
    iconText: "text-purple-600",
    valueText: "text-slate-800",
  },
  orange: {
    iconBg: "bg-orange-50",
    iconText: "text-orange-600",
    valueText: "text-slate-800",
  },
  green: {
    iconBg: "bg-green-50",
    iconText: "text-green-600",
    valueText: "text-green-600",
  },
};

const KpiCard = ({ icon, label, value, accent, highlight = false }: KpiCardProps) => {
  const styles = ACCENT_STYLES[accent];

  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${
        highlight ? "border-green-200 ring-1 ring-green-100" : "border-slate-200"
      }`}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles.iconBg} ${styles.iconText}`}
      >
        {icon}
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold ${styles.valueText}`}>{value}</p>
    </div>
  );
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
    (index: number, field: "woQty" | "unitRate" | "uom" | "assignedTo", value: string | number) => {
      setProject((prev) => {
        const updatedItems = prev.quantityItems.map((item, i) => {
          if (i !== index) return item;
          let updatedItem = { ...item };
          if (field === "woQty") {
            updatedItem.woQty = Number(value);
          } else if (field === "unitRate") {
            updatedItem.unitRate = Number(value);
          } else if (field === "uom") {
            updatedItem.uom = String(value);
          } else if (field === "assignedTo") {
            updatedItem.assignedTo = String(value);
          }
          return recalcQuantityItem(updatedItem, prev.currency, prev.currentExchangeRate);
        });

        const totals = calculateQuantity(updatedItems, prev.currency, prev.currentExchangeRate);

        return {
          ...prev,
          quantityItems: updatedItems,
          ...totals,
        };
      });

      return true;
    },
    [setProject]
  );

  const handleProjectCurrencyChange = useCallback(
    (currency: string) => {
      setProject((prev) => {
        const nextExchangeRate = currency === DEFAULT_CURRENCY ? 1 : prev.currentExchangeRate;
        const updatedItems = prev.quantityItems.map((item) =>
          recalcQuantityItem(item, currency, nextExchangeRate)
        );
        const totals = calculateQuantity(updatedItems, currency, nextExchangeRate);

        return {
          ...prev,
          currency,
          currentExchangeRate: nextExchangeRate,
          contractExchangeRate: nextExchangeRate,
          quantityItems: updatedItems,
          ...totals,
        };
      });
    },
    [setProject]
  );

  const handleProjectExchangeRateChange = useCallback(
    (exchangeRate: number) => {
      setProject((prev) => {
        const updatedItems = prev.quantityItems.map((item) =>
          recalcQuantityItem(item, prev.currency, exchangeRate)
        );
        const totals = calculateQuantity(updatedItems, prev.currency, exchangeRate);

        return {
          ...prev,
          currentExchangeRate: exchangeRate,
          contractExchangeRate: exchangeRate,
          quantityItems: updatedItems,
          ...totals,
        };
      });
    },
    [setProject]
  );

  const handleAddItem = useCallback(() => {
    setProject((prev) => {
      const newItem: QuantityItem = createEmptyQuantityItem(
        prev.currency,
        prev.currentExchangeRate
      );

      const updatedItems = [...prev.quantityItems, newItem];
      const totals = calculateQuantity(updatedItems, prev.currency, prev.currentExchangeRate);

      return {
        ...prev,
        quantityItems: updatedItems,
        ...totals,
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
        const totals = calculateQuantity(updatedItems, prev.currency, prev.currentExchangeRate);

        return {
          ...prev,
          quantityItems: updatedItems,
          ...totals,
        };
      });
    },
    [setProject]
  );

  const isCurrencyINR = project.currency === DEFAULT_CURRENCY;
  const projectDuration = calculateProjectDuration(
    project.projectStartDate,
    project.projectEndDate
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Header Panel */}
      <div className="mb-6 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Package size={20} strokeWidth={2.25} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Quantity Details
            </h2>
            <p className="text-sm text-slate-500">
              Manage engineering activities, work order quantities, and assignment details.
            </p>
          </div>
        </div>

        {/* Currency & Exchange Rate Controls */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-32">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Currency
            </label>
            <select
              value={project.currency || DEFAULT_CURRENCY}
              onChange={(e) => handleProjectCurrencyChange(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              {CURRENCY_OPTIONS.map((currencyOption) => (
                <option key={currencyOption} value={currencyOption}>
                  {currencyOption}
                </option>
              ))}
            </select>
          </div>

          <div className="w-36">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Exchange Rate
            </label>
            <NumericInput
              value={project.currentExchangeRate}
              ariaLabel="Project Exchange Rate"
              disabled={isCurrencyINR}
              onChange={(value) => handleProjectExchangeRateChange(value)}
            />
          </div>

          <button
            type="button"
            onClick={handleAddItem}
            title="Add a new quantity item"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-700 hover:shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 active:bg-blue-800"
          >
            <Plus size={16} strokeWidth={2.5} />
            Add Activity
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="max-h-[28rem] overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1150px] table-fixed border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-14 border-b border-slate-200 px-3 py-2.5 text-center font-semibold">
                Sl No
              </th>
              <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">
                Description
              </th>
              <th className="w-24 border-b border-slate-200 px-3 py-2.5 text-right font-semibold">
                Qty
              </th>
              <th className="w-32 border-b border-slate-200 px-3 py-2.5 text-center font-semibold">
                UOM
              </th>
              <th className="w-28 border-b border-slate-200 px-3 py-2.5 text-right font-semibold">
                Unit Rate
              </th>
              <th className="w-32 border-b border-slate-200 px-3 py-2.5 text-right font-semibold">
                Unit Rate (INR)
              </th>
              <th className="w-36 border-b border-slate-200 px-3 py-2.5 text-right font-semibold">
                WO Value
              </th>
              <th className="w-48 border-b border-slate-200 px-3 py-2.5 text-left font-semibold">
                Assigned To
              </th>
              <th className="w-16 border-b border-slate-200 px-3 py-2.5 text-center font-semibold">
                Action
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {project.quantityItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center text-slate-400">
                  No activities added. Click "Add Activity" to get started.
                </td>
              </tr>
            ) : (
              project.quantityItems.map((item, index) => {
                const canRemove = canRemoveQuantityItem(project.quantityItems);
                return (
                  <tr
                    key={item.id}
                    className="bg-white transition-colors duration-150 hover:bg-slate-50"
                  >
                    {/* Sl No */}
                    <td className="px-3 py-3 text-center text-slate-500">
                      {index + 1}
                    </td>

                    {/* Description */}
                    <td className="px-3 py-3">
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
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 placeholder:text-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </td>

                    {/* Quantity */}
                    <td className="px-3 py-3">
                      <NumericInput
                        value={item.woQty}
                        ariaLabel={`Quantity for row ${index + 1}`}
                        onChange={(value) =>
                          handleFieldChange(index, "woQty", value)
                        }
                      />
                    </td>

                    {/* UOM */}
                    <td className="px-3 py-3">
                      <select
                        value={item.uom || "DAY"}
                        aria-label={`UOM for row ${index + 1}`}
                        onChange={(e) =>
                          handleFieldChange(index, "uom", e.target.value)
                        }
                        className="h-10 w-full rounded-lg border border-gray-200 bg-white px-2 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      >
                        {UOM_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Unit Rate */}
                    <td className="px-3 py-3">
                      <NumericInput
                        value={item.unitRate}
                        ariaLabel={`Unit Rate for row ${index + 1}`}
                        onChange={(value) =>
                          handleFieldChange(index, "unitRate", value)
                        }
                      />
                    </td>

                    {/* Unit Rate (INR) */}
                    <td className="px-3 py-3 text-right">
                      <span className="inline-flex min-w-[3rem] justify-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                        {formatIndianNumber(item.unitRateINR)}
                      </span>
                    </td>

                    {/* WO Value */}
                    <td className="px-3 py-3 text-right">
                      <span className="text-base font-bold text-green-600">
                        {formatIndianCurrency(item.woValue || 0)}
                      </span>
                    </td>

                    {/* Assigned To */}
                    <td className="px-3 py-3">
                      <AssignedToInput
                        value={item.assignedTo || ""}
                        onChange={(val) =>
                          handleFieldChange(index, "assignedTo", val)
                        }
                        ariaLabel={`Assigned to employee for row ${index + 1}`}
                      />
                    </td>

                    {/* Delete Action */}
                    <td className="px-3 py-3 text-center">
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
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 text-red-600 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-red-100 hover:shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400 disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-transparent disabled:text-slate-300 disabled:shadow-none"
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

      {/* Summary KPI cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Package size={18} strokeWidth={2.25} />}
          label="Activities"
          value={formatIndianNumber(project.quantityItems.length)}
          accent="blue"
        />

        <KpiCard
          icon={<Layers size={18} strokeWidth={2.25} />}
          label="Total Quantity"
          value={formatIndianNumber(project.totalWOQty)}
          accent="purple"
        />

        <KpiCard
          icon={<Clock size={18} strokeWidth={2.25} />}
          label="Project Duration"
          value={projectDuration}
          accent="orange"
        />

        <KpiCard
          icon={<Wallet size={18} strokeWidth={2.25} />}
          label="Total WO Value"
          value={formatIndianCurrency(project.workOrderValueINR)}
          accent="green"
          highlight
        />
      </div>
    </div>
  );
};

export default QuantityCard;