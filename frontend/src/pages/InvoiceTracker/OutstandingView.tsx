import { useCallback } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, ExternalLink, Hourglass, IndianRupee, ListChecks, TimerReset } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { fetchOutstanding, type OutstandingPage, type OutstandingRow } from "../../services/invoiceTrackerService";
import { INVOICE_LINE_STATUS_TONE } from "../Projects/components/Invoice/InvoiceCalculations";
import type { InvoiceLineStatus } from "../../types/InvoiceItem";
import { formatIndianCurrency } from "../../utils/formatCurrency";
import { PaginationBar, StateMessage } from "../Settings/components/weeklyEmails/WeeklyEmailPaging";
import { usePagedRequest } from "../Settings/components/weeklyEmails/useWeeklyEmailPaging";
import { LineActions, type TrackerAction } from "./InvoiceChain";
import { StatCard } from "./StatCard";
import { amountOrNotRecorded, formatDateOnly, formatInstant, statusLabel } from "./trackerFormat";

const fmt = (n: number) => n.toLocaleString("en-IN");
const th = "p-3 font-extrabold uppercase select-none sticky top-0 z-20 bg-slate-50 dark:bg-slate-900";

/** Whole-list figures (every outstanding invoice matching the filters, not just the visible page). */
export function OutstandingTotalsCards({ data }: { data: OutstandingPage }) {
  const t = data.totals;
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-5" data-summary="outstanding">
      <StatCard label="Outstanding invoices" value={fmt(t.invoiceCount)} accent="blue" icon={ListChecks} hint="Raised and Partially Paid, from every month" />
      <StatCard label="Known outstanding" value={formatIndianCurrency(t.knownOutstandingINR)} accent="amber" icon={IndianRupee} warn={t.knownOutstandingINR > 0} hint="Raised invoices at their full amount" />
      <StatCard label="Partially Paid" value={fmt(t.partiallyPaidCount)} accent="rose" icon={TimerReset} hint={`Balance not recorded · invoice total ${formatIndianCurrency(t.partiallyPaidInvoiceAmountINR)} (not an outstanding figure)`} />
      <StatCard label="30+ days" value={fmt(t.overdue30PlusCount)} accent="rose" icon={AlarmClock} warn={t.overdue30PlusCount > 0} hint="Counted from the invoice date" />
      <StatCard label="Oldest" value={t.oldestDays === null ? "—" : `${fmt(t.oldestDays)} days`} accent="slate" icon={Hourglass} hint="Days since the invoice date" />
    </div>
  );
}

function ageClass(days: number | null): string {
  if (days === null) return "text-[var(--nu-text-muted)]";
  return days >= 30 ? "text-[var(--nu-warning)] font-bold" : "text-[var(--nu-text)]";
}

/** The outstanding-invoice table — presentational. */
export function OutstandingTable({ data, canEdit, canDelete, onAction }: { data: OutstandingPage; canEdit: boolean; canDelete: boolean; onAction: (a: TrackerAction) => void }) {
  return (
    <table className="min-w-full text-xs text-left" data-table="outstanding">
      <caption className="sr-only">Outstanding invoices from all months</caption>
      <thead>
        <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
          <th className={`${th} min-w-[13rem]`}>Project</th>
          <th className={`${th} whitespace-nowrap`}>Invoice No.</th>
          <th className={`${th} whitespace-nowrap`}>Workflow created</th>
          <th className={`${th} whitespace-nowrap`}>Invoice date</th>
          <th className={`${th} whitespace-nowrap`}>Status</th>
          <th className={`${th} text-right whitespace-nowrap`}>Invoice amount</th>
          <th className={`${th} text-right whitespace-nowrap`}>Paid</th>
          <th className={`${th} text-right whitespace-nowrap`}>Outstanding</th>
          <th className={`${th} text-right whitespace-nowrap`}>Days</th>
          <th className={`${th} min-w-[11rem]`}>Review</th>
          <th className={`${th} text-right`}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((r: OutstandingRow) => (
          <tr key={`${r.projectId}:${r.invoiceNo}`} className="border-b border-slate-100 dark:border-slate-800/80 hover:bg-blue-50/20 dark:hover:bg-slate-800/30 transition-all duration-100" data-outstanding={r.invoiceNo} data-balance={r.balance}>
            <td className="p-3 min-w-[13rem]">
              <Link to={`/projects/edit/${r.projectId}?tab=invoices`} className="font-semibold text-[var(--nu-accent)] hover:underline whitespace-nowrap">
                {r.prNo}
              </Link>
              <div className="text-[11px] text-[var(--nu-text-muted)]">
                {r.client} · {r.projectTitle}
              </div>
            </td>
            <td className="p-3 font-semibold whitespace-nowrap">{r.invoiceNo}</td>
            <td className="p-3 whitespace-nowrap" data-cell="created">
              {r.createdAt ? formatInstant(r.createdAt) : "—"}
            </td>
            <td className="p-3 whitespace-nowrap">{r.invoiceDate ? formatDateOnly(r.invoiceDate) : "—"}</td>
            <td className="p-3 whitespace-nowrap">
              <Badge tone={INVOICE_LINE_STATUS_TONE[r.status as InvoiceLineStatus] ?? "neutral"} dot className="text-[10.5px]">
                {statusLabel(r.status)}
              </Badge>
            </td>
            <td className="p-3 text-right whitespace-nowrap font-semibold">{formatIndianCurrency(r.amountINR)}</td>
            <td className={`p-3 text-right whitespace-nowrap ${r.amountPaidINR === null ? "italic text-[var(--nu-text-muted)]" : ""}`} data-cell="paid">
              {amountOrNotRecorded(r.amountPaidINR, formatIndianCurrency)}
            </td>
            <td className={`p-3 text-right whitespace-nowrap ${r.outstandingINR === null ? "italic text-[var(--nu-text-muted)]" : "font-semibold"}`} data-cell="outstanding">
              {amountOrNotRecorded(r.outstandingINR, formatIndianCurrency)}
            </td>
            <td className={`p-3 text-right whitespace-nowrap ${ageClass(r.daysOutstanding)}`} data-cell="days">
              {r.daysOutstanding === null ? "—" : r.daysOutstanding}
            </td>
            <td className="p-3 min-w-[11rem] text-[11px] text-[var(--nu-warning)]" data-cell="flags">
              {r.flags.join(" · ")}
            </td>
            <td className="p-3 text-right whitespace-nowrap">
              <span className="inline-flex items-center gap-1">
                {r.lineCount === 1 && <LineActions projectId={r.projectId} invoiceNo={r.invoiceNo} line={r.actionLine} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />}
                <Link to={`/projects/edit/${r.projectId}?tab=invoices&invoiceLineId=${r.actionLine.id}`} className="inline-flex p-1.5 rounded-md text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)]" title="Open in Edit Project → Invoices" aria-label={`Open invoice ${r.invoiceNo} in Edit Project`}>
                  <ExternalLink size={14} />
                </Link>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The Outstanding view: unpaid invoices from ALL original months, oldest first. Separate from the monthly report —
 * nothing is copied into later months and an invoice keeps its creation date when it is paid.
 */
export function OutstandingSection({
  page,
  pageSize,
  search,
  projectStatus,
  refreshTick,
  canEdit,
  canDelete,
  onAction,
  onPage,
  onPageSize,
}: {
  page: number;
  pageSize: number;
  search: string;
  projectStatus: string;
  refreshTick: number;
  canEdit: boolean;
  canDelete: boolean;
  onAction: (a: TrackerAction) => void;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}) {
  const fetcher = useCallback(() => fetchOutstanding({ page, pageSize, search, projectStatus }), [page, pageSize, search, projectStatus]);
  const state = usePagedRequest(fetcher, `outstanding|${page}|${pageSize}|${search}|${projectStatus}|${refreshTick}`);
  const data = state.data;

  if (state.error && !data) return <StateMessage kind="error" title="Couldn't load outstanding invoices" detail={state.error} onRetry={state.retry} />;
  if (!data) return <StateMessage kind="loading" title="Loading outstanding invoices…" />;
  return (
    <div className="space-y-3">
      <OutstandingTotalsCards data={data} />
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0" data-section="outstanding">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Outstanding invoices — all months</h2>
          <p className="text-xs text-slate-400">
            Raised and Partially Paid invoices, oldest first. Paid, Draft and Cancelled invoices are not listed. A Raised invoice is owed in full; a Partially Paid invoice's balance is not recorded anywhere, so it is listed and flagged rather than given a figure.
          </p>
        </div>
        {data.items.length === 0 ? (
          <StateMessage kind="empty" title="No outstanding invoices." detail="Nothing Raised or Partially Paid matches the current search and filters." />
        ) : (
          <div className={`overflow-auto nu-scrollbar max-h-[70vh] transition-opacity ${state.loading ? "opacity-50" : ""}`} aria-busy={state.loading}>
            <OutstandingTable data={data} canEdit={canEdit} canDelete={canDelete} onAction={onAction} />
          </div>
        )}
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 rounded-b-2xl">
          <PaginationBar info={data} disabled={state.loading} noun="invoices" onPage={onPage} onPageSize={onPageSize} />
        </div>
      </div>
    </div>
  );
}
