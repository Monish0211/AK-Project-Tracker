import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { PR_CATEGORY_PREFIX_MAP } from "../projects/project.constants.js";
import { timeZoneForCountry, utcToZonedWallClock, zonedWallClockToUtc } from "../../shared/utils/projectTimeZone.js";

/**
 * Project-country time zones for Project Workspace reminders (real HTTP, scratch database, COUNTRY_ACCESS_MODE=enforce). A reminder's date + time are the PROJECT's local
 * time; the server converts them to UTC (dueAt) in the zone of the project's stored country, whoever creates it and wherever the server runs. Reminders saved before this
 * change keep NULL and are never shifted by an unrelated edit.
 */
const TAG = `rtz-${Date.now()}`;
const COUNTRIES = ["India", "Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"] as const;
type Country = (typeof COUNTRIES)[number];
// 10:00 on 1 Dec 2026 in each country, as UTC.
const EXPECTED: Record<Country, { zone: string; utc: string }> = {
  India: { zone: "Asia/Kolkata", utc: "2026-12-01T04:30:00.000Z" },
  Malaysia: { zone: "Asia/Kuala_Lumpur", utc: "2026-12-01T02:00:00.000Z" },
  Oman: { zone: "Asia/Muscat", utc: "2026-12-01T06:00:00.000Z" },
  "Abu Dhabi": { zone: "Asia/Dubai", utc: "2026-12-01T06:00:00.000Z" },
  FZI: { zone: "Asia/Dubai", utc: "2026-12-01T06:00:00.000Z" },
  "Elixir Qatar": { zone: "Asia/Qatar", utc: "2026-12-01T07:00:00.000Z" },
  Qatar: { zone: "Asia/Qatar", utc: "2026-12-01T07:00:00.000Z" },
};

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const region = new Map<string, { id: string; code: string | null; name: string }>();
const tokens = new Map<string, string>();
const created = { users: [] as string[], projects: [] as string[] };
const projects = new Map<string, { id: string; prNo: string }>();

async function makeUser(label: string, opts: { role?: string; countries?: Country[]; allCountries?: boolean }) {
  const roleName = opts.role ?? "Administrator";
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const modules = await prisma.module.findMany({ where: { name: { in: ["Projects"] } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `RTZ ${label}`, email: `${TAG}-${label.replace(/\W+/g, "")}@example.com`.toLowerCase(), passwordHash: await hashPassword("Reminder@123"), department: "PMO", roleId: role.id,
      forcePasswordChange: false, allCountriesAccess: opts.allCountries === true, moduleAccess: { create: modules.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: (opts.countries ?? []).map((c) => ({ regionId: region.get(c)!.id })) },
    },
  });
  created.users.push(user.id);
  tokens.set(label, signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName }));
}

async function makeProject(key: string, country: Country | null) {
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-11", prCategory: country ?? "India", prNo: `${country ? PR_CATEGORY_PREFIX_MAP[country] : "PR"}${TAG}-${key.replace(/\W+/g, "")}`, client: `RTZ ${key}`, department: "Process",
      domesticForeign: "Foreign", projectTitle: `RTZ ${key}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM",
      createdByUserId: null, regionId: country ? region.get(country)!.id : null,
    },
  });
  created.projects.push(project.id);
  projects.set(key, { id: project.id, prNo: project.prNo });
  return project;
}

const call = async (who: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(`${url}${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.get(who)!}`, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
};

const newReminder = (project: { prNo: string }, over: Record<string, unknown> = {}) => ({
  projectCode: project.prNo, title: `${TAG} reminder`, reminderType: "Invoice", priority: "High", status: "Pending", reminderDate: "2026-12-01", reminderTime: "10:00",
  notifyOffset: "10 Minutes Before", repeat: "None", ...over,
});

before(async () => {
  process.env["COUNTRY_ACCESS_MODE"] = "enforce";
  for (const r of await prisma.region.findMany({ select: { id: true, name: true, code: true } })) region.set(r.name, r);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  for (const c of COUNTRIES) await makeProject(c, c);
  await makeUser("all", { allCountries: true });
  // An India-based PMO Manager who also holds Qatar: where they sit must not matter.
  await makeUser("india user with qatar", { role: "PMO Manager", countries: ["India", "Qatar"] });
});

after(async () => {
  try {
    await prisma.projectReminder.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.userRegionAccess.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    process.env["COUNTRY_ACCESS_MODE"] = "off";
    await closeServer();
  }
});

describe("the project's country decides the reminder's time zone", () => {
  test("every country maps to its fixed IANA zone (by stored code and by name); no country means no zone (never India)", () => {
    for (const c of COUNTRIES) {
      const r = region.get(c)!;
      assert.equal(timeZoneForCountry({ code: r.code, name: r.name }), EXPECTED[c].zone, c);
      assert.equal(timeZoneForCountry({ name: c }), EXPECTED[c].zone, `${c} by name`);
    }
    assert.equal(timeZoneForCountry(null), null);
    assert.equal(timeZoneForCountry({ code: "atlantis", name: "Atlantis" }), null);
  });

  test("the conversion does not depend on the server's own time zone", () => {
    const original = process.env["TZ"];
    try {
      for (const tz of ["UTC", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Auckland"]) {
        process.env["TZ"] = tz;
        for (const c of COUNTRIES) assert.equal(zonedWallClockToUtc("2026-12-01", "10:00", EXPECTED[c].zone).toISOString(), EXPECTED[c].utc, `${c} on a ${tz} server`);
      }
    } finally {
      if (original === undefined) delete process.env["TZ"];
      else process.env["TZ"] = original;
    }
  });

  test("daylight saving comes from the IANA data: summer/winter, a spring-forward gap and a fall-back overlap", () => {
    assert.equal(zonedWallClockToUtc("2026-07-01", "09:00", "Europe/London").toISOString(), "2026-07-01T08:00:00.000Z");
    assert.equal(zonedWallClockToUtc("2026-12-01", "09:00", "Europe/London").toISOString(), "2026-12-01T09:00:00.000Z");
    assert.equal(zonedWallClockToUtc("2026-03-29", "01:30", "Europe/London").toISOString(), "2026-03-29T01:30:00.000Z", "gap: just after it");
    assert.equal(zonedWallClockToUtc("2026-10-25", "01:30", "Europe/London").toISOString(), "2026-10-25T00:30:00.000Z", "overlap: first occurrence");
    assert.equal(zonedWallClockToUtc("2026-03-08", "02:30", "America/New_York").toISOString(), "2026-03-08T07:30:00.000Z", "US gap");
    assert.deepEqual(utcToZonedWallClock(new Date("2026-12-01T07:00:00Z"), "Asia/Qatar"), { date: "2026-12-01", time: "10:00" });
  });
});

describe("creating, reading and editing Project Workspace reminders", () => {
  test("10:00 entered on each country's project is stored as that country's 10:00 in UTC, with its zone; the local date and time are kept as entered", async () => {
    for (const c of COUNTRIES) {
      const p = projects.get(c)!;
      const res = await call("all", "POST", `/projects/${p.id}/reminders`, newReminder(p, { title: `${TAG} ${c}` }));
      assert.equal(res.status, 201, `${c}: ${res.message}`);
      assert.equal(res.data.dueAt, EXPECTED[c].utc, c);
      assert.equal(res.data.timeZone, EXPECTED[c].zone, c);
      assert.equal(res.data.reminderTime, "10:00", `${c}: the local time is not rewritten`);
      assert.equal(String(res.data.reminderDate).slice(0, 10), "2026-12-01");
    }
  });

  test("an India user creating a Qatar project reminder gets 10:00 DOHA time (07:00 UTC), not 10:00 India time (04:30 UTC)", async () => {
    const p = projects.get("Qatar")!;
    const res = await call("india user with qatar", "POST", `/projects/${p.id}/reminders`, newReminder(p, { title: `${TAG} from India`, reminderTime: "10:00" }), { "X-Active-Country": region.get("Qatar")!.code! });
    assert.equal(res.status, 201, res.message);
    assert.equal(res.data.dueAt, "2026-12-01T07:00:00.000Z");
    assert.equal(res.data.timeZone, "Asia/Qatar");
    const list = await call("india user with qatar", "GET", `/projects/${p.id}/reminders`, undefined, { "X-Active-Country": region.get("Qatar")!.code! });
    assert.equal(list.status, 200);
    assert.equal(list.data.timeZone, "Asia/Qatar", "the project list says which zone a new reminder uses");
    assert.equal(list.data.items.find((r: any) => r.title === `${TAG} from India`).dueAt, "2026-12-01T07:00:00.000Z", "read back in the same instant");
  });

  test("changing the time re-computes the instant in the project's zone; other edits leave it as it is", async () => {
    const p = projects.get("Oman")!;
    const createdRes = await call("all", "POST", `/projects/${p.id}/reminders`, newReminder(p, { title: `${TAG} edit` }));
    const id = createdRes.data.id;
    const moved = await call("all", "PATCH", `/reminders/${id}`, { reminderTime: "15:30" });
    assert.equal(moved.status, 200, moved.message);
    assert.equal(moved.data.dueAt, "2026-12-01T11:30:00.000Z", "15:30 Muscat");
    const nextDay = await call("all", "PATCH", `/reminders/${id}`, { reminderDate: "2026-12-02" });
    assert.equal(nextDay.data.dueAt, "2026-12-02T11:30:00.000Z");
    const retitled = await call("all", "PATCH", `/reminders/${id}`, { title: `${TAG} edit renamed`, priority: "Low" });
    assert.equal(retitled.data.dueAt, "2026-12-02T11:30:00.000Z");
  });

  test("a reminder saved before project time zones is NOT shifted by an unrelated edit, or by the scheduler's 'notified' flag; only a new date or time converts it", async () => {
    const p = projects.get("Qatar")!;
    const legacy = await prisma.projectReminder.create({
      data: { projectId: p.id, projectCode: p.prNo, title: `${TAG} legacy`, reminderType: "Invoice", priority: "High", status: "Pending", reminderDate: new Date("2026-12-01"), reminderTime: "10:00", notifyOffset: "At Due Time", repeat: "None", createdBy: "RTZ" },
    });
    assert.equal(legacy.dueAt, null);
    const touched = await call("all", "PATCH", `/reminders/${legacy.id}`, { title: `${TAG} legacy renamed`, notificationGenerated: true, triggeredAt: "2026-12-01T05:00:00.000Z" });
    assert.equal(touched.status, 200, touched.message);
    assert.equal(touched.data.dueAt, null, "still unconverted");
    assert.equal(touched.data.timeZone, null);
    const sameTime = await call("all", "PATCH", `/reminders/${legacy.id}`, { reminderDate: "2026-12-01", reminderTime: "10:00" });
    assert.equal(sameTime.data.dueAt, null, "re-saving the same date and time (an edit form) does not convert it either");
    const rescheduled = await call("all", "PATCH", `/reminders/${legacy.id}`, { reminderTime: "11:00" });
    assert.equal(rescheduled.data.dueAt, "2026-12-01T08:00:00.000Z", "a NEW time is saved in Doha time");
    assert.equal(rescheduled.data.timeZone, "Asia/Qatar");
  });

  test("a project with no country gets no zone and no instant (nothing guessed)", async () => {
    process.env["COUNTRY_ACCESS_MODE"] = "off"; // an unclassified project is only reachable with country access off
    try {
      const p = await makeProject("no country", null);
      const res = await call("all", "POST", `/projects/${p.id}/reminders`, newReminder(p, { title: `${TAG} nowhere` }));
      assert.equal(res.status, 201, res.message);
      assert.equal(res.data.dueAt, null);
      assert.equal(res.data.timeZone, null);
      assert.equal((await call("all", "GET", `/projects/${p.id}/reminders`)).data.timeZone, null);
    } finally {
      process.env["COUNTRY_ACCESS_MODE"] = "enforce";
    }
  });

  test("full lifecycle per country: the workspace list and the global list read back the same instant and local time; an edit moves it by exactly the edited amount", async () => {
    for (const c of COUNTRIES) {
      const p = projects.get(c)!;
      const made = await call("all", "POST", `/projects/${p.id}/reminders`, newReminder(p, { title: `${TAG} life ${c}`, reminderDate: "2027-01-31", reminderTime: "23:45" }));
      assert.equal(made.status, 201, made.message);
      const expected = zonedWallClockToUtc("2027-01-31", "23:45", EXPECTED[c].zone).toISOString();
      assert.equal(made.data.dueAt, expected, `${c} create`);
      const ws = (await call("all", "GET", `/projects/${p.id}/reminders`)).data;
      assert.equal(ws.timeZone, EXPECTED[c].zone);
      const fromWs = ws.items.find((r: any) => r.id === made.data.id);
      const fromAll = (await call("all", "GET", "/reminders", undefined, "ALL")).data.items.find((r: any) => r.id === made.data.id);
      for (const r of [fromWs, fromAll]) {
        assert.equal(r.dueAt, expected, `${c} read back`);
        assert.equal(r.reminderTime, "23:45");
        assert.equal(String(r.reminderDate).slice(0, 10), "2027-01-31");
        assert.equal(r.timeZone, EXPECTED[c].zone);
      }
      const edited = await call("all", "PATCH", `/reminders/${made.data.id}`, { reminderTime: "08:15", reminderDate: "2027-02-01" });
      assert.equal(new Date(edited.data.dueAt).getTime() - new Date(expected).getTime(), (8 * 60 + 30) * 60_000, `${c}: 23:45 -> next day 08:15 is 8 h 30 min later`);
    }
  });

  test("daylight-saving policy on the server: a nonexistent local time is refused (400), an ambiguous one is its first occurrence", async () => {
    const { localTimeIssue } = await import("../../shared/utils/projectTimeZone.js");
    assert.equal(localTimeIssue("2027-03-14", "02:30", "America/New_York"), "nonexistent");
    assert.equal(localTimeIssue("2027-11-07", "01:30", "America/New_York"), "ambiguous");
    assert.equal(zonedWallClockToUtc("2027-11-07", "01:30", "America/New_York").toISOString(), "2027-11-07T05:30:00.000Z");
    for (const c of COUNTRIES) assert.equal(localTimeIssue("2027-03-14", "02:30", EXPECTED[c].zone), null, `${c} has no daylight saving`);
  });

  test("reminder types, priorities, repeat and notify-before values are stored exactly as sent", async () => {
    const p = projects.get("Malaysia")!;
    const res = await call("all", "POST", `/projects/${p.id}/reminders`, newReminder(p, { title: `${TAG} fields`, reminderType: "Client Meeting", priority: "Critical", repeat: "Weekly", notifyOffset: "1 Day Before" }));
    assert.deepEqual([res.data.reminderType, res.data.priority, res.data.repeat, res.data.notifyOffset], ["Client Meeting", "Critical", "Weekly", "1 Day Before"]);
    assert.equal(res.data.dueAt, "2026-12-01T02:00:00.000Z");
  });
});
