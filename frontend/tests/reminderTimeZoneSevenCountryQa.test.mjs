// FINAL QA (Nov 2026): the complete Project Workspace reminder time lifecycle for all seven countries, evaluated as if the BROWSER were in five different places
// (India, Qatar, Malaysia, New York and Auckland, the last two with daylight saving). Node re-reads process.env.TZ when it is assigned, so each block below switches
// the device clock and repeats the same assertions: the same reminder must be the same instant, show the same project-local time and notify at the same moment.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
const ORIGINAL_TZ = process.env.TZ;
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error", optimizeDeps: { noDiscovery: true, include: [] } });
  load = (p) => vite.ssrLoadModule(p);
});
after(async () => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
  await vite?.close();
});
const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

const BROWSERS = ["Asia/Kolkata", "Asia/Qatar", "Asia/Kuala_Lumpur", "America/New_York", "Pacific/Auckland"];
// Each country's zone and the UTC instant of 14:30 local on 15 Mar 2027 (a date on which New York and Auckland have DST in force / ending around it).
const COUNTRIES = [
  ["India", "Asia/Kolkata", "2027-03-15T09:00:00.000Z"],
  ["Malaysia", "Asia/Kuala_Lumpur", "2027-03-15T06:30:00.000Z"],
  ["Oman", "Asia/Muscat", "2027-03-15T10:30:00.000Z"],
  ["Abu Dhabi", "Asia/Dubai", "2027-03-15T10:30:00.000Z"],
  ["FZE", "Asia/Dubai", "2027-03-15T10:30:00.000Z"],
  ["Elixir Qatar", "Asia/Qatar", "2027-03-15T11:30:00.000Z"],
  ["Qatar", "Asia/Qatar", "2027-03-15T11:30:00.000Z"],
];
const OFFSETS = [["At Due Time", 0], ["1 Minute Before", 1], ["5 Minutes Before", 5], ["10 Minutes Before", 10], ["30 Minutes Before", 30], ["1 Hour Before", 60], ["1 Day Before", 1440]];

const reminder = (over = {}) => ({
  id: over.id ?? `r-${Math.random().toString(36).slice(2)}`, projectId: "p1", projectCode: "PR-1", title: "QA", reminderType: "Invoice", priority: "High", status: "Pending",
  reminderDate: "2027-03-15", reminderTime: "14:30", notifyOffset: "At Due Time", repeat: "None", createdBy: "QA", createdDate: "2027-01-01T00:00:00Z",
  isCompleted: false, notificationGenerated: false, ...over,
});

function makeCore(ReminderSchedulerCore, reminders, clock) {
  const fired = [];
  const adds = [];
  const marks = new Set();
  const core = new ReminderSchedulerCore({
    getPendingReminders: () => reminders.filter((r) => r.status === "Pending"),
    updateReminder: async (id, u) => Object.assign(reminders.find((r) => r.id === id) ?? {}, u),
    addReminder: async (r) => { adds.push(r); },
    notifyBell: (b) => fired.push(b.reminder.id), pushToast: () => undefined, playSound: () => undefined, emitFired: () => undefined,
    ledger: { has: (k) => marks.has(k), mark: (k) => void marks.add(k), setScope: () => undefined },
    now: () => clock.now, eventTarget: new EventTarget(), setInterval: () => 0, clearInterval: () => undefined, setTimeout: () => 0, log: { warn() {}, error() {} },
  });
  return { core, fired, adds };
}

for (const browser of BROWSERS) {
  test(`[browser in ${browser}] A-D: create, display, edit and notify for all seven countries`, async () => {
    process.env.TZ = browser;
    const tz = await load("/src/utils/projectTimeZone.ts");
    const display = await load("/src/utils/reminderDisplay.ts");
    const { ReminderSchedulerCore, computeTriggerTime } = await load("/src/notifications/reminderSchedulerCore.ts");
    for (const [country, zone, utc] of COUNTRIES) {
      // A. Creation: 14:30 project-local is the expected instant whatever the device clock; the form preview says it in the project's time.
      assert.equal(tz.zonedWallClockToUtc("2027-03-15", "14:30", zone).toISOString(), utc, `${country} create`);
      const preview = display.getReminderPreview("2027-03-15", "14:30", "At Due Time", zone, new Date("2027-03-14T12:00:00Z"));
      assert.equal(preview.time, `2:30 PM · ${tz.zoneLabel(zone)}`, `${country} preview time`);
      // B. Display: the stored reminder (as the server returns it) reads 14:30 project time in the card, the Assistant and the toast (all use these helpers).
      const stored = reminder({ timeZone: zone, dueAt: utc, country });
      assert.equal(display.formatReminderTime(stored), `2:30 PM · ${tz.zoneLabel(zone)}`, `${country} label`);
      assert.equal(display.reminderDueInstant(stored).toISOString(), utc, `${country} instant`);
      assert.deepEqual(tz.utcToZonedWallClock(new Date(utc), zone), { date: "2027-03-15", time: "14:30" }, `${country} round trip`);
      // C. Edit to 09:15: the new instant is 09:15 project time (5 h 15 min earlier), no other shift.
      assert.equal(tz.zonedWallClockToUtc("2027-03-15", "09:15", zone).getTime(), new Date(utc).getTime() - (5 * 60 + 15) * 60_000, `${country} edit`);
      // D. Notify-before: every option notifies exactly that long before the project-local due time, never early.
      for (const [offset, minutes] of OFFSETS) {
        const r = reminder({ id: `${country}-${offset}`, timeZone: zone, dueAt: utc, notifyOffset: offset });
        const expected = new Date(utc).getTime() - minutes * 60_000;
        assert.equal(computeTriggerTime(r).getTime(), expected, `${country} ${offset}`);
        const clock = { now: new Date(expected - 1) };
        const { core, fired } = makeCore(ReminderSchedulerCore, [r], clock);
        assert.equal(core.tick().length, 0, `${country} ${offset}: not 1 ms early`);
        clock.now = new Date(expected);
        assert.deepEqual(core.tick().map((f) => f.reminderId), [r.id], `${country} ${offset}: fires on time`);
        clock.now = new Date(expected + 60_000);
        assert.equal(core.tick().length, 0, `${country} ${offset}: once`);
        assert.deepEqual(fired, [r.id]);
      }
    }
  });

  test(`[browser in ${browser}] E: recurrence (all options, month-end, year-end, leap day) stays at the project's local time`, async () => {
    process.env.TZ = browser;
    const { nextOccurrence } = await load("/src/notifications/reminderRecurrence.ts");
    const tz = await load("/src/utils/projectTimeZone.ts");
    const zone = "Asia/Qatar";
    const at = (date, time = "14:30") => tz.zonedWallClockToUtc(date, time, zone);
    const cases = [
      ["Daily", "2027-03-15", "2027-03-16"],
      ["Weekly", "2027-03-15", "2027-03-22"],
      ["Monthly", "2027-01-31", "2027-02-28"], // month-end clamps
      ["Monthly", "2027-12-15", "2028-01-15"], // year-end
      ["Yearly", "2028-02-29", "2029-02-28"], // leap day in a common year
      ["Daily", "2027-12-31", "2028-01-01"], // year-end
    ];
    for (const [repeat, anchor, expected] of cases) {
      const r = reminder({ repeat, reminderDate: anchor, timeZone: zone });
      const fireMoment = new Date(at(anchor).getTime() + 1000); // just after this occurrence fired
      const next = nextOccurrence(r, fireMoment);
      assert.equal(next.reminderDate, expected, `${repeat} from ${anchor}`);
      assert.equal(next.reminderTime, "14:30", `${repeat}: the same local time`);
    }
    // No missed occurrence and no backlog: closed for 3 days, a daily reminder resumes at the first FUTURE 14:30 Doha.
    const daily = reminder({ repeat: "Daily", reminderDate: "2027-03-15", timeZone: zone });
    assert.equal(nextOccurrence(daily, new Date(at("2027-03-18", "12:00"))).reminderDate, "2027-03-18", "today's 14:30 Doha is still ahead");
    assert.equal(nextOccurrence(daily, new Date(at("2027-03-18", "15:00"))).reminderDate, "2027-03-19");
  });

  test(`[browser in ${browser}] E: a recurring reminder fires once and spawns exactly one next occurrence, even with repeated ticks`, async () => {
    process.env.TZ = browser;
    const { ReminderSchedulerCore } = await load("/src/notifications/reminderSchedulerCore.ts");
    const utc = "2027-03-15T11:30:00.000Z";
    const r = reminder({ id: "rec", repeat: "Weekly", timeZone: "Asia/Qatar", dueAt: utc });
    const clock = { now: new Date(utc) };
    const { core, fired, adds } = makeCore(ReminderSchedulerCore, [r], clock);
    core.tick();
    core.tick();
    clock.now = new Date(Date.parse(utc) + 30_000);
    core.tick();
    await new Promise((res) => setTimeout(res, 0));
    assert.deepEqual(fired, ["rec"], "one notification");
    assert.equal(adds.length, 1, "one next occurrence");
    assert.equal(adds[0].reminderDate, "2027-03-22");
    assert.equal(adds[0].reminderTime, "14:30");
  });

  test(`[browser in ${browser}] F: snooze is computed in the project's zone and creates a new reminder (the original is not edited)`, async () => {
    process.env.TZ = browser;
    const { snoozeTarget } = await load("/src/utils/reminderSnooze.ts");
    const now = new Date("2027-03-15T11:32:20Z"); // 14:32:20 in Doha, 17:02:20 in India
    assert.deepEqual(snoozeTarget("14:30", "5m", now, "Asia/Qatar"), { date: "2027-03-15", time: "14:37" });
    assert.deepEqual(snoozeTarget("14:30", "1h", now, "Asia/Qatar"), { date: "2027-03-15", time: "15:32" });
    assert.deepEqual(snoozeTarget("14:30", "tomorrow", now, "Asia/Qatar"), { date: "2027-03-16", time: "14:30" });
    // 23:50 in Kuala Lumpur + 30 min crosses midnight in the PROJECT's calendar.
    assert.deepEqual(snoozeTarget("23:00", "30m", new Date("2027-03-15T15:50:00Z"), "Asia/Kuala_Lumpur"), { date: "2027-03-16", time: "00:20" });
    assert.deepEqual(snoozeTarget("09:00", "tomorrow", new Date("2027-03-15T20:30:00Z"), "Asia/Kolkata"), { date: "2027-03-17", time: "09:00" }, "02:00 on the 16th in India: tomorrow is the 17th");
  });
}

test("F: snooze looks up the project's zone for a reminder saved before project time zones, and never edits the original", () => {
  const svc = src("services/reminders/ReminderService.ts");
  const body = svc.slice(svc.indexOf("async snoozeReminder("), svc.indexOf("private emitChange"));
  assert.match(body, /reminder\.timeZone \?\? \(await this\.resolveProjectZone\(reminder\.projectId\)\)/);
  assert.match(body, /return this\.addReminder\(\{/);
  assert.doesNotMatch(body, /updateReminder\(/, "the original reminder is not modified");
});

test("G: daylight-saving policy: nonexistent local times are refused, ambiguous ones mean the first occurrence; none of the seven zones has either", async () => {
  const tz = await load("/src/utils/projectTimeZone.ts");
  assert.equal(tz.localTimeIssue("2027-03-14", "02:30", "America/New_York"), "nonexistent");
  assert.equal(tz.localTimeIssue("2027-11-07", "01:30", "America/New_York"), "ambiguous");
  assert.equal(tz.zonedWallClockToUtc("2027-11-07", "01:30", "America/New_York").toISOString(), "2027-11-07T05:30:00.000Z", "first occurrence (EDT)");
  assert.equal(tz.localTimeIssue("2027-03-15", "02:30", "America/New_York"), null, "a normal date");
  assert.equal(tz.localTimeIssue("2027-04-04", "02:30", "Pacific/Auckland"), "ambiguous", "southern hemisphere fall-back");
  assert.equal(tz.localTimeIssue("2027-09-26", "02:30", "Pacific/Auckland"), "nonexistent", "southern hemisphere spring-forward");
  // Every hour of every day of 2027 in the seven project zones: no gap, no overlap.
  const zones = ["Asia/Kolkata", "Asia/Kuala_Lumpur", "Asia/Muscat", "Asia/Dubai", "Asia/Qatar"];
  for (const zone of zones)
    for (let day = 0; day < 365; day++) {
      const d = new Date(Date.UTC(2027, 0, 1 + day));
      const date = d.toISOString().slice(0, 10);
      for (let h = 0; h < 24; h++) assert.equal(tz.localTimeIssue(date, `${String(h).padStart(2, "0")}:30`, zone), null, `${zone} ${date} ${h}:30`);
    }
  const form = src("pages/Projects/components/workspace/ReminderForm.tsx");
  assert.match(form, /localTimeIssue\(formData\.reminderDate, formData\.reminderTime, zone\) === "nonexistent"/, "the form refuses it before saving");
});

test("H: legacy reminders (saved before project time zones) keep the device-clock reading, exactly as before", async () => {
  const display = await load("/src/utils/reminderDisplay.ts");
  for (const browser of BROWSERS) {
    process.env.TZ = browser;
    const legacy = reminder();
    assert.equal(display.reminderDueInstant(legacy).getTime(), new Date("2027-03-15T14:30:00").getTime(), `${browser}: the old reading`);
  }
});
