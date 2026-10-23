import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronRight, IndianRupee, ListTree, RefreshCw, X } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Portal } from "../../components/ui/Portal";
import { ALL_MONTHS, type RaisedBreakdownProject } from "../../services/invoiceTrackerService";
import { formatIndianCurrency } from "../../utils/formatCurrency";
import { StatCard } from "./StatCard";
import { filterNoteOf, isProjectOpen, withEveryProject, withProjectToggled, type BreakdownData, type BreakdownQuery, type ExpansionOverrides } from "./raisedBreakdownLogic";
import { formatDateOnly, formatMonthLabel, plural, SUMMARY_STATUS_LABEL, SUMMARY_STATUS_TONE } from "./trackerFormat";
import { useRaisedBreakdown } from "./useRaisedBreakdown";

/**
 * "Raised invoice amount" — the card AND the breakdown behind it.
 *
 * The breakdown shows nothing the server did not send: every figure (the total, each project's total and count, each invoice amount) comes from
 * GET /invoice-tracker/raised-breakdown, which is built from the SAME selection as the card's total (see selectMonth in the backend service).
 * This file adds up no amounts and keeps no financial data of its own: it only lays the server's answer out.
 */

// ── the panel (pure: everything it shows is a prop) ──────────────────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="px-5 py-3 space-y-3 motion-reduce:animate-none animate-pulse" role="status" aria-live="polite" data-bd-loading>
      <span className="sr-only">Loading the invoices behind this total…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3" aria-hidden="true">
          <span className="w-3.5 h-3.5 rounded bg-slate-200 dark:bg-slate-800" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-3 w-24 rounded bg-slate-200 dark:bg-slate-800" />
            <span className="block h-2.5 w-44 max-w-full rounded bg-slate-100 dark:bg-slate-800/60" />
          </span>
          <span className="space-y-1.5 text-right">
            <span className="block h-3 w-20 rounded bg-slate-200 dark:bg-slate-800" />
            <span className="block h-2.5 w-12 ml-auto rounded bg-slate-100 dark:bg-slate-800/60" />
          </span>
        </div>
      ))}
    </div>
  );
}

function InvoiceRows({ project }: { project: RaisedBreakdownProject }) {
  return (
    <ul className="rounded-lg border border-[var(--nu-border)] bg-[var(--nu-surface-alt)]/40 px-3 divide-y divide-[var(--nu-border)]" aria-label={`Invoices of ${project.prNo}`}>
      {project.invoices.map((inv) => (
        <li key={inv.key} className="py-2 flex items-start gap-3" data-bd-invoice={inv.key}>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] font-semibold text-[var(--nu-text)] [overflow-wrap:anywhere]" title={inv.invoiceNo} data-bd-invoice-no>
              {inv.invoiceNo}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-[var(--nu-text-muted)]">
              <span className="whitespace-nowrap" data-bd-date>
                {inv.invoiceDate ? formatDateOnly(inv.invoiceDate) : "No usable invoice date"}
              </span>
              <Badge tone={SUMMARY_STATUS_TONE[inv.status]} dot className="text-[10.5px]">
                <span data-bd-status={inv.status}>{SUMMARY_STATUS_LABEL[inv.status]}</span>
              </Badge>
              {inv.cancelledLineCount > 0 && <span data-bd-cancelled-note>{plural(inv.cancelledLineCount, "cancelled line")} not counted</span>}
            </span>
          </span>
          <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-[var(--nu-text)]" data-bd-amount>
            {formatIndianCurrency(inv.amountINR)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ProjectRow({ project, open, onToggle }: { project: RaisedBreakdownProject; open: boolean; onToggle: () => void }) {
  const listId = `rb-${project.projectId}`;
  return (
    <li className="border-b last:border-b-0 border-[var(--nu-border)]" data-bd-project={project.prNo}>
      <div role="heading" aria-level={3} className="m-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={listId}
          className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-[var(--nu-surface-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--nu-accent)]/50"
        >
          <ChevronRight size={15} aria-hidden="true" className={`shrink-0 text-[var(--nu-text-muted)] transition-transform duration-150 motion-reduce:transition-none ${open ? "rotate-90" : ""}`} />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold text-[var(--nu-text)] truncate" title={project.prNo} data-bd-pr>
              {project.prNo}
            </span>
            <span className="block text-[11.5px] text-[var(--nu-text-muted)] truncate" title={`${project.client} · ${project.projectTitle}`}>
              {project.client} · {project.projectTitle}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block text-[13px] font-extrabold tabular-nums text-[var(--nu-text)]" data-bd-project-total>
              {formatIndianCurrency(project.totalINR)}
            </span>
            <span className="block text-[11px] text-[var(--nu-text-muted)]" data-bd-project-count>
              {plural(project.invoiceCount, "invoice")}
            </span>
          </span>
        </button>
      </div>
      {open && (
        <div id={listId} className="pl-[2.85rem] pr-5 pb-3">
          <InvoiceRows project={project} />
        </div>
      )}
    </li>
  );
}

export interface RaisedBreakdownPanelProps {
  titleId: string;
  monthLabel: string;
  /** "Filtered by …" text, or "" when the whole month is shown. */
  filterNote: string;
  /** The card's own figure — shown at once, and compared with the loaded total so a stale card is noticed. */
  cardTotalINR: number;
  isAllMonths: boolean;
  data: BreakdownData;
  isOpen: (project: RaisedBreakdownProject) => boolean;
  allOpen: boolean;
  onToggle: (projectId: string) => void;
  onToggleAll: () => void;
  onClose: () => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onRefresh?: (() => void) | undefined;
}

/** The dialog's content: header (title, period, total, counts) → by-project list → each project's invoices. */
export function RaisedBreakdownPanel({ titleId, monthLabel, filterNote, cardTotalINR, isAllMonths, data, isOpen, allOpen, onToggle, onToggleAll, onClose, onRetry, onLoadMore, onRefresh }: RaisedBreakdownPanelProps) {
  const ready = data.status === "ready";
  const total = ready ? data.totalINR : cardTotalINR;
  const stale = ready && data.totalINR !== cardTotalINR;
  return (
    <>
      <header className="px-5 pt-4 pb-3 border-b border-[var(--nu-border)]">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 shrink-0 rounded-[var(--nu-radius-md)] flex items-center justify-center bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400" aria-hidden="true">
            <IndianRupee size={16} />
          </span>
          <div className="min-w-0 flex-1">
            {/* role="heading", not <h2>: the app has a global `html.dark h2 { font-size: 22px }` that would resize the title in dark mode only. */}
            <div id={titleId} role="heading" aria-level={2} className="text-[15px] font-semibold text-[var(--nu-text)] leading-snug">
              Raised Invoice Amount Breakdown
            </div>
            <p className="text-[12px] text-[var(--nu-text-secondary)] mt-0.5" data-bd-month>
              {monthLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            aria-label="Close breakdown"
            className="-mr-1.5 -mt-1 p-2 rounded-lg text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nu-accent)]/50"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="mt-3 flex items-baseline flex-wrap gap-x-3 gap-y-1">
          <span className="text-[26px] leading-none font-black tabular-nums text-emerald-600 dark:text-emerald-400" data-bd-total>
            {formatIndianCurrency(total)}
          </span>
          <span className="text-[12px] text-[var(--nu-text-secondary)]" data-bd-counts>
            {ready ? `${plural(data.invoiceCount, "invoice")} · ${plural(data.projectCount, "project")}` : data.status === "error" ? "Could not load the invoices" : "Loading invoices…"}
          </span>
        </div>
        {filterNote && (
          <p className="mt-1.5 text-[11px] text-[var(--nu-text-muted)]" data-bd-filters>
            {filterNote}
          </p>
        )}
        {stale && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-[11.5px] text-amber-800 dark:text-amber-300" role="status" data-bd-stale>
            <AlertTriangle size={13} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1">The invoices changed since this page loaded — the card shows {formatIndianCurrency(cardTotalINR)}.</span>
            {onRefresh && (
              <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1 font-semibold text-[var(--nu-accent)] hover:underline">
                <RefreshCw size={12} aria-hidden="true" /> Refresh
              </button>
            )}
          </div>
        )}
      </header>

      {ready && data.projects.length > 0 && (
        <div className="px-5 py-2 flex items-center justify-between gap-3 border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)]/50">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">By project</span>
          <button type="button" onClick={onToggleAll} className="text-[11.5px] font-semibold text-[var(--nu-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nu-accent)]/50 rounded" data-bd-toggle-all>
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-bd-body aria-busy={data.status === "loading"}>
        {data.status === "loading" && <Skeleton />}
        {data.status === "error" && (
          <div className="px-5 py-8 text-center" role="alert" data-bd-error>
            <AlertTriangle size={20} aria-hidden="true" className="mx-auto text-[var(--nu-danger)]" />
            <p className="mt-2 text-[13px] font-semibold text-[var(--nu-text)]">Couldn’t load the breakdown</p>
            <p className="mt-1 text-[12px] text-[var(--nu-text-muted)]">{data.error}</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
        {ready && data.projects.length === 0 && (
          <div className="px-5 py-10 text-center" data-bd-empty>
            <ListTree size={22} aria-hidden="true" className="mx-auto text-[var(--nu-text-muted)]" />
            <p className="mt-2 text-[13px] font-semibold text-[var(--nu-text)]">No raised invoices</p>
            <p className="mt-1 text-[12px] text-[var(--nu-text-muted)] max-w-sm mx-auto">
              No Raised, Partially Paid or Paid invoice is dated {isAllMonths ? "in any month" : `in ${monthLabel}`}
              {filterNote ? " for these filters" : ""}. Drafts, cancelled invoices and invoice requests are not included.
            </p>
          </div>
        )}
        {ready && data.projects.length > 0 && (
          <ul aria-label="Projects with raised invoices">
            {data.projects.map((p) => (
              <ProjectRow key={p.projectId} project={p} open={isOpen(p)} onToggle={() => onToggle(p.projectId)} />
            ))}
          </ul>
        )}
        {ready && data.hasMore && (
          <div className="px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--nu-border)]" data-bd-more>
            <Button variant="secondary" size="sm" onClick={onLoadMore} disabled={data.loadingMore}>
              {data.loadingMore ? "Loading…" : "Show more projects"}
            </Button>
            <span className="text-[11.5px] text-[var(--nu-text-muted)]">
              {data.projects.length} of {data.projectCount} projects shown
            </span>
            {data.moreError && (
              <span className="text-[11.5px] text-[var(--nu-danger)]" role="alert">
                {data.moreError}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── the dialog shell: portal, backdrop, Esc, focus in / trapped / restored, no background scroll ─────────────────────────────────

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal that is a centred panel on laptops and a bottom sheet on phones (same overlay conventions as ConfirmDialog: portal-mounted,
 * the --nu-* surface tokens, Esc and a backdrop click close it). Focus moves in, stays inside while Tab-ing, and returns to whatever opened it.
 */
export function RaisedBreakdownDialog({ open, titleId, onClose, children }: { open: boolean; titleId: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    const scrollLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // One frame later, not synchronously: the shared Portal can detach and re-attach its container right after mounting (React StrictMode does
    // exactly that in development), and a focus set before that is lost with the node it was on.
    const focusFrame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = scrollLock;
      openerRef.current?.focus?.();
      openerRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-[9600] flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={onClose} data-bd-backdrop>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-t-[var(--nu-radius-lg)] sm:rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] w-full sm:max-w-[40rem] max-h-[88dvh] sm:max-h-[85vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          data-bd-dialog
        >
          {children}
        </div>
      </div>
    </Portal>
  );
}

// ── the card ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The "Raised invoice amount" card. Same look as its neighbours, plus a quiet "View breakdown" line and chevron; one click opens the breakdown
 * of exactly this figure (same month, same filters). `refreshKey` changes whenever the page reloads its data, so a reopened breakdown is current.
 */
export function RaisedAmountCard({ value, totalINR, hint, query, refreshKey, onRefresh }: { value: string; totalINR: number; hint: string; query: BreakdownQuery; refreshKey: number; onRefresh?: (() => void) | undefined }) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [overrides, setOverrides] = useState<ExpansionOverrides>(() => new Map());
  const { data, loadMore, retry } = useRaisedBreakdown(query, open, refreshKey);
  const onlyOne = data.status === "ready" && data.projectCount === 1;
  const isOpen = (p: RaisedBreakdownProject): boolean => isProjectOpen(overrides, p.projectId, onlyOne);
  const allOpen = data.projects.length > 0 && data.projects.every(isOpen);
  const close = useCallback(() => {
    setOpen(false);
    setOverrides(new Map()); // the next opening starts collapsed again
  }, []);

  return (
    <>
      <StatCard label="Raised invoice amount" value={value} accent="emerald" icon={IndianRupee} hint={hint} onActivate={() => setOpen(true)} actionLabel="View breakdown" expanded={open} />
      <RaisedBreakdownDialog open={open} titleId={titleId} onClose={close}>
        <RaisedBreakdownPanel
          titleId={titleId}
          monthLabel={formatMonthLabel(query.month)}
          filterNote={filterNoteOf(query)}
          cardTotalINR={totalINR}
          isAllMonths={query.month === ALL_MONTHS}
          data={data}
          isOpen={isOpen}
          allOpen={allOpen}
          onToggle={(id) => {
            const current = data.projects.find((p) => p.projectId === id);
            setOverrides((prev) => withProjectToggled(prev, id, current ? isOpen(current) : false));
          }}
          onToggleAll={() => setOverrides(withEveryProject(data.projects, !allOpen))}
          onClose={close}
          onRetry={retry}
          onLoadMore={loadMore}
          onRefresh={onRefresh}
        />
      </RaisedBreakdownDialog>
    </>
  );
}
