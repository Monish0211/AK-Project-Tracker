import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Portal } from "./Portal";
import { PmoToastItem } from "./PmoToast";
import type { PmoToastAction, PmoToastRecord, PmoToastType } from "./PmoToast";

export interface ShowPmoToastOptions {
  type: PmoToastType;
  message: string;
  title?: string;
  /** Overrides the type's default auto-dismiss duration (ms). Pass 0 to disable auto-dismiss (use sparingly — see design notes). */
  duration?: number;
  dismissible?: boolean;
  action?: PmoToastAction;
  /**
   * Optional explicit dedup key. If a toast with the same id is already
   * showing (or was shown in the last DEDUPE_WINDOW_MS), this call is
   * ignored rather than stacking a duplicate. When omitted, a signature is
   * derived from type+title+message, which already protects against the
   * most common accident (a double-click firing the same success/error
   * toast twice).
   */
  id?: string;
}

interface PmoToastContextValue {
  showToast: (options: ShowPmoToastOptions) => void;
  dismissToast: (key: number) => void;
}

const PmoToastContext = createContext<PmoToastContextValue | undefined>(undefined);

/** Per-type default auto-dismiss timing — see PMO feedback standard: success/info are quick and low-stakes, warning a little longer, error longest since it may require the user to actually read and act on it. */
const DEFAULT_DURATIONS: Record<PmoToastType, number> = {
  success: 3500,
  info: 4000,
  warning: 5000,
  error: 5500,
};

/** Hard cap on simultaneously visible toasts — a safety net against toast spam (e.g. a bug firing many calls in a loop), not the primary defense against bulk-operation spam, which should always be one summary toast per PMO_FEEDBACK_STANDARD.md-equivalent guidance. Oldest is dropped first. */
const MAX_VISIBLE_TOASTS = 4;

/** A repeat of the exact same signature within this window is treated as an accidental duplicate call (e.g. a double-click) and silently ignored rather than stacked. */
const DEDUPE_WINDOW_MS = 600;

let nextKey = 1;

export function PmoToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<PmoToastRecord[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const recentSignaturesRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((key: number) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
    const timer = timersRef.current.get(key);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(key);
    }
  }, []);

  const showToast = useCallback((options: ShowPmoToastOptions) => {
    const signature = options.id ?? `${options.type}::${options.title ?? ""}::${options.message}`;
    const now = Date.now();
    const lastShown = recentSignaturesRef.current.get(signature);
    if (lastShown && now - lastShown < DEDUPE_WINDOW_MS) {
      return;
    }
    recentSignaturesRef.current.set(signature, now);

    const key = nextKey++;
    const record: PmoToastRecord = {
      key,
      type: options.type,
      title: options.title,
      message: options.message,
      dismissible: options.dismissible ?? true,
      action: options.action,
    };

    setToasts((prev) => {
      const next = [...prev, record];
      if (next.length > MAX_VISIBLE_TOASTS) {
        const overflow = next.length - MAX_VISIBLE_TOASTS;
        for (const dropped of next.slice(0, overflow)) {
          const timer = timersRef.current.get(dropped.key);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(dropped.key);
          }
        }
        return next.slice(overflow);
      }
      return next;
    });

    const duration = options.duration ?? DEFAULT_DURATIONS[options.type];
    if (duration > 0) {
      const timer = setTimeout(() => dismissToast(key), duration);
      timersRef.current.set(key, timer);
    }
  }, [dismissToast]);

  return (
    <PmoToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <Portal>
        {/* Fixed, document-level toast stack — escapes any card/table/overflow/
            transformed ancestor. z-[9500] sits well below the PMO Assistant
            (z-[99998]/z-[99999]) so an open Assistant panel or its drag-anywhere
            orb is never covered; the Assistant's own default resting position
            (~120px above the viewport bottom, see PmoAssistantOrb.tsx) sits
            comfortably above where this stack renders. On narrow viewports the
            stack centers full-width instead of pinning to a corner, avoiding
            horizontal overflow and staying clear of any bottom navigation. */}
        <div
          className="fixed z-[9500] flex flex-col gap-2 items-center left-1/2 -translate-x-1/2 bottom-4 w-[calc(100vw-2rem)] max-w-[380px] sm:left-auto sm:right-6 sm:translate-x-0 sm:bottom-6 sm:items-end sm:w-auto pointer-events-none"
          aria-label="Notifications"
        >
          {toasts.map((toast) => (
            <PmoToastItem key={toast.key} toast={toast} onDismiss={dismissToast} />
          ))}
        </div>
      </Portal>
    </PmoToastContext.Provider>
  );
}

export function usePmoToastContext(): PmoToastContextValue {
  const ctx = useContext(PmoToastContext);
  if (!ctx) {
    throw new Error("usePmoToast must be used within a PmoToastProvider");
  }
  return ctx;
}
