import { AlertTriangle, CreditCard, Percent, Plus, Trash2, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../../types/Project";
import { FormLabel } from "../../../components/ui/FormLabel";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { StatTile } from "../../../components/ui/StatTile";
import { Button } from "../../../components/ui/Button";

import { FieldError } from "../../../components/ui/FieldError";

interface Props {
  project: Project;
  setProject: Dispatch<SetStateAction<Project>>;
  errors?: Record<string, string>;
  clearError?: (field: string) => void;
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

const fieldClass =
  "h-9 w-full rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] px-2.5 text-[12.5px] text-[var(--nu-text)] outline-none transition-shadow focus:ring-2 focus:ring-[var(--nu-accent)]/25 focus:border-[var(--nu-accent)]";

interface NumericInputProps {
  value: number;
  ariaLabel: string;
  onChange: (nextValue: number) => void;
  suffix?: string;
  disabled?: boolean;
  className?: string;
}

const NumericInput = ({
  value,
  ariaLabel,
  onChange,
  suffix,
  disabled = false,
  className = "",
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

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
      className={`${fieldClass} text-right ${suffix ? "pr-6" : ""} ${
        disabled
          ? "bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)] cursor-not-allowed"
          : ""
      } ${className}`}
    />
  );

  if (!suffix) {
    return input;
  }

  return (
    <div className="relative">
      {input}
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[12px] text-[var(--nu-text-muted)]">
        {suffix}
      </span>
    </div>
  );
};

const PaymentMilestoneCard = ({ project, setProject, errors = {}, clearError }: Props) => {
  const totalPaymentPercentage = project.paymentMilestones.reduce(
    (sum, milestone) => sum + milestone.paymentPercentage,
    0
  );

  const remainingPercentage = 100 - totalPaymentPercentage;
  const isPercentageMismatch = totalPaymentPercentage !== 100;
  const isDateRangeMissing = !project.projectStartDate || !project.projectEndDate;

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
      clearError?.(`milestone_pct_${index}`);
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
    [setProject, clearError]
  );

  const handleMilestoneNameChange = useCallback(
    (index: number, value: string) => {
      clearError?.(`milestone_name_${index}`);
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
  const canRemove = project.paymentMilestones.length > 1;

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatTile
          emphasis="secondary"
          label="Total Payments"
          value={formatIndianNumber(project.paymentMilestones.length)}
          icon={<Wallet size={14} />}
          tint="accent"
        />
        <StatTile
          emphasis="secondary"
          label="Total Payment %"
          value={`${formatIndianNumber(totalPaymentPercentage)}%`}
          icon={<Percent size={14} />}
          tint={isPercentageMismatch ? "danger" : "success"}
        />
        <StatTile
          emphasis="secondary"
          label="Remaining %"
          value={`${formatIndianNumber(remainingPercentage)}%`}
          icon={<Percent size={14} />}
          tint="warning"
        />
      </div>

      <Card padded={false} elevated>
        <CardHeader
          icon={<CreditCard size={15} />}
          title="Payment Milestones"
          subtitle="Project payment schedule"
          action={
            project.paymentType === "Multiple" ? (
              <Button
                variant="primary"
                size="sm"
                icon={<Plus size={14} />}
                onClick={handleAddPayment}
              >
                Add Payment
              </Button>
            ) : undefined
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] px-4 py-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)] mb-1">
                Work Order Value
              </p>
              <p className="text-[15px] font-bold text-[var(--nu-text)]">
                {formatIndianCurrency(project.workOrderValueINR)}
              </p>
            </div>

            <div className="sm:ml-auto flex items-center gap-1 bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-full p-1">
              {(["Single", "Multiple"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handlePaymentTypeChange(type)}
                  className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
                    project.paymentType === type
                      ? "bg-[var(--nu-accent)] text-white"
                      : "text-[var(--nu-text-secondary)] hover:bg-[var(--nu-surface-alt)]"
                  }`}
                >
                  {type} Payment{type === "Multiple" ? "s" : ""}
                </button>
              ))}
            </div>
          </div>

          {/* Milestone cards / timeline */}
          <div className="space-y-0">
            {project.paymentType === "Single" ? (
              <div className="milestone-connector relative flex gap-3.5 pb-1">
                <div className="w-8 h-8 rounded-full bg-[var(--nu-accent)] text-white flex items-center justify-center text-[12px] font-bold shrink-0 z-10">
                  1
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1.2fr] gap-3 items-end pb-4">
                  <div>
                    <FormLabel required={true} className="!text-[11px] !text-[var(--nu-text-muted)] mb-1">
                      Milestone Name
                    </FormLabel>
                    <input
                      type="text"
                      data-field="milestone_name_0"
                      value={singleMilestone?.milestoneName ?? ""}
                      placeholder="e.g. Submission Draft"
                      aria-label="Milestone Name"
                      onChange={(e) => handleMilestoneNameChange(0, e.target.value)}
                      className={`${fieldClass} ${errors["milestone_name_0"] ? "!border-[var(--nu-danger)]" : ""}`}
                    />
                    <FieldError error={errors["milestone_name_0"]} />
                  </div>
                  <div>
                    <FormLabel required={true} className="!text-[11px] !text-[var(--nu-text-muted)] mb-1">
                      Payment %
                    </FormLabel>
                    <div data-field="milestone_pct_0">
                      <div className="h-9 flex items-center justify-center rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] text-[12.5px] font-semibold text-[var(--nu-text-secondary)]">
                        100%
                      </div>
                    </div>
                    <FieldError error={errors["milestone_pct_0"]} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--nu-text-muted)] mb-1">
                      Due Date
                    </label>
                    {isDateRangeMissing ? (
                      <input
                        type="text"
                        disabled
                        placeholder="Please select Project Start & End Date"
                        className={`${fieldClass} bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)] cursor-not-allowed`}
                      />
                    ) : (
                      <>
                        <input
                          type="date"
                          value={singleMilestone?.dueDate ?? ""}
                          min={project.projectStartDate}
                          max={project.projectEndDate}
                          aria-label="Due Date"
                          onChange={(e) => handleDueDateChange(0, e.target.value)}
                          className={fieldClass}
                        />
                      </>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--nu-text-muted)] mb-1">
                      Amount
                    </label>
                    <p className="text-[14px] font-bold text-[var(--nu-success)]">
                      {formatIndianCurrency(
                        calculateAmount(
                          project.workOrderValueINR,
                          singleMilestone?.paymentPercentage ?? 100
                        )
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : project.paymentMilestones.length === 0 ? (
              <p className="text-center py-8 text-[var(--nu-text-muted)] text-[12.5px]">
                No payment milestones added. Click &quot;Add Payment&quot; to get started.
              </p>
            ) : (
              project.paymentMilestones.map((milestone, index) => (
                <div
                  key={milestone.id}
                  className="milestone-connector relative flex gap-3.5"
                >
                  <div className="w-8 h-8 rounded-full bg-[var(--nu-accent)] text-white flex items-center justify-center text-[12px] font-bold shrink-0 z-10">
                    {index + 1}
                  </div>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-[2fr_0.8fr_1fr_1.2fr_auto] gap-3 items-end pb-5">
                    <div>
                      <FormLabel required={true} className="!text-[11px] !text-[var(--nu-text-muted)] mb-1">
                        Milestone Name
                      </FormLabel>
                      <input
                        type="text"
                        data-field={`milestone_name_${index}`}
                        value={milestone.milestoneName ?? ""}
                        placeholder="e.g. Submission Draft"
                        aria-label={`Milestone Name for row ${index + 1}`}
                        onChange={(e) =>
                          handleMilestoneNameChange(index, e.target.value)
                        }
                        className={`${fieldClass} ${errors[`milestone_name_${index}`] ? "!border-[var(--nu-danger)]" : ""}`}
                      />
                      <FieldError error={errors[`milestone_name_${index}`]} />
                    </div>
                    <div>
                      <FormLabel required={true} className="!text-[11px] !text-[var(--nu-text-muted)] mb-1">
                        Payment %
                      </FormLabel>
                      <div data-field={`milestone_pct_${index}`}>
                        <NumericInput
                          value={milestone.paymentPercentage}
                          ariaLabel={`Payment % for row ${index + 1}`}
                          suffix="%"
                          onChange={(value) =>
                            handlePercentageChange(index, value)
                          }
                          className={errors[`milestone_pct_${index}`] ? "!border-[var(--nu-danger)]" : ""}
                        />
                      </div>
                      <FieldError error={errors[`milestone_pct_${index}`]} />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[var(--nu-text-muted)] mb-1">
                        Due Date
                      </label>
                      {isDateRangeMissing ? (
                        <input
                          type="text"
                          disabled
                          placeholder="Please select Project Start & End Date"
                          className={`${fieldClass} bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)] cursor-not-allowed`}
                        />
                      ) : (
                        <>
                          <input
                            type="date"
                            value={milestone.dueDate}
                            min={project.projectStartDate}
                            max={project.projectEndDate}
                            aria-label={`Due Date for row ${index + 1}`}
                            onChange={(e) =>
                              handleDueDateChange(index, e.target.value)
                            }
                            className={fieldClass}
                          />
                        </>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[var(--nu-text-muted)] mb-1">
                        Amount
                      </label>
                      <p className="text-[14px] font-bold text-[var(--nu-success)]">
                        {formatIndianCurrency(
                          calculateAmount(
                            project.workOrderValueINR,
                            milestone.paymentPercentage
                          )
                        )}
                      </p>
                    </div>
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
                      className="h-9 w-9 flex items-center justify-center rounded-[var(--nu-radius-md)] bg-[var(--nu-danger-soft)] text-[var(--nu-danger)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--nu-shadow-sm)] disabled:opacity-30 disabled:cursor-not-allowed disabled:translate-y-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {project.paymentType === "Multiple" &&
            project.paymentMilestones.length === 1 && (
              <p className="text-[11px] font-medium text-[var(--nu-text-muted)]">
                {LAST_ROW_WARNING}
              </p>
            )}

          {isPercentageMismatch && (
            <div className="flex items-center gap-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-danger)]/30 bg-[var(--nu-danger-soft)] px-3.5 py-2.5 text-[12.5px] font-medium text-[var(--nu-danger)]">
              <AlertTriangle size={14} strokeWidth={2.25} />
              {PERCENTAGE_MISMATCH_WARNING}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default PaymentMilestoneCard;
