import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { AlertTriangle, FileText, Upload, X } from "lucide-react";

import type { InvoiceItem } from "../../../../../types/InvoiceItem";
import { Button } from "../../../../../components/ui/Button";
import { Input } from "../../../../../components/ui/Input";
import { Select } from "../../../../../components/ui/Select";
import { Textarea } from "../../../../../components/ui/Textarea";
import { formatBusinessINR, formatFullINR } from "../../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../../utils/quantityCalculations";

import type { PrototypeInvoiceEntry, PrototypeInvoiceStatus, PrototypeMilestoneTerm } from "./prototypeTypes";
import { calculateMilestoneAmount, findMilestone } from "./prototypeCalculations";
import type { usePrototypeInvoiceLedger } from "./usePrototypeInvoiceLedger";

/**
 * PROTOTYPE ONLY. Mirrors BillingProgressDrawer's exact drawer chrome for
 * design-language consistency. One drawer, three modes — "create" (Raise
 * Invoice, unchanged from before), "view" (read-only, opened from Billing
 * History), "edit" (Quantity / Invoice Date / Remarks / Status, opened from
 * Billing History). Save only ever calls the in-memory ledger — never
 * project/setProject.
 *
 * The Milestone dropdown is built entirely from the `milestones` prop —
 * whatever is configured on the project's Payments tab. This drawer never
 * hardcodes a milestone name or percentage.
 */
interface Props {
  item: InvoiceItem;
  milestones: PrototypeMilestoneTerm[];
  ledger: ReturnType<typeof usePrototypeInvoiceLedger>;
  mode?: "create" | "view" | "edit";
  existingEntry?: PrototypeInvoiceEntry;
  onClose: () => void;
}

const todayISODate = (): string => new Date().toISOString().slice(0, 10);

const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]";
const disabledFieldClass = "disabled:opacity-60 disabled:cursor-not-allowed";

const RaiseInvoiceDrawer = ({ item, milestones, ledger, mode = "create", existingEntry, onClose }: Props) => {
  const [show, setShow] = useState(false);

  const isViewMode = mode === "view";
  const isEditMode = mode === "edit";
  const isCreateMode = mode === "create";

  const [invoiceNo] = useState(existingEntry?.invoiceNo ?? ledger.suggestNextInvoiceNo);
  const [invoiceDate, setInvoiceDate] = useState(existingEntry?.invoiceDate ?? todayISODate());
  const [milestoneId, setMilestoneId] = useState<string>(existingEntry?.milestoneId ?? milestones[0]?.id ?? "");
  const [quantityInput, setQuantityInput] = useState(existingEntry ? String(existingEntry.quantity) : "");
  const [remarks, setRemarks] = useState(existingEntry?.remarks ?? "");
  const [status, setStatus] = useState<PrototypeInvoiceStatus>(existingEntry?.status ?? "pending");
  const [fileName, setFileName] = useState<string | undefined>(undefined);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleClose = () => {
    setShow(false);
    window.setTimeout(onClose, 200);
  };

  const term = findMilestone(milestones, milestoneId);
  const entry = ledger.getLedger(item.id);
  const completedBefore = entry[milestoneId] ?? 0;
  const pendingBefore = Math.max(item.qty - completedBefore, 0);

  // In edit mode the entry's OWN current quantity must not count against
  // itself — getEditableMaxQuantity already excludes it, unlike
  // getPendingQty (which would incorrectly block saving it unchanged).
  const maxQuantity =
    isEditMode && existingEntry ? ledger.getEditableMaxQuantity(existingEntry.id, item.qty) : pendingBefore;

  const quantityValue = quantityInput.trim() === "" ? 0 : Number(quantityInput);
  const isOverbilled = quantityValue > maxQuantity + 0.0001;

  const originalQuantity = isEditMode && existingEntry ? existingEntry.quantity : 0;
  const completedAfter =
    quantityValue > 0 && !isOverbilled ? completedBefore - originalQuantity + quantityValue : completedBefore;
  const pendingAfter = Math.max(item.qty - completedAfter, 0);

  // The single shared calculation — same function the Milestone Cards,
  // Commercial Summary, and Billing History use, so amounts can never drift
  // out of sync.
  const invoiceAmount = calculateMilestoneAmount(quantityValue, item.unitPrice || 0, term.percent);
  const completedAmountBefore = calculateMilestoneAmount(completedBefore, item.unitPrice || 0, term.percent);
  const completedAmountAfter = calculateMilestoneAmount(completedAfter, item.unitPrice || 0, term.percent);
  const pendingAmountBefore = calculateMilestoneAmount(pendingBefore, item.unitPrice || 0, term.percent);
  const pendingAmountAfter = calculateMilestoneAmount(pendingAfter, item.unitPrice || 0, term.percent);

  const canSave = !isViewMode && invoiceNo.trim() !== "" && milestoneId !== "" && quantityValue > 0 && !isOverbilled;

  const handleQuantityChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
    setQuantityInput(raw);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFileName(e.target.files?.[0]?.name);
  };

  const handleSave = () => {
    if (!canSave) return;

    if (isEditMode && existingEntry) {
      ledger.updateInvoice({
        id: existingEntry.id,
        quantity: quantityValue,
        invoiceDate,
        remarks,
        status,
        unitPrice: item.unitPrice || 0,
        percent: term.percent,
      });
    } else {
      ledger.raiseInvoice({
        activityId: item.id,
        invoiceNo: invoiceNo.trim(),
        invoiceDate,
        milestoneId,
        percent: term.percent,
        quantity: quantityValue,
        remarks,
        fileName,
        unitPrice: item.unitPrice || 0,
      });
    }

    handleClose();
  };

  const title = isViewMode ? "View Invoice" : isEditMode ? "Edit Invoice" : "Raise Invoice";
  const subtitle = isViewMode
    ? "Read-only view of this simulated invoice."
    : "Prototype preview — this record is simulated and not saved.";

  return (
    <>
      {/* Backdrop */}
      <div
        role="button"
        aria-label="Close invoice drawer"
        tabIndex={-1}
        onClick={handleClose}
        className={`fixed inset-0 z-40 bg-slate-900/20 transition-opacity duration-200 ${show ? "opacity-100" : "opacity-0"}`}
      />

      {/* Drawer */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[520px] flex-col bg-[var(--nu-surface)] shadow-2xl transition-transform duration-200 ease-out sm:w-[38%] sm:min-w-[420px] ${
          show ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--nu-border)] px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-[var(--nu-text)]">{title}</h2>
            <p className="mt-1 text-sm text-[var(--nu-text-muted)]">{subtitle}</p>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-2 text-[var(--nu-text-muted)] transition hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {/* Activity Information (Read Only) */}
          <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-4">
            <h3 className="text-sm font-semibold text-[var(--nu-text)]">{item.description}</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Quantity</p>
                <p className="mt-0.5 text-sm font-bold text-[var(--nu-text)]">{formatIndianNumber(item.qty)} {item.uom}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]">Unit Rate</p>
                <p className="mt-0.5 text-sm font-bold text-[var(--nu-text)]" title={formatFullINR(item.unitPrice)}>
                  {formatBusinessINR(item.unitPrice)}
                </p>
              </div>
              {milestones.map((m) => (
                <div key={m.id}>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--nu-text-muted)] truncate" title={m.label}>
                    {m.label}
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-[var(--nu-accent)]">{m.percent}%</p>
                </div>
              ))}
            </div>
          </div>

          {/* Invoice Details */}
          <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] p-4 space-y-4">
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-[var(--nu-accent)]" />
              <h4 className="text-sm font-bold text-[var(--nu-text)]">Invoice Details</h4>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Invoice No</label>
                <Input value={invoiceNo} disabled={!isCreateMode} className={disabledFieldClass} placeholder="INV001" />
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
            </div>

            <div>
              <label className={labelClass}>Milestone</label>
              <Select
                value={milestoneId}
                disabled={!isCreateMode}
                className={disabledFieldClass}
                onChange={(e) => setMilestoneId(e.target.value)}
              >
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.percent}%)
                  </option>
                ))}
              </Select>
            </div>

            {!isCreateMode && (
              <div>
                <label className={labelClass}>Status</label>
                <Select
                  value={status}
                  disabled={isViewMode}
                  className={disabledFieldClass}
                  onChange={(e) => setStatus(e.target.value as PrototypeInvoiceStatus)}
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </Select>
              </div>
            )}

            <div>
              <label className={labelClass}>Invoice Quantity</label>
              <Input
                type="text"
                inputMode="decimal"
                value={quantityInput}
                onChange={handleQuantityChange}
                disabled={isViewMode}
                placeholder="Enter completed quantity..."
                invalid={isOverbilled}
                className={disabledFieldClass}
              />
              {isOverbilled && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--nu-danger)]">
                  <AlertTriangle size={13} className="shrink-0" />
                  Cannot exceed the available {term.label.toLowerCase()} quantity ({formatIndianNumber(maxQuantity)} {item.uom}).
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Remarks</label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={isViewMode}
                placeholder="Optional notes for this invoice..."
                rows={3}
                className={`resize-none ${disabledFieldClass}`}
              />
            </div>

            {isCreateMode && (
              <div>
                <label className={labelClass}>Upload Invoice PDF</label>
                <label className="flex items-center gap-2 rounded-[var(--nu-radius-md)] border border-dashed border-[var(--nu-border-strong)] px-3.5 py-2.5 text-sm text-[var(--nu-text-muted)] cursor-pointer hover:border-[var(--nu-accent)] hover:text-[var(--nu-accent)] transition-colors">
                  <Upload size={15} className="shrink-0" />
                  <span className="truncate">{fileName ?? "Choose a PDF file (not uploaded — prototype only)"}</span>
                  <input type="file" accept="application/pdf" onChange={handleFileChange} className="hidden" />
                </label>
              </div>
            )}
          </div>

          {/* Live Summary */}
          <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] p-4">
            <h4 className="mb-3 text-sm font-bold text-[var(--nu-text)]">{isViewMode ? "Summary" : "Live Summary"}</h4>

            <div className="flex items-center justify-between py-2 border-b border-[var(--nu-border)]">
              <span className="text-sm text-[var(--nu-text-muted)]">Invoice Amount</span>
              <span className="text-sm font-bold text-[var(--nu-accent)] whitespace-nowrap" title={formatFullINR(invoiceAmount)}>
                {formatBusinessINR(invoiceAmount)}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-[var(--nu-border)]">
              <span className="text-sm text-[var(--nu-text-muted)]">{term.label} Completed Qty</span>
              <span className="text-sm font-semibold text-[var(--nu-text)] tabular-nums whitespace-nowrap">
                {formatIndianNumber(completedBefore)} <span className="text-[var(--nu-text-muted)]">→</span>{" "}
                <span className="text-[var(--nu-success)]">{formatIndianNumber(completedAfter)}</span>
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-[var(--nu-border)]">
              <span className="text-sm text-[var(--nu-text-muted)]">{term.label} Pending Qty</span>
              <span className="text-sm font-semibold text-[var(--nu-text)] tabular-nums whitespace-nowrap">
                {formatIndianNumber(pendingBefore)} <span className="text-[var(--nu-text-muted)]">→</span>{" "}
                <span className="text-[var(--nu-warning)]">{formatIndianNumber(pendingAfter)}</span>
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-[var(--nu-border)]">
              <span className="text-sm text-[var(--nu-text-muted)]">{term.label} Invoice Amount</span>
              <span className="text-sm font-semibold text-[var(--nu-text)] tabular-nums whitespace-nowrap">
                {formatBusinessINR(completedAmountBefore)} <span className="text-[var(--nu-text-muted)]">→</span>{" "}
                <span className="text-[var(--nu-success)]">{formatBusinessINR(completedAmountAfter)}</span>
              </span>
            </div>

            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-[var(--nu-text-muted)]">{term.label} Pending Amount</span>
              <span className="text-sm font-semibold text-[var(--nu-text)] tabular-nums whitespace-nowrap">
                {formatBusinessINR(pendingAmountBefore)} <span className="text-[var(--nu-text-muted)]">→</span>{" "}
                <span className="text-[var(--nu-warning)]">{formatBusinessINR(pendingAmountAfter)}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-[var(--nu-border)] px-6 py-4">
          {isViewMode ? (
            <Button variant="secondary" onClick={handleClose} className="px-5 py-2.5">
              Close
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={handleClose} className="px-5 py-2.5">
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!canSave}
                className="px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isEditMode ? "Save Changes" : "Save Invoice"}
              </Button>
            </>
          )}
        </div>
      </aside>
    </>
  );
};

export default RaiseInvoiceDrawer;
