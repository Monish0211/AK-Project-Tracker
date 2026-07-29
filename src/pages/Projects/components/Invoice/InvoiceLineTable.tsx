import type { ChangeEvent } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Input } from "../../../../components/ui/Input";
import { formatBusinessINR, formatFullINR } from "../../../../utils/formatCurrency";
import { formatIndianNumber } from "../../../../utils/quantityCalculations";

export interface InvoiceLineRow {
  key: string;
  description: string;
  milestoneLabel?: string;
  contractQty: number;
  /** Already billed before this invoice (excludes every line currently in this draft). */
  completedQty: number;
  currentInvoiceQty: number;
  unitPrice: number;
  currentInvoiceAmount: number;
  remainingQty: number;
  remainingAmount: number;
  error?: string | null;
  /** Custom lines the user added themselves can be removed; the pre-populated activity/milestone rows cannot. */
  removable: boolean;
}

interface Props {
  rows: InvoiceLineRow[];
  uom: string;
  onQtyChange: (key: string, quantity: number) => void;
  onDescriptionChange: (key: string, description: string) => void;
  onRemoveRow: (key: string) => void;
  /** View mode — every input becomes read-only, no remove buttons. */
  disabled?: boolean;
}

/**
 * The drawer's dynamic Billable Line Items table. As the user types Current
 * Invoice Qty, Current Invoice Amount / Remaining Qty / Remaining Amount are
 * always pre-computed by the caller (InvoiceCalculations.getLinePreview) —
 * this component never calculates anything itself, only renders and
 * forwards input events, so there is exactly one calculation path.
 */
export function InvoiceLineTable({ rows, uom, onQtyChange, onDescriptionChange, onRemoveRow, disabled = false }: Props) {
  const handleQtyInput = (key: string) => (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
    onQtyChange(key, raw === "" ? 0 : Number(raw));
  };

  return (
    <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="nu-table-th px-3 py-2.5 text-left">Description</th>
              <th className="nu-table-th px-3 py-2.5 text-right">Contract Qty</th>
              <th className="nu-table-th px-3 py-2.5 text-right">Completed Qty</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-32">Current Invoice Qty</th>
              <th className="nu-table-th px-3 py-2.5 text-right">Unit Rate</th>
              <th className="nu-table-th px-3 py-2.5 text-right">Current Invoice Amount</th>
              <th className="nu-table-th px-3 py-2.5 text-right">Remaining Qty</th>
              <th className="nu-table-th px-3 py-2.5 text-right">Remaining Amount</th>
              <th className="nu-table-th px-3 py-2.5 text-center w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="nu-table-row">
                <td className="px-3 py-2.5">
                  {row.milestoneLabel ? (
                    <span className="font-semibold text-[var(--nu-text)]">{row.milestoneLabel}</span>
                  ) : (
                    <input
                      type="text"
                      value={row.description}
                      disabled={disabled}
                      onChange={(e) => onDescriptionChange(row.key, e.target.value)}
                      placeholder="Billing description..."
                      className="w-full bg-transparent outline-none border-b border-dashed border-[var(--nu-border)] focus:border-[var(--nu-accent)] text-[var(--nu-text)] placeholder:text-[var(--nu-text-muted)] py-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                    />
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                  {formatIndianNumber(row.contractQty)} {uom}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-[var(--nu-text-secondary)]">
                  {formatIndianNumber(row.completedQty)}
                </td>
                <td className="px-3 py-2.5">
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={row.currentInvoiceQty === 0 ? "" : String(row.currentInvoiceQty)}
                    onChange={handleQtyInput(row.key)}
                    disabled={disabled}
                    placeholder="0"
                    invalid={!!row.error}
                    className="text-right disabled:opacity-70"
                  />
                  {row.error && (
                    <p className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-[var(--nu-danger)]">
                      <AlertTriangle size={11} className="shrink-0" />
                      {row.error}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap" title={formatFullINR(row.unitPrice)}>
                  {formatBusinessINR(row.unitPrice)}
                </td>
                <td
                  className="px-3 py-2.5 text-right tabular-nums font-semibold text-[var(--nu-accent)] whitespace-nowrap"
                  title={formatFullINR(row.currentInvoiceAmount)}
                >
                  {formatBusinessINR(row.currentInvoiceAmount)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                  {formatIndianNumber(row.remainingQty)}
                </td>
                <td
                  className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-[var(--nu-text-secondary)]"
                  title={formatFullINR(row.remainingAmount)}
                >
                  {formatBusinessINR(row.remainingAmount)}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {row.removable && !disabled && (
                    <button
                      type="button"
                      onClick={() => onRemoveRow(row.key)}
                      title="Remove line"
                      className="p-1 rounded-md text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)] transition"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
