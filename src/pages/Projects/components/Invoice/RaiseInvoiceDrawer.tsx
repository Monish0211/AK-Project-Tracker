import { useEffect, useMemo, useState } from "react";
import { FileText, PlusCircle, X, Lock, Activity, CheckCircle2 } from "lucide-react";

import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Textarea } from "../../../../components/ui/Textarea";
import { formatBusinessINR, formatFullINR } from "../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../utils/quantityCalculations";

import {
  getMilestonesForProject,
  calculateLineAmount,
  getMilestoneValue,
  getQuantityConsumed,
  getCommercialAdjustment,
  getPreviousRaisedAmountForMilestone,
  getCommercialBillingStatus,
  getMilestoneBillingState,
  suggestNextInvoiceNumber,
  getAvailableQuantity,
  calculateExecutionProgress,
  getInvoiceWorkflowMode,
  round,
  type InvoiceWorkflowMode,
} from "./InvoiceCalculations";
import { InvoiceLineTable, type InvoiceLineRow } from "./InvoiceLineTable";

interface Props {
  project: Project;
  item: InvoiceItem;
  mode?: "create" | "view" | "edit";
  existingLine?: InvoiceLine;
  onClose: () => void;
  onSave: (updatedProject: Project) => void;
}

interface DraftLine {
  key: string;
  milestoneId?: string;
  milestoneLabel?: string;
  milestonePercent?: number;
  description: string;
  qtyInput: string;
  customAmountInput?: string;
  custom: boolean;
}

const todayISODate = (): string => new Date().toISOString().slice(0, 10);
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]";
const disabledFieldClass = "disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * Universal Intelligent PMO Invoice Engine.
 *
 * One classifier decides the workflow for every activity on a project —
 * does this project have payment milestones configured at all?
 * - Milestones configured: Commercial Milestone Workflow. Milestone % sets
 *   both the invoice amount and quantity consumed; no manual qty entry.
 * - No milestones configured: Quantity-Driven Workflow. Accounts enters
 *   Bill Qty directly against the Available Qty pool.
 */
export function RaiseInvoiceDrawer({
  project,
  item,
  mode = "create",
  existingLine,
  onClose,
  onSave,
}: Props) {
  const [show, setShow] = useState(false);

  const isViewMode = mode === "view";
  const isEditMode = mode === "edit";
  const isCreateMode = mode === "create";

  const milestones = useMemo(() => getMilestonesForProject(project), [project]);

  // The SOLE classifier for invoice layout/formula: does this project have
  // payment milestones configured at all? See getInvoiceWorkflowMode in
  // InvoiceCalculations.ts — there is no second, per-activity classifier
  // that could disagree with it.
  const workflowMode: InvoiceWorkflowMode = getInvoiceWorkflowMode(milestones);
  const isCommercialMilestone = workflowMode === "commercial_milestone";
  const baseAvailableQty = useMemo(() => getAvailableQuantity(item), [item]);

  // PMO Execution Progress (Read Only) — single source of truth shared with
  // ActivityRow.tsx / ActivityDetails.tsx via the Invoice Calculation
  // Service: always SUM(Quantity Consumed) from saved, non-cancelled
  // invoice records for this activity. Raising, editing, or deleting an
  // invoice recalculates this immediately — it is never a separate,
  // independently-tracked value.
  const executionProgress = useMemo(() => calculateExecutionProgress(item), [item]);
  const executionCompletedQty = executionProgress.completedQty;
  const executionRemainingQty = executionProgress.remainingQty;

  const [invoiceNo, setInvoiceNo] = useState(existingLine?.invoiceNo ?? suggestNextInvoiceNumber(project));
  const [invoiceDate, setInvoiceDate] = useState(existingLine?.invoiceDate ?? todayISODate());
  const [clientReference, setClientReference] = useState(existingLine?.clientReference ?? "");
  const [remarks, setRemarks] = useState(existingLine?.remarks ?? "");
  const [status, setStatus] = useState<InvoiceLineStatus>(existingLine?.status ?? "Pending");

  // Edit/View mode states
  const [editQtyInput, setEditQtyInput] = useState(
    existingLine ? String(existingLine.quantityBilled) : ""
  );
  const [editAmountInput, setEditAmountInput] = useState(
    existingLine ? String(existingLine.invoiceAmountINR) : ""
  );

  // Create mode: draft rows per milestone
  const [draftLines, setDraftLines] = useState<DraftLine[]>(() => {
    if (milestones.length > 0) {
      return milestones.map((m) => ({
        key: m.id,
        milestoneId: m.id,
        milestoneLabel: m.label,
        milestonePercent: m.percent,
        description: m.label,
        qtyInput: "",
        customAmountInput: undefined,
        custom: false,
      }));
    }
    return [
      {
        key: "default",
        milestoneId: undefined,
        milestoneLabel: "Full Completion",
        milestonePercent: 100,
        description: item.description,
        qtyInput: "",
        customAmountInput: undefined,
        custom: false,
      },
    ];
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleClose = () => {
    setShow(false);
    window.setTimeout(onClose, 200);
  };

  const addCustomLine = () => {
    setDraftLines((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        milestoneId: undefined,
        milestoneLabel: undefined,
        milestonePercent: 100,
        description: "",
        qtyInput: "",
        customAmountInput: undefined,
        custom: true,
      },
    ]);
  };

  const removeLine = (key: string) => {
    setDraftLines((prev) => prev.filter((line) => line.key !== key));
  };

  const updateLineQty = (key: string, qty: number) => {
    setDraftLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, qtyInput: qty === 0 ? "" : String(qty) } : line))
    );
  };

  const updateLineAmount = (key: string, amount: number) => {
    setDraftLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, customAmountInput: amount === 0 ? "" : String(amount) } : line))
    );
  };

  const updateLineDescription = (key: string, description: string) => {
    setDraftLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, description } : line))
    );
  };

  // Create mode rows
  const createRows: InvoiceLineRow[] = draftLines.map((line) => {
    const milestonePercent = line.milestonePercent ?? (line.milestoneId ? milestones.find((m) => m.id === line.milestoneId)?.percent ?? 100 : 100);
    const milestoneValue = getMilestoneValue(item.totalPrice, milestonePercent);
    const previousRaisedAmount = getPreviousRaisedAmountForMilestone(item, line.milestoneId);

    if (isCommercialMilestone) {
      // Commercial Milestone Workflow — the same Milestone % that sets the
      // invoice amount also sets the quantity consumed (single formula,
      // getQuantityConsumed), persisted on save so Quantity Progress reads
      // it back directly with no second calculation. Balance Amount /
      // Status come from getMilestoneBillingState, the single source of
      // truth shared with validation below. `alreadyInvoiced` is previously
      // SAVED invoices only — the amount currently being typed must never
      // be folded in, or the balance (and status) would read as settled
      // pre-save.
      const quantityConsumed = getQuantityConsumed(item.qty, milestonePercent);
      const currentInvoiceAmount = Number(line.customAmountInput) || 0;
      const { balanceAmount, validationLimit, status: billingStatus } = getMilestoneBillingState(milestoneValue, previousRaisedAmount);

      let error: string | null = null;
      if (currentInvoiceAmount < 0) {
        error = "Invoice amount cannot be negative.";
      } else if (currentInvoiceAmount > validationLimit) {
        error = `Amount exceeds remaining milestone balance (${formatBusinessINR(balanceAmount)}).`;
      }

      return {
        key: line.key,
        description: line.description,
        milestoneLabel: line.milestoneLabel,
        milestonePercent,
        contractQty: item.qty,
        completedQty: item.qty,
        eligibleQty: item.qty,
        qtyToBill: quantityConsumed,
        unitPrice: item.unitPrice,
        milestoneValue,
        calculatedAmount: milestoneValue,
        currentInvoiceAmount,
        commercialAdjustment: 0,
        previousRaisedAmount,
        remainingQty: 0,
        remainingAmount: balanceAmount,
        status: billingStatus,
        error,
        removable: line.custom,
      };
    }

    // Quantity-Driven Workflow (no milestones configured on this project) —
    // Accounts enters Bill Qty directly against the shared Available Qty
    // pool, also accounting for quantity typed into sibling rows in this
    // same not-yet-saved session so two rows can't over-claim it.
    const qtyToBill = Number(line.qtyInput) || 0;
    const otherDraftQtyInSession = draftLines
      .filter((other) => other.key !== line.key)
      .reduce((sum, other) => sum + (Number(other.qtyInput) || 0), 0);
    const eligibleQty = Math.max(round(baseAvailableQty - otherDraftQtyInSession), 0);

    const calculatedAmount = calculateLineAmount(qtyToBill, item.unitPrice);
    const currentInvoiceAmount = line.customAmountInput !== undefined && line.customAmountInput !== ""
      ? Number(line.customAmountInput)
      : calculatedAmount;

    const commercialAdjustment = getCommercialAdjustment(currentInvoiceAmount, calculatedAmount);
    const remainingQty = Math.max(eligibleQty - qtyToBill, 0);
    const remainingAmount = Math.max(milestoneValue - (previousRaisedAmount + currentInvoiceAmount), 0);

    let error: string | null = null;
    if (item.qty <= 0) {
      error = "Contract qty is 0. Not eligible.";
    } else if (qtyToBill > eligibleQty + 0.001) {
      error = `Qty to bill cannot exceed available qty (${eligibleQty} ${item.uom}).`;
    } else if (currentInvoiceAmount < 0) {
      error = "Invoice amount cannot be negative.";
    }

    const billingStatus = getCommercialBillingStatus(item.qty, milestoneValue, previousRaisedAmount + currentInvoiceAmount);

    return {
      key: line.key,
      description: line.description,
      milestoneLabel: line.milestoneLabel,
      milestonePercent,
      contractQty: item.qty,
      completedQty: item.qty,
      eligibleQty,
      qtyToBill,
      unitPrice: item.unitPrice,
      milestoneValue,
      calculatedAmount,
      currentInvoiceAmount,
      commercialAdjustment,
      previousRaisedAmount,
      remainingQty,
      remainingAmount,
      status: billingStatus,
      error,
      removable: line.custom,
    };
  });

  // Edit/View mode row
  const editQtyValue = Number(editQtyInput) || 0;
  const editMilestone = existingLine?.milestoneId ? milestones.find((m) => m.id === existingLine.milestoneId) : undefined;
  const editMilestonePercent = editMilestone?.percent ?? 100;
  const editMilestoneValue = getMilestoneValue(item.totalPrice, editMilestonePercent);
  const editPreviousRaisedAmount = getPreviousRaisedAmountForMilestone(item, existingLine?.milestoneId, existingLine?.id);

  const editCalculatedAmount = isCommercialMilestone
    ? editMilestoneValue
    : calculateLineAmount(editQtyValue, item.unitPrice);

  const editAmountValue = editAmountInput !== "" ? Number(editAmountInput) : editCalculatedAmount;
  const editCommercialAdjustment = isCommercialMilestone ? 0 : getCommercialAdjustment(editAmountValue, editCalculatedAmount);

  // Excludes this line's own prior quantity so editing it back to its
  // current value never trips the availability check. Only meaningful for
  // Quantity-Driven billing — milestone-driven lines never expose Bill Qty.
  const editEligibleQty = isCommercialMilestone
    ? item.qty
    : getAvailableQuantity(item, existingLine?.id);

  // Same single source of truth as create mode: Balance Amount / Status
  // reflect the milestone against OTHER saved invoices only, never the
  // amount currently being typed into this edit's own Invoice Amount field.
  const editMilestoneBillingState = getMilestoneBillingState(editMilestoneValue, editPreviousRaisedAmount);

  // Editing a milestone-driven invoice (amount, remarks, status) must never
  // silently rewrite the Quantity Consumed that was persisted when it was
  // originally saved — show and keep exactly what's on the record.
  const editQuantityBilled = isCommercialMilestone ? (existingLine?.quantityBilled ?? 0) : editQtyValue;

  const editRows: InvoiceLineRow[] = existingLine
    ? [
        {
          key: existingLine.id,
          description: existingLine.description ?? item.description,
          milestoneLabel: existingLine.milestoneName ?? editMilestone?.label ?? "Full Completion",
          milestonePercent: editMilestonePercent,
          contractQty: item.qty,
          completedQty: item.qty,
          eligibleQty: editEligibleQty,
          qtyToBill: editQuantityBilled,
          unitPrice: item.unitPrice,
          milestoneValue: editMilestoneValue,
          calculatedAmount: editCalculatedAmount,
          currentInvoiceAmount: editAmountValue,
          commercialAdjustment: editCommercialAdjustment,
          previousRaisedAmount: editPreviousRaisedAmount,
          remainingQty: isCommercialMilestone ? 0 : Math.max(editEligibleQty - editQtyValue, 0),
          remainingAmount: isCommercialMilestone
            ? editMilestoneBillingState.balanceAmount
            : Math.max(editMilestoneValue - (editPreviousRaisedAmount + editAmountValue), 0),
          status: isCommercialMilestone
            ? editMilestoneBillingState.status
            : getCommercialBillingStatus(item.qty, editMilestoneValue, editPreviousRaisedAmount + editAmountValue),
          error: null,
          removable: false,
        },
      ]
    : [];

  const rows = isCreateMode ? createRows : editRows;

  const hasBillableLine = isCreateMode
    ? createRows.some((row) => (isCommercialMilestone ? row.currentInvoiceAmount > 0 : row.qtyToBill > 0) && !row.error)
    : (isCommercialMilestone ? editAmountValue > 0 : editQtyValue > 0) && !editRows[0]?.error;

  const canSave =
    !isViewMode &&
    invoiceNo.trim() !== "" &&
    invoiceDate.trim() !== "" &&
    hasBillableLine;

  const handleSave = () => {
    if (!canSave) return;

    if (isEditMode && existingLine) {
      const updatedLine: InvoiceLine = {
        ...existingLine,
        invoiceDate,
        quantityBilled: editQuantityBilled,
        calculatedAmountINR: editCalculatedAmount,
        invoiceAmountINR: editAmountValue,
        commercialAdjustmentINR: editCommercialAdjustment,
        clientReference: clientReference.trim() || undefined,
        remarks: remarks.trim() || undefined,
        status,
      };

      onSave({
        ...project,
        invoiceItems: project.invoiceItems.map((invoiceItem) =>
          invoiceItem.id !== item.id
            ? invoiceItem
            : {
                ...invoiceItem,
                invoices: invoiceItem.invoices.map((line) => (line.id === existingLine.id ? updatedLine : line)),
              }
        ),
      });
      handleClose();
      return;
    }

    const newLines: InvoiceLine[] = createRows
      .filter((row) => (isCommercialMilestone ? row.currentInvoiceAmount > 0 : row.qtyToBill > 0) && !row.error)
      .map((row) => ({
        id: crypto.randomUUID(),
        invoiceNo: invoiceNo.trim(),
        invoiceDate,
        milestoneId: draftLines.find((line) => line.key === row.key)?.milestoneId,
        milestoneName: row.milestoneLabel,
        description: row.milestoneLabel ? undefined : row.description.trim() || item.description,
        quantityBilled: row.qtyToBill,
        calculatedAmountINR: row.calculatedAmount,
        invoiceAmountINR: row.currentInvoiceAmount,
        commercialAdjustmentINR: row.commercialAdjustment,
        clientReference: clientReference.trim() || undefined,
        remarks: remarks.trim() || undefined,
        status: "Pending",
        createdBy: "Administrator",
      }));

    onSave({
      ...project,
      invoiceItems: project.invoiceItems.map((invoiceItem) =>
        invoiceItem.id !== item.id
          ? invoiceItem
          : { ...invoiceItem, invoices: [...invoiceItem.invoices, ...newLines] }
      ),
    });
    handleClose();
  };

  const title = isViewMode ? "View Invoice" : isEditMode ? "Edit Invoice" : "Raise Invoice";
  const subtitle = item.description;

  return (
    <>
      {/* Backdrop */}
      <div
        role="button"
        aria-label="Close invoice drawer"
        tabIndex={-1}
        onClick={handleClose}
        className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200 ${
          show ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Drawer Panel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-[var(--nu-surface)] shadow-2xl transition-transform duration-200 ease-out md:w-[90%] lg:w-[720px] xl:w-[840px] 2xl:w-[920px] ${
          show ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Fixed Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--nu-border)] px-6 py-5 shrink-0 bg-white dark:bg-slate-900">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-[var(--nu-text)]">{title}</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 text-[10.5px] font-bold uppercase tracking-wider">
                {isCommercialMilestone ? "Commercial Milestone Billing" : "Quantity-Driven Billing"}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--nu-text-muted)] truncate">{subtitle}</p>
          </div>
          <button
            onClick={handleClose}
            className="shrink-0 rounded-lg p-2 text-[var(--nu-text-muted)] transition hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 space-y-6 overflow-y-auto px-6 py-6 custom-scrollbar">

          {/* ═══ SECTION 1: Execution Progress (PMO Source of Truth - Read Only) ═══ */}
          <div className="rounded-2xl border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-blue-600 dark:text-blue-400" />
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-blue-900 dark:text-blue-200">
                  Execution Progress (PMO Data)
                </h4>
              </div>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10.5px] font-bold">
                <Lock size={11} /> Read Only for Accounts
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
              <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl p-2.5 border border-blue-100 dark:border-blue-900/40">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Contract Qty</p>
                <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5">
                  {formatIndianNumber(item.qty)} <span className="text-[10.5px] font-medium text-slate-500">{item.uom}</span>
                </p>
              </div>

              <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl p-2.5 border border-emerald-200/60 dark:border-emerald-900/40">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={10} /> Completed Qty
                </p>
                <p className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {formatIndianNumber(executionCompletedQty)} <span className="text-[10.5px] font-medium text-slate-500">{item.uom}</span>
                </p>
              </div>

              <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Remaining Qty</p>
                <p className="text-sm font-extrabold text-slate-700 dark:text-slate-300 mt-0.5">
                  {formatIndianNumber(executionRemainingQty)} <span className="text-[10.5px] font-medium text-slate-500">{item.uom}</span>
                </p>
              </div>

              <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Unit Rate</p>
                <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100 mt-0.5" title={formatFullINR(item.unitPrice)}>
                  {formatBusinessINR(item.unitPrice)}/{item.uom}
                </p>
              </div>

              <div className="bg-white/80 dark:bg-slate-900/60 rounded-xl p-2.5 border border-slate-200 dark:border-slate-800 sm:col-span-1 col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Work Order Value</p>
                <p className="text-sm font-extrabold text-cyan-600 dark:text-cyan-400 mt-0.5" title={formatFullINR(item.totalPrice)}>
                  {formatBusinessINR(item.totalPrice)}
                </p>
              </div>
            </div>
          </div>

          {/* ═══ SECTION 2: Invoice Information ═══ */}
          <div className="rounded-2xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-4 space-y-4 shadow-2xs">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[var(--nu-accent)]" />
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">Invoice Header Details</h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className={labelClass}>Invoice Number</label>
                <Input
                  type="text"
                  value={invoiceNo}
                  disabled={isViewMode}
                  className={disabledFieldClass}
                  placeholder="e.g. PR-10039-INV-001"
                  onChange={(e) => setInvoiceNo(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Invoice Date</label>
                <Input
                  type="date"
                  value={invoiceDate}
                  disabled={isViewMode}
                  className={disabledFieldClass}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Client Reference / PO Ref</label>
                <Input
                  type="text"
                  value={clientReference}
                  disabled={isViewMode}
                  className={disabledFieldClass}
                  placeholder="Optional PO Reference"
                  onChange={(e) => setClientReference(e.target.value)}
                />
              </div>
              {!isCreateMode && (
                <div>
                  <label className={labelClass}>Invoice Status</label>
                  <Select
                    value={status}
                    disabled={isViewMode}
                    className={disabledFieldClass}
                    onChange={(e) => setStatus(e.target.value as InvoiceLineStatus)}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Paid">Paid</option>
                    <option value="Cancelled">Cancelled</option>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>Remarks / Internal Notes</label>
              <Textarea
                value={remarks}
                disabled={isViewMode}
                className={`resize-none ${disabledFieldClass}`}
                placeholder="Optional billing notes..."
                rows={2}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
          </div>

          {/* ═══ SECTION 3: Billable Line Items (Auto-Detected Engine) ═══ */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-extrabold text-[var(--nu-text)]">Billable Line Items Table</h4>
                <p className="text-[11.5px] text-[var(--nu-text-muted)] mt-0.5">
                  {isCommercialMilestone ? (
                    <span>Auto-Detected: <strong className="text-cyan-600 dark:text-cyan-400">Commercial Milestone Billing</strong> (Invoicing against milestone value).</span>
                  ) : (
                    <span>Auto-Detected: <strong className="text-blue-600 dark:text-blue-400">Quantity-Driven Billing</strong> (Accounts enters Bill Qty).</span>
                  )}
                </p>
              </div>
              {isCreateMode && (
                <Button variant="outline" size="sm" icon={<PlusCircle size={13} />} onClick={addCustomLine}>
                  Add Line
                </Button>
              )}
            </div>

            {isCreateMode ? (
              <InvoiceLineTable
                workflowMode={workflowMode}
                rows={rows}
                uom={item.uom}
                onQtyToBillChange={updateLineQty}
                onInvoiceAmountChange={updateLineAmount}
                onDescriptionChange={updateLineDescription}
                onRemoveRow={removeLine}
              />
            ) : (
              <InvoiceLineTable
                workflowMode={workflowMode}
                rows={rows}
                uom={item.uom}
                disabled={isViewMode}
                onQtyToBillChange={(_key, qty) => setEditQtyInput(qty === 0 ? "" : String(qty))}
                onInvoiceAmountChange={(_key, amount) => setEditAmountInput(amount === 0 ? "" : String(amount))}
                onDescriptionChange={() => {}}
                onRemoveRow={() => {}}
              />
            )}

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-[var(--nu-text-muted)] leading-relaxed space-y-1">
              <p>
                <strong>Intelligent PMO Engine:</strong> The system automatically selects the invoice layout based on contract type (Quantity vs Milestone).
              </p>
              <p>
                PM Execution Data is read-only. Accounts enters billing details and can edit Invoice Amount when commercial adjustments exist.
              </p>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="flex shrink-0 justify-end items-center gap-3 border-t border-[var(--nu-border)] px-6 py-4 bg-white dark:bg-slate-900 sticky bottom-0 z-10">
          {isViewMode ? (
            <Button variant="secondary" onClick={handleClose} className="w-[130px] py-2.5">
              Close
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={handleClose} className="w-[120px] py-2.5">
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!canSave}
                className="w-[160px] py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isEditMode ? "Save Changes" : "Save Invoice"}
              </Button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
