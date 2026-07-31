import { CheckCircle2 } from "lucide-react";
import { MoneyValue } from "../../../../components/ui/MoneyTooltip";
import type { LumpSumMilestoneRow } from "./InvoiceCalculations";

interface Props {
  rows: LumpSumMilestoneRow[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** View mode — nothing is clickable, checkboxes only reflect state. */
  disabled?: boolean;
}

/**
 * Lump Sum billing's line items — one checkbox row per Payment Milestone.
 * Checking a milestone auto-calculates its Invoice Amount (Contract Value ×
 * Milestone %); there is no Qty to Invoice column at all. A milestone
 * already billed for this activity is locked "Completed" and cannot be
 * selected again.
 */
export function LumpSumMilestoneTable({ rows, selectedIds, onToggle, disabled = false }: Props) {
  return (
    <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] overflow-hidden bg-white dark:bg-slate-900/60 shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-[var(--nu-border)]">
              <th className="nu-table-th px-3 py-2.5 text-center w-12 font-bold text-slate-700 dark:text-slate-200" />
              <th className="nu-table-th px-3 py-2.5 text-left font-bold text-slate-700 dark:text-slate-200">Payment Milestone</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-20 font-bold text-slate-700 dark:text-slate-200">%</th>
              <th className="nu-table-th px-3 py-2.5 text-right font-bold text-slate-700 dark:text-slate-200">Invoice Amount</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-32 font-bold text-slate-700 dark:text-slate-200">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--nu-border)]">
            {rows.map((row) => {
              const checked = row.alreadyInvoiced || selectedIds.has(row.id);
              const isRowDisabled = disabled || row.alreadyInvoiced;

              return (
                <tr key={row.id} className="nu-table-row hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isRowDisabled}
                      onChange={() => onToggle(row.id)}
                      className="h-4 w-4 rounded border-[var(--nu-border)] text-[var(--nu-accent)] focus:ring-[var(--nu-accent)] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-3 font-semibold text-[var(--nu-text)]">{row.label}</td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-[11.5px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono font-bold border border-slate-200 dark:border-slate-700/60">
                      {row.percent}%
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                    <MoneyValue value={row.invoiceAmount} />
                  </td>
                  <td className="px-3 py-3 text-center whitespace-nowrap">
                    {checked ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.8 rounded-full text-[10.5px] font-bold border tracking-wide uppercase shadow-2xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50">
                        <CheckCircle2 size={11} /> Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.8 rounded-full text-[10.5px] font-bold border tracking-wide uppercase shadow-2xs bg-slate-100 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700">
                        Pending
                      </span>
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
