import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  AlertTriangle,
  Clock,
  CreditCard,
  MoreHorizontal,
  Package,
  X,
} from "lucide-react";

import type { Project } from "../../../../types/Project";
import type { BillingMethod, InvoiceEntry, InvoiceItem } from "../../../../types/InvoiceItem";

import {
  getBilledMilestoneIds,
  getHoursBilled,
  getInvoiceRaisedAmount,
  getQuantityBilled,
} from "../../../../services/invoiceProgressService";
import { formatIndianCurrency, formatIndianNumber } from "../../../../utils/quantityCalculations";

interface Props {
  project: Project;
  item: InvoiceItem;
  onClose: () => void;
  onSave: (invoice: InvoiceEntry) => void;
}

interface BillingMethodOption {
  key: BillingMethod;
  label: string;
  icon: typeof Package;
}

const BILLING_METHODS: BillingMethodOption[] = [
  { key: "quantity", label: "Quantity Progress", icon: Package },
  { key: "milestone", label: "Payment Milestone", icon: CreditCard },
  { key: "manhour", label: "Man-Hour Progress", icon: Clock },
  { key: "others", label: "Others", icon: MoreHorizontal },
];

const NUMBER_INPUT_PATTERN = /^\d*\.?\d*$/;

const todayISODate = (): string => new Date().toISOString().slice(0, 10);

const getAutoStatus = (
  totalAfter: number,
  packageValue: number
): "Pending" | "Partially Invoiced" | "Completed" => {
  if (totalAfter <= 0) return "Pending";
  if (totalAfter >= packageValue) return "Completed";
  return "Partially Invoiced";
};

const STATUS_BADGE_STYLES: Record<string, string> = {
  Pending: "bg-gray-100 text-gray-600 border-gray-200",
  "Partially Invoiced": "bg-orange-50 text-orange-700 border-orange-200",
  Completed: "bg-green-50 text-green-700 border-green-200",
};

const BillingProgressDrawer = ({ project, item, onClose, onSave }: Props) => {
  const [show, setShow] = useState(false);
  const [billingMethod, setBillingMethod] = useState<BillingMethod>("quantity");
  const [quantityInput, setQuantityInput] = useState("");
  const [hoursInput, setHoursInput] = useState("");
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleClose = () => {
    setShow(false);
    window.setTimeout(onClose, 200);
  };

  const packageValue = item.totalPrice || 0;
  const alreadyInvoiced = getInvoiceRaisedAmount(item);
  const balanceBeforeThis = Math.max(packageValue - alreadyInvoiced, 0);

  // Quantity Progress
  const totalQty = item.qty || 0;
  const completedQty = getQuantityBilled(item);
  const remainingQty = Math.max(totalQty - completedQty, 0);
  const unitRate = item.unitPrice || 0;
  const quantityValue = quantityInput.trim() === "" ? 0 : Number(quantityInput);

  // Man-Hour Progress (reuses the same activity qty/rate, framed as hours)
  const budgetHours = item.qty || 0;
  const consumedHours = getHoursBilled(item);
  const remainingHours = Math.max(budgetHours - consumedHours, 0);
  const hourlyRate = item.unitPrice || 0;
  const hoursValue = hoursInput.trim() === "" ? 0 : Number(hoursInput);

  // Payment Milestone
  const milestones = project.paymentMilestones ?? [];
  const billedMilestoneIds = useMemo(
    () => getBilledMilestoneIds(project.invoiceItems),
    [project.invoiceItems]
  );
  const selectedMilestone = milestones.find((m) => m.id === selectedMilestoneId) ?? null;
  const remainingMilestonesCount = milestones.filter(
    (m) => !billedMilestoneIds.has(m.id) && m.id !== selectedMilestoneId
  ).length;

  const currentInvoiceAmount =
    billingMethod === "quantity"
      ? quantityValue * unitRate
      : billingMethod === "manhour"
      ? hoursValue * hourlyRate
      : billingMethod === "milestone"
      ? selectedMilestone?.amount ?? 0
      : 0;

  const totalAfter = alreadyInvoiced + currentInvoiceAmount;
  const remainingBalance = Math.max(packageValue - totalAfter, 0);
  const completionPercent =
    packageValue > 0 ? Math.min((totalAfter / packageValue) * 100, 100) : 0;
  const autoStatus = getAutoStatus(totalAfter, packageValue);

  const isOverbilled = totalAfter > packageValue + 0.01;
  const hasAmount = currentInvoiceAmount > 0;
  const canSave =
    hasAmount &&
    !isOverbilled &&
    billingMethod !== "others" &&
    (billingMethod !== "milestone" || Boolean(selectedMilestoneId));

  const handleNumberChange =
    (setter: (value: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw !== "" && !NUMBER_INPUT_PATTERN.test(raw)) return;
      setter(raw);
    };

  const handleSave = () => {
    if (!canSave) return;

    const entry: InvoiceEntry = {
      id: crypto.randomUUID(),
      billingMethod,
      invoiceDate: todayISODate(),
      invoiceAmountINR: currentInvoiceAmount,
      ...(billingMethod === "quantity" ? { quantityBilled: quantityValue } : {}),
      ...(billingMethod === "manhour" ? { hoursBilled: hoursValue } : {}),
      ...(billingMethod === "milestone"
        ? {
            milestoneId: selectedMilestone?.id,
            milestoneLabel: selectedMilestone
              ? `${formatIndianNumber(selectedMilestone.paymentPercentage)}% Milestone`
              : undefined,
          }
        : {}),
    };

    onSave(entry);
  };

  return (
    <>
      {/* Backdrop — Invoice Progress Tracker remains visible behind it */}
      <div
        role="button"
        aria-label="Close billing progress drawer"
        tabIndex={-1}
        onClick={handleClose}
        className={`fixed inset-0 z-40 bg-slate-900/20 transition-opacity duration-200 ${
          show ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Drawer */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[560px] flex-col bg-white shadow-2xl transition-transform duration-200 ease-out sm:w-[38%] sm:min-w-[420px] ${
          show ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Update Billing Progress
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Update project execution progress and generate billing automatically.
            </p>
          </div>

          <button
            onClick={handleClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* Activity Information */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
            <h3 className="text-base font-semibold text-slate-800">
              {item.description || "Work Package"}
            </h3>

            <div className="mt-4 grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Package Value
                </p>
                <p className="mt-1 text-sm font-bold text-blue-600">
                  {formatIndianCurrency(packageValue)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Already Invoiced
                </p>
                <p className="mt-1 text-sm font-bold text-slate-700">
                  {formatIndianCurrency(alreadyInvoiced)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Balance
                </p>
                <p className="mt-1 text-sm font-bold text-orange-600">
                  {formatIndianCurrency(balanceBeforeThis)}
                </p>
              </div>
            </div>
          </div>

          {/* Billing Method */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Billing Method
            </p>

            <div className="grid grid-cols-2 gap-3">
              {BILLING_METHODS.map(({ key, label, icon: Icon }) => {
                const isSelected = billingMethod === key;

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setBillingMethod(key)}
                    className={`flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all duration-150 ${
                      isSelected
                        ? "border-blue-600 bg-blue-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        isSelected
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      <Icon size={16} strokeWidth={2.25} />
                    </div>
                    <span
                      className={`text-sm font-semibold ${
                        isSelected ? "text-blue-700" : "text-slate-700"
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dynamic section */}
          {billingMethod === "quantity" && (
            <div className="rounded-2xl border border-slate-200 p-5">
              <h4 className="mb-4 text-sm font-semibold text-slate-700">
                Quantity Progress
              </h4>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-400">Total Quantity</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {formatIndianNumber(totalQty)} {item.uom}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Completed</p>
                  <p className="mt-1 text-sm font-bold text-green-600">
                    {formatIndianNumber(completedQty)} {item.uom}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Remaining</p>
                  <p className="mt-1 text-sm font-bold text-orange-600">
                    {formatIndianNumber(remainingQty)} {item.uom}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Unit Rate</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {formatIndianCurrency(unitRate)}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Current Quantity Completed
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={quantityInput}
                  onChange={handleNumberChange(setQuantityInput)}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          )}

          {billingMethod === "milestone" && (
            <div className="rounded-2xl border border-slate-200 p-5">
              <h4 className="mb-4 text-sm font-semibold text-slate-700">
                Payment Milestone
              </h4>

              {milestones.length === 0 ? (
                <p className="text-sm text-slate-400">
                  No payment milestones have been configured for this project.
                </p>
              ) : (
                <div className="space-y-2">
                  {milestones.map((milestone, index) => {
                    const isBilled = billedMilestoneIds.has(milestone.id);
                    const isSelected = selectedMilestoneId === milestone.id;

                    return (
                      <button
                        key={milestone.id}
                        type="button"
                        disabled={isBilled}
                        onClick={() => setSelectedMilestoneId(milestone.id)}
                        className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all duration-150 ${
                          isSelected
                            ? "border-blue-600 bg-blue-50"
                            : isBilled
                            ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-60"
                            : "border-slate-200 bg-white hover:border-blue-200"
                        }`}
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            Milestone {index + 1}
                            {isBilled && (
                              <span className="ml-2 text-xs font-medium text-slate-400">
                                (Already Billed)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatIndianNumber(milestone.paymentPercentage)}% of Work Order Value
                          </p>
                        </div>
                        <p className="text-sm font-bold text-blue-600">
                          {formatIndianCurrency(milestone.amount)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              <p className="mt-4 text-xs text-slate-400">
                Remaining Milestones: {remainingMilestonesCount}
              </p>
            </div>
          )}

          {billingMethod === "manhour" && (
            <div className="rounded-2xl border border-slate-200 p-5">
              <h4 className="mb-4 text-sm font-semibold text-slate-700">
                Man-Hour Progress
              </h4>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-400">Budget Hours</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {formatIndianNumber(budgetHours)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Consumed</p>
                  <p className="mt-1 text-sm font-bold text-green-600">
                    {formatIndianNumber(consumedHours)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Remaining</p>
                  <p className="mt-1 text-sm font-bold text-orange-600">
                    {formatIndianNumber(remainingHours)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Hourly Rate</p>
                  <p className="mt-1 text-sm font-bold text-slate-800">
                    {formatIndianCurrency(hourlyRate)}
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Current Billable Hours
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={hoursInput}
                  onChange={handleNumberChange(setHoursInput)}
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          )}

          {billingMethod === "others" && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
              <p className="text-sm font-semibold text-slate-600">
                Additional Billing Method
              </p>
              <p className="mt-1 text-xs text-slate-400">
                (Reserved for future implementation)
              </p>
            </div>
          )}

          {/* Billing Summary */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="mb-4 text-sm font-semibold text-slate-700">
              Billing Summary
            </h4>

            <div className="divide-y divide-slate-100">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-500">Package Value</span>
                <span className="text-sm font-semibold text-slate-800">
                  {formatIndianCurrency(packageValue)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-500">Already Invoiced</span>
                <span className="text-sm font-semibold text-slate-800">
                  {formatIndianCurrency(alreadyInvoiced)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-500">Current Invoice</span>
                <span className="text-sm font-semibold text-blue-600">
                  {formatIndianCurrency(currentInvoiceAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-500">Total Invoice After This</span>
                <span className="text-sm font-semibold text-slate-800">
                  {formatIndianCurrency(totalAfter)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-500">Remaining Balance</span>
                <span className="text-sm font-semibold text-orange-600">
                  {formatIndianCurrency(remainingBalance)}
                </span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Invoice Completion
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_BADGE_STYLES[autoStatus]}`}
              >
                {autoStatus}
              </span>
            </div>

            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-green-600 transition-all duration-500"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            <p className="mt-1.5 text-right text-xs font-semibold text-green-700">
              {completionPercent.toFixed(2)}%
            </p>
          </div>

          {isOverbilled && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              <AlertTriangle size={16} strokeWidth={2.25} className="shrink-0" />
              Already Invoiced + Current Invoice cannot exceed the Package Value.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button
            onClick={handleClose}
            className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-gray-50"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={!canSave}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Save Progress
          </button>
        </div>
      </aside>
    </>
  );
};

export default BillingProgressDrawer;
