import { useEffect, useMemo, useState } from "react";
import { formatBusinessINR, formatFullINR } from "../../../../utils/formatCurrency";
import type { ChangeEvent } from "react";
import {
  AlertTriangle,
  CreditCard,
  Package,
  X,
} from "lucide-react";

import type { Project } from "../../../../types/Project";
import type { InvoiceEntry } from "../../../../types/InvoiceItem";

import { getTotalWorkPackageValue } from "../../../../services/invoiceProgressService";
import { formatIndianCurrency, formatIndianNumber } from "../../../../utils/quantityCalculations";
import { Button } from "../../../../components/ui/Button";

interface Props {
  project: Project;
  onClose: () => void;
  onSave: (updatedProject: Project) => void;
  // View/Edit mode props
  mode?: "create" | "view" | "edit";
  initialItemId?: string;
  initialInvoiceId?: string;
  initialMilestoneBillingId?: string;
}

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

const BillingProgressDrawer = ({
  project,
  onClose,
  onSave,
  mode = "create",
  initialItemId,
  initialInvoiceId,
  initialMilestoneBillingId,
}: Props) => {
  const [show, setShow] = useState(false);

  const isViewMode = mode === "view";
  const isEditMode = mode === "edit";
  const isMilestoneOnlyView = Boolean(initialMilestoneBillingId);

  // 1. Selected Item ID (preselected or dropdown)
  const [selectedItemId, setSelectedItemId] = useState<string>(() => {
    if (initialItemId) return initialItemId;
    if (initialInvoiceId) {
      const foundItem = project.invoiceItems.find(item =>
        item.invoices?.some(inv => inv.id === initialInvoiceId)
      );
      if (foundItem) return foundItem.id;
    }
    return project.invoiceItems[0]?.id || "";
  });

  const selectedItem = useMemo(() => {
    if (isMilestoneOnlyView) return null;
    return project.invoiceItems.find(item => item.id === selectedItemId) || null;
  }, [project.invoiceItems, selectedItemId, isMilestoneOnlyView]);

  // 2. Quantity Input
  const [quantityInput, setQuantityInput] = useState(() => {
    if ((isViewMode || isEditMode) && initialInvoiceId && selectedItem) {
      const entry = selectedItem.invoices?.find(inv => inv.id === initialInvoiceId);
      if (entry && entry.quantityBilled !== undefined) {
        return String(entry.quantityBilled);
      }
    }
    return "";
  });

  // 3. Selected Milestone ID
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(() => {
    if ((isViewMode || isEditMode) && initialMilestoneBillingId) {
      const mb = project.milestoneBillings?.find(b => b.id === initialMilestoneBillingId);
      if (mb) {
        return mb.milestoneId;
      }
    }
    return null;
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleClose = () => {
    setShow(false);
    window.setTimeout(onClose, 200);
  };

  const packageValue = selectedItem
    ? (selectedItem.totalPrice || 0)
    : (project.workOrderValueINR || 0);

  // Already Invoiced (exclude current entry to avoid double counting)
  const alreadyInvoiced = useMemo(() => {
    if (selectedItem) {
      const invoicesToSum = selectedItem.invoices ?? [];
      const filtered = (isEditMode || isViewMode) && initialInvoiceId
        ? invoicesToSum.filter(inv => inv.id !== initialInvoiceId)
        : invoicesToSum;
      return filtered.reduce((sum, inv) => sum + (inv.invoiceAmountINR || 0), 0);
    } else {
      // Milestone-only view
      const billings = project.milestoneBillings ?? [];
      const filtered = (isEditMode || isViewMode) && initialMilestoneBillingId
        ? billings.filter(b => b.id !== initialMilestoneBillingId)
        : billings;
      return filtered.reduce((sum, b) => sum + (b.amount || 0), 0);
    }
  }, [selectedItem, project.milestoneBillings, isEditMode, isViewMode, initialInvoiceId, initialMilestoneBillingId]);

  const balanceBeforeThis = Math.max(packageValue - alreadyInvoiced, 0);

  // Quantity Progress
  const totalQty = selectedItem ? (selectedItem.qty || 0) : 0;
  
  // Completed Qty (exclude current entry to avoid double counting)
  const completedQty = useMemo(() => {
    if (!selectedItem) return 0;
    const invoicesToSum = selectedItem.invoices ?? [];
    const filtered = (isEditMode || isViewMode) && initialInvoiceId
      ? invoicesToSum.filter(inv => inv.id !== initialInvoiceId)
      : invoicesToSum;
    return filtered.reduce((sum, inv) => sum + (inv.quantityBilled || 0), 0);
  }, [selectedItem, isEditMode, isViewMode, initialInvoiceId]);

  const quantityValue = quantityInput.trim() === "" ? 0 : Number(quantityInput);
  const remainingQty = Math.max(totalQty - (completedQty + quantityValue), 0);

  // Payment Milestones
  const milestones = project.paymentMilestones ?? [];
  
  // Billed Milestone IDs (exclude current billing milestone to keep it selectable)
  const billedMilestoneIds = useMemo(() => {
    const ids = new Set<string>();
    project.milestoneBillings?.forEach(mb => {
      if (initialMilestoneBillingId && mb.id === initialMilestoneBillingId) return;
      if (mb.milestoneId) ids.add(mb.milestoneId);
    });
    return ids;
  }, [project.milestoneBillings, initialMilestoneBillingId]);

  const selectedMilestone = milestones.find((m) => m.id === selectedMilestoneId) ?? null;

  // Project-wide commercial totals. Quantity Based Billing and Payment
  // Milestone Billing are independent tracks measuring progress against the
  // SAME Work Order Value — combined with MAX, never summed, so raising a
  // milestone can never be blocked by (or double-count with) quantity
  // progress on unrelated activities, and vice versa.
  const projectValueINR = getTotalWorkPackageValue(project.invoiceItems);

  const quantityTrackTotal = useMemo(() => {
    let total = 0;
    project.invoiceItems.forEach((item) => {
      (item.invoices ?? []).forEach((inv) => {
        if ((isEditMode || isViewMode) && inv.id === initialInvoiceId) return;
        total += inv.invoiceAmountINR || 0;
      });
    });
    return total;
  }, [project.invoiceItems, isEditMode, isViewMode, initialInvoiceId]);

  const milestoneTrackTotal = useMemo(() => {
    const billings = project.milestoneBillings ?? [];
    return billings.reduce((sum, b) => {
      if ((isEditMode || isViewMode) && b.id === initialMilestoneBillingId) {
        return sum;
      }
      return sum + (b.amount || 0);
    }, 0);
  }, [project.milestoneBillings, isEditMode, isViewMode, initialMilestoneBillingId]);

  const projectAlreadyInvoiced = Math.max(quantityTrackTotal, milestoneTrackTotal);

  const currentQuantityAmount = quantityValue * (selectedItem?.unitPrice || 0);
  const currentMilestoneAmount = selectedMilestone ? selectedMilestone.amount : 0;
  const currentInvoiceAmount = currentQuantityAmount + currentMilestoneAmount;

  const totalAfter = Math.min(
    Math.max(
      quantityTrackTotal + currentQuantityAmount,
      milestoneTrackTotal + currentMilestoneAmount
    ),
    projectValueINR
  );
  const remainingBalance = Math.max(projectValueINR - totalAfter, 0);
  const completionPercent =
    projectValueINR > 0
      ? Math.min(Math.max((totalAfter / projectValueINR) * 100, 0), 100)
      : 0;
  const autoStatus = getAutoStatus(totalAfter, projectValueINR);

  // Overbilling is only meaningful within the Quantity Based track — an
  // activity's own remaining quantity. Milestone billing is separately
  // guarded by disabling already-billed milestones, so the two checks must
  // never be cross-compared against each other's totals.
  const isQuantityOverbilled =
    quantityValue > 0 &&
    Boolean(selectedItem) &&
    completedQty + quantityValue > (selectedItem?.qty || 0) + 0.0001;

  const canSave =
    !isViewMode &&
    (selectedMilestone !== null || quantityValue > 0) &&
    !isQuantityOverbilled;

  const handleNumberChange =
    (setter: (value: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
      if (isViewMode) return;
      const raw = e.target.value;
      if (raw !== "" && !NUMBER_INPUT_PATTERN.test(raw)) return;
      setter(raw);
    };

  const handleSave = () => {
    if (!canSave) return;

    let updatedProject = { ...project };

    // 1. Edit existing quantity based entry
    if (initialInvoiceId && selectedItem) {
      updatedProject = {
        ...project,
        invoiceItems: project.invoiceItems.map(item => {
          if (item.id !== selectedItem.id) return item;
          return {
            ...item,
            invoices: (item.invoices ?? []).map(inv => {
              if (inv.id !== initialInvoiceId) return inv;
              return {
                ...inv,
                quantityBilled: quantityValue,
                invoiceAmountINR: quantityValue * (selectedItem.unitPrice || 0),
              };
            }),
          };
        }),
      };
    }
    // 2. Edit existing milestone billing
    else if (initialMilestoneBillingId && selectedMilestone) {
      updatedProject = {
        ...project,
        milestoneBillings: (project.milestoneBillings ?? []).map(mb => {
          if (mb.id !== initialMilestoneBillingId) return mb;
          return {
            ...mb,
            milestoneId: selectedMilestone.id,
            milestoneName: `Milestone ${milestones.findIndex(m => m.id === selectedMilestone.id) + 1}`,
            milestonePercentage: selectedMilestone.paymentPercentage,
            amount: selectedMilestone.amount,
          };
        }),
      };
    }
    // 3. Create mode
    else {
      if (selectedMilestone) {
        const newMilestoneBilling = {
          id: crypto.randomUUID(),
          milestoneId: selectedMilestone.id,
          milestoneName: `Milestone ${milestones.findIndex(m => m.id === selectedMilestone.id) + 1}`,
          milestonePercentage: selectedMilestone.paymentPercentage,
          amount: selectedMilestone.amount,
          invoiceDate: todayISODate(),
        };
        updatedProject = {
          ...project,
          milestoneBillings: [...(project.milestoneBillings ?? []), newMilestoneBilling],
        };
      }
      if (quantityValue > 0 && selectedItem) {
        const newInvoiceEntry: InvoiceEntry = {
          id: crypto.randomUUID(),
          invoiceDate: todayISODate(),
          invoiceAmountINR: quantityValue * (selectedItem.unitPrice || 0),
          quantityBilled: quantityValue,
        };
        updatedProject = {
          ...updatedProject,
          invoiceItems: updatedProject.invoiceItems.map(item => {
            if (item.id !== selectedItem.id) return item;
            return {
              ...item,
              invoices: [...(item.invoices ?? []), newInvoiceEntry],
            };
          }),
        };
      }
    }

    onSave(updatedProject);
  };

  const drawerTitle = isViewMode
    ? "View Billing Progress"
    : isEditMode
    ? "Edit Billing Progress"
    : "Raise Invoice";

  return (
    <>
      {/* Backdrop */}
      <div
        role="button"
        aria-label="Close raise invoice drawer"
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
              {drawerTitle}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isViewMode
                ? "Reviewing details of this billing record."
                : "Record physical progress and select payment milestones to bill."}
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
          {/* Dropdown for Work Package selection (Create Mode & Global drawer only) */}
          {mode === "create" && !initialItemId && !isMilestoneOnlyView && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Select Work Package / Activity
              </label>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {project.invoiceItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.description}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Package Summary (Read Only) - Hidden if milestone billing only */}
          {!isMilestoneOnlyView && selectedItem && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
              <h3 className="text-base font-semibold text-slate-800">
                {selectedItem.description || "Work Package"}
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
          )}

          {/* Section 1 - Quantity Progress (Hidden if milestone billing only) */}
          {!isMilestoneOnlyView && selectedItem && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Package size={18} className="text-blue-600" />
                <h4 className="text-sm font-bold text-slate-800">
                  Quantity Progress
                </h4>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4 text-center">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Qty</p>
                  <p className="mt-1 text-sm font-bold text-slate-700">
                    {formatIndianNumber(totalQty)} {selectedItem.uom}
                  </p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Already Completed</p>
                  <p className="mt-1 text-sm font-bold text-green-600">
                    {formatIndianNumber(completedQty)} {selectedItem.uom}
                  </p>
                </div>
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Remaining Qty</p>
                  <p className="mt-1 text-sm font-bold text-orange-600">
                    {formatIndianNumber(remainingQty)} {selectedItem.uom}
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Current Quantity Completed
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={isViewMode ? "—" : "Enter completed quantity..."}
                  value={quantityInput}
                  onChange={handleNumberChange(setQuantityInput)}
                  disabled={isViewMode}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 outline-none transition-all duration-150 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </div>
            </div>
          )}

          {isMilestoneOnlyView && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-5 text-center text-sm text-slate-400">
              Quantity progress is not applicable for project milestone billing.
            </div>
          )}

          {/* Section 2 - Payment Milestone */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard size={18} className="text-blue-600" />
              <h4 className="text-sm font-bold text-slate-800">
                Payment Milestone
              </h4>
            </div>

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
                      disabled={isBilled || isViewMode}
                      onClick={() => {
                        if (isViewMode) return;
                        if (isSelected) {
                          setSelectedMilestoneId(null);
                        } else {
                          setSelectedMilestoneId(milestone.id);
                        }
                      }}
                      className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all duration-150 ${
                        isSelected
                          ? "border-blue-600 bg-blue-50/60"
                          : isBilled
                          ? "cursor-not-allowed border-slate-100 bg-slate-50/50 opacity-60"
                          : isViewMode
                          ? "border-slate-100 bg-white"
                          : "border-slate-100 bg-white hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all ${
                            isSelected
                              ? "border-blue-600 bg-blue-600 text-white"
                              : isBilled
                              ? "border-slate-300 bg-slate-200"
                              : "border-slate-300 bg-white"
                          }`}
                        >
                          {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                        </span>

                        <div>
                          <p className="text-sm font-semibold text-slate-800">
                            Milestone {index + 1}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatIndianNumber(milestone.paymentPercentage)}% of Work Order Value
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {isBilled ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                            Completed
                          </span>
                        ) : (
                          <p className="text-sm font-bold text-blue-600">
                            {formatIndianCurrency(milestone.amount)}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Display Auto Populated Milestone Info if Selected */}
            {selectedMilestone && (
              <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Milestone Percentage
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">
                    {formatIndianNumber(selectedMilestone.paymentPercentage)}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Milestone Amount
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-blue-600">
                    {formatIndianCurrency(selectedMilestone.amount)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Billing Summary Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="mb-4 text-sm font-bold text-slate-800">
              Billing Summary
            </h4>

            <div className="divide-y divide-slate-100">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-500">Work Order Value</span>
                <span className="text-sm font-semibold text-slate-800 whitespace-nowrap" title={formatFullINR(projectValueINR)}>
                  {formatBusinessINR(projectValueINR)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-500">Already Invoiced</span>
                <span className="text-sm font-semibold text-slate-800 whitespace-nowrap" title={formatFullINR(projectAlreadyInvoiced)}>
                  {formatBusinessINR(projectAlreadyInvoiced)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-500">Current Invoice</span>
                <span className="text-sm font-semibold text-blue-600 whitespace-nowrap" title={formatFullINR(currentInvoiceAmount)}>
                  {formatBusinessINR(currentInvoiceAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span className="text-sm text-slate-500">Remaining Balance</span>
                <span className="text-sm font-semibold text-orange-600 whitespace-nowrap" title={formatFullINR(remainingBalance)}>
                  {formatBusinessINR(remainingBalance)}
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

          {isQuantityOverbilled && !isViewMode && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              <AlertTriangle size={16} strokeWidth={2.25} className="shrink-0" />
              Current Entry Qty cannot exceed the remaining quantity for this activity.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <Button variant="secondary" onClick={handleClose} className="px-5 py-2.5">
            Cancel
          </Button>

          {!isViewMode && (
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!canSave}
              className="px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isEditMode ? "Update Progress" : "Save Invoice"}
            </Button>
          )}
        </div>
      </aside>
    </>
  );
};

export default BillingProgressDrawer;
