import type { ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Trend {
  direction: "up" | "down";
  label: string;
}

export type StatTileTint = "accent" | "success" | "warning" | "danger" | "info" | "purple" | "indigo";

interface StatTileProps {
  label: string;
  value: string;
  icon: ReactNode;
  tint?: StatTileTint;
  /** Reserved for future growth-% data. Omit until real trend calculations exist. */
  trend?: Trend;
  /** Visual emphasis only — does not affect the underlying value. */
  emphasis?: "primary" | "secondary";
}

const TINTS: Record<StatTileTint, string> = {
  accent: "bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400",
  success: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
  warning: "bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400",
  danger: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
  info: "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400",
  purple: "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400",
  indigo: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400",
};

const ACCENT_BAR: Record<StatTileTint, string> = {
  accent: "bg-teal-500",
  success: "bg-emerald-500",
  warning: "bg-orange-500",
  danger: "bg-red-500",
  info: "bg-blue-500",
  purple: "bg-purple-500",
  indigo: "bg-indigo-500",
};

export const StatTile = ({ label, value, icon, tint = "accent", trend }: StatTileProps) => {
  const isPrimary = true; // Make all tiles primary emphasis for equal uniform layout

  return (
    <div
      className={`relative bg-[var(--nu-surface)] border rounded-[var(--nu-radius-lg)] transition-shadow duration-150 hover:shadow-[var(--nu-shadow-md)] px-4 pt-4 pb-3.5 flex flex-col justify-between gap-2.5 min-w-0 h-full ${
        isPrimary
          ? "border-[var(--nu-border-strong)] shadow-[var(--nu-shadow-md)] h-[150px]"
          : "border-[var(--nu-border)] shadow-[var(--nu-shadow-sm)] h-[130px]"
      }`}
    >
      {isPrimary && <span className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-[var(--nu-radius-lg)] ${ACCENT_BAR[tint]}`} />}

      <div className="flex items-center justify-between shrink-0">
        <div className={`rounded-[var(--nu-radius-md)] flex items-center justify-center shrink-0 ${TINTS[tint]} ${isPrimary ? "w-9 h-9" : "w-7 h-7"}`}>
          {icon}
        </div>
        <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--nu-success)] bg-[var(--nu-success-soft)] px-1.5 py-0.5 rounded-full shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          Live
        </span>
      </div>

      <div className="min-w-0 flex-1 flex flex-col justify-end">
        <p className="text-[12px] font-medium text-[var(--nu-text-muted)] uppercase tracking-wide truncate mb-0.5">{label}</p>
        <p
          className={`font-bold text-[var(--nu-text)] leading-none whitespace-nowrap overflow-visible ${isPrimary ? "text-[22px] xl:text-[19px] 2xl:text-[24px]" : "text-[18px]"}`}
          title={value}
        >
          {value}
        </p>
      </div>

      <div className="text-[11px] leading-snug shrink-0">
        {trend ? (
          <span className={`inline-flex items-center gap-1 font-semibold ${trend.direction === "up" ? "text-[var(--nu-success)]" : "text-[var(--nu-danger)]"}`}>
            {trend.direction === "up" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trend.label}
          </span>
        ) : (
          <span className="text-[var(--nu-text-muted)]">Updated from Projects</span>
        )}
      </div>
    </div>
  );
};
