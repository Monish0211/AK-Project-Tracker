// Reminder lifecycle (Oct 2026): a reminder fires ONCE per occurrence — across polling cycles, a refresh / re-mount, two running
// listeners, and a server that refuses or fails to record the fire — new reminders still fire, future ones never early, recurring ones
// follow their schedule, and the robot's alert follows what actually fired. No browser: the scheduler core runs against fake
// collaborators and node:test fake timers (setInterval / setTimeout / Date).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, before, test, mock } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

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
afterEach(() => mock.timers.reset());

const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => process.nextTick(r)); };
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

let idCounter = 0;
const reminder = (over = {}) => ({
  id: over.id ?? `r${++idCounter}`,
  projectId: "p1", projectCode: "PR-1", title: "Send the invoice", reminderType: "Invoice", priority: "Medium", status: "Pending",
  reminderDate: "2026-10-23", reminderTime: "09:00", notifyOffset: "At Due Time", repeat: "None", createdBy: "Asha", createdDate: "2026-10-01T00:00:00Z",
  isCompleted: false, notificationGenerated: false, ...over,
});

/** A scheduler core wired to fakes. `storage` is shared so a second env models "the same browser after a refresh". */
async function makeEnv({ reminders = [], storage = new Map(), update = "ok", add = "ok", userId = "user-1" } = {}) {
  const { ReminderSchedulerCore } = await load("/src/notifications/reminderSchedulerCore.ts");
  const { ReminderLedger } = await load("/src/notifications/reminderLedger.ts");
  const out = { toasts: [], bells: [], sounds: [], emitted: [], updates: [], adds: [], warns: [], addAttempts: 0 };
  const ledger = new ReminderLedger(() => ({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) }), () => Date.now());
  const target = new EventTarget();
  const core = new ReminderSchedulerCore({
    getPendingReminders: () => reminders.filter((r) => r.status === "Pending"),
    updateReminder: async (id, updates) => {
      out.updates.push({ id, updates });
      if (update === "forbidden") throw Object.assign(new Error("Read only"), { status: 403 });
      if (update === "offline") throw new Error("network down");
      const r = reminders.find((x) => x.id === id);
      if (r) Object.assign(r, updates); // the server recording notificationGenerated
    },
    addReminder: async (r) => {
      out.addAttempts++;
      if (add === "forbidden") throw Object.assign(new Error("Read only"), { status: 403 });
      if (add === "flaky" && out.addAttempts === 1) throw Object.assign(new Error("server error"), { status: 503 });
      out.adds.push(r);
      reminders.push({ ...r, id: `spawn-${out.adds.length}`, createdDate: new Date().toISOString(), isCompleted: false });
    },
    notifyBell: (b) => out.bells.push(b),
    pushToast: (t) => out.toasts.push(t),
    playSound: (keys) => out.sounds.push(keys),
    emitFired: (batch) => out.emitted.push(batch),
    ledger,
    now: () => new Date(),
    eventTarget: target,
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (h) => globalThis.clearInterval(h),
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    log: { warn: (...a) => out.warns.push(a), error: (...a) => out.warns.push(a) },
  });
  return { core, out, reminders, storage, target, ledger, userId };
}
const clock = (iso) => mock.timers.enable({ apis: ["setInterval", "setTimeout", "Date"], now: new Date(iso) });
const at = (y, mo, d, h, mi, s = 0) => new Date(y, mo - 1, d, h, mi, s);

// ---------------------------------------------------------------- fires once

test("a due one-time reminder fires exactly once across many polling cycles", async () => {
  clock(at(2026, 10, 23, 9, 5));
  const env = await makeEnv({ reminders: [reminder()] });
  env.core.start("user-1");
  mock.timers.tick(15_000 * 40); // 10 minutes of 15s polls
  await flush();
  assert.equal(env.out.toasts.length, 1);
  assert.equal(env.out.bells.length, 1);
  assert.equal(env.out.sounds.length, 1);
  assert.equal(env.out.emitted.length, 1);
  assert.equal(env.out.updates.length, 1, "the server flag is written once, not on every poll");
  env.core.stop();
});

test("it still fires only once when the server REFUSES to record the fire (Read Only user) — the old repeat-every-refresh bug", async () => {
  clock(at(2026, 10, 23, 9, 1));
  const env = await makeEnv({ reminders: [reminder()], update: "forbidden" });
  env.core.start("user-1");
  mock.timers.tick(15_000 * 60);
  await flush();
  assert.equal(env.out.toasts.length, 1);
  assert.equal(env.out.updates.length, 1, "no endless retry of a PATCH that can never succeed");
  assert.ok(env.out.warns.length >= 1, "the failure is reported, not swallowed");
  env.core.stop();
});

test("a refresh / re-mount does not replay a reminder this browser already fired — even though the server never recorded it", async () => {
  clock(at(2026, 10, 23, 9, 2));
  const storage = new Map();
  const reminders = [reminder({ id: "old" })];
  const first = await makeEnv({ reminders, storage, update: "forbidden" });
  first.core.start("user-1");
  await flush();
  assert.equal(first.out.toasts.length, 1);
  first.core.stop();

  // "Refresh": brand-new scheduler, brand-new in-memory state, same browser storage, same (still unflagged) reminder from the server.
  assert.equal(reminders[0].notificationGenerated, false);
  const second = await makeEnv({ reminders, storage, update: "forbidden" });
  second.core.start("user-1");
  mock.timers.tick(15_000 * 10);
  await flush();
  assert.equal(second.out.toasts.length, 0);
  assert.equal(second.out.bells.length, 0);
  assert.equal(second.out.sounds.length, 0);
  assert.equal(second.out.emitted.length, 0);
});

test("the fired-ledger is per account: another user on the same browser still gets the reminder", async () => {
  clock(at(2026, 10, 23, 9, 2));
  const storage = new Map();
  const reminders = [reminder({ id: "shared" })];
  const a = await makeEnv({ reminders, storage, update: "forbidden" });
  a.core.start("user-A");
  assert.equal(a.out.toasts.length, 1);
  a.core.stop();
  const b = await makeEnv({ reminders, storage, update: "forbidden" });
  b.core.start("user-B");
  assert.equal(b.out.toasts.length, 1, "user B has not been notified yet");
  b.core.stop();
});

test("two running listeners (two mounted schedulers) do not produce duplicate notifications or sounds", async () => {
  clock(at(2026, 10, 23, 9, 3));
  const { ReminderSchedulerCore } = await load("/src/notifications/reminderSchedulerCore.ts");
  const { ReminderLedger } = await load("/src/notifications/reminderLedger.ts");
  const storage = new Map();
  const reminders = [reminder()];
  const out = { toasts: [], bells: [], sounds: [], emitted: [] };
  const ledger = new ReminderLedger(() => ({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) }), () => Date.now());
  const make = () => new ReminderSchedulerCore({
    getPendingReminders: () => reminders, updateReminder: async () => {}, addReminder: async () => {},
    notifyBell: (b) => out.bells.push(b), pushToast: (t) => out.toasts.push(t), playSound: (k) => out.sounds.push(k), emitFired: (b) => out.emitted.push(b),
    ledger, now: () => new Date(), eventTarget: new EventTarget(), setInterval: (f, m) => globalThis.setInterval(f, m), clearInterval: (h) => globalThis.clearInterval(h),
    setTimeout: (f, m) => globalThis.setTimeout(f, m), log: console,
  });
  const a = make(); const b = make();
  a.start("u"); b.start("u");
  mock.timers.tick(15_000 * 8);
  await flush();
  assert.equal(out.toasts.length, 1);
  assert.equal(out.bells.length, 1);
  assert.equal(out.sounds.length, 1);
  a.stop(); b.stop();
});

test("starting the same scheduler twice (a re-mounted provider) registers one timer and one listener", async () => {
  clock(at(2026, 10, 23, 9, 3));
  const env = await makeEnv({ reminders: [reminder()] });
  env.core.start("u"); env.core.start("u"); env.core.start("u");
  mock.timers.tick(15_000 * 4);
  await flush();
  assert.equal(env.out.toasts.length, 1);
  env.core.stop();
  const before = env.out.toasts.length;
  mock.timers.tick(15_000 * 8);
  assert.equal(env.out.toasts.length, before, "stopped means stopped");
});

// ---------------------------------------------------------------- dismissal / completion / new reminders / timing

test("a reminder that is Completed or Dismissed never fires, and one dismissed after firing never fires again", async () => {
  clock(at(2026, 10, 23, 9, 5));
  const done = reminder({ id: "done", status: "Completed", isCompleted: true });
  const dismissed = reminder({ id: "dismissed", status: "Dismissed" });
  const cancelled = reminder({ id: "cancelled", status: "Cancelled" });
  const live = reminder({ id: "live" });
  const env = await makeEnv({ reminders: [done, dismissed, cancelled, live] });
  env.core.start("u");
  await flush();
  assert.deepEqual(env.out.toasts.map((t) => t.reminder.id), ["live"]);
  live.status = "Dismissed"; // the user dismisses it afterwards
  mock.timers.tick(15_000 * 20);
  await flush();
  assert.equal(env.out.toasts.length, 1, "still just the one original fire");
  env.core.stop();
});

test("a new reminder fires normally after older reminders were processed", async () => {
  clock(at(2026, 10, 23, 9, 30));
  const reminders = [reminder({ id: "old", reminderTime: "09:00" })];
  const env = await makeEnv({ reminders });
  env.core.start("u");
  await flush();
  assert.equal(env.out.toasts.length, 1);
  reminders.push(reminder({ id: "new", reminderTime: "09:40", title: "Chase the client" }));
  mock.timers.tick(5 * 60_000); // 09:35 — not yet
  assert.equal(env.out.toasts.length, 1);
  mock.timers.tick(6 * 60_000); // 09:41
  await flush();
  assert.deepEqual(env.out.toasts.map((t) => t.reminder.id), ["old", "new"]);
  assert.equal(env.out.sounds.length, 2);
  env.core.stop();
});

test("a future reminder never fires early; it fires on the first poll at or after its notify time", async () => {
  clock(at(2026, 10, 23, 8, 40));
  const reminders = [reminder({ id: "at-due", reminderTime: "09:00" }), reminder({ id: "five-before", reminderTime: "09:00", notifyOffset: "5 Minutes Before" }), reminder({ id: "tomorrow", reminderDate: "2026-10-24" })];
  const env = await makeEnv({ reminders });
  env.core.start("u");
  mock.timers.tick(14 * 60_000); // 08:54
  assert.equal(env.out.toasts.length, 0, "nothing before 08:55");
  mock.timers.tick(2 * 60_000); // 08:56 -> the "5 minutes before" one
  assert.deepEqual(env.out.toasts.map((t) => t.reminder.id), ["five-before"]);
  mock.timers.tick(5 * 60_000); // 09:01 -> the at-due one
  assert.deepEqual(env.out.toasts.map((t) => t.reminder.id), ["five-before", "at-due"]);
  mock.timers.tick(10 * 3_600_000); // later the same day: tomorrow's still not due
  assert.ok(!env.out.toasts.some((t) => t.reminder.id === "tomorrow"));
  env.core.stop();
});

test("a genuinely rescheduled reminder (same id, new date/time) fires again for the new occurrence, but not twice for the same one", async () => {
  clock(at(2026, 10, 23, 9, 5));
  const r = reminder({ id: "move-me" });
  const env = await makeEnv({ reminders: [r] });
  env.core.start("u");
  await flush();
  assert.equal(env.out.toasts.length, 1);
  Object.assign(r, { reminderDate: "2026-10-23", reminderTime: "09:20", notificationGenerated: false }); // edit -> scheduling reset
  mock.timers.tick(10 * 60_000); // 09:15 — not due
  assert.equal(env.out.toasts.length, 1);
  mock.timers.tick(10 * 60_000); // 09:25
  await flush();
  assert.equal(env.out.toasts.length, 2);
  mock.timers.tick(30 * 60_000);
  assert.equal(env.out.toasts.length, 2);
  env.core.stop();
});

test("the Bell entry and toast ids are deterministic per occurrence (so even a replay cannot add a duplicate)", async () => {
  clock(at(2026, 10, 23, 9, 5));
  const env = await makeEnv({ reminders: [reminder({ id: "abc" })] });
  env.core.start("u");
  const key = "abc|2026-10-23T09:00|At Due Time";
  assert.equal(env.out.bells[0].id, `reminder-trigger:${key}`);
  assert.equal(env.out.toasts[0].id, `toast-${key}`);
  env.core.stop();
  const wiring = src("notifications/reminderScheduler.ts");
  assert.match(wiring, /notificationService\.dispatchEvent\(\{\s*id,/, "the real wiring passes the deterministic id to the Bell store");
  const toasts = src("notifications/toastStore.ts");
  assert.match(toasts, /this\.toasts\.some\(\(t\) => t\.id === toast\.id\)\) return;/, "the toast store ignores a repeated id");
});

// ---------------------------------------------------------------- recurrence

test("recurrence maths: daily, weekly, monthly (no day drift, month-end clamped) and yearly (leap day)", async () => {
  const { occurrenceDate, nextOccurrence, isRecurring } = await load("/src/notifications/reminderRecurrence.ts");
  assert.equal(occurrenceDate("2026-10-23", "Daily", 1), "2026-10-24");
  assert.equal(occurrenceDate("2026-12-31", "Daily", 1), "2027-01-01");
  assert.equal(occurrenceDate("2026-10-23", "Weekly", 2), "2026-11-06");
  assert.equal(occurrenceDate("2026-01-31", "Monthly", 1), "2026-02-28");
  assert.equal(occurrenceDate("2026-01-31", "Monthly", 2), "2026-03-31", "anchored on the 31st: March is the 31st again, not the 28th");
  assert.equal(occurrenceDate("2026-11-30", "Monthly", 3), "2027-02-28");
  assert.equal(occurrenceDate("2026-12-15", "Monthly", 2), "2027-02-15");
  assert.equal(occurrenceDate("2028-02-29", "Yearly", 1), "2029-02-28");
  assert.equal(occurrenceDate("2028-02-29", "Yearly", 4), "2032-02-29");
  assert.equal(occurrenceDate("2026-10-23", "None", 1), null);
  assert.equal(isRecurring("Daily"), true);
  assert.equal(isRecurring("None"), false);
  assert.equal(isRecurring(undefined), false);
  const base = { reminderDate: "2026-10-23", reminderTime: "09:00", notifyOffset: "At Due Time" };
  assert.equal(nextOccurrence({ ...base, repeat: "None" }, at(2026, 10, 23, 9, 1)), null, "a one-time reminder has no next occurrence");
  assert.equal(nextOccurrence({ ...base, repeat: "Weekly" }, at(2026, 10, 23, 9, 1)).reminderDate, "2026-10-30");
});

test("a recurring reminder creates its next occurrence once when it fires, keeps the fired one as history, and follows the schedule", async () => {
  clock(at(2026, 10, 23, 9, 1));
  const env = await makeEnv({ reminders: [reminder({ id: "daily", repeat: "Daily" })] });
  env.core.start("u");
  await flush();
  mock.timers.tick(15_000 * 8);
  await flush();
  assert.equal(env.out.adds.length, 1, "exactly one successor, however many polls follow");
  const next = env.out.adds[0];
  assert.equal(next.reminderDate, "2026-10-24");
  assert.equal(next.reminderTime, "09:00");
  assert.equal(next.repeat, "Daily");
  assert.equal(next.status, "Pending");
  assert.equal(next.notificationGenerated, false);
  assert.equal(next.metadata.recurrenceOf, "daily");
  assert.equal(next.metadata.recurrenceAnchorDate, "2026-10-23");
  assert.equal(env.reminders.find((r) => r.id === "daily").notificationGenerated, true, "the one that fired stays, as history");
  // The next day the successor fires and creates the day after
  mock.timers.tick(24 * 3_600_000);
  await flush();
  assert.equal(env.out.toasts.length, 2);
  assert.equal(env.out.adds.length, 2);
  assert.equal(env.out.adds[1].reminderDate, "2026-10-25");
  assert.equal(env.out.adds[1].metadata.recurrenceIndex, 2);
  env.core.stop();
});

test("a one-time reminder is never treated as recurring", async () => {
  clock(at(2026, 10, 23, 9, 1));
  const env = await makeEnv({ reminders: [reminder({ repeat: "None" })] });
  env.core.start("u");
  mock.timers.tick(15_000 * 20);
  await flush();
  assert.equal(env.out.toasts.length, 1);
  assert.equal(env.out.adds.length, 0);
  env.core.stop();
});

test("after the app was closed for days, a recurring reminder does not replay a backlog: the next one is the first still in the future", async () => {
  clock(at(2026, 10, 28, 8, 0));
  const env = await makeEnv({ reminders: [reminder({ id: "weekly-daily", repeat: "Daily", reminderDate: "2026-10-23" })] });
  env.core.start("u");
  await flush();
  assert.equal(env.out.toasts.length, 1, "the overdue one fires once");
  assert.equal(env.out.adds.length, 1);
  assert.equal(env.out.adds[0].reminderDate, "2026-10-28", "today 09:00 is still ahead at 08:00; the missed 24th-27th are skipped");
  env.core.stop();
});

test("a failed successor creation is retried on a later poll for a transient error, never for a permanent refusal", async () => {
  clock(at(2026, 10, 23, 9, 1));
  const flaky = await makeEnv({ reminders: [reminder({ id: "wk", repeat: "Weekly" })], add: "flaky" });
  flaky.core.start("u");
  await flush();
  assert.equal(flaky.out.adds.length, 0);
  mock.timers.tick(15_000);
  await flush();
  assert.equal(flaky.out.adds.length, 1, "retried and created");
  mock.timers.tick(15_000 * 20);
  await flush();
  assert.equal(flaky.out.adds.length, 1, "and not created again");
  flaky.core.stop();

  mock.timers.reset();
  clock(at(2026, 10, 23, 9, 1));
  const readOnly = await makeEnv({ reminders: [reminder({ id: "wk2", repeat: "Weekly" })], add: "forbidden", update: "forbidden" });
  readOnly.core.start("u");
  mock.timers.tick(15_000 * 20);
  await flush();
  assert.equal(readOnly.out.addAttempts, 1, "a Read Only user's refused create is not retried");
  assert.equal(readOnly.out.toasts.length, 1, "but they are still notified, once");
  readOnly.core.stop();
});

// ---------------------------------------------------------------- time zones

test("due times are local wall-clock times: 09:00 fires at 09:00 local in any time zone, never early or late", async () => {
  const original = process.env.TZ;
  try {
    for (const tz of ["Asia/Kolkata", "America/New_York", "Pacific/Auckland", "UTC"]) {
      process.env.TZ = tz;
      mock.timers.reset();
      clock(at(2026, 10, 23, 8, 58, 30));
      const env = await makeEnv({ reminders: [reminder({ id: `tz-${tz}`, reminderDate: "2026-10-23", reminderTime: "09:00" })] });
      env.core.start("u");
      mock.timers.tick(15_000 * 5); // 08:59:45 — still before
      assert.equal(env.out.toasts.length, 0, `${tz}: not before 09:00 local`);
      mock.timers.tick(15_000 * 2); // 09:00:15
      await flush();
      assert.equal(env.out.toasts.length, 1, `${tz}: fires at 09:00 local`);
      assert.equal(env.out.toasts[0].dueAt, at(2026, 10, 23, 9, 0).toISOString(), `${tz}: due instant is local 09:00`);
      env.core.stop();
    }
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

// ---------------------------------------------------------------- ledger

test("ledger: persists across instances, is scoped per user, and prunes old / excess entries", async () => {
  const { ReminderLedger, reminderOccurrenceKey } = await load("/src/notifications/reminderLedger.ts");
  const storage = new Map();
  let now = Date.parse("2026-10-23T09:00:00Z");
  const make = () => new ReminderLedger(() => ({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) }), () => now);
  const a = make(); a.setScope("u1");
  const key = reminderOccurrenceKey({ id: "x", reminderDate: "2026-10-23", reminderTime: "09:00", notifyOffset: "At Due Time" });
  assert.equal(a.has(key), false);
  a.mark(key);
  assert.equal(a.has(key), true);
  const b = make(); b.setScope("u1");
  assert.equal(b.has(key), true, "survives a reload");
  const c = make(); c.setScope("u2");
  assert.equal(c.has(key), false, "another account is unaffected");
  now += 91 * 24 * 3_600_000;
  const d = make(); d.setScope("u1");
  d.mark("fresh");
  assert.equal(d.has(key), false, "entries older than 90 days are dropped");
  assert.equal(d.has("fresh"), true);
  for (let i = 0; i < 2100; i++) d.mark(`bulk-${i}`);
  assert.ok(d.size() <= 2000, `capped (${d.size()})`);
  assert.equal(d.has("bulk-2099"), true, "newest kept");
  // unreadable / corrupt storage never throws
  storage.set("pmo_reminder_fired_v1:u9", "{not json");
  const e = make(); e.setScope("u9");
  assert.equal(e.has("anything"), false);
  e.mark("k");
  assert.equal(e.has("k"), true);
});

// ---------------------------------------------------------------- robot alert

test("the robot alert follows what actually fired: one bubble per fired batch, never a repeat, never on a plain page load", async () => {
  const { buildAlertBubble, createAlertDeduper } = await load("/src/notifications/reminderAlertBubble.ts");
  const d = (key, over = {}) => ({ key, reminderId: key, projectId: "p", projectCode: "PR-9", title: `T ${key}`, isDueNow: true, firedAt: "x", ...over });
  assert.equal(buildAlertBubble([]), null);
  assert.deepEqual(buildAlertBubble([d("a")]), { header: "⚠ Reminder due now", body: "PR PR-9 — T a" });
  assert.equal(buildAlertBubble([d("a"), d("b"), d("c")]).body, "PR PR-9 — T a (+2 more)");
  assert.equal(buildAlertBubble([d("a", { isDueNow: false })]).header, "⚠ Reminder");
  const seen = createAlertDeduper();
  assert.equal(seen.filter([d("a"), d("b")]).length, 2);
  assert.equal(seen.filter([d("a"), d("b")]).length, 0, "the same occurrences are never alerted twice (second mounted robot, replay)");
  assert.deepEqual(seen.filter([d("a"), d("c")]).map((x) => x.key), ["c"]);

  const orb = src("components/PmoAssistant/PmoAssistantOrb.tsx");
  assert.ok(!/ALERT_REPEAT_MS|ALERT_POLL_MS|getReminderTriggerStatus|getPendingReminders/.test(orb), "the robot no longer polls pending reminders or repeats");
  assert.match(orb, /window\.addEventListener\(REMINDER_FIRED_EVENT, onFired\)/);
  assert.match(orb, /alertedOccurrences\.filter\(batch\)/);
  assert.match(orb, /reminderScheduler\.getRecentFires\(\)/);
});

test("the scheduler announces each fired batch once and remembers it briefly for a late-mounting listener", async () => {
  clock(at(2026, 10, 23, 9, 1));
  const env = await makeEnv({ reminders: [reminder({ id: "a" }), reminder({ id: "b", title: "Second" })] });
  env.core.start("u");
  assert.equal(env.out.emitted.length, 1);
  assert.deepEqual(env.out.emitted[0].map((x) => x.reminderId), ["a", "b"]);
  assert.equal(env.core.getRecentFires().length, 2);
  mock.timers.tick(5 * 60_000);
  assert.equal(env.core.getRecentFires().length, 0, "the replay window is short");
  assert.equal(env.out.emitted.length, 1, "no re-announcement");
  env.core.stop();
});
