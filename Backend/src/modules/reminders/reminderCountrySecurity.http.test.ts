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
 * FINAL QA (Nov 2026): the reminder APIs' country boundary, tested directly against the backend (real HTTP, scratch database, COUNTRY_ACCESS_MODE=enforce) for the ten
 * user kinds: each single-country user, India + Oman, explicit All Countries, and no country. Also the bypass attempts: a forged X-Active-Country, another country's
 * project / reminder ids, being the project's creator, the View All Projects approval, and module permissions. Country authorization must win in every case.
 */
const TAG = `rsec-${Date.now()}`;
const COUNTRIES = ["India", "Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"] as const;
type Country = (typeof COUNTRIES)[number];

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const region = new Map<string, { id: string; code: string }>();
const tokens = new Map<string, string>();
const userIds = new Map<string, string>();
const created = { users: [] as string[], projects: [] as string[] };
const project = new Map<Country, { id: string; prNo: string }>();
const reminderOf = new Map<Country, string>();
const importantOf = new Map<Country, string>();

async function makeUser(label: string, opts: { role?: string; countries?: Country[]; allCountries?: boolean; modules?: string[]; approvals?: string[] }) {
  const roleName = opts.role ?? "PMO Manager";
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const modules = await prisma.module.findMany({ where: { name: { in: opts.modules ?? ["Projects", "Settings"] } } });
  const approvals = await prisma.approvalType.findMany({ where: { name: { in: opts.approvals ?? [] } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `RSEC ${label}`, email: `${TAG}-${label.replace(/\W+/g, "")}@example.com`.toLowerCase(), passwordHash: await hashPassword("Secure@12345"), department: "PMO", roleId: role.id,
      forcePasswordChange: false, allCountriesAccess: opts.allCountries === true, moduleAccess: { create: modules.map((m) => ({ moduleId: m.id })) },
      approvalPermissions: { create: approvals.map((a) => ({ approvalTypeId: a.id })) }, regionAccess: { create: (opts.countries ?? []).map((c) => ({ regionId: region.get(c)!.id })) },
    },
  });
  created.users.push(user.id);
  userIds.set(label, user.id);
  tokens.set(label, signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName }));
}

const call = async (who: string, method: string, path: string, body?: unknown, country?: string) => {
  const res = await fetch(`${url}${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.get(who)!}`, ...(country ? { "X-Active-Country": country } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
};
const code = (c: Country) => region.get(c)!.code;
const newReminder = (p: { prNo: string }, title: string) => ({ projectCode: p.prNo, title, reminderType: "Invoice", priority: "High", status: "Pending", reminderDate: "2026-12-01", reminderTime: "10:00", notifyOffset: "At Due Time", repeat: "None" });
const mine = (items: any[]) => items.filter((r) => String(r.title).startsWith(TAG));

before(async () => {
  process.env["COUNTRY_ACCESS_MODE"] = "enforce";
  for (const r of await prisma.region.findMany({ select: { id: true, name: true, code: true } })) region.set(r.name, { id: r.id, code: r.code ?? r.name });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  for (const c of COUNTRIES) await makeUser(`only ${c}`, { countries: [c] });
  await makeUser("india+oman", { countries: ["India", "Oman"] });
  await makeUser("all countries", { allCountries: true, role: "Administrator" });
  await makeUser("no country", { role: "Administrator" });
  await makeUser("india pm view-all", { role: "Project Manager", countries: ["India"], approvals: ["View All Projects"] });
  await makeUser("india pm creator", { role: "Project Manager", countries: ["India"] });
  await makeUser("oman no projects module", { countries: ["Oman"], modules: ["Settings"] });
  for (const [i, c] of COUNTRIES.entries()) {
    // The Oman project is CREATED by an India-only user: ownership must not open it to them.
    const p = await prisma.project.create({
      data: {
        poMonth: "2026-11", prCategory: c, prNo: `${PR_CATEGORY_PREFIX_MAP[c]}${TAG}-${i}`, client: `RSEC ${c}`, department: "Process", domesticForeign: "Foreign", projectTitle: `RSEC ${c}`,
        workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", regionId: region.get(c)!.id,
        createdByUserId: c === "Oman" ? userIds.get("india pm creator")! : null,
      },
    });
    created.projects.push(p.id);
    project.set(c, { id: p.id, prNo: p.prNo });
    const r = await call("all countries", "POST", `/projects/${p.id}/reminders`, newReminder(p, `${TAG} ${c}`));
    assert.equal(r.status, 201, r.message);
    reminderOf.set(c, r.data.id);
    const imp = await call("all countries", "POST", "/country-reminders", { regionId: region.get(c)!.id, title: `${TAG} important ${c}`, reminderDate: "2026-12-01" });
    assert.equal(imp.status, 201, imp.message);
    importantOf.set(c, imp.data.id);
  }
});

after(async () => {
  try {
    await prisma.countryReminder.deleteMany({ where: { title: { startsWith: TAG } } });
    await prisma.projectReminder.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.userApprovalPermission.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.userRegionAccess.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    process.env["COUNTRY_ACCESS_MODE"] = "off";
    await closeServer();
  }
});

describe("each single-country user: own country only, on every reminder API", () => {
  for (const c of COUNTRIES) {
    test(`${c}-only user`, async () => {
      const who = `only ${c}`;
      const other = COUNTRIES.find((x) => x !== c)!;
      // Lists: exactly their own country.
      assert.deepEqual(mine((await call(who, "GET", "/reminders")).data.items).map((r) => r.title), [`${TAG} ${c}`]);
      assert.deepEqual(mine((await call(who, "GET", "/country-reminders")).data.items).map((r) => r.title), [`${TAG} important ${c}`]);
      // Their own project: read, create, edit, complete, delete all work.
      const own = project.get(c)!;
      assert.equal((await call(who, "GET", `/projects/${own.id}/reminders`)).status, 200);
      const made = await call(who, "POST", `/projects/${own.id}/reminders`, newReminder(own, `${TAG} by ${c}`));
      assert.equal(made.status, 201, made.message);
      assert.equal((await call(who, "PATCH", `/reminders/${made.data.id}`, { reminderTime: "11:00", status: "Completed" })).status, 200);
      assert.equal((await call(who, "DELETE", `/reminders/${made.data.id}`)).status, 200);
      // Another country: refused by id, by forged header, on every verb.
      const theirs = project.get(other)!;
      assert.equal((await call(who, "GET", `/projects/${theirs.id}/reminders`)).status, 403, "read another country's project reminders");
      assert.equal((await call(who, "POST", `/projects/${theirs.id}/reminders`, newReminder(theirs, `${TAG} sneak`))).status, 403, "create there");
      assert.equal((await call(who, "PATCH", `/reminders/${reminderOf.get(other)}`, { title: "changed" })).status, 403, "edit their reminder by id");
      assert.equal((await call(who, "DELETE", `/reminders/${reminderOf.get(other)}`)).status, 403, "delete their reminder by id");
      assert.equal((await call(who, "GET", "/reminders", undefined, code(other))).status, 403, "forged X-Active-Country");
      assert.equal((await call(who, "GET", "/reminders", undefined, "ALL")).status, 403, "forged All Countries");
      assert.equal((await call(who, "GET", `/country-reminders?regionId=${region.get(other)!.id}`)).status, 403, "important reminders of another country by id");
      assert.equal((await call(who, "PATCH", `/country-reminders/${importantOf.get(other)}`, { title: "changed" })).status, 404, "edit another country's important reminder");
      assert.equal((await call(who, "PUT", `/country-reminder-settings/${region.get(other)!.id}/PROJECT_REMINDERS`, { enabled: false })).status, 403, "another country's switch");
    });
  }
});

describe("multi-country, All Countries and no-country users", () => {
  test("India + Oman: both countries (each labelled), only one at a time when selected, never a third", async () => {
    const both = mine((await call("india+oman", "GET", "/reminders")).data.items);
    assert.deepEqual(both.map((r) => r.title).sort(), [`${TAG} India`, `${TAG} Oman`]);
    assert.deepEqual(both.map((r) => r.country).sort(), ["India", "Oman"]);
    assert.deepEqual(mine((await call("india+oman", "GET", "/reminders", undefined, code("Oman"))).data.items).map((r) => r.title), [`${TAG} Oman`]);
    assert.deepEqual(mine((await call("india+oman", "GET", "/reminders", undefined, code("India"))).data.items).map((r) => r.title), [`${TAG} India`]);
    assert.equal((await call("india+oman", "GET", "/reminders", undefined, code("Qatar"))).status, 403);
    assert.equal((await call("india+oman", "GET", "/reminders", undefined, "ALL")).status, 403, "two countries are not All Countries");
    assert.equal((await call("india+oman", "GET", `/projects/${project.get("Qatar")!.id}/reminders`)).status, 403);
  });

  test("explicit All Countries: all seven; narrows to one when selected", async () => {
    assert.equal(mine((await call("all countries", "GET", "/reminders", undefined, "ALL")).data.items).length, 7);
    assert.deepEqual(mine((await call("all countries", "GET", "/reminders", undefined, code("Malaysia"))).data.items).map((r) => r.title), [`${TAG} Malaysia`]);
    assert.equal(mine((await call("all countries", "GET", "/country-reminders", undefined, "ALL")).data.items).length, 7);
  });

  test("no country (even an Administrator): nothing listed, nothing readable or writable", async () => {
    const list = await call("no country", "GET", "/reminders");
    assert.ok(list.status === 403 || mine(list.data?.items ?? []).length === 0, `status ${list.status}`);
    assert.deepEqual(mine((await call("no country", "GET", "/country-reminders")).data.items), []);
    assert.equal((await call("no country", "GET", `/projects/${project.get("India")!.id}/reminders`)).status, 403);
    assert.equal((await call("no country", "PATCH", `/reminders/${reminderOf.get("India")}`, { title: "x" })).status, 403);
  });
});

describe("nothing else bypasses the country", () => {
  test("being the project's CREATOR does not open another country's project", async () => {
    // The Oman project was created by this India-only Project Manager.
    assert.equal((await call("india pm creator", "GET", `/projects/${project.get("Oman")!.id}/reminders`)).status, 403);
    assert.equal((await call("india pm creator", "PATCH", `/reminders/${reminderOf.get("Oman")}`, { title: "x" })).status, 403);
    assert.deepEqual(mine((await call("india pm creator", "GET", "/reminders")).data.items).map((r) => r.title), [`${TAG} India`]);
  });

  test("the View All Projects approval does not grant All Countries", async () => {
    assert.deepEqual(mine((await call("india pm view-all", "GET", "/reminders")).data.items).map((r) => r.title), [`${TAG} India`]);
    assert.equal((await call("india pm view-all", "GET", `/projects/${project.get("Qatar")!.id}/reminders`)).status, 403);
    assert.equal((await call("india pm view-all", "GET", "/reminders", undefined, "ALL")).status, 403);
  });

  test("module permissions still apply on top of the country: Oman without the Projects module is refused", async () => {
    assert.equal((await call("oman no projects module", "GET", "/reminders")).status, 403);
    assert.equal((await call("oman no projects module", "GET", `/projects/${project.get("Oman")!.id}/reminders`)).status, 403);
    assert.equal((await call("oman no projects module", "GET", "/country-reminders")).status, 403);
  });
});
