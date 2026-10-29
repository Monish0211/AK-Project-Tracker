// PMO Assistant robot: WebGL recovery rules (webglRecovery.ts). A fake clock and fake event targets stand in for the browser, so every timing
// rule is exercised deterministically: when retries fire, that they are throttled and bounded, that nothing leaks, and what happens when a
// lost context is - or is not - restored. The real browser behaviour (actual context loss, a blocked getContext, a live canvas) is covered
// separately in a local browser run, not here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let mod;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  mod = await vite.ssrLoadModule("/src/components/PmoAssistant/webglRecovery.ts");
});
after(() => vite?.close());

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

function fakeEnv() {
  let t = 1_000_000;
  let nextId = 1;
  const timers = new Map(); // id -> { at, fn, every }
  const clock = {
    now: () => t,
    setTimeout: (fn, ms) => (timers.set(nextId, { at: t + ms, fn, every: 0 }), nextId++),
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, ms) => (timers.set(nextId, { at: t + ms, fn, every: ms }), nextId++),
    clearInterval: (id) => timers.delete(id),
  };
  const mk = () => {
    const l = new Map();
    return {
      l,
      addEventListener: (type, fn) => (l.has(type) ? l.get(type).add(fn) : l.set(type, new Set([fn]))),
      removeEventListener: (type, fn) => l.get(type)?.delete(fn),
      fire: (type) => [...(l.get(type) ?? [])].forEach((fn) => fn()),
      count: () => [...l.values()].reduce((n, s) => n + s.size, 0),
    };
  };
  const doc = Object.assign(mk(), { visibilityState: "visible" });
  const win = mk();
  const advance = (ms) => {
    const end = t + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, x] = due;
      t = x.at;
      if (x.every) x.at += x.every;
      else timers.delete(id);
      x.fn();
    }
    t = end;
  };
  return { clock, doc, win, advance, timerCount: () => timers.size, targets: { document: doc, window: win } };
}

const start = (env, over = {}) => {
  let attempts = 0;
  const stop = mod.startWebglRetry({
    attempt: over.attempt ?? (() => (attempts++, false)),
    state: over.state ?? mod.createRetryState(),
    clock: env.clock,
    targets: env.targets,
    ...over.options,
  });
  return { stop, attempts: () => attempts };
};

test("starting registers exactly two listeners and one interval; stopping releases every one", () => {
  const env = fakeEnv();
  const r = start(env);
  assert.equal(env.doc.count() + env.win.count(), 2);
  assert.equal(env.timerCount(), 1);
  r.stop();
  assert.equal(env.doc.count() + env.win.count(), 0);
  assert.equal(env.timerCount(), 0);
});

test("a tab becoming visible retries; becoming hidden does not", () => {
  const env = fakeEnv();
  const r = start(env);
  env.doc.visibilityState = "hidden";
  env.doc.fire("visibilitychange");
  assert.equal(r.attempts(), 0);
  env.doc.visibilityState = "visible";
  env.doc.fire("visibilitychange");
  assert.equal(r.attempts(), 1);
});

test("regaining window focus retries", () => {
  const env = fakeEnv();
  const r = start(env);
  env.win.fire("focus");
  assert.equal(r.attempts(), 1);
});

test("the periodic retry fires every interval while visible, and not while the tab is hidden", () => {
  const env = fakeEnv();
  const r = start(env);
  env.advance(mod.RETRY_INTERVAL_MS);
  assert.equal(r.attempts(), 1);
  env.doc.visibilityState = "hidden";
  env.advance(mod.RETRY_INTERVAL_MS * 3);
  assert.equal(r.attempts(), 1, "no retries while hidden");
  env.doc.visibilityState = "visible";
  env.doc.fire("visibilitychange");
  assert.equal(r.attempts(), 2, "retries as soon as the tab is visible again");
});

test("attempts are never closer together than the minimum gap, however many events arrive", () => {
  const env = fakeEnv();
  const r = start(env);
  for (let i = 0; i < 50; i++) {
    env.win.fire("focus");
    env.doc.fire("visibilitychange");
  }
  assert.equal(r.attempts(), 1);
  env.advance(mod.RETRY_MIN_GAP_MS - 1);
  env.win.fire("focus");
  assert.equal(r.attempts(), 1);
  env.advance(1);
  env.win.fire("focus");
  assert.equal(r.attempts(), 2);
});

test("the minimum gap survives the retry loop being stopped and started again", () => {
  const env = fakeEnv();
  const state = mod.createRetryState();
  const first = start(env, { state });
  env.win.fire("focus");
  first.stop();
  const second = start(env, { state });
  env.win.fire("focus");
  assert.equal(second.attempts(), 0, "too soon after the previous attempt");
  env.advance(mod.RETRY_MIN_GAP_MS);
  env.win.fire("focus");
  assert.equal(second.attempts(), 1);
});

test("a successful attempt stops the loop and releases its listeners and timers", () => {
  const env = fakeEnv();
  let calls = 0;
  const r = start(env, { attempt: () => (calls++, true) });
  env.win.fire("focus");
  assert.equal(calls, 1);
  assert.equal(env.doc.count() + env.win.count(), 0);
  assert.equal(env.timerCount(), 0);
  env.advance(mod.RETRY_INTERVAL_MS * 5);
  env.win.fire("focus");
  assert.equal(calls, 1, "nothing retries after success");
  r.stop(); // stopping again is harmless
});

test("a throwing attempt counts as a failed attempt and the loop keeps going", () => {
  const env = fakeEnv();
  let calls = 0;
  start(env, { attempt: () => (calls++, (() => { throw new Error("boom"); })()) });
  env.win.fire("focus");
  env.advance(mod.RETRY_MIN_GAP_MS);
  env.win.fire("focus");
  assert.equal(calls, 2);
});

test("a first attempt can be scheduled sooner than the interval, and is cancelled by stop()", () => {
  const env = fakeEnv();
  const quick = start(env, { options: { firstAttemptDelayMs: mod.QUICK_RETRY_DELAY_MS } });
  assert.equal(env.timerCount(), 2);
  env.advance(mod.QUICK_RETRY_DELAY_MS);
  assert.equal(quick.attempts(), 1);
  quick.stop();
  assert.equal(env.timerCount(), 0);

  const env2 = fakeEnv();
  const r2 = start(env2, { options: { firstAttemptDelayMs: mod.QUICK_RETRY_DELAY_MS } });
  r2.stop();
  env2.advance(mod.QUICK_RETRY_DELAY_MS * 3);
  assert.equal(r2.attempts(), 0);
  assert.equal(env2.timerCount(), 0);
});

test("two loops started and stopped independently (e.g. a development double-mount) leave nothing behind", () => {
  const env = fakeEnv();
  const a = start(env);
  const b = start(env);
  assert.equal(env.doc.count() + env.win.count(), 4);
  a.stop();
  assert.equal(env.doc.count() + env.win.count(), 2);
  b.stop();
  assert.equal(env.doc.count() + env.win.count(), 0);
  assert.equal(env.timerCount(), 0);
});

test("repeated start/stop cycles never accumulate listeners or timers", () => {
  const env = fakeEnv();
  const state = mod.createRetryState();
  for (let i = 0; i < 100; i++) start(env, { state, options: { firstAttemptDelayMs: 10 } }).stop();
  assert.equal(env.doc.count() + env.win.count(), 0);
  assert.equal(env.timerCount(), 0);
});

// ---- context-loss watchdog ------------------------------------------------------------------------------------------------

test("a lost context that is not restored in time reports a timeout exactly once", () => {
  const env = fakeEnv();
  let timeouts = 0;
  const w = mod.createContextLossWatchdog({ onTimeout: () => timeouts++, clock: env.clock });
  w.lost();
  env.advance(mod.CONTEXT_RESTORE_TIMEOUT_MS - 1);
  assert.equal(timeouts, 0);
  env.advance(1);
  assert.equal(timeouts, 1);
  env.advance(mod.CONTEXT_RESTORE_TIMEOUT_MS * 10);
  assert.equal(timeouts, 1);
  assert.equal(env.timerCount(), 0);
});

test("a restore within the grace period cancels the timeout", () => {
  const env = fakeEnv();
  let timeouts = 0;
  const w = mod.createContextLossWatchdog({ onTimeout: () => timeouts++, clock: env.clock });
  w.lost();
  env.advance(1000);
  assert.equal(w.restored(), "in-time");
  env.advance(mod.CONTEXT_RESTORE_TIMEOUT_MS * 5);
  assert.equal(timeouts, 0);
  assert.equal(env.timerCount(), 0);
});

test("a restore after the timeout is reported as late; a restore with no loss as none", () => {
  const env = fakeEnv();
  const w = mod.createContextLossWatchdog({ onTimeout() {}, clock: env.clock });
  assert.equal(w.restored(), "none");
  w.lost();
  env.advance(mod.CONTEXT_RESTORE_TIMEOUT_MS);
  assert.equal(w.restored(), "late");
});

test("repeated loss reports while one is pending do not stack timers", () => {
  const env = fakeEnv();
  let timeouts = 0;
  const w = mod.createContextLossWatchdog({ onTimeout: () => timeouts++, clock: env.clock });
  for (let i = 0; i < 10; i++) w.lost();
  assert.equal(env.timerCount(), 1);
  env.advance(mod.CONTEXT_RESTORE_TIMEOUT_MS);
  assert.equal(timeouts, 1);
});

test("dispose() cancels a pending grace period (component teardown)", () => {
  const env = fakeEnv();
  let timeouts = 0;
  const w = mod.createContextLossWatchdog({ onTimeout: () => timeouts++, clock: env.clock });
  w.lost();
  w.dispose();
  env.advance(mod.CONTEXT_RESTORE_TIMEOUT_MS * 3);
  assert.equal(timeouts, 0);
  assert.equal(env.timerCount(), 0);
});

test("a loss, a timeout and a second loss each get their own grace period", () => {
  const env = fakeEnv();
  let timeouts = 0;
  const w = mod.createContextLossWatchdog({ onTimeout: () => timeouts++, clock: env.clock });
  w.lost();
  env.advance(mod.CONTEXT_RESTORE_TIMEOUT_MS);
  w.lost();
  assert.equal(w.restored(), "in-time");
  assert.equal(timeouts, 1);
});

// ---- diagnostics -------------------------------------------------------------------------------------------------------------

function sink() {
  const lines = [];
  return { lines, warn: (m) => lines.push(["warn", m]), info: (m) => lines.push(["info", m]) };
}

test("a repeated event is logged once, so a failing periodic retry does not flood the console", () => {
  const s = sink();
  const r = mod.createWebglReporter(s);
  r.report("unavailable");
  for (let i = 0; i < 20; i++) r.report("retry-failed");
  assert.deepEqual(s.lines.map((l) => l[0]), ["warn", "warn"]);
});

test("each failure mode has its own distinct message", () => {
  const s = sink();
  const r = mod.createWebglReporter(s);
  for (const e of ["unavailable", "init-failed", "context-lost", "restore-timeout", "retry-failed"]) r.report(e);
  assert.equal(new Set(s.lines.map((l) => l[1])).size, 5);
  assert.ok(s.lines.every((l) => l[1].startsWith("[PmoAssistant] ")));
});

test("'recovered' is only logged after a problem, and 'restored' is informational", () => {
  const s = sink();
  const r = mod.createWebglReporter(s);
  r.report("recovered");
  assert.equal(s.lines.length, 0, "a healthy start is silent");
  r.report("context-lost");
  r.report("context-restored");
  r.report("recovered");
  assert.deepEqual(s.lines.map((l) => l[0]), ["warn", "info", "info"]);
  r.report("recovered");
  assert.equal(s.lines.length, 3, "and only once");
});

// ---- wiring in the component ---------------------------------------------------------------------------------------------------

test("the retry loop runs only while the fallback is showing, and a retry never forces a rebuild of a healthy renderer", () => {
  const text = src("components/PmoAssistant/PmoAssistantOrb.tsx");
  const effect = text.match(/useEffect\(\(\) => \{\s*if \(!canvasFailed\) return;[\s\S]*?\}, \[canvasFailed\]\);/);
  assert.ok(effect, "retry effect not found");
  assert.ok(effect[0].includes("startWebglRetry("));
  assert.equal((text.match(/setCanvasFailed\(false\)/g) ?? []).length, 1, "only the retry attempt may clear the fallback");
});

test("the scene is rebuilt on a restored context and torn down completely", () => {
  const text = src("components/PmoAssistant/PmoAssistantOrb.tsx");
  assert.ok(/\}, \[canvasFailed, sceneEpoch, applyOrbTransform\]\);/.test(text), "scene effect must depend on sceneEpoch");
  const cleanup = text.slice(text.indexOf("watchdog.dispose();"), text.indexOf("}, [canvasFailed, sceneEpoch"));
  for (const needed of ["cancelAnimationFrame(animationFrameId)", "removeEventListener(\"webglcontextlost\"", "removeEventListener(\"webglcontextrestored\"", "disposables.forEach", "renderer.dispose()", "renderer.forceContextLoss()", "container.removeChild(renderer.domElement)"]) {
    assert.ok(cleanup.includes(needed), `cleanup must still ${needed}`);
  }
  assert.ok(text.includes("setSceneEpoch((n) => n + 1)"));
  assert.ok(text.includes("glContext.isContextLost()"), "a missed contextlost event is caught by polling the context");
});

test("the existing robot model and animation code is untouched by the recovery change", () => {
  const text = src("components/PmoAssistant/PmoAssistantOrb.tsx");
  for (const kept of ["const ORB_WIDTH = 105;", "const ORB_HEIGHT = 120;", "FRAME_MS_ASLEEP", "FRAME_MS_PANEL_OPEN", "FRAME_MS_WALK", "renderer.setPixelRatio(Math.max(2, Math.min(window.devicePixelRatio, 2)))", "antialias: false", "pmrem.fromScene(roomEnv, 0.04)"]) {
    assert.ok(text.includes(kept), kept);
  }
});

test("handleContextLost cannot call itself, and the 'dead context' guard sits inside the frame loop", () => {
  const text = src("components/PmoAssistant/PmoAssistantOrb.tsx");
  const body = text.match(/const handleContextLost = \(\) => \{[\s\S]*?\n    \};/);
  assert.ok(body, "handleContextLost not found");
  assert.ok(!/handleContextLost\(/.test(body[0]), "handleContextLost must not recurse");
  assert.ok(body[0].includes("if (contextLost) return;") && body[0].includes("watchdog.lost()"));
  const loopStart = text.indexOf("const animate = () => {");
  const guard = text.indexOf("if (!contextLost && glContext.isContextLost()) handleContextLost();");
  assert.ok(loopStart > 0 && guard > loopStart, "the polling guard belongs in the animation loop");
  assert.ok(text.indexOf("if (contextLost) return; // GPU context gone", guard) > guard, "and the early return follows it");
});

test("a context the browser restores after teardown is released again instead of staying live on a discarded canvas", () => {
  const text = src("components/PmoAssistant/PmoAssistantOrb.tsx");
  const cleanup = text.slice(text.indexOf("watchdog.dispose();"), text.indexOf("}, [canvasFailed, sceneEpoch"));
  assert.ok(cleanup.includes("const alreadyLost = glContext.isContextLost();") && cleanup.includes("if (alreadyLost) {"), "only a lost context can be restored later, judged by its real state");
  assert.ok(cleanup.includes("if (!alreadyLost) renderer.forceContextLoss();"), "a live (e.g. restored) context must always be released - not skipped because of the loop flag");
  assert.ok(!cleanup.includes("if (!contextLost"), "the stale loop flag must not decide whether to release");
  assert.ok(cleanup.includes("LATE_RESTORE_WATCH_MS"), "the late-restore listener has a bounded lifetime");
  assert.ok(cleanup.includes('deadCanvas.addEventListener("webglcontextrestored", releaseLateRestore)'));
  assert.ok(cleanup.includes('deadCanvas.removeEventListener("webglcontextrestored", releaseLateRestore)'), "the one-shot listener removes itself");
  assert.ok(cleanup.includes('glContext.getExtension("WEBGL_lose_context")?.loseContext()'));
});
