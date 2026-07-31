import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import type { Project } from "../../../../types/Project";
import type { InvoiceItem, InvoiceLine, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import { Card, CardHeader, CardBody } from "../../../../components/ui/Card";
import { Select } from "../../../../components/ui/Select";
import { Badge, type Tone } from "../../../../components/ui/Badge";
import { EmptyState } from "../../../../components/ui/EmptyState";
import { MoneyValue, MoneyTooltip } from "../../../../components/ui/MoneyTooltip";
import { formatBusinessINR } from "../../../../utils/formatCurrency";
import { getInvoiceCyclesForProject } from "./InvoiceCalculations";

interface Props {
  project: Project;
}

const STATUS_BADGE: Record<InvoiceLineStatus, Tone> = {
  Pending: "warning",
  Paid: "success",
  Cancelled: "danger",
};

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
export function InvoiceSummaryPanel({ project }: Props) {
  const cycleOptions = useMemo(() => {
    return getInvoiceCyclesForProject(project).filter((opt) => !opt.isNew);
  }, [project]);

  const [selectedInvoiceNo, setSelectedInvoiceNo] = useState<string>("");

  const activeInvoiceNo = useMemo(() => {
    if (cycleOptions.length === 0) return "";
    if (selectedInvoiceNo && cycleOptions.some((opt) => opt.invoiceNo === selectedInvoiceNo)) {
      return selectedInvoiceNo;
    }
    return cycleOptions[0].invoiceNo;
  }, [cycleOptions, selectedInvoiceNo]);

  const selectedOptionIndex = useMemo(() => {
    return cycleOptions.findIndex((opt) => opt.invoiceNo === activeInvoiceNo);
  }, [cycleOptions, activeInvoiceNo]);

  const selectedCycleOption = useMemo(() => {
    if (selectedOptionIndex >= 0) return cycleOptions[selectedOptionIndex];
    return null;
  }, [cycleOptions, selectedOptionIndex]);

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

  const invoiceStatus = useMemo<InvoiceLineStatus>(() => {
    if (activeLines.length === 0) return "Pending";
    const allPaid = activeLines.every((l) => l.line.status === "Paid");
    if (allPaid) return "Paid";
    return "Pending";
  }, [activeLines]);

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

  if (cycleOptions.length === 0 || !activeInvoiceNo) {
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
            <Select
              value={activeInvoiceNo}
              onChange={(e) => setSelectedInvoiceNo(e.target.value)}
              className="w-full text-xs font-semibold py-1.5"
            >
              {cycleOptions.map((opt, idx) => (
                <option key={opt.invoiceNo} value={opt.invoiceNo}>
                  {opt.label || `Invoice ${idx + 1}`} ({opt.invoiceNo})
                </option>
              ))}
            </Select>
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
              <Badge tone={STATUS_BADGE[invoiceStatus]} dot className="text-[10.5px]">
                {invoiceStatus === "Paid" ? "Completed" : invoiceStatus}
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
      </CardBody>
    </Card>
  );
}
