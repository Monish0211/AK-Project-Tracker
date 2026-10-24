// Reminder sound (Oct 2026): the chime is requested when a valid reminder fires and sound is on, never twice for the same reminder, never
// while muted, handles a browser that blocks audio or an audio API that throws (visibly, not silently), and the Test button works
// through a real user interaction. No browser: a fake Web Audio API, a fake document and a fake localStorage.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test, mock } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// ── fakes installed BEFORE the service module is loaded (it registers document listeners and reads localStorage) ──
const docListeners = [];
globalThis.document = {
  addEventListener: (name, fn, cap) => docListeners.push({ name, fn, cap }),
  removeEventListener: (name, fn) => { const i = docListeners.findIndex((l) => l.name === name && l.fn === fn); if (i >= 0) docListeners.splice(i, 1); },
};
const storageMap = new Map();
globalThis.localStorage = { getItem: (k) => storageMap.get(k) ?? null, setItem: (k, v) => void storageMap.set(k, String(v)), removeItem: (k) => void storageMap.delete(k) };

const audio = { contexts: [], oscillators: [], peaks: [], mode: "running" };
class FakeAudioContext {
  constructor() {
    this.currentTime = 100;
    this.destination = {};
    this.state = audio.mode === "running" ? "running" : "suspended";
    audio.contexts.push(this);
  }
  resume() {
    if (audio.mode === "resumable") { this.state = "running"; return Promise.resolve(); }
    if (audio.mode === "resume-rejects") return Promise.reject(new Error("NotAllowedError: The AudioContext was not allowed to start."));
    if (audio.mode === "blocked") return new Promise(() => {}); // the browser never lets it start
    return Promise.resolve();
  }
  createOscillator() {
    if (audio.mode === "osc-throws" || audio.oscThrows) throw new Error("InvalidStateError: the audio graph is broken");
    const osc = { type: "", frequency: { value: 0 }, connect() {}, start() { audio.oscillators.push(osc); }, stop() {} };
    return osc;
  }
  createGain() {
    return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime(v) { audio.peaks.push(v); } }, connect() {} };
  }
}
globalThis.AudioContext = FakeAudioContext;

let vite;
let load;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());
beforeEach(() => {
  audio.contexts.length = 0; audio.oscillators.length = 0; audio.peaks.length = 0; audio.mode = "running"; audio.oscThrows = false;
  storageMap.clear();
});
const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

/** A fresh service plus the document handlers IT registered (so a test can simulate "the user clicked"). */
async function makeService(clock = () => Date.now()) {
  const { ReminderSoundService } = await load("/src/services/audio/ReminderSoundService.ts");
  const before = docListeners.length;
  const service = new ReminderSoundService(clock);
  const handlers = docListeners.slice(before);
  const click = async () => { for (const h of handlers.filter((x) => x.name === "click")) h.fn(); await new Promise((r) => setTimeout(r, 20)); };
  return { service, click, handlers };
}
const NOTES_PER_CHIME = 4;

test("sound is requested when a valid reminder fires and sound is enabled (one chime = four notes at the stored volume)", async () => {
  const { service } = await makeService();
  const result = await service.playForReminders(["r1|2026-10-23T09:00|At Due Time"]);
  assert.deepEqual({ played: result.played }, { played: true });
  assert.equal(audio.oscillators.length, NOTES_PER_CHIME);
  assert.ok(audio.peaks.includes(0.7 / 3), "default 70% volume is applied");
  assert.equal(service.getState().status, "ready");
  assert.equal(typeof service.getState().lastPlayedAt, "number");
});

test("duplicate polling / a second trigger for the same reminder does not play the sound again", async () => {
  let now = 1_000;
  const { service } = await makeService(() => now);
  const key = "r1|2026-10-23T09:00|At Due Time";
  assert.equal((await service.playForReminders([key])).played, true);
  for (let i = 0; i < 20; i++) {
    now += 15_000;
    const again = await service.playForReminders([key]);
    assert.deepEqual({ played: again.played, reason: again.reason }, { played: false, reason: "duplicate" });
  }
  assert.equal(audio.oscillators.length, NOTES_PER_CHIME, "exactly one chime for the whole run");
  now += 15_000;
  assert.equal((await service.playForReminders(["r2|2026-10-23T10:00|At Due Time"])).played, true, "a different reminder still plays");
  assert.equal(audio.oscillators.length, NOTES_PER_CHIME * 2);
});

test("two reminders fired in the same moment make one chime, not a stacked pile of them", async () => {
  let now = 1_000;
  const { service } = await makeService(() => now);
  assert.equal((await service.playForReminders(["a", "b"])).played, true);
  assert.equal(audio.oscillators.length, NOTES_PER_CHIME);
  now += 400; // another reminder fires 0.4 s later: the first chime has barely begun — do not layer a second on top of it
  const stacked = await service.playForReminders(["c"]);
  assert.deepEqual({ played: stacked.played, reason: stacked.reason }, { played: false, reason: "throttled" });
  assert.equal(audio.oscillators.length, NOTES_PER_CHIME);
});

test("the scheduler + sound together: forty polling cycles of one due reminder play exactly one chime", async () => {
  const { ReminderSchedulerCore } = await load("/src/notifications/reminderSchedulerCore.ts");
  const { ReminderLedger } = await load("/src/notifications/reminderLedger.ts");
  const { service } = await makeService();
  mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: new Date(2026, 9, 23, 9, 1) });
  try {
    const store = new Map();
    const pending = [{ id: "x", projectId: "p", projectCode: "PR-1", title: "T", reminderType: "t", priority: "Low", status: "Pending", reminderDate: "2026-10-23", reminderTime: "09:00", notifyOffset: "At Due Time", repeat: "None", createdBy: "a", createdDate: "", isCompleted: false, notificationGenerated: false }];
    const plays = [];
    const core = new ReminderSchedulerCore({
      getPendingReminders: () => pending, updateReminder: async () => {}, addReminder: async () => {},
      notifyBell() {}, pushToast() {}, emitFired() {},
      playSound: (keys) => plays.push(service.playForReminders(keys)),
      ledger: new ReminderLedger(() => ({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) }), () => Date.now()),
      now: () => new Date(), eventTarget: new EventTarget(),
      setInterval: (f, m) => globalThis.setInterval(f, m), clearInterval: (h) => globalThis.clearInterval(h), setTimeout: (f, m) => globalThis.setTimeout(f, m), log: console,
    });
    core.start("u");
    mock.timers.tick(15_000 * 40);
    core.stop();
    await Promise.all(plays);
  } finally {
    mock.timers.reset();
  }
  assert.equal(audio.oscillators.length, NOTES_PER_CHIME);
});

test("muted: nothing plays, nothing is scheduled, and the choice (and volume) persists across a reload", async () => {
  const { service } = await makeService();
  service.setEnabled(false);
  service.setVolume(0.35);
  const result = await service.playForReminders(["k"]);
  assert.deepEqual({ played: result.played, reason: result.reason }, { played: false, reason: "muted" });
  assert.equal(audio.oscillators.length, 0);
  assert.equal(audio.contexts.length, 0, "a muted service never even opens an audio context");
  assert.equal(service.getState().status, "muted");
  const reloaded = (await makeService()).service;
  assert.equal(reloaded.getState().enabled, false, "mute survives a refresh");
  assert.equal(reloaded.getState().volume, 0.35);
  assert.equal((await reloaded.test()).reason, "muted", "the Test button honors mute too");
  reloaded.setEnabled(true);
  assert.equal((await reloaded.playForReminders(["k2"])).played, true);
  assert.ok(audio.peaks.includes(0.35 / 3), "the saved volume is the one used");
});

test("volume is clamped to 0..1 and the legacy mute() API still works", async () => {
  const { service } = await makeService();
  service.setVolume(7); assert.equal(service.getState().volume, 1);
  service.setVolume(-3); assert.equal(service.getState().volume, 0);
  service.mute(true); assert.equal(service.getState().enabled, false);
  service.mute(false); assert.equal(service.getState().enabled, true);
});

test("a browser that blocks audio (no user interaction yet) is reported as blocked — not silently ignored — and a later click unblocks it", async () => {
  audio.mode = "blocked";
  const { service, click } = await makeService();
  assert.equal(service.getState().status, "needs-interaction", "before any interaction the state says so");
  const result = await service.playForReminders(["k"]);
  assert.deepEqual({ played: result.played, reason: result.reason }, { played: false, reason: "blocked" });
  assert.equal(audio.oscillators.length, 0, "nothing is scheduled on a suspended context (it would replay out of nowhere later)");
  assert.equal(service.getState().status, "blocked");
  assert.match(service.getState().lastError, /blocked audio until you click/i);
  // The user clicks somewhere on the page: the context can now start.
  audio.mode = "resumable";
  await click();
  assert.equal(service.getState().status, "ready");
  assert.equal(service.getState().lastError, undefined);
  // …and the next reminder (the same one was NOT remembered as played) now sounds.
  assert.equal((await service.playForReminders(["k"])).played, true);
  assert.equal(audio.oscillators.length, NOTES_PER_CHIME);
});

test("audio playback rejection is handled: resume() rejecting and an audio graph error both return a result and never throw", async () => {
  audio.mode = "resume-rejects";
  const a = (await makeService()).service;
  const r1 = await a.playForReminders(["k"]);
  assert.equal(r1.played, false);
  assert.equal(r1.reason, "blocked");
  assert.match(a.getState().lastError, /NotAllowedError|blocked/i);

  audio.mode = "running"; audio.oscThrows = true;
  const warn = mock.method(console, "warn", () => {});
  try {
    const b = (await makeService()).service;
    const r2 = await b.playForReminders(["k"]);
    assert.deepEqual({ played: r2.played, reason: r2.reason }, { played: false, reason: "error" });
    assert.match(r2.error, /audio graph is broken/);
    assert.equal(b.getState().status, "error");
    assert.match(b.getState().lastError, /audio graph/);
    assert.equal(warn.mock.calls.length >= 1, true, "the failure is logged for diagnostics");
    assert.equal((await b.playForReminders(["k"])).played, false, "a failed play is not remembered as played");
  } finally {
    warn.mock.restore();
  }
});

test("a browser with no Web Audio at all is reported as unsupported", async () => {
  const saved = globalThis.AudioContext;
  delete globalThis.AudioContext;
  try {
    const { service } = await makeService();
    assert.equal(service.getState().status, "unsupported");
    const r = await service.playForReminders(["k"]);
    assert.deepEqual({ played: r.played, reason: r.reason }, { played: false, reason: "unsupported" });
  } finally {
    globalThis.AudioContext = saved;
  }
});

test("the Test sound control works through the supported user-interaction flow: a click starts the blocked context and plays", async () => {
  audio.mode = "resumable"; // suspended until resume() is called from a gesture — which the click handler does synchronously
  const { service } = await makeService();
  assert.equal(service.getState().status, "needs-interaction");
  const result = await service.test();
  assert.equal(result.played, true);
  assert.equal(service.getState().status, "ready");
  assert.equal(audio.oscillators.length, NOTES_PER_CHIME);
  // test() is not subject to the per-reminder duplicate rule (it has no reminder), so it can be pressed again
  await new Promise((r) => setTimeout(r, 5));
  assert.equal((await service.test()).played, true);
});

test("subscribers are told about every change (so the UI never shows a stale status)", async () => {
  const { service } = await makeService();
  let calls = 0;
  const off = service.subscribe(() => calls++);
  const first = service.getState();
  service.setEnabled(false);
  service.setEnabled(true);
  service.setVolume(0.2);
  assert.equal(calls, 3);
  assert.notEqual(service.getState(), first, "a new snapshot object per change");
  off();
  service.setVolume(0.9);
  assert.equal(calls, 3, "unsubscribed listeners are not called");
});

test("the UI control: status text for every state, a Test sound button and an accessible on/off switch with volume", async () => {
  const { describeSoundState } = await load("/src/services/audio/reminderSoundText.ts");
  const base = { enabled: true, volume: 0.7 };
  assert.match(describeSoundState({ ...base, status: "muted", enabled: false }), /off/i);
  assert.match(describeSoundState({ ...base, status: "ready" }), /on and your browser is allowing audio/i);
  assert.match(describeSoundState({ ...base, status: "needs-interaction" }), /Test sound/);
  assert.match(describeSoundState({ ...base, status: "blocked" }), /blocked.*Test sound.*muted/i);
  assert.match(describeSoundState({ ...base, status: "unsupported" }), /cannot play/i);
  assert.match(describeSoundState({ ...base, status: "error", lastError: "boom" }), /could not be played: boom/);

  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ReminderSoundControl } = await load("/src/components/PmoAssistant/ReminderSoundControl.tsx");
  const html = renderToStaticMarkup(React.createElement(ReminderSoundControl));
  assert.match(html, /data-testid="reminder-sound-control"/);
  assert.match(html, />Test sound</);
  assert.match(html, /role="switch"[^>]*aria-checked="(true|false)"/);
  assert.match(html, /aria-label="Reminder sound volume"/);
  assert.match(html, /role="status"[^>]*data-sound-status="[a-z-]+"/);
  const panel = src("components/PmoAssistant/PmoAssistant.tsx");
  assert.match(panel, /\{canAccessProjects && <ReminderSoundControl \/>\}/, "the control sits in the Reminders view of the assistant");
});

test("the robot warns when the browser is blocking the reminder sound (so a missing chime is explained, not mysterious)", () => {
  const orb = src("components/PmoAssistant/PmoAssistantOrb.tsx");
  assert.match(orb, /soundState\.enabled && \(soundState\.status === "blocked" \|\| soundState\.status === "needs-interaction"\)/);
  assert.match(orb, /The browser is blocking the reminder sound/);
});
