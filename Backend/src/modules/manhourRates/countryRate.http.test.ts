import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { PR_CATEGORY_PREFIX_MAP } from "../projects/project.constants.js";
import { recomputeProjectResource } from "../timesheets/services/projectResource.service.js";
import { purgeCountryRates } from "./countryRate.testkit.js";

/**
 * Phase 4, central country manpower conversion rates: the permission model (an explicit Module Access grant, no role bypass, write needs a manager role
 * on top), the country configuration (India fixed, append-only versions, countries sharing a currency stay separate), preview-then-apply, the interaction with
 * the employee-rate recalculation (Option A), failure / retry, concurrency, India untouched, and every screen reading the same stored figures.
 * Rates here are TEST FIXTURES; the product never defaults or invents one.
 */

const TAG = `cr-${Date.now()}`;
const PASSWORD = "CountryRate@12345";
const MODULE = "Manpower Conversion Rates";
const CATEGORIES = ["India", "Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"] as const;
const CURRENCY: Record<string, string> = { India: "INR", Malaysia: "MYR", Oman: "OMR", "Abu Dhabi": "AED", FZI: "AED", "Elixir Qatar": "QAR", Qatar: "QAR" };
const digits = (category: string) => (CURRENCY[category] === "OMR" ? 3 : 2);

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[], employees: [] as string[] };
const regionId = {} as Record<string, string>;
const P = {} as Record<string, string>; // one project per category
let extraOman = "";
let spoof = ""; // a Qatar project whose PR number carries the OMAN prefix
let importId = "";
const setMode = (mode: "off" | "shadow" | "enforce") => {
  process.env["COUNTRY_ACCESS_MODE"] = mode;
};

async function listen(): Promise<void> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

interface Actor {
  id: string;
  token: string;
  email: string;
}

async function makeUser(label: string, roleName: string, modules: string[], opts: { allCountries?: boolean; categories?: string[] } = {}): Promise<Actor> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const mods = await prisma.module.findMany({ where: { name: { in: modules } } });
  assert.equal(mods.length, modules.length, `modules exist: ${modules.join(", ")}`);
  const user = await prisma.portalUser.create({
    data: {
      fullName: `CR ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      allCountriesAccess: opts.allCountries === true,
      moduleAccess: { create: mods.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: (opts.categories ?? []).map((c) => ({ regionId: regionId[c]! })) },
    },
  });
  created.users.push(user.id);
  return { id: user.id, email: user.email, token: signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName }) };
}

async function call(actor: Actor | null, path: string, opts: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${url}${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let seq = 0;
async function insertProject(category: string, prNo?: string): Promise<string> {
  const region = await prisma.region.findUniqueOrThrow({ where: { id: regionId[category]! } });
  const row = await prisma.project.create({
    data: {
      poMonth: "2026-11", prCategory: category, prNo: prNo ?? `${PR_CATEGORY_PREFIX_MAP[category as keyof typeof PR_CATEGORY_PREFIX_MAP]}${TAG}-${++seq}`, client: "CR Client", department: "Process",
      domesticForeign: "Domestic", projectTitle: `CR ${category} ${TAG}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active",
      regionId: regionId[category]!, regionalCurrency: region.defaultCurrency,
    },
  });
  created.projects.push(row.id);
  return row.id;
}

let empSeq = 0;
async function makeEmployee(label: string, rate: number): Promise<{ employeeNo: string; id: string }> {
  const employeeNo = `${TAG}-${label}-${++empSeq}`;
  const row = await prisma.employee.create({
    data: { employeeNo, employeeName: `CR ${label}`, department: "Process", designation: "Engineer", grade: "MG4", location: "Chennai", manhourExpenses: rate },
  });
  created.employees.push(employeeNo);
  return { employeeNo, id: row.id };
}

let day = 0;
async function logHours(employeeNo: string, projectId: string, hours: number, workDate?: Date): Promise<void> {
  day += 1;
  await prisma.timesheetEntry.create({
    data: { employeeNo, projectId, rawProjectCode: `CR-${TAG}`, workDate: workDate ?? new Date(Date.UTC(2026, 8, (day % 27) + 1)), hours, firstImportId: importId, lastImportId: importId },
  });
  await recomputeProjectResource(employeeNo, projectId);
}

const rowOf = (projectId: string, employeeNo: string) => prisma.projectResource.findUniqueOrThrow({ where: { projectId_employeeNo: { projectId, employeeNo } } });
const patchRate = (actor: Actor, employeeId: string, value: number) => call(actor, `/employees/${employeeId}`, { method: "PATCH", body: { manhourExpenses: value } });
const regionalOf = (category: string, inr: number, rate: number) => Number(new Prisma.Decimal(inr).div(rate).toDecimalPlaces(digits(category), 4).toFixed(digits(category)));
const latestOf = (category: string) => prisma.countryManhourFxRate.findFirst({ where: { regionId: regionId[category]! }, orderBy: { version: "desc" } });

async function saveRate(actor: Actor, category: string, value: number | string, note?: string): Promise<number> {
  const res = await call(actor, `/manhour-conversion-rates/${regionId[category]!}/versions`, { method: "POST", body: { inrPerRegionalUnit: value, ...(note ? { note } : {}) } });
  assert.equal(res.status, 201, `${category} version saved: ${JSON.stringify(res.body)}`);
  return res.body.data.current.version as number;
}
const preview = (actor: Actor, category: string) => call(actor, `/manhour-conversion-rates/${regionId[category]!}/apply-preview`);
const apply = (actor: Actor, category: string, expectedVersion: number, reason?: string) =>
  call(actor, `/manhour-conversion-rates/${regionId[category]!}/apply`, { method: "POST", body: { expectedVersion, ...(reason ? { reason } : {}) } });

const u = {} as Record<string, Actor>;
let e1 = { employeeNo: "", id: "" };
let indiaBefore: Awaited<ReturnType<typeof rowOf>>;
const FIRST = { Malaysia: 20, Oman: 250, "Abu Dhabi": 25, FZI: 24, "Elixir Qatar": 20, Qatar: 40 } as Record<string, number>;
const versionOf = {} as Record<string, number>;

before(async () => {
  setMode("off");
  importId = (await prisma.timesheetImport.create({ data: { triggeredBy: "ManualUpload", totalRows: 0, status: "Succeeded" } })).id;
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId[r.name] = r.id;
  await purgeCountryRates(Object.values(regionId)); // a clean slate: the versions below are this file's own
  u["admin"] = await makeUser("admin", "Administrator", ["Projects", "Dashboard", "Manpower", MODULE], { allCountries: true });
  u["pmo"] = await makeUser("pmo", "PMO Manager", ["Projects", "Manpower", MODULE], { allCountries: true });
  u["pmoNoModule"] = await makeUser("pmo-no-module", "PMO Manager", ["Projects", "Manpower"], { allCountries: true });
  u["adminNoModule"] = await makeUser("admin-no-module", "Administrator", ["Projects", "Dashboard", "Manpower"], { allCountries: true });
  u["viewer"] = await makeUser("viewer", "Project Manager", ["Projects", MODULE], { allCountries: true });
  u["readonly"] = await makeUser("readonly", "Read Only", ["Projects", MODULE], { allCountries: true });
  u["nobody"] = await makeUser("nobody", "Engineer", ["Projects"], { allCountries: true });
  u["omanPmo"] = await makeUser("oman-pmo", "PMO Manager", ["Projects", MODULE], { categories: ["Oman"] });
  for (const category of CATEGORIES) P[category] = await insertProject(category);
  extraOman = await insertProject("Oman");
  // A Qatar project whose PR NUMBER looks like Oman's: the country is the stored PR Category, never the number.
  spoof = await insertProject("Qatar", `${PR_CATEGORY_PREFIX_MAP["Oman" as keyof typeof PR_CATEGORY_PREFIX_MAP]}${TAG}-SPOOF`);
  await listen();
  e1 = await makeEmployee("e1", 1000);
  for (const projectId of [...CATEGORIES.map((c) => P[c]!), extraOman, spoof]) await logHours(e1.employeeNo, projectId, 10);
  indiaBefore = await rowOf(P["India"]!, e1.employeeNo);
});

after(async () => {
  try {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS cr_fail_update ON "ProjectResource"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS cr_fail_update()`);
    await prisma.authAuditLog.deleteMany({ where: { OR: [{ userId: { in: created.users } }, { email: { startsWith: TAG } }] } });
    await prisma.manhourCostChangeAudit.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.manhourRateChangeRun.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.countryRateApplyRun.deleteMany({ where: { actorUserId: { in: created.users } } });
    await prisma.projectResourceRepriceAudit.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.timesheetEntry.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.timesheetImport.deleteMany({ where: { id: importId } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.employee.deleteMany({ where: { employeeNo: { in: created.employees } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
    await purgeCountryRates(Object.values(regionId));
  } finally {
    setMode("off");
    await closeServer();
  }
});

describe("the Module Access permission", () => {
  test("the module exists, is active, and the migration granted it to nobody (no automatic grant to existing users)", async () => {
    const module = await prisma.module.findUniqueOrThrow({ where: { name: MODULE } });
    assert.equal(module.isActive, true);
    assert.equal(await prisma.userModuleAccess.count({ where: { moduleId: module.id, userId: { notIn: created.users } } }), 0);
  });

  test("it is listed with the other modules for the Add / Edit User form", async () => {
    const res = await call(u["admin"]!, "/users/lookups");
    assert.equal(res.status, 200);
    assert.ok(JSON.stringify(res.body).includes(MODULE));
  });

  test("a user with ordinary Manpower access but WITHOUT the grant cannot reach any conversion-rate endpoint (a PMO Manager and an Administrator alike: no role bypass)", async () => {
    const region = regionId["Oman"]!;
    for (const who of ["pmoNoModule", "adminNoModule", "nobody"] as const) {
      const actor = u[who]!;
      assert.equal((await call(actor, "/manhour-conversion-rates")).status, 403, `${who} list`);
      assert.equal((await call(actor, `/manhour-conversion-rates/${region}/history`)).status, 403, `${who} history`);
      assert.equal((await call(actor, `/manhour-conversion-rates/${region}/versions`, { method: "POST", body: { inrPerRegionalUnit: 250 } })).status, 403, `${who} create`);
      assert.equal((await call(actor, `/manhour-conversion-rates/${region}/apply-preview`)).status, 403, `${who} preview`);
      assert.equal((await call(actor, `/manhour-conversion-rates/${region}/apply`, { method: "POST", body: { expectedVersion: 1 } })).status, 403, `${who} apply`);
      assert.equal((await call(actor, "/manhour-conversion-rates/runs")).status, 403, `${who} open runs`);
      assert.equal((await call(actor, `/manhour-conversion-rates/runs/${region}/retry`, { method: "POST" })).status, 403, `${who} retry`);
    }
    assert.equal((await call(null, "/manhour-conversion-rates")).status, 401);
    assert.equal(await prisma.countryManhourFxRate.count({ where: { regionId: { in: Object.values(regionId) } } }), 0, "nothing was written");
  });

  test("with the grant but a non-manager role the user can LOOK (list, history) and nothing else; a Read Only user likewise", async () => {
    for (const who of ["viewer", "readonly"] as const) {
      const actor = u[who]!;
      assert.equal((await call(actor, "/manhour-conversion-rates")).status, 200, `${who} list`);
      assert.equal((await call(actor, `/manhour-conversion-rates/${regionId["Oman"]!}/history`)).status, 200, `${who} history`);
      assert.equal((await call(actor, `/manhour-conversion-rates/${regionId["Oman"]!}/versions`, { method: "POST", body: { inrPerRegionalUnit: 250 } })).status, 403, `${who} create`);
      assert.equal((await call(actor, `/manhour-conversion-rates/${regionId["Oman"]!}/apply-preview`)).status, 403, `${who} preview`);
      assert.equal((await call(actor, `/manhour-conversion-rates/${regionId["Oman"]!}/apply`, { method: "POST", body: { expectedVersion: 1 } })).status, 403, `${who} apply`);
    }
  });

  test("revoking the grant takes effect on the very next request", async () => {
    const temp = await makeUser("temp", "PMO Manager", ["Projects", MODULE], { allCountries: true });
    assert.equal((await call(temp, "/manhour-conversion-rates")).status, 200);
    await prisma.userModuleAccess.deleteMany({ where: { userId: temp.id, module: { name: MODULE } } });
    assert.equal((await call(temp, "/manhour-conversion-rates")).status, 403);
    assert.equal((await call(temp, `/manhour-conversion-rates/${regionId["Oman"]!}/versions`, { method: "POST", body: { inrPerRegionalUnit: 250 } })).status, 403);
  });

  test("an Administrator grants and revokes it through the ordinary user save, each change is audited, and an unchanged re-save is not a change", async () => {
    const target = await makeUser("target", "Engineer", ["Projects"]);
    const module = await prisma.module.findUniqueOrThrow({ where: { name: MODULE } });
    const projects = await prisma.module.findUniqueOrThrow({ where: { name: "Projects" } });
    const events = (event: string) => prisma.authAuditLog.count({ where: { event, details: { path: ["targetUserId"], equals: target.id } } });

    assert.equal((await call(target, "/manhour-conversion-rates")).status, 403);
    const grant = await call(u["admin"]!, `/users/${target.id}`, { method: "PATCH", body: { moduleIds: [projects.id, module.id] } });
    assert.equal(grant.status, 200, JSON.stringify(grant.body));
    assert.equal((await call(target, "/manhour-conversion-rates")).status, 200, "the grant took effect");
    assert.equal(await events("MANPOWER_CONVERSION_ACCESS_GRANTED"), 1);

    assert.equal((await call(u["admin"]!, `/users/${target.id}`, { method: "PATCH", body: { moduleIds: [projects.id, module.id] } })).status, 200);
    assert.equal(await events("MANPOWER_CONVERSION_ACCESS_GRANTED"), 1, "re-sending the same modules is not a new grant");

    assert.equal((await call(u["admin"]!, `/users/${target.id}`, { method: "PATCH", body: { moduleIds: [projects.id] } })).status, 200);
    assert.equal((await call(target, "/manhour-conversion-rates")).status, 403, "the revoke took effect");
    assert.equal(await events("MANPOWER_CONVERSION_ACCESS_REVOKED"), 1);
  });

  test("a PMO Manager (who can edit users) cannot grant or remove it, the refusal is audited, and an edit that does not touch it still works", async () => {
    const target = await makeUser("target2", "Engineer", ["Projects"]);
    const module = await prisma.module.findUniqueOrThrow({ where: { name: MODULE } });
    const projects = await prisma.module.findUniqueOrThrow({ where: { name: "Projects" } });
    const denied = await call(u["pmo"]!, `/users/${target.id}`, { method: "PATCH", body: { moduleIds: [projects.id, module.id] } });
    assert.equal(denied.status, 403);
    assert.equal(await prisma.userModuleAccess.count({ where: { userId: target.id, moduleId: module.id } }), 0);
    assert.equal(await prisma.authAuditLog.count({ where: { event: "MANPOWER_CONVERSION_ACCESS_CHANGE_DENIED", details: { path: ["targetUserId"], equals: target.id } } }), 1);
    const ok = await call(u["pmo"]!, `/users/${target.id}`, { method: "PATCH", body: { phoneNumber: "12345", moduleIds: [projects.id] } });
    assert.equal(ok.status, 200, "an ordinary edit is unaffected");
  });
});

describe("country configuration", () => {
  test("the list shows the countries with their currencies; India is first, fixed, and has no version", async () => {
    const res = await call(u["admin"]!, "/manhour-conversion-rates");
    assert.equal(res.status, 200);
    const countries = res.body.data.countries as { name: string; displayName: string; currency: string; fixed: boolean; current: unknown }[];
    assert.equal(countries[0]!.name, "India");
    assert.equal(countries[0]!.fixed, true);
    assert.equal(countries[0]!.currency, "INR");
    assert.equal(countries[0]!.current, null);
    for (const category of CATEGORIES) {
      const c = countries.find((x) => x.name === category)!;
      assert.ok(c, `${category} listed`);
      assert.equal(c.currency, CURRENCY[category]);
      assert.equal(c.fixed, category === "India");
    }
    assert.equal(countries.find((x) => x.name === "FZI")!.displayName, "FZE", "shown by its display name");
    assert.equal(res.body.data.canManage, true);
  });

  test("India is fixed at 1: no version, no preview, no apply", async () => {
    assert.equal((await call(u["admin"]!, `/manhour-conversion-rates/${regionId["India"]!}/versions`, { method: "POST", body: { inrPerRegionalUnit: 83 } })).status, 409);
    assert.equal((await preview(u["admin"]!, "India")).status, 409);
    assert.equal((await apply(u["admin"]!, "India", 1)).status, 409);
    assert.equal((await call(u["admin"]!, `/manhour-conversion-rates/${regionId["India"]!}/history`)).body.data.history.length, 0);
  });

  test("invalid rates are refused: zero, negative, text, exactly 1, more than 6 decimals, implausibly large, missing", async () => {
    for (const bad of [0, -5, "abc", "", 1, "1.0", 1.2345678, 5_000_000, "2e3"]) {
      const res = await call(u["admin"]!, `/manhour-conversion-rates/${regionId["Oman"]!}/versions`, { method: "POST", body: { inrPerRegionalUnit: bad } });
      assert.equal(res.status, 400, `rejected: ${String(bad)}`);
    }
    assert.equal((await call(u["admin"]!, `/manhour-conversion-rates/${regionId["Oman"]!}/versions`, { method: "POST", body: {} })).status, 400);
    assert.equal(await prisma.countryManhourFxRate.count({ where: { regionId: regionId["Oman"]! } }), 0);
  });

  test("an Administrator and a PMO Manager (both holding the grant) can save versions; each country keeps its own rate, including countries that share a currency", async () => {
    versionOf["Oman"] = await saveRate(u["admin"]!, "Oman", FIRST["Oman"]!, "fixture");
    versionOf["Malaysia"] = await saveRate(u["pmo"]!, "Malaysia", FIRST["Malaysia"]!);
    versionOf["Abu Dhabi"] = await saveRate(u["admin"]!, "Abu Dhabi", FIRST["Abu Dhabi"]!);
    versionOf["FZI"] = await saveRate(u["admin"]!, "FZI", FIRST["FZI"]!);
    versionOf["Elixir Qatar"] = await saveRate(u["pmo"]!, "Elixir Qatar", FIRST["Elixir Qatar"]!);
    versionOf["Qatar"] = await saveRate(u["admin"]!, "Qatar", FIRST["Qatar"]!);
    for (const category of Object.keys(FIRST)) assert.equal(versionOf[category], 1, `${category} starts at version 1`);

    const abuDhabi = await latestOf("Abu Dhabi");
    const fze = await latestOf("FZI");
    assert.equal(abuDhabi!.regionalCurrency, "AED");
    assert.equal(fze!.regionalCurrency, "AED");
    assert.notEqual(abuDhabi!.regionId, fze!.regionId);
    assert.equal(Number(abuDhabi!.inrPerRegionalUnit), 25);
    assert.equal(Number(fze!.inrPerRegionalUnit), 24, "FZE keeps its own rate although it shares the currency");
    const qatar = await latestOf("Qatar");
    const elixir = await latestOf("Elixir Qatar");
    assert.equal(Number(qatar!.inrPerRegionalUnit), 40);
    assert.equal(Number(elixir!.inrPerRegionalUnit), 20);
    assert.equal(qatar!.createdByRole, "Administrator");
    assert.equal((await latestOf("Malaysia"))!.createdByRole, "PMO Manager");
  });

  test("saving a version rewrites NOTHING: every existing row is exactly as before", async () => {
    for (const category of CATEGORIES) {
      const row = await rowOf(P[category]!, e1.employeeNo);
      assert.equal(row.manhourCost, 10_000);
      assert.equal(row.manhourCostRegional, null, `${category}: no regional figure was written by saving a rate`);
      assert.equal(row.costingStatus, category === "India" ? "INR" : "RATE_MISSING");
    }
  });

  test("versions are append-only at the database: a direct UPDATE or DELETE is refused", async () => {
    const row = await latestOf("Oman");
    await assert.rejects(() => prisma.$executeRawUnsafe(`UPDATE "CountryManhourFxRate" SET "inrPerRegionalUnit" = 999 WHERE id = '${row!.id}'`), /append-only/);
    await assert.rejects(() => prisma.$executeRawUnsafe(`DELETE FROM "CountryManhourFxRate" WHERE id = '${row!.id}'`), /append-only/);
    assert.equal(Number((await latestOf("Oman"))!.inrPerRegionalUnit), 250);
  });

  test("history lists versions newest first with who and when; a country the user cannot access is invisible and refused (country access enforced)", async () => {
    await saveRate(u["admin"]!, "Oman", 251, "history probe"); // version 2, only to test the history; re-fixed below
    const history = (await call(u["admin"]!, `/manhour-conversion-rates/${regionId["Oman"]!}/history`)).body.data.history;
    assert.deepEqual(history.map((h: { version: number }) => h.version), [2, 1]);
    assert.equal(history[0].note, "history probe");
    assert.equal(history[1].createdByName, "CR admin");
    versionOf["Oman"] = await saveRate(u["admin"]!, "Oman", FIRST["Oman"]!, "back to the fixture"); // version 3 = 250 again

    setMode("enforce");
    try {
      const list = (await call(u["omanPmo"]!, "/manhour-conversion-rates")).body.data.countries as { name: string }[];
      assert.deepEqual(list.map((c) => c.name), ["Oman"], "an Oman-only user sees only Oman");
      assert.equal((await call(u["omanPmo"]!, `/manhour-conversion-rates/${regionId["Qatar"]!}/history`)).status, 403);
      assert.equal((await call(u["omanPmo"]!, `/manhour-conversion-rates/${regionId["Qatar"]!}/versions`, { method: "POST", body: { inrPerRegionalUnit: 41 } })).status, 403);
      assert.equal((await preview(u["omanPmo"]!, "Qatar")).status, 403);
      assert.equal((await call(u["omanPmo"]!, `/manhour-conversion-rates/${regionId["Oman"]!}/history`)).status, 200);
    } finally {
      setMode("off");
    }
  });
});

describe("preview, then apply: saving never rewrites; apply converts every project of the country exactly once", () => {
  test("the preview names the affected projects and rows with the old and new figures, and writes nothing", async () => {
    const before = await rowOf(P["Oman"]!, e1.employeeNo);
    const res = await preview(u["admin"]!, "Oman");
    assert.equal(res.status, 200);
    const data = res.body.data;
    assert.equal(data.rate.version, versionOf["Oman"]);
    assert.equal(data.totals.projects, 2, "both Oman projects");
    assert.equal(data.totals.rows, 2);
    assert.deepEqual(data.projects.map((p: { projectId: string }) => p.projectId).sort(), [P["Oman"]!, extraOman].sort());
    const item = data.projects.find((p: { projectId: string }) => p.projectId === P["Oman"]!).rows[0];
    assert.equal(item.current.status, "RATE_MISSING");
    assert.equal(item.proposed.manhourCostRegional, "40.000");
    assert.equal(data.totals.proposedRegional, "80.000");
    assert.equal((await rowOf(P["Oman"]!, e1.employeeNo)).updatedAt.getTime(), before.updatedAt.getTime(), "a preview wrote nothing");
    assert.ok(!data.projects.some((p: { projectId: string }) => p.projectId === P["India"]!));
  });

  test("a stale preview cannot be applied: the expected version must be the latest", async () => {
    const res = await apply(u["admin"]!, "Oman", versionOf["Oman"]! - 1);
    assert.equal(res.status, 409);
    assert.equal((await rowOf(P["Oman"]!, e1.employeeNo)).costingStatus, "RATE_MISSING");
  });

  test("apply converts every Oman project (and only Oman); the INR base cost is untouched; each row is audited with the country, versions and rate", async () => {
    const reasons = "first rate for Oman";
    const res = await apply(u["admin"]!, "Oman", versionOf["Oman"]!, reasons);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "SUCCEEDED");
    assert.equal(res.body.data.projectCount, 2);
    for (const projectId of [P["Oman"]!, extraOman]) {
      const row = await rowOf(projectId, e1.employeeNo);
      assert.equal(row.manhourCost, 10_000, "INR base unchanged");
      assert.equal(row.costingStatus, "CONVERTED");
      assert.equal(row.fxRateScope, "COUNTRY");
      assert.equal(row.fxRateVersion, versionOf["Oman"]);
      assert.equal(row.manhourCostRegional!.toFixed(3), "40.000");
    }
    const audits = await prisma.projectResourceRepriceAudit.findMany({ where: { regionId: regionId["Oman"]! } });
    assert.equal(audits.length, 2);
    assert.equal(audits[0]!.oldStatus, "RATE_MISSING");
    assert.equal(audits[0]!.newFxRateScope, "COUNTRY");
    assert.equal(audits[0]!.newFxRateVersion, versionOf["Oman"]);
    assert.equal(audits[0]!.reason, reasons);
    assert.equal(audits[0]!.performedByRole, "Administrator");
    // Other countries were not touched by Oman's apply.
    assert.equal((await rowOf(P["Qatar"]!, e1.employeeNo)).costingStatus, "RATE_MISSING");
    assert.equal(await prisma.countryRateApplyTask.count({ where: { run: { regionId: regionId["Oman"]! }, status: { not: "SUCCEEDED" } } }), 0);
  });

  test("applying again changes nothing and writes no new audit rows", async () => {
    const res = await apply(u["admin"]!, "Oman", versionOf["Oman"]!);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.runId, null, "nothing was behind");
    assert.equal(await prisma.projectResourceRepriceAudit.count({ where: { regionId: regionId["Oman"]! } }), 2);
  });

  test("the other countries apply the same way, each with its own rate: the same employee gets the project-specific conversion", async () => {
    for (const category of ["Malaysia", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"]) {
      const res = await apply(u["pmo"]!, category, versionOf[category]!);
      assert.equal(res.status, 200, category);
    }
    for (const category of ["Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"]) {
      const row = await rowOf(P[category]!, e1.employeeNo);
      assert.equal(row.manhourCost, 10_000, `${category}: INR unchanged`);
      assert.equal(Number(row.manhourCostRegional!.toFixed(digits(category))), regionalOf(category, 10_000, FIRST[category]!), `${category}: own rate`);
      assert.equal(row.costCurrency, CURRENCY[category]);
    }
    assert.equal(Number((await rowOf(P["Abu Dhabi"]!, e1.employeeNo)).manhourCostRegional!.toFixed(2)), 400);
    assert.equal(Number((await rowOf(P["FZI"]!, e1.employeeNo)).manhourCostRegional!.toFixed(2)), 416.67, "FZE uses 24, not Abu Dhabi's 25");
    assert.equal(Number((await rowOf(P["Qatar"]!, e1.employeeNo)).manhourCostRegional!.toFixed(2)), 250);
    assert.equal(Number((await rowOf(P["Elixir Qatar"]!, e1.employeeNo)).manhourCostRegional!.toFixed(2)), 500, "Elixir Qatar uses 20, not Qatar's 40");
  });

  test("the country comes from the stored PR Category, never the PR number: a Qatar project numbered like an Oman one is converted with Qatar's rate", async () => {
    const row = await rowOf(spoof, e1.employeeNo);
    assert.equal(row.costCurrency, "QAR");
    assert.equal(row.fxRateInrPerRegional!.toFixed(0), "40");
    assert.equal(row.manhourCostRegional!.toFixed(2), "250.00");
  });

  test("new hours after the rate exists are converted with the country's latest version at once (no apply needed for a new row)", async () => {
    const e2 = await makeEmployee("e2", 800);
    await logHours(e2.employeeNo, P["Oman"]!, 5);
    const row = await rowOf(P["Oman"]!, e2.employeeNo);
    assert.equal(row.costingStatus, "CONVERTED");
    assert.equal(row.fxRateScope, "COUNTRY");
    assert.equal(row.fxRateVersion, versionOf["Oman"]);
    assert.equal(row.manhourCostRegional!.toFixed(3), regionalOf("Oman", 4000, 250).toFixed(3));
    assert.equal((await rowOf(P["India"]!, e2.employeeNo).catch(() => null)), null, "no India row was invented");
  });
});

describe("a country rate change recalculates the country's projects (increase and decrease, several projects, historical hours)", () => {
  test("INCREASE of the INR-per-unit rate (Oman 250 -> 500): the regional cost halves for BOTH projects, history included; INR stays; audit has old and new", async () => {
    await logHours(e1.employeeNo, P["Oman"]!, 10, new Date(Date.UTC(2026, 7, 3))); // historical hours (August) join the lifetime figure: 20 h now
    const rowBefore = await rowOf(P["Oman"]!, e1.employeeNo);
    assert.equal(rowBefore.totalHours, 20);
    assert.equal(rowBefore.manhourCost, 20_000);
    const v = await saveRate(u["admin"]!, "Oman", 500, "increase");
    versionOf["Oman"] = v;
    assert.equal((await rowOf(P["Oman"]!, e1.employeeNo)).fxRateVersion, v - 1, "saving did not move the row");
    const pre = (await preview(u["admin"]!, "Oman")).body.data;
    assert.equal(pre.totals.projects, 2);
    const mine = pre.projects.find((p: { projectId: string }) => p.projectId === P["Oman"]!).rows.find((r: { employeeNo: string }) => r.employeeNo === e1.employeeNo);
    assert.equal(mine.current.manhourCostRegional, regionalOf("Oman", 20_000, 250).toFixed(3));
    assert.equal(mine.proposed.manhourCostRegional, regionalOf("Oman", 20_000, 500).toFixed(3));

    const res = await apply(u["admin"]!, "Oman", v);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "SUCCEEDED");
    const after = await rowOf(P["Oman"]!, e1.employeeNo);
    assert.equal(after.manhourCost, 20_000, "INR base never moves");
    assert.equal(after.manhourCostRegional!.toFixed(3), "40.000");
    assert.equal(after.fxRateVersion, v);
    const audit = await prisma.projectResourceRepriceAudit.findFirstOrThrow({ where: { projectResourceId: after.id }, orderBy: { createdAt: "desc" } });
    assert.equal(audit.oldFxRateVersion, v - 1);
    assert.equal(audit.oldFxRateScope, "COUNTRY");
    assert.equal(audit.newFxRateVersion, v);
    assert.equal(audit.oldManhourCostRegional!.toFixed(3), "80.000");
    assert.equal(audit.newManhourCostRegional.toFixed(3), "40.000");
    assert.equal(Number((await rowOf(extraOman, e1.employeeNo)).manhourCostRegional!.toFixed(3)), regionalOf("Oman", 10_000, 500), "the second Oman project moved too");
  });

  test("DECREASE (Qatar 40 -> 20): the regional cost doubles, for the project with the Oman-looking number too", async () => {
    const v = await saveRate(u["pmo"]!, "Qatar", 20, "decrease");
    versionOf["Qatar"] = v;
    const res = await apply(u["pmo"]!, "Qatar", v);
    assert.equal(res.status, 200);
    assert.equal((await rowOf(P["Qatar"]!, e1.employeeNo)).manhourCostRegional!.toFixed(2), "500.00");
    assert.equal((await rowOf(spoof, e1.employeeNo)).manhourCostRegional!.toFixed(2), "500.00");
    assert.equal((await rowOf(P["Qatar"]!, e1.employeeNo)).manhourCost, 10_000);
    // Elixir Qatar shares the currency but not the rate: untouched.
    assert.equal((await rowOf(P["Elixir Qatar"]!, e1.employeeNo)).manhourCostRegional!.toFixed(2), "500.00");
    assert.equal((await rowOf(P["Elixir Qatar"]!, e1.employeeNo)).fxRateVersion, versionOf["Elixir Qatar"]);
  });

  test("a version saved while the previous application is still processing is refused (the run targets a specific version)", async () => {
    const run = await prisma.countryRateApplyRun.create({
      data: { regionId: regionId["Malaysia"]!, regionName: "Malaysia", targetVersion: 1, actorName: "CR", actorRole: "Administrator", status: "PROCESSING" },
    });
    try {
      const res = await call(u["admin"]!, `/manhour-conversion-rates/${regionId["Malaysia"]!}/versions`, { method: "POST", body: { inrPerRegionalUnit: 21 } });
      assert.equal(res.status, 409);
      assert.equal(await prisma.countryManhourFxRate.count({ where: { regionId: regionId["Malaysia"]! } }), 1);
      assert.equal((await apply(u["admin"]!, "Malaysia", 1)).status, 409, "and a second application cannot start alongside it");
    } finally {
      await prisma.countryRateApplyRun.delete({ where: { id: run.id } });
    }
  });
});

describe("the employee-rate recalculation (Option A) uses each project's own country rate", () => {
  test("raising and lowering an employee's INR rate recalculates every project in every country; each regional figure uses that country's rate", async () => {
    const up = await patchRate(u["admin"]!, e1.id, 1500);
    assert.equal(up.status, 200);
    assert.equal(up.body.data.costingRefresh.status, "SUCCEEDED");
    const rate = async (category: string) => Number((await latestOf(category))!.inrPerRegionalUnit);
    for (const category of CATEGORIES) {
      const projectId = P[category]!;
      const row = await rowOf(projectId, e1.employeeNo);
      const hours = row.totalHours;
      assert.equal(row.hourlyRateSnapshot, 1500);
      assert.equal(row.manhourCost, Math.round(hours * 1500 * 100) / 100, `${category}: INR = all hours x the new rate`);
      if (category === "India") {
        assert.equal(row.manhourCostRegional, null);
        assert.equal(row.costingStatus, "INR");
      } else {
        assert.equal(Number(row.manhourCostRegional!.toFixed(digits(category))), regionalOf(category, row.manhourCost, await rate(category)), `${category}: converted with its own country rate`);
      }
    }
    const down = await patchRate(u["admin"]!, e1.id, 900);
    assert.equal(down.status, 200);
    for (const category of CATEGORIES) {
      const row = await rowOf(P[category]!, e1.employeeNo);
      assert.equal(row.manhourCost, Math.round(row.totalHours * 900 * 100) / 100, `${category}: decrease recalculated too`);
      if (category !== "India") assert.equal(Number(row.manhourCostRegional!.toFixed(digits(category))), regionalOf(category, row.manhourCost, Number((await latestOf(category))!.inrPerRegionalUnit)));
    }
  });

  test("a country version saved but NOT applied does not leak into an employee-rate change: rows keep the rate they were applied with", async () => {
    const before = await rowOf(P["Malaysia"]!, e1.employeeNo);
    const v = await saveRate(u["admin"]!, "Malaysia", 40, "saved, not applied");
    const res = await patchRate(u["admin"]!, e1.id, 1000);
    assert.equal(res.status, 200);
    const row = await rowOf(P["Malaysia"]!, e1.employeeNo);
    assert.equal(row.fxRateVersion, before.fxRateVersion, "still its own version");
    assert.equal(row.fxRateInrPerRegional!.toFixed(0), "20");
    assert.equal(row.manhourCostRegional!.toFixed(2), regionalOf("Malaysia", row.manhourCost, 20).toFixed(2));
    // The explicit apply then moves it, from the current INR figure.
    assert.equal((await apply(u["admin"]!, "Malaysia", v)).status, 200);
    const applied = await rowOf(P["Malaysia"]!, e1.employeeNo);
    assert.equal(applied.fxRateVersion, v);
    assert.equal(applied.manhourCostRegional!.toFixed(2), regionalOf("Malaysia", applied.manhourCost, 40).toFixed(2));
  });
});

describe("failure leaves an identifiable state; a retry converts only what is still behind, once; a newer version supersedes", () => {
  async function installFailure(projectId: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION cr_fail_update() RETURNS trigger AS $$ BEGIN IF NEW."projectId" = '${projectId}' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`
    );
    await prisma.$executeRawUnsafe(`CREATE TRIGGER cr_fail_update BEFORE UPDATE ON "ProjectResource" FOR EACH ROW EXECUTE FUNCTION cr_fail_update()`);
  }
  async function removeFailure(): Promise<void> {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS cr_fail_update ON "ProjectResource"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS cr_fail_update()`);
  }

  test("partial failure is visible everywhere; retry (while still failing) stays failed; after the fault clears, retry completes once with no duplicate audit", async () => {
    const v = await saveRate(u["admin"]!, "Oman", 400, "failure test");
    versionOf["Oman"] = v;
    await installFailure(extraOman);
    let runId = "";
    try {
      const res = await apply(u["admin"]!, "Oman", v);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.status, "PARTIAL");
      assert.equal(res.body.data.failedCount, 1);
      runId = res.body.data.runId;
      assert.equal((await rowOf(P["Oman"]!, e1.employeeNo)).fxRateVersion, v, "the project that worked is converted");
      assert.equal((await rowOf(extraOman, e1.employeeNo)).fxRateVersion, v - 1, "the failed project was rolled back whole");

      assert.equal((await call(u["admin"]!, `/projects/${extraOman}`)).body.data.manhourRefreshStatus, "FAILED");
      assert.equal((await call(u["admin"]!, `/projects/${extraOman}/manhour-costing`)).body.data.refreshStatus, "FAILED");
      assert.equal((await call(u["admin"]!, `/projects/${P["Oman"]!}`)).body.data.manhourRefreshStatus, "CURRENT");
      const dash = (await call(u["admin"]!, "/dashboard/summary")).body.data;
      const flagged = [dash.kpis, ...dash.otherCurrencies].reduce((s: number, g: { manhourRefreshPendingProjects: number }) => s + g.manhourRefreshPendingProjects, 0);
      assert.ok(flagged >= 1, "the dashboard flags it");
      const open = await call(u["admin"]!, "/manhour-conversion-rates/runs");
      const mine = open.body.data.items.find((r: { runId: string }) => r.runId === runId);
      assert.ok(mine, "listed for recovery");
      assert.equal(mine.openProjects[0].projectId, extraOman);
      assert.match(mine.openProjects[0].lastError, /injected failure/);
      const countryCard = (await call(u["admin"]!, "/manhour-conversion-rates")).body.data.countries.find((c: { name: string }) => c.name === "Oman");
      assert.equal(countryCard.openRun.runId, runId);

      const stillFailing = await call(u["admin"]!, `/manhour-conversion-rates/runs/${runId}/retry`, { method: "POST" });
      assert.equal(stillFailing.status, 200);
      assert.equal(stillFailing.body.data.status, "PARTIAL");
    } finally {
      await removeFailure();
    }
    const audits = await prisma.projectResourceRepriceAudit.count({ where: { runId } });
    const retry = await call(u["admin"]!, `/manhour-conversion-rates/runs/${runId}/retry`, { method: "POST" });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.status, "SUCCEEDED");
    assert.equal((await rowOf(extraOman, e1.employeeNo)).fxRateVersion, v);
    assert.equal(Number((await rowOf(extraOman, e1.employeeNo)).manhourCostRegional!.toFixed(3)), regionalOf("Oman", (await rowOf(extraOman, e1.employeeNo)).manhourCost, 400));
    assert.equal((await call(u["admin"]!, `/projects/${extraOman}`)).body.data.manhourRefreshStatus, "CURRENT");
    assert.equal(await prisma.projectResourceRepriceAudit.count({ where: { runId } }), audits + 1, "exactly one audit row for the one project that was still behind");
    // A repeat does nothing.
    assert.equal((await call(u["admin"]!, `/manhour-conversion-rates/runs/${runId}/retry`, { method: "POST" })).body.data.status, "SUCCEEDED");
    assert.equal(await prisma.projectResourceRepriceAudit.count({ where: { runId } }), audits + 1);
  });

  test("if a NEWER version is saved while a run is failed, retrying the old one is refused; applying the newer one converts at the latest rate and clears the old run", async () => {
    const v1 = await saveRate(u["admin"]!, "Oman", 300, "v for the failed run");
    versionOf["Oman"] = v1;
    await installFailure(extraOman);
    let oldRun = "";
    try {
      const res = await apply(u["admin"]!, "Oman", v1);
      assert.equal(res.body.data.status, "PARTIAL");
      oldRun = res.body.data.runId;
    } finally {
      await removeFailure();
    }
    const v2 = await saveRate(u["admin"]!, "Oman", 350, "newer than the failed run");
    versionOf["Oman"] = v2;
    const refused = await call(u["admin"]!, `/manhour-conversion-rates/runs/${oldRun}/retry`, { method: "POST" });
    assert.equal(refused.status, 409);
    assert.match(refused.body.message, /newer rate/);
    assert.equal((await rowOf(extraOman, e1.employeeNo)).fxRateVersion, v1 - 1, "nothing was applied by the refused retry");

    const res = await apply(u["admin"]!, "Oman", v2);
    assert.equal(res.body.data.status, "SUCCEEDED");
    for (const projectId of [P["Oman"]!, extraOman]) {
      const row = await rowOf(projectId, e1.employeeNo);
      assert.equal(row.fxRateVersion, v2, "the latest rate, never the stale one");
      assert.equal(row.fxRateInrPerRegional!.toFixed(0), "350");
    }
    assert.equal((await prisma.countryRateApplyRun.findUniqueOrThrow({ where: { id: oldRun } })).status, "SUCCEEDED", "the old run's failed task was satisfied by the newer result");
    assert.equal((await call(u["admin"]!, `/projects/${extraOman}`)).body.data.manhourRefreshStatus, "CURRENT");
  });
});

describe("concurrency", () => {
  test("two simultaneous new versions both succeed with distinct, consecutive version numbers", async () => {
    const before = (await latestOf("Elixir Qatar"))!.version;
    const [a, b] = await Promise.all([saveRate(u["admin"]!, "Elixir Qatar", 21), saveRate(u["pmo"]!, "Elixir Qatar", 22)]);
    assert.deepEqual([a, b].sort(), [before + 1, before + 2]);
    versionOf["Elixir Qatar"] = (await latestOf("Elixir Qatar"))!.version;
  });

  test("two simultaneous applications of the same version convert each row once: no duplicate audit, no skipped row", async () => {
    const v = versionOf["Elixir Qatar"]!;
    const auditsBefore = await prisma.projectResourceRepriceAudit.count({ where: { regionId: regionId["Elixir Qatar"]! } });
    const behind = await prisma.projectResource.count({ where: { project: { regionId: regionId["Elixir Qatar"]!, isDeleted: false } } });
    const [a, b] = await Promise.all([apply(u["admin"]!, "Elixir Qatar", v), apply(u["pmo"]!, "Elixir Qatar", v)]);
    assert.ok([a.status, b.status].every((s) => s === 200 || s === 409), `statuses ${a.status}/${b.status}`);
    assert.ok([a.status, b.status].includes(200));
    assert.equal(await prisma.projectResourceRepriceAudit.count({ where: { regionId: regionId["Elixir Qatar"]! } }), auditsBefore + behind, "each behind row audited exactly once");
    const row = await rowOf(P["Elixir Qatar"]!, e1.employeeNo);
    assert.equal(row.fxRateVersion, v);
    assert.equal(await prisma.countryRateApplyTask.count({ where: { run: { regionId: regionId["Elixir Qatar"]! }, status: { not: "SUCCEEDED" } } }), 0);
  });

  test("an employee-rate change racing a country apply and a timesheet recompute ends consistent", async () => {
    const e3 = await makeEmployee("e3", 1000);
    const p = P["Abu Dhabi"]!;
    await logHours(e3.employeeNo, p, 20);
    await apply(u["admin"]!, "Abu Dhabi", versionOf["Abu Dhabi"]!); // brings e3's row onto the current version if it was behind
    const v = await saveRate(u["admin"]!, "Abu Dhabi", 30);
    versionOf["Abu Dhabi"] = v;
    const [patch, applied] = await Promise.all([patchRate(u["admin"]!, e3.id, 1700), apply(u["admin"]!, "Abu Dhabi", v), logHours(e3.employeeNo, p, 5)]);
    assert.equal(patch.status, 200);
    assert.equal(applied.status, 200);
    const finalRate = (await prisma.employee.findUniqueOrThrow({ where: { id: e3.id } })).manhourExpenses;
    const row = await rowOf(p, e3.employeeNo);
    assert.equal(row.totalHours, 25, "no hours lost");
    assert.equal(row.manhourCost, Math.round(25 * finalRate * 100) / 100, "INR = all hours x the final saved rate");
    assert.equal(row.fxRateVersion, v);
    assert.equal(row.manhourCostRegional!.toFixed(2), regionalOf("Abu Dhabi", row.manhourCost, 30).toFixed(2), "regional = the INR cost converted exactly once");
  });
});

describe("India is untouched", () => {
  test("every stored value of the India row is exactly as before any country rate existed, and no India project was ever in a preview, run or audit", async () => {
    const now = await rowOf(P["India"]!, e1.employeeNo);
    // The employee-rate change recalculated the INR cost (Option A); everything about conversion is unchanged.
    assert.equal(now.costingStatus, "INR");
    assert.equal(now.costCurrency, "INR");
    assert.equal(now.manhourCostRegional, null);
    assert.equal(now.fxRateVersion, null);
    assert.equal(now.fxRateInrPerRegional, null);
    assert.equal(now.fxRateScope, null);
    assert.equal(now.rateSetAt, null);
    assert.equal(now.totalHours, indiaBefore.totalHours);
    assert.equal(now.manhourCost, Math.round(now.totalHours * now.hourlyRateSnapshot * 100) / 100, "INR cost = hours x rate exactly as before");
    assert.equal(await prisma.projectResourceRepriceAudit.count({ where: { projectId: P["India"]! } }), 0);
    assert.equal(await prisma.countryRateApplyTask.count({ where: { projectId: P["India"]! } }), 0);
  });

  test("a country rate change never rewrites an India row: its updatedAt does not move when other countries are applied", async () => {
    const before = await rowOf(P["India"]!, e1.employeeNo);
    const v = await saveRate(u["admin"]!, "Malaysia", 22);
    assert.equal((await apply(u["admin"]!, "Malaysia", v)).status, 200);
    const v2 = await saveRate(u["admin"]!, "Qatar", 25);
    assert.equal((await apply(u["admin"]!, "Qatar", v2)).status, 200);
    const after = await rowOf(P["India"]!, e1.employeeNo);
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
    assert.equal(after.manhourCost, before.manhourCost);
  });

  test("an employee-rate change prices India in INR only and leaves it unconverted; the India project reads as INR with no country rate", async () => {
    const res = await patchRate(u["admin"]!, e1.id, 1100);
    assert.equal(res.status, 200);
    const row = await rowOf(P["India"]!, e1.employeeNo);
    assert.equal(row.manhourCost, Math.round(row.totalHours * 1100 * 100) / 100);
    assert.equal(row.costingStatus, "INR");
    assert.equal(row.manhourCostRegional, null);
    const costing = (await call(u["admin"]!, `/projects/${P["India"]!}/manhour-costing`)).body.data;
    assert.equal(costing.requiresRate, false);
    assert.equal(costing.countryRate, null);
    assert.equal(costing.totals.costInProjectCurrency, costing.totals.costInr);
  });
});

describe("every screen reads the same stored figures", () => {
  test("for each non-India country: the stored rows, the costing endpoint and the project API agree, the applicable country rate is shown read-only, and nothing is pending", async () => {
    for (const category of CATEGORIES) {
      const projectId = P[category]!;
      const rows = await prisma.projectResource.findMany({ where: { projectId } });
      const costing = (await call(u["admin"]!, `/projects/${projectId}/manhour-costing`)).body.data;
      const project = (await call(u["admin"]!, `/projects/${projectId}`)).body.data;
      const storedInr = Math.round(rows.reduce((s, r) => s + r.manhourCost, 0) * 100) / 100;
      assert.equal(costing.totals.costInr, storedInr, `${category}: costing INR`);
      assert.equal(project.manhourCostINR, storedInr, `${category}: project API INR`);
      assert.equal(costing.refreshStatus, "CURRENT");
      if (category === "India") continue;
      const storedRegional = rows.reduce((s, r) => s + Number(r.manhourCostRegional ?? 0), 0);
      assert.equal(costing.totals.costInProjectCurrency, Math.round(storedRegional * 1000) / 1000, `${category}: costing regional`);
      assert.equal(project.manhourCostRegional, costing.totals.costInProjectCurrency, `${category}: project API regional`);
      assert.equal(costing.countryRate.version, (await latestOf(category))!.version);
      assert.equal(costing.countryRate.inrPerRegionalUnit, Number((await latestOf(category))!.inrPerRegionalUnit));
      assert.equal(costing.requiresRate, true);
    }
  });

  test("the project-level rate routes are gone: a project can no longer create or apply its own conversion rate", async () => {
    const p = P["Oman"]!;
    for (const [method, path] of [
      ["POST", `/projects/${p}/manhour-rate`],
      ["GET", `/projects/${p}/manhour-rate`],
      ["GET", `/projects/${p}/manhour-rate/apply-preview`],
      ["POST", `/projects/${p}/manhour-rate/apply`],
    ] as const) {
      const res = await call(u["admin"]!, path, { method, ...(method === "POST" ? { body: { inrPerRegionalUnit: 250, expectedVersion: 1 } } : {}) });
      assert.equal(res.status, 404, `${method} ${path}`);
    }
  });

  test("the legacy per-project history table is untouched and unused: no rows were written to it", async () => {
    assert.equal(await prisma.projectManhourFxRate.count({ where: { projectId: { in: created.projects } } }), 0);
  });
});
