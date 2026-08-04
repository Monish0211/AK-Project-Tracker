import { Activity } from "lucide-react";
import type { SystemActivityItem } from "../../../../types/AuditLog";

interface Props {
  activities: SystemActivityItem[];
}

export function SystemTimelineCard({ activities }: Props) {
  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)] space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2.5">
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-blue-500" />
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            System Activity Timeline (Today)
          </h4>
        </div>
        <span className="text-[11px] font-bold text-slate-500">Live Timeline</span>
      </div>

      <div className="relative pl-5 space-y-4 border-l-2 border-slate-200 dark:border-slate-800 ml-2 pt-1.5 pb-1">
        {activities.map((item) => (
          <div key={item.id} className="relative group">
            {/* Timeline Dot */}
            <div
              className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${
                item.badgeColor || "bg-[var(--nu-accent)]"
              } shadow-xs`}
            />

            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold font-mono text-cyan-600 dark:text-cyan-400">
                {item.time}
              </span>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                {item.module}
              </span>
            </div>

            <h5 className="text-xs font-extrabold text-[var(--nu-text)] mt-0.5 tracking-tight">
              {item.title}
            </h5>
            <p className="text-[11.5px] text-[var(--nu-text-muted)] leading-relaxed mt-0.5">
              {item.detail}
            </p>
            <p className="text-[10.5px] font-semibold text-slate-500 mt-1">
              By: <span className="text-[var(--nu-text)] font-bold">{item.user}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
