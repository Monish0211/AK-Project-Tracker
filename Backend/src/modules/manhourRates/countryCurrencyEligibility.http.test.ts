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
 * Three multi-country currency behaviours, end to end on the scratch database:
 *  1. Manpower cost follows the PROJECT's country and regional currency (never the employee's location): employee rates stay INR, a QAR project's team is
 *     costed in QAR with the Elixir Qatar rate, one employee on an Oman and a QAR project is costed with each project's own rate, Keka hours never change,
 *     and nothing is converted twice.
 *  2. The conversion-rate counters ("N projects", "N to apply") and the preview / apply count only projects whose stored regional currency is the country's
 *     currency: a legacy INR Elixir Qatar project (the EE-Q-2025-002 situation) and its four team members are never eligible and never touched.
 *  3. The dashboard of ONE enforced country with no projects labels its figures in that country's currency (QAR 0, not INR 0); with projects, All Countries,
 *     a several-country union, shadow and off it is exactly as before.
 * Rates are TEST FIXTURES. No mail can be sent: the run refuses to start with SMTP configured.
 */

const TAG = `cce-${Date.now()}`;
const MODULE = "Manpower Conversion Rates";
const CODE: Record<string, string> = { India: "india", Malaysia: "malaysia", Oman: "oman", "Abu Dhabi": "abu-dhabi", FZI: "fze", "Elixir Qatar": "elixir-qatar", Qatar: "qatar" };
const CURRENCY: Record<string, string> = { India: "INR", Malaysia: "MYR", Oman: "OMR", "Abu Dhabi": "AED", FZI: "AED", "Elixir Qatar": "QAR", Qatar: "QAR" };

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[], employees: [] as string[] };
const regionId = {} as Record<string, string>;
let importId = "";
const setMode = (mode: "off" | "shadow" | "enforce") => {
  process.env["COUNTRY_ACCESS_MODE"] = mode;
};

interface Actor {
  id: string;
  token: string;
}

async function makeUser(label: string, roleName: string, modules: string[], opts: { allCountries?: boolean; categories?: string[] } = {}): Promise<Actor> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const mods = await prisma.module.findMany({ where: { name: { in: modules } } });
  assert.equal(mods.length, modules.length, `modules exist: ${modules.join(", ")}`);
  const user = await prisma.portalUser.create({
    data: {
      fullName: `CCE ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword("CountryCurrency@12345"),
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

async function call(actor: Actor, path: string, opts: { method?: string; body?: unknown; country?: string } = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${url}${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${actor.token}`, ...(opts.country ? { "X-Active-Country": opts.country } : {}) },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let seq = 0;
const prNoFor = (category: string) => `${PR_CATEGORY_PREFIX_MAP[category as keyof typeof PR_CATEGORY_PREFIX_MAP]}${TAG}-${++seq}`;

/** A project inserted directly. regionalCurrency null = a legacy (pre-multi-country) project, i.e. INR, like EE-Q-2025-002. */
async function insertProject(category: string, regionalCurrency: string | null): Promise<string> {
  const row = await prisma.project.create({
    data: {
      poMonth: "2026-11", prCategory: category, prNo: prNoFor(category), client: "CCE Client", department: "Process", domesticForeign: "Foreign",
      projectTitle: `CCE ${category} ${TAG}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active",
      regionId: regionId[category]!, regionalCurrency,
    },
  });
  created.projects.push(row.id);
  return row.id;
}

let empSeq = 0;
async function makeEmployee(label: string, location: string, rate: number): Promise<string> {
  const employeeNo = `${TAG}-${label}-${++empSeq}`;
  await prisma.employee.create({ data: { employeeNo, employeeName: `CCE ${label}`, department: "Process", designation: "Engineer", grade: "MG4", location, manhourExpenses: rate } });
  created.employees.push(employeeNo);
  return employeeNo;
}

let day = 0;
/** Hours arrive exactly as the Keka mail poll stores them (an EmailPoll import), then the one backend write path recomputes the row. */
async function logHours(employeeNo: string, projectId: string, hours: number): Promise<void> {
  day += 1;
  await prisma.timesheetEntry.create({
    data: { employeeNo, projectId, rawProjectCode: `CCE-${TAG}`, workDate: new Date(Date.UTC(2026, 9, (day % 27) + 1)), hours, firstImportId: importId, lastImportId: importId },
  });
  await recomputeProjectResource(employeeNo, projectId);
}

const rowsOf = (projectId: string) => prisma.projectResource.findMany({ where: { projectId }, orderBy: { employeeNo: "asc" } });
const qar = (inr: number, rate: number) => new Prisma.Decimal(inr).div(rate).toDecimalPlaces(2, 4).toFixed(2);
const omr = (inr: number, rate: number) => new Prisma.Decimal(inr).div(rate).toDecimalPlaces(3, 4).toFixed(3);
const countryCard = async (actor: Actor, category: string) =>
  (await call(actor, "/manhour-conversion-rates")).body.data.countries.find((c: { name: string }) => c.name === category);
async function saveRate(actor: Actor, category: string, value: number): Promise<number> {
  const res = await call(actor, `/manhour-conversion-rates/${regionId[category]!}/versions`, { method: "POST", body: { inrPerRegionalUnit: value } });
  assert.equal(res.status, 201, `${category} version saved: ${JSON.stringify(res.body)}`);
  return res.body.data.current.version as number;
}
const dashboard = (actor: Actor, country?: string) => call(actor, "/dashboard/summary", country ? { country } : {});
/** Every stored figure of a set of rows, for "nothing changed" comparisons (updatedAt included: an untouched row is not even rewritten). */
const fingerprint = (rows: Awaited<ReturnType<typeof rowsOf>>) =>
  JSON.stringify(rows.map((r) => [r.employeeNo, r.totalHours, r.manhourCost, r.costingStatus, r.costCurrency, r.fxRateVersion, r.fxRateScope, String(r.fxRateInrPerRegional), String(r.manhourCostRegional), r.updatedAt.toISOString()]));
const hoursFingerprint = async (projectIds: string[]) =>
  JSON.stringify(
    (await prisma.timesheetEntry.findMany({ where: { projectId: { in: projectIds } }, orderBy: { id: "asc" }, select: { id: true, employeeNo: true, projectId: true, hours: true, workDate: true, updatedAt: true } })).map((e) => [
      e.id, e.employeeNo, e.projectId, e.hours, e.workDate.toISOString(), e.updatedAt.toISOString(),
    ])
  );

const u = {} as Record<string, Actor>;
const emp = {} as Record<string, string>;
let legacyEq = ""; // the EE-Q-2025-002 situation: Elixir Qatar, stored currency INR (legacy), four team members
let newEq = ""; // a NEW Elixir Qatar project created through the API: QAR
let omanP = "";
let legacyBefore = "";
let EQ_V1 = 0;

before(async () => {
  for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]) {
    if ((process.env[k] ?? "").trim() !== "") throw new Error(`refusing to run: ${k} is set (run with SMTP_* blank; the local SMTP is a real mailbox)`);
  }
  if (!(process.env["DATABASE_URL"] ?? "").includes("scratch")) throw new Error("scratch database only");
  setMode("off");
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId[r.name] = r.id;
  await purgeCountryRates(Object.values(regionId));
  importId = (await prisma.timesheetImport.create({ data: { triggeredBy: "EmailPoll", totalRows: 0, status: "Succeeded" } })).id;
  u["admin"] = await makeUser("admin", "Administrator", ["Projects", "Add Project", "Dashboard", "Manpower", MODULE], { allCountries: true });
  u["union"] = await makeUser("union", "PMO Manager", ["Projects", "Dashboard"], { categories: ["Oman", "Qatar"] });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

after(async () => {
  try {
    await prisma.authAuditLog.deleteMany({ where: { OR: [{ userId: { in: created.users } }, { email: { startsWith: TAG } }] } });
    await prisma.manhourCostChangeAudit.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.manhourRateChangeRun.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.projectResourceRepriceAudit.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.countryRateApplyRun.deleteMany({ where: { actorUserId: { in: created.users } } });
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

describe("3. dashboard: an enforced single country with no projects shows its own currency", () => {
  test("all seven countries in enforce: an empty country is labelled in its configured currency with zero figures; India (with projects) stays INR", async () => {
    setMode("enforce");
    for (const [category, code] of Object.entries(CODE)) {
      const live = await prisma.project.count({ where: { regionId: regionId[category]!, isDeleted: false } });
      const res = await dashboard(u["admin"]!, code);
      assert.equal(res.status, 200, `${category}: ${JSON.stringify(res.body)}`);
      const d = res.body.data;
      assert.equal(d.kpis.totalProjects, live, `${category}: project count`);
      assert.equal(d.kpiCurrency, CURRENCY[category], `${category}: KPI currency (${live} projects)`);
      assert.deepEqual(d.otherCurrencies, [], `${category}: nothing else listed`);
      if (live === 0) {
        for (const k of ["totalWOValue", "totalInvoiceRaised", "totalPaymentReceived", "totalActualProjectCost"]) assert.equal(d.kpis[k], 0, `${category}: ${k} is 0`);
      }
    }
  });

  test("unchanged: All Countries, a several-country union, an unheld country (403), shadow and off", async () => {
    setMode("enforce");
    const all = (await dashboard(u["admin"]!, "ALL")).body.data;
    assert.equal(all.kpiCurrency, "INR", "All Countries keeps the INR headline (INR projects exist)");
    const union = await dashboard(u["union"]!); // Oman + Qatar, no selection: the union, both empty
    assert.equal(union.status, 200);
    assert.equal(union.body.data.kpis.totalProjects, 0);
    assert.equal(union.body.data.kpiCurrency, "INR", "a several-country union is not one country: unchanged (INR label)");
    assert.equal((await dashboard(u["union"]!, "malaysia")).status, 403, "an unheld country is still refused");
    for (const mode of ["shadow", "off"] as const) {
      setMode(mode);
      const d = (await dashboard(u["admin"]!, "qatar")).body.data;
      assert.equal(d.kpiCurrency, "INR", `${mode}: no filtering, so no country currency is assumed (as before)`);
      assert.ok(d.kpis.totalProjects > 0, `${mode}: the selection does not filter`);
    }
    setMode("off");
  });
});

describe("1 + 2. setup: a legacy INR Elixir Qatar project with four team members, then a QAR rate", () => {
  test("the legacy project (stored currency INR) is costed in INR only: four rows, no conversion", async () => {
    legacyEq = await insertProject("Elixir Qatar", null);
    emp["chennai"] = await makeEmployee("chennai", "Chennai", 600);
    emp["doha"] = await makeEmployee("doha", "Doha", 800);
    emp["muscat"] = await makeEmployee("muscat", "Muscat", 500);
    emp["kl"] = await makeEmployee("kl", "Kuala Lumpur", 700);
    await logHours(emp["chennai"]!, legacyEq, 10);
    await logHours(emp["doha"]!, legacyEq, 5);
    await logHours(emp["muscat"]!, legacyEq, 4);
    await logHours(emp["kl"]!, legacyEq, 2);
    const rows = await rowsOf(legacyEq);
    assert.equal(rows.length, 4);
    for (const r of rows) {
      assert.equal(r.costingStatus, "INR");
      assert.equal(r.manhourCostRegional, null);
    }
    assert.deepEqual(rows.map((r) => r.manhourCost).sort((a, b) => a - b), [1400, 2000, 4000, 6000], "INR = hours x INR grade rate");
  });

  test("saving the Elixir Qatar QAR rate (1 QAR = 20 INR) does not touch the legacy project", async () => {
    const before = fingerprint(await rowsOf(legacyEq));
    EQ_V1 = await saveRate(u["admin"]!, "Elixir Qatar", 20);
    await saveRate(u["admin"]!, "Oman", 250);
    legacyBefore = fingerprint(await rowsOf(legacyEq));
    assert.equal(legacyBefore, before);
  });

  test("2. counters: the legacy project and its four team members are NOT counted for Elixir Qatar; the preview is empty", async () => {
    const card = await countryCard(u["admin"]!, "Elixir Qatar");
    assert.equal(card.currency, "QAR");
    assert.equal(card.projects, 0, "no QAR project yet");
    assert.equal(card.otherCurrencyProjects, 1, "the legacy INR project is reported separately");
    assert.deepEqual(card.rows, { total: 0, onLatest: 0, behind: 0, missing: 0 }, "its four rows are not 'to apply'");
    const pre = (await call(u["admin"]!, `/manhour-conversion-rates/${regionId["Elixir Qatar"]!}/apply-preview`)).body.data;
    assert.equal(pre.totals.projects, 0);
    assert.equal(pre.totals.rows, 0);
  });
});

describe("1. a NEW Elixir Qatar project is QAR and its team is costed with the QAR rate", () => {
  test("created through the API it takes the country's currency QAR", async () => {
    const prNo = prNoFor("Elixir Qatar");
    const res = await call(u["admin"]!, "/projects", {
      method: "POST",
      body: {
        poMonth: "2026-11", prCategory: "Elixir Qatar", prNo, client: "CCE Client", department: "Process", domesticForeign: "Foreign", projectTitle: `CCE new QAR ${TAG}`,
        workOrderStatus: "Received", projectStartDate: new Date("2026-01-01").toISOString(), projectStatus: "Active", workOrderNumber: `${prNo}-WO`,
        workOrderDate: new Date("2026-01-01").toISOString(), rfqNo: "RFQ-CCE", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "PMO",
      },
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    newEq = res.body.data.id;
    created.projects.push(newEq);
    const p = await prisma.project.findUniqueOrThrow({ where: { id: newEq } });
    assert.equal(p.regionId, regionId["Elixir Qatar"]);
    assert.equal(p.regionalCurrency, "QAR");
  });

  test("a team from different locations is costed in the PROJECT's currency with the Elixir Qatar rate; employee rates stay INR", async () => {
    await logHours(emp["chennai"]!, newEq, 10); // 6000 INR
    await logHours(emp["doha"]!, newEq, 5); // 4000 INR
    await logHours(emp["muscat"]!, newEq, 4); // 2000 INR
    const rows = await rowsOf(newEq);
    assert.equal(rows.length, 3);
    for (const r of rows) {
      assert.equal(r.costingStatus, "CONVERTED", r.employeeNo);
      assert.equal(r.costCurrency, "QAR", `${r.employeeNo}: the project's currency, whatever the employee's location`);
      assert.equal(r.fxRateScope, "COUNTRY");
      assert.equal(r.fxRateVersion, EQ_V1);
      assert.equal(r.manhourCostRegional!.toFixed(2), qar(r.manhourCost, 20), `${r.employeeNo}: INR / 20`);
    }
    assert.deepEqual(rows.map((r) => r.manhourCostRegional!.toFixed(2)).sort(), ["100.00", "200.00", "300.00"]);
    for (const no of [emp["chennai"]!, emp["doha"]!, emp["muscat"]!]) {
      const e = await prisma.employee.findUniqueOrThrow({ where: { employeeNo: no } });
      assert.ok([600, 800, 500].includes(e.manhourExpenses), "the employee grade rate is still the INR figure");
    }
  });

  test("the same employee on an Oman project is costed with Oman's rate there and Elixir Qatar's here", async () => {
    omanP = await insertProject("Oman", "OMR");
    await logHours(emp["chennai"]!, omanP, 10); // 6000 INR
    const oman = (await rowsOf(omanP))[0]!;
    const eq = (await rowsOf(newEq)).find((r) => r.employeeNo === emp["chennai"])!;
    assert.equal(oman.costCurrency, "OMR");
    assert.equal(oman.manhourCostRegional!.toFixed(3), omr(6000, 250), "6000 / 250 = 24.000 OMR");
    assert.equal(eq.costCurrency, "QAR");
    assert.equal(eq.manhourCostRegional!.toFixed(2), qar(6000, 20), "6000 / 20 = 300.00 QAR");
  });

  test("2. counters now count exactly the QAR project and its three rows (all on the latest version); the legacy project still apart", async () => {
    const card = await countryCard(u["admin"]!, "Elixir Qatar");
    assert.equal(card.projects, 1);
    assert.equal(card.otherCurrencyProjects, 1);
    assert.deepEqual(card.rows, { total: 3, onLatest: 3, behind: 0, missing: 0 });
    const oman = await countryCard(u["admin"]!, "Oman");
    assert.equal(oman.projects, 1);
    assert.equal(oman.otherCurrencyProjects, 0);
  });

  test("profitability inputs agree: stored rows = costing endpoint = project API = resources API, in QAR", async () => {
    const rows = await rowsOf(newEq);
    const regional = Math.round(rows.reduce((s, r) => s + Number(r.manhourCostRegional), 0) * 1000) / 1000;
    assert.equal(regional, 600);
    const costing = (await call(u["admin"]!, `/projects/${newEq}/manhour-costing`)).body.data;
    assert.equal(costing.totals.costInProjectCurrency, regional);
    assert.equal(costing.totals.costInr, 12000);
    const project = (await call(u["admin"]!, `/projects/${newEq}`)).body.data;
    assert.equal(project.manhourCostRegional, regional);
    const resources = (await call(u["admin"]!, `/projects/${newEq}/resources`)).body.data;
    const items: { costingStatus: string; manhourCostRegional: number }[] = Array.isArray(resources) ? resources : resources.items;
    assert.equal(items.length, 3);
    assert.equal(Math.round(items.reduce((s, r) => s + (r.costingStatus === "CONVERTED" ? r.manhourCostRegional : 0), 0) * 1000) / 1000, regional, "what Reports and profit add up");
  });
});

describe("2. a new rate version: preview and apply touch only the eligible QAR project, once", () => {
  test("after 1 QAR = 25 INR the counters show 3 to apply (not 7); the preview lists only the QAR project", async () => {
    const hoursBefore = await hoursFingerprint([legacyEq, newEq, omanP]);
    const v2 = await saveRate(u["admin"]!, "Elixir Qatar", 25);
    const card = await countryCard(u["admin"]!, "Elixir Qatar");
    assert.equal(card.projects, 1);
    assert.equal(card.rows.behind + card.rows.missing, 3, "only the QAR project's three rows; the legacy project's four are not counted");
    const pre = (await call(u["admin"]!, `/manhour-conversion-rates/${regionId["Elixir Qatar"]!}/apply-preview`)).body.data;
    assert.deepEqual(pre.projects.map((p: { projectId: string }) => p.projectId), [newEq]);
    assert.equal(pre.totals.rows, 3);

    const applied = await call(u["admin"]!, `/manhour-conversion-rates/${regionId["Elixir Qatar"]!}/apply`, { method: "POST", body: { expectedVersion: v2 } });
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    const rows = await rowsOf(newEq);
    for (const r of rows) {
      assert.equal(r.fxRateVersion, v2);
      assert.equal(r.manhourCostRegional!.toFixed(2), qar(r.manhourCost, 25), `${r.employeeNo}: INR / 25, from the INR base (no double conversion)`);
    }
    assert.deepEqual(rows.map((r) => r.manhourCost).sort((a, b) => a - b), [2000, 4000, 6000], "the INR base is unchanged");
    const after = await countryCard(u["admin"]!, "Elixir Qatar");
    assert.equal(after.rows.behind + after.rows.missing, 0, "nothing left to apply");
    assert.equal(after.otherCurrencyProjects, 1);

    // Applying the same version again converts nothing.
    const fp = fingerprint(rows);
    const again = await call(u["admin"]!, `/manhour-conversion-rates/${regionId["Elixir Qatar"]!}/apply`, { method: "POST", body: { expectedVersion: v2 } });
    assert.equal(again.status, 200);
    assert.equal(fingerprint(await rowsOf(newEq)), fp, "no double conversion");

    // The legacy project, the Oman project and every Keka hour are untouched.
    assert.equal(fingerprint(await rowsOf(legacyEq)), legacyBefore, "the legacy INR project: every stored figure identical, not even rewritten");
    assert.equal(await prisma.projectResourceRepriceAudit.count({ where: { projectId: legacyEq } }), 0, "no apply audit for the legacy project");
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: legacyEq } })).regionalCurrency, null, "its currency is still legacy INR");
    assert.equal((await rowsOf(omanP))[0]!.manhourCostRegional!.toFixed(3), omr(6000, 250), "Oman keeps its own rate");
    assert.equal(await hoursFingerprint([legacyEq, newEq, omanP]), hoursBefore, "timesheet hours unchanged");
  });
});

describe("3 + 1. dashboard with projects: project-derived currency preserved, currencies never combined", () => {
  test("Elixir Qatar with the legacy INR project and the QAR project: INR headline (legacy), QAR listed apart with its own man-hour cost", async () => {
    setMode("enforce");
    const d = (await dashboard(u["admin"]!, "elixir-qatar")).body.data;
    assert.equal(d.kpis.totalProjects, 2);
    assert.equal(d.kpiCurrency, "INR", "the legacy project's stored INR currency keeps the headline");
    assert.equal(d.kpis.totalActualProjectCost, 13400, "INR headline = the legacy project's INR man-hour cost only");
    const q = d.otherCurrencies.find((c: { currency: string }) => c.currency === "QAR");
    assert.ok(q, "QAR is listed separately");
    assert.equal(q.totalActualProjectCost, 480, "QAR = 12000 / 25, never added to the INR figure");
    setMode("off");
  });

  test("Oman shows OMR from its project; an empty country still shows its own currency", async () => {
    setMode("enforce");
    const oman = (await dashboard(u["admin"]!, "oman")).body.data;
    assert.equal(oman.kpiCurrency, "OMR");
    assert.equal(oman.kpis.totalActualProjectCost, 24);
    const qatar = (await dashboard(u["admin"]!, "qatar")).body.data;
    assert.equal(qatar.kpis.totalProjects, 0);
    assert.equal(qatar.kpiCurrency, "QAR");
    const all = (await dashboard(u["admin"]!, "ALL")).body.data;
    assert.equal(all.kpiCurrency, "INR");
    assert.deepEqual(all.otherCurrencies.map((c: { currency: string }) => c.currency).sort(), ["OMR", "QAR"], "All Countries: each currency apart");
    setMode("off");
  });
});
