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

/**
 * Phase 4 / Option A safeguard for Excel employee import: a BLANK or missing hourly rate is "no rate provided" - it never overwrites the employee's saved
 * rate and never starts a recalculation - while an explicit rate (including an explicit 0, per the existing validation) is applied as before.
 * Rates here are TEST FIXTURES.
 */

const TAG = `imp-${Date.now()}`;
const PASSWORD = "ImportRate@12345";

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[], employees: [] as string[] };
let importId = "";
let projectId = "";
let admin = { token: "" };

async function listen(): Promise<void> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

async function importRows(rows: unknown[]): Promise<{ status: number; body: any }> {
  const res = await fetch(`${url}/employees/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({ employees: rows }),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const baseRow = (employeeNo: string, extra: Record<string, unknown> = {}) => ({
  employeeNo, employeeName: `IMP ${employeeNo}`, designation: "Engineer", department: "Process", location: "Chennai", reportingManager: "", grade: "MG4", status: "Active", ...extra,
});

let seq = 0;
async function makeEmployee(label: string, rate: number): Promise<string> {
  const employeeNo = `${TAG}-${label}-${++seq}`;
  await prisma.employee.create({
    data: { employeeNo, employeeName: `IMP ${label}`, department: "Process", designation: "Engineer", grade: "MG4", location: "Chennai", manhourExpenses: rate },
  });
  created.employees.push(employeeNo);
  // 10 hours on the India project => cost = 10 x rate (INR base, no conversion).
  await prisma.timesheetEntry.create({
    data: { employeeNo, projectId, rawProjectCode: `IMP-${TAG}`, workDate: new Date(Date.UTC(2026, 8, 5)), hours: 10, firstImportId: importId, lastImportId: importId },
  });
  await recomputeProjectResource(employeeNo, projectId);
  return employeeNo;
}

const employeeOf = (employeeNo: string) => prisma.employee.findUniqueOrThrow({ where: { employeeNo } });
const rowOf = (employeeNo: string) => prisma.projectResource.findUniqueOrThrow({ where: { projectId_employeeNo: { projectId, employeeNo } } });
const runsOf = (employeeNo: string) => prisma.manhourRateChangeRun.count({ where: { employeeNo } });

before(async () => {
  process.env["COUNTRY_ACCESS_MODE"] = "off";
  importId = (await prisma.timesheetImport.create({ data: { triggeredBy: "ManualUpload", totalRows: 0, status: "Succeeded" } })).id;
  const india = await prisma.region.findFirstOrThrow({ where: { name: "India" } });
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-11", prCategory: "India", prNo: `${PR_CATEGORY_PREFIX_MAP["India" as keyof typeof PR_CATEGORY_PREFIX_MAP]}${TAG}`, client: "IMP Client", department: "Process",
      domesticForeign: "Domestic", projectTitle: `IMP ${TAG}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active",
      regionId: india.id, regionalCurrency: india.defaultCurrency,
    },
  });
  projectId = project.id;
  created.projects.push(project.id);
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } });
  const mods = await prisma.module.findMany({ where: { name: { in: ["Manpower", "Projects"] } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: "IMP admin", email: `${TAG}@example.com`, passwordHash: await hashPassword(PASSWORD), department: "PMO", roleId: role.id, forcePasswordChange: false,
      allCountriesAccess: true, moduleAccess: { create: mods.map((m) => ({ moduleId: m.id })) },
    },
  });
  created.users.push(user.id);
  admin = { token: signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: "Administrator" }) };
  await listen();
});

after(async () => {
  try {
    await prisma.manhourCostChangeAudit.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.manhourRateChangeRun.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.projectResourceRepriceAudit.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.timesheetEntry.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.timesheetImport.deleteMany({ where: { id: importId } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.employee.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    await closeServer();
  }
});

describe("blank / missing rate on an EXISTING employee", () => {
  for (const [label, rateFields] of [
    ["rate cell blank (null)", { manhourExpenses: null }],
    ["rate cell blank (empty string)", { manhourExpenses: "" }],
    ["rate cell blank (spaces)", { manhourExpenses: "   " }],
    ["rate column missing from the file (key absent)", {}],
    ["rate cell unreadable text", { rateIssue: "UNREADABLE" }],
  ] as const) {
    test(`${label}: saved rate kept, row cost untouched, no recalculation, other fields still updated, skip reported`, async () => {
      const employeeNo = await makeEmployee("blank", 1000);
      const before = await rowOf(employeeNo);
      const runsBefore = await runsOf(employeeNo);
      const res = await importRows([baseRow(employeeNo, { ...rateFields, designation: "Lead Engineer", location: "Muscat" })]);
      assert.equal(res.status, 201);
      assert.equal(res.body.data.updated, 1);
      assert.equal(res.body.data.invalid, 0);
      assert.deepEqual(res.body.data.ratesSkipped, [{ employeeNo, reason: label.includes("unreadable") ? "UNREADABLE" : "NOT_PROVIDED", outcome: "EXISTING_RATE_KEPT" }]);
      assert.equal(res.body.data.costingRefresh, undefined, "no recalculation was triggered");
      const employee = await employeeOf(employeeNo);
      assert.equal(employee.manhourExpenses, 1000, "saved rate not overwritten, and not turned into 0");
      assert.equal(employee.designation, "Lead Engineer", "unrelated fields are still imported");
      assert.equal(employee.location, "Muscat");
      assert.equal(await runsOf(employeeNo), runsBefore, "no run recorded");
      const after = await rowOf(employeeNo);
      assert.equal(after.manhourCost, 10000);
      assert.equal(after.hourlyRateSnapshot, before.hourlyRateSnapshot);
      assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime(), "the project row was not rewritten");
    });
  }
});

describe("explicit rates on an existing employee", () => {
  test("a valid CHANGED rate (as a number or as text with currency symbols) is applied and recalculates the employee's projects (run EXCEL_IMPORT)", async () => {
    const employeeNo = await makeEmployee("changed", 1000);
    const res = await importRows([baseRow(employeeNo, { manhourExpenses: 1500 })]);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.ratesSkipped, undefined);
    assert.deepEqual(res.body.data.costingRefresh, { runs: 1, incompleteRuns: 0 });
    assert.equal((await employeeOf(employeeNo)).manhourExpenses, 1500);
    assert.equal((await rowOf(employeeNo)).manhourCost, 15000);
    const run = await prisma.manhourRateChangeRun.findFirstOrThrow({ where: { employeeNo } });
    assert.equal(run.source, "EXCEL_IMPORT");
    assert.equal(run.status, "SUCCEEDED");

    const second = await importRows([baseRow(employeeNo, { manhourExpenses: "1200" })]);
    assert.equal(second.status, 201);
    assert.equal((await rowOf(employeeNo)).manhourCost, 12000, "a decrease recalculates too (Option A)");
  });

  test("an UNCHANGED rate records no run and does not rewrite the project row", async () => {
    const employeeNo = await makeEmployee("same", 1000);
    const before = await rowOf(employeeNo);
    const res = await importRows([baseRow(employeeNo, { manhourExpenses: 1000 })]);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.costingRefresh, undefined);
    assert.equal(res.body.data.ratesSkipped, undefined);
    assert.equal(await runsOf(employeeNo), 0);
    assert.equal((await rowOf(employeeNo)).updatedAt.getTime(), before.updatedAt.getTime());
  });

  test("an EXPLICIT 0 is still accepted (existing validation min 0): it is a real change, recalculates the employee's cost to 0, and is NOT reported as skipped", async () => {
    const employeeNo = await makeEmployee("zero", 1000);
    const res = await importRows([baseRow(employeeNo, { manhourExpenses: 0 })]);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.ratesSkipped, undefined, "a typed 0 is not a blank");
    assert.deepEqual(res.body.data.costingRefresh, { runs: 1, incompleteRuns: 0 });
    assert.equal((await employeeOf(employeeNo)).manhourExpenses, 0);
    assert.equal((await rowOf(employeeNo)).manhourCost, 0);
  });

  test("a negative rate is still rejected by the existing validation (nothing imported)", async () => {
    const employeeNo = await makeEmployee("neg", 1000);
    const res = await importRows([baseRow(employeeNo, { manhourExpenses: -5 })]);
    assert.equal(res.status, 400);
    assert.equal((await employeeOf(employeeNo)).manhourExpenses, 1000);
  });
});

describe("blank rate on a NEW employee", () => {
  test("created with the default rate 0 (nothing to keep), reported as CREATED_WITH_DEFAULT_0, and no recalculation run", async () => {
    const employeeNo = `${TAG}-new-blank`;
    created.employees.push(employeeNo);
    const res = await importRows([baseRow(employeeNo, { manhourExpenses: null })]);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.added, 1);
    assert.deepEqual(res.body.data.ratesSkipped, [{ employeeNo, reason: "NOT_PROVIDED", outcome: "CREATED_WITH_DEFAULT_0" }]);
    assert.equal((await employeeOf(employeeNo)).manhourExpenses, 0);
    assert.equal(await runsOf(employeeNo), 0);
  });

  test("a new employee with an explicit rate is created at that rate and not reported", async () => {
    const employeeNo = `${TAG}-new-rate`;
    created.employees.push(employeeNo);
    const res = await importRows([baseRow(employeeNo, { manhourExpenses: 777 })]);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.ratesSkipped, undefined);
    assert.equal((await employeeOf(employeeNo)).manhourExpenses, 777);
  });
});

describe("a mixed file", () => {
  test("only the blank row keeps its rate; the changed row recalculates; the report lists exactly the blank row", async () => {
    const blankNo = await makeEmployee("mix-blank", 1000);
    const changedNo = await makeEmployee("mix-changed", 1000);
    const res = await importRows([baseRow(blankNo, { manhourExpenses: null }), baseRow(changedNo, { manhourExpenses: 2000 })]);
    assert.equal(res.status, 201);
    assert.deepEqual(res.body.data.ratesSkipped, [{ employeeNo: blankNo, reason: "NOT_PROVIDED", outcome: "EXISTING_RATE_KEPT" }]);
    assert.deepEqual(res.body.data.costingRefresh, { runs: 1, incompleteRuns: 0 });
    assert.equal((await employeeOf(blankNo)).manhourExpenses, 1000);
    assert.equal((await rowOf(blankNo)).manhourCost, 10000);
    assert.equal((await employeeOf(changedNo)).manhourExpenses, 2000);
    assert.equal((await rowOf(changedNo)).manhourCost, 20000);
  });
});
