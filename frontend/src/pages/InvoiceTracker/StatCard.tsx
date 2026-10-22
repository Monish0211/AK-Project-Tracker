import type { LucideIcon } from "lucide-react";

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

/** One summary card. `muted` renders a "Not recorded" value in a quieter style so it is never mistaken for a figure. */
export function StatCard({ label, value, hint, accent, icon: Icon, warn, muted }: { label: string; value: string; hint?: string; accent: StatAccent; icon: LucideIcon; warn?: boolean; muted?: boolean }) {
  const c = ACCENT[accent];
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative overflow-hidden rounded-xl p-4 flex items-center gap-3 shadow-sm min-w-0" data-stat={label}>
      <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: c.edge }} data-edge />
      <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${c.chip}`}>
        <Icon size={15} className={c.icon} />
      </div>
      <div className="min-w-0">
        <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase leading-tight">{label}</div>
        <div className={muted ? "text-sm italic font-semibold leading-none mt-1 text-slate-400 dark:text-slate-500" : `text-lg font-black leading-none mt-1 ${warn ? "text-amber-600 dark:text-amber-400" : c.value}`} data-value>
          {value}
        </div>
        {hint && <div className="text-[10.5px] text-slate-400 dark:text-slate-500 mt-1 leading-snug">{hint}</div>}
      </div>
    </div>
  );
}
