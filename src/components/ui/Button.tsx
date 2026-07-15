import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[var(--nu-accent)] text-white hover:bg-[var(--nu-accent-strong)] border border-transparent",
  secondary:
    "bg-[var(--nu-surface-alt)] text-[var(--nu-text)] border border-[var(--nu-border)] hover:border-[var(--nu-border-strong)]",
  outline: "bg-transparent text-[var(--nu-accent)] border border-[var(--nu-accent)] hover:bg-[var(--nu-accent-soft)]",
  ghost: "bg-transparent text-[var(--nu-text-secondary)] border border-transparent hover:bg-[var(--nu-surface-alt)]",
};

const SIZES: Record<Size, string> = {
  sm: "text-[12px] px-2.5 py-1.5 gap-1.5",
  md: "text-[13px] px-3.5 py-2 gap-2",
};

export const Button = ({ variant = "secondary", size = "md", icon, children, className = "", ...rest }: ButtonProps) => {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-[var(--nu-radius-md)] font-medium transition-colors duration-150 whitespace-nowrap ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
};
