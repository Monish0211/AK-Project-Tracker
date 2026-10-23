import { useCallback } from "react";
import { AlertTriangle, Edit2, Eye, Send, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { ALL_MONTHS, fetchTrackerChain, type TrackerChain, type TrackerInvoice, type TrackerInvoiceLine, type TrackerRequest } from "../../services/invoiceTrackerService";
import { INVOICE_LINE_STATUS_TONE } from "../Projects/components/Invoice/InvoiceCalculations";
import type { InvoiceLineStatus } from "../../types/InvoiceItem";
import { formatIndianCurrency } from "../../utils/formatCurrency";
import { StateMessage } from "../Settings/components/weeklyEmails/WeeklyEmailPaging";
import { usePagedRequest } from "../Settings/components/weeklyEmails/useWeeklyEmailPaging";
import { InvoiceTimeline } from "./InvoiceTimeline";
import { amountOrNotRecorded, formatDateOnly, formatInstant, formatMonthLabel, olderOutstandingLines, plural, statusLabel, SUMMARY_STATUS_LABEL, SUMMARY_STATUS_TONE } from "./trackerFormat";

export interface TrackerAction {
  mode: "view" | "edit" | "delete";
  projectId: string;
  quantityItemId: string;
  lineId: string;
  invoiceNo: string;
}

const iconButton = "p-1.5 rounded-lg transition";

export function LineActions({ projectId, invoiceNo, line, canEdit, canDelete, onAction }: { projectId: string; invoiceNo: string; line: { id: string; quantityItemId: string }; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  const base = { projectId, quantityItemId: line.quantityItemId, lineId: line.id, invoiceNo };
  return (
    <div className="flex items-center gap-1" data-actions>
      <button type="button" onClick={() => onAction({ ...base, mode: "view" })} title="View Invoice" aria-label={`View invoice ${invoiceNo}`} className={`${iconButton} text-[var(--nu-accent)] hover:bg-[var(--nu-accent-soft)]`}>
        <Eye size={15} />
      </button>
      {canEdit && (
        <button type="button" onClick={() => onAction({ ...base, mode: "edit" })} title="Edit Invoice" aria-label={`Edit invoice ${invoiceNo}`} className={`${iconButton} text-[var(--nu-warning)] hover:bg-[var(--nu-warning-soft)]`}>
          <Edit2 size={15} />
        </button>
      )}
      {canDelete && (
        <button type="button" onClick={() => onAction({ ...base, mode: "delete" })} title="Delete Invoice" aria-label={`Delete invoice ${invoiceNo}`} className={`${iconButton} text-[var(--nu-danger)] hover:bg-[var(--nu-danger-soft)]`}>
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

function Money({ label, value, muted, note, testId }: { label: string; value: string; muted?: boolean; note?: string; testId: string }) {
  return (
    <div className="min-w-0" data-money={testId}>
      <dt className="text-[9.5px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 leading-tight">{label}</dt>
      <dd className={`text-[12.5px] ${muted ? "text-[var(--nu-text-muted)] italic" : "font-semibold text-[var(--nu-text)]"}`}>{value}</dd>
      {note && (
        <dd className="text-[10px] text-[var(--nu-text-muted)] leading-tight" data-note>
          {note}
        </dd>
      )}
    </div>
  );
}

/** One short line saying what a settlement figure rests on — an inferred amount is never presented as a recorded payment. */
const PAID_NOTE: Record<TrackerInvoice["financials"]["paidBasis"], string | undefined> = {
  none_yet: "Awaiting payment",
  inferred_from_status: "Inferred from Paid status",
  not_recorded: "No amount stored",
  not_applicable: undefined,
};
const BALANCE_NOTE: Record<TrackerInvoice["financials"]["balance"], string | undefined> = {
  full: "Owed in full",
  settled: "Settled (Paid)",
  not_recorded: "Balance not stored",
  not_applicable: undefined,
};

const monthBadgeClass = "inline-flex items-center rounded-full border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap";
const warnPillClass = "inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 whitespace-nowrap";

/** One invoice's status history, collapsed by default so a long history never makes the record tall. */
function HistoryToggle({ inv }: { inv: TrackerInvoice }) {
  return (
    <details className="rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800 px-3 py-1.5" data-history-toggle>
      <summary className="cursor-pointer select-none text-[11.5px] font-semibold text-[var(--nu-text-secondary)]">
        {inv.timeline.length > 0 ? `Status history (${plural(inv.timeline.length, "event")})` : "No recorded history"}
      </summary>
      <div className="pt-2">
        <InvoiceTimeline invoice={inv} />
      </div>
    </details>
  );
}

const amountText = (inv: TrackerInvoice) =>
  `${formatIndianCurrency(inv.amountINR)}${inv.originalAmount !== null ? ` (${inv.currency} ${inv.originalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : ""}`;

function LinesTable({ inv, projectId, canEdit, canDelete, onAction }: { inv: TrackerInvoice; projectId: string; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  return (
    <table className="w-full text-left text-[11.5px]" aria-label={`Lines of invoice ${inv.invoiceNo}`}>
      <tbody>
        {inv.lines.map((l: TrackerInvoiceLine) => (
          <tr key={l.id} className="border-t border-[var(--nu-border)]">
            <td className="py-1 pr-3 text-[var(--nu-text-secondary)]">{l.activity}</td>
            <td className="py-1 pr-3 text-right whitespace-nowrap">{formatIndianCurrency(l.amountINR)}</td>
            <td className="py-1 pr-3 whitespace-nowrap">{statusLabel(l.status)}</td>
            <td className="py-1 text-right">
              <LineActions projectId={projectId} invoiceNo={inv.invoiceNo} line={l} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InvoiceRecord({ inv, projectId, canEdit, canDelete, onAction, showCreatedMonth, latest = false, olderOutstanding = false }: { inv: TrackerInvoice; projectId: string; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void; showCreatedMonth: boolean; latest?: boolean; olderOutstanding?: boolean }) {
  const f = inv.financials;
  const paid = amountOrNotRecorded(f.amountPaidINR, formatIndianCurrency);
  const owing = f.balance === "not_applicable" ? "—" : amountOrNotRecorded(f.outstandingINR, formatIndianCurrency);
  return (
    <li
      className={`rounded-xl border border-slate-200 dark:border-slate-800 ${latest ? "border-l-4 border-l-[var(--nu-accent)]" : ""} bg-white dark:bg-slate-900 shadow-sm px-4 py-3 space-y-2`}
      data-invoice={inv.key}
      data-record="invoice"
      data-latest-record={latest ? "true" : undefined}
      data-older-row={olderOutstanding}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-bold text-[13px] text-[var(--nu-text)]">{inv.invoiceNo}</span>
        <Badge tone={INVOICE_LINE_STATUS_TONE[inv.status as InvoiceLineStatus] ?? "neutral"} dot className="text-[10.5px] whitespace-nowrap">
          {statusLabel(inv.status)}
        </Badge>
        {latest && (
          <span className={latestPillClass} data-latest-pill>
            Latest
          </span>
        )}
        {olderOutstanding && (
          <span className={warnPillClass} data-tag="older-outstanding">
            <AlertTriangle size={11} aria-hidden="true" />
            Older invoice still outstanding
          </span>
        )}
        <span className="text-[11.5px] text-[var(--nu-text-muted)]" data-payment>
          Payment: {inv.paymentStatus}
        </span>
        {showCreatedMonth && (
          <span data-month-badge className={monthBadgeClass}>
            Created {formatMonthLabel(inv.createdMonth)}
          </span>
        )}
        {inv.mixedLineStatuses && <span className="text-[11px] text-[var(--nu-warning)]">Lines have different statuses</span>}
        <span className="flex-1" />
        {inv.lines.length === 1 && <LineActions projectId={projectId} invoiceNo={inv.invoiceNo} line={inv.lines[0]!} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />}
      </div>

      <dl className="grid gap-x-6 gap-y-1.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-6" data-dates>
        <Money label="Workflow created" value={formatInstant(inv.createdAt)} testId="created" />
        <Money label="Invoice date" value={inv.invoiceDate ? formatDateOnly(inv.invoiceDate) : "Missing or invalid"} muted={!inv.invoiceDate} testId="invoice-date" />
        <Money label="Raised (recorded)" value={inv.raisedAt ? formatInstant(inv.raisedAt) : "Not recorded"} muted={!inv.raisedAt} testId="raised" />
        <Money label="Invoice amount" value={amountText(inv)} testId="amount" />
        <Money label="Amount paid" value={paid} muted={f.amountPaidINR === null} note={PAID_NOTE[f.paidBasis]} testId="paid" />
        <Money label="Outstanding" value={owing} muted={f.outstandingINR === null} note={BALANCE_NOTE[f.balance]} testId="outstanding" />
      </dl>

      {inv.invoiceRequest && (
        <p className="text-[11px] text-[var(--nu-text-muted)]" data-request-link>
          Raised for invoice request <strong className="font-semibold">{inv.invoiceRequest.id.slice(0, 8).toUpperCase()}</strong> (submitted by {inv.invoiceRequest.submittedBy}, {formatInstant(inv.invoiceRequest.submittedAt)})
        </p>
      )}

      {f.flags.length > 0 && (
        <p className="text-[11px] text-[var(--nu-warning)]" data-flags>
          Review: {f.flags.join(" · ")}
        </p>
      )}

      {inv.lines.length > 1 && <LinesTable inv={inv} projectId={projectId} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />}
      <HistoryToggle inv={inv} />
    </li>
  );
}

/** Scrolls to the first record flagged as an older outstanding invoice, so the warning's figure is one click from the rows behind it. */
function showOlderRecords(listId: string) {
  document.getElementById(listId)?.querySelector('[data-older-row="true"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function OlderOutstandingBanner({ data, listId }: { data: TrackerChain; listId: string }) {
  const lines = olderOutstandingLines(data.olderOutstanding, formatIndianCurrency);
  if (lines.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1" role="status" data-older-outstanding>
      <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
      <div className="text-[12px] font-semibold text-amber-800 dark:text-amber-300 space-y-0.5">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
      {data.olderOutstanding.keys.length > 0 && (
        <button type="button" onClick={() => showOlderRecords(listId)} className="ml-auto text-[11.5px] font-semibold text-[var(--nu-accent)] hover:underline">
          Show these records
        </button>
      )}
    </div>
  );
}

function SectionHeading({ title, count, hint }: { title: string; count: number; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3">
      <h4 className="text-[12.5px] font-extrabold text-[var(--nu-text)]">
        {title} <span className="font-semibold text-[var(--nu-text-muted)]">({count})</span>
      </h4>
      {hint && <p className="text-[11px] text-[var(--nu-text-muted)]">{hint}</p>}
    </div>
  );
}

const latestPillClass = "inline-flex items-center rounded-full border border-[var(--nu-accent)]/40 bg-[var(--nu-accent-soft)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--nu-accent)] whitespace-nowrap";

/** An invoice request as a record of its own, on the same footing as an invoice: its reference, dates, status, who, and where it ended up. */
function RequestRecord({ req, latest, showCreatedMonth }: { req: TrackerRequest; latest: boolean; showCreatedMonth: boolean }) {
  const open = req.status === "Open";
  return (
    <li
      className={`rounded-xl border border-slate-200 dark:border-slate-800 ${latest ? "border-l-4 border-l-[var(--nu-accent)]" : "border-dashed"} bg-white dark:bg-slate-900 shadow-sm px-4 py-3 space-y-2`}
      data-request={req.id}
      data-request-status={req.status}
      data-record="request"
      data-latest-record={latest ? "true" : undefined}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--nu-text-secondary)]">
          <Send size={12} className="text-[var(--nu-accent)]" aria-hidden="true" />
          Invoice request
        </span>
        <span className="font-bold text-[13px] text-[var(--nu-text)]" data-request-ref>
          {req.ref}
        </span>
        <Badge tone={open ? SUMMARY_STATUS_TONE.PendingApproval : "neutral"} dot className="text-[10.5px] whitespace-nowrap">
          <span data-request-label>{open ? SUMMARY_STATUS_LABEL.PendingApproval : "Completed"}</span>
        </Badge>
        {latest && (
          <span className={latestPillClass} data-latest-pill>
            Latest
          </span>
        )}
        {showCreatedMonth && (
          <span data-month-badge className={monthBadgeClass}>
            Created {formatMonthLabel(req.createdMonth)}
          </span>
        )}
      </div>
      <dl className="grid gap-x-6 gap-y-1.5 grid-cols-2 md:grid-cols-3 xl:grid-cols-6" data-dates>
        <Money label="Request created" value={formatInstant(req.createdAt)} testId="created" />
        <Money label="Invoice amount" value="—" muted note={open ? "Nothing raised yet" : "See the invoice"} testId="amount" />
        <Money label="Amount note (free text)" value={req.amountNote ?? "Not recorded"} muted testId="note" />
        <Money label="Requested by" value={req.requestedBy} testId="requested-by" />
        <Money label="Assigned to" value={req.assignedTo} testId="assigned-to" />
      </dl>
      {open && <p className="text-[11px] text-[var(--nu-text-muted)]">Waiting for Accounts to raise the invoice — not a raised invoice, not a payment.</p>}
      {req.fulfilledByInvoiceNo && (
        <p className="text-[11px] text-[var(--nu-text-muted)]" data-fulfilled-by>
          Fulfilled by invoice <strong className="font-semibold">{req.fulfilledByInvoiceNo}</strong>
          {req.fulfilledByInvoiceDate ? ` dated ${formatDateOnly(req.fulfilledByInvoiceDate)}` : ""} — a completed request is not a payment
        </p>
      )}
    </li>
  );
}

/**
 * The expanded project — ONE list of every record (invoices of any status and invoice requests), the project's latest record first,
 * then the rest from newest to oldest. The first entry is exactly what the project row shows. Each record keeps its own reference,
 * dates, amount, status and recorded history; nothing is merged or hidden. A month report lists records up to the end of that month
 * (earlier ones are billing context, never part of the month's totals); "All history" lists everything.
 */
export function InvoiceChainView({ data, loading, canEdit, canDelete, onAction }: { data: TrackerChain; loading: boolean; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  const projectId = data.project.id;
  const isAll = data.month === ALL_MONTHS;
  const invoices = new Map([...data.invoices, ...(data.previousInvoices ?? [])].map((i) => [i.key, i]));
  const requests = new Map([...data.requests, ...(data.previousRequests ?? [])].map((r) => [r.id, r]));
  const older = new Set(data.olderOutstanding?.keys ?? []);
  const latest = data.latestRecord ? { kind: data.latestRecord.kind, id: data.latestRecord.id } : null;
  const listId = `tracker-records-${projectId}`;
  const monthLabel = formatMonthLabel(data.month);
  const undated = isAll ? 0 : (data.undatedInvoiceCount ?? 0);
  const ordered = (data.recordOrder ?? []).flatMap((o) => {
    const isLatest = latest !== null && latest.kind === o.kind && latest.id === o.id;
    if (o.kind === "invoice") {
      const inv = invoices.get(o.id);
      return inv ? [<InvoiceRecord key={`i:${inv.key}`} inv={inv} projectId={projectId} canEdit={canEdit} canDelete={canDelete} onAction={onAction} showCreatedMonth={isAll} latest={isLatest} olderOutstanding={older.has(inv.key)} />] : [];
    }
    const req = requests.get(o.id);
    return req ? [<RequestRecord key={`r:${req.id}`} req={req} latest={isLatest} showCreatedMonth={isAll} />] : [];
  });
  return (
    <div className={`space-y-3 ${loading ? "opacity-60" : ""}`} aria-busy={loading} data-chain={projectId}>
      {!isAll && <OlderOutstandingBanner data={data} listId={listId} />}
      <section className="space-y-1.5" data-section="records" aria-label="Records, latest first">
        <SectionHeading
          title="Records"
          count={ordered.length}
          hint={isAll ? "Every invoice and invoice request of this project, latest first. A request amount is free text and never added to a total." : `Invoices dated, and requests made, up to the end of ${monthLabel} — latest first. Earlier ones are billing context and are not part of this month’s totals.`}
        />
        {ordered.length > 0 ? (
          <ul id={listId} className="space-y-2" aria-label="Records, latest first">
            {ordered}
          </ul>
        ) : (
          <p className="text-[11.5px] text-[var(--nu-text-muted)]" data-records-empty>
            {isAll ? "This project has no invoices or invoice requests." : `This project has no invoice dated, and no request made, up to the end of ${monthLabel}.`}
          </p>
        )}
      </section>
      {undated > 0 && (
        <p className="text-[11px] text-[var(--nu-warning)]" data-undated>
          {plural(undated, "invoice")} of this project {undated === 1 ? "has" : "have"} no usable invoice date, so {undated === 1 ? "it is" : "they are"} not placed in any month — see All history.
        </p>
      )}
    </div>
  );
}

/**
 * A project's workflow records up to the end of the selected month ("all" = every month), loaded only when its row is expanded: one
 * list, the latest record first. View / Edit / Delete call back into the page, which opens the existing invoice interfaces.
 */
export function InvoiceChain({ projectId, month, refreshTick, canEdit, canDelete, onAction }: { projectId: string; month: string; refreshTick: number; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  const fetcher = useCallback(() => fetchTrackerChain(projectId, month), [projectId, month]);
  const state = usePagedRequest(fetcher, `${projectId}:${month}:${refreshTick}`);
  const data = state.data;

  if (state.error && !data) return <StateMessage kind="error" title="Couldn't load this project's records" detail={state.error} onRetry={state.retry} />;
  if (!data) return <StateMessage kind="loading" title="Loading records…" />;
  if (data.invoices.length === 0 && data.requests.length === 0 && (data.previousInvoices ?? []).length === 0 && (data.previousRequests ?? []).length === 0 && (data.undatedInvoiceCount ?? 0) === 0) {
    return <StateMessage kind="empty" title={month === ALL_MONTHS ? "No workflow records for this project" : `No invoice is dated, and no invoice request was made, up to the end of ${formatMonthLabel(month)}.`} detail="Invoices appear under the month of their invoice date; invoice requests under the month they were created." />;
  }
  return <InvoiceChainView data={data} loading={state.loading} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />;
}
