import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "hero" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  // Solid accent blue — the same vivid --nu-accent used by the step-wizard's
  // active tab, badges, and links throughout the app. Safe on any background
  // (white cards, modals, drawers), unlike "hero" below: a translucent
  // white fill only reads correctly over a dark/colored surface.
  primary: "bg-[var(--nu-accent)] hover:bg-[var(--nu-accent-strong)] text-white border border-transparent shadow-xs",
  // Premium glass treatment, modeled directly on the "Export Archive"
  // button in the Completed Projects header (translucent white sheen,
  // white/20 border, backdrop blur, Tailwind's literal shadow-sm). ONLY
  // for primary actions that sit directly on a dark gradient hero/header
  // banner (Add Project, Add Customer, Add Employee, Upload Timesheet) —
  // it needs that dark surface to read correctly; never use it on a white
  // card or modal. See `.nu-btn-primary` in the page-level theme CSS files
  // (and the global fallback in index.css) for the exact reused values —
  // a direct copy of that button's own classes (bg-white/10
  // hover:bg-white/20 border-white/20 backdrop-blur-md shadow-sm), not an
  // approximation.
  hero: "nu-btn-primary",
  secondary:
    "bg-[var(--nu-surface-alt)] text-[var(--nu-text)] border border-[var(--nu-border)] hover:border-[var(--nu-border-strong)] hover:bg-[var(--nu-surface)] shadow-xs",
  outline: "bg-transparent text-[var(--nu-accent)] border border-[var(--nu-accent)] hover:bg-[var(--nu-accent-soft)] shadow-xs",
  ghost: "bg-transparent text-[var(--nu-text-secondary)] border border-transparent hover:bg-[var(--nu-surface-alt)]",
  danger: "bg-[var(--nu-danger)] text-white hover:bg-[var(--nu-danger-strong)] border border-transparent shadow-xs",
};

const SIZES: Record<Size, string> = {
  sm: "text-[12px] px-2.5 py-1.5 gap-1.5",
  md: "text-[13px] px-3.5 py-2 gap-2",
  // Square, icon-only action button (replaces the many hand-rolled
  // `p-1.5 rounded-lg hover:bg-{color}-100 text-{color}-600` patterns).
  icon: "p-1.5",
};

export const Button = ({ variant = "secondary", size = "md", icon, children, className = "", ...rest }: ButtonProps) => {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-[var(--nu-radius-md)] font-medium transition-all duration-150 whitespace-nowrap ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
};
