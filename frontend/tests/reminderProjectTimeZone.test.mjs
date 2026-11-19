// Project-country time zones for Project Workspace reminders (Nov 2026). The browser running these tests is set to INDIA time, so every non-India assertion below is
// "an India user working on another country's project": the reminder must still be due, shown and fired at the PROJECT's local time. A reminder saved before this change
// (no timeZone / dueAt) must keep exactly its old behaviour.
process.env.TZ = "Asia/Kolkata";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
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

const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

// 10:00 local on 1 Dec 2026 in each country, as UTC.
const SEVEN = [
  ["India", "Asia/Kolkata", "2026-12-01T04:30:00.000Z"],
  ["Malaysia", "Asia/Kuala_Lumpur", "2026-12-01T02:00:00.000Z"],
  ["Oman", "Asia/Muscat", "2026-12-01T06:00:00.000Z"],
  ["Abu Dhabi", "Asia/Dubai", "2026-12-01T06:00:00.000Z"],
  ["FZI", "Asia/Dubai", "2026-12-01T06:00:00.000Z"],
  ["Elixir Qatar", "Asia/Qatar", "2026-12-01T07:00:00.000Z"],
  ["Qatar", "Asia/Qatar", "2026-12-01T07:00:00.000Z"],
];

const reminder = (over = {}) => ({
  id: over.id ?? `r-${Math.random().toString(36).slice(2)}`,
  projectId: "p1", projectCode: "PR-1", title: "Submit invoice", reminderType: "Invoice", priority: "Medium", status: "Pending",
  reminderDate: "2026-12-01", reminderTime: "10:00", notifyOffset: "At Due Time", repeat: "None", createdBy: "Asha", createdDate: "2026-11-01T00:00:00Z",
  isCompleted: false, notificationGenerated: false, ...over,
});

test("10:00 project time is the right UTC instant for all seven countries, from an India browser", async () => {
  const { zonedWallClockToUtc, utcToZonedWallClock } = await load("/src/utils/projectTimeZone.ts");
  for (const [country, zone, utc] of SEVEN) {
    assert.equal(zonedWallClockToUtc("2026-12-01", "10:00", zone).toISOString(), utc, country);
    assert.deepEqual(utcToZonedWallClock(new Date(utc), zone), { date: "2026-12-01", time: "10:00" }, `${country} round trip`);
  }
});

test("daylight saving is taken from the IANA zone (gap and overlap), should a project zone ever observe it", async () => {
  const { zonedWallClockToUtc } = await load("/src/utils/projectTimeZone.ts");
  assert.equal(zonedWallClockToUtc("2026-07-01", "09:00", "Europe/London").toISOString(), "2026-07-01T08:00:00.000Z", "summer (BST)");
  assert.equal(zonedWallClockToUtc("2026-12-01", "09:00", "Europe/London").toISOString(), "2026-12-01T09:00:00.000Z", "winter (GMT)");
  assert.equal(zonedWallClockToUtc("2026-03-29", "01:30", "Europe/London").toISOString(), "2026-03-29T01:30:00.000Z", "a time inside the spring-forward gap resolves just after it");
  assert.equal(zonedWallClockToUtc("2026-10-25", "01:30", "Europe/London").toISOString(), "2026-10-25T00:30:00.000Z", "an ambiguous fall-back time resolves to its first occurrence");
});

test("the due instant is the server's UTC dueAt; an old reminder keeps reading in the viewer's clock (not shifted)", async () => {
  const { reminderDueInstant } = await load("/src/utils/reminderDisplay.ts");
  const qatar = reminder({ timeZone: "Asia/Qatar", dueAt: "2026-12-01T07:00:00.000Z" });
  assert.equal(reminderDueInstant(qatar).toISOString(), "2026-12-01T07:00:00.000Z", "10:00 Doha, not 10:00 India");
  assert.equal(reminderDueInstant(reminder({ timeZone: "Asia/Qatar" })).toISOString(), "2026-12-01T07:00:00.000Z", "zone known before the server answers");
  assert.equal(reminderDueInstant(reminder()).toISOString(), "2026-12-01T04:30:00.000Z", "legacy: exactly the old reading (this browser is in India)");
});

test("the scheduler fires an India user's Qatar reminder at 10:00 Doha time (07:00 UTC), never at 10:00 India time", async () => {
  const { ReminderSchedulerCore } = await load("/src/notifications/reminderSchedulerCore.ts");
  let now = new Date("2026-12-01T04:30:00Z"); // 10:00 in India, 07:30 in Doha
  const fired = [];
  const reminders = [reminder({ id: "qa", timeZone: "Asia/Qatar", dueAt: "2026-12-01T07:00:00.000Z", notifyOffset: "10 Minutes Before" })];
  const marks = new Set();
  const core = new ReminderSchedulerCore({
    getPendingReminders: () => reminders,
    updateReminder: async () => undefined,
    addReminder: async () => undefined,
    notifyBell: (b) => fired.push(b.reminder.id),
    pushToast: () => undefined,
    playSound: () => undefined,
    emitFired: () => undefined,
    ledger: { has: (k) => marks.has(k), mark: (k) => void marks.add(k), setScope: () => undefined },
    now: () => now,
    eventTarget: new EventTarget(),
    setInterval: () => 0,
    clearInterval: () => undefined,
    setTimeout: () => 0,
    log: { warn: () => undefined, error: () => undefined },
  });
  assert.deepEqual(core.tick().map((f) => f.reminderId), [], "10:00 India is NOT the Qatar reminder's time");
  now = new Date("2026-12-01T06:49:59Z");
  assert.equal(core.tick().length, 0, "one second before the 10-minute notice");
  now = new Date("2026-12-01T06:50:00Z"); // 09:50 Doha
  assert.deepEqual(core.tick().map((f) => f.reminderId), ["qa"], "fires at 09:50 Doha (10 minutes before 10:00 Doha)");
  assert.equal(core.tick().length, 0, "once");
});

test("every one of the seven countries fires at its own 10:00, from the same India browser", async () => {
  const { computeTriggerTime } = await load("/src/notifications/reminderSchedulerCore.ts");
  for (const [country, zone, utc] of SEVEN) {
    assert.equal(computeTriggerTime(reminder({ timeZone: zone, dueAt: utc })).toISOString(), utc, country);
    assert.equal(computeTriggerTime(reminder({ timeZone: zone })).toISOString(), utc, `${country} (computed from the zone)`);
  }
});

test("display: the form preview, the status line and 'Today' are in the project's time, labelled with its zone", async () => {
  const { getReminderPreview, formatReminderTime, formatHumanDateString, getReminderStatusDisplay } = await load("/src/utils/reminderDisplay.ts");
  const now = new Date("2026-11-30T20:00:00Z"); // India: 1 Dec 01:30 · Qatar: 30 Nov 23:00
  assert.deepEqual(getReminderPreview("2026-12-01", "10:00", "At Due Time", "Asia/Qatar", now), { date: "Tomorrow", time: "10:00 AM · Qatar time" });
  assert.equal(formatHumanDateString("2026-11-30", "Asia/Qatar", now), "Today", "still 30 Nov in Doha");
  assert.equal(formatHumanDateString("2026-12-01", "Asia/Kolkata", now), "Today", "already 1 Dec in India");
  assert.equal(formatReminderTime(reminder({ timeZone: "Asia/Qatar" })), "10:00 AM · Qatar time");
  assert.equal(formatReminderTime(reminder({ timeZone: "Asia/Dubai" })), "10:00 AM · UAE time", "Abu Dhabi and FZE share the UAE zone");
  assert.equal(formatReminderTime(reminder()), "10:00 AM", "an old reminder shows no zone it never had");
  const today = getReminderStatusDisplay(reminder({ reminderDate: "2026-11-30", reminderTime: "23:30", timeZone: "Asia/Qatar", dueAt: "2026-11-30T20:30:00.000Z" }), now);
  assert.equal(today.detail, "Due Today at 11:30 PM · Qatar time", "today in Doha (already tomorrow in India), shown in Doha time");
});

test("recurrence: a daily Qatar reminder's next occurrence is the next day at 10:00 Doha time", async () => {
  const { nextOccurrence } = await load("/src/notifications/reminderRecurrence.ts");
  const r = reminder({ repeat: "Daily", timeZone: "Asia/Qatar" });
  // 06:30 UTC = 09:30 Doha but 12:00 India: an India-clock reading would wrongly skip today's 10:00 Doha occurrence... the first after the anchor is 2 Dec.
  assert.deepEqual(nextOccurrence(r, new Date("2026-12-01T07:05:00Z")), { reminderDate: "2026-12-02", reminderTime: "10:00", recurrenceAnchorDate: "2026-12-01", recurrenceIndex: 1 });
  assert.equal(nextOccurrence({ ...r, reminderDate: "2026-11-30" }, new Date("2026-12-01T06:30:00Z"))?.reminderDate, "2026-12-01", "today 10:00 Doha is still ahead at 09:30 Doha");
});

test("wiring: the form enters times in the project's zone, the drawer passes it, snooze stays in it, and no reminder rule changed", () => {
  const form = src("pages/Projects/components/workspace/ReminderForm.tsx");
  assert.match(form, /reminderDate: timeZone \? zonedToday\(timeZone\)/, "default date is today in the project's calendar");
  assert.match(form, /getReminderPreview\(formData\.reminderDate, formData\.reminderTime, formData\.notifyOffset, zone\)/);
  assert.ok(form.includes("`Times are in ${zoneLabel(zone, zoneCountry)} (${zone}), the project's country.`"), "the zone note");
  assert.doesNotMatch(form, /-mb-2" data-testid="reminder-time-zone"/, "no negative margin pulling the note over the date label");
  assert.match(form, /Saved before project time zones/);
  assert.match(form, /const REPEATS: ReminderRepeat\[\] = \["None", "Daily", "Weekly", "Monthly", "Yearly"\];/, "repeat options unchanged");
  assert.match(form, /"Invoice", "Client Meeting", "Payment Follow-up"/, "reminder types unchanged");
  const drawer = src("components/Dashboard/ProjectWorkspaceDrawer.tsx");
  assert.match(drawer, /timeZone=\{reminderService\.getProjectTimeZone\(project\.id\)\?\.timeZone\}/);
  const svc = src("services/reminders/ReminderService.ts");
  // Snooze moved into utils/reminderSnooze.ts (pure, tested in reminderTimeZoneSevenCountryQa.test.mjs); the service must use it with the project's zone.
  assert.match(svc, /snoozeTarget\(reminder\.reminderTime, option, new Date\(\), zone\)/);
  assert.match(src("utils/reminderSnooze.ts"), /tomorrow in the PROJECT's calendar/);
});
