import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { PR_CATEGORY_PREFIX_MAP } from "../projects/project.constants.js";

/**
 * Country-wise reminders over real HTTP and the scratch database (COUNTRY_ACCESS_MODE=enforce):
 *  - Project Workspace reminders follow their project's stored country: a user sees only the countries they hold (list AND per-project), a multi-country user gets each
 *    reminder labelled with its country, and the selected country narrows the list.
 *  - Important reminders never leave their country.
 *  - The per-country project reminder alerts switch is audited and country-checked.
 *  - There is NO per-country weekly-email setting: the two Weekly Emails stay global (see weeklyPreviewAndRetryCountryScope.http.test.ts).
 */
const TAG = `crm-${Date.now()}`;
const COUNTRIES = ["India", "Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"] as const;
type Country = (typeof COUNTRIES)[number];

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const region = new Map<string, { id: string; code: string; label: string }>();
const tokens = new Map<string, string>();
const created = { users: [] as string[], projects: [] as string[] };

async function makeUser(label: string, opts: { role?: string; countries?: Country[]; allCountries?: boolean; modules?: string[] }) {
  const roleName = opts.role ?? "Administrator";
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const modules = await prisma.module.findMany({ where: { name: { in: opts.modules ?? ["Settings", "Projects"] } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `CRM ${label}`,
      email: `${TAG}-${label.replace(/\s+/g, "")}@example.com`.toLowerCase(),
      passwordHash: await hashPassword("Reminder@123"),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      allCountriesAccess: opts.allCountries === true,
      moduleAccess: { create: modules.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: (opts.countries ?? []).map((c) => ({ regionId: region.get(c)!.id })) },
    },
  });
  created.users.push(user.id);
  tokens.set(label, signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName }));
}

const call = async (who: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(`${url}${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.get(who)!}`, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
};

let seq = 0;
async function makeProject(country: Country) {
  seq += 1;
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-11", prCategory: country, prNo: `${PR_CATEGORY_PREFIX_MAP[country]}${TAG}-${seq}`, client: `CRM ${country}`, department: "Process", domesticForeign: "Foreign",
      projectTitle: `CRM ${country} ${seq}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", createdByUserId: null,
      regionId: region.get(country)!.id,
    },
  });
  created.projects.push(project.id);
  return project;
}

async function addProjectReminder(project: { id: string; prNo: string }, title: string) {
  return prisma.projectReminder.create({
    data: { projectId: project.id, projectCode: project.prNo, title, reminderType: "General", priority: "Medium", status: "Pending", reminderDate: new Date("2026-12-01"), reminderTime: "10:00", notifyOffset: "0", repeat: "none", createdBy: "CRM" } as never,
  });
}

before(async () => {
  process.env["COUNTRY_ACCESS_MODE"] = "enforce";
  for (const r of await prisma.region.findMany({ select: { id: true, name: true, code: true, displayName: true } })) region.set(r.name, { id: r.id, code: r.code ?? r.name, label: r.displayName?.trim() || r.name });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  for (const c of COUNTRIES) await makeUser(`adm ${c}`, { countries: [c] });
  await makeUser("adm all", { allCountries: true });
  await makeUser("adm none", {});
  await makeUser("pm india", { role: "PMO Manager", countries: ["India"] });
  await makeUser("pm india+malaysia", { role: "PMO Manager", countries: ["India", "Malaysia"] });
  const other = await prisma.portalRole.findFirstOrThrow({ where: { name: { notIn: ["Administrator", "PMO Manager", "Read Only"] } } });
  await makeUser("user india", { role: other.name, countries: ["India"], modules: ["Projects"] });
  await makeUser("user malaysia", { role: other.name, countries: ["Malaysia"], modules: ["Projects"] });
});

after(async () => {
  try {
    await prisma.countryReminder.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.countryReminderSettingAudit.deleteMany({ where: { actorUserId: { in: created.users } } });
    await prisma.countryReminderSetting.deleteMany({ where: { updatedByUserId: { in: created.users } } });
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

const settingOf = (list: any, country: string) => list.countries.find((c: any) => c.regionId === region.get(country)!.id)?.settings.find((s: any) => s.type === "PROJECT_REMINDERS");

describe("Project Workspace reminders follow the project's country (all seven)", () => {
  const projects = new Map<Country, { id: string; prNo: string }>();

  before(async () => {
    for (const c of COUNTRIES) {
      const p = await makeProject(c);
      projects.set(c, p);
      await addProjectReminder(p, `${TAG} pr ${c}`);
    }
  });

  const mine = async (who: string, headers: Record<string, string> = {}) =>
    ((await call(who, "GET", "/reminders", undefined, headers)).data.items as any[]).filter((r) => String(r.title).startsWith(`${TAG} pr `));

  test("each country's administrator sees exactly that country's project reminders, labelled with the project's country", async () => {
    for (const c of COUNTRIES) {
      const list = await mine(`adm ${c}`);
      assert.deepEqual(list.map((r) => r.title), [`${TAG} pr ${c}`], c);
      assert.equal(list[0].regionId, region.get(c)!.id);
      assert.equal(list[0].country, region.get(c)!.label);
    }
  });

  test("an India-only user sees India only; a Malaysia-only user sees Malaysia only (not an administrator either)", async () => {
    assert.deepEqual((await mine("user india")).map((r) => r.title), [`${TAG} pr India`]);
    assert.deepEqual((await mine("user malaysia")).map((r) => r.title), [`${TAG} pr Malaysia`]);
  });

  test("a project of another country cannot be opened for its reminders, even by an Administrator", async () => {
    assert.equal((await call("user india", "GET", `/projects/${projects.get("Malaysia")!.id}/reminders`)).status, 403);
    assert.equal((await call("adm India", "GET", `/projects/${projects.get("Oman")!.id}/reminders`)).status, 403);
    const own = await call("user india", "GET", `/projects/${projects.get("India")!.id}/reminders`);
    assert.equal(own.status, 200);
    assert.equal(own.data.items[0].country, region.get("India")!.label);
  });

  test("a multi-country user receives both countries, each reminder carrying its own country (the Assistant shows them in separate sections)", async () => {
    const list = await mine("pm india+malaysia");
    assert.deepEqual(list.map((r) => r.country).sort(), [region.get("India")!.label, region.get("Malaysia")!.label].sort());
    const selected = await mine("pm india+malaysia", { "X-Active-Country": region.get("Malaysia")!.code });
    assert.deepEqual(selected.map((r) => r.title), [`${TAG} pr Malaysia`], "switching to Malaysia never returns India's");
    assert.equal((await call("pm india+malaysia", "GET", "/reminders", undefined, { "X-Active-Country": region.get("Oman")!.code })).status, 403, "a country not held is refused");
    assert.equal((await mine("adm all")).length, 7, "All Countries: all seven");
  });

  test("a user with no country receives no project reminders", async () => {
    const res = await call("adm none", "GET", "/reminders");
    assert.ok(res.status === 403 || (res.data?.items ?? []).filter((r: any) => String(r.title).startsWith(`${TAG} pr `)).length === 0, `status ${res.status}`);
  });
});

describe("Settings → Country Reminders: the project reminder alerts switch, per country", () => {
  test("a country administrator sees only the countries they hold; All Countries sees all seven; a user with no country sees none", async () => {
    for (const c of COUNTRIES) {
      const res = await call(`adm ${c}`, "GET", "/country-reminder-settings");
      assert.equal(res.status, 200);
      assert.deepEqual(res.data.countries.map((x: any) => x.regionId), [region.get(c)!.id], c);
      assert.deepEqual(res.data.countries[0].settings.map((s: any) => s.type), ["PROJECT_REMINDERS"], "no weekly-email setting per country");
    }
    assert.equal((await call("adm all", "GET", "/country-reminder-settings")).data.countries.length >= 7, true);
    assert.deepEqual((await call("adm none", "GET", "/country-reminder-settings")).data.countries, []);
  });

  test("the Weekly Emails cannot be configured per country (they stay global)", async () => {
    const india = region.get("India")!.id;
    for (const type of ["WEEKLY_MISSING_EXPENSE", "WEEKLY_UNPAID_INVOICE"]) {
      assert.equal((await call("adm India", "PUT", `/country-reminder-settings/${india}/${type}`, { enabled: true })).status, 400, type);
    }
    assert.equal((await call("adm India", "PUT", `/country-reminder-settings/${india}/recipients`, { toUserId: "x" })).status, 400);
    assert.equal((await call("adm India", "GET", `/country-reminder-settings/${india}/runs`)).status, 404);
  });

  test("switching India off does not change Malaysia, and the change is audited with who, previous and new", async () => {
    const india = region.get("India")!.id;
    const res = await call("adm India", "PUT", `/country-reminder-settings/${india}/PROJECT_REMINDERS`, { enabled: false });
    assert.equal(res.status, 200, res.message);
    const all = (await call("adm all", "GET", "/country-reminder-settings")).data;
    assert.equal(settingOf(all, "India").enabled, false);
    for (const c of COUNTRIES.filter((x) => x !== "India")) assert.equal(settingOf(all, c).enabled, true, `${c} unchanged`);
    const audit = (await call("adm India", "GET", `/country-reminder-settings/${india}/audit`)).data.items.filter((a: any) => a.actorName === "CRM adm India");
    assert.equal(audit.length >= 1, true);
    assert.deepEqual(audit[0].previousValue, { enabled: true });
    assert.deepEqual(audit[0].newValue, { enabled: false });
    assert.ok(audit[0].changedAt);
    assert.equal((await call("adm India", "PUT", `/country-reminder-settings/${india}/PROJECT_REMINDERS`, { enabled: true })).status, 200);
  });

  test("no country, no role: India's administrator cannot change Oman; a non-administrator cannot change India; bad input is refused", async () => {
    const oman = region.get("Oman")!.id;
    const india = region.get("India")!.id;
    assert.equal((await call("adm India", "PUT", `/country-reminder-settings/${oman}/PROJECT_REMINDERS`, { enabled: false })).status, 403);
    assert.equal((await call("adm none", "PUT", `/country-reminder-settings/${india}/PROJECT_REMINDERS`, { enabled: false })).status, 403);
    assert.equal((await call("user india", "PUT", `/country-reminder-settings/${india}/PROJECT_REMINDERS`, { enabled: false })).status, 403);
    assert.equal((await call("adm India", "PUT", `/country-reminder-settings/${india}/PROJECT_REMINDERS`, { enabled: "no" })).status, 400);
    assert.equal((await call("adm India", "GET", `/country-reminder-settings/${oman}/audit`)).status, 403, "another country's audit is not readable either");
    assert.equal((await call("pm india", "PUT", `/country-reminder-settings/${india}/PROJECT_REMINDERS`, { enabled: true })).status, 200, "a PMO Manager holding India may");
  });

  test("India's switch removes India's project reminders from delivery and leaves Oman's", async () => {
    const ind = await makeProject("India");
    const omn = await makeProject("Oman");
    for (const p of [ind, omn]) await addProjectReminder(p, `${TAG} r`);
    const listed = async () => ((await call("adm all", "GET", "/reminders")).data.items as any[]).filter((r) => r.title === `${TAG} r`).map((r) => r.projectId).sort();
    assert.deepEqual(await listed(), [ind.id, omn.id].sort());
    assert.equal((await call("adm India", "PUT", `/country-reminder-settings/${region.get("India")!.id}/PROJECT_REMINDERS`, { enabled: false })).status, 200);
    assert.deepEqual(await listed(), [omn.id]);
    assert.equal((await call("adm India", "PUT", `/country-reminder-settings/${region.get("India")!.id}/PROJECT_REMINDERS`, { enabled: true })).status, 200);
    assert.deepEqual(await listed(), [ind.id, omn.id].sort());
  });
});

describe("important reminders never leave their country (all seven)", () => {
  const ids = new Map<Country, string>();

  test("one reminder per country; each country's user sees exactly its own", async () => {
    for (const c of COUNTRIES) {
      const res = await call("adm all", "POST", "/country-reminders", { regionId: region.get(c)!.id, title: `${TAG} ${c}`, reminderDate: "2026-12-01", reminderTime: "10:00", priority: "High" });
      assert.equal(res.status, 201, res.message);
      ids.set(c, res.data.id);
    }
    for (const c of COUNTRIES) {
      const list = (await call(`adm ${c}`, "GET", "/country-reminders")).data.items.filter((r: any) => r.title.startsWith(TAG));
      assert.deepEqual(list.map((r: any) => r.title), [`${TAG} ${c}`], c);
    }
    const mine = (await call("user india", "GET", "/country-reminders")).data.items.filter((r: any) => r.title.startsWith(TAG));
    assert.deepEqual(mine.map((r: any) => r.title), [`${TAG} India`], "a non-administrator holding India reads India's");
    const two = (await call("pm india+malaysia", "GET", "/country-reminders")).data.items.filter((r: any) => r.title.startsWith(TAG));
    assert.deepEqual(two.map((r: any) => r.country).sort(), [region.get("India")!.label, region.get("Malaysia")!.label].sort());
  });

  test("the selected country narrows; a country not held is refused; no country means nothing", async () => {
    const oman = (await call("adm all", "GET", "/country-reminders", undefined, { "X-Active-Country": region.get("Oman")!.code })).data.items.filter((r: any) => r.title.startsWith(TAG));
    assert.deepEqual(oman.map((r: any) => r.title), [`${TAG} Oman`]);
    assert.equal((await call("adm Oman", "GET", "/country-reminders", undefined, { "X-Active-Country": region.get("India")!.code })).status, 403);
    assert.equal((await call("adm Oman", "GET", `/country-reminders?regionId=${region.get("India")!.id}`)).status, 403);
    assert.deepEqual((await call("adm none", "GET", "/country-reminders")).data.items, []);
  });

  test("writes stay in the writer's countries: India cannot create, change or delete Oman's", async () => {
    assert.equal((await call("adm India", "POST", "/country-reminders", { regionId: region.get("Oman")!.id, title: `${TAG} sneak`, reminderDate: "2026-12-01" })).status, 403);
    assert.equal((await call("adm India", "PATCH", `/country-reminders/${ids.get("Oman")}`, { title: "changed" })).status, 404);
    assert.equal((await call("adm India", "DELETE", `/country-reminders/${ids.get("Oman")}`)).status, 404);
    assert.equal((await call("user india", "POST", "/country-reminders", { regionId: region.get("India")!.id, title: `${TAG} x`, reminderDate: "2026-12-01" })).status, 403, "not an administrator");
    const done = await call("adm India", "PATCH", `/country-reminders/${ids.get("India")}`, { isCompleted: true });
    assert.equal(done.status, 200);
    assert.equal(done.data.isCompleted, true);
    assert.equal((await prisma.countryReminder.findUnique({ where: { id: ids.get("Oman")! } }))?.title, `${TAG} Oman`, "Oman's reminder untouched");
  });
});
