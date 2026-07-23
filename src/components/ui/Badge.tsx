import type { ReactNode } from "react";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "critical";

const TONES: Record<Tone, string> = {
  neutral: "bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] border border-[var(--nu-border)]",
  accent: "bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] border border-transparent",
  success: "bg-[var(--nu-success-soft)] text-[var(--nu-success)] border border-transparent",
  warning: "bg-[var(--nu-warning-soft)] text-[var(--nu-warning)] border border-transparent",
  danger: "bg-[var(--nu-danger-soft)] text-[var(--nu-danger)] border border-transparent",
  info: "bg-[var(--nu-accent-soft)] text-[var(--nu-info)] border border-transparent",
  // Deliberately a darker, static red (not a --nu-* token) so it reads as
  // more severe than "danger" wherever both appear together (e.g. High vs
  // Critical reminder priority).
  critical: "bg-red-900/10 text-red-900 border border-red-900/20 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800/50",
};

interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export const Badge = ({ tone = "neutral", dot = false, children, className = "" }: BadgeProps) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${TONES[tone]} ${className}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
};
