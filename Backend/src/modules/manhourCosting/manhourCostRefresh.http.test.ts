import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { PR_CATEGORY_PREFIX_MAP } from "../projects/project.constants.js";
import { recomputeProjectResource } from "../timesheets/services/projectResource.service.js";
import { processRun, recordRateChangeRun } from "./manhourCostRefresh.service.js";
import { purgeCountryRates } from "../manhourRates/countryRate.testkit.js";

/**
 * Phase 4 / Option A, end to end: changing an employee's hourly rate (Manpower edit or Excel import) recalculates EVERY existing project row of that
 * employee from the new rate (historical hours included, rate decreases too), in each project's own currency with its own FX version, audited, safe under
 * concurrency, retryable after a failure, and visible as pending / failed on every project until current. Rates here are TEST FIXTURES.
 */

const TAG = `oa-${Date.now()}`;
const PASSWORD = "OptionA@12345";
const CATEGORIES = ["India", "Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"] as const;
const CURRENCY: Record<string, string> = { India: "INR", Malaysia: "MYR", Oman: "OMR", "Abu Dhabi": "AED", FZI: "AED", "Elixir Qatar": "QAR", Qatar: "QAR" };
// "1 regional unit = X INR" per project (test fixtures) and the hours the employee has on each project.
const FX: Record<string, number> = { Malaysia: 20, Oman: 250, "Abu Dhabi": 25, FZI: 25, "Elixir Qatar": 20, Qatar: 40 };
const HOURS: Record<string, number> = { India: 100, Oman: 80, Qatar: 60, Malaysia: 50, "Abu Dhabi": 40, FZI: 30, "Elixir Qatar": 20 };

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[], employees: [] as string[] };
const regionId = {} as Record<string, string>;
const project = {} as Record<string, string>;
const categoryOf = {} as Record<string, string>; // project id -> its PR Category (the country the rate belongs to)
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
}

async function makeUser(label: string, roleName: string, modules: string[], opts: { allCountries?: boolean; categories?: string[] } = {}): Promise<Actor> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const mods = await prisma.module.findMany({ where: { name: { in: modules } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `OA ${label}`,
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
  return { id: user.id, token: signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName }) };
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
const prNoFor = (category: string) => `${PR_CATEGORY_PREFIX_MAP[category as keyof typeof PR_CATEGORY_PREFIX_MAP]}${TAG}-${++seq}`;

async function insertProject(category: string): Promise<string> {
  const region = await prisma.region.findUniqueOrThrow({ where: { id: regionId[category]! } });
  const row = await prisma.project.create({
    data: {
      poMonth: "2026-11", prCategory: category, prNo: prNoFor(category), client: "OA Client", department: "Process", domesticForeign: "Domestic",
      projectTitle: `OA ${category} ${TAG}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active",
      regionId: regionId[category]!, regionalCurrency: region.defaultCurrency,
    },
  });
  created.projects.push(row.id);
  categoryOf[row.id] = category;
  return row.id;
}

async function makeEmployee(label: string, rate: number): Promise<{ employeeNo: string; id: string }> {
  const employeeNo = `${TAG}-${label}`;
  const row = await prisma.employee.create({
    data: { employeeNo, employeeName: `OA ${label}`, department: "Process", designation: "Engineer", grade: "MG4", location: "Chennai", manhourExpenses: rate },
  });
  created.employees.push(employeeNo);
  return { employeeNo, id: row.id };
}

let day = 0;
async function logHours(employeeNo: string, projectId: string, hours: number, workDate?: Date): Promise<void> {
  day += 1;
  await prisma.timesheetEntry.create({
    data: { employeeNo, projectId, rawProjectCode: `OA-${TAG}`, workDate: workDate ?? new Date(Date.UTC(2026, 8, day % 28 + 1)), hours, firstImportId: importId, lastImportId: importId },
  });
  await recomputeProjectResource(employeeNo, projectId);
}

const rowOf = (projectId: string, employeeNo: string) => prisma.projectResource.findUniqueOrThrow({ where: { projectId_employeeNo: { projectId, employeeNo } } });
// The manpower conversion rate belongs to the project's COUNTRY (central, Manpower > Manpower Conversion Rates). Saves a new country version unless the latest
// one already has this value; returns the version in force. Saving a version never rewrites existing rows (only an explicit apply does).
async function setFx(admin: Actor, projectId: string, value: number): Promise<{ status: number; version: number }> {
  const region = regionId[categoryOf[projectId]!]!;
  const latest = await prisma.countryManhourFxRate.findFirst({ where: { regionId: region }, orderBy: { version: "desc" } });
  if (latest && Number(latest.inrPerRegionalUnit) === value) return { status: 201, version: latest.version };
  const res = await call(admin, `/manhour-conversion-rates/${region}/versions`, { method: "POST", body: { inrPerRegionalUnit: value } });
  return { status: res.status, version: res.body?.data?.current?.version };
}
const applyFx = (admin: Actor, projectId: string, expectedVersion: number) => call(admin, `/manhour-conversion-rates/${regionId[categoryOf[projectId]!]!}/apply`, { method: "POST", body: { expectedVersion } });
const patchRate = (actor: Actor, employeeId: string, value: number) => call(actor, `/employees/${employeeId}`, { method: "PATCH", body: { manhourExpenses: value } });
const inr = (hours: number, rate: number) => Math.round(hours * rate * 100) / 100;
const digits = (category: string) => (CURRENCY[category] === "OMR" ? 3 : 2);
const regional = (category: string, costInr: number) => Number(((Math.round((costInr / FX[category]!) * 10 ** digits(category))) / 10 ** digits(category)).toFixed(digits(category)));

const u = {} as Record<string, Actor>;
let e1 = { employeeNo: "", id: "" };

before(async () => {
  setMode("off");
  importId = (await prisma.timesheetImport.create({ data: { triggeredBy: "ManualUpload", totalRows: 0, status: "Succeeded" } })).id;
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId[r.name] = r.id;
  await purgeCountryRates(Object.values(regionId)); // a clean slate: version 1 below is this file's own
  for (const category of CATEGORIES) project[category] = await insertProject(category);
  u["admin"] = await makeUser("admin", "Administrator", ["Projects", "Dashboard", "Manpower", "Manpower Conversion Rates"], { allCountries: true });
  u["noManpower"] = await makeUser("pm", "Project Manager", ["Projects"], { allCountries: true });
  u["readonly"] = await makeUser("readonly", "Read Only", ["Projects", "Manpower"], { allCountries: true });
  u["omanPmo"] = await makeUser("oman-pmo", "PMO Manager", ["Projects", "Dashboard", "Manpower"], { categories: ["Oman"] });
  u["indiaPmo"] = await makeUser("india-pmo", "PMO Manager", ["Projects", "Dashboard", "Manpower"], { categories: ["India"] });
  await listen();
  for (const category of CATEGORIES) if (category !== "India") assert.equal((await setFx(u["admin"]!, project[category]!, FX[category]!)).status, 201);
  e1 = await makeEmployee("e1", 1000);
  for (const category of CATEGORIES) await logHours(e1.employeeNo, project[category]!, HOURS[category]!);
});

after(async () => {
  try {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS oa_fail_update ON "ProjectResource"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS oa_fail_update()`);
    await prisma.manhourCostChangeAudit.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.manhourRateChangeRun.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.projectResourceRepriceAudit.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.countryRateApplyRun.deleteMany({ where: { actorUserId: { in: created.users } } });
    await prisma.timesheetEntry.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.timesheetImport.deleteMany({ where: { id: importId } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.employee.deleteMany({ where: { employeeNo: { in: created.employees } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    await purgeCountryRates(Object.values(regionId));
    setMode("off");
    await closeServer();
  }
});

describe("baseline before any rate change", () => {
  test("the employee's INR rate prices the hours on all seven projects; non-INR rows are converted with their own FX", async () => {
    for (const category of CATEGORIES) {
      const row = await rowOf(project[category]!, e1.employeeNo);
      assert.equal(row.manhourCost, inr(HOURS[category]!, 1000), category);
      if (category === "India") assert.equal(row.manhourCostRegional, null);
      else assert.equal(Number(row.manhourCostRegional!.toFixed(digits(category))), regional(category, inr(HOURS[category]!, 1000)), category);
    }
  });
});

describe("a rate INCREASE recalculates every existing project of the employee (the brief's example, INR 1,000 to 1,500)", () => {
  let runBefore = 0;
  before(async () => {
    runBefore = await prisma.manhourRateChangeRun.count({ where: { employeeNo: e1.employeeNo } });
  });

  test("manual Manpower update: all seven projects use INR 1,500 for all their hours, in their own currency and FX version", async () => {
    const fxVersionsBefore = await prisma.projectManhourFxRate.count({ where: { projectId: { in: Object.values(project) } } });
    const res = await patchRate(u["admin"]!, e1.id, 1500);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.costingRefresh.status, "SUCCEEDED");
    assert.equal(res.body.data.costingRefresh.projectCount, 7);
    assert.equal(res.body.data.costingRefresh.failedCount, 0);
    for (const category of CATEGORIES) {
      const row = await rowOf(project[category]!, e1.employeeNo);
      assert.equal(row.hourlyRateSnapshot, 1500, `${category}: rate used`);
      assert.equal(row.manhourCost, inr(HOURS[category]!, 1500), `${category}: INR cost`);
      if (category === "India") {
        assert.equal(row.costingStatus, "INR");
        assert.equal(row.manhourCostRegional, null, "no conversion for India");
      } else {
        assert.equal(row.costingStatus, "CONVERTED");
        assert.equal(row.costCurrency, CURRENCY[category]);
        assert.equal(Number(row.manhourCostRegional!.toFixed(digits(category))), regional(category, inr(HOURS[category]!, 1500)), `${category}: regional`);
        assert.equal(row.fxRateVersion, 1, `${category}: the project's existing FX version`);
      }
    }
    // The brief's three figures.
    assert.equal((await rowOf(project["India"]!, e1.employeeNo)).manhourCost, 150_000);
    assert.equal((await rowOf(project["Oman"]!, e1.employeeNo)).manhourCost, 120_000);
    assert.equal((await rowOf(project["Qatar"]!, e1.employeeNo)).manhourCost, 90_000);
    assert.equal(await prisma.projectManhourFxRate.count({ where: { projectId: { in: Object.values(project) } } }), fxVersionsBefore, "no FX version created or changed by an employee-rate change");
  });

  test("the recalculation audit: who, when, source, previous and new rate and cost per project, FX version, result", async () => {
    const runs = await prisma.manhourRateChangeRun.findMany({ where: { employeeNo: e1.employeeNo }, orderBy: { createdAt: "desc" }, include: { tasks: true } });
    assert.equal(runs.length, runBefore + 1);
    const run = runs[0]!;
    assert.equal(run.source, "MANUAL_UPDATE");
    assert.equal(run.previousRate, 1000);
    assert.equal(run.newRate, 1500);
    assert.equal(run.actorRole, "Administrator");
    assert.match(run.actorName, /OA admin/);
    assert.equal(run.status, "SUCCEEDED");
    assert.equal(run.projectCount, 7);
    assert.equal(run.succeededCount, 7);
    assert.ok(run.finishedAt);
    assert.ok(run.tasks.every((t) => t.status === "SUCCEEDED"));
    const audits = await prisma.manhourCostChangeAudit.findMany({ where: { runId: run.id } });
    assert.equal(audits.length, 7);
    const oman = audits.find((a) => a.projectId === project["Oman"]!)!;
    assert.equal(oman.previousRate, 1000);
    assert.equal(oman.newRate, 1500);
    assert.equal(oman.previousCostInr, 80_000);
    assert.equal(oman.newCostInr, 120_000);
    assert.equal(oman.fxRateVersion, 1);
    assert.equal(oman.previousCostRegional?.toFixed(3), "320.000");
    assert.equal(oman.newCostRegional?.toFixed(3), "480.000");
    const india = audits.find((a) => a.projectId === project["India"]!)!;
    assert.equal(india.newCostInr, 150_000);
    assert.equal(india.newCostRegional, null);
  });

  test("a rate DECREASE (1,500 to 1,200) works the same way, downward", async () => {
    const res = await patchRate(u["admin"]!, e1.id, 1200);
    assert.equal(res.body.data.costingRefresh.status, "SUCCEEDED");
    for (const category of CATEGORIES) {
      const row = await rowOf(project[category]!, e1.employeeNo);
      assert.equal(row.hourlyRateSnapshot, 1200);
      assert.equal(row.manhourCost, inr(HOURS[category]!, 1200), category);
      if (category !== "India") assert.equal(Number(row.manhourCostRegional!.toFixed(digits(category))), regional(category, inr(HOURS[category]!, 1200)), category);
    }
    const audit = await prisma.manhourCostChangeAudit.findFirstOrThrow({ where: { projectId: project["India"]!, employeeNo: e1.employeeNo, newRate: 1200 } });
    assert.equal(audit.previousCostInr, 150_000);
    assert.equal(audit.newCostInr, 120_000);
  });
});

describe("no unnecessary work", () => {
  test("an unchanged rate, an edit without a rate, and a new employee with no assignments record no recalculation", async () => {
    const runsBefore = await prisma.manhourRateChangeRun.count();
    const same = await patchRate(u["admin"]!, e1.id, 1200);
    assert.equal(same.status, 200);
    assert.equal(same.body.data.costingRefresh, undefined);
    const other = await call(u["admin"]!, `/employees/${e1.id}`, { method: "PATCH", body: { designation: "Senior Engineer" } });
    assert.equal(other.status, 200);
    assert.equal(other.body.data.costingRefresh, undefined);
    const fresh = await call(u["admin"]!, "/employees", {
      method: "POST",
      body: { employeeNo: `${TAG}-new`, employeeName: "OA new", department: "Process", designation: "Engineer", grade: "MG1", location: "Chennai", manhourExpenses: 900, status: "Active" },
    });
    assert.equal(fresh.status, 201);
    created.employees.push(`${TAG}-new`);
    assert.equal(fresh.body.data.costingRefresh, undefined);
    assert.equal(await prisma.manhourRateChangeRun.count(), runsBefore, "no run was recorded by any of the three");
  });

  test("rows recorded under an employee number before the employee existed (priced at 0) are recalculated when the employee is created", async () => {
    const orphanNo = `${TAG}-orphan`;
    const p = await insertProject("India");
    await logHours(orphanNo, p, 10);
    created.employees.push(orphanNo);
    assert.equal((await rowOf(p, orphanNo)).manhourCost, 0, "no Employee row yet: priced at 0, as before");
    const res = await call(u["admin"]!, "/employees", {
      method: "POST",
      body: { employeeNo: orphanNo, employeeName: "OA orphan", department: "Process", designation: "Engineer", grade: "MG1", location: "Chennai", manhourExpenses: 700, status: "Active" },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.costingRefresh.status, "SUCCEEDED");
    assert.equal((await rowOf(p, orphanNo)).manhourCost, 7000);
    const run = await prisma.manhourRateChangeRun.findFirstOrThrow({ where: { employeeNo: orphanNo } });
    assert.equal(run.source, "EMPLOYEE_CREATE");
  });

  test("unrelated employees and projects are untouched", async () => {
    const e2 = await makeEmployee("e2", 800);
    const p = await insertProject("India");
    await logHours(e2.employeeNo, p, 10);
    const before = await rowOf(p, e2.employeeNo);
    await patchRate(u["admin"]!, e1.id, 1300);
    const after = await rowOf(p, e2.employeeNo);
    assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime(), "another employee's row was not even written");
    assert.equal(after.manhourCost, 8000);
    assert.equal(await prisma.manhourCostChangeAudit.count({ where: { employeeNo: e2.employeeNo } }), 0);
    // The employee has no row on this project either: no task for it.
    assert.equal(await prisma.manhourRefreshTask.count({ where: { projectId: p } }), 0);
    await patchRate(u["admin"]!, e1.id, 1200);
  });
});

describe("Excel import route", () => {
  test("a changed imported rate recalculates; an unchanged imported rate does not; the response says so", async () => {
    const e3 = await makeEmployee("e3", 1000);
    const e4 = await makeEmployee("e4", 800);
    const p = await insertProject("India");
    await logHours(e3.employeeNo, p, 10);
    await logHours(e4.employeeNo, p, 10);
    const runsBefore = await prisma.manhourRateChangeRun.count();
    const row = (employeeNo: string, rate: number) => ({ employeeNo, employeeName: `OA ${employeeNo}`, department: "Process", designation: "Engineer", grade: "MG4", location: "Chennai", manhourExpenses: rate, status: "Active" });
    const res = await call(u["admin"]!, "/employees/import", { method: "POST", body: { employees: [row(e3.employeeNo, 1400), row(e4.employeeNo, 800)] } });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.updated, 2);
    assert.deepEqual(res.body.data.costingRefresh, { runs: 1, incompleteRuns: 0 });
    assert.equal((await rowOf(p, e3.employeeNo)).manhourCost, 14_000);
    assert.equal((await rowOf(p, e3.employeeNo)).hourlyRateSnapshot, 1400);
    assert.equal((await rowOf(p, e4.employeeNo)).manhourCost, 8_000, "unchanged imported rate: not recalculated");
    assert.equal(await prisma.manhourRateChangeRun.count(), runsBefore + 1);
    const run = await prisma.manhourRateChangeRun.findFirstOrThrow({ where: { employeeNo: e3.employeeNo } });
    assert.equal(run.source, "EXCEL_IMPORT");
    assert.equal(run.previousRate, 1000);
    assert.equal(run.newRate, 1400);
  });
});

describe("independent of the country's conversion-rate versions", () => {
  test("a row keeps the FX version it was converted with; a project with no FX rate stays 'Rate not set' while its INR cost follows the new rate; a later apply uses the current INR", async () => {
    const p = project["Oman"]!;
    const saved = await setFx(u["admin"]!, p, 260); // a newer Oman version, NOT applied
    assert.equal(saved.status, 201);
    const fxCount = await prisma.countryManhourFxRate.count({ where: { regionId: regionId["Oman"]! } });
    // A project with NO APPLICABLE country rate: its currency is not the one the Qatar rate was entered for, so nothing is converted or guessed. (A country with no
    // rate at all is covered in countryRate.http.test.ts; every country here has one.)
    const noFx = await insertProject("Qatar");
    await prisma.project.update({ where: { id: noFx }, data: { regionalCurrency: "USD" } });
    await logHours(e1.employeeNo, noFx, 10);
    assert.equal((await rowOf(noFx, e1.employeeNo)).costingStatus, "RATE_MISSING");

    await patchRate(u["admin"]!, e1.id, 1600);
    const converted = await rowOf(p, e1.employeeNo);
    assert.equal(converted.fxRateVersion, 1, "still the row's own version; the newer version was never applied");
    assert.equal(converted.fxRateInrPerRegional?.toFixed(3), "250.000");
    assert.equal(Number(converted.manhourCostRegional!.toFixed(3)), Number((inr(80, 1600) / 250).toFixed(3)));
    assert.equal(await prisma.countryManhourFxRate.count({ where: { regionId: regionId["Oman"]! } }), fxCount, "the employee-rate change created no FX version");
    const missing = await rowOf(noFx, e1.employeeNo);
    assert.equal(missing.manhourCost, inr(10, 1600));
    assert.equal(missing.costingStatus, "RATE_MISSING");
    assert.equal(missing.manhourCostRegional, null, "never an INR amount presented as regional");

    // The explicit FX apply recalculates the regional figure from the CURRENT INR cost; the INR cost itself does not move.
    const apply = await applyFx(u["admin"]!, p, saved.version);
    assert.equal(apply.status, 200);
    const applied = await rowOf(p, e1.employeeNo);
    assert.equal(applied.manhourCost, inr(80, 1600));
    assert.equal(applied.fxRateVersion, saved.version);
    assert.equal(applied.fxRateScope, "COUNTRY");
    assert.equal(Number(applied.manhourCostRegional!.toFixed(3)), Number((inr(80, 1600) / 260).toFixed(3)));
    await patchRate(u["admin"]!, e1.id, 1200);
  });
});

describe("every screen reads the same authoritative figures", () => {
  test("Oman: resource list, project API, costing endpoint and dashboard agree, months add up, and the project reads as current", async () => {
    const p = project["Oman"]!;
    const admin = u["admin"]!;
    const stored = await rowOf(p, e1.employeeNo);
    const list = await call(admin, `/projects/${p}/resources`);
    const listed = list.body.data.items.find((i: { employeeNo: string }) => i.employeeNo === e1.employeeNo);
    const proj = await call(admin, `/projects/${p}`);
    const costing = await call(admin, `/projects/${p}/manhour-costing`);
    assert.equal(costing.status, 200);
    const row = costing.body.data.rows.find((r: { employeeNo: string }) => r.employeeNo === e1.employeeNo);

    assert.equal(listed.manhourCost, stored.manhourCost);
    assert.equal(row.costInr, stored.manhourCost);
    assert.equal(row.hourlyRateInr, 1200);
    assert.equal(listed.manhourCostRegional, Number(stored.manhourCostRegional!.toFixed(3)));
    assert.equal(row.costRegional, listed.manhourCostRegional);
    assert.equal(proj.body.data.manhourCostINR, stored.manhourCost);
    assert.equal(proj.body.data.manhourCostRegional, row.costRegional);
    assert.equal(costing.body.data.totals.costInProjectCurrency, proj.body.data.manhourCostRegional);
    assert.equal(proj.body.data.manhourRefreshStatus, "CURRENT");
    assert.equal(costing.body.data.refreshStatus, "CURRENT");

    const monthInr = Math.round(row.months.reduce((s: number, m: { costInr: number }) => s + m.costInr, 0) * 100) / 100;
    const monthRegional = Math.round(row.months.reduce((s: number, m: { costRegional: number }) => s + m.costRegional, 0) * 1000) / 1000;
    assert.equal(monthInr, row.costInr, "the monthly split adds up to the lifetime INR figure");
    assert.equal(monthRegional, row.costRegional, "and to the lifetime regional figure");
  });

  test("Dashboard (an Oman-only view): Actual Project Cost = the converted man-hour cost + other expenses, and nothing is flagged while projects are current", async () => {
    setMode("enforce");
    try {
      const res = await call(u["omanPmo"]!, "/dashboard/summary");
      assert.equal(res.status, 200);
      const manhour = Number(
        (await prisma.projectResource.aggregate({ where: { project: { regionId: regionId["Oman"]!, isDeleted: false }, costingStatus: "CONVERTED" }, _sum: { manhourCostRegional: true } }))._sum.manhourCostRegional ?? 0
      );
      const expenses = Number((await prisma.projectExpense.aggregate({ where: { project: { regionId: regionId["Oman"]!, isDeleted: false }, isActive: true }, _sum: { totalCost: true } }))._sum.totalCost ?? 0);
      assert.equal(Number(res.body.data.kpis.totalActualProjectCost.toFixed(3)), Number((manhour + expenses).toFixed(3)));
      assert.equal(res.body.data.kpis.manhourRefreshPendingProjects, 0);
    } finally {
      setMode("off");
    }
  });
});

describe("failure leaves an identifiable state, never a project shown as current; a retry uses the latest saved rate", () => {
  test("partial failure, visible status, retry", async () => {
    const e5 = await makeEmployee("e5", 1000);
    const pa = await insertProject("Malaysia");
    const pb = await insertProject("Malaysia");
    for (const p of [pa, pb]) {
      await setFx(u["admin"]!, p, 20);
      await logHours(e5.employeeNo, p, 10);
    }
    // Inject a failure for ONE project only: any write to its ProjectResource rows raises.
    await prisma.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION oa_fail_update() RETURNS trigger AS $$ BEGIN IF NEW."projectId" = '${pb}' THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`
    );
    await prisma.$executeRawUnsafe(`CREATE TRIGGER oa_fail_update BEFORE UPDATE ON "ProjectResource" FOR EACH ROW EXECUTE FUNCTION oa_fail_update()`);
    try {
      const res = await patchRate(u["admin"]!, e5.id, 2000);
      assert.equal(res.status, 200, "the rate itself is saved");
      assert.equal((await prisma.employee.findUniqueOrThrow({ where: { id: e5.id } })).manhourExpenses, 2000);
      assert.equal(res.body.data.costingRefresh.status, "PARTIAL");
      assert.equal(res.body.data.costingRefresh.failedCount, 1);
      assert.equal((await rowOf(pa, e5.employeeNo)).manhourCost, 20_000, "the project that worked is recalculated");
      assert.equal((await rowOf(pb, e5.employeeNo)).manhourCost, 10_000, "the failed project was rolled back whole: no half-updated row");

      const run = await prisma.manhourRateChangeRun.findFirstOrThrow({ where: { employeeNo: e5.employeeNo }, include: { tasks: true } });
      assert.equal(run.status, "PARTIAL");
      assert.equal(run.tasks.find((t) => t.projectId === pa)!.status, "SUCCEEDED");
      const failedTask = run.tasks.find((t) => t.projectId === pb)!;
      assert.equal(failedTask.status, "FAILED");
      assert.match(failedTask.lastError ?? "", /injected failure/);

      // Visible on the project, the central read model, the dashboard and the recovery list.
      assert.equal((await call(u["admin"]!, `/projects/${pb}`)).body.data.manhourRefreshStatus, "FAILED");
      assert.equal((await call(u["admin"]!, `/projects/${pa}`)).body.data.manhourRefreshStatus, "CURRENT");
      assert.equal((await call(u["admin"]!, `/projects/${pb}/manhour-costing`)).body.data.refreshStatus, "FAILED");
      // The Malaysia project is in the MYR group of the dashboard (the headline group is INR when India projects are in view): flagged in whichever group holds it.
      const dash = (await call(u["admin"]!, "/dashboard/summary")).body.data;
      const flagged = [dash.kpis, ...dash.otherCurrencies].reduce((s: number, g: { manhourRefreshPendingProjects: number }) => s + g.manhourRefreshPendingProjects, 0);
      assert.ok(flagged >= 1, "the dashboard flags the project whose recalculation failed");
      const open = await call(u["admin"]!, "/manhour-refresh/runs");
      assert.ok(open.body.data.items.some((r: { runId: string }) => r.runId === run.id));

      // A second change before the retry: the retry must apply the LATEST saved rate, not the queued one.
      const second = await patchRate(u["admin"]!, e5.id, 2500);
      assert.equal(second.body.data.costingRefresh.status, "PARTIAL");
      assert.equal((await rowOf(pa, e5.employeeNo)).manhourCost, 25_000);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS oa_fail_update ON "ProjectResource"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS oa_fail_update()`);
    }
    const firstRun = await prisma.manhourRateChangeRun.findFirstOrThrow({ where: { employeeNo: e5.employeeNo, newRate: 2000 } });
    const retry = await call(u["admin"]!, `/manhour-refresh/runs/${firstRun.id}/retry`, { method: "POST" });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.data.status, "SUCCEEDED");
    assert.equal((await rowOf(pb, e5.employeeNo)).manhourCost, 25_000, "priced at the latest saved rate (2,500), not the queued 2,000");
    assert.equal((await call(u["admin"]!, `/projects/${pb}`)).body.data.manhourRefreshStatus, "CURRENT");
    const secondRun = await prisma.manhourRateChangeRun.findFirstOrThrow({ where: { employeeNo: e5.employeeNo, newRate: 2500 } });
    assert.equal(secondRun.status, "SUCCEEDED", "the later run's failed task was satisfied by the same result and its status was brought up to date");
    assert.equal((await call(u["admin"]!, `/projects/${pb}/manhour-costing`)).body.data.refreshStatus, "CURRENT");
    // A repeated retry changes nothing and writes no new audit rows.
    const auditsBefore = await prisma.manhourCostChangeAudit.count({ where: { employeeNo: e5.employeeNo } });
    assert.equal((await call(u["admin"]!, `/manhour-refresh/runs/${firstRun.id}/retry`, { method: "POST" })).body.data.status, "SUCCEEDED");
    assert.equal(await prisma.manhourCostChangeAudit.count({ where: { employeeNo: e5.employeeNo } }), auditsBefore);
  });
});

describe("concurrency and repetition", () => {
  test("two simultaneous employee-rate updates end consistent with the final saved rate and leave nothing pending", async () => {
    const e6 = await makeEmployee("e6", 1000);
    const ps = [await insertProject("Oman"), await insertProject("Abu Dhabi"), await insertProject("India")];
    for (const p of ps) {
      if (p !== ps[2]) await setFx(u["admin"]!, p, 25);
      await logHours(e6.employeeNo, p, 12);
    }
    const [a, b] = await Promise.all([patchRate(u["admin"]!, e6.id, 1500), patchRate(u["admin"]!, e6.id, 1800)]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const finalRate = (await prisma.employee.findUniqueOrThrow({ where: { id: e6.id } })).manhourExpenses;
    for (const p of ps) {
      const row = await rowOf(p, e6.employeeNo);
      assert.equal(row.hourlyRateSnapshot, finalRate);
      assert.equal(row.manhourCost, inr(12, finalRate));
      assert.equal((await call(u["admin"]!, `/projects/${p}`)).body.data.manhourRefreshStatus, "CURRENT");
    }
    assert.equal(await prisma.manhourRefreshTask.count({ where: { run: { employeeNo: e6.employeeNo }, status: { not: "SUCCEEDED" } } }), 0);
    assert.equal((await prisma.manhourRateChangeRun.findMany({ where: { employeeNo: e6.employeeNo } })).every((r) => r.status === "SUCCEEDED"), true);
  });

  test("an employee-rate change while a project's FX apply and a timesheet recompute are running ends consistent", async () => {
    const e7 = await makeEmployee("e7", 1000);
    const p = await insertProject("Oman");
    await setFx(u["admin"]!, p, 250);
    await logHours(e7.employeeNo, p, 20);
    const second = await setFx(u["admin"]!, p, 300); // a newer version, to be applied while the rate changes
    const [patch, apply] = await Promise.all([
      patchRate(u["admin"]!, e7.id, 1700),
      applyFx(u["admin"]!, p, second.version),
      logHours(e7.employeeNo, p, 5),
    ]);
    assert.equal(patch.status, 200);
    assert.equal(apply.status, 200);
    const finalRate = (await prisma.employee.findUniqueOrThrow({ where: { id: e7.id } })).manhourExpenses;
    const row = await rowOf(p, e7.employeeNo);
    assert.equal(row.totalHours, 25, "no hours lost");
    assert.equal(row.hourlyRateSnapshot, finalRate);
    assert.equal(row.manhourCost, inr(25, finalRate), "INR = all hours x the final saved rate");
    assert.equal(row.costingStatus, "CONVERTED");
    assert.equal(Number(row.manhourCostRegional!.toFixed(3)), Number((row.manhourCost / Number(row.fxRateInrPerRegional)).toFixed(3)), "regional = the INR cost converted exactly once with the row's own rate");
  });

  test("processing the same pending run twice at once recalculates once: no duplicate audit, no double count", async () => {
    const e8 = await makeEmployee("e8", 1000);
    const p = await insertProject("India");
    await logHours(e8.employeeNo, p, 10);
    await prisma.employee.update({ where: { id: e8.id }, data: { manhourExpenses: 1100 } });
    const run = await prisma.$transaction((tx) =>
      recordRateChangeRun(tx, { employeeNo: e8.employeeNo, previousRate: 1000, newRate: 1100, source: "MANUAL_UPDATE", actor: { sub: u["admin"]!.id, email: "x@example.com", roleName: "Administrator" } })
    );
    assert.ok(run);
    await Promise.all([processRun(run!.runId), processRun(run!.runId)]);
    assert.equal((await rowOf(p, e8.employeeNo)).manhourCost, 11_000);
    assert.equal(await prisma.manhourCostChangeAudit.count({ where: { runId: run!.runId } }), 1);
  });

  test("an employee with many project assignments is recalculated in one change", async () => {
    const e9 = await makeEmployee("e9", 1000);
    const many: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      const p = await insertProject("Malaysia");
      await setFx(u["admin"]!, p, 20);
      await logHours(e9.employeeNo, p, 4);
      many.push(p);
    }
    const started = Date.now();
    const res = await patchRate(u["admin"]!, e9.id, 1250);
    const elapsed = Date.now() - started;
    assert.equal(res.body.data.costingRefresh.projectCount, 25);
    assert.equal(res.body.data.costingRefresh.status, "SUCCEEDED");
    for (const p of many) assert.equal((await rowOf(p, e9.employeeNo)).manhourCost, 5000);
    assert.ok(elapsed < 20_000, `25 projects recalculated in ${elapsed} ms`);
  });
});

describe("permissions and isolation", () => {
  test("only users who can already change employees can trigger a recalculation or retry one; clients cannot submit costs", async () => {
    const runsBefore = await prisma.manhourRateChangeRun.count();
    assert.equal((await patchRate(u["noManpower"]!, e1.id, 3000)).status, 403, "no Manpower module");
    assert.equal((await patchRate(u["readonly"]!, e1.id, 3000)).status, 403, "Read Only role");
    assert.equal((await prisma.employee.findUniqueOrThrow({ where: { id: e1.id } })).manhourExpenses, 1200);
    assert.equal(await prisma.manhourRateChangeRun.count(), runsBefore);
    assert.equal((await call(u["noManpower"]!, "/manhour-refresh/runs")).status, 403);
    assert.equal((await call(u["noManpower"]!, `/manhour-refresh/runs/${(await prisma.manhourRateChangeRun.findFirstOrThrow()).id}/retry`, { method: "POST" })).status, 403);
    // A client-supplied cost is never accepted on the resource API: the cost is always hours x the employee's saved rate.
    const row = await rowOf(project["India"]!, e1.employeeNo);
    const res = await call(u["admin"]!, `/resources/${row.id}`, { method: "PATCH", body: { manhourCost: 1, hourlyRateSnapshot: 1 } });
    assert.equal(res.status, 200);
    assert.equal((await rowOf(project["India"]!, e1.employeeNo)).manhourCost, inr(100, 1200));
  });

  test("country access applies to the central costing read", async () => {
    setMode("enforce");
    try {
      const oman = project["Oman"]!;
      assert.ok([403, 404].includes((await call(u["indiaPmo"]!, `/projects/${oman}/manhour-costing`)).status));
      assert.equal((await call(u["omanPmo"]!, `/projects/${oman}/manhour-costing`)).status, 200);
    } finally {
      setMode("off");
    }
  });
});
