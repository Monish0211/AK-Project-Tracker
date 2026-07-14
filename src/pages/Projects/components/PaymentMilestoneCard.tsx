import { AlertTriangle, CreditCard, Percent, Plus, Trash2, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
}

type PaymentMilestone = Project["paymentMilestones"][number];

const NUMBER_INPUT_PATTERN = /^\d*\.?\d*$/;

const LAST_ROW_WARNING = "At least one payment milestone is required.";

const PERCENTAGE_MISMATCH_WARNING =
  "Total payment percentage must equal 100%.";

function parseNumericInput(rawValue: string): number {
  if (rawValue.trim() === "") {
    return 0;
  }

  const parsed = Number(rawValue);

  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatIndianNumber(value: number): string {
  return value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

function formatIndianCurrency(value: number): string {
  const formatted = value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `₹ ${formatted}`;
}

function calculateAmount(
  workOrderValue: number,
  paymentPercentage: number
): number {
  return (workOrderValue * paymentPercentage) / 100;
}

function createEmptyMilestone(): PaymentMilestone {
  return {
    id: crypto.randomUUID(),
    milestoneName: "",
    paymentPercentage: 0,
    dueDate: "",
    amount: 0,
  };
}

interface NumericInputProps {
  value: number;
  ariaLabel: string;
  onChange: (nextValue: number) => void;
  suffix?: string;
  disabled?: boolean;
}

const NumericInput = ({
  value,
  ariaLabel,
  onChange,
  suffix,
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

    lastCommittedValue.current = parsedValue;
    setRawValue(nextRaw);
    onChange(parsedValue);
  };

  const input = (
    <input
      type="text"
      inputMode="decimal"
      placeholder="0"
      aria-label={ariaLabel}
      value={rawValue}
      disabled={disabled}
      onChange={handleChange}
      className={`h-10 w-full rounded-lg border text-right text-sm outline-none transition-all duration-150 placeholder:text-slate-300 focus:ring-2 ${
        suffix ? "pl-3 pr-8" : "px-3"
      } ${
        disabled
          ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
          : "border-gray-200 bg-white text-slate-800 focus:border-blue-500 focus:ring-blue-500/20"
      }`}
    />
  );

  if (!suffix) {
    return input;
  }

  return (
    <div className="relative">
      {input}
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-400">
        {suffix}
      </span>
    </div>
  );
};

interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "blue" | "purple" | "orange" | "green" | "red";
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
  red: {
    iconBg: "bg-red-50",
    iconText: "text-red-600",
    valueText: "text-red-600",
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

const PaymentMilestoneCard = ({ project, setProject }: Props) => {
  const totalPaymentPercentage = project.paymentMilestones.reduce(
    (sum, milestone) => sum + milestone.paymentPercentage,
    0
  );

  const remainingPercentage = 100 - totalPaymentPercentage;
  const isPercentageMismatch = totalPaymentPercentage !== 100;

  const handleWorkOrderValueChange = useCallback(
    (value: number) => {
      setProject((prev) => ({
        ...prev,
        workOrderValue: value,
        paymentMilestones: prev.paymentMilestones.map((milestone) => ({
          ...milestone,
          amount: calculateAmount(value, milestone.paymentPercentage),
        })),
      }));
    },
    [setProject]
  );

  const handlePaymentTypeChange = useCallback(
    (paymentType: Project["paymentType"]) => {
      setProject((prev) => {
        if (paymentType === "Single") {
          const [firstMilestone] = prev.paymentMilestones;

          const singleMilestone: PaymentMilestone = {
            id: firstMilestone?.id ?? crypto.randomUUID(),
            paymentPercentage: 100,
            dueDate: firstMilestone?.dueDate ?? "",
            amount: calculateAmount(prev.workOrderValueINR, 100),
          };

          return {
            ...prev,
            paymentType,
            paymentMilestones: [singleMilestone],
          };
        }

        return {
          ...prev,
          paymentType,
        };
      });
    },
    [setProject]
  );

  const handlePercentageChange = useCallback(
    (index: number, value: number) => {
      setProject((prev) => {
        const updatedMilestones = prev.paymentMilestones.map((milestone, i) =>
          i === index
            ? {
                ...milestone,
                paymentPercentage: value,
                amount: calculateAmount(prev.workOrderValueINR, value),
              }
            : milestone
        );

        return {
          ...prev,
          paymentMilestones: updatedMilestones,
        };
      });
    },
    [setProject]
  );

  const handleMilestoneNameChange = useCallback(
    (index: number, value: string) => {
      setProject((prev) => {
        const updatedMilestones = prev.paymentMilestones.map((milestone, i) =>
          i === index ? { ...milestone, milestoneName: value } : milestone
        );

        return {
          ...prev,
          paymentMilestones: updatedMilestones,
        };
      });
    },
    [setProject]
  );

  const handleDueDateChange = useCallback(
    (index: number, value: string) => {
      setProject((prev) => {
        const updatedMilestones = prev.paymentMilestones.map((milestone, i) =>
          i === index ? { ...milestone, dueDate: value } : milestone
        );

        return {
          ...prev,
          paymentMilestones: updatedMilestones,
        };
      });
    },
    [setProject]
  );

  const handleAddPayment = useCallback(() => {
    setProject((prev) => ({
      ...prev,
      paymentMilestones: [...prev.paymentMilestones, createEmptyMilestone()],
    }));
  }, [setProject]);

  const handleRemovePayment = useCallback(
    (index: number) => {
      setProject((prev) => {
        if (prev.paymentMilestones.length <= 1) {
          return prev;
        }

        return {
          ...prev,
          paymentMilestones: prev.paymentMilestones.filter(
            (_, i) => i !== index
          ),
        };
      });
    },
    [setProject]
  );

  const singleMilestone = project.paymentMilestones[0];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <CreditCard size={20} strokeWidth={2.25} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Payment Milestones
            </h2>
            <p className="text-sm text-slate-500">
              Manage project payment schedules and milestone payments.
            </p>
          </div>
        </div>

        {project.paymentType === "Multiple" && (
          <button
            type="button"
            onClick={handleAddPayment}
            title="Add a new payment milestone"
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:bg-blue-700 hover:shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 active:bg-blue-800 sm:self-auto"
          >
            <Plus size={16} strokeWidth={2.5} />
            Add Payment
          </button>
        )}
      </div>

      {/* Top Section */}
      <div className="mb-6 grid grid-cols-1 gap-6 rounded-xl border border-slate-200 bg-slate-50/50 p-5 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Work Order Value
          </label>

          <NumericInput
            value={project.workOrderValueINR}
            ariaLabel="Work Order Value"
            disabled={true}
            onChange={handleWorkOrderValueChange}
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Payment Type
          </label>

          <div className="flex h-10 items-center gap-6">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="radio"
                name="paymentType"
                value="Single"
                checked={project.paymentType === "Single"}
                onChange={() => handlePaymentTypeChange("Single")}
                className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Single Payment
            </label>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="radio"
                name="paymentType"
                value="Multiple"
                checked={project.paymentType === "Multiple"}
                onChange={() => handlePaymentTypeChange("Multiple")}
                className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Multiple Payments
            </label>
          </div>
        </div>
      </div>

      {/* Table */}
      {project.paymentType === "Single" ? (
        <div className="overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">
                  Milestone Name
                </th>

                <th className="w-32 border-b border-slate-200 px-3 py-2.5 text-right font-semibold">
                  Payment %
                </th>

                <th className="w-40 border-b border-slate-200 px-3 py-2.5 text-left font-semibold">
                  Due Date
                </th>

                <th className="w-48 border-b border-slate-200 px-3 py-2.5 text-right font-semibold">
                  Amount
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              <tr className="bg-white">
                <td className="px-3 py-3">
                  <input
                    type="text"
                    value={singleMilestone?.milestoneName ?? ""}
                    placeholder="e.g. Submission Draft"
                    aria-label="Milestone Name"
                    onChange={(e) => handleMilestoneNameChange(0, e.target.value)}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </td>

                <td className="px-3 py-3 text-right">
                  <span className="inline-flex min-w-[3rem] justify-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                    100%
                  </span>
                </td>

                <td className="px-3 py-3">
                  <input
                    type="date"
                    value={singleMilestone?.dueDate ?? ""}
                    aria-label="Due Date"
                    onChange={(e) => handleDueDateChange(0, e.target.value)}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </td>

                <td className="px-3 py-3 text-right">
                  <span className="text-base font-bold text-green-600">
                    {formatIndianCurrency(calculateAmount(project.workOrderValueINR, singleMilestone?.paymentPercentage ?? 100))}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="max-h-[28rem] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-14 border-b border-slate-200 px-3 py-2.5 text-center font-semibold">
                  Sl No
                </th>

                <th className="border-b border-slate-200 px-3 py-2.5 text-left font-semibold">
                  Milestone Name
                </th>

                <th className="w-32 border-b border-slate-200 px-3 py-2.5 text-right font-semibold">
                  Payment %
                </th>

                <th className="w-40 border-b border-slate-200 px-3 py-2.5 text-left font-semibold">
                  Due Date
                </th>

                <th className="w-48 border-b border-slate-200 px-3 py-2.5 text-right font-semibold">
                  Amount
                </th>

                <th className="w-16 border-b border-slate-200 px-3 py-2.5 text-center font-semibold">
                  Delete
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {project.paymentMilestones.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No payment milestones added. Click "Add Payment" to get
                    started.
                  </td>
                </tr>
              ) : (
                project.paymentMilestones.map((milestone, index) => {
                  const canRemove = project.paymentMilestones.length > 1;

                  return (
                    <tr
                      key={milestone.id}
                      className="bg-white transition-colors duration-150 hover:bg-slate-50"
                    >
                      <td className="px-3 py-3 text-center text-slate-500">
                        {index + 1}
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={milestone.milestoneName ?? ""}
                          placeholder={`e.g. Submission Draft`}
                          aria-label={`Milestone Name for row ${index + 1}`}
                          onChange={(e) =>
                            handleMilestoneNameChange(index, e.target.value)
                          }
                          className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                      </td>

                      <td className="px-3 py-3">
                        <NumericInput
                          value={milestone.paymentPercentage}
                          ariaLabel={`Payment % for row ${index + 1}`}
                          suffix="%"
                          onChange={(value) =>
                            handlePercentageChange(index, value)
                          }
                        />
                      </td>

                      <td className="px-3 py-3">
                        <input
                          type="date"
                          value={milestone.dueDate}
                          aria-label={`Due Date for row ${index + 1}`}
                          onChange={(e) =>
                            handleDueDateChange(index, e.target.value)
                          }
                          className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        />
                      </td>

                      <td className="px-3 py-3 text-right">
                        <span className="text-base font-bold text-green-600">
                          {formatIndianCurrency(calculateAmount(project.workOrderValueINR, milestone.paymentPercentage))}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemovePayment(index)}
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
      )}

      {project.paymentType === "Multiple" &&
        project.paymentMilestones.length === 1 && (
          <p className="mt-2 text-xs font-medium text-slate-400">
            {LAST_ROW_WARNING}
          </p>
        )}

      {isPercentageMismatch && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
          <AlertTriangle size={16} strokeWidth={2.25} />
          {PERCENTAGE_MISMATCH_WARNING}
        </div>
      )}

      {/* Summary KPI cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          icon={<Wallet size={18} strokeWidth={2.25} />}
          label="Total Payments"
          value={formatIndianNumber(project.paymentMilestones.length)}
          accent="blue"
        />

        <KpiCard
          icon={<Percent size={18} strokeWidth={2.25} />}
          label="Total Payment %"
          value={`${formatIndianNumber(totalPaymentPercentage)}%`}
          accent={isPercentageMismatch ? "red" : "green"}
          highlight={!isPercentageMismatch}
        />

        <KpiCard
          icon={<Percent size={18} strokeWidth={2.25} />}
          label="Remaining %"
          value={`${formatIndianNumber(remainingPercentage)}%`}
          accent="orange"
        />
      </div>
    </div>
  );
};

export default PaymentMilestoneCard;
