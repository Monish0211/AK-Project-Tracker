import { Fragment, useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Ban, BellRing, ChevronDown, ChevronRight, ExternalLink, FolderKanban, IndianRupee, ListChecks, Receipt, ReceiptText, RefreshCw, TimerReset, type LucideIcon } from "lucide-react";
import { useAuth } from "../../auth/authContext";
import { canMutateData, hasApprovalPermission } from "../../auth/permissions";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { InvoiceRequestFlag } from "../../components/ui/InvoiceRequestFlag";
import { RepositoryInvoiceStatusBadge } from "../../components/Projects/RepositoryInvoiceStatusBadge";
import { PROJECT_STATUS_OPTIONS } from "../../constants/projectStatus";
import { fetchTrackerMonth, type TrackerMonthPage } from "../../services/invoiceTrackerService";
import { formatIndianCurrency } from "../../utils/formatCurrency";
import { repositoryInvoiceSummary } from "../../utils/repositoryInvoiceStatus";
import { PaginationBar, StateMessage } from "../Settings/components/weeklyEmails/WeeklyEmailPaging";
import { usePagedRequest, usePageParams } from "../Settings/components/weeklyEmails/useWeeklyEmailPaging";
import { InvoiceActionHost } from "./InvoiceActionHost";
import { InvoiceChain, type TrackerAction } from "./InvoiceChain";
import { currentMonthIST, formatMonthLabel, isValidMonth, parseFilter, TRACKER_FILTERS } from "./trackerFormat";

const FILTER_KEYS = ["month", "search", "filter", "projectStatus"] as const;
const controlClass =
  "h-9 px-2.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12.5px] text-[var(--nu-text)] outline-none focus:ring-2 focus:ring-[var(--nu-accent)]/30 focus:border-[var(--nu-accent)]";

type StatAccent = "blue" | "emerald" | "amber" | "indigo" | "rose" | "slate";
// Same chip + icon pairing the Project Repository summary cards use (light and dark variants together).
const ACCENT: Record<StatAccent, { chip: string; icon: string; value: string; edge: string }> = {
  blue: { chip: "bg-blue-50 dark:bg-blue-950/20", icon: "text-blue-500", value: "text-slate-800 dark:text-slate-100", edge: "#3B82F6" },
  emerald: { chip: "bg-emerald-50 dark:bg-emerald-950/20", icon: "text-emerald-500", value: "text-emerald-600 dark:text-emerald-400", edge: "#22C55E" },
  amber: { chip: "bg-amber-50 dark:bg-amber-950/20", icon: "text-amber-500", value: "text-slate-800 dark:text-slate-100", edge: "#F97316" },
  indigo: { chip: "bg-indigo-50 dark:bg-indigo-950/20", icon: "text-indigo-500", value: "text-slate-800 dark:text-slate-100", edge: "#818CF8" },
  rose: { chip: "bg-rose-50 dark:bg-rose-950/20", icon: "text-rose-500", value: "text-slate-800 dark:text-slate-100", edge: "#EF4444" },
  slate: { chip: "bg-slate-100 dark:bg-slate-800/60", icon: "text-slate-500", value: "text-slate-800 dark:text-slate-100", edge: "#64748B" },
};

function Stat({ label, value, hint, accent, icon: Icon, warn }: { label: string; value: string; hint?: string; accent: StatAccent; icon: LucideIcon; warn?: boolean }) {
  const c = ACCENT[accent];
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative overflow-hidden rounded-xl p-4 flex items-center gap-3 shadow-sm min-w-0" data-stat={label}>
      <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: c.edge }} data-edge />
      <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${c.chip}`}>
        <Icon size={15} className={c.icon} />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase leading-tight">{label}</div>
        <div className={`text-lg font-black leading-none mt-1 ${warn ? "text-amber-600 dark:text-amber-400" : c.value}`}>{value}</div>
        {hint && <div className="text-[10.5px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">{hint}</div>}
      </div>
    </div>
  );
}

const HERO_CSS = `
  .trk-hero { border-radius: 14px; overflow: hidden; position: relative; background: linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #0E7490 100%); }
  html.dark .trk-hero { background: linear-gradient(-45deg, #152B68 0%, #1F52C4 30%, #0B6059 65%, #0892C8 100%); background-size: 300% 300%; animation: gradientShift 22s ease-in-out infinite; border: 1px solid rgba(56,139,253,.16); box-shadow: 0 8px 28px rgba(0,0,0,.48); }
  .trk-hero::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.032) 1px, transparent 1px); background-size: 22px 22px; pointer-events: none; }
  .trk-hero::after { content: ''; position: absolute; left: -80px; top: -80px; width: 280px; height: 280px; background: radial-gradient(circle, rgba(59,130,246,.14) 0%, transparent 68%); pointer-events: none; }
  .trk-hero-in { position: relative; z-index: 1; padding: 16px 22px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
  @media (max-width: 640px) { .trk-hero-in { flex-direction: column; align-items: flex-start; } }
`;

const fmt = (n: number) => n.toLocaleString("en-IN");

/** The whole-month figures — computed on the server over every matching project, never from the visible page. */
export function TrackerSummaryCards({ data }: { data: TrackerMonthPage }) {
  const s = data.summary;
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7" data-summary>
      <Stat label="Projects" value={fmt(s.projectCount)} accent="blue" icon={FolderKanban} />
      <Stat label="Raised this month" value={fmt(s.projectsRaised)} accent="emerald" icon={ReceiptText} hint="projects with a raised invoice" />
      <Stat label="Not Raised" value={fmt(s.projectsNotRaised)} accent="amber" icon={Ban} warn={s.projectsNotRaised > 0} hint="projects" />
      <Stat label="Invoices raised" value={fmt(s.invoicesRaised)} accent="indigo" icon={ListChecks} hint={`${fmt(s.invoiceCount)} invoices dated this month in total`} />
      <Stat label="Raised amount" value={formatIndianCurrency(s.raisedAmountINR)} accent="emerald" icon={IndianRupee} hint="Raised, Partially Paid and Paid" />
      <Stat label="Awaiting approval (+)" value={fmt(s.approvalPendingCount)} accent="rose" icon={BellRing} hint="projects with an open invoice request" />
      <Stat
        label="Invoice status"
        value={`${fmt(s.byStatus.raised)} · ${fmt(s.byStatus.partiallyPaid)} · ${fmt(s.byStatus.paid)}`}
        accent="slate"
        icon={TimerReset}
        hint={`Raised · Partially Paid · Paid  (Draft ${fmt(s.byStatus.draft)}, Cancelled ${fmt(s.byStatus.cancelled)})`}
      />
    </div>
  );
}

/** The project table (an expanded row's chain comes from `renderChain`) — presentational. */
export function TrackerTable({ data, month, expanded, onToggle, renderChain }: { data: TrackerMonthPage; month: string; expanded: ReadonlySet<string>; onToggle: (projectId: string) => void; renderChain: (projectId: string) => ReactNode }) {
  return (
                <table className="min-w-full text-xs text-left" data-table="invoice-tracker">
                  <caption className="sr-only">Projects and their invoice activity for {formatMonthLabel(month)}</caption>
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="p-3 font-extrabold uppercase select-none sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 w-8">
                        <span className="sr-only">Expand</span>
                      </th>
                      <th className="p-3 font-extrabold uppercase select-none sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 whitespace-nowrap">S. No.</th>
                      <th className="p-3 font-extrabold uppercase select-none sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 whitespace-nowrap">PR No.</th>
                      <th className="p-3 font-extrabold uppercase select-none sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Client Name</th>
                      <th className="p-3 font-extrabold uppercase select-none sticky top-0 z-20 bg-slate-50 dark:bg-slate-900">Project Title</th>
                      <th className="p-3 font-extrabold uppercase select-none sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 text-right whitespace-nowrap">WO Value</th>
                      <th className="p-3 font-extrabold uppercase select-none sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 whitespace-nowrap">Invoice Status</th>
                      <th className="p-3 font-extrabold uppercase select-none sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 whitespace-nowrap">This month</th>
                      <th className="p-3 font-extrabold uppercase select-none sticky top-0 z-20 bg-slate-50 dark:bg-slate-900 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((p, index) => {
                      const open = expanded.has(p.id);
                      const repo = repositoryInvoiceSummary(p.workOrderValueINR, p.pendingDueINR);
                      return (
                        <Fragment key={p.id}>
                          <tr className={`border-b border-slate-100 dark:border-slate-800/80 hover:bg-blue-50/20 dark:hover:bg-slate-800/30 transition-all duration-100 ${open ? "bg-blue-50/30 dark:bg-slate-800/40" : ""}`} data-project={p.prNo} data-expanded={open}>
                            <td className="px-2 py-3">
                              <button
                                type="button"
                                onClick={() => onToggle(p.id)}
                                aria-expanded={open}
                                aria-controls={`tracker-chain-${p.id}`}
                                aria-label={`${open ? "Hide" : "Show"} invoices for ${p.prNo}`}
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
                            <td className="p-3 whitespace-nowrap">
                              <span className="inline-flex items-center">
                                <RepositoryInvoiceStatusBadge status={repo.invoiceStatus} />
                                {p.hasOpenInvoiceRequest && <InvoiceRequestFlag />}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap" data-month-state={p.month.state}>
                              {p.month.state === "Raised" ? (
                                <span className="inline-flex flex-col">
                                  <Badge tone="success" dot className="text-[10.5px] w-fit">
                                    Raised · {p.month.raisedInvoiceCount} invoice{p.month.raisedInvoiceCount === 1 ? "" : "s"}
                                  </Badge>
                                  <span className="text-[11px] text-[var(--nu-text-muted)]">{formatIndianCurrency(p.month.raisedAmountINR)}</span>
                                </span>
                              ) : (
                                <span className="inline-flex flex-col">
                                  <Badge tone="warning" dot className="text-[10.5px] w-fit">
                                    Not Raised
                                  </Badge>
                                  {p.month.invoiceCount > 0 && <span className="text-[11px] text-[var(--nu-text-muted)]">{p.month.invoiceCount} draft / cancelled</span>}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right whitespace-nowrap">
                              <Button variant="ghost" size="sm" onClick={() => onToggle(p.id)} aria-label={`${open ? "Hide" : "Show"} invoices for ${p.prNo}`}>
                                {open ? "Hide invoices" : "View invoices"}
                              </Button>
                              <Link to={`/projects/edit/${p.id}?tab=invoices`} className="inline-flex p-1.5 rounded-md text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)]" title="Open in Edit Project → Invoices" aria-label={`Open ${p.prNo} in Edit Project`}>
                                <ExternalLink size={14} />
                              </Link>
                            </td>
                          </tr>
                          {open && (
                            <tr className="bg-slate-50 dark:bg-slate-950/50">
                              <td colSpan={9} className="p-3 border-b border-slate-200 dark:border-slate-800" id={`tracker-chain-${p.id}`}>
                                {renderChain(p.id)}
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

/**
 * Invoice Tracker (Oct 2026): choose a month, see every project with that month's invoice activity, expand a project
 * for its invoices and their recorded status history. Server-paginated (stable PR-number order); View / Edit / Delete
 * open the existing invoice interfaces. Page access is the Invoices module; project scope is the backend's.
 */
export default function InvoiceTracker() {
  const { user } = useAuth();
  const { page, pageSize, filters, update } = usePageParams(FILTER_KEYS);
  const month = isValidMonth(filters.month) ? filters.month : currentMonthIST();
  const search = filters.search ?? "";
  const filter = parseFilter(filters.filter);
  const projectStatus = filters.projectStatus ?? "";

  const [refreshTick, setRefreshTick] = useState(0);
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

  const fetchPage = useCallback(
    () => fetchTrackerMonth({ month, page, pageSize, search, projectStatus, filter }),
    [month, page, pageSize, search, projectStatus, filter]
  );
  const state = usePagedRequest(fetchPage, `${month}|${page}|${pageSize}|${search}|${projectStatus}|${filter}|${refreshTick}`);
  const data = state.data;

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  const closeAction = useCallback(() => setAction(null), []);

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

  const denied = state.error !== null && /access|permission|forbidden/i.test(state.error);

  return (
    <div className="space-y-3.5 nu-fade-in" data-page="invoice-tracker">
      <style dangerouslySetInnerHTML={{ __html: HERO_CSS }} />
      <div className="trk-hero shadow-lg" data-hero>
        <div className="trk-hero-in">
          <div className="text-left flex-1 min-w-0">
            <div className="text-xs font-bold tracking-wider text-slate-400/90 mb-1.5 flex items-center gap-1.5 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-sm"></span>
              iFluids Engineering · Project Management Office
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-none">Invoice Tracker</h1>
            <p className="text-slate-300/80 text-xs sm:text-sm mt-1.5 max-w-2xl leading-relaxed">
              Monthly invoice activity by invoice date · The summary counts that month only; expand a project for all of its invoices and the recorded history of each status change. Earlier invoices show “No recorded history”.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2.5 shrink-0 z-10">
            <button
              type="button"
              onClick={refresh}
              disabled={state.loading}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold px-4 py-2 rounded-lg backdrop-blur-md transition-all duration-200 text-sm shadow-sm disabled:opacity-60"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            {data && (
              <div className="flex items-center gap-1.5 text-xs text-slate-300/90 font-medium">
                <FolderKanban size={13} className="text-slate-400" />
                Total Projects &nbsp;
                <strong className="text-white font-extrabold">{fmt(data.summary.projectCount)}</strong>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
        <div className="flex flex-wrap items-end gap-3 p-3 bg-slate-50/50 dark:bg-slate-900/40 rounded-2xl">
          <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">
            Month
            <input
              type="month"
              className={`${controlClass} block mt-1`}
              value={month}
              min="2000-01"
              max="2100-12"
              onChange={(e) => isValidMonth(e.target.value) && update({ filters: { month: e.target.value } })}
              aria-label="Invoice month"
            />
          </label>
          <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] flex-1 min-w-[12rem] max-w-md">
            Search
            <input type="search" className={`${controlClass} block mt-1 w-full`} placeholder="PR No., client or project title" value={searchText} onChange={(e) => setSearchText(e.target.value)} aria-label="Search projects" />
          </label>
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

      {data && <TrackerSummaryCards data={data} />}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-col min-h-0">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 shrink-0 bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center rounded-xl">
              <Receipt size={16} className="text-blue-500" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Projects — {formatMonthLabel(month)}</h2>
              <p className="text-xs text-slate-400">The summary counts invoices dated in {formatMonthLabel(month)}; expanding a project lists all of its invoices.</p>
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
              <StateMessage kind="empty" title="No projects match." detail="Change the search or filters, or choose another month." />
            ) : (
              <div className={`overflow-auto nu-scrollbar max-h-[70vh] transition-opacity ${state.loading ? "opacity-50" : ""}`} aria-busy={state.loading}>
                <TrackerTable data={data} month={month} expanded={expanded} onToggle={toggle} renderChain={(projectId) => <InvoiceChain projectId={projectId} month={month} refreshTick={refreshTick} canEdit={canEdit} canDelete={canDelete} onAction={setAction} />} />
              </div>
            )}
            <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 rounded-b-2xl">
              <PaginationBar info={data} disabled={state.loading} noun="projects" onPage={(p) => update({ page: p })} onPageSize={(s) => update({ pageSize: s })} />
            </div>
          </>
        )}
      </div>

      {action && <InvoiceActionHost key={`${action.projectId}:${action.lineId}:${action.mode}`} action={action} onClose={closeAction} onSettled={refresh} />}
    </div>
  );
}

