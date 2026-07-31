import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}

export const EmptyState = ({ icon, title, description, action }: EmptyStateProps) => {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center py-6 px-4">
      <div className="w-11 h-11 rounded-[var(--nu-radius-md)] bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] text-[var(--nu-text-muted)] flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="text-[12.5px] font-semibold text-[var(--nu-text-secondary)]">{title}</p>
      <p className="text-[11.5px] text-[var(--nu-text-muted)] mt-1 max-w-[240px] leading-snug">{description}</p>
      {action && <div className="mt-3.5">{action}</div>}
    </div>
  );
};
