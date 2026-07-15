import type { ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Trend {
  direction: "up" | "down";
  label: string;
}

interface StatTileProps {
  label: string;
  value: string;
  icon: ReactNode;
  tint?: "accent" | "success" | "warning" | "danger" | "info";
  /** Reserved for future growth-% data. Omit until real trend calculations exist. */
  trend?: Trend;
  /** Visual emphasis only — does not affect the underlying value. */
  emphasis?: "primary" | "secondary";
}

const TINTS: Record<NonNullable<StatTileProps["tint"]>, string> = {
  accent: "bg-[var(--nu-accent-soft)] text-[var(--nu-accent)]",
  success: "bg-[var(--nu-success-soft)] text-[var(--nu-success)]",
  warning: "bg-[var(--nu-warning-soft)] text-[var(--nu-warning)]",
  danger: "bg-[var(--nu-danger-soft)] text-[var(--nu-danger)]",
  info: "bg-[var(--nu-accent-soft)] text-[var(--nu-info)]",
};

const ACCENT_BAR: Record<NonNullable<StatTileProps["tint"]>, string> = {
  accent: "bg-[var(--nu-accent)]",
  success: "bg-[var(--nu-success)]",
  warning: "bg-[var(--nu-warning)]",
  danger: "bg-[var(--nu-danger)]",
  info: "bg-[var(--nu-info)]",
};

export const StatTile = ({ label, value, icon, tint = "accent", trend, emphasis = "secondary" }: StatTileProps) => {
  const isPrimary = emphasis === "primary";

  return (
    <div
      className={`relative bg-[var(--nu-surface)] border rounded-[var(--nu-radius-lg)] transition-shadow duration-150 hover:shadow-[var(--nu-shadow-md)] px-3.5 pt-3.5 pb-3 flex flex-col justify-between gap-2.5 min-w-0 h-full ${
        isPrimary
          ? "border-[var(--nu-border-strong)] shadow-[var(--nu-shadow-md)] min-h-[148px]"
          : "border-[var(--nu-border)] shadow-[var(--nu-shadow-sm)] min-h-[122px]"
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

      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-[var(--nu-text-muted)] uppercase tracking-wide truncate">{label}</p>
        <p
          className={`font-bold text-[var(--nu-text)] leading-tight mt-1 truncate ${isPrimary ? "text-[28px]" : "text-[21px]"}`}
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
