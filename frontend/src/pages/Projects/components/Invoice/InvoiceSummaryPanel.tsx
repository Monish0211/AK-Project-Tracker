import { useMemo } from "react";
import { Receipt, Plus, Printer } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import { Card, CardHeader, CardBody } from "../../../../components/ui/Card";
import { Select } from "../../../../components/ui/Select";
import { Button } from "../../../../components/ui/Button";
import { Badge, type Tone } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { MoneyValue, MoneyTooltip } from "../../../../components/ui/MoneyTooltip";
import { formatBusinessINR } from "../../../../utils/formatCurrency";
import {
  getInvoiceCyclesForProject,
  getInvoiceCycleStatus,
  INVOICE_LINE_STATUS_LABEL,
  INVOICE_LINE_STATUS_TONE,
} from "./InvoiceCalculations";

interface Props {
  project: Project;
  /** Lump Sum only — governs whether "+ Create New Invoice Cycle" is shown. */
  isLumpSum: boolean;
  /**
   * The PROJECT-level Invoice Cycle to summarize — lifted up to
   * InvoiceDashboard so the same selection also drives Lump Sum's Raise
   * Invoice (`projectInvoiceCycle`). For Lump Sum this may be a cycle that
   * doesn't have any invoice lines yet (just created via "+ Create New
   * Invoice Cycle") — the summary below simply shows zeros until an
   * activity is billed against it.
   */
  selectedCycle: string;
  onSelectCycle: (value: string) => void;
  /** Lump Sum only — advances `selectedCycle` to the next unused project-wide cycle number. */
  onCreateNewCycle: () => void;
  /** Callback to trigger Print Invoice Document modal. */
  onPrintInvoice?: (invoiceNo: string) => void;
}

const STATUS_BADGE: Record<InvoiceLineStatus, Tone> = INVOICE_LINE_STATUS_TONE;

const formatDate = (value: string): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

/**
 * Compact rectangular Invoice Summary Card — lives side by side with Invoice History.
 * Summarizes ONLY the selected invoice cycle with tight spacing and clean alignment.
 */
export function InvoiceSummaryPanel({ project, isLumpSum, selectedCycle, onSelectCycle, onCreateNewCycle, onPrintInvoice }: Props) {
  const cycleOptions = useMemo(() => {
    return getInvoiceCyclesForProject(project).filter((opt) => !opt.isNew);
  }, [project]);

  // The selection itself lives in InvoiceDashboard (shared with Lump Sum's
  // Raise Invoice) — this panel only reads it. For Lump Sum, `selectedCycle`
  // may be a brand-new cycle number with no invoice lines yet (just created
  // via the button below); keep it as the active cycle regardless so the
  // summary reflects it (with zeroed totals) rather than silently falling
  // back to some other cycle.
  const activeInvoiceNo = selectedCycle;

  const selectedCycleOption = useMemo(() => {
    return cycleOptions.find((opt) => opt.invoiceNo === activeInvoiceNo) ?? null;
  }, [cycleOptions, activeInvoiceNo]);

  // Lump Sum's dropdown must still show the currently selected cycle even
  // when it's a not-yet-real "new" one so the <Select> never points at a
  // missing value. Commercial Milestone Billing never has this case (it has
  // no "+ Create New Invoice Cycle" button here — its own Raise Invoice
  // dialog is where new cycles get created).
  const dropdownOptions = useMemo(() => {
    if (isLumpSum && activeInvoiceNo && !selectedCycleOption) {
      const realCount = cycleOptions.length;
      return [...cycleOptions, { invoiceNo: activeInvoiceNo, label: `Invoice ${realCount + 1}`, isNew: true }];
    }
    return cycleOptions;
  }, [cycleOptions, isLumpSum, activeInvoiceNo, selectedCycleOption]);

  const activeLines = useMemo(() => {
    if (!activeInvoiceNo) return [];
    const lines: { item: InvoiceItem; line: InvoiceLine }[] = [];
    (project.invoiceItems ?? []).forEach((item) => {
      (item.invoices ?? []).forEach((line) => {
        if (line.invoiceNo === activeInvoiceNo && line.status !== "Cancelled") {
          lines.push({ item, line });
        }
      });
    });
    return lines;
  }, [project.invoiceItems, activeInvoiceNo]);

  const activitiesIncludedCount = useMemo(() => {
    const activityIds = new Set(activeLines.map((l) => l.item.id));
    return activityIds.size;
  }, [activeLines]);

  const invoiceDate = useMemo(() => {
    if (activeLines.length > 0 && activeLines[0].line.invoiceDate) {
      return activeLines[0].line.invoiceDate;
    }
    return selectedCycleOption?.invoiceDate ?? "";
  }, [activeLines, selectedCycleOption]);

  // The cycle's own aggregate status — the exact same figure Invoice
  // History's group header and the Raise Invoice Cycle picker show, never a
  // separately-computed answer.
  const invoiceStatus = useMemo<InvoiceLineStatus>(
    () => getInvoiceCycleStatus(project, activeInvoiceNo),
    [project, activeInvoiceNo]
  );

  const invoiceTotal = useMemo(() => {
    return activeLines.reduce((sum, l) => sum + (l.line.calculatedAmountINR ?? l.line.invoiceAmountINR), 0);
  }, [activeLines]);

  const commercialAdjustment = useMemo(() => {
    return activeLines.reduce((sum, l) => {
      if (l.line.commercialAdjustmentINR !== undefined) {
        return sum + l.line.commercialAdjustmentINR;
      }
      const calc = l.line.calculatedAmountINR ?? l.line.invoiceAmountINR;
      return sum + (l.line.invoiceAmountINR - calc);
    }, 0);
  }, [activeLines]);

  const finalInvoiceAmount = useMemo(() => {
    return activeLines.reduce((sum, l) => sum + l.line.invoiceAmountINR, 0);
  }, [activeLines]);

  // Lump Sum shows the summary for whatever cycle is selected even before its
  // first invoice is raised (e.g. right after "+ Create New Invoice Cycle") —
  // activeLines is simply empty and the totals below are zero. Commercial
  // Milestone Billing keeps its original gate: nothing to summarize until the
  // project has at least one real cycle.
  if (!activeInvoiceNo || (!isLumpSum && cycleOptions.length === 0)) {
    return (
      <Card padded={false} className="h-full">
        <CardHeader
          icon={<Receipt size={16} />}
          title="Invoice Summary"
          subtitle="Selected cycle overview"
        />
        <CardBody className="p-4">
          <EmptyState
            icon={<Receipt size={20} />}
            title="No Invoices Raised"
            description="Raise an invoice from Activities Billing to view cycle summary."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card padded={false} className="h-full flex flex-col">
      <CardHeader
        icon={<Receipt size={16} />}
        title="Invoice Summary"
        subtitle="Selected cycle overview"
      />
      <CardBody className="p-4 flex-1 flex flex-col justify-between space-y-4">
        {/* Compact Metadata Rows */}
        <div className="space-y-2.5">
          {/* Invoice Cycle Dropdown */}
          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--nu-text-muted)] mb-1">
              Invoice Cycle
            </label>
            <div className="flex items-center gap-1.5">
              <Select
                value={activeInvoiceNo}
                onChange={(e) => onSelectCycle(e.target.value)}
                className="w-full text-xs font-semibold py-1.5"
              >
                {dropdownOptions.map((opt, idx) => (
                  <option key={opt.invoiceNo} value={opt.invoiceNo}>
                    {opt.label || `Invoice ${idx + 1}`} {opt.isNew ? "(New)" : `(${opt.invoiceNo})`}
                  </option>
                ))}
              </Select>
              {isLumpSum && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Create New Invoice Cycle"
                  onClick={onCreateNewCycle}
                  className="shrink-0"
                >
                  <Plus size={14} />
                </Button>
              )}
            </div>
          </div>

          {/* Key-Value Pair Metadata Table */}
          <div className="bg-[var(--nu-surface-alt)] rounded-xl p-3 border border-[var(--nu-border)] space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[var(--nu-text-muted)]">Invoice No</span>
              <span className="font-extrabold text-[var(--nu-text)] font-mono">{activeInvoiceNo}</span>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--nu-border)]/60 pt-1.5">
              <span className="text-[11px] font-bold text-[var(--nu-text-muted)]">Invoice Date</span>
              <span className="font-bold text-[var(--nu-text)]">{formatDate(invoiceDate)}</span>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--nu-border)]/60 pt-1.5">
              <span className="text-[11px] font-bold text-[var(--nu-text-muted)]">Status</span>
              <Badge tone={STATUS_BADGE[invoiceStatus]} dot className="text-[10.5px] whitespace-nowrap">
                {INVOICE_LINE_STATUS_LABEL[invoiceStatus]}
              </Badge>
            </div>

            <div className="flex items-center justify-between border-t border-[var(--nu-border)]/60 pt-1.5">
              <span className="text-[11px] font-bold text-[var(--nu-text-muted)]">Activities</span>
              <span className="font-extrabold text-[var(--nu-text)]">{activitiesIncludedCount}</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--nu-border)]" />

        {/* Compact Financial Totals */}
        <div className="bg-gradient-to-br from-blue-50/50 via-cyan-50/20 to-blue-50/50 dark:from-slate-900/60 dark:via-slate-800/40 dark:to-slate-900/60 rounded-xl p-3 border border-blue-200/60 dark:border-slate-700/60 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Invoice Total</span>
            <span className="font-extrabold text-slate-900 dark:text-white tabular-nums">
              <MoneyValue value={invoiceTotal} />
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200/80 dark:border-slate-700/80 pt-1.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Commercial Adjustment</span>
            <span className={`font-extrabold tabular-nums ${
              commercialAdjustment < 0
                ? "text-amber-600 dark:text-amber-400"
                : commercialAdjustment > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-700 dark:text-slate-300"
            }`}>
              {commercialAdjustment === 0 ? (
                "₹0"
              ) : (
                <MoneyTooltip value={commercialAdjustment}>
                  {commercialAdjustment < 0 ? "-" : "+"}{formatBusinessINR(Math.abs(commercialAdjustment))}
                </MoneyTooltip>
              )}
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-blue-200 dark:border-slate-600 pt-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 dark:text-cyan-400">
              Final Invoice Amount
            </span>
            <span className="text-sm font-black text-blue-700 dark:text-cyan-300 tabular-nums">
              <MoneyValue value={finalInvoiceAmount} />
            </span>
          </div>
        </div>

        {/* Print Invoice Action Button */}
        <button
          type="button"
          disabled={invoiceStatus !== "Paid" && invoiceStatus !== "Raised"}
          onClick={() => onPrintInvoice?.(activeInvoiceNo)}
          className="w-full flex items-center justify-center gap-2 bg-[var(--nu-accent)] hover:opacity-90 text-white font-bold text-xs py-2.5 rounded-xl shadow-xs transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed mt-2"
          title={
            invoiceStatus === "Paid" || invoiceStatus === "Raised"
              ? "Generate official printable tax invoice document"
              : "Print Invoice is only enabled for Paid or Raised / Submitted invoices"
          }
        >
          <Printer size={15} />
          <span>Print Invoice Document</span>
        </button>
      </CardBody>
    </Card>
  );
}
