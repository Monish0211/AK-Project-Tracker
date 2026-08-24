import { usePmoToastContext } from "./PmoToastProvider";
import type { ShowPmoToastOptions } from "./PmoToastProvider";

export type { PmoToastType } from "./PmoToast";
export type { ShowPmoToastOptions } from "./PmoToastProvider";

/**
 * The one hook every component should use for action feedback (success/
 * error/warning/info toasts) — see frontend/src/utils/errorMessage.ts for
 * turning a caught error into the `message` this expects.
 *
 * Usage:
 *   const { showToast } = usePmoToast();
 *   showToast({ type: "success", message: "Project updated successfully." });
 *
 * Do NOT use this for: destructive-action confirmation (use ConfirmDialog),
 * inline field validation (keep it next to the field), or business events
 * like "Keka Timesheet Import Completed" / "Project Archived" (those belong
 * to the existing Notification Bell / push system — see frontend/src/notifications/**).
 */
export function usePmoToast(): { showToast: (options: ShowPmoToastOptions) => void; dismissToast: (key: number) => void } {
  return usePmoToastContext();
}
