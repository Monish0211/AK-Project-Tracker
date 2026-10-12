import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";

/**
 * Project Repository — Invoice Request indicator (Oct 2026). A small,
 * secondary "+" flag shown beside the existing (unchanged) Invoice Status
 * badge when a project currently has an Open InvoiceRequest — never a
 * replacement for that status, never itself clickable/actionable (no
 * onClick anywhere here), same hover/focus-triggered portal-tooltip pattern
 * as MoneyTooltip.tsx for visual consistency with the rest of the PMO UI.
 */
export function InvoiceRequestFlag() {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const open = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.top - 8, left: rect.left + rect.width / 2 });
  };
  const close = () => setCoords(null);

  return (
    <span
      ref={triggerRef}
      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300 cursor-help ml-1"
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      tabIndex={0}
      role="img"
      aria-label="New invoice request has been sent for approval."
    >
      <Plus size={10} strokeWidth={3} aria-hidden="true" />
      {coords &&
        createPortal(
          <span
            role="tooltip"
            className="fixed z-[999] w-56 -translate-x-1/2 -translate-y-full rounded-[var(--nu-radius-lg)] border border-[var(--nu-border)] bg-[var(--nu-surface)] px-3 py-2 text-left shadow-[var(--nu-shadow-md)]"
            style={{ top: coords.top, left: coords.left, animation: "tooltipFadeIn 150ms ease-out" }}
          >
            <p className="text-[11.5px] leading-snug text-[var(--nu-text)]">
              New invoice request has been sent for approval.
            </p>
            <span
              className="absolute left-1/2 top-full -mt-[5px] h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-b border-r border-[var(--nu-border)] bg-[var(--nu-surface)]"
              aria-hidden="true"
            />
          </span>,
          document.body
        )}
    </span>
  );
}
