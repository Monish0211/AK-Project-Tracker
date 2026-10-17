import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Reports data consistency (Oct 2026) — GET /projects/expenses and
 * GET /projects/quantity: read-only, paginated, cross-project bulk reads that
 * let Reports use live expense/quantity rows instead of the per-browser
 * localStorage mirror. Verifies project-level authorization (a restricted
 * user never receives another owner's rows), the Projects module gate,
 * active-row/deleted-project filtering, deterministic pagination, the
 * billed-quantity rollup, and that the literal paths are not swallowed by
 * projectRoutes' GET /projects/:id.
 */

const TAG = `reports-bulk-${Date.now()}`;

let url = "";
let closeServer: () => Promise<void> = async () => {};
const userIds: string[] = [];
const projectIds: string[] = [];
let ownerToken = "";
let otherToken = "";
let noModuleToken = "";
let ownerProjectId = "";
let otherProjectId = "";
let deletedProjectId = "";
let ownerQuantityId = "";

interface PageResponse<T> {
  success: boolean;
  data?: { items: T[]; total: number; page: number; pageSize: number };
  message?: string;
}
interface ExpenseRow { id: string; projectId: string; description: string; totalCost: number }
interface QuantityRow { id: string; projectId: string; description: string; woQty: number; woValue: number; invoiceQty: number; pendingQty: number }

function projectData(suffix: string, createdByUserId: string, isDeleted = false) {
  return {
    poMonth: "2026-10",
    prCategory: "India",
    prNo: `${TAG}-${suffix}`,
    client: "Reports Bulk Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: `Reports bulk probe ${suffix}`,
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectEndDate: new Date("2026-12-31"),
    projectStatus: "Active",
    workOrderNumber: `${TAG}-${suffix}-WO`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
    createdByUserId,
    isDeleted,
    deletedAt: isDeleted ? new Date() : null,
  };
}

function expense(projectId: string, description: string, totalCost: number, isActive = true) {
  return { projectId, category: "Travel", description, quantity: 1, unitCost: totalCost, totalCost, isActive };
}

async function get<T>(path: string, token: string): Promise<{ status: number; json: PageResponse<T> }> {
  const res = await fetch(`${url}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: (await res.json()) as PageResponse<T> };
}

/** Walks every page and returns the rows tagged by this test run. */
async function allTagged<T extends { description: string }>(path: string, token: string, pageSize: number): Promise<{ rows: T[]; pages: number; total: number }> {
  const rows: T[] = [];
  let page = 1;
  let total = 0;
  let seen = 0;
  do {
    const { status, json } = await get<T>(`${path}?page=${page}&pageSize=${pageSize}`, token);
    assert.equal(status, 200, json.message);
    total = json.data!.total;
    seen += json.data!.items.length;
    rows.push(...json.data!.items.filter((r) => r.description.startsWith(TAG)));
    page += 1;
  } while (seen < total && page < 1000);
  assert.equal(seen, total, "pages together return exactly `total` rows");
  return { rows, pages: page - 1, total };
}

before(async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  const [projectsModule, engineerRole] = await Promise.all([
    prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
  ]);
  const passwordHash = await hashPassword("ReportsBulkTest@123");
  const mkUser = async (suffix: string, withProjects: boolean) => {
    const user = await prisma.portalUser.create({
      data: {
        fullName: `Reports Bulk ${suffix}`,
        email: `${TAG}-${suffix}@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        ...(withProjects ? { moduleAccess: { create: { moduleId: projectsModule.id } } } : {}),
      },
    });
    userIds.push(user.id);
    return { user, token: signAccessToken({ sub: user.id, email: user.email, roleId: engineerRole.id, roleName: engineerRole.name }) };
  };
  const owner = await mkUser("owner", true);
  const other = await mkUser("other", true);
  const noModule = await mkUser("nomodule", false);
  ownerToken = owner.token;
  otherToken = other.token;
  noModuleToken = noModule.token;

  ownerProjectId = (await prisma.project.create({ data: projectData("OWN", owner.user.id) })).id;
  otherProjectId = (await prisma.project.create({ data: projectData("OTHER", other.user.id) })).id;
  deletedProjectId = (await prisma.project.create({ data: projectData("DEL", owner.user.id, true) })).id;
  projectIds.push(ownerProjectId, otherProjectId, deletedProjectId);

  await prisma.projectExpense.createMany({
    data: [
      ...Array.from({ length: 5 }, (_, i) => expense(ownerProjectId, `${TAG}-own-${i}`, 1000 + i)),
      expense(ownerProjectId, `${TAG}-own-inactive`, 777, false),
      expense(otherProjectId, `${TAG}-other`, 5000),
      expense(deletedProjectId, `${TAG}-deleted`, 9000),
    ],
  });

  const q = await prisma.quantityItem.create({
    data: { projectId: ownerProjectId, description: `${TAG}-own-qty`, woQty: 10, uom: "Nos", unitRate: 100, exchangeRate: 1, unitRateINR: 100, woValue: 1000 },
  });
  ownerQuantityId = q.id;
  await prisma.quantityItem.create({
    data: { projectId: otherProjectId, description: `${TAG}-other-qty`, woQty: 1, uom: "Nos", unitRate: 50, exchangeRate: 1, unitRateINR: 50, woValue: 50 },
  });
  await prisma.invoiceLine.createMany({
    data: [
      { quantityItemId: q.id, invoiceNo: `${TAG}-INV-1`, invoiceDate: new Date("2026-05-01"), quantityBilled: 3, invoiceAmountINR: 300, status: "Paid", createdBy: "test" },
      { quantityItemId: q.id, invoiceNo: `${TAG}-INV-2`, invoiceDate: new Date("2026-05-02"), quantityBilled: 4, invoiceAmountINR: 400, status: "Cancelled", createdBy: "test" },
    ],
  });
});

after(async () => {
  try {
    if (projectIds.length > 0) {
      await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: projectIds } } } });
      await prisma.quantityItem.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.projectExpense.deleteMany({ where: { projectId: { in: projectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    }
    if (userIds.length > 0) {
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: userIds } } });
    }
  } finally {
    await closeServer();
  }
});

test("GET /projects/expenses — paginated shape, not swallowed by GET /projects/:id", async () => {
  const { status, json } = await get<ExpenseRow>("/projects/expenses?page=1&pageSize=3", ownerToken);
  assert.equal(status, 200, json.message);
  assert.equal(json.data!.page, 1);
  assert.equal(json.data!.pageSize, 3);
  assert.ok(json.data!.items.length <= 3);
  assert.equal(typeof json.data!.total, "number");
  const defaults = await get<ExpenseRow>("/projects/expenses", ownerToken);
  assert.equal(defaults.json.data!.page, 1, "page defaults to 1");
  assert.equal(defaults.json.data!.pageSize, 500, "pageSize defaults to 500");
});

test("GET /projects/expenses — restricted user sees only authorized, active rows on live projects; pages have no gaps or duplicates", async () => {
  const { rows, pages } = await allTagged<ExpenseRow>("/projects/expenses", ownerToken, 2);
  const descriptions = rows.map((r) => r.description).sort();
  assert.deepEqual(descriptions, [0, 1, 2, 3, 4].map((i) => `${TAG}-own-${i}`), "own active rows only — no inactive, other-owner or deleted-project rows");
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "no duplicates across pages");
  assert.ok(pages >= 3, "pageSize=2 really paginated");
  assert.ok(rows.every((r) => r.projectId === ownerProjectId));

  const other = await allTagged<ExpenseRow>("/projects/expenses", otherToken, 500);
  assert.deepEqual(other.rows.map((r) => r.description), [`${TAG}-other`], "the other owner sees only their own row");
});

test("GET /projects/expenses — matches the per-project endpoint for the same project", async () => {
  const bulk = await allTagged<ExpenseRow>("/projects/expenses", ownerToken, 500);
  const res = await fetch(`${url}/projects/${ownerProjectId}/expenses`, { headers: { Authorization: `Bearer ${ownerToken}` } });
  const per = (await res.json()) as { data: { items: ExpenseRow[] } };
  assert.deepEqual(bulk.rows.map((r) => r.id).sort(), per.data.items.map((r) => r.id).sort());
  assert.equal(bulk.rows.reduce((a, r) => a + r.totalCost, 0), 5010);
});

test("GET /projects/quantity — authorized rows only, same DTO and billed rollup as the per-project endpoint", async () => {
  const { rows } = await allTagged<QuantityRow>("/projects/quantity", ownerToken, 1);
  assert.deepEqual(rows.map((r) => r.description), [`${TAG}-own-qty`], "other owner's quantity row is excluded");
  const [row] = rows;
  assert.equal(row.id, ownerQuantityId);
  assert.equal(row.woValue, 1000);
  assert.equal(row.invoiceQty, 3, "Cancelled line's quantity is not billed");
  assert.equal(row.pendingQty, 7);
  const res = await fetch(`${url}/projects/${ownerProjectId}/quantity`, { headers: { Authorization: `Bearer ${ownerToken}` } });
  const per = (await res.json()) as { data: { items: QuantityRow[] } };
  const perRow = per.data.items.find((r) => r.id === ownerQuantityId)!;
  assert.deepEqual({ ...row }, { ...perRow }, "bulk row is identical to the per-project row");
});

test("bulk reads — module gate, authentication and query validation", async () => {
  for (const path of ["/projects/expenses", "/projects/quantity"]) {
    assert.equal((await get(path, noModuleToken)).status, 403, `${path} without the Projects module`);
    assert.equal((await get(path, "")).status, 401, `${path} unauthenticated`);
    for (const bad of ["pageSize=0", "pageSize=2001", "page=0", "page=abc"]) {
      assert.equal((await get(`${path}?${bad}`, ownerToken)).status, 400, `${path}?${bad}`);
    }
  }
});
