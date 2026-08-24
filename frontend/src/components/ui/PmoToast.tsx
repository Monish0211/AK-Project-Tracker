import { CheckCircle2, CircleX, TriangleAlert, Info, X } from "lucide-react";

export type PmoToastType = "success" | "error" | "warning" | "info";

export interface PmoToastAction {
  label: string;
  onClick: () => void;
}

export interface PmoToastRecord {
  key: number;
  type: PmoToastType;
  title?: string;
  message: string;
  dismissible: boolean;
  action?: PmoToastAction;
}

interface PmoToastItemProps {
  toast: PmoToastRecord;
  onDismiss: (key: number) => void;
}

const TYPE_STYLES: Record<
  PmoToastType,
  { icon: typeof CheckCircle2; iconClass: string; iconBg: string; accent: string }
> = {
  success: { icon: CheckCircle2, iconClass: "text-emerald-600 dark:text-emerald-400", iconBg: "bg-emerald-50 dark:bg-emerald-950/40", accent: "border-l-emerald-500" },
  error: { icon: CircleX, iconClass: "text-[var(--nu-danger)]", iconBg: "bg-red-50 dark:bg-red-950/40", accent: "border-l-[var(--nu-danger)]" },
  warning: { icon: TriangleAlert, iconClass: "text-amber-600 dark:text-amber-400", iconBg: "bg-amber-50 dark:bg-amber-950/40", accent: "border-l-amber-500" },
  info: { icon: Info, iconClass: "text-blue-600 dark:text-blue-400", iconBg: "bg-blue-50 dark:bg-blue-950/40", accent: "border-l-blue-500" },
};

/**
 * One PMO toast card. Success/info/warning use role="status" (polite —
 * doesn't interrupt) since they're not urgent; error uses role="alert"
 * (assertive) so a screen reader announces it immediately, matching the
 * severity a failed save/delete deserves. Never steals focus — dismissal is
 * available via a labeled button for keyboard/screen-reader users, but
 * nothing here calls .focus() on mount.
 */
export function PmoToastItem({ toast, onDismiss }: PmoToastItemProps) {
  const style = TYPE_STYLES[toast.type];
  const Icon = style.icon;
  const isError = toast.type === "error";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`w-full max-w-[380px] pointer-events-auto flex items-start gap-2.5 rounded-[var(--nu-radius-lg)] border border-[var(--nu-border)] border-l-4 ${style.accent} bg-[var(--nu-surface)] shadow-[var(--nu-shadow-md)] p-3.5 animate-in fade-in slide-in-from-bottom-2 duration-200`}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${style.iconBg}`}>
        <Icon size={16} className={style.iconClass} />
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {toast.title && <p className="text-[13px] font-semibold text-[var(--nu-text)] leading-tight">{toast.title}</p>}
        <p className="text-[12.5px] text-[var(--nu-text-secondary)] leading-relaxed break-words">{toast.message}</p>
        {toast.action && (
          <button
            type="button"
            onClick={toast.action.onClick}
            className="mt-1.5 text-[12px] font-semibold text-[var(--nu-accent)] hover:underline cursor-pointer"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      {toast.dismissible && (
        <button
          type="button"
          onClick={() => onDismiss(toast.key)}
          aria-label="Dismiss notification"
          className="shrink-0 p-1 rounded-md text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] transition cursor-pointer"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
