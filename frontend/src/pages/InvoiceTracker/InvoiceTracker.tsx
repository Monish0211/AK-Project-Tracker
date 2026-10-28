import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BellRing, ChevronDown, ChevronRight, ExternalLink, FolderKanban, Hourglass, IndianRupee, ReceiptText, Receipt, RefreshCw, TimerReset, Wallet } from "lucide-react";
import { useAuth } from "../../auth/authContext";
import { canMutateData, hasApprovalPermission } from "../../auth/permissions";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { PROJECT_STATUS_OPTIONS } from "../../constants/projectStatus";
import { ALL_MONTHS, fetchTrackerMonth, type TrackerMonthPage, type TrackerProjectRow } from "../../services/invoiceTrackerService";
import { formatIndianCurrency } from "../../utils/formatCurrency";
import { PaginationBar, StateMessage } from "../Settings/components/weeklyEmails/WeeklyEmailPaging";
import { usePagedRequest, usePageParams } from "../Settings/components/weeklyEmails/useWeeklyEmailPaging";
import { InvoiceActionHost } from "./InvoiceActionHost";
import { InvoiceChain, type TrackerAction } from "./InvoiceChain";
import { MonthSelect } from "./MonthSelect";
import { OutstandingSection } from "./OutstandingView";
import { RaisedAmountCard } from "./RaisedBreakdown";
import type { BreakdownQuery } from "./raisedBreakdownLogic";
import { StatCard } from "./StatCard";
import { beginSaving, currentMonthIST, endSaving, isSaving, formatMonthLabel, isValidMonth, latestRecordCaption, olderOutstandingLines, parseFilter, parseView, SUMMARY_STATUS_LABEL, SUMMARY_STATUS_TONE, TRACKER_FILTERS, TRACKER_VIEWS, type SavingMap, type TrackerView } from "./trackerFormat";

const FILTER_KEYS = ["view", "month", "search", "filter", "projectStatus"] as const;
const controlClass =
  "h-9 px-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 focus:border-[var(--nu-accent)]";

const HERO_CSS = `
  .trk-hero { border-radius: 14px; overflow: hidden; position: relative; background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #0E7490 100%); }
  html.dark .trk-hero { background: linear-gradient(-45deg, #152B68 0%, #1F52C4 30%, #0B6059 65%, #0892C8 100%); background-size: 300% 300%; animation: gradientShift 22s ease-in-out infinite; border: 1px solid rgba(56,139,253,.16); box-shadow: 0 8px 28px rgba(0,0,0,.48); }
  .trk-hero::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.032) 1px, transparent 1px); background-size: 22px 22px; pointer-events: none; }
  .trk-hero::after { content: ''; position: absolute; left: -80px; top: -80px; width: 280px; height: 280px; background: radial-gradient(circle, rgba(59,130,246,.14) 0%, transparent 68%); pointer-events: none; }
  .trk-hero-in { position: relative; z-index: 1; padding: 16px 22px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
  @media (max-width: 640px) { .trk-hero-in { flex-direction: column; align-items: flex-start; } }
`;

// The columns follow the width the cards actually get (the content column, which is narrower by the sidebar and padding), not the
// window: a viewport breakpoint at 1536px put seven ~160px cards in a 1248px content area and clipped their amounts. Each card keeps
// at least ~200px: 2 columns by default, 4 from 880px, 7 from 1472px of content width (1 column on a very narrow container).
// The page root is the `@container` (see the root element below).
const SUMMARY_GRID = "grid gap-3 grid-cols-1 @min-[420px]:grid-cols-2 @min-[880px]:grid-cols-4 @min-[1472px]:grid-cols-7";

const fmt = (n: number) => n.toLocaleString("en-IN");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/**
 * The period-wide figures — computed on the server over every matching project, never from the visible page. With `query` (the month and
 * filters the list is showing) the "Raised invoice amount" card opens a breakdown of exactly that figure; `refreshKey` changes whenever the
 * page reloads its data, `onRefresh` lets the breakdown ask for that if it finds the card out of date.
 */
export function TrackerSummaryCards({ data, query, refreshKey = 0, onRefresh }: { data: TrackerMonthPage; query?: BreakdownQuery; refreshKey?: number; onRefresh?: () => void }) {
  const s = data.summary;
  const scope = data.month === ALL_MONTHS ? "all months" : formatMonthLabel(data.month);
  return (
    <div className={SUMMARY_GRID} data-summary data-scope={data.month}>
      <StatCard label="Workflow records" value={fmt(s.recordCount)} accent="blue" icon={FolderKanban} hint={`${plural(s.invoiceCount, "invoice")} · ${plural(s.requestCount, "request")} · ${plural(s.projectCount, "project")}`} />
      <StatCard label="Raised invoices" value={fmt(s.invoicesRaised)} accent="emerald" icon={ReceiptText} hint="Raised, Partially Paid and Paid — never Draft, Cancelled or requests" />
      {query ? (
        <RaisedAmountCard value={formatIndianCurrency(s.raisedAmountINR)} totalINR={s.raisedAmountINR} hint={`Invoices dated in ${scope}`} query={query} refreshKey={refreshKey} onRefresh={onRefresh} />
      ) : (
        <StatCard label="Raised invoice amount" value={formatIndianCurrency(s.raisedAmountINR)} accent="emerald" icon={IndianRupee} hint={`Invoices dated in ${scope}`} />
      )}
      <StatCard label="Pending approval amount" value="Not recorded" muted accent="rose" icon={BellRing} hint={`${plural(s.pendingApproval.count, "open invoice request")} · requests carry no amount`} />
      <StatCard
        label="Amount collected"
        value={formatIndianCurrency(s.collected.amountINR)}
        accent="indigo"
        icon={Wallet}
        hint={`Inferred from Paid status — no payments are recorded: ${plural(s.collected.paidInvoiceCount, "Paid invoice")} at full amount${s.collected.partiallyPaidExcludedCount > 0 ? ` · ${fmt(s.collected.partiallyPaidExcludedCount)} Partially Paid not included (amount not recorded)` : ""}${s.collected.needsReviewCount > 0 ? ` · ${fmt(s.collected.needsReviewCount)} Paid need review` : ""}`}
      />
      <StatCard
        label={`Outstanding · invoices dated in ${data.month === ALL_MONTHS ? "all months" : "this month"}`}
        value={formatIndianCurrency(s.outstanding.knownAmountINR)}
        accent="amber"
        icon={Hourglass}
        warn={s.outstanding.knownAmountINR > 0}
        hint={`${plural(s.outstanding.invoiceCount, "invoice")} · ${fmt(s.outstanding.balanceNotRecordedCount)} with balance not recorded · every month: Outstanding tab`}
      />
      <StatCard
        label="Invoice status"
        value={`${fmt(s.byStatus.raised)} · ${fmt(s.byStatus.partiallyPaid)} · ${fmt(s.byStatus.paid)}`}
        accent="slate"
        icon={TimerReset}
        hint={`Raised · Partially Paid · Paid (Draft ${fmt(s.byStatus.draft)}, Cancelled ${fmt(s.byStatus.cancelled)}) · requests open ${fmt(s.requests.open)}, completed ${fmt(s.requests.completed)}`}
      />
    </div>
  );
}

const warnPill = "inline-flex items-center gap-1 rounded-full border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700 dark:text-amber-400";

/**
 * LATEST INVOICE AMOUNT — the amount of the project's latest record (its latest invoice or approval request, see LatestRecord). An
 * approval request has no amount yet, so it shows a dash; once Accounts raises the invoice it shows the amount they entered. Beneath it:
 * which record that is and its date, so an older record is never mistaken for a current-month invoice. A compact warning stays when
 * older invoices are still outstanding. Amounts of different records are never combined.
 */
export function LatestAmountCell({ project }: { project: TrackerProjectRow }) {
  const l = project.latestRecord;
  const warnings = olderOutstandingLines(project.olderOutstanding, formatIndianCurrency, true);
  return (
    <div className="space-y-1 min-w-[10rem]" data-cell="latest-amount">
      {l ? (
        <div data-latest-record={l.reference} data-latest-kind={l.kind}>
          <div className={`text-[14px] font-extrabold leading-tight ${l.amountINR === null ? "text-[var(--nu-text-muted)]" : "text-[var(--nu-text)]"}`} data-latest-amount>
            {l.amountINR === null ? <span aria-label="No invoice amount yet">—</span> : formatIndianCurrency(l.amountINR)}
          </div>
          <div className="text-[11px] text-[var(--nu-text-muted)]" data-latest-caption>
            {latestRecordCaption(l)}
            {l.inMonth === false && <span data-earlier-month> · earlier month</span>}
          </div>
        </div>
      ) : (
        <div data-no-record>
          <div className="text-[14px] font-extrabold leading-tight text-[var(--nu-text-muted)]" data-latest-amount>
            <span aria-label="No invoice amount">—</span>
          </div>
          <div className="text-[11px] text-[var(--nu-text-muted)]">No invoice or request yet</div>
        </div>
      )}
      {warnings.map((w) => (
        <div key={w} className={warnPill} data-older-outstanding title={w}>
          <AlertTriangle size={11} aria-hidden="true" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}

/** STATUS — where the project's latest record is in its lifecycle: Pending Approval → Raised → (Partially) Paid. */
export function LatestStatusCell({ project }: { project: TrackerProjectRow }) {
  const l = project.latestRecord;
  if (!l) {
    return (
      <span className="text-[12px] text-[var(--nu-text-muted)]" data-no-status>
        —
      </span>
    );
  }
  return (
    <Badge tone={SUMMARY_STATUS_TONE[l.status]} dot className="text-[10.5px]">
      <span data-latest-status={l.status}>{SUMMARY_STATUS_LABEL[l.status]}</span>
    </Badge>
  );
}

const th = "p-3 font-extrabold uppercase select-none sticky top-0 z-20 bg-slate-50 dark:bg-slate-900";

/** The project table (an expanded row's records come from `renderChain`) — presentational. */
export function TrackerTable({ data, month, expanded, onToggle, renderChain }: { data: TrackerMonthPage; month: string; expanded: ReadonlySet<string>; onToggle: (projectId: string) => void; renderChain: (projectId: string) => ReactNode }) {
  return (
    <table className="min-w-full text-xs text-left" data-table="invoice-tracker">
      <caption className="sr-only">Projects and their workflow records for {formatMonthLabel(month)}</caption>
      <thead>
        <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
          <th className={`${th} w-8`}>
            <span className="sr-only">Expand</span>
          </th>
          <th className={`${th} whitespace-nowrap`}>S. No.</th>
          <th className={`${th} whitespace-nowrap`}>PR No.</th>
          <th className={th}>Client Name</th>
          <th className={th}>Project Title</th>
          <th className={`${th} text-right whitespace-nowrap`}>WO Value</th>
          <th className={`${th} whitespace-nowrap`}>Latest Invoice Amount</th>
          <th className={`${th} whitespace-nowrap`}>Status</th>
          <th className={`${th} text-right`}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((p, index) => {
          const open = expanded.has(p.id);
          return (
            <Fragment key={p.id}>
              <tr className={`border-b border-slate-100 dark:border-slate-800/80 hover:bg-blue-50/20 dark:hover:bg-slate-800/30 transition-all duration-100 ${open ? "bg-blue-50/30 dark:bg-slate-800/40" : ""}`} data-project={p.prNo} data-expanded={open}>
                <td className="px-2 py-3">
                  <button
                    type="button"
                    onClick={() => onToggle(p.id)}
                    aria-expanded={open}
                    aria-controls={`tracker-chain-${p.id}`}
                    aria-label={`${open ? "Hide" : "Show"} records for ${p.prNo}`}
                    className="p-1 rounded-md hover:bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)]"
                  >
                    {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                </td>
                <td className="p-3 whitespace-nowrap">{(data.page - 1) * data.pageSize + index + 1}</td>
                <td className="p-3 whitespace-nowrap font-semibold">
                  <Link to={`/projects/edit/${p.id}?tab=invoices`} className="text-[var(--nu-accent)] hover:underline">
                    {p.prNo}
                  </Link>
                </td>
                <td className="p-3">{p.client}</td>
                <td className="p-3">{p.projectTitle}</td>
                <td className="p-3 text-right whitespace-nowrap font-semibold">{formatIndianCurrency(p.workOrderValueINR)}</td>
                <td className="p-3">
                  <LatestAmountCell project={p} />
                </td>
                <td className="p-3 whitespace-nowrap">
                  <LatestStatusCell project={p} />
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => onToggle(p.id)} aria-label={`${open ? "Hide" : "Show"} records for ${p.prNo}`}>
                    {open ? "Hide records" : "View records"}
                  </Button>
                  <Link to={`/projects/edit/${p.id}?tab=invoices`} className="inline-flex p-1.5 rounded-md text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)]" title="Open in Edit Project → Invoices" aria-label={`Open ${p.prNo} in Edit Project`}>
                    <ExternalLink size={14} />
                  </Link>
                </td>
              </tr>
              {open && (
                <tr className="bg-slate-50 dark:bg-slate-950/50">
                  <td colSpan={9} className="p-3 border-b border-slate-200 dark:border-slate-800" id={`tracker-chain-${p.id}`}>
                    {/* The table can be wider than its panel (it scrolls sideways); the records stay as wide as what is visible, pinned to the left edge. */}
                    <div className="sticky left-3 w-[min(calc(100cqw-1.5rem),100%)]">{renderChain(p.id)}</div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

const HERO_TEXT: Record<TrackerView, string> = {
  month: "Projects with an invoice dated in the selected month or an invoice request made in it. Each row shows the project's latest invoice or approval request: its amount (a dash while approval is pending) and its status. Rows are ordered by when the approval was first submitted, latest first, so a row keeps its place while its status changes. Expand a project for all its records, latest first, with their recorded history.",
  outstanding: "Unpaid invoices from every month, oldest first, for follow-up. An invoice keeps its original month when it is paid; nothing is copied forward.",
  history: "Every workflow record from every month. Statuses and history are exactly what Edit Project → Invoices has saved; earlier invoices show “No recorded history”.",
};

/**
 * Invoice Tracker: a month-based workflow report (an invoice belongs to the month of its INVOICE date, a request to the month it
 * was submitted), a separate Outstanding view (unpaid invoices from all months) and an All history view. The server decides the row
 * order — the original approval submission, latest first — and this page never re-sorts it, so a row stays where it is while its
 * status updates. Status, amounts and history always come from the backend's saved state — nothing is edited here; View / Edit /
 * Delete open the existing invoice interfaces. Page access is the Invoices module; project scope is the backend's.
 */
export default function InvoiceTracker() {
  const { user } = useAuth();
  const { page, pageSize, filters, update } = usePageParams(FILTER_KEYS);
  const view = parseView(filters.view);
  const selectedMonth = isValidMonth(filters.month) ? filters.month : currentMonthIST();
  const month = view === "history" ? ALL_MONTHS : selectedMonth;
  const search = filters.search ?? "";
  const filter = parseFilter(filters.filter);
  const projectStatus = filters.projectStatus ?? "";

  // Three reload scopes: Refresh reloads everything (the list, Outstanding, every open project); a saved or deleted invoice reloads
  // the list (cards, headline) and ONLY that project's open records — other open projects are not re-read.
  const [refreshTick, setRefreshTick] = useState(0);
  const [listTick, setListTick] = useState(0);
  const [projectTicks, setProjectTicks] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<SavingMap>(() => new Map());
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [action, setAction] = useState<TrackerAction | null>(null);

  // Search is debounced into the URL, so Back / Refresh keep it and each keystroke does not hit the server.
  const [searchText, setSearchText] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchText.trim() !== search) update({ filters: { search: searchText.trim() } });
    }, 300);
    return () => clearTimeout(t);
  }, [searchText, search, update]);

  const fetchPage = useCallback(() => (view === "outstanding" ? Promise.resolve(null) : fetchTrackerMonth({ month, page, pageSize, search, projectStatus, filter })), [view, month, page, pageSize, search, projectStatus, filter]);
  const state = usePagedRequest(fetchPage, `${view}|${month}|${page}|${pageSize}|${search}|${projectStatus}|${filter}|${refreshTick}|${listTick}`);
  const data = view === "outstanding" ? null : state.data;

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  const closeAction = useCallback(() => setAction(null), []);
  const beginProjectSave = useCallback((projectId: string) => setSaving((m) => beginSaving(m, projectId)), []);
  const settleProject = useCallback((projectId: string) => {
    setSaving((m) => endSaving(m, projectId));
    setNotice(null);
    setListTick((t) => t + 1);
    setProjectTicks((t) => ({ ...t, [projectId]: (t[projectId] ?? 0) + 1 }));
  }, []);
  // While a save on a project is still talking to the server, a second View / Edit / Delete on it is refused: it would act on a list
  // that is about to change (a second Delete of the same invoice would only come back as an error).
  const openAction = useCallback(
    (a: TrackerAction) => {
      if (isSaving(saving, a.projectId)) {
        setNotice("A change to this project's invoices is still saving. Please wait a moment, then try again.");
        return;
      }
      setNotice(null);
      setAction(a);
    },
    [saving]
  );

  // Buttons follow the existing approval rights; the backend enforces them regardless (PATCH / DELETE /invoice-lines).
  const canMutate = canMutateData(user);
  const canEdit = canMutate && hasApprovalPermission(user, "Edit Invoice");
  const canDelete = canMutate && hasApprovalPermission(user, "Delete Invoice");

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const denied = view !== "outstanding" && state.error !== null && /access|permission|forbidden/i.test(state.error);
  const setView = (v: TrackerView) => update({ page: 1, filters: { view: v === "month" ? "" : v } });

  return (
    <div className="@container space-y-3.5 nu-fade-in" data-page="invoice-tracker" data-view={view}>
      <style dangerouslySetInnerHTML={{ __html: HERO_CSS }} />
      <div className="trk-hero shadow-lg" data-hero>
        <div className="trk-hero-in">
          <div className="text-left flex-1 min-w-0">
            <div className="text-xs font-bold tracking-wider text-slate-400/90 mb-1.5 flex items-center gap-1.5 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-sm"></span>
              iFluids Engineering · Project Management Office
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-none">Invoice Tracker</h1>
            <p className="text-slate-300/80 text-xs sm:text-sm mt-1.5 max-w-2xl leading-relaxed">{HERO_TEXT[view]}</p>
          </div>
          <div className="flex flex-col items-end gap-2.5 shrink-0 z-10">
            <button
              type="button"
              onClick={refresh}
              disabled={state.loading && view !== "outstanding"}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-4 py-2 rounded-lg backdrop-blur-md transition-all duration-200 text-sm shadow-sm disabled:opacity-60"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            {data && (
              <div className="flex items-center gap-1.5 text-xs text-slate-300/90 font-medium">
                <FolderKanban size={13} className="text-slate-400" />
                Projects with records &nbsp;
                <strong className="text-white font-extrabold">{fmt(data.summary.projectCount)}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      {(saving.size > 0 || notice) && (
        <div role="status" className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-[12px] font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2" data-saving={saving.size > 0} data-notice={notice !== null}>
          <RefreshCw size={13} className={saving.size > 0 ? "animate-spin" : ""} aria-hidden="true" />
          {notice ?? "Saving the invoice change… the list updates when it finishes."}
        </div>
      )}

      <div role="tablist" aria-label="Invoice Tracker views" className="flex flex-wrap gap-1.5" data-tabs>
        {TRACKER_VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={view === v.value}
            data-tab={v.value}
            onClick={() => setView(v.value)}
            className={`px-4 py-2 rounded-xl text-[12.5px] font-bold border transition ${view === v.value ? "bg-[var(--nu-accent)] text-white border-transparent shadow-sm" : "bg-white dark:bg-slate-900 text-[var(--nu-text-secondary)] border-slate-200 dark:border-slate-800 hover:bg-[var(--nu-surface-alt)]"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-end gap-3 p-3 bg-slate-50/50 dark:bg-slate-900/40 rounded-2xl">
          {view === "month" && (
            <div className="text-[11px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">
              Month (invoice date)
              <MonthSelect value={selectedMonth} onChange={(m) => update({ filters: { month: m } })} currentYear={Number(currentMonthIST().slice(0, 4))} />
            </div>
          )}
          <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] flex-1 min-w-[12rem] max-w-md">
            Search
            <input type="search" className={`${controlClass} block mt-1 w-full`} placeholder="PR No., client or project title" value={searchText} onChange={(e) => setSearchText(e.target.value)} aria-label="Search projects" />
          </label>
          {view !== "outstanding" && (
            <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">
              Show
              <select className={`${controlClass} block mt-1`} value={filter} onChange={(e) => update({ filters: { filter: e.target.value === "all" ? "" : e.target.value } })} aria-label="Filter projects">
                {TRACKER_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">
            Project status
            <select className={`${controlClass} block mt-1`} value={projectStatus} onChange={(e) => update({ filters: { projectStatus: e.target.value } })} aria-label="Filter by project status">
              <option value="">All statuses</option>
              {PROJECT_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {view === "outstanding" ? (
        <OutstandingSection
          page={page}
          pageSize={pageSize}
          search={search}
          projectStatus={projectStatus}
          refreshTick={refreshTick + listTick}
          canEdit={canEdit}
          canDelete={canDelete}
          onAction={openAction}
          onPage={(p) => update({ page: p })}
          onPageSize={(s) => update({ pageSize: s })}
        />
      ) : (
        <>
          {data && <TrackerSummaryCards data={data} query={{ month, search, projectStatus, filter }} refreshKey={refreshTick + listTick} onRefresh={refresh} />}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 shrink-0 bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center rounded-xl">
                  <Receipt size={16} className="text-blue-500" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{view === "history" ? "All history — every month" : `Invoices dated in ${formatMonthLabel(month)}`}</h2>
                  <p className="text-xs text-slate-400">
                    {view === "history"
                      ? "Every project with at least one invoice or invoice request, across all months."
                      : `Only projects with an invoice dated in ${formatMonthLabel(month)} (or an invoice request created in it — requests have no invoice date). Invoices raised in ${formatMonthLabel(month)} come first. Raising or paying in another month never moves an invoice.`}
                  </p>
                </div>
              </div>
              {data && (
                <span className="text-xs font-bold px-3 py-1 shrink-0 bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400 rounded-full border border-blue-100 dark:border-blue-900/30">
                  {fmt(data.total)} project{data.total === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {state.error && !data ? (
              <StateMessage kind={denied ? "denied" : "error"} title={denied ? "You don't have access to Invoice Tracker" : "Couldn't load Invoice Tracker"} detail={state.error} {...(denied ? {} : { onRetry: state.retry })} />
            ) : !data ? (
              <StateMessage kind="loading" title="Loading projects…" />
            ) : (
              <>
                {state.error && (
                  <div className="px-4 py-2 text-[11.5px] text-[var(--nu-danger)] border-b border-[var(--nu-border)] flex items-center gap-2" data-state="page-error">
                    Couldn't load that page: {state.error}
                    <button type="button" className="underline font-semibold" onClick={state.retry}>
                      Try again
                    </button>
                  </div>
                )}
                {data.items.length === 0 ? (
                  <StateMessage
                    kind="empty"
                    title={view === "history" ? "No workflow records match." : `No invoice is dated in ${formatMonthLabel(month)}.`}
                    detail={view === "history" ? "Change the search or filters." : "Choose another month, or use Outstanding / All history to find older records."}
                  />
                ) : (
                  <div className={`overflow-auto nu-scrollbar max-h-[70vh] [container-type:inline-size] transition-opacity ${state.loading ? "opacity-50" : ""}`} aria-busy={state.loading}>
                    <TrackerTable data={data} month={month} expanded={expanded} onToggle={toggle} renderChain={(projectId) => <InvoiceChain projectId={projectId} month={month} refreshTick={refreshTick + (projectTicks[projectId] ?? 0)} canEdit={canEdit} canDelete={canDelete} onAction={openAction} />} />
                  </div>
                )}
                <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 rounded-b-2xl">
                  <PaginationBar info={data} disabled={state.loading} noun="projects" onPage={(p) => update({ page: p })} onPageSize={(s) => update({ pageSize: s })} />
                </div>
              </>
            )}
          </div>
        </>
      )}

      {action && <InvoiceActionHost key={`${action.projectId}:${action.lineId}:${action.mode}`} action={action} onClose={closeAction} onSaving={() => beginProjectSave(action.projectId)} onSettled={() => settleProject(action.projectId)} />}
    </div>
  );
}
