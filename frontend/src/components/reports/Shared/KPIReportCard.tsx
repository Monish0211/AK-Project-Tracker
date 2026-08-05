import type { ReactNode } from "react";

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: string;
  trendType?: "positive" | "negative" | "neutral";
  icon?: ReactNode;
  tone?: "blue" | "emerald" | "amber" | "rose" | "indigo" | "cyan" | "slate";
  onClick?: () => void;
}

export function KPIReportCard({
  title,
  value,
  subtitle,
  trend,
  trendType = "neutral",
  icon,
  tone = "blue",
  onClick,
}: Props) {
  const TINTS: Record<string, { bg: string; text: string; bar: string }> = {
    blue: {
      bg: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
      text: "text-blue-600 dark:text-blue-400",
      bar: "bg-blue-500",
    },
    emerald: {
      bg: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
      text: "text-emerald-600 dark:text-emerald-400",
      bar: "bg-emerald-500",
    },
    amber: {
      bg: "bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400",
      text: "text-orange-600 dark:text-orange-400",
      bar: "bg-orange-500",
    },
    rose: {
      bg: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
      text: "text-red-600 dark:text-red-400",
      bar: "bg-red-500",
    },
    indigo: {
      bg: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400",
      text: "text-indigo-600 dark:text-indigo-400",
      bar: "bg-indigo-500",
    },
    cyan: {
      bg: "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400",
      text: "text-teal-600 dark:text-teal-400",
      bar: "bg-teal-500",
    },
    slate: {
      bg: "bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400",
      text: "text-slate-600 dark:text-slate-400",
      bar: "bg-slate-500",
    },
  };

  const t = TINTS[tone] || TINTS.blue;

  return (
    <div
      onClick={onClick}
      className={`relative bg-[var(--nu-surface)] border border-[var(--nu-border-strong)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] hover:shadow-[var(--nu-shadow-md)] transition-all duration-150 px-4 pt-3.5 pb-3 flex flex-col justify-between min-w-0 h-[130px] ${
        onClick ? "cursor-pointer hover:border-[var(--nu-accent)]" : ""
      }`}
    >
      {/* Top accent bar matching Dashboard StatTile */}
      <span className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-[var(--nu-radius-lg)] ${t.bar}`} />

      <div className="flex items-center justify-between gap-2 shrink-0">
        <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-[var(--nu-text-muted)] truncate block">
          {title}
        </span>

        {icon && (
          <div className={`w-8 h-8 rounded-[var(--nu-radius-md)] flex items-center justify-center shrink-0 ${t.bg}`}>
            {icon}
          </div>
        )}
      </div>

      <div className="my-auto min-w-0">
        <p className="text-xl font-bold text-[var(--nu-text)] tracking-tight font-mono truncate">
          {value}
        </p>
      </div>

      {(subtitle || trend) && (
        <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[var(--nu-border)]/40 shrink-0">
          {subtitle && <span className="text-[var(--nu-text-muted)] truncate">{subtitle}</span>}
          {trend && (
            <span
              className={`font-bold px-1.5 py-0.5 rounded text-[9.5px] ${
                trendType === "positive"
                  ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                  : trendType === "negative"
                  ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {trend}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
