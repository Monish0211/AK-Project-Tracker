import type { ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { Portal } from "./Portal";

/**
 * Generic confirmation modal — the PMO-wide standard for confirming
 * destructive/irreversible actions (Delete, Archive, Restore, Reset, etc.),
 * replacing browser window.confirm() and the bespoke per-page confirm
 * dialogs it was originally modeled on (ConfirmDeleteDialog.tsx,
 * DeleteUserDialog.tsx). Portal-mounted at document level so it always
 * escapes any card/table/overflow/transformed ancestor, matching every
 * other document-level overlay in this app (PmoToast, drawers).
 *
 * Public API is unchanged from the original — no new required props —
 * this pass only adds accessibility/portal behavior underneath it.
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
  const titleId = useId();
  const messageId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Escape-to-close.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  // Initial focus on open (the Cancel button, not Confirm — a destructive
  // action should never fire from a stray Enter keypress) and focus
  // restoration to whatever triggered the dialog once it closes.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      cancelButtonRef.current?.focus();
    } else {
      previouslyFocusedRef.current?.focus?.();
      previouslyFocusedRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[9600] flex items-center justify-center bg-black/40 p-4"
        onClick={onCancel}
      >
        <div
          role={variant === "danger" ? "alertdialog" : "dialog"}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={messageId}
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
              <h2 id={titleId} className="text-[15px] font-semibold text-[var(--nu-text)]">
                {title}
              </h2>
              <p id={messageId} className="text-[12.5px] text-[var(--nu-text-secondary)] mt-1.5 whitespace-pre-line leading-relaxed">
                {message}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 mt-5">
            <Button ref={cancelButtonRef} variant="secondary" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button variant={variant === "danger" ? "danger" : "primary"} size="sm" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
};

export default ConfirmDialog;
