import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { formatBusinessINR } from "../../utils/formatCurrency";
import { moneyTooltipText } from "../../utils/moneyTooltipText";
import { formatMoneyCompact } from "../../utils/currencyDisplay";

interface MoneyTooltipProps {
  /** Exact underlying amount the rounded display represents, in `currency` (rupees unless `currency` says otherwise). */
  value: number;
  /** The already-rounded content to display unchanged (e.g. "₹2.22 L"). */
  children: ReactNode;
  className?: string;
  /** The amount's currency. Omitted = INR, exactly as before; a regional amount (AED, OMR, ...) shows its own symbol and wording, never the rupee. */
  currency?: string;
}

/** formatBusinessINR only compacts (and rounds) to K/L/Cr at/above this magnitude — below it, the displayed value already IS the exact amount, so no tooltip is needed. */
const ROUNDING_THRESHOLD = 1_000;

/**
 * Wraps an already-rounded business-format money value (formatBusinessINR
 * output, e.g. "₹2.22 L") with a small info icon and a hover/focus tooltip
 * revealing the exact rupee amount. Presentation only — never touches the
 * displayed value or any calculation. Portal-rendered to <body> so it can
 * never be clipped by a scrollable table container.
 */
export function MoneyTooltip({ value, children, className, currency = "INR" }: MoneyTooltipProps) {
  const text = moneyTooltipText(value, currency);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  if (!Number.isFinite(value) || Math.abs(value) < ROUNDING_THRESHOLD) {
    return <span className={className}>{children}</span>;
  }

  const open = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setCoords({ top: rect.top - 10, left: rect.left + rect.width / 2 });
  };
  const close = () => setCoords(null);

  return (
    <span
      ref={triggerRef}
      className={`inline-flex items-center gap-1 cursor-help ${className ?? ""}`}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      tabIndex={0}
    >
      {children}
      <Info size={12} className="shrink-0 opacity-50" aria-hidden="true" />
      {coords &&
        createPortal(
          <span
            role="tooltip"
            className="fixed z-[999] w-64 -translate-x-1/2 -translate-y-full rounded-[var(--nu-radius-lg)] border border-[var(--nu-border)] bg-[var(--nu-surface)] px-4 py-3 text-left shadow-[var(--nu-shadow-md)]"
            style={{ top: coords.top, left: coords.left, animation: "tooltipFadeIn 150ms ease-out" }}
          >
            <p className="text-[9.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]">
              Actual Calculated Amount
            </p>
            <p className="mt-1 text-[15px] font-extrabold text-[var(--nu-text)] tabular-nums">
              {text.exact}
            </p>
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--nu-text-secondary)]">
              Displayed as <strong className="font-semibold text-[var(--nu-text)]">{text.compact}</strong> for
              readability. {text.note}
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

/** Convenience wrapper for the common case: the trigger text IS formatBusinessINR(value). */
export function MoneyValue({ value, className, currency }: { value: number; className?: string; currency?: string | undefined }) {
  // currency omitted (or INR) = the long-standing rupee form; any other currency shows its own symbol and K / M, never the rupee.
  const code = currency || "INR";
  return (
    <MoneyTooltip value={value} className={className} currency={code}>
      {code === "INR" ? formatBusinessINR(value) : formatMoneyCompact(value, code)}
    </MoneyTooltip>
  );
}
