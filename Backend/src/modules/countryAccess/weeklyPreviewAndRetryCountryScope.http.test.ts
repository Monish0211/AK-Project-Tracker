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
 * The manpower recalculation retry under the country boundary (enforce mode, real HTTP): a retry recalculates, so it touches only the projects of the countries the
 * signed-in user holds. Country access OFF changes nothing. (The Weekly Emails previews are deliberately NOT country-limited: they are global reports, see
 * weeklyEmailsGlobal.http.test.ts.)
 */
const TAG = `wpr-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[], runs: [] as string[] };
const regionId = new Map<string, string>();
const tokens = new Map<string, string>();
const projects = new Map<"India" | "Oman", { id: string; prNo: string }>();
const setMode = (mode: "off" | "enforce") => {
  process.env["COUNTRY_ACCESS_MODE"] = mode;
};

async function makeUser(label: string, opts: { countries?: string[]; allCountries?: boolean }): Promise<void> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } });
  const modules = await prisma.module.findMany({ where: { name: { in: ["Settings", "Invoices", "Manpower", "Projects"] } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `WPR ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword("Boundary@123"),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      allCountriesAccess: opts.allCountries === true,
      moduleAccess: { create: modules.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: (opts.countries ?? []).map((name) => ({ regionId: regionId.get(name)! })) },
    },
  });
  created.users.push(user.id);
  tokens.set(label, signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: "Administrator" }));
}

async function makeProject(category: "India" | "Oman", currency: string | null): Promise<void> {
  const prNo = `${PR_CATEGORY_PREFIX_MAP[category]}${TAG}`;
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-10", prCategory: category, prNo, client: `WPR Client ${category}`, department: "Process", domesticForeign: "Foreign", projectTitle: `WPR ${category}`,
      workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", createdByUserId: null,
      regionId: regionId.get(category) ?? null, regionalCurrency: currency,
    },
  });
  created.projects.push(project.id);
  projects.set(category, { id: project.id, prNo });
}

const call = (who: string, path: string, method = "GET") => fetch(`${url}${path}`, { method, headers: { Authorization: `Bearer ${tokens.get(who)!}` } });
const json = async (res: Response) => (await res.json().catch(() => ({}))) as { data?: any; message?: string };
const IN = () => projects.get("India")!;
const OM = () => projects.get("Oman")!;

before(async () => {
  setMode("off");
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId.set(r.name, r.id);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await makeProject("India", null);
  await makeProject("Oman", "OMR");
  await makeUser("india", { countries: ["India"] });
  await makeUser("oman", { countries: ["Oman"] });
  await makeUser("all", { allCountries: true });
  await makeUser("none", {});
  setMode("enforce");
});

after(async () => {
  try {
    await prisma.manhourRateChangeRun.deleteMany({ where: { id: { in: created.runs } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.userRegionAccess.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    setMode("off");
    await closeServer();
  }
});

describe("the manpower recalculation retry touches only the caller's countries' projects (enforce mode)", () => {
  async function makeRun(labels: ("India" | "Oman")[]): Promise<{ runId: string; taskOf: (c: "India" | "Oman") => Promise<{ attempts: number; status: string } | null> }> {
    const run = await prisma.manhourRateChangeRun.create({
      data: {
        employeeNo: `${TAG}-NOEMP`, newRate: 1500, source: "MANUAL", actorName: "WPR", actorRole: "Administrator", status: "FAILED", projectCount: labels.length, failedCount: labels.length,
        tasks: { create: labels.map((c) => ({ projectId: projects.get(c)!.id, status: "FAILED", lastError: "earlier failure" })) },
      },
    });
    created.runs.push(run.id);
    return { runId: run.id, taskOf: (c) => prisma.manhourRefreshTask.findFirst({ where: { runId: run.id, projectId: projects.get(c)!.id }, select: { attempts: true, status: true } }) };
  }

  test("an India-only user retries only the India project: the Oman project is not touched and the answer counts only India", async () => {
    const { runId, taskOf } = await makeRun(["India", "Oman"]);
    const res = await call("india", `/manhour-refresh/runs/${runId}/retry`, "POST");
    assert.equal(res.status, 200, JSON.stringify(await json(res.clone())));
    const data = (await json(res)).data;
    assert.equal(data.projectCount, 1, "only the caller's own project is counted");
    assert.equal((await taskOf("India"))!.attempts, 1, "the caller's project was attempted");
    assert.equal((await taskOf("Oman"))!.attempts, 0, "the other country's project was not attempted");
  });

  test("a run with none of the caller's projects reads as not found, and nothing is attempted", async () => {
    const { runId, taskOf } = await makeRun(["Oman"]);
    assert.equal((await call("india", `/manhour-refresh/runs/${runId}/retry`, "POST")).status, 404);
    assert.equal((await taskOf("Oman"))!.attempts, 0);
    assert.equal((await call("none", `/manhour-refresh/runs/${runId}/retry`, "POST")).status, 404);
  });

  test("the explicit All Countries right retries every project, and the Oman user retries the Oman one", async () => {
    const both = await makeRun(["India", "Oman"]);
    assert.equal((await call("all", `/manhour-refresh/runs/${both.runId}/retry`, "POST")).status, 200);
    assert.equal((await both.taskOf("India"))!.attempts, 1);
    assert.equal((await both.taskOf("Oman"))!.attempts, 1);
    const omanRun = await makeRun(["India", "Oman"]);
    assert.equal((await call("oman", `/manhour-refresh/runs/${omanRun.runId}/retry`, "POST")).status, 200);
    assert.equal((await omanRun.taskOf("Oman"))!.attempts, 1);
    assert.equal((await omanRun.taskOf("India"))!.attempts, 0);
  });

  test("with country access off nothing is limited: an India-only user retries every project of the run, exactly as before", async () => {
    setMode("off");
    try {
      const { runId, taskOf } = await makeRun(["India", "Oman"]);
      assert.equal((await call("india", `/manhour-refresh/runs/${runId}/retry`, "POST")).status, 200);
      assert.equal((await taskOf("India"))!.attempts, 1);
      assert.equal((await taskOf("Oman"))!.attempts, 1);
    } finally {
      setMode("enforce");
    }
  });
});
