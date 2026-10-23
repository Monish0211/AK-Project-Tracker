import { ChevronRight, type LucideIcon } from "lucide-react";

export type StatAccent = "blue" | "emerald" | "amber" | "indigo" | "rose" | "slate";

// Same chip + icon pairing and coloured left edge the Project Repository summary cards use (light and dark variants together).
const ACCENT: Record<StatAccent, { chip: string; icon: string; value: string; edge: string }> = {
  blue: { chip: "bg-blue-50 dark:bg-blue-950/20", icon: "text-blue-500", value: "text-slate-800 dark:text-slate-100", edge: "#3B82F6" },
  emerald: { chip: "bg-emerald-50 dark:bg-emerald-950/20", icon: "text-emerald-500", value: "text-emerald-600 dark:text-emerald-400", edge: "#22C55E" },
  amber: { chip: "bg-amber-50 dark:bg-amber-950/20", icon: "text-amber-500", value: "text-slate-800 dark:text-slate-100", edge: "#F97316" },
  indigo: { chip: "bg-indigo-50 dark:bg-indigo-950/20", icon: "text-indigo-500", value: "text-slate-800 dark:text-slate-100", edge: "#818CF8" },
  rose: { chip: "bg-rose-50 dark:bg-rose-950/20", icon: "text-rose-500", value: "text-slate-800 dark:text-slate-100", edge: "#EF4444" },
  slate: { chip: "bg-slate-100 dark:bg-slate-800/60", icon: "text-slate-500", value: "text-slate-800 dark:text-slate-100", edge: "#64748B" },
};

/**
 * One summary card. `muted` renders a "Not recorded" value in a quieter style so it is never mistaken for a figure.
 * `onActivate` makes the whole card ONE button (same look, plus a quiet "action" line and chevron) that opens an explanation of its figure;
 * `expanded` mirrors whether that explanation is open. Without it the card is the plain, non-interactive card it always was.
 */
export function StatCard({
  label,
  value,
  hint,
  accent,
  icon: Icon,
  warn,
  muted,
  onActivate,
  actionLabel,
  expanded,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: StatAccent;
  icon: LucideIcon;
  warn?: boolean;
  muted?: boolean;
  onActivate?: () => void;
  actionLabel?: string;
  expanded?: boolean;
}) {
  const c = ACCENT[accent];
  const card = "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative overflow-hidden rounded-xl p-4 flex items-center gap-3 shadow-sm min-w-0";
  // Spans (display:block) rather than divs so the same content is valid inside a <button>.
  const body = (
    <>
      <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: c.edge }} data-edge />
      <span className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${c.chip}`}>
        <Icon size={15} className={c.icon} />
      </span>
      <span className="block min-w-0 flex-1">
        <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase leading-tight">{label}</span>
        <span className={muted ? "block text-sm italic font-semibold leading-none mt-1 text-slate-400 dark:text-slate-500" : `block text-lg font-black leading-none mt-1 ${warn ? "text-amber-600 dark:text-amber-400" : c.value}`} data-value>
          {value}
        </span>
        {hint && <span className="block text-[10.5px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">{hint}</span>}
        {onActivate && actionLabel && (
          <span className="block text-[10.5px] font-semibold text-[var(--nu-accent)] mt-1 leading-snug" data-card-action>
            {actionLabel}
          </span>
        )}
      </span>
      {onActivate && <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-slate-300 dark:text-slate-600 transition-colors group-hover:text-[var(--nu-accent)] group-focus-visible:text-[var(--nu-accent)]" data-card-chevron />}
    </>
  );
  if (!onActivate) {
    return (
      <div className={card} data-stat={label}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-haspopup="dialog"
      aria-expanded={expanded ?? false}
      className={`${card} group w-full text-left cursor-pointer transition-[border-color,box-shadow] duration-150 hover:border-[var(--nu-accent)]/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nu-accent)]/40 focus-visible:border-[var(--nu-accent)]`}
      data-stat={label}
      data-actionable="true"
    >
      {body}
    </button>
  );
}
