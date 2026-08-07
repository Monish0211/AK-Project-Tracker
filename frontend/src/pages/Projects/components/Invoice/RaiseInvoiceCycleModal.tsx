import { useState } from "react";
import { X, Maximize2, Minimize2, Plus, FileText } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { InvoiceMethod } from "../../../../types/InvoiceItem";
import { Button } from "../../../../components/ui/Button";
import { Badge } from "../../../../components/ui/Badge";
import { Portal } from "../../../../components/ui/Portal";
import { formatIndianCurrency } from "../../../../utils/formatCurrency";
import {
  getInvoiceMethod,
  getInvoiceCycleListForRaise,
  INVOICE_LINE_STATUS_LABEL,
  INVOICE_LINE_STATUS_TONE,
  type InvoiceCycleListRow,
} from "./InvoiceCalculations";

interface Props {
  project: Project;
  onClose: () => void;
  onContinue: (invoiceNo: string) => void;
}

/** One label per Invoice Method — shared badge text for this picker's header. */
const METHOD_LABEL: Record<InvoiceMethod, string> = {
  invoice_line_items: "Quantity Based Billing",
  lump_sum: "Lump Sum Billing",
  mlmp: "MLMP Billing",
  amount_based: "Amount Based Billing",
};

const formatDate = (value?: string): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Step 1 of the unified, project-wide "Raise Invoice" flow — ONE common
 * entry point for the whole project (there is no longer a per-activity
 * Raise Invoice button; Activities Billing is read-only progress). Picking
 * an existing cycle here reopens it for further billing; "+ Create New
 * Invoice" starts a fresh one. Either way, Continue opens the Invoice
 * Workspace (InvoiceWorkspaceModal) scoped to the chosen cycle, which lists
 * every activity in one Excel-style table.
 */
export function RaiseInvoiceCycleModal({ project, onClose, onContinue }: Props) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const invoiceMethod = getInvoiceMethod(project);
  const methodLabel = METHOD_LABEL[invoiceMethod ?? "invoice_line_items"];
  const cycles: InvoiceCycleListRow[] = getInvoiceCycleListForRaise(project);

  const handleContinue = () => {
    if (!selected) return;
    onContinue(selected);
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4" onClick={onClose}>
        <div
          onClick={(e) => e.stopPropagation()}
          className={`flex flex-col bg-[var(--nu-surface)] rounded-2xl shadow-2xl border border-[var(--nu-border)] overflow-hidden transition-all duration-150 ${
            isMaximized ? "w-[95vw] h-[90vh]" : "w-full max-w-lg max-h-[85vh]"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--nu-border)] bg-white dark:bg-slate-900 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] flex items-center justify-center shrink-0">
                <FileText size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-bold text-[var(--nu-text)] truncate">Raise Invoice</h2>
                  <span className="px-2 py-0.5 rounded-full bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 text-[10px] font-bold uppercase tracking-wider shrink-0">
                    {methodLabel}
                  </span>
                </div>
                <p className="text-[11.5px] text-[var(--nu-text-muted)] mt-0.5">Select an invoice cycle to continue</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setIsMaximized((prev) => !prev)}
                className="rounded-lg p-2 text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] transition cursor-pointer"
                title={isMaximized ? "Restore" : "Maximize"}
                aria-label={isMaximized ? "Restore" : "Maximize"}
              >
                {isMaximized ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] transition cursor-pointer"
                aria-label="Close"
                title="Close"
              >
                <X size={19} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-2.5 nu-scrollbar">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] px-1">
              Select Invoice Cycle
            </p>

            {cycles.map((cycle) => {
              const isNew = cycle.isNew;
              const isChecked = selected === cycle.invoiceNo;
              return (
                <button
                  key={cycle.invoiceNo}
                  type="button"
                  onClick={() => setSelected(cycle.invoiceNo)}
                  className={`w-full flex items-center gap-3 rounded-[var(--nu-radius-md)] border px-4 py-3 text-left transition-colors cursor-pointer ${
                    isChecked
                      ? "border-[var(--nu-accent)] bg-[var(--nu-accent-soft)]"
                      : "border-[var(--nu-border)] bg-[var(--nu-surface-alt)] hover:border-[var(--nu-border-strong)]"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isChecked ? "border-[var(--nu-accent)]" : "border-[var(--nu-border-strong)]"
                    }`}
                  >
                    {isChecked && <span className="w-2 h-2 rounded-full bg-[var(--nu-accent)]" />}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-bold text-[var(--nu-text)]">{cycle.label}</span>
                      <Badge tone={INVOICE_LINE_STATUS_TONE[cycle.status]} dot className="text-[10px] whitespace-nowrap">
                        {INVOICE_LINE_STATUS_LABEL[cycle.status]}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5 truncate">
                      {isNew ? "New invoice cycle" : cycle.invoiceNo}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-[var(--nu-text-muted)]">{formatDate(cycle.invoiceDate)}</p>
                    <p className="text-[13px] font-bold text-[var(--nu-text)] tabular-nums">
                      {isNew ? "—" : formatIndianCurrency(cycle.totalAmount)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[var(--nu-border)] bg-white dark:bg-slate-900 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--nu-text-secondary)]">
              <Plus size={13} /> Pick "Draft" to start a brand-new invoice cycle.
            </span>
            <div className="flex items-center gap-2.5 shrink-0">
              <Button variant="secondary" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleContinue} disabled={!selected}>
                Continue
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
