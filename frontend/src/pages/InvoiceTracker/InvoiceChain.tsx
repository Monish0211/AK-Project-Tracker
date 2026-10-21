import { useCallback } from "react";
import { Edit2, Eye, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { fetchTrackerChain, type TrackerChain, type TrackerInvoice, type TrackerInvoiceLine } from "../../services/invoiceTrackerService";
import { INVOICE_LINE_STATUS_TONE } from "../Projects/components/Invoice/InvoiceCalculations";
import type { InvoiceLineStatus } from "../../types/InvoiceItem";
import { formatIndianCurrency } from "../../utils/formatCurrency";
import { StateMessage } from "../Settings/components/weeklyEmails/WeeklyEmailPaging";
import { usePagedRequest } from "../Settings/components/weeklyEmails/useWeeklyEmailPaging";
import { InvoiceTimeline } from "./InvoiceTimeline";
import { formatDateOnly, statusLabel } from "./trackerFormat";

export interface TrackerAction {
  mode: "view" | "edit" | "delete";
  projectId: string;
  quantityItemId: string;
  lineId: string;
  invoiceNo: string;
}

const iconButton = "p-1.5 rounded-lg transition";

function LineActions({ projectId, invoice, line, canEdit, canDelete, onAction }: { projectId: string; invoice: TrackerInvoice; line: TrackerInvoiceLine; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  const base = { projectId, quantityItemId: line.quantityItemId, lineId: line.id, invoiceNo: invoice.invoiceNo };
  return (
    <div className="flex items-center gap-1" data-actions>
      <button type="button" onClick={() => onAction({ ...base, mode: "view" })} title="View Invoice" aria-label={`View invoice ${invoice.invoiceNo}`} className={`${iconButton} text-[var(--nu-accent)] hover:bg-[var(--nu-accent-soft)]`}>
        <Eye size={15} />
      </button>
      {canEdit && (
        <button type="button" onClick={() => onAction({ ...base, mode: "edit" })} title="Edit Invoice" aria-label={`Edit invoice ${invoice.invoiceNo}`} className={`${iconButton} text-[var(--nu-warning)] hover:bg-[var(--nu-warning-soft)]`}>
          <Edit2 size={15} />
        </button>
      )}
      {canDelete && (
        <button type="button" onClick={() => onAction({ ...base, mode: "delete" })} title="Delete Invoice" aria-label={`Delete invoice ${invoice.invoiceNo}`} className={`${iconButton} text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)]`}>
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

/** The month's invoices as blocks — presentational (data in, markup out). */
export function InvoiceChainView({ data, loading, canEdit, canDelete, onAction }: { data: TrackerChain; loading: boolean; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  const projectId = data.project.id;
  return (
    <ul className={`space-y-2 ${loading ? "opacity-60" : ""}`} aria-busy={loading} data-chain={projectId}>
      {data.invoices.map((inv) => (
        <li
          key={inv.key}
          className={`rounded-xl border bg-white dark:bg-slate-900 shadow-sm px-4 py-3 space-y-2 ${inv.inSelectedMonth ? "border-blue-200 dark:border-blue-900/50 border-l-4 border-l-blue-500" : "border-slate-200 dark:border-slate-800"}`}
          data-invoice={inv.key}
          data-in-month={inv.inSelectedMonth}
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="font-bold text-[13px] text-[var(--nu-text)]">{inv.invoiceNo}</span>
            {inv.inSelectedMonth && (
              <span data-month-badge className="inline-flex items-center rounded-full border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                Selected month
              </span>
            )}
            <span className="text-[12px] text-[var(--nu-text-secondary)]">{formatDateOnly(inv.invoiceDate)}</span>
            <span className="text-[12.5px] font-semibold text-[var(--nu-text)]" data-amount>
              {formatIndianCurrency(inv.amountINR)}
              {inv.originalAmount !== null && <span className="ml-1 font-normal text-[var(--nu-text-muted)]">({inv.currency} {inv.originalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>}
            </span>
            <Badge tone={INVOICE_LINE_STATUS_TONE[inv.status as InvoiceLineStatus] ?? "neutral"} dot className="text-[10.5px] whitespace-nowrap">
              {statusLabel(inv.status)}
            </Badge>
            <span className="text-[11.5px] text-[var(--nu-text-muted)]" data-payment>
              Payment: {inv.paymentStatus}
            </span>
            {inv.mixedLineStatuses && <span className="text-[11px] text-[var(--nu-warning)]">Lines have different statuses</span>}
            <span className="flex-1" />
            {inv.lines.length === 1 && <LineActions projectId={projectId} invoice={inv} line={inv.lines[0]!} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />}
          </div>
          {inv.lines.length > 1 && (
            <table className="w-full text-left text-[11.5px]" aria-label={`Lines of invoice ${inv.invoiceNo}`}>
              <tbody>
                {inv.lines.map((l) => (
                  <tr key={l.id} className="border-t border-[var(--nu-border)]">
                    <td className="py-1 pr-3 text-[var(--nu-text-secondary)]">{l.activity}</td>
                    <td className="py-1 pr-3 text-right whitespace-nowrap">{formatIndianCurrency(l.amountINR)}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">{statusLabel(l.status)}</td>
                    <td className="py-1 text-right">
                      <LineActions projectId={projectId} invoice={inv} line={l} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 px-3 py-2">
            <InvoiceTimeline invoice={inv} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * A project's invoices across all dates (those dated in the selected month are marked), loaded only when its row is expanded. One block per invoice (never a
 * repeated project row): number, date, amount, status, payment label, actions, then its recorded history. View / Edit /
 * Delete call back into the page, which opens the existing invoice interfaces.
 */
export function InvoiceChain({ projectId, month, refreshTick, canEdit, canDelete, onAction }: { projectId: string; month: string; refreshTick: number; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  const fetcher = useCallback(() => fetchTrackerChain(projectId, month), [projectId, month]);
  const state = usePagedRequest(fetcher, `${projectId}:${month}:${refreshTick}`);
  const data = state.data;

  if (state.error && !data) return <StateMessage kind="error" title="Couldn't load this project's invoices" detail={state.error} onRetry={state.retry} />;
  if (!data) return <StateMessage kind="loading" title="Loading invoices…" />;
  if (data.invoices.length === 0) {
    return <StateMessage kind="empty" title="No invoices recorded for this project" detail="Nothing has been entered for this project on any date." />;
  }
  return <InvoiceChainView data={data} loading={state.loading} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />;
}
