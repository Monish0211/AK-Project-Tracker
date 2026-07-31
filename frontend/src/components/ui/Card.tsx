import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  elevated?: boolean;
}

export const Card = ({ children, className = "", padded = true, elevated = false }: CardProps) => {
  return (
    <div
      className={`bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] transition-shadow duration-150 hover:shadow-[var(--nu-shadow-md)] ${
        elevated ? "shadow-[var(--nu-shadow-md)]" : "shadow-[var(--nu-shadow-sm)]"
      } ${padded ? "p-3.5" : ""} ${className}`}
    >
      {children}
    </div>
  );
};

export type CardTint = "accent" | "success" | "warning" | "danger" | "info" | "neutral";

interface CardHeaderProps {
  icon?: ReactNode;
  iconTint?: CardTint;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

const TINTS: Record<CardTint, string> = {
  accent: "bg-[var(--nu-accent-soft)] text-[var(--nu-accent)]",
  success: "bg-[var(--nu-success-soft)] text-[var(--nu-success)]",
  warning: "bg-[var(--nu-warning-soft)] text-[var(--nu-warning)]",
  danger: "bg-[var(--nu-danger-soft)] text-[var(--nu-danger)]",
  info: "bg-[var(--nu-accent-soft)] text-[var(--nu-info)]",
  neutral: "bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)] border border-[var(--nu-border)]",
};

export const CardHeader = ({ icon, iconTint = "accent", title, subtitle, action }: CardHeaderProps) => {
  return (
    <div className="flex items-center justify-between px-3.5 py-3 border-b border-[var(--nu-border)]">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <div className={`w-[30px] h-[30px] rounded-[var(--nu-radius-md)] flex items-center justify-center shrink-0 ${TINTS[iconTint]}`}>
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold text-[var(--nu-text)] leading-tight truncate">{title}</h2>
          {subtitle && <p className="text-[12px] text-[var(--nu-text-muted)] leading-tight mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
};

export const CardBody = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`px-3.5 py-3 ${className}`}>{children}</div>
);

export const CardFooter = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div className={`px-3.5 py-2 border-t border-[var(--nu-border)] ${className}`}>{children}</div>
);
