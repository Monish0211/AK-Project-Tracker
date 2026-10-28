// Lazy-chunk preload-error recovery (Oct 2026). With 18 lazy routes, a tab left open across a deployment asks for chunk files that no longer exist. Vite
// reports that with a cancelable `vite:preloadError` event; src/utils/lazyChunkRecovery.ts reloads ONCE, guarded, and only for a failed file fetch.
// These tests drive the real module with a fake event target, clock, storage and reload, and "simulate page loads" by installing a fresh instance over
// the same storage — which is exactly what a reload does (module state is lost, sessionStorage survives).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite;
let mod;
let React;
let renderToStaticMarkup;
before(async () => {
  vite = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error", optimizeDeps: { noDiscovery: true, include: [] } });
  mod = await vite.ssrLoadModule("/src/utils/lazyChunkRecovery.ts");
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});
after(() => vite?.close());

const CHROME = "Failed to fetch dynamically imported module: https://pmodashboard.ifluids.in/assets/Manpower-abc12345.js";

/** One browser tab: a shared sessionStorage + clock + reload counter; `pageLoad()` installs a fresh recovery instance (a reload loses module state, not storage). */
function tab({ online = true, storage } = {}) {
  const store = new Map();
  const state = { now: 1_000_000, reloads: 0, logged: [], offline: !online };
  const sessionStorage = storage ?? { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  let uninstall = () => {};
  let target;
  const pageLoad = () => {
    uninstall();
    target = new EventTarget();
    uninstall = mod.installLazyChunkRecovery({
      target,
      getStorage: () => sessionStorage,
      reload: () => { state.reloads++; },
      now: () => state.now,
      isOnline: () => !state.offline,
      logError: (message, error) => state.logged.push({ message, error }),
    });
    return target;
  };
  /** Dispatch what Vite dispatches; returns the event so a test can see whether it was defaultPrevented (= recovered) or left to rethrow. */
  const fail = (payload) => {
    const event = new Event("vite:preloadError", { cancelable: true });
    event.payload = payload;
    target.dispatchEvent(event);
    return event;
  };
  return { state, pageLoad, fail, store, get target() { return target; }, uninstall: () => uninstall() };
}

test("isLazyChunkError: recognises every browser's 'chunk file could not be fetched' wording, and nothing else", () => {
  for (const message of [CHROME, "error loading dynamically imported module: https://x/assets/a.js", "Importing a module script failed.", "Unable to preload CSS for /assets/index-abc.css"]) {
    assert.equal(mod.isLazyChunkError(new TypeError(message)), true, message);
    assert.equal(mod.isLazyChunkError({ message }), true, `${message} (plain object)`);
    assert.equal(mod.isLazyChunkError(message), true, `${message} (string)`);
  }
  for (const other of [
    "Failed to fetch",                                   // an API call's network failure — NOT a chunk problem
    "NetworkError when attempting to fetch resource.",
    "Request failed with status 401",
    "Unauthorized",
    "Cannot read properties of undefined (reading 'map')",
    "x is not a function",
    "Unable to load Dashboard data. Please try again.",
    "",
  ]) assert.equal(mod.isLazyChunkError(new Error(other)), false, other || "(empty)");
  for (const nothing of [null, undefined, 0, {}, [], () => {}]) assert.equal(mod.isLazyChunkError(nothing), false, String(nothing));
});

test("a failed chunk fetch reloads the page exactly once and takes over the event (so Vite does not also rethrow)", () => {
  const t = tab();
  t.pageLoad();
  const event = t.fail(new TypeError(CHROME));
  assert.equal(t.state.reloads, 1, "one reload");
  assert.equal(event.defaultPrevented, true, "preventDefault called: the failure is being recovered, not rethrown");
  assert.equal(t.store.get(mod.LAZY_CHUNK_RELOAD_KEY), String(t.state.now), "the retry marker records when");
  assert.equal(t.state.logged.length, 0, "a successful recovery is not an error");
});

test("the one-reload guard: after the reload the same chunk still fails -> NO second reload, the error is left to propagate and a clear message is logged", () => {
  const t = tab();
  t.pageLoad();
  t.fail(new TypeError(CHROME));
  t.state.now += 4_000;               // the reloaded page, 4 s later, hits the same missing file
  t.pageLoad();                       // new page load: module state gone, sessionStorage kept
  const event = t.fail(new TypeError(CHROME));
  assert.equal(t.state.reloads, 1, "still just the one reload");
  assert.equal(event.defaultPrevented, false, "not prevented: Vite rethrows, the root error boundary shows its message");
  assert.equal(t.state.logged.length, 1, "and it is not silent");
  assert.match(t.state.logged[0].message, /could not be loaded and a reload did not fix it/);
  assert.equal(t.state.logged[0].error.message, CHROME, "the original error is passed through to the log");
});

test("repeated failures never loop: when every reload hits the same missing chunk, the reloads stop after one (fast and slow reloads)", () => {
  for (const reloadSeconds of [1, 5, 29]) {
    const t = tab();
    let pageLoads = 0;
    let reloadsSeen = 0;
    // A reload only happens because the previous page load asked for it — so keep "reloading" for as long as the module keeps asking.
    do {
      reloadsSeen = t.state.reloads;
      t.state.now += reloadSeconds * 1000;
      t.pageLoad();
      pageLoads++;
      t.fail(new TypeError(CHROME));
    } while (t.state.reloads > reloadsSeen && pageLoads < 100);
    assert.equal(t.state.reloads, 1, `${reloadSeconds}s reloads: exactly one reload`);
    assert.equal(pageLoads, 2, `${reloadSeconds}s reloads: the original load plus the single retry, then it stops`);
    assert.equal(t.state.logged.length, 1, `${reloadSeconds}s reloads: the final failure is reported, not swallowed`);
  }
});

test("recovery is available again once the window has passed (a later deployment in the same tab session)", () => {
  const t = tab();
  t.pageLoad();
  t.fail(new TypeError(CHROME));
  assert.equal(t.state.reloads, 1);
  t.state.now += mod.LAZY_CHUNK_RELOAD_WINDOW_MS - 1;
  t.pageLoad();
  assert.equal(t.fail(new TypeError(CHROME)).defaultPrevented, false, "just inside the window: still guarded");
  t.state.now += 2;                   // now past the window
  t.pageLoad();
  assert.equal(t.fail(new TypeError(CHROME)).defaultPrevented, true, "past the window: recovers again");
  assert.equal(t.state.reloads, 2);
});

test("several chunks failing at once (one outage, many files) trigger ONE reload; the siblings are absorbed because the page is already leaving", () => {
  const t = tab();
  t.pageLoad();
  const events = [t.fail(new TypeError(CHROME)), t.fail(new TypeError("Failed to fetch dynamically imported module: https://x/assets/Settings-9.js")), t.fail(new Error("Unable to preload CSS for /assets/x.css"))];
  assert.equal(t.state.reloads, 1);
  assert.deepEqual(events.map((e) => e.defaultPrevented), [true, true, true]);
  assert.equal(t.state.logged.length, 0);
});

test("unrelated errors never reload: evaluation errors inside a loaded chunk, API / auth errors, plain JS exceptions, unhandled rejections", () => {
  const t = tab();
  const target = t.pageLoad();
  // Vite dispatches vite:preloadError for ANY import() rejection, including a chunk that loaded and then threw while evaluating:
  for (const payload of [new TypeError("Cannot read properties of undefined (reading 'x')"), new ReferenceError("foo is not defined"), new Error("Failed to fetch"), new Error("Request failed with status 401"), "boom", undefined, null]) {
    const event = t.fail(payload);
    assert.equal(event.defaultPrevented, false, `left to propagate: ${String(payload && payload.message || payload)}`);
  }
  // Events the module must not even listen to:
  const error = new Event("error"); error.message = CHROME;
  const rejection = new Event("unhandledrejection"); rejection.reason = new TypeError(CHROME);
  target.dispatchEvent(error);
  target.dispatchEvent(rejection);
  target.dispatchEvent(new Event("popstate"));
  assert.equal(t.state.reloads, 0, "no reload for any of it");
  assert.equal(t.store.size, 0, "and no retry marker was written");
  assert.equal(t.state.logged.length, 0, "unrelated errors are not re-reported by this module");
});

test("no guard, no reload: blocked/throwing storage, a failing write, or being offline all leave the error to propagate", () => {
  const cases = {
    "storage access throws": tab({ storage: { getItem: () => { throw new Error("SecurityError"); }, setItem: () => {} } }),
    "storage write throws (quota / private mode)": tab({ storage: { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } } }),
    "offline": tab({ online: false }),
  };
  for (const [name, t] of Object.entries(cases)) {
    t.pageLoad();
    const event = t.fail(new TypeError(CHROME));
    assert.equal(t.state.reloads, 0, `${name}: no reload`);
    assert.equal(event.defaultPrevented, false, `${name}: error propagates`);
    assert.equal(t.state.logged.length, 1, `${name}: and it is reported`);
  }
});

test("a garbage marker in storage does not block recovery, and uninstalling removes the listener", () => {
  const t = tab();
  t.store.set(mod.LAZY_CHUNK_RELOAD_KEY, "not-a-number");
  t.pageLoad();
  assert.equal(t.fail(new TypeError(CHROME)).defaultPrevented, true, "NaN marker is ignored");
  const u = tab();
  u.pageLoad();
  u.uninstall();
  assert.equal(u.fail(new TypeError(CHROME)).defaultPrevented, false, "no listener after uninstall");
  assert.equal(u.state.reloads, 0);
});

test("root error fallback: ordinary errors show the original text; a persistent chunk failure shows a clear message with a manual Reload button", async () => {
  const { AppErrorFallback } = await vite.ssrLoadModule("/src/components/AppErrorFallback.tsx");
  const plain = renderToStaticMarkup(React.createElement(AppErrorFallback, { error: new Error("Cannot read properties of undefined") }));
  assert.equal(plain, "<p>Something went wrong.</p>", "unchanged for every ordinary error");
  for (const error of [new TypeError(CHROME), new Error("Failed to fetch"), null, undefined]) {
    if (error && mod.isLazyChunkError(error)) continue;
    assert.equal(renderToStaticMarkup(React.createElement(AppErrorFallback, { error })), "<p>Something went wrong.</p>");
  }
  const chunk = renderToStaticMarkup(React.createElement(AppErrorFallback, { error: new TypeError(CHROME) }));
  assert.match(chunk, /role="alert"/);
  assert.match(chunk, /This page could not be loaded\./);
  assert.match(chunk, /<button[^>]*type="button"[^>]*>Reload page<\/button>/, "the user can reload by hand (user-initiated, so no loop)");
});

test("wiring: main.tsx installs the recovery BEFORE the app renders, and keeps the Sentry root error boundary", () => {
  const main = readFileSync(root + "src/main.tsx", "utf8");
  const install = main.indexOf("installLazyChunkRecovery();");
  const render = main.indexOf("createRoot(");
  assert.ok(install > 0 && render > install, "installed before createRoot().render()");
  assert.match(main, /<Sentry\.ErrorBoundary fallback=\{\(\{ error \}\) => <AppErrorFallback error=\{error\} \/>\}>/);
  assert.match(main, /import \{ installLazyChunkRecovery \} from "\.\/utils\/lazyChunkRecovery";/);
  const recovery = readFileSync(root + "src/utils/lazyChunkRecovery.ts", "utf8");
  assert.ok(!/addEventListener\(\s*["'](error|unhandledrejection)["']/.test(recovery), "the module does not hook window 'error' / 'unhandledrejection'");
  assert.equal((recovery.match(/addEventListener\(/g) || []).length, 1, "exactly one listener: vite:preloadError");
});
