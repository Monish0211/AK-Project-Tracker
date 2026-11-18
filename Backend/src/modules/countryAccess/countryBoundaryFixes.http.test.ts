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
 * Two country-boundary gaps found by the multi-country audit, fixed and pinned here:
 *  1. Deleting a project's document (Administrator-only) never checked the project's country: an Administrator without Oman could delete an Oman document by id.
 *  2. The open manpower-recalculation list (Manpower module) named projects of every country, whatever the caller's countries.
 * Both are strict tightenings that only apply when country access is enforced; with it off nothing changes.
 */
const TAG = `cbf-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[], runs: [] as string[], documents: [] as string[] };
const regionId = new Map<string, string>();
const tokens = new Map<string, string>();
const setMode = (mode: "off" | "enforce") => {
  process.env["COUNTRY_ACCESS_MODE"] = mode;
};

async function makeUser(label: string, roleName: string, moduleNames: string[], opts: { countries?: string[]; allCountries?: boolean } = {}): Promise<{ id: string }> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const modules = await prisma.module.findMany({ where: { name: { in: moduleNames } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `CBF ${label}`,
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
  tokens.set(label, signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName }));
  return user;
}

let seq = 0;
async function makeProject(category: keyof typeof PR_CATEGORY_PREFIX_MAP, currency: string | null) {
  seq += 1;
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-11",
      prCategory: category,
      prNo: `${PR_CATEGORY_PREFIX_MAP[category]}${TAG}-${seq}`,
      client: "CBF Client",
      department: "Process",
      domesticForeign: "Foreign",
      projectTitle: `CBF ${category}`,
      workOrderStatus: "Received",
      projectStartDate: new Date("2026-01-01"),
      projectStatus: "Active",
      contractType: "LUMP SUM",
      createdByUserId: null,
      regionId: regionId.get(category) ?? null,
      regionalCurrency: currency,
    },
  });
  created.projects.push(project.id);
  return project;
}

const call = (token: string, method: string, path: string) => fetch(`${url}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
let admin = { id: "" };

before(async () => {
  setMode("off");
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId.set(r.name, r.id);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  admin = await makeUser("adminIndia", "Administrator", ["Projects", "Manpower"], { countries: ["India"] });
  await makeUser("adminOman", "Administrator", ["Projects", "Manpower"], { countries: ["Oman"] });
  await makeUser("adminAll", "Administrator", ["Projects", "Manpower"], { allCountries: true });
});

after(async () => {
  try {
    await prisma.manhourRateChangeRun.deleteMany({ where: { id: { in: created.runs } } });
    await prisma.document.deleteMany({ where: { id: { in: created.documents } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.userRegionAccess.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    setMode("off");
    await closeServer();
  }
});

async function makeDocument(projectId: string): Promise<string> {
  const doc = await prisma.document.create({ data: { projectId, fileName: "scope.pdf", storageKey: `${TAG}-${++seq}.pdf`, mimeType: "application/pdf", fileSizeBytes: 10, uploadedByUserId: admin.id } });
  created.documents.push(doc.id);
  return doc.id;
}

describe("deleting a project's document respects the project's country (enforce mode)", () => {
  test("an Administrator without Oman cannot delete an Oman project's document; the document stays", async () => {
    setMode("enforce");
    const oman = await makeProject("Oman", "OMR");
    const docId = await makeDocument(oman.id);
    const res = await call(tokens.get("adminIndia")!, "DELETE", `/documents/${docId}`);
    assert.equal(res.status, 403);
    assert.ok(await prisma.document.findUnique({ where: { id: docId } }), "nothing was deleted");
  });

  test("the same Administrator can delete a document of their own country, and the Oman Administrator can delete the Oman one", async () => {
    setMode("enforce");
    const india = await makeProject("India", null);
    const oman = await makeProject("Oman", "OMR");
    const indiaDoc = await makeDocument(india.id);
    const omanDoc = await makeDocument(oman.id);
    assert.equal((await call(tokens.get("adminIndia")!, "DELETE", `/documents/${indiaDoc}`)).status, 200);
    assert.equal(await prisma.document.findUnique({ where: { id: indiaDoc } }), null);
    assert.equal((await call(tokens.get("adminOman")!, "DELETE", `/documents/${omanDoc}`)).status, 200);
    assert.equal(await prisma.document.findUnique({ where: { id: omanDoc } }), null);
  });

  test("an Administrator with the explicit All Countries right can delete any country's document", async () => {
    setMode("enforce");
    const qatar = await makeProject("Qatar", "QAR");
    const docId = await makeDocument(qatar.id);
    assert.equal((await call(tokens.get("adminAll")!, "DELETE", `/documents/${docId}`)).status, 200);
  });

  test("with country access off nothing changes: an India-only Administrator can still delete any project's document", async () => {
    setMode("off");
    const oman = await makeProject("Oman", "OMR");
    const docId = await makeDocument(oman.id);
    assert.equal((await call(tokens.get("adminIndia")!, "DELETE", `/documents/${docId}`)).status, 200);
  });
});

describe("the open manpower-recalculation list names only the caller's countries' projects (enforce mode)", () => {
  test("each user sees the projects of their countries; All Countries sees both; with the mode off the list is unchanged", async () => {
    const india = await makeProject("India", null);
    const oman = await makeProject("Oman", "OMR");
    const run = await prisma.manhourRateChangeRun.create({
      data: {
        employeeNo: `${TAG}-E1`,
        newRate: 1500,
        previousRate: 1000,
        source: "MANUAL",
        actorName: "CBF",
        actorRole: "Administrator",
        status: "FAILED",
        projectCount: 2,
        failedCount: 2,
        tasks: { create: [{ projectId: india.id, status: "FAILED", lastError: "boom" }, { projectId: oman.id, status: "FAILED", lastError: "boom" }] },
      },
    });
    created.runs.push(run.id);
    const listed = async (who: string): Promise<string[]> => {
      const res = await call(tokens.get(who)!, "GET", "/manhour-refresh/runs");
      assert.equal(res.status, 200);
      const items = ((await res.json()) as { data: { items: { runId: string; openProjects: { prNo: string }[] }[] } }).data.items;
      return items.filter((r) => r.runId === run.id).flatMap((r) => r.openProjects.map((p) => p.prNo)).sort();
    };
    setMode("enforce");
    assert.deepEqual(await listed("adminIndia"), [india.prNo]);
    assert.deepEqual(await listed("adminOman"), [oman.prNo]);
    assert.deepEqual(await listed("adminAll"), [india.prNo, oman.prNo].sort());
    setMode("off");
    assert.deepEqual(await listed("adminIndia"), [india.prNo, oman.prNo].sort(), "mode off: exactly the previous behaviour");
  });

  test("a run whose projects are all in other countries is not listed at all", async () => {
    const oman = await makeProject("Oman", "OMR");
    const run = await prisma.manhourRateChangeRun.create({
      data: { employeeNo: `${TAG}-E2`, newRate: 1200, source: "MANUAL", actorName: "CBF", actorRole: "Administrator", status: "PENDING", projectCount: 1, tasks: { create: [{ projectId: oman.id, status: "PENDING" }] } },
    });
    created.runs.push(run.id);
    setMode("enforce");
    const res = await call(tokens.get("adminIndia")!, "GET", "/manhour-refresh/runs");
    const items = ((await res.json()) as { data: { items: { runId: string }[] } }).data.items;
    assert.ok(!items.some((r) => r.runId === run.id), "the India-only user never sees an Oman-only run, not even its employee number");
  });
});
