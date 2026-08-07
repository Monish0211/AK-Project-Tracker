import { memo, useCallback, useMemo, useState } from "react";
import { X, Maximize2, Minimize2, ArrowLeft, AlertTriangle, Receipt } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import type { ProjectNote } from "../../../../types/ProjectNote";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Textarea } from "../../../../components/ui/Textarea";
import { Portal } from "../../../../components/ui/Portal";
import { formatIndianCurrency } from "../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../utils/quantityCalculations";
import {
  getInvoiceCyclesForProject,
  getActivityRaisedQtyExcludingCycle,
  getActivityLineForCycle,
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
 * Split into two layers so a keystroke in ONE row's Qty input never
 * re-triggers the expensive part of every OTHER row's computation:
 *  - BaseRow — everything that only depends on the activity itself and the
 *    saved invoice ledger (alreadyRaisedQty scans that activity's own
 *    invoice history). Memoized against [items, existingLines, invoiceNo]
 *    only, so it is NOT recomputed on every qtyInputs change.
 *  - WorkspaceRow — BaseRow plus the cheap, pure-arithmetic fields derived
 *    from the current qtyInputs value. Recomputed on every keystroke, but
 *    each row's own derivation is O(1) — no invoice-history scan — so doing
 *    it for all rows is fast even with hundreds of activities.
 */
interface BaseRow {
  item: InvoiceItem;
  existingLine?: InvoiceLine;
  orderQty: number;
  alreadyRaisedQty: number;
  unitRate: number;
}

interface WorkspaceRow extends BaseRow {
  currentQty: number;
  remainingQty: number;
  invoiceValue: number;
  error: string | null;
}

const todayISODate = (): string => new Date().toISOString().slice(0, 10);
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]";
const disabledFieldClass = "bg-slate-100/70 dark:bg-slate-800/50 text-[var(--nu-text-secondary)] cursor-not-allowed";

const formatNoteDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const UOM_DISPLAY_PLURAL: Record<string, string> = {
  "MAN-HOUR": "Man-Hours",
  "MAN-DAY": "Man-Days",
};

const formatActivityQtyLabel = (qty: number, uom: string): string =>
  `${formatIndianNumber(qty)} ${UOM_DISPLAY_PLURAL[uom] ?? uom}`;

interface InvoicedActivity {
  description: string;
  qty: number;
  uom: string;
}

/**
 * Builds the auto-generated Project Workspace Note text for one saved
 * invoice — "Activities Invoiced" + Remarks only (no "Raised By" line: the
 * Notes feed already shows who/when in its own card header, so repeating it
 * inside the message body would just be clutter). Every Raise Invoice save
 * produces exactly one of these, so the Project Workspace's Notes tab reads
 * as a running history of every invoice ever raised against the project.
 */
function buildInvoiceRaisedNoteMessage(
  cycleLabel: string,
  invoiceNo: string,
  invoiceDate: string,
  activities: InvoicedActivity[],
  remarks: string
): string {
  const lines = [
    `📄 ${cycleLabel} Raised`,
    "",
    `Invoice: ${invoiceNo}`,
    `Date: ${formatNoteDate(invoiceDate)}`,
    "",
    "Activities Invoiced",
    ...activities.map((activity) => `${activity.description} – ${formatActivityQtyLabel(activity.qty, activity.uom)}`),
  ];

  if (remarks.trim()) {
    lines.push("", "Remarks", remarks.trim());
  }

  return lines.join("\n");
}

interface WorkspaceTableRowProps {
  slNo: number;
  itemId: string;
  description: string;
  orderQtyLabel: string;
  alreadyRaisedQtyLabel: string;
  uom: string;
  qtyValue: string;
  error: string | null;
  unitRateLabel: string;
  invoiceValueLabel: string;
  remainingQtyLabel: string;
  onQtyChange: (itemId: string, raw: string) => void;
}

/**
 * One activity's row — React.memo'd so a keystroke in ONE row's Qty input
 * only re-renders that row, not all 500. `onQtyChange` is a stable
 * (useCallback, no deps) reference from the parent, and every other prop is
 * a plain string/number derived just for this row, so React.memo's default
 * shallow-equality check correctly skips re-rendering every untouched row.
 */
const WorkspaceTableRow = memo(function WorkspaceTableRow({
  slNo,
  itemId,
  description,
  orderQtyLabel,
  alreadyRaisedQtyLabel,
  uom,
  qtyValue,
  error,
  unitRateLabel,
  invoiceValueLabel,
  remainingQtyLabel,
  onQtyChange,
}: WorkspaceTableRowProps) {
  return (
    <tr className="nu-table-row hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
      <td className="px-3 py-3 text-center text-slate-500 dark:text-slate-400">{slNo}</td>
      <td className="px-3 py-3 font-semibold text-[var(--nu-text)] max-w-[220px] break-words">{description}</td>
      <td className="px-3 py-3 text-center tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-400">
        {orderQtyLabel} <span className="text-[10px] text-slate-400 uppercase">{uom}</span>
      </td>
      <td className="px-3 py-3 text-center tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-400">
        {alreadyRaisedQtyLabel} <span className="text-[10px] text-slate-400 uppercase">{uom}</span>
      </td>
      <td className="px-3 py-2.5">
        <Input
          type="text"
          inputMode="decimal"
          value={qtyValue}
          onChange={(e) => onQtyChange(itemId, e.target.value)}
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
      <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap text-slate-700 dark:text-slate-300">{unitRateLabel}</td>
      <td className="px-3 py-3 text-right tabular-nums font-semibold whitespace-nowrap text-slate-800 dark:text-slate-200">{invoiceValueLabel}</td>
      <td className="px-3 py-3 text-center tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-400">
        {remainingQtyLabel} <span className="text-[10px] text-slate-400 uppercase">{uom}</span>
      </td>
    </tr>
  );
});

/**
 * Step 2 of the unified, project-wide "Raise Invoice" flow — the Invoice
 * Workspace. ONE Excel-style table lists every activity at once (never a
 * single-activity drawer); Accounts enters a Current Invoice Qty per row and
 * Invoice Value = Qty × Unit Rate is computed automatically. No milestone
 * selection, no GST/HSN — the unified billing model this workspace writes
 * is always a single, plain quantity × rate line per (activity, cycle) pair.
 *
 * Reopening a cycle that already has lines pre-fills each row's Current
 * Invoice Qty from that cycle's own saved line, so Accounts can review or
 * adjust a cycle already in progress, not just create brand-new ones.
 */
export function InvoiceWorkspaceModal({ project, invoiceNo, onClose, onSave }: Props) {
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

  // Invoice Status — mandatory, Draft/Raised/Cancelled only (an invoice can
  // never be Partially Paid/Paid the moment it's raised; those only become
  // reachable later, via Edit Invoice). Reopening a cycle whose current
  // aggregate status is already one of these three resumes it; if the cycle
  // has since progressed to Partially Paid/Paid via Edit Invoice, this popup
  // has no option to represent that, so it falls back to "Raised" rather
  // than silently showing an out-of-range value.
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceLineStatus>(() => {
    const currentStatus = getInvoiceCycleStatus(project, invoiceNo);
    return (RAISE_INVOICE_STATUS_OPTIONS as InvoiceLineStatus[]).includes(currentStatus) ? currentStatus : "Raised";
  });

  const [qtyInputs, setQtyInputs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    existingLines.forEach((line, itemId) => {
      initial[itemId] = line.quantityBilled ? String(line.quantityBilled) : "";
    });
    return initial;
  });

  // Stable reference (no deps — only uses the setter's functional-update
  // form) so the memoized WorkspaceTableRow below never sees a "changed"
  // onQtyChange prop and therefore never re-renders just because ANOTHER
  // row's keystroke caused this component to re-render.
  const handleQtyChange = useCallback((itemId: string, raw: string) => {
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
    setQtyInputs((prev) => ({ ...prev, [itemId]: raw }));
  }, []);

  // Expensive per-activity work (scanning that activity's own invoice
  // history via getActivityRaisedQtyExcludingCycle) — memoized against
  // [items, existingLines, invoiceNo] only, so typing in a Qty box (which
  // only changes qtyInputs) never re-triggers it.
  const baseRows: BaseRow[] = useMemo(
    () =>
      items.map((item) => ({
        item,
        existingLine: existingLines.get(item.id),
        orderQty: item.qty,
        alreadyRaisedQty: getActivityRaisedQtyExcludingCycle(item, invoiceNo),
        unitRate: item.unitPrice,
      })),
    [items, existingLines, invoiceNo]
  );

  // Cheap, pure-arithmetic derivation from baseRows + qtyInputs — recomputed
  // on every keystroke, but each row's own work here is O(1), so doing it
  // for hundreds of activities is still fast.
  const rows: WorkspaceRow[] = useMemo(
    () =>
      baseRows.map((base) => {
        const currentQty = Number(qtyInputs[base.item.id]) || 0;
        const remainingQty = Math.max(round(base.orderQty - base.alreadyRaisedQty - currentQty), 0);
        const invoiceValue = round(currentQty * base.unitRate);

        let error: string | null = null;
        if (currentQty < 0) {
          error = "Cannot be negative.";
        } else if (currentQty > round(base.orderQty - base.alreadyRaisedQty) + 0.001) {
          error = `Exceeds remaining qty (${formatIndianNumber(Math.max(base.orderQty - base.alreadyRaisedQty, 0))} ${base.item.uom}).`;
        }

        return { ...base, currentQty, remainingQty, invoiceValue, error };
      }),
    [baseRows, qtyInputs]
  );

  const totalInvoiceValue = round(rows.filter((row) => row.currentQty > 0).reduce((sum, row) => sum + row.invoiceValue, 0));
  const hasBillableRow = rows.some((row) => row.currentQty > 0);
  const hasRowError = rows.some((row) => row.error);
  const canSave = hasBillableRow && !hasRowError && invoiceDate.trim() !== "" && !!invoiceStatus;

  const handleSave = () => {
    if (!canSave) return;

    const updatedItems = project.invoiceItems.map((item) => {
      const row = rows.find((r) => r.item.id === item.id);
      if (!row) return item;

      const existingLine = row.existingLine;

      if (row.currentQty > 0) {
        const updatedLine: InvoiceLine = {
          id: existingLine?.id ?? crypto.randomUUID(),
          invoiceNo,
          invoiceDate,
          description: item.description,
          quantityBilled: row.currentQty,
          unitPriceINR: row.unitRate,
          calculatedAmountINR: row.invoiceValue,
          invoiceAmountINR: row.invoiceValue,
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

      // Current Invoice Qty cleared to 0 — remove this activity's line from the cycle if one existed.
      if (existingLine) {
        return { ...item, invoices: item.invoices.filter((line) => line.id !== existingLine.id) };
      }

      return item;
    });

    // Auto-generate a Project Workspace Note summarizing this save — only
    // the activities actually billed in THIS invoice (Current Invoice Qty >
    // 0), plus the Remarks entered above. Created whenever at least one
    // activity was invoiced, even if Remarks was left blank.
    const invoicedActivities: InvoicedActivity[] = rows
      .filter((row) => row.currentQty > 0)
      .map((row) => ({ description: row.item.description, qty: row.currentQty, uom: row.item.uom }));

    const notes = [...(project.notes ?? [])];
    if (invoicedActivities.length > 0) {
      const systemNote: ProjectNote = {
        id: crypto.randomUUID(),
        projectId: project.id,
        message: buildInvoiceRaisedNoteMessage(cycleLabel, invoiceNo, invoiceDate, invoicedActivities, remarks),
        createdBy: "System",
        createdAt: new Date().toISOString(),
      };
      notes.unshift(systemNote);
    }

    onSave({ ...project, invoiceItems: updatedItems, notes });
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-2 sm:p-4">
        <div
          className={`relative flex flex-col bg-[var(--nu-surface)] shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 rounded-2xl transition-all duration-150 ${
            isMaximized ? "w-[99vw] h-[98vh]" : "w-[min(94vw,1400px)] h-[min(88vh,820px)]"
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
                    {cycleLabel}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--nu-text-muted)] truncate">Every activity, one invoice cycle</p>
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

            {/* Billing Table */}
            <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] overflow-hidden bg-white dark:bg-slate-900/60 shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-[var(--nu-border)]">
                      <th className="nu-table-th px-3 py-2.5 text-center w-12 font-bold text-slate-700 dark:text-slate-200">Sl No.</th>
                      <th className="nu-table-th px-3 py-2.5 text-left font-bold text-slate-700 dark:text-slate-200">Item Description</th>
                      <th className="nu-table-th px-3 py-2.5 text-center font-bold text-slate-700 dark:text-slate-200">Order Qty</th>
                      <th className="nu-table-th px-3 py-2.5 text-center font-bold text-slate-700 dark:text-slate-200">Already Raised Qty</th>
                      <th className="nu-table-th px-3 py-2.5 text-center w-32 font-bold text-slate-700 dark:text-slate-200">Current Invoice Qty</th>
                      <th className="nu-table-th px-3 py-2.5 text-right font-bold text-slate-700 dark:text-slate-200">Unit Rate (INR)</th>
                      <th className="nu-table-th px-3 py-2.5 text-right font-bold text-slate-700 dark:text-slate-200">Invoice Value (INR)</th>
                      <th className="nu-table-th px-3 py-2.5 text-center font-bold text-slate-700 dark:text-slate-200">Remaining Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--nu-border)]">
                    {rows.map((row, index) => (
                      <WorkspaceTableRow
                        key={row.item.id}
                        slNo={index + 1}
                        itemId={row.item.id}
                        description={row.item.description}
                        orderQtyLabel={formatIndianNumber(row.orderQty)}
                        alreadyRaisedQtyLabel={formatIndianNumber(row.alreadyRaisedQty)}
                        uom={row.item.uom}
                        qtyValue={qtyInputs[row.item.id] ?? ""}
                        error={row.error}
                        unitRateLabel={formatIndianCurrency(row.unitRate)}
                        invoiceValueLabel={formatIndianCurrency(row.invoiceValue)}
                        remainingQtyLabel={formatIndianNumber(row.remainingQty)}
                        onQtyChange={handleQtyChange}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-t-2 border-[var(--nu-border)]">
                      <td colSpan={6} className="px-3 py-3 text-right font-extrabold text-[var(--nu-text)] uppercase text-[11.5px] tracking-wide">
                        Total Invoice Value
                      </td>
                      <td className="px-3 py-3 text-right font-black text-blue-700 dark:text-cyan-300 text-[14px] tabular-nums whitespace-nowrap">
                        {formatIndianCurrency(totalInvoiceValue)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className={labelClass}>Remarks / Internal Notes</label>
              <Textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder='e.g. "30% Invoice Raised Upon Submission of Complete BEDP Package"'
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 justify-between items-center gap-3 border-t border-[var(--nu-border)] px-6 py-4 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 text-[11.5px] text-[var(--nu-text-muted)]">
              <Receipt size={14} />
              <span>{rows.filter((r) => r.currentQty > 0).length} of {rows.length} activities billed in this invoice</span>
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
