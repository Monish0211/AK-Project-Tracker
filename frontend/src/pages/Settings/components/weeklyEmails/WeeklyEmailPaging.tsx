import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from "lucide-react";
import { Button } from "../../../../components/ui/Button";
import { PAGE_SIZE_OPTIONS, type PageInfo } from "../../../../services/weeklyEmailService";
import { WEEKLY_EMAILS_SETTINGS_PATH } from "./weeklyEmailNotifications";

/**
 * Shared pieces of the Weekly Emails Preview Report and View All Runs pages
 * (Oct 2026): page frame, state messages and the pagination bar (the hooks
 * are in useWeeklyEmailPaging.ts).
 */

export function PaginationBar({ info, disabled, onPage, onPageSize, noun }: { info: PageInfo; disabled?: boolean; onPage: (p: number) => void; onPageSize: (s: number) => void; noun: string }) {
  const { page, pageSize, total, totalPages } = info;
  const from = total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);
  const fmt = (n: number) => n.toLocaleString("en-IN");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 border-t border-[var(--nu-border)] text-[12px] text-[var(--nu-text-secondary)]" data-pagination>
      <span data-range>
        {total === 0 ? `No ${noun}` : `Showing ${fmt(from)}–${fmt(to)} of ${fmt(total)} ${noun}`}
      </span>
      <label className="flex items-center gap-1.5">
        Rows per page
        <select
          className="h-8 px-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12px] text-[var(--nu-text)]"
          value={pageSize}
          disabled={disabled}
          onChange={(e) => onPageSize(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {PAGE_SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <span className="flex-1" />
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="First page" disabled={disabled || page <= 1} onClick={() => onPage(1)}>
          <ChevronsLeft size={15} />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Previous page" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={15} />
        </Button>
        <span className="px-2 whitespace-nowrap" data-page-of>
          Page {fmt(Math.min(page, totalPages))} of {fmt(totalPages)}
        </span>
        <Button variant="ghost" size="icon" aria-label="Next page" disabled={disabled || page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight size={15} />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Last page" disabled={disabled || page >= totalPages} onClick={() => onPage(totalPages)}>
          <ChevronsRight size={15} />
        </Button>
      </div>
    </div>
  );
}

export function BackToWeeklyEmails() {
  return (
    <Link to={WEEKLY_EMAILS_SETTINGS_PATH} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--nu-accent)] hover:underline" data-link="back">
      <ArrowLeft size={14} />
      Back to Weekly Emails
    </Link>
  );
}

/** Page frame: back link, title, description, optional actions. */
export function WeeklyEmailPageShell({ title, eyebrow, description, actions, children }: { title: string; eyebrow: string; description?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="settings-shell -m-6 p-4 space-y-3.5 nu-fade-in">
      <BackToWeeklyEmails />
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">{eyebrow}</p>
          <h1 className="text-[18px] font-bold text-[var(--nu-text)] leading-tight">{title}</h1>
          {description && <div className="mt-1 text-[12px] text-[var(--nu-text-secondary)] max-w-4xl">{description}</div>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function StateMessage({ kind, title, detail, onRetry }: { kind: "loading" | "error" | "empty" | "denied"; title: string; detail?: ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-2 text-center px-4" data-state={kind}>
      {kind === "loading" ? <Loader2 size={20} className="animate-spin text-[var(--nu-text-muted)]" /> : kind === "empty" ? null : <AlertTriangle size={20} className="text-[var(--nu-danger)]" />}
      <p className="text-[12.5px] font-semibold text-[var(--nu-text)]">{title}</p>
      {detail && <p className="text-[11.5px] text-[var(--nu-text-muted)] max-w-md">{detail}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
