/**
 * WebGL recovery helpers for the PMO Assistant robot (PmoAssistantOrb.tsx).
 *
 * Pure TypeScript - no React, no three.js, no direct use of the browser globals unless the caller leaves the
 * defaults - so the timing rules can be unit-tested with a fake clock and fake event targets.
 *
 * Two jobs:
 *  - startWebglRetry(): while the plain-CSS fallback avatar is showing, try to bring the 3D robot back when the tab
 *    becomes visible, when the window regains focus, and periodically - never faster than a minimum gap, never while
 *    hidden, and never more than one live set of listeners/timers per call.
 *  - createContextLossWatchdog(): "webglcontextlost" is not always followed by "webglcontextrestored" (a browser that
 *    evicted the context to stay under its limit may never restore it). The watchdog gives a restore a short grace
 *    period and then reports a timeout, so the robot is never left blank or frozen.
 */

/** How often a retry is attempted while the fallback avatar is showing (tab visible). */
export const RETRY_INTERVAL_MS = 30_000;
/** Attempts are never closer together than this, whatever triggers them - bounds the work if a retry keeps failing. */
export const RETRY_MIN_GAP_MS = 5_000;
/** First retry after a context was lost for good: sooner than the periodic interval, so the robot is back quickly. */
export const QUICK_RETRY_DELAY_MS = 2_000;
/** How long a lost context may take to be restored before the robot is rebuilt from scratch. */
export const CONTEXT_RESTORE_TIMEOUT_MS = 3_000;

/** How long a discarded canvas keeps listening for a late restore (to release that context again) before the listener is removed. */
export const LATE_RESTORE_WATCH_MS = 60_000;

export interface RecoveryClock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

interface Listenable {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

export interface RetryTargets {
  document: Listenable & { visibilityState: string };
  window: Listenable;
}

const browserClock = (): RecoveryClock => ({
  now: () => Date.now(),
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
  setInterval: (fn, ms) => window.setInterval(fn, ms),
  clearInterval: (handle) => window.clearInterval(handle as number),
});

const browserTargets = (): RetryTargets => ({ document, window });

/** Shared between successive startWebglRetry() calls, so the minimum gap survives the fallback being left and re-entered. */
export interface RetryState {
  lastAttemptAt: number;
}

export function createRetryState(): RetryState {
  return { lastAttemptAt: Number.NEGATIVE_INFINITY };
}

export interface StartWebglRetryOptions {
  /** Try to bring the 3D robot back. Return true when it was started (retrying then stops); false to keep retrying. */
  attempt: () => boolean;
  state: RetryState;
  intervalMs?: number;
  minGapMs?: number;
  /** When set, one extra attempt is made this long after starting (in addition to the periodic ones). */
  firstAttemptDelayMs?: number;
  clock?: RecoveryClock;
  targets?: RetryTargets;
}

/**
 * Starts the retry loop and returns its stop function (idempotent). Everything it registers - two event listeners, one
 * interval and at most one timeout - is released by that stop function, and also automatically after a successful attempt.
 */
export function startWebglRetry(options: StartWebglRetryOptions): () => void {
  const { attempt, state, intervalMs = RETRY_INTERVAL_MS, minGapMs = RETRY_MIN_GAP_MS, firstAttemptDelayMs } = options;
  const clock = options.clock ?? browserClock();
  const targets = options.targets ?? browserTargets();
  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    targets.document.removeEventListener("visibilitychange", onVisibility);
    targets.window.removeEventListener("focus", onFocus);
    clock.clearInterval(intervalTimer);
    if (firstTimer !== undefined) clock.clearTimeout(firstTimer);
  }

  function trigger() {
    if (stopped) return;
    if (targets.document.visibilityState === "hidden") return; // retried as soon as the tab is visible again
    const t = clock.now();
    if (t - state.lastAttemptAt < minGapMs) return;
    state.lastAttemptAt = t;
    let started: boolean;
    try {
      started = attempt();
    } catch {
      started = false; // a throwing attempt is just a failed attempt - the next trigger tries again
    }
    if (started) stop();
  }

  function onVisibility() {
    if (targets.document.visibilityState === "visible") trigger();
  }
  function onFocus() {
    trigger();
  }

  targets.document.addEventListener("visibilitychange", onVisibility);
  targets.window.addEventListener("focus", onFocus);
  const intervalTimer = clock.setInterval(trigger, intervalMs);
  const firstTimer = firstAttemptDelayMs !== undefined ? clock.setTimeout(trigger, firstAttemptDelayMs) : undefined;

  return stop;
}

export type RestoreOutcome = "in-time" | "late" | "none";

export interface ContextLossWatchdog {
  /** A context loss was reported. Starts the grace period (ignored while one is already running). */
  lost: () => void;
  /** A restore was reported. "in-time" if it arrived within the grace period, "late" if the timeout had already fired. */
  restored: () => RestoreOutcome;
  /** Cancels a running grace period (component teardown). */
  dispose: () => void;
}

export function createContextLossWatchdog(options: { onTimeout: () => void; timeoutMs?: number; clock?: RecoveryClock }): ContextLossWatchdog {
  const timeoutMs = options.timeoutMs ?? CONTEXT_RESTORE_TIMEOUT_MS;
  const clock = options.clock ?? browserClock();
  let pending = false;
  let timedOut = false;
  let timer: unknown;

  return {
    lost() {
      if (pending) return;
      pending = true;
      timedOut = false;
      timer = clock.setTimeout(() => {
        pending = false;
        timedOut = true;
        options.onTimeout();
      }, timeoutMs);
    },
    restored() {
      if (pending) {
        pending = false;
        clock.clearTimeout(timer);
        return "in-time";
      }
      return timedOut ? "late" : "none";
    },
    dispose() {
      if (pending) clock.clearTimeout(timer);
      pending = false;
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Diagnostics - one line per state change, never per frame and never per retry.
// ---------------------------------------------------------------------------------------------------------------------

export type WebglEvent = "unavailable" | "init-failed" | "context-lost" | "context-restored" | "restore-timeout" | "retry-failed" | "recovered";

const MESSAGES: Record<WebglEvent, string> = {
  unavailable: "WebGL is unavailable - showing the fallback avatar; will retry.",
  "init-failed": "3D renderer could not be created - showing the fallback avatar; will retry.",
  "context-lost": "WebGL context lost - waiting briefly for it to be restored.",
  "context-restored": "WebGL context restored - rebuilding the 3D robot.",
  "restore-timeout": "WebGL context was not restored in time - showing the fallback avatar and rebuilding.",
  "retry-failed": "3D robot retry failed - still on the fallback avatar.",
  recovered: "3D robot is running again.",
};

export interface WebglReporter {
  report: (event: WebglEvent) => void;
}

/** Repeats of the same event are dropped (a failing periodic retry logs once, not every 30 seconds). "recovered" only logs after a problem. */
export function createWebglReporter(sink: Pick<Console, "warn" | "info"> = console): WebglReporter {
  let last: WebglEvent | null = null;
  let hadProblem = false;
  return {
    report(event) {
      if (event === last) return;
      if (event === "recovered" && !hadProblem) return;
      last = event;
      if (event === "recovered") {
        hadProblem = false;
        last = null;
        sink.info(`[PmoAssistant] ${MESSAGES[event]}`);
        return;
      }
      hadProblem = true;
      if (event === "context-restored") sink.info(`[PmoAssistant] ${MESSAGES[event]}`);
      else sink.warn(`[PmoAssistant] ${MESSAGES[event]}`);
    },
  };
}
