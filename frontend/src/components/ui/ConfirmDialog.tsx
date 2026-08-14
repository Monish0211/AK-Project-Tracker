import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

/**
 * Generic confirmation modal — replaces browser window.confirm() dialogs
 * across the app. Follows the same visual pattern already established by
 * ConfirmDeleteDialog.tsx (CustomerMaster) and DeleteUserDialog.tsx
 * (Settings/userManagement): fixed overlay, --nu-* design tokens, the
 * shared Button component. Those two are bespoke per use-case; this one is
 * parameterized (title/message/labels/variant) so a page needing more than
 * one confirmation (e.g. Archive + Delete Permanently) doesn't need to
 * hand-roll a near-duplicate dialog for each action.
 */
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" for irreversible/destructive actions (red confirm button); "default" for safe/reversible ones. */
  variant?: "danger" | "default";
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "default",
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-md)] w-full max-w-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-[var(--nu-radius-md)] flex items-center justify-center shrink-0 ${
              variant === "danger"
                ? "bg-red-50 dark:bg-red-950/20 text-[var(--nu-danger)]"
                : "bg-blue-50 dark:bg-blue-950/20 text-blue-600"
            }`}
          >
            {icon ?? <AlertTriangle size={18} />}
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-[var(--nu-text)]">{title}</h2>
            <p className="text-[12.5px] text-[var(--nu-text-secondary)] mt-1.5 whitespace-pre-line leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 mt-5">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={variant === "danger" ? "danger" : "primary"} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
