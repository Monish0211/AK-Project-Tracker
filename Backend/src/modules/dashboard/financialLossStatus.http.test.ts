import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";

/**
 * Financial Loss Projects (Nov 2026): a project is listed only while it is ACTIVE / IN PROGRESS (the centralized isActiveProjectStatus()) AND its actual
 * hours exceed its approved budget hours. Completed, On Hold, Cancelled (and Not Started / Archived) are never listed, however large their overrun; a saved
 * status change moves a project out of or back into the list. The list is the one the page, its search / sorting / paging and its Export List all use
 * (GET /dashboard/summary hoursOverrun.allMatching), and the Dashboard tile's total and top 5 come from the same calculation. The hours, manager and
 * percentage figures are unchanged.
 */

const TAG = `flstat-${Date.now()}`;
const OFFSET = 1_000_000; // our overruns dominate any real project, so the global top 5 can only be ours
let url = "";
let closeApp: () => Promise<void> = async () => undefined;
let token = "";
const created = { users: [] as string[], projects: [] as string[], imports: [] as string[] };
const ids = new Map<string, string>();
let importId = "";

interface Row { id: string; prNumber: string; projectManager: string | null; budgetHours: number; actualHours: number; hoursOverrun: number; percentOverrun: number }
interface Summary { hoursOverrun: { totalMatchingProjects: number; top5: Row[]; allMatching: Row[] } }

const api = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(`${url}${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message ?? "" };
};
const summary = async (): Promise<Summary> => {
  const r = await api("GET", "/dashboard/summary");
  assert.equal(r.status, 200, r.message);
  return r.data as Summary;
};
/** The fixtures currently listed, by their short names. */
const listed = async () => {
  const s = await summary();
  return s.hoursOverrun.allMatching.filter((p) => p.prNumber.startsWith(TAG)).map((p) => p.prNumber.slice(TAG.length + 1)).sort();
};

async function makeProject(name: string, status: string, budget: number | null, hours: number, manager = "Flstat PM") {
  const p = await prisma.project.create({
    data: {
      poMonth: "2026-11", prCategory: "India", prNo: `${TAG}-${name}`, client: "Flstat Client", department: "Process", domesticForeign: "Domestic",
      projectTitle: `Flstat ${name}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectEndDate: new Date("2027-12-31"), projectStatus: status,
      workOrderNumber: `${TAG}-WO-${name}`, workOrderDate: new Date("2026-01-01"), eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "PMO",
      primaryProjectManager: manager, manhourBudgetHours: budget,
    },
  });
  created.projects.push(p.id);
  ids.set(name, p.id);
  // two reconciled timesheet rows: the figure is a sum, as in production
  for (const h of [hours - 20, 20]) {
    await prisma.timesheetEntry.create({ data: { employeeNo: "0547", projectId: p.id, rawProjectCode: `${TAG}-code`, workDate: new Date("2026-03-01"), task: "Flstat", hours: h, firstImportId: importId, lastImportId: importId } });
  }
  return p;
}

before(async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeApp = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  const [role, modules] = await Promise.all([prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }), prisma.module.findMany({ where: { name: { in: ["Dashboard", "Projects"] } } })]);
  const admin = await prisma.portalUser.create({
    data: { fullName: "Flstat Admin", email: `${TAG}@example.com`, passwordHash: await hashPassword("Flstat@12345"), department: "PMO", roleId: role.id, forcePasswordChange: false, moduleAccess: { create: modules.map((m) => ({ moduleId: m.id })) } },
  });
  created.users.push(admin.id);
  token = signAccessToken({ sub: admin.id, email: admin.email, roleId: role.id, roleName: role.name });
  importId = (await prisma.timesheetImport.create({ data: { triggeredBy: "ManualUpload", totalRows: 0, status: "Succeeded" } })).id;
  created.imports.push(importId);

  // eligible: in progress and over budget (budget 100, distinct overruns, as the one real shape)
  await makeProject("ACTIVE-OVER", "Active", 100, 100 + OFFSET + 10, "Anita Rao");
  await makeProject("ONGOING-OVER", "Ongoing", 100, 100 + OFFSET + 20, "Bala Kumar");
  await makeProject("KOM-OVER", "KoM Completed", 100, 100 + OFFSET + 30);
  await makeProject("REPORT-OVER", "Draft Report Submitted", 100, 100 + OFFSET + 40);
  // not over budget: within, exactly at, and without a budget
  await makeProject("ACTIVE-WITHIN", "Active", 100, 80);
  await makeProject("ACTIVE-EQUAL", "Active", 100, 100);
  await makeProject("ACTIVE-NOBUDGET", "Active", null, 500);
  // over budget by far more than every eligible project, but not in progress
  await makeProject("COMPLETED-OVER", "Completed", 100, 100 + OFFSET + 900);
  await makeProject("ONHOLD-OVER", "On Hold", 100, 100 + OFFSET + 800);
  await makeProject("CANCELLED-OVER", "Cancelled", 100, 100 + OFFSET + 700);
  await makeProject("ARCHIVED-OVER", "Archived", 100, 100 + OFFSET + 600);
  await makeProject("NOTSTARTED-OVER", "Not Started", 100, 100 + OFFSET + 500);
  // to change status through the real update API
  await makeProject("TO-COMPLETE", "Active", 100, 100 + OFFSET + 50);
  await makeProject("TO-HOLD", "Active", 100, 100 + OFFSET + 60);
  await makeProject("TO-CANCEL", "Active", 100, 100 + OFFSET + 70);
  await makeProject("TO-RESUME", "On Hold", 100, 100 + OFFSET + 80);
  await makeProject("TO-REOPEN", "Completed", 100, 100 + OFFSET + 90);
});

after(async () => {
  try {
    if (created.projects.length) {
      await prisma.timesheetEntry.deleteMany({ where: { projectId: { in: created.projects } } });
      await prisma.projectNote.deleteMany({ where: { projectId: { in: created.projects } } }).catch(() => undefined);
      await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    }
    if (created.imports.length) await prisma.timesheetImport.deleteMany({ where: { id: { in: created.imports } } });
    if (created.users.length) {
      await prisma.authAuditLog.deleteMany({ where: { email: { contains: TAG } } });
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: created.users } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
    }
  } finally {
    await closeApp();
  }
});

const ALWAYS = ["ACTIVE-OVER", "KOM-OVER", "ONGOING-OVER", "REPORT-OVER"];
const MOVING = ["TO-CANCEL", "TO-COMPLETE", "TO-HOLD"]; // still Active until a test changes them
const change = (name: string, projectStatus: string, extra: Record<string, unknown> = {}) => api("PATCH", `/projects/${ids.get(name)}`, { projectStatus, ...extra });

test("only in-progress projects over their budget hours are listed; every other status, within-budget and no-budget project is not", async () => {
  assert.deepEqual(await listed(), [...ALWAYS, ...MOVING].sort());
});

test("the Dashboard tile's total and top 5 come from the same eligible list (no ineligible overrun can lead the ranking)", async () => {
  const s = (await summary()).hoursOverrun;
  assert.equal(s.top5.length, 5);
  assert.ok(s.top5.every((p) => p.prNumber.startsWith(TAG)), "the largest overruns in the system are ours");
  const names = s.top5.map((p) => p.prNumber.slice(TAG.length + 1));
  assert.ok(!names.some((n) => /COMPLETED|ONHOLD|CANCELLED|ARCHIVED|NOTSTARTED/.test(n)), `top 5 = ${names.join(", ")}`);
  assert.deepEqual(s.top5.map((p) => p.id), s.allMatching.slice(0, 5).map((p) => p.id), "top 5 is the head of the same list");
  assert.equal(s.totalMatchingProjects, s.allMatching.length, "the total counts only what is listed");
  const sorted = [...s.allMatching].sort((a, b) => b.hoursOverrun - a.hoursOverrun);
  assert.deepEqual(s.allMatching.map((p) => p.id), sorted.map((p) => p.id), "ordered by hours overrun, unchanged");
});

test("the figures of an eligible project are unchanged: budget, actual (a sum of its timesheet rows), overrun, percentage and its manager", async () => {
  const row = (await summary()).hoursOverrun.allMatching.find((p) => p.prNumber === `${TAG}-ACTIVE-OVER`)!;
  assert.deepEqual([row.budgetHours, row.actualHours, row.hoursOverrun, row.percentOverrun, row.projectManager], [100, 100 + OFFSET + 10, OFFSET + 10, Number(((OFFSET + 10) / 100 * 100).toFixed(1)), "Anita Rao"]);
  const bala = (await summary()).hoursOverrun.allMatching.find((p) => p.prNumber === `${TAG}-ONGOING-OVER`)!;
  assert.equal(bala.projectManager, "Bala Kumar");
});

test("A. an active project over budget disappears once its status is saved as Completed", async () => {
  assert.ok((await listed()).includes("TO-COMPLETE"));
  const res = await change("TO-COMPLETE", "Completed", { actualCompletionDate: "2026-11-20", completionRemarks: "Project completed and handed over to the client.", ldApplicable: false });
  assert.equal(res.status, 200, res.message);
  assert.ok(!(await listed()).includes("TO-COMPLETE"));
});

test("B. ... and as On Hold", async () => {
  assert.ok((await listed()).includes("TO-HOLD"));
  const res = await change("TO-HOLD", "On Hold");
  assert.equal(res.status, 200, res.message);
  assert.ok(!(await listed()).includes("TO-HOLD"));
});

test("C. ... and as Cancelled", async () => {
  assert.ok((await listed()).includes("TO-CANCEL"));
  const res = await change("TO-CANCEL", "Cancelled");
  assert.equal(res.status, 200, res.message);
  assert.ok(!(await listed()).includes("TO-CANCEL"));
});

test("D. a project resumed from On Hold to Active (or Ongoing) is listed again with its unchanged hours", async () => {
  assert.ok(!(await listed()).includes("TO-RESUME"));
  const res = await change("TO-RESUME", "Active");
  assert.equal(res.status, 200, res.message);
  const back = (await summary()).hoursOverrun.allMatching.find((p) => p.prNumber === `${TAG}-TO-RESUME`);
  assert.ok(back, "listed again");
  assert.deepEqual([back.budgetHours, back.actualHours], [100, 100 + OFFSET + 80]);
  assert.equal((await change("TO-RESUME", "Ongoing")).status, 200);
  assert.ok((await listed()).includes("TO-RESUME"), "Ongoing counts as in progress");
});

test("7. a Completed project reopened to Active is listed again while over budget", async () => {
  assert.ok(!(await listed()).includes("TO-REOPEN"));
  const res = await change("TO-REOPEN", "Active");
  assert.equal(res.status, 200, res.message);
  assert.ok((await listed()).includes("TO-REOPEN"));
});

test("E. an active project brought within its budget is not listed", async () => {
  await prisma.project.update({ where: { id: ids.get("ACTIVE-OVER")! }, data: { manhourBudgetHours: 100 + OFFSET + 10 } });
  assert.ok(!(await listed()).includes("ACTIVE-OVER"), "actual = budget is not an overrun");
  await prisma.project.update({ where: { id: ids.get("ACTIVE-OVER")! }, data: { manhourBudgetHours: 100 } });
  assert.ok((await listed()).includes("ACTIVE-OVER"));
});

test("nothing was deleted or rewritten: every fixture keeps its project row and its timesheet hours", async () => {
  assert.equal(await prisma.project.count({ where: { id: { in: [...ids.values()] } } }), ids.size);
  assert.equal(await prisma.timesheetEntry.count({ where: { projectId: { in: [...ids.values()] } } }), ids.size * 2);
  const completed = await prisma.project.findUniqueOrThrow({ where: { id: ids.get("COMPLETED-OVER")! }, select: { projectStatus: true, manhourBudgetHours: true } });
  assert.deepEqual([completed.projectStatus, completed.manhourBudgetHours], ["Completed", 100]);
});
