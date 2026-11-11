import { formatDateOnly } from "../../utils/dateOnly";

/**
 * Project Timeline of a submitted PR Request: the Project Start Date and Project End Date the requester entered, written the way the PMO screens write a date ("11 Nov 2026").
 * The stored values are ISO timestamps of a date at UTC midnight; `formatDateOnly` reads the date part without any timezone arithmetic, so the day never moves, and a date that was
 * not entered shows "—" (it is never replaced by today's date or by the approval date).
 */
export function ProjectTimeline({ start, end }: { start?: string | null; end?: string | null }) {
  return (
    <div className="pt-3 border-t border-[var(--nu-border)]" data-testid="pr-project-timeline">
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] mb-2">Project Timeline</p>
      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">Project Start Date</p>
          <p className="font-semibold text-[var(--nu-text)] mt-0.5" data-testid="pr-project-start-date">{formatDateOnly(start)}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">Project End Date</p>
          <p className="font-semibold text-[var(--nu-text)] mt-0.5" data-testid="pr-project-end-date">{formatDateOnly(end)}</p>
        </div>
      </div>
    </div>
  );
}
