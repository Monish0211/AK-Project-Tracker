/**
 * Recovery for a lazy chunk that no longer exists (Oct 2026).
 *
 * Eighteen pages and the heavy libraries (exceljs, the PDF pipeline) are separate chunks fetched on first use. Their file names carry a content
 * hash, so a deployment replaces them. A tab that was opened BEFORE the deployment still runs the old entry script, which asks for the old file
 * names; those 404, and the dynamic import() fails. Vite reports this by dispatching a cancelable `vite:preloadError` event on `window` (payload =
 * the error) and, unless a listener calls preventDefault(), rethrowing — which today lands in the root error boundary as "Something went wrong."
 *
 * The cure is to reload once: the reload fetches the new index.html, which names the new chunks. This module does exactly that, with guards:
 *  - ONLY a failed chunk/CSS fetch qualifies (isLazyChunkError). Vite fires the same event when a chunk loaded fine but threw while evaluating,
 *    and for that — like any API, authentication or navigation error — a reload would be wrong, so those are left to propagate untouched.
 *  - At most ONE reload per failure window. A timestamp is kept in sessionStorage (per tab, survives the reload, gone when the tab closes — the
 *    same storage the app already uses for per-tab state). A second failure inside the window means the reload did not help (chunk really missing,
 *    server down): no reload, the original error is left to propagate to the root error boundary, and a clear message is logged. No loop.
 *  - If the guard cannot be written (storage blocked) or the browser is offline, nothing is reloaded — no guard, no reload.
 *  - Several chunks failing at once trigger one reload; the others are swallowed only because the page is already leaving.
 */

/** sessionStorage key holding the time (ms since epoch) of the last recovery reload in this tab. */
export const LAZY_CHUNK_RELOAD_KEY = "pmo:lazy-chunk-reload-at";
/** A reload counts as "recent" for this long; a failure inside it is treated as "the reload did not help". Long enough for a slow reload, short
 *  enough that a later deployment in the same tab session can recover again. */
export const LAZY_CHUNK_RELOAD_WINDOW_MS = 30_000;

// Browser wording for "the chunk file could not be fetched":
//  Chrome / Edge  "Failed to fetch dynamically imported module: <url>"      Firefox  "error loading dynamically imported module: <url>"
//  Safari         "Importing a module script failed."                        Vite     "Unable to preload CSS for <url>"
// Deliberately NOT a bare "Failed to fetch": that is also what an API call's network failure says.
const CHUNK_FETCH_FAILURE = [/dynamically imported module/i, /importing a module script failed/i, /unable to preload css/i];

/** True when `error` says a chunk/stylesheet file could not be fetched (as opposed to code that ran and threw). */
export function isLazyChunkError(error: unknown): boolean {
  const message = typeof error === "string" ? error : error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "";
  return message !== "" && CHUNK_FETCH_FAILURE.some((pattern) => pattern.test(message));
}

export interface LazyChunkRecoveryDeps {
  /** Where `vite:preloadError` is dispatched — `window`. */
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  /** The retry marker store. May throw on access (blocked storage) — that is handled as "cannot guard, so do not reload". */
  getStorage: () => Pick<Storage, "getItem" | "setItem">;
  reload: () => void;
  now: () => number;
  isOnline: () => boolean;
  logError: (message: string, error: unknown) => void;
  windowMs: number;
}

/**
 * Registers the `vite:preloadError` listener. Call once, before the app renders. Returns a function that removes it (used by tests).
 * `overrides` exists for tests; production passes none.
 */
export function installLazyChunkRecovery(overrides: Partial<LazyChunkRecoveryDeps> = {}): () => void {
  // Browser defaults are resolved lazily so nothing touches `window` when a test injects its own.
  const deps: LazyChunkRecoveryDeps = {
    target: overrides.target ?? window,
    getStorage: overrides.getStorage ?? (() => window.sessionStorage),
    reload: overrides.reload ?? (() => window.location.reload()),
    now: overrides.now ?? (() => Date.now()),
    isOnline: overrides.isOnline ?? (() => navigator.onLine !== false),
    logError: overrides.logError ?? ((message, error) => console.error(message, error)),
    windowMs: overrides.windowMs ?? LAZY_CHUNK_RELOAD_WINDOW_MS,
  };
  let reloading = false;

  /** True if this is the first recovery attempt inside the window AND the marker was durably recorded. */
  const claimReload = (): boolean => {
    if (!deps.isOnline()) return false; // a reload while offline only trades our error for the browser's
    try {
      const storage = deps.getStorage();
      const last = Number(storage.getItem(LAZY_CHUNK_RELOAD_KEY));
      if (Number.isFinite(last) && last > 0 && deps.now() - last < deps.windowMs) return false; // already reloaded just now and it still fails
      storage.setItem(LAZY_CHUNK_RELOAD_KEY, String(deps.now()));
      return true;
    } catch {
      return false; // storage unreadable/unwritable: without a guard we must not reload
    }
  };

  const onPreloadError = (event: Event): void => {
    const payload = (event as Event & { payload?: unknown }).payload;
    if (!isLazyChunkError(payload)) return; // evaluation error, or anything else: not ours — let Vite rethrow it as it always did
    if (reloading) {
      event.preventDefault(); // a recovery reload is already under way; this is the same outage seen by a sibling chunk
      return;
    }
    if (!claimReload()) {
      // Recovery already tried (or cannot be guarded): do NOT preventDefault, so Vite rethrows and the root error boundary shows its message.
      deps.logError("[PMO] A page file could not be loaded and a reload did not fix it. Reload the page manually; if it persists, the portal may be updating or unreachable.", payload);
      return;
    }
    reloading = true;
    event.preventDefault();
    deps.reload();
  };

  deps.target.addEventListener("vite:preloadError", onPreloadError);
  return () => deps.target.removeEventListener("vite:preloadError", onPreloadError);
}
