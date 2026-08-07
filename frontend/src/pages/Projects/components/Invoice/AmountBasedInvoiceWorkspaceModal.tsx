import { memo, useCallback, useMemo, useState } from "react";
import { X, Maximize2, Minimize2, ArrowLeft, AlertTriangle, CheckCircle2, Receipt } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import type { ProjectNote } from "../../../../types/ProjectNote";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Textarea } from "../../../../components/ui/Textarea";
import { Portal } from "../../../../components/ui/Portal";
import { formatIndianCurrency } from "../../../../utils/formatCurrency";
import {
  getInvoiceCyclesForProject,
  getActivityRaisedAmountExcludingCycle,
  getActivityLineForCycle,
  getGstBreakdown,
  getInvoiceCycleStatus,
  RAISE_INVOICE_STATUS_OPTIONS,
  INVOICE_LINE_STATUS_LABEL,
  round,
} from "./InvoiceCalculations";

interface Props {
  project: Project;
  invoiceNo: string;
  onClose: () => void;
  onSave: (updatedProject: Project) => void;
}

/**
 * Split the same way as InvoiceWorkspaceModal's BaseRow/WorkspaceRow: the
 * expensive part (previouslyInvoiced scans that activity's own invoice
 * history) is memoized separately from the cheap per-keystroke arithmetic,
 * so typing an amount for ONE activity never re-scans every OTHER
 * activity's invoice history.
 */
interface BaseAllocationRow {
  item: InvoiceItem;
  existingLine?: InvoiceLine;
  contractValue: number;
  previouslyInvoiced: number;
  balanceAvailable: number;
}

interface AllocationRow extends BaseAllocationRow {
  invoiceAmount: number;
  error: string | null;
}

const todayISODate = (): string => new Date().toISOString().slice(0, 10);
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]";
const disabledFieldClass = "bg-slate-100/70 dark:bg-slate-800/50 text-[var(--nu-text-secondary)] cursor-not-allowed";
const EXCEEDS_BALANCE_ERROR = "Invoice amount cannot exceed available balance.";

const formatNoteDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

interface AllocationTableRowProps {
  itemId: string;
  description: string;
  contractValueLabel: string;
  previouslyInvoicedLabel: string;
  balanceAvailableLabel: string;
  amountValue: string;
  error: string | null;
  onAmountChange: (itemId: string, raw: string) => void;
}

/**
 * One activity's row — React.memo'd so typing in ONE row's Invoice Amount
 * field only re-renders that row. `onAmountChange` is a stable (useCallback,
 * no deps) reference, so React.memo's shallow prop comparison correctly
 * skips every other, untouched row.
 */
const AllocationTableRow = memo(function AllocationTableRow({
  itemId,
  description,
  contractValueLabel,
  previouslyInvoicedLabel,
  balanceAvailableLabel,
  amountValue,
  error,
  onAmountChange,
}: AllocationTableRowProps) {
  return (
    <tr className="nu-table-row hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
      <td className="px-3 py-3 font-semibold text-[var(--nu-text)] max-w-[220px] break-words">{description}</td>
      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">{contractValueLabel}</td>
      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-400">{previouslyInvoicedLabel}</td>
      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">{balanceAvailableLabel}</td>
      <td className="px-3 py-2.5">
        <Input
          type="text"
          inputMode="decimal"
          value={amountValue}
          onChange={(e) => onAmountChange(itemId, e.target.value)}
          placeholder="0"
          invalid={!!error}
          className={`text-center font-extrabold text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-900 ${
            error ? "!border-red-500 !ring-red-500/20" : ""
          }`}
        />
        {error && (
          <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-[var(--nu-danger)]">
            <AlertTriangle size={10} className="shrink-0" />
            {error}
          </p>
        )}
      </td>
    </tr>
  );
});

/**
 * Amount Based's own "Raise Invoice" workspace — a flat, one-row-per-activity
 * Amount Allocation table (the Amount Based equivalent of InvoiceWorkspaceModal's
 * Qty column, but a direct, freely-editable Invoice Amount capped at that
 * activity's own remaining Contract Value — no quantity, no milestone, no
 * SET at all). Rendered instead of every other workspace whenever
 * `getInvoiceMethod(project) === "amount_based"` — never shares calculation
 * or save logic with Quantity/Lump Sum/MLMP.
 */
export function AmountBasedInvoiceWorkspaceModal({ project, invoiceNo, onClose, onSave }: Props) {
  const [isMaximized, setIsMaximized] = useState(false);

  const items = useMemo(() => project.invoiceItems ?? [], [project.invoiceItems]);

  const existingLines = useMemo(() => {
    const map = new Map<string, InvoiceLine>();
    items.forEach((item) => {
      const line = getActivityLineForCycle(item, invoiceNo);
      if (line) map.set(item.id, line);
    });
    return map;
  }, [items, invoiceNo]);

  const firstExistingLine = useMemo(() => existingLines.values().next().value as InvoiceLine | undefined, [existingLines]);

  const cycleLabel = useMemo(() => {
    const match = getInvoiceCyclesForProject(project).find((cycle) => cycle.invoiceNo === invoiceNo);
    return match?.label ?? "New Invoice";
  }, [project, invoiceNo]);

  const [invoiceDate, setInvoiceDate] = useState(firstExistingLine?.invoiceDate ?? todayISODate());
  const [clientReference, setClientReference] = useState(firstExistingLine?.clientReference ?? "");
  const [remarks, setRemarks] = useState(firstExistingLine?.remarks ?? "");
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceLineStatus>(() => {
    const currentStatus = getInvoiceCycleStatus(project, invoiceNo);
    return (RAISE_INVOICE_STATUS_OPTIONS as InvoiceLineStatus[]).includes(currentStatus) ? currentStatus : "Raised";
  });

  const [amountInputs, setAmountInputs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    existingLines.forEach((line, itemId) => {
      initial[itemId] = line.invoiceAmountINR ? String(line.invoiceAmountINR) : "";
    });
    return initial;
  });

  // Stable reference (no deps — functional setState only) so the memoized
  // AllocationTableRow below never re-renders just because ANOTHER row's
  // keystroke caused this component to re-render.
  const handleAmountChange = useCallback((itemId: string, raw: string) => {
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
    setAmountInputs((prev) => ({ ...prev, [itemId]: raw }));
  }, []);

  // Expensive per-activity work (getActivityRaisedAmountExcludingCycle scans
  // that activity's own invoice history) — memoized against
  // [items, existingLines, invoiceNo] only, so typing an amount never
  // re-triggers it for any row.
  const baseRows: BaseAllocationRow[] = useMemo(
    () =>
      items.map((item) => {
        const contractValue = item.totalPrice;
        const previouslyInvoiced = getActivityRaisedAmountExcludingCycle(item, invoiceNo);
        return {
          item,
          existingLine: existingLines.get(item.id),
          contractValue,
          previouslyInvoiced,
          balanceAvailable: Math.max(round(contractValue - previouslyInvoiced), 0),
        };
      }),
    [items, existingLines, invoiceNo]
  );

  // No checkbox — entering an amount > 0 is itself what includes an activity
  // in this invoice; clearing it back to 0 removes it. The Invoice Amount
  // field is the only interaction. Cheap, pure-arithmetic derivation —
  // recomputed on every keystroke, but each row is just O(1) math.
  const rows: AllocationRow[] = useMemo(
    () =>
      baseRows.map((base) => {
        const invoiceAmount = Number(amountInputs[base.item.id]) || 0;

        let error: string | null = null;
        if (invoiceAmount < 0) error = "Cannot be negative.";
        else if (invoiceAmount > base.balanceAvailable + 0.001) error = EXCEEDS_BALANCE_ERROR;

        return { ...base, invoiceAmount, error };
      }),
    [baseRows, amountInputs]
  );

  const selectedRows = rows.filter((row) => row.invoiceAmount > 0);
  const totalInvoiceAmount = round(selectedRows.reduce((sum, row) => sum + row.invoiceAmount, 0));
  const gst = getGstBreakdown(project, totalInvoiceAmount);
  const hasRowError = rows.some((row) => row.error);
  const canSave = selectedRows.length > 0 && !hasRowError && invoiceDate.trim() !== "" && !!invoiceStatus;

  const handleSave = () => {
    if (!canSave) return;

    const updatedItems = project.invoiceItems.map((item) => {
      const row = rows.find((r) => r.item.id === item.id);
      if (!row) return item;

      const existingLine = row.existingLine;

      if (row.invoiceAmount > 0) {
        const updatedLine: InvoiceLine = {
          id: existingLine?.id ?? crypto.randomUUID(),
          invoiceNo,
          invoiceDate,
          description: item.description,
          quantityBilled: 0,
          calculatedAmountINR: row.invoiceAmount,
          invoiceAmountINR: row.invoiceAmount,
          commercialAdjustmentINR: 0,
          clientReference: clientReference.trim() || undefined,
          remarks: remarks.trim() || undefined,
          status: invoiceStatus,
          createdBy: existingLine?.createdBy ?? "Administrator",
        };

        return {
          ...item,
          invoices: existingLine
            ? item.invoices.map((line) => (line.id === existingLine.id ? updatedLine : line))
            : [...item.invoices, updatedLine],
        };
      }

      // Amount cleared to 0 — remove this activity's line from the cycle if one existed.
      if (existingLine) {
        return { ...item, invoices: item.invoices.filter((line) => line.id !== existingLine.id) };
      }

      return item;
    });

    const notes = [...(project.notes ?? [])];
    if (selectedRows.length > 0) {
      const noteLines = [
        `📄 ${cycleLabel} Raised`,
        "",
        `Invoice No: ${invoiceNo}`,
        `Method: Amount Based`,
        `Date: ${formatNoteDate(invoiceDate)}`,
        "",
        "Activities",
        ...selectedRows.map((row) => `• ${row.item.description} — ${formatIndianCurrency(row.invoiceAmount)}`),
        "",
        `Total: ${formatIndianCurrency(totalInvoiceAmount)}`,
      ];
      if (remarks.trim()) {
        noteLines.push("", "Remarks", remarks.trim());
      }
      notes.unshift({
        id: crypto.randomUUID(),
        projectId: project.id,
        message: noteLines.join("\n"),
        createdBy: "System",
        createdAt: new Date().toISOString(),
      } satisfies ProjectNote);
    }

    onSave({ ...project, invoiceItems: updatedItems, notes });
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-2 sm:p-4">
        <div
          className={`relative flex flex-col bg-[var(--nu-surface)] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 rounded-2xl transition-all duration-150 ${
            isMaximized ? "w-[99vw] h-[98vh]" : "w-[min(94vw,1300px)] h-[min(88vh,820px)]"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-4 border-b border-[var(--nu-border)] px-6 py-3.5 shrink-0 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-3.5 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              >
                <ArrowLeft size={14} />
                <span>Back to Project</span>
              </button>
              <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold text-[var(--nu-text)] tracking-tight truncate">Raise Invoice</h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 text-[10.5px] font-bold uppercase tracking-wider shrink-0">
                    {cycleLabel} · Amount Based Billing
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--nu-text-muted)] truncate">Allocate an invoice amount to any combination of activities</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsMaximized((prev) => !prev)}
                className="rounded-xl p-2 text-[var(--nu-text-muted)] transition hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] cursor-pointer"
                title={isMaximized ? "Restore workspace size" : "Maximize workspace"}
                aria-label={isMaximized ? "Restore workspace size" : "Maximize workspace"}
              >
                {isMaximized ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-[var(--nu-text-muted)] transition hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] cursor-pointer"
                aria-label="Close workspace"
                title="Close workspace"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 space-y-5 overflow-y-auto overflow-x-hidden p-4 sm:p-6 nu-scrollbar">
            {/* Invoice Header Details */}
            <div className="rounded-2xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div>
                  <label className={labelClass}>Invoice Cycle</label>
                  <Input type="text" value={cycleLabel} disabled className={disabledFieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Invoice No</label>
                  <Input type="text" value={invoiceNo} disabled className={`${disabledFieldClass} font-mono`} />
                </div>
                <div>
                  <label className={labelClass}>Invoice Date</label>
                  <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Client Reference / PO Reference</label>
                  <Input
                    type="text"
                    value={clientReference}
                    placeholder="Optional PO Reference"
                    onChange={(e) => setClientReference(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Invoice Status *</label>
                  <Select value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value as InvoiceLineStatus)}>
                    {RAISE_INVOICE_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {INVOICE_LINE_STATUS_LABEL[option]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            {/* Amount Allocation Table */}
            <div className="space-y-2.5">
              <h4 className="text-sm font-extrabold text-[var(--nu-text)]">Amount Allocation</h4>
              <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] overflow-hidden bg-white dark:bg-slate-900/60 shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-[12.5px]">
                    <thead>
                      <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-[var(--nu-border)]">
                        <th className="nu-table-th px-3 py-2.5 text-left font-bold text-slate-700 dark:text-slate-200">Activity</th>
                        <th className="nu-table-th px-3 py-2.5 text-right font-bold text-slate-700 dark:text-slate-200">Contract Value</th>
                        <th className="nu-table-th px-3 py-2.5 text-right font-bold text-slate-700 dark:text-slate-200">Previously Invoiced</th>
                        <th className="nu-table-th px-3 py-2.5 text-right font-bold text-slate-700 dark:text-slate-200">Balance Available</th>
                        <th className="nu-table-th px-3 py-2.5 text-center w-36 font-bold text-slate-700 dark:text-slate-200">Invoice Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--nu-border)]">
                      {rows.map((row) => (
                        <AllocationTableRow
                          key={row.item.id}
                          itemId={row.item.id}
                          description={row.item.description}
                          contractValueLabel={formatIndianCurrency(row.contractValue)}
                          previouslyInvoicedLabel={formatIndianCurrency(row.previouslyInvoiced)}
                          balanceAvailableLabel={formatIndianCurrency(row.balanceAvailable)}
                          amountValue={amountInputs[row.item.id] ?? ""}
                          error={row.error}
                          onAmountChange={handleAmountChange}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Invoice Summary */}
            <div className="rounded-2xl border border-blue-200/80 dark:border-slate-800 bg-gradient-to-r from-blue-50/50 via-cyan-50/20 to-blue-50/50 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-slate-900/80 p-5 space-y-3.5">
              <div className="flex items-center gap-2">
                <Receipt size={16} className="text-blue-600 dark:text-cyan-400" />
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">Invoice Summary</h4>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Activities Selected</p>
                {selectedRows.length === 0 ? (
                  <p className="text-[12.5px] text-slate-400 italic">None selected yet</p>
                ) : (
                  <ul className="space-y-0.5">
                    {selectedRows.map((row) => (
                      <li key={row.item.id} className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        {row.item.description} — {formatIndianCurrency(row.invoiceAmount)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Activities Selected</p>
                  <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">{selectedRows.length}</p>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Invoice Amount</p>
                  <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">{formatIndianCurrency(totalInvoiceAmount)}</p>
                </div>
                {gst.isApplicable && (
                  <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">GST ({gst.ratePercent}%)</p>
                    <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">{formatIndianCurrency(gst.gstAmount)}</p>
                  </div>
                )}
                <div className="bg-white/90 dark:bg-slate-900/90 p-3 rounded-xl border border-blue-300 dark:border-cyan-800">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600 dark:text-cyan-400">Grand Total</p>
                  <p className="text-lg font-black text-blue-700 dark:text-cyan-300 mt-0.5 tabular-nums">{formatIndianCurrency(gst.grandTotal)}</p>
                </div>
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className={labelClass}>Remarks / Internal Notes</label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Invoice raised for Basic Engineering and Site Visit activities as approved by client."
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 justify-between items-center gap-3 border-t border-[var(--nu-border)] px-6 py-4 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 text-[11.5px] text-[var(--nu-text-muted)]">
              <Receipt size={14} />
              <span>{selectedRows.length} of {rows.length} activities billed in this invoice</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Button variant="secondary" onClick={onClose} className="px-4 py-2.5">
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!canSave}
                className="px-6 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Invoice
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
