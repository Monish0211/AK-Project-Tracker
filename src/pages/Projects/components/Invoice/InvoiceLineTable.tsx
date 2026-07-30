import type { ChangeEvent } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Input } from "../../../../components/ui/Input";
import { formatBusinessINR } from "../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../utils/quantityCalculations";
import { MoneyValue, MoneyTooltip } from "../../../../components/ui/MoneyTooltip";
import type { CommercialLineBillingStatus } from "./InvoiceCalculations";

export interface InvoiceLineRow {
  key: string;
  description: string;
  milestoneLabel?: string;
  milestonePercent?: number;
  contractQty: number;
  /** Completed Qty — the qty ceiling for this row's scope (this milestone's Contract Qty × Milestone %, or the whole Contract Qty when there's no milestone). */
  completedQty: number;
  /** Already Invoiced Qty — qty already invoiced within this same scope, excluding the current draft/edit. */
  previousQtyInvoiced: number;
  /** Available Qty — completedQty − previousQtyInvoiced (and, in create mode, minus sibling draft rows sharing the same pool). The ceiling Qty to Invoice must never exceed. */
  eligibleQty: number;
  qtyToBill: number;
  unitPrice: number;
  milestoneValue: number;
  calculatedAmount: number;
  currentInvoiceAmount: number;
  commercialAdjustment: number;
  previousRaisedAmount: number;
  remainingQty: number;
  remainingAmount: number;
  status: CommercialLineBillingStatus;
  error?: string | null;
  removable: boolean;
}

interface Props {
  rows: InvoiceLineRow[];
  uom: string;
  onQtyToBillChange: (key: string, qty: number) => void;
  onInvoiceAmountChange: (key: string, amount: number) => void;
  onDescriptionChange: (key: string, description: string) => void;
  onRemoveRow: (key: string) => void;
  disabled?: boolean;
}

const STATUS_BADGE_STYLE: Record<CommercialLineBillingStatus, string> = {
  "Not Eligible": "bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700",
  "Eligible": "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50",
  "Partially Billed": "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50",
  "Fully Billed": "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50",
};

/**
 * Universal Intelligent Commercial Billing Line Items Table.
 * ONE column set for every row, milestone-driven or plain quantity-driven —
 * Completed Qty / Already Invoiced Qty / Available Qty / Qty to Invoice /
 * Unit Rate / System Amount / Invoice Amount / Remaining Qty / Status. The
 * only difference between the two billing modes is how those qty figures
 * were scoped upstream (per-milestone ceiling vs whole-activity pool, see
 * InvoiceCalculations.ts) — not what's rendered here.
 */
export function InvoiceLineTable({
  rows,
  uom,
  onQtyToBillChange,
  onInvoiceAmountChange,
  onDescriptionChange,
  onRemoveRow,
  disabled = false,
}: Props) {
  const handleQtyInput = (key: string) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
    onQtyToBillChange(key, raw === "" ? 0 : Number(raw));
  };

  const handleAmountInput = (key: string) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
    onInvoiceAmountChange(key, raw === "" ? 0 : Number(raw));
  };

  return (
    <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] overflow-hidden bg-white dark:bg-slate-900/60 shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-[var(--nu-border)]">
              <th className="nu-table-th px-3 py-2.5 text-left font-bold text-slate-700 dark:text-slate-200">Description</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-20 font-bold text-slate-700 dark:text-slate-200">Milestone %</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-24 font-bold text-slate-700 dark:text-slate-200">Completed Qty</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-28 font-bold text-slate-700 dark:text-slate-200">Already Invoiced Qty</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-28 font-bold text-slate-700 dark:text-slate-200">Available Qty</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-32 font-bold text-slate-700 dark:text-slate-200">Qty to Invoice</th>
              <th className="nu-table-th px-3 py-2.5 text-right font-bold text-slate-700 dark:text-slate-200">Unit Rate</th>
              <th className="nu-table-th px-3 py-2.5 text-right font-bold text-slate-700 dark:text-slate-200">System Amount</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-36 font-bold text-slate-700 dark:text-slate-200">Invoice Amount</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-28 font-bold text-slate-700 dark:text-slate-200">Remaining Qty</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-28 font-bold text-slate-700 dark:text-slate-200">Status</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--nu-border)]">
            {rows.map((row) => {
              const isNotEligible = row.status === "Not Eligible" || row.eligibleQty <= 0;
              const isRowDisabled = disabled || (isNotEligible && row.qtyToBill === 0);
              const hasCommercialAdjustment = Math.abs(row.commercialAdjustment) > 0.01;

              return (
                <tr key={row.key} className="nu-table-row hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  {/* 1. Description / Milestone Stage */}
                  <td className="px-3 py-3">
                    {row.milestoneLabel ? (
                      <span className="font-semibold text-[var(--nu-text)]">
                        {row.milestoneLabel}
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={row.description}
                        disabled={disabled}
                        onChange={(e) => onDescriptionChange(row.key, e.target.value)}
                        placeholder="Custom billing description..."
                        className="w-full bg-transparent outline-none border-b border-dashed border-[var(--nu-border)] focus:border-[var(--nu-accent)] text-[var(--nu-text)] placeholder:text-[var(--nu-text-muted)] py-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                      />
                    )}
                  </td>

                  {/* 2. Milestone % */}
                  <td className="px-3 py-3 text-center">
                    {row.milestonePercent !== undefined && row.milestonePercent > 0 ? (
                      <span className="text-[11.5px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold border border-slate-200 dark:border-slate-700/60">
                        {row.milestonePercent}%
                      </span>
                    ) : (
                      <span className="text-slate-400 font-mono">—</span>
                    )}
                  </td>

                  {/* Completed Qty (this row's qty ceiling) */}
                  <td className="px-3 py-3 text-center tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-400 font-medium">
                    {formatIndianNumber(row.completedQty)} <span className="text-[10px] text-slate-400 uppercase">{uom}</span>
                  </td>

                  {/* Already Invoiced Qty */}
                  <td className="px-3 py-3 text-center tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-400 font-medium">
                    {formatIndianNumber(row.previousQtyInvoiced)} <span className="text-[10px] text-slate-400 uppercase">{uom}</span>
                  </td>

                  {/* Available Qty */}
                  <td className="px-3 py-3 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-semibold text-[11.5px] border border-slate-200 dark:border-slate-700/60" title={`Available to invoice: ${row.eligibleQty} ${uom}`}>
                      {formatIndianNumber(row.eligibleQty)} <span className="text-[10px] text-slate-400 uppercase">{uom}</span>
                    </span>
                  </td>

                  {/* Qty to Invoice */}
                  <td className="px-3 py-2.5">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={row.qtyToBill === 0 ? "" : String(row.qtyToBill)}
                      onChange={handleQtyInput(row.key)}
                      disabled={isRowDisabled}
                      placeholder={isRowDisabled ? "0" : "Enter Qty"}
                      invalid={!!row.error}
                      className={`text-center font-extrabold text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-900 disabled:bg-slate-100/60 dark:disabled:bg-slate-800/40 disabled:opacity-60 disabled:cursor-not-allowed ${
                        row.error ? "!border-red-500 !ring-red-500/20" : ""
                      }`}
                    />
                  </td>

                  {/* Unit Rate */}
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    <MoneyValue value={row.unitPrice} /> / {uom}
                  </td>

                  {/* System Amount = Qty to Invoice × Unit Rate */}
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    {row.calculatedAmount > 0 ? (
                      <MoneyValue value={row.calculatedAmount} />
                    ) : (
                      <span className="text-slate-400 font-normal">₹0</span>
                    )}
                  </td>

                  {/* Invoice Amount Input (Editable) */}
                  <td className="px-3 py-2.5">
                    <div className="relative">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={row.currentInvoiceAmount === 0 ? "" : String(row.currentInvoiceAmount)}
                        onChange={handleAmountInput(row.key)}
                        disabled={isRowDisabled || row.qtyToBill <= 0}
                        placeholder={isRowDisabled ? "Disabled" : "₹ 0"}
                        invalid={!!row.error}
                        className={`text-right font-bold text-cyan-600 dark:text-cyan-400 disabled:bg-slate-100/60 dark:disabled:bg-slate-800/40 disabled:opacity-60 disabled:cursor-not-allowed ${
                          row.error ? "!border-red-500 !ring-red-500/20" : ""
                        }`}
                      />
                    </div>
                    {hasCommercialAdjustment && (
                      <p className="mt-1 flex items-center justify-end gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        Commercial Adjustment{" "}
                        <MoneyTooltip value={row.commercialAdjustment}>
                          {row.commercialAdjustment < 0 ? "-" : "+"}{formatBusinessINR(Math.abs(row.commercialAdjustment))}
                        </MoneyTooltip>
                      </p>
                    )}
                    {row.error && (
                      <p className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-[var(--nu-danger)]">
                        <AlertTriangle size={11} className="shrink-0" />
                        {row.error}
                      </p>
                    )}
                  </td>

                  {/* Remaining Qty */}
                  <td className="px-3 py-3 text-center tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-400 font-medium">
                    {formatIndianNumber(row.remainingQty)} <span className="text-[10px] text-slate-400 uppercase">{uom}</span>
                  </td>

                  {/* Status Badge */}
                  <td className="px-3 py-3 text-center whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.8 rounded-full text-[10.5px] font-bold border tracking-wide uppercase shadow-2xs ${
                        STATUS_BADGE_STYLE[row.status]
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>

                  {/* Action Column */}
                  <td className="px-3 py-3 text-center">
                    {row.removable && !disabled && (
                      <button
                        type="button"
                        onClick={() => onRemoveRow(row.key)}
                        title="Remove custom line"
                        className="p-1.5 rounded-lg text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)] transition cursor-pointer"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
