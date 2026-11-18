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
 * Review of the existing ("legacy") converted records before any country rate moves them. Records converted with an older PROJECT-level rate must never be silently
 * reinterpreted, a conflict between those rates must never be resolved by picking one, and the review itself must write nothing. The rates here are SYNTHETIC test fixtures
 * (22 and 22.5 mirror the conflict found in the QA data); they are never business rates.
 */

const TAG = `lr-${Date.now()}`;
const MODULE = "Manpower Conversion Rates";

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[], employees: [] as string[] };
const regionId = {} as Record<string, string>;
const P = {} as Record<string, string>;
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

async function makeUser(label: string, roleName: string, modules: string[], opts: { allCountries?: boolean; categories?: string[] } = {}): Promise<string> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const mods = await prisma.module.findMany({ where: { name: { in: modules } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `LR ${label}`, email: `${TAG}-${label}@example.com`, passwordHash: await hashPassword("LegacyReview@123"), department: "PMO", roleId: role.id,
      forcePasswordChange: false, allCountriesAccess: opts.allCountries === true, moduleAccess: { create: mods.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: (opts.categories ?? []).map((c) => ({ regionId: regionId[c]! })) },
    },
  });
  created.users.push(user.id);
  return signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName });
}

async function call(token: string | null, path: string, opts: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${url}${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let seq = 0;
async function insertProject(category: string, label: string): Promise<string> {
  const region = await prisma.region.findUniqueOrThrow({ where: { id: regionId[category]! } });
  const row = await prisma.project.create({
    data: {
      poMonth: "2026-11", prCategory: category, prNo: `${PR_CATEGORY_PREFIX_MAP[category as keyof typeof PR_CATEGORY_PREFIX_MAP]}${TAG}-${label}-${++seq}`, client: "LR Client",
      department: "Process", domesticForeign: "Domestic", projectTitle: `LR ${label}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"),
      projectStatus: "Active", regionId: regionId[category]!, regionalCurrency: region.defaultCurrency,
    },
  });
  created.projects.push(row.id);
  return row.id;
}

async function row(projectId: string, employeeNo: string, hours = 10, rate = 1000): Promise<void> {
  await prisma.timesheetEntry.create({
    data: { employeeNo, projectId, rawProjectCode: `LR-${TAG}`, workDate: new Date(Date.UTC(2026, 8, 5)), hours, firstImportId: importId, lastImportId: importId },
  });
  await recomputeProjectResource(employeeNo, projectId);
  void rate;
}

/** Emulates a record converted before central country rates existed: converted with a PROJECT-level rate and version (scope NULL). */
async function makeLegacy(projectId: string, employeeNo: string, rate: number, version: number, currency: string): Promise<void> {
  const r = await prisma.projectResource.findUniqueOrThrow({ where: { projectId_employeeNo: { projectId, employeeNo } } });
  await prisma.projectResource.update({
    where: { id: r.id },
    data: {
      costingStatus: "CONVERTED", costCurrency: currency, fxRateVersion: version, fxRateInrPerRegional: rate, fxRateScope: null,
      manhourCostRegional: new Prisma.Decimal(r.manhourCost).div(rate).toDecimalPlaces(currency === "OMR" ? 3 : 2),
    },
  });
}

const reviewOf = (token: string, category: string) => call(token, `/manhour-conversion-rates/${regionId[category]!}/legacy-review`);
const byPr = (data: any, projectId: string) => (data.projects as any[]).find((p) => p.projectId === projectId);

let admin = "";
let viewer = "";
let noModule = "";
let omanOnly = "";
let employeeNo = "";

before(async () => {
  setMode("off");
  importId = (await prisma.timesheetImport.create({ data: { triggeredBy: "ManualUpload", totalRows: 0, status: "Succeeded" } })).id;
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId[r.name] = r.id;
  await purgeCountryRates(Object.values(regionId));
  admin = await makeUser("admin", "Administrator", ["Projects", MODULE], { allCountries: true });
  viewer = await makeUser("viewer", "Project Manager", ["Projects", MODULE], { allCountries: true });
  noModule = await makeUser("nomodule", "Administrator", ["Projects"], { allCountries: true });
  omanOnly = await makeUser("oman", "PMO Manager", ["Projects", MODULE], { categories: ["Oman"] });
  await listen();
  employeeNo = `${TAG}-e1`;
  await prisma.employee.create({ data: { employeeNo, employeeName: "LR e1", department: "Process", designation: "Engineer", grade: "MG4", location: "Chennai", manhourExpenses: 1000 } });
  created.employees.push(employeeNo);

  // Abu Dhabi: two projects converted with DIFFERENT legacy project rates (22 and 22.5: the QA conflict), one with no rate applied, and (later) one on the country rate.
  P["a1"] = await insertProject("Abu Dhabi", "a1");
  P["a2"] = await insertProject("Abu Dhabi", "a2");
  P["a3"] = await insertProject("Abu Dhabi", "a3");
  for (const key of ["a1", "a2", "a3"]) await row(P[key]!, employeeNo);
  await makeLegacy(P["a1"]!, employeeNo, 22, 1, "AED");
  await makeLegacy(P["a2"]!, employeeNo, 22.5, 1, "AED");
  // Oman: one legacy rate only, no conflict.
  P["o1"] = await insertProject("Oman", "o1");
  await row(P["o1"]!, employeeNo);
  await makeLegacy(P["o1"]!, employeeNo, 243.156, 2, "OMR");
  // India: never part of a review.
  P["i1"] = await insertProject("India", "i1");
  await row(P["i1"]!, employeeNo);
});

after(async () => {
  try {
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

describe("before any approved country rate: nothing is assumed", () => {
  test("a conflict between legacy project rates (22 vs 22.5) is reported and both projects need review; no rate is chosen and nothing is proposed", async () => {
    const res = await reviewOf(admin, "Abu Dhabi");
    assert.equal(res.status, 200);
    const data = res.body.data;
    assert.equal(data.approved, null);
    assert.equal(data.conflict, true);
    assert.deepEqual(data.legacyRates.map((r: { inrPerRegionalUnit: string }) => Number(r.inrPerRegionalUnit)), [22, 22.5]);
    assert.match(data.conflictReason, /22 and 22\.5/);
    assert.match(data.conflictReason, /none is assumed/);
    for (const key of ["a1", "a2"]) {
      const p = byPr(data, P[key]!);
      assert.equal(p.classification, "NEEDS_REVIEW", key);
      assert.equal(p.previousScope, "PROJECT");
      assert.equal(p.proposedRegional, null, "no proposal without an approved rate");
      assert.equal(p.approvedRate, null);
    }
    assert.equal(Number(byPr(data, P["a1"]!).previousRate), 22);
    assert.equal(Number(byPr(data, P["a2"]!).previousRate), 22.5);
    const missing = byPr(data, P["a3"]!);
    assert.equal(missing.classification, "MISSING_RATE");
    assert.match(missing.reason, /no approved rate yet/);
    assert.equal(missing.previousRate, null);
    assert.equal(data.totals.NEEDS_REVIEW, 2);
    assert.equal(data.totals.MISSING_RATE, 1);
    assert.equal(data.totals.projects, 3);
  });

  test("a country whose legacy records agree still needs review while it has no approved rate (nothing to compare with), and says so", async () => {
    const data = (await reviewOf(admin, "Oman")).body.data;
    assert.equal(data.conflict, false);
    const p = byPr(data, P["o1"]!);
    assert.equal(p.classification, "NEEDS_REVIEW");
    assert.match(p.reason, /no approved rate yet/);
    assert.equal(Number(p.previousRate), 243.156);
    assert.equal(p.previousVersion, 2);
  });

  test("the review is read-only: no rate created, no run, no record rewritten", async () => {
    const before = await prisma.projectResource.findMany({ where: { projectId: { in: [P["a1"]!, P["a2"]!, P["a3"]!, P["o1"]!] } }, orderBy: { id: "asc" } });
    await reviewOf(admin, "Abu Dhabi");
    await reviewOf(admin, "Oman");
    assert.equal(await prisma.countryManhourFxRate.count({ where: { regionId: { in: [regionId["Abu Dhabi"]!, regionId["Oman"]!] } } }), 0);
    assert.equal(await prisma.countryRateApplyRun.count({ where: { actorUserId: { in: created.users } } }), 0);
    const after = await prisma.projectResource.findMany({ where: { projectId: { in: [P["a1"]!, P["a2"]!, P["a3"]!, P["o1"]!] } }, orderBy: { id: "asc" } });
    assert.deepEqual(after.map((r) => r.updatedAt.getTime()), before.map((r) => r.updatedAt.getTime()));
    assert.deepEqual(after.map((r) => r.manhourCostRegional?.toString() ?? null), before.map((r) => r.manhourCostRegional?.toString() ?? null));
  });
});

describe("who may review", () => {
  test("the Manpower Conversion Rates grant is needed (an Administrator without it is refused); a non-manager role with it can read; India has no review", async () => {
    assert.equal((await reviewOf(noModule, "Abu Dhabi")).status, 403, "no role bypass");
    assert.equal((await call(null, `/manhour-conversion-rates/${regionId["Abu Dhabi"]!}/legacy-review`)).status, 401);
    assert.equal((await reviewOf(viewer, "Abu Dhabi")).status, 200, "reading needs only the grant");
    assert.equal((await reviewOf(admin, "India")).status, 409, "India is fixed at 1: nothing to review");
    assert.equal((await call(admin, "/manhour-conversion-rates/00000000-0000-4000-8000-000000000000/legacy-review")).status, 404);
  });

  test("country access applies: an Oman-only user cannot review Abu Dhabi", async () => {
    setMode("enforce");
    try {
      assert.equal((await reviewOf(omanOnly, "Abu Dhabi")).status, 403);
      assert.equal((await reviewOf(omanOnly, "Oman")).status, 200);
    } finally {
      setMode("off");
    }
  });
});

describe("after a person approves a country rate (synthetic fixture 25): the review shows what would change, and apply moves it through the audited workflow", () => {
  test("legacy records read as 'older project-level rate', with previous and proposed regional cost, and the conflict stays visible as history", async () => {
    const created1 = await call(admin, `/manhour-conversion-rates/${regionId["Abu Dhabi"]!}/versions`, { method: "POST", body: { inrPerRegionalUnit: 25, note: "synthetic fixture" } });
    assert.equal(created1.status, 201);
    const data = (await reviewOf(admin, "Abu Dhabi")).body.data;
    assert.equal(data.approved.version, 1);
    assert.equal(Number(data.approved.inrPerRegionalUnit), 25);
    assert.equal(data.conflict, true, "the legacy rates still disagree; that is history, not an instruction");
    const a1 = byPr(data, P["a1"]!);
    assert.equal(a1.classification, "LEGACY_PROJECT_RATE");
    assert.match(a1.reason, /older project-level rate \(22\)/);
    assert.equal(Number(a1.previousRegional), Number((10_000 / 22).toFixed(2)));
    assert.equal(Number(a1.proposedRegional), 400, "10,000 INR at the approved 25");
    assert.equal(a1.approvedVersion, 1);
    assert.equal(a1.manhourCostInr, 10_000);
    assert.equal(a1.records.legacyProjectRate, 1);
    const a3 = byPr(data, P["a3"]!);
    assert.equal(a3.classification, "MISSING_RATE");
    assert.equal(Number(a3.proposedRegional), 400);
    assert.equal(data.projects[0].classification !== "CONSISTENT", true, "the worst come first");
  });

  test("apply (the existing authorised review-and-apply) moves every record, audits old and new, and the review then reads consistent; the legacy table is untouched", async () => {
    const legacyBefore = await prisma.projectManhourFxRate.count({ where: { projectId: { in: created.projects } } });
    const res = await call(admin, `/manhour-conversion-rates/${regionId["Abu Dhabi"]!}/apply`, { method: "POST", body: { expectedVersion: 1, reason: "reviewed legacy records" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, "SUCCEEDED");
    const data = (await reviewOf(admin, "Abu Dhabi")).body.data;
    for (const key of ["a1", "a2", "a3"]) {
      const p = byPr(data, P[key]!);
      assert.equal(p.classification, "CONSISTENT", key);
      assert.equal(Number(p.previousRate), 25);
      assert.equal(p.previousScope, "COUNTRY");
    }
    assert.equal(data.totals.CONSISTENT, 3);
    const audit = await prisma.projectResourceRepriceAudit.findFirstOrThrow({ where: { projectId: P["a1"]! } });
    assert.equal(Number(audit.oldFxRateInrPerRegional), 22, "the previous project-level rate is preserved in the audit");
    assert.equal(audit.oldFxRateScope, null);
    assert.equal(audit.newFxRateScope, "COUNTRY");
    assert.equal(audit.manhourCostInr, 10_000, "the INR base is unchanged");
    assert.equal((await prisma.projectResource.findUniqueOrThrow({ where: { projectId_employeeNo: { projectId: P["a1"]!, employeeNo } } })).manhourCost, 10_000);
    assert.equal(await prisma.projectManhourFxRate.count({ where: { projectId: { in: created.projects } } }), legacyBefore, "legacy rate history is neither written nor deleted");
  });

  test("India stays out of it: its record was never touched and no India project appears in any review", async () => {
    const r = await prisma.projectResource.findUniqueOrThrow({ where: { projectId_employeeNo: { projectId: P["i1"]!, employeeNo } } });
    assert.equal(r.costingStatus, "INR");
    assert.equal(r.manhourCostRegional, null);
    assert.equal(r.fxRateScope, null);
    assert.equal(await prisma.projectResourceRepriceAudit.count({ where: { projectId: P["i1"]! } }), 0);
  });
});
