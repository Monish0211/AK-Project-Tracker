import { useMemo, useState } from "react";
import { X, Maximize2, Minimize2, ArrowLeft, Lock, CheckCircle2, Receipt } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import type { ProjectNote } from "../../../../types/ProjectNote";
import { Button } from "../../../../components/ui/Button";
import { Input } from "../../../../components/ui/Input";
import { Select } from "../../../../components/ui/Select";
import { Textarea } from "../../../../components/ui/Textarea";
import { Portal } from "../../../../components/ui/Portal";
import { formatIndianCurrency } from "../../../../utils/formatCurrency";
import {
  getInvoiceCyclesForProject,
  getProjectLumpSumMilestoneRows,
  getGstBreakdown,
  getInvoiceCycleStatus,
  RAISE_INVOICE_STATUS_OPTIONS,
  INVOICE_LINE_STATUS_LABEL,
  round,
  type ProjectLumpSumMilestoneRow,
} from "./InvoiceCalculations";

interface Props {
  project: Project;
  invoiceNo: string;
  onClose: () => void;
  onSave: (updatedProject: Project) => void;
}

const todayISODate = (): string => new Date().toISOString().slice(0, 10);
const labelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--nu-text-muted)]";
const disabledFieldClass = "bg-slate-100/70 dark:bg-slate-800/50 text-[var(--nu-text-secondary)] cursor-not-allowed";

const formatNoteDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Lump Sum's own "Raise Invoice" workspace — the milestone-checklist
 * equivalent of InvoiceWorkspaceModal (which stays exactly as-is and keeps
 * serving Quantity/Line Item Billing only). Rendered instead of that modal
 * whenever `getInvoiceMethod(project) === "lump_sum"` (see
 * InvoiceDashboard.tsx) — never the qty/activity table, since Lump Sum
 * invoices bill against Payment Milestones, not activity quantities.
 *
 * A milestone can be selected in this invoice only if it hasn't already
 * been billed under a DIFFERENT cycle — once used, it's locked everywhere
 * except the very cycle it was billed under, so reopening that cycle still
 * lets you review or unselect it. Multiple milestones may be selected in
 * the same invoice (clients routinely certify several stages together).
 */
export function LumpSumInvoiceWorkspaceModal({ project, invoiceNo, onClose, onSave }: Props) {
  const [isMaximized, setIsMaximized] = useState(false);

  const milestoneRows = useMemo(() => getProjectLumpSumMilestoneRows(project), [project]);

  const cycleLabel = useMemo(() => {
    const match = getInvoiceCyclesForProject(project).find((cycle) => cycle.invoiceNo === invoiceNo);
    return match?.label ?? "New Invoice";
  }, [project, invoiceNo]);

  // A line already exists under THIS cycle for a milestone that was rows
  // pre-selected when reopening an in-progress invoice — find any one such
  // line to pre-fill the shared header fields (date/reference/remarks).
  const firstLineInThisCycle = useMemo<InvoiceLine | undefined>(() => {
    for (const item of project.invoiceItems ?? []) {
      const line = (item.invoices ?? []).find((l) => l.invoiceNo === invoiceNo && l.status !== "Cancelled");
      if (line) return line;
    }
    return undefined;
  }, [project.invoiceItems, invoiceNo]);

  const [invoiceDate, setInvoiceDate] = useState(firstLineInThisCycle?.invoiceDate ?? todayISODate());
  const [clientReference, setClientReference] = useState(firstLineInThisCycle?.clientReference ?? "");
  const [remarks, setRemarks] = useState(firstLineInThisCycle?.remarks ?? "");
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceLineStatus>(() => {
    const currentStatus = getInvoiceCycleStatus(project, invoiceNo);
    return (RAISE_INVOICE_STATUS_OPTIONS as InvoiceLineStatus[]).includes(currentStatus) ? currentStatus : "Raised";
  });

  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    milestoneRows.forEach((row) => {
      if (row.invoicedUnderInvoiceNo === invoiceNo) initial.add(row.id);
    });
    return initial;
  });

  const toggleMilestone = (row: ProjectLumpSumMilestoneRow) => {
    const isLockedElsewhere = row.alreadyInvoiced && row.invoicedUnderInvoiceNo !== invoiceNo;
    if (isLockedElsewhere) return;
    setSelectedMilestoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  };

  const selectedRows = milestoneRows.filter((row) => selectedMilestoneIds.has(row.id));
  const totalPercent = round(selectedRows.reduce((sum, row) => sum + row.percent, 0));
  const invoiceAmount = round(selectedRows.reduce((sum, row) => sum + row.invoiceAmount, 0));
  const gst = getGstBreakdown(project, invoiceAmount);

  const canSave = selectedRows.length > 0 && invoiceDate.trim() !== "" && !!invoiceStatus;

  const handleSave = () => {
    if (!canSave) return;

    const items = project.invoiceItems ?? [];

    const updatedItems = items.map((item) => {
      let invoices = item.invoices ?? [];

      milestoneRows.forEach((row) => {
        const isLockedElsewhere = row.alreadyInvoiced && row.invoicedUnderInvoiceNo !== invoiceNo;
        if (isLockedElsewhere) return; // never touch another cycle's milestone lines

        const existingLine = invoices.find(
          (line) => line.milestoneId === row.id && line.invoiceNo === invoiceNo && line.status !== "Cancelled"
        );
        const isSelected = selectedMilestoneIds.has(row.id);

        if (isSelected) {
          const amount = round((item.totalPrice || 0) * (row.percent / 100));
          const updatedLine: InvoiceLine = {
            id: existingLine?.id ?? crypto.randomUUID(),
            invoiceNo,
            invoiceDate,
            milestoneId: row.id,
            milestoneName: row.label,
            quantityBilled: 0,
            calculatedAmountINR: amount,
            invoiceAmountINR: amount,
            commercialAdjustmentINR: 0,
            clientReference: clientReference.trim() || undefined,
            remarks: remarks.trim() || undefined,
            status: invoiceStatus,
            createdBy: existingLine?.createdBy ?? "Administrator",
          };
          invoices = existingLine
            ? invoices.map((line) => (line.id === existingLine.id ? updatedLine : line))
            : [...invoices, updatedLine];
        } else if (existingLine) {
          // Unchecked — remove this activity's share of the milestone from this cycle.
          invoices = invoices.filter((line) => line.id !== existingLine.id);
        }
      });

      return { ...item, invoices };
    });

    // Auto-generate a Project Workspace Note — the milestone-based
    // equivalent of the Quantity workspace's own note, listing which
    // milestones were certified together rather than which activities/qty
    // were billed.
    const notes = [...(project.notes ?? [])];
    if (selectedRows.length > 0) {
      const noteLines = [
        `📄 ${cycleLabel} Raised`,
        "",
        `Invoice: ${invoiceNo}`,
        `Date: ${formatNoteDate(invoiceDate)}`,
        "",
        "Milestones Invoiced",
        ...selectedRows.map((row) => `• ${row.label} (${row.percent}%)`),
        "",
        `Total: ${totalPercent}%`,
        `Invoice Amount: ${formatIndianCurrency(invoiceAmount)}`,
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
            isMaximized ? "w-[99vw] h-[98vh]" : "w-[min(90vw,1100px)] h-[min(88vh,780px)]"
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
                    {cycleLabel} · Lump Sum Billing
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--nu-text-muted)] truncate">Select every milestone certified together in this invoice</p>
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

            {/* Milestone Checklist */}
            <div className="space-y-2.5">
              <h4 className="text-sm font-extrabold text-[var(--nu-text)]">Payment Milestones</h4>
              {milestoneRows.length === 0 ? (
                <div className="rounded-[var(--nu-radius-md)] border border-dashed border-[var(--nu-border)] p-6 text-center text-[12.5px] text-[var(--nu-text-muted)]">
                  No Payment Milestones configured — define them in the Payments tab before raising a Lump Sum invoice.
                </div>
              ) : (
                <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] overflow-hidden bg-white dark:bg-slate-900/60 divide-y divide-[var(--nu-border)]">
                  {milestoneRows.map((row) => {
                    const isLockedElsewhere = row.alreadyInvoiced && row.invoicedUnderInvoiceNo !== invoiceNo;
                    const isChecked = selectedMilestoneIds.has(row.id);

                    return (
                      <label
                        key={row.id}
                        className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                          isLockedElsewhere
                            ? "bg-slate-50 dark:bg-slate-800/40 cursor-not-allowed opacity-70"
                            : "hover:bg-slate-50/70 dark:hover:bg-slate-800/30 cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isLockedElsewhere}
                          onChange={() => toggleMilestone(row)}
                          className="h-4 w-4 rounded border-[var(--nu-border)] text-[var(--nu-accent)] focus:ring-[var(--nu-accent)] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                        />

                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-[var(--nu-text)] text-[13px]">{row.label}</span>
                        </div>

                        <span className="text-[11.5px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold border border-slate-200 dark:border-slate-700/60 shrink-0">
                          {row.percent}%
                        </span>

                        <span className="text-right font-semibold text-[13px] text-[var(--nu-text)] tabular-nums w-32 shrink-0">
                          {formatIndianCurrency(row.invoiceAmount)}
                        </span>

                        <span className="w-44 shrink-0 text-right">
                          {isLockedElsewhere ? (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-500 dark:text-slate-400">
                              <Lock size={11} /> Already Invoiced ({row.invoicedUnderCycleLabel ?? row.invoicedUnderInvoiceNo})
                            </span>
                          ) : isChecked ? (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 size={11} /> Selected
                            </span>
                          ) : (
                            <span className="text-[10.5px] font-semibold text-slate-400">Available</span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Invoice Summary */}
            <div className="rounded-2xl border border-blue-200/80 dark:border-slate-800 bg-gradient-to-r from-blue-50/50 via-cyan-50/20 to-blue-50/50 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-slate-900/80 p-5 space-y-3.5">
              <div className="flex items-center gap-2">
                <Receipt size={16} className="text-blue-600 dark:text-cyan-400" />
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">Invoice Summary</h4>
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Selected Milestones</p>
                {selectedRows.length === 0 ? (
                  <p className="text-[12.5px] text-slate-400 italic">None selected yet</p>
                ) : (
                  <ul className="space-y-0.5">
                    {selectedRows.map((row) => (
                      <li key={row.id} className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <CheckCircle2 size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        {row.label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Percentage</p>
                  <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">{totalPercent}%</p>
                </div>
                <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Invoice Amount</p>
                  <p className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5 tabular-nums">{formatIndianCurrency(invoiceAmount)}</p>
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
                placeholder="e.g. 30% BEDP + 20% AFC certified together as approved by client."
                rows={2}
                className="resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 justify-between items-center gap-3 border-t border-[var(--nu-border)] px-6 py-4 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 text-[11.5px] text-[var(--nu-text-muted)]">
              <Receipt size={14} />
              <span>{selectedRows.length} of {milestoneRows.length} milestones selected in this invoice</span>
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
