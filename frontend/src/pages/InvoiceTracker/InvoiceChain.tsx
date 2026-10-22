import { useCallback, type ReactNode } from "react";
import { AlertTriangle, Edit2, Eye, Send, Trash2 } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { ALL_MONTHS, fetchTrackerChain, type TrackerChain, type TrackerInvoice, type TrackerInvoiceLine, type TrackerRequest } from "../../services/invoiceTrackerService";
import { INVOICE_LINE_STATUS_TONE } from "../Projects/components/Invoice/InvoiceCalculations";
import type { InvoiceLineStatus } from "../../types/InvoiceItem";
import { formatIndianCurrency } from "../../utils/formatCurrency";
import { StateMessage } from "../Settings/components/weeklyEmails/WeeklyEmailPaging";
import { usePagedRequest } from "../Settings/components/weeklyEmails/useWeeklyEmailPaging";
import { InvoiceTimeline } from "./InvoiceTimeline";
import { amountOrNotRecorded, formatDateOnly, formatInstant, formatMonthLabel, olderOutstandingLines, plural, statusLabel } from "./trackerFormat";

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

function InvoiceRecord({ inv, projectId, canEdit, canDelete, onAction, showCreatedMonth }: { inv: TrackerInvoice; projectId: string; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void; showCreatedMonth: boolean }) {
  const f = inv.financials;
  const paid = amountOrNotRecorded(f.amountPaidINR, formatIndianCurrency);
  const owing = f.balance === "not_applicable" ? "—" : amountOrNotRecorded(f.outstandingINR, formatIndianCurrency);
  return (
    <li className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm px-4 py-3 space-y-2" data-invoice={inv.key} data-record="invoice">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-bold text-[13px] text-[var(--nu-text)]">{inv.invoiceNo}</span>
        <Badge tone={INVOICE_LINE_STATUS_TONE[inv.status as InvoiceLineStatus] ?? "neutral"} dot className="text-[10.5px] whitespace-nowrap">
          {statusLabel(inv.status)}
        </Badge>
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

/**
 * THE project's headline: the latest invoice actually raised (by invoice date), its amount first and largest. It stays the
 * latest raised invoice whatever its payment status; a newer Draft never replaces it. When it is not dated in the selected
 * month it is shown as the latest AVAILABLE one — with its real date — under an explicit "No invoice raised this month".
 */
function LatestRaisedCard({ inv, inMonth, monthLabel, projectId, canEdit, canDelete, onAction }: { inv: TrackerInvoice; inMonth: boolean; monthLabel: string; projectId: string; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  const f = inv.financials;
  const owing = f.balance === "not_applicable" ? "—" : amountOrNotRecorded(f.outstandingINR, formatIndianCurrency);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 border-l-4 border-l-[var(--nu-accent)] bg-white dark:bg-slate-900 shadow-sm px-4 py-3 space-y-2" data-invoice={inv.key} data-record="latest-raised" data-latest-in-month={inMonth}>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--nu-accent)]" data-latest-label>
            {inMonth ? `Latest raised invoice · ${monthLabel}` : "Latest available raised invoice"}
          </p>
          <p className="text-[22px] leading-tight font-extrabold text-[var(--nu-text)]" data-latest-amount>
            {amountText(inv)}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
            <span className="font-bold text-[13px] text-[var(--nu-text)]">{inv.invoiceNo}</span>
            <Badge tone={INVOICE_LINE_STATUS_TONE[inv.status as InvoiceLineStatus] ?? "neutral"} dot className="text-[10.5px] whitespace-nowrap">
              {statusLabel(inv.status)}
            </Badge>
            <span className="text-[11.5px] text-[var(--nu-text-secondary)]" data-latest-date>
              Invoice date {inv.invoiceDate ? formatDateOnly(inv.invoiceDate) : "Missing or invalid"}
            </span>
            {inv.raisedInPeriod && (
              <span data-raised-this-month className="inline-flex items-center rounded-full border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                Raised this month
              </span>
            )}
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5 ml-auto" data-dates>
          <Money label="Amount paid" value={amountOrNotRecorded(f.amountPaidINR, formatIndianCurrency)} muted={f.amountPaidINR === null} note={PAID_NOTE[f.paidBasis]} testId="paid" />
          <Money label="Outstanding" value={owing} muted={f.outstandingINR === null} note={BALANCE_NOTE[f.balance]} testId="outstanding" />
        </dl>
        {inv.lines.length === 1 && <LineActions projectId={projectId} invoiceNo={inv.invoiceNo} line={inv.lines[0]!} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />}
      </div>
      {inv.mixedLineStatuses && <p className="text-[11px] text-[var(--nu-warning)]">Lines have different statuses</p>}
      {f.flags.length > 0 && (
        <p className="text-[11px] text-[var(--nu-warning)]" data-flags>
          Review: {f.flags.join(" · ")}
        </p>
      )}
      {inv.lines.length > 1 && <LinesTable inv={inv} projectId={projectId} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />}
      <HistoryToggle inv={inv} />
    </div>
  );
}

/** Opens the Previous invoices panel (a native <details>) from the warning, so the underlying records are one click away. */
function openHistory(id: string) {
  const el = document.getElementById(id);
  if (el instanceof HTMLDetailsElement) {
    el.open = true;
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function OlderOutstandingBanner({ data, historyId }: { data: TrackerChain; historyId: string }) {
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
        <button type="button" onClick={() => openHistory(historyId)} className="ml-auto text-[11.5px] font-semibold text-[var(--nu-accent)] hover:underline">
          Review in Previous invoices
        </button>
      )}
    </div>
  );
}

const cellBase = "px-3 py-2 align-top";

/** A settlement figure in the compact table: the value and, beneath it, what it rests on. */
function FigureCell({ id, value, muted, note, className = "" }: { id: string; value: string; muted?: boolean; note?: string; className?: string }) {
  return (
    <td className={`${cellBase} text-right whitespace-nowrap ${className}`} data-cell={id}>
      <div className={`text-[12px] ${muted ? "text-[var(--nu-text-muted)] italic" : "font-semibold text-[var(--nu-text)]"}`}>{value}</div>
      {note && (
        <div className="text-[10px] text-[var(--nu-text-muted)] leading-tight" data-note>
          {note}
        </div>
      )}
    </td>
  );
}

/** Per-line actions for a multi-line invoice inside a table row. */
function RowActions({ inv, projectId, canEdit, canDelete, onAction }: { inv: TrackerInvoice; projectId: string; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  if (inv.lines.length === 1) {
    return (
      <div className="flex justify-end">
        <LineActions projectId={projectId} invoiceNo={inv.invoiceNo} line={inv.lines[0]!} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />
      </div>
    );
  }
  return (
    <details className="text-left">
      <summary className="cursor-pointer select-none text-[11px] text-[var(--nu-accent)] text-right">{plural(inv.lines.length, "line")}</summary>
      <ul className="pt-1 space-y-1">
        {inv.lines.map((l) => (
          <li key={l.id} className="flex items-center justify-end gap-2 text-[11px] text-[var(--nu-text-secondary)]">
            <span className="truncate max-w-[10rem]">{l.activity}</span>
            <span className="whitespace-nowrap">{formatIndianCurrency(l.amountINR)}</span>
            <LineActions projectId={projectId} invoiceNo={inv.invoiceNo} line={l} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * One earlier invoice of the project, as a compact table row: its own date, status, amount and settlement. It is
 * billing context only — read from the same chain payload, never part of the month's totals — and carries the same
 * View / Edit / Delete as any invoice, under the same permissions.
 */
function PreviousInvoiceRow({ inv, projectId, month, olderOutstanding, canEdit, canDelete, onAction }: { inv: TrackerInvoice; projectId: string; month: string; olderOutstanding: boolean; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  const f = inv.financials;
  const owing = f.balance === "not_applicable" ? "—" : amountOrNotRecorded(f.outstandingINR, formatIndianCurrency);
  const inSelectedMonth = month !== ALL_MONTHS && inv.invoiceDate !== null && inv.invoiceDate.slice(0, 7) === month;
  return (
    <tr className="border-t border-[var(--nu-border)]" data-invoice={inv.key} data-record="previous-invoice" data-older-row={olderOutstanding}>
      <td className={cellBase}>
        <div className="font-bold text-[12.5px] text-[var(--nu-text)]">{inv.invoiceNo}</div>
        {(olderOutstanding || inSelectedMonth) && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {olderOutstanding && (
              <span className={warnPillClass} data-tag="older-outstanding">
                Older outstanding
              </span>
            )}
            {inSelectedMonth && (
              <span className={monthBadgeClass} data-tag="this-month">
                Dated this month
              </span>
            )}
          </div>
        )}
        {inv.mixedLineStatuses && <div className="text-[10.5px] text-[var(--nu-warning)]">Lines have different statuses</div>}
        {f.flags.length > 0 && (
          <div className="text-[10.5px] text-[var(--nu-warning)]" data-flags>
            Review: {f.flags.join(" · ")}
          </div>
        )}
      </td>
      <td className={cellBase}>
        <Badge tone={INVOICE_LINE_STATUS_TONE[inv.status as InvoiceLineStatus] ?? "neutral"} dot className="text-[10.5px] whitespace-nowrap">
          {statusLabel(inv.status)}
        </Badge>
      </td>
      <td className={`${cellBase} whitespace-nowrap text-[12px]`} data-cell="invoice-date">
        {inv.invoiceDate ? formatDateOnly(inv.invoiceDate) : "Missing or invalid"}
      </td>
      <FigureCell id="amount" value={amountText(inv)} />
      <FigureCell id="paid" value={amountOrNotRecorded(f.amountPaidINR, formatIndianCurrency)} muted={f.amountPaidINR === null} note={PAID_NOTE[f.paidBasis]} className="hidden sm:table-cell" />
      <FigureCell id="outstanding" value={owing} muted={f.outstandingINR === null} note={BALANCE_NOTE[f.balance]} />
      <td className={`${cellBase} text-right`}>
        <RowActions inv={inv} projectId={projectId} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />
      </td>
    </tr>
  );
}

const thClass = "px-3 py-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400";

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

/**
 * PREVIOUS invoices — collapsed by default, quieter than the headline: this project's other invoices dated up to the selected
 * month (earlier raised / paid / partially paid, drafts and cancelled records). Billing context only: never part of the
 * month's totals, and an invoice is in this table, the headline card or the drafts table — never two of them.
 */
function PreviousInvoices({ data, historyId, invoices, canEdit, canDelete, onAction }: { data: TrackerChain; historyId: string; invoices: TrackerInvoice[]; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  const undated = data.undatedInvoiceCount ?? 0;
  const older = new Set(data.olderOutstanding.keys);
  const undatedNote = undated > 0 && (
    <p className="text-[11px] text-[var(--nu-warning)]" data-undated>
      {plural(undated, "invoice")} of this project {undated === 1 ? "has" : "have"} no usable invoice date, so {undated === 1 ? "it is" : "they are"} not placed in any month — see All history.
    </p>
  );
  if (invoices.length === 0) {
    return (
      <div className="space-y-1" data-section="previous" data-previous-empty>
        <p className="text-[11.5px] text-[var(--nu-text-muted)]">No previous invoices for this project.</p>
        {undatedNote}
      </div>
    );
  }
  return (
    <details id={historyId} className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30" data-section="previous" data-previous>
      <summary className="cursor-pointer select-none px-3 py-2 flex flex-wrap items-baseline gap-x-3">
        <span className="text-[12px] font-bold text-[var(--nu-text-secondary)]">Previous invoices ({invoices.length})</span>
        <span className="text-[11px] text-[var(--nu-text-muted)]">Earlier invoices for this project, shown for billing context</span>
        <span className="ml-auto text-[11.5px] font-semibold text-[var(--nu-accent)]">
          <span className="group-open:hidden">Expand history</span>
          <span className="hidden group-open:inline">Collapse history</span>
        </span>
      </summary>
      <div className="px-3 pb-3 space-y-2">
        <p className="text-[11px] text-[var(--nu-text-muted)]">Other invoices dated up to {formatMonthLabel(data.month)}, newest first. They are not part of this month’s totals.</p>
        <div className="overflow-x-auto rounded-lg border border-[var(--nu-border)] bg-white dark:bg-slate-900">
          <table className="w-full text-left" aria-label="Previous invoices">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 text-left">
                <th className={thClass}>Invoice no.</th>
                <th className={thClass}>Status</th>
                <th className={`${thClass} whitespace-nowrap`}>Invoice date</th>
                <th className={`${thClass} text-right`}>Amount</th>
                <th className={`${thClass} text-right hidden sm:table-cell`}>Paid</th>
                <th className={`${thClass} text-right`}>Outstanding</th>
                <th className={`${thClass} text-right`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <PreviousInvoiceRow key={`p:${inv.key}`} inv={inv} projectId={data.project.id} month={data.month} olderOutstanding={older.has(inv.key)} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />
              ))}
            </tbody>
          </table>
        </div>
        {undatedNote}
      </div>
    </details>
  );
}

function RequestRow({ req, showCreatedMonth }: { req: TrackerRequest; showCreatedMonth: boolean }) {
  return (
    <tr className="border-t border-[var(--nu-border)]" data-request={req.id} data-request-status={req.status} data-record="request">
      <td className={cellBase}>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--nu-text-secondary)]">
          <Send size={12} className="text-[var(--nu-accent)]" aria-hidden="true" />
          Invoice request
        </span>
      </td>
      <td className={cellBase}>
        <span className="font-bold text-[12.5px] text-[var(--nu-text)]" data-request-ref>
          {req.ref}
        </span>
        {showCreatedMonth && (
          <div>
            <span data-month-badge className={monthBadgeClass}>
              Created {formatMonthLabel(req.createdMonth)}
            </span>
          </div>
        )}
      </td>
      <td className={`${cellBase} whitespace-nowrap text-[12px]`}>
        <div>{formatInstant(req.createdAt)}</div>
        <div className="text-[10px] text-[var(--nu-text-muted)]">Created</div>
      </td>
      <td className={`${cellBase} text-right whitespace-nowrap text-[12px] text-[var(--nu-text-muted)]`} data-request-amount>
        {req.amountNote ? `${req.amountNote} (free text)` : "Not recorded"}
      </td>
      <td className={cellBase}>
        <Badge tone={req.status === "Open" ? "info" : "neutral"} dot className="text-[10.5px] whitespace-nowrap">
          {req.label}
        </Badge>
      </td>
      <td className={`${cellBase} text-[11.5px] text-[var(--nu-text-secondary)]`}>
        {req.requestedBy} · assigned to {req.assignedTo}
        {req.status === "Open" && <div className="text-[10.5px] text-[var(--nu-text-muted)]">Waiting for Accounts to raise the invoice</div>}
        {req.fulfilledByInvoiceNo && (
          <div className="text-[11px] text-[var(--nu-text-muted)]">
            Fulfilled by invoice <strong className="font-semibold">{req.fulfilledByInvoiceNo}</strong> — a completed request is not a payment
          </div>
        )}
      </td>
    </tr>
  );
}

function DraftRow({ inv, projectId, canEdit, canDelete, onAction }: { inv: TrackerInvoice; projectId: string; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  return (
    <tr className="border-t border-[var(--nu-border)]" data-invoice={inv.key} data-record="draft">
      <td className={cellBase}>
        <span className="text-[11px] font-bold text-[var(--nu-text-secondary)]">Draft invoice</span>
      </td>
      <td className={cellBase}>
        <span className="font-bold text-[12.5px] text-[var(--nu-text)]">{inv.invoiceNo}</span>
        {inv.financials.flags.length > 0 && (
          <div className="text-[10.5px] text-[var(--nu-warning)]" data-flags>
            Review: {inv.financials.flags.join(" · ")}
          </div>
        )}
      </td>
      <td className={`${cellBase} whitespace-nowrap text-[12px]`}>
        <div>{inv.invoiceDate ? formatDateOnly(inv.invoiceDate) : "Missing or invalid"}</div>
        <div className="text-[10px] text-[var(--nu-text-muted)]">Invoice date</div>
      </td>
      <td className={`${cellBase} text-right whitespace-nowrap text-[12px] font-semibold text-[var(--nu-text)]`}>{amountText(inv)}</td>
      <td className={cellBase}>
        <Badge tone={INVOICE_LINE_STATUS_TONE[inv.status as InvoiceLineStatus] ?? "neutral"} dot className="text-[10.5px] whitespace-nowrap">
          {statusLabel(inv.status)}
        </Badge>
      </td>
      <td className={`${cellBase} text-right`}>
        <RowActions inv={inv} projectId={projectId} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />
      </td>
    </tr>
  );
}

/** Drafts and invoice requests of the selected month, together in one compact table — and visibly neither raised nor paid. */
function DraftsAndRequests({ drafts, requests, monthLabel, showCreatedMonth, projectId, canEdit, canDelete, onAction }: { drafts: TrackerInvoice[]; requests: TrackerRequest[]; monthLabel: string; showCreatedMonth: boolean; projectId: string; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  const count = drafts.length + requests.length;
  return (
    <section className="space-y-1.5" data-section="drafts-requests" aria-label="Drafts and invoice requests">
      <SectionHeading title="Drafts and invoice requests" count={count} hint="Not raised invoices — never counted as raised or paid; a request amount is free text." />
      {count === 0 ? (
        <p className="text-[11.5px] text-[var(--nu-text-muted)]" data-drafts-empty>
          No drafts or invoice requests {monthLabel ? `for ${monthLabel}` : "for this project"}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
          <table className="w-full text-left" aria-label="Drafts and invoice requests">
            <thead>
              <tr className="text-left">
                <th className={thClass}>Type</th>
                <th className={thClass}>Reference</th>
                <th className={`${thClass} whitespace-nowrap`}>Date</th>
                <th className={`${thClass} text-right`}>Amount</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Details</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((inv) => (
                <DraftRow key={`d:${inv.key}`} inv={inv} projectId={projectId} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />
              ))}
              {requests.map((req) => (
                <RequestRow key={`r:${req.id}`} req={req} showCreatedMonth={showCreatedMonth} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * The expanded project. A month report shows, in separate sections that never mix:
 *   1. the latest raised invoice (headline) — or "No invoice raised this month" (+ the latest available one, with its date),
 *   2. the older-outstanding warning, when the balances can be established,
 *   3. drafts and invoice requests of the month,
 *   4. previous invoices (collapsed).
 * "All history" has no month: it lists every invoice once, then the requests, as before.
 */
export function InvoiceChainView({ data, loading, canEdit, canDelete, onAction }: { data: TrackerChain; loading: boolean; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  const projectId = data.project.id;
  const isAll = data.month === ALL_MONTHS;
  const byKey = new Map([...data.invoices, ...(data.previousInvoices ?? [])].map((i) => [i.key, i]));
  const pick = (keys: string[] | undefined) => (keys ?? []).flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : []));
  const requestsById = new Map(data.requests.map((r) => [r.id, r]));
  const orderedRequests: TrackerRequest[] = data.order && data.order.length > 0 ? data.order.flatMap((o) => (o.kind === "request" && requestsById.has(o.id) ? [requestsById.get(o.id)!] : [])) : data.requests;
  const wrap = (children: ReactNode) => (
    <div className={`space-y-3 ${loading ? "opacity-60" : ""}`} aria-busy={loading} data-chain={projectId}>
      {children}
    </div>
  );

  if (isAll) {
    const hasOrder = Array.isArray(data.order) && data.order.length > 0;
    const invoices = new Map(data.invoices.map((i) => [i.key, i]));
    const ordered: TrackerInvoice[] = hasOrder ? data.order.flatMap((o) => (o.kind === "invoice" && invoices.has(o.id) ? [invoices.get(o.id)!] : [])) : data.invoices;
    return wrap(
      <>
        <section className="space-y-1.5" data-section="current" aria-label="Invoices">
          <SectionHeading title="Invoices" count={ordered.length} />
          {ordered.length > 0 ? (
            <ul className="space-y-2" aria-label="Invoices">
              {ordered.map((inv) => (
                <InvoiceRecord key={`i:${inv.key}`} inv={inv} projectId={projectId} canEdit={canEdit} canDelete={canDelete} onAction={onAction} showCreatedMonth />
              ))}
            </ul>
          ) : (
            <p className="text-[11.5px] text-[var(--nu-text-muted)]" data-current-empty>
              This project has no invoices.
            </p>
          )}
        </section>
        {orderedRequests.length > 0 && (
          <section className="space-y-1.5" data-section="requests" aria-label="Invoice requests">
            <SectionHeading title="Invoice requests" count={orderedRequests.length} hint="Not invoices — an amount here is free text, never added to a total." />
            <div className="overflow-x-auto rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900">
              <table className="w-full text-left" aria-label="Invoice requests">
                <thead>
                  <tr className="text-left">
                    <th className={thClass}>Type</th>
                    <th className={thClass}>Reference</th>
                    <th className={`${thClass} whitespace-nowrap`}>Date</th>
                    <th className={`${thClass} text-right`}>Amount</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {orderedRequests.map((req) => (
                    <RequestRow key={`r:${req.id}`} req={req} showCreatedMonth />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </>
    );
  }

  const monthLabel = formatMonthLabel(data.month);
  const latest = data.latestRaisedKey ? (byKey.get(data.latestRaisedKey) ?? null) : null;
  const inMonth = data.latestRaisedInMonth === true;
  const history = pick(data.historyKeys);
  const historyId = `tracker-history-${projectId}`;
  return wrap(
    <>
      <section className="space-y-1.5" data-section="latest" aria-label="Latest raised invoice">
        {latest && inMonth ? (
          <LatestRaisedCard inv={latest} inMonth monthLabel={monthLabel} projectId={projectId} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />
        ) : (
          <>
            <p className="text-[12.5px] font-extrabold text-[var(--nu-text)]" data-no-invoice-this-month>
              No invoice raised this month
              <span className="font-semibold text-[var(--nu-text-muted)]"> · no raised invoice of this project is dated in {monthLabel}</span>
            </p>
            {latest && <LatestRaisedCard inv={latest} inMonth={false} monthLabel={monthLabel} projectId={projectId} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />}
          </>
        )}
      </section>
      <OlderOutstandingBanner data={data} historyId={historyId} />
      <DraftsAndRequests drafts={pick(data.draftKeys)} requests={orderedRequests} monthLabel={monthLabel} showCreatedMonth={false} projectId={projectId} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />
      <PreviousInvoices data={data} historyId={historyId} invoices={history} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />
    </>
  );
}

/**
 * A project's workflow records for the selected month ("all" = every month), loaded only when its row is expanded: the
 * latest raised invoice, the month's drafts and requests, and the project's previous invoices. View / Edit / Delete call
 * back into the page, which opens the existing invoice interfaces.
 */
export function InvoiceChain({ projectId, month, refreshTick, canEdit, canDelete, onAction }: { projectId: string; month: string; refreshTick: number; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  const fetcher = useCallback(() => fetchTrackerChain(projectId, month), [projectId, month]);
  const state = usePagedRequest(fetcher, `${projectId}:${month}:${refreshTick}`);
  const data = state.data;

  if (state.error && !data) return <StateMessage kind="error" title="Couldn't load this project's records" detail={state.error} onRetry={state.retry} />;
  if (!data) return <StateMessage kind="loading" title="Loading records…" />;
  if (data.invoices.length === 0 && data.requests.length === 0 && (data.previousInvoices ?? []).length === 0 && (data.undatedInvoiceCount ?? 0) === 0) {
    return <StateMessage kind="empty" title={month === ALL_MONTHS ? "No workflow records for this project" : `No invoice is dated in ${formatMonthLabel(month)}, none is earlier, and no invoice request was created in it.`} detail="Invoices appear under the month of their invoice date; invoice requests under the month they were created." />;
  }
  return <InvoiceChainView data={data} loading={state.loading} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />;
}
