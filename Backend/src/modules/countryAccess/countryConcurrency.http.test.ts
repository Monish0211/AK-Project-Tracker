import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { invoiceEditDeleteGrants } from "../invoices/invoiceApprovalGrants.testutil.js";
import { PR_CATEGORY_PREFIX_MAP } from "../projects/project.constants.js";

/**
 * Many users of different countries working AT THE SAME TIME. The country scope of a request travels with it through async context, so the first thing to prove is
 * that simultaneous requests can never see each other's scope, that another country's projects stay refused however many requests overlap, and that no-country and
 * All Countries users are not affected by anyone else running at the same time. Enforce mode, real HTTP.
 */
const TAG = `cc-${Date.now()}`;
type Cat = keyof typeof PR_CATEGORY_PREFIX_MAP;
const COUNTRIES: { category: Cat; currency: string | null }[] = [
  { category: "India", currency: null },
  { category: "Malaysia", currency: "MYR" },
  { category: "Oman", currency: "OMR" },
  { category: "Abu Dhabi", currency: "AED" },
  { category: "FZI", currency: "AED" },
  { category: "Elixir Qatar", currency: "QAR" },
  { category: "Qatar", currency: "QAR" },
];

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[] };
const regionId = new Map<string, string>();
const tokens = new Map<Cat | "none" | "all", string>();
const projectsOf = new Map<Cat, { projectId: string; itemId: string }[]>();
let seq = 0;

const setMode = (mode: "off" | "enforce") => {
  process.env["COUNTRY_ACCESS_MODE"] = mode;
};

async function makeUser(label: string, categories: Cat[], allCountries = false): Promise<string> {
  const [role, projects, invoices, raise] = await Promise.all([
    prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Projects" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Invoices" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Raise Invoice" } }),
  ]);
  const user = await prisma.portalUser.create({
    data: {
      fullName: `CC ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword("Concurrency@123"),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      allCountriesAccess: allCountries,
      moduleAccess: { create: [{ moduleId: projects.id }, { moduleId: invoices.id }] },
      approvalPermissions: { create: [{ approvalTypeId: raise.id }, ...(await invoiceEditDeleteGrants())] },
      regionAccess: { create: categories.map((c) => ({ regionId: regionId.get(c)! })) },
    },
  });
  created.users.push(user.id);
  return signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: role.name });
}

async function makeProject(category: Cat, currency: string | null, wo = 1000) {
  seq += 1;
  const regional = currency !== null;
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-11",
      prCategory: category,
      prNo: `${PR_CATEGORY_PREFIX_MAP[category]}${TAG}-${seq}`,
      client: "CC Client",
      department: "Process",
      domesticForeign: "Foreign",
      projectTitle: `CC ${category} ${seq}`,
      workOrderStatus: "Received",
      projectStartDate: new Date("2026-01-01"),
      projectEndDate: new Date("2026-12-31"),
      projectStatus: "Active",
      contractType: "LUMP SUM",
      createdByUserId: null,
      regionId: regionId.get(category) ?? null,
      regionalCurrency: currency,
    },
  });
  created.projects.push(project.id);
  const item = await prisma.quantityItem.create({
    data: {
      projectId: project.id,
      description: "CC activity",
      woQty: 10,
      uom: "DAY",
      currency: currency ?? "INR",
      unitRate: wo / 10,
      exchangeRate: 1,
      unitRateINR: regional ? 0 : wo / 10,
      woValue: regional ? 0 : wo,
      unitRateRegional: wo / 10,
      woValueRegional: wo,
    },
  });
  return { projectId: project.id, itemId: item.id };
}

const get = (token: string, path: string) => fetch(`${url}${path}`, { headers: { Authorization: `Bearer ${token}` } });
const post = (token: string, path: string, body: unknown) => fetch(`${url}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const patch = (token: string, path: string, body: unknown) => fetch(`${url}${path}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
const json = async (res: Response) => (await res.json().catch(() => ({}))) as { data?: any; message?: string };
let invSeq = 0;
const nextNo = () => `${TAG}-INV-${++invSeq}`;
const line = (over: Record<string, unknown>) => ({ invoiceDate: new Date("2026-11-10").toISOString(), quantityBilled: 0, status: "Raised", ...over });

before(async () => {
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId.set(r.name, r.id);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  for (const c of COUNTRIES) {
    tokens.set(c.category, await makeUser(c.category.replace(/\W/g, "").toLowerCase(), [c.category]));
    projectsOf.set(c.category, [await makeProject(c.category, c.currency), await makeProject(c.category, c.currency)]);
  }
  tokens.set("all", await makeUser("all", [], true));
  tokens.set("none", await makeUser("none", []));
  setMode("enforce");
});

after(async () => {
  try {
    await prisma.invoiceStatusEvent.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: created.projects } } } });
    await prisma.invoiceNumber.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.userRegionAccess.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    setMode("off");
    await closeServer();
  }
});

describe("simultaneous users of different countries never see each other's scope", () => {
  test("seven countries x three reads at once, repeated: every response holds only its own country's projects", async () => {
    const own = new Map<Cat, Set<string>>(COUNTRIES.map((c) => [c.category, new Set(projectsOf.get(c.category)!.map((p) => p.projectId))]));
    for (let round = 0; round < 6; round++) {
      const calls = COUNTRIES.flatMap((c) => [
        get(tokens.get(c.category)!, `/projects?pageSize=100&search=${TAG}`).then(async (r) => ({ c: c.category, kind: "list", status: r.status, ids: ((await json(r)).data?.items ?? []).map((i: any) => i.id) as string[] })),
        get(tokens.get(c.category)!, "/projects/quantity").then(async (r) => ({ c: c.category, kind: "quantity", status: r.status, ids: ((await json(r)).data?.items ?? []).map((i: any) => i.projectId).filter((id: string) => created.projects.includes(id)) as string[] })),
        get(tokens.get(c.category)!, "/invoice-items").then(async (r) => ({ c: c.category, kind: "lines", status: r.status, ids: [] as string[] })),
      ]);
      for (const result of await Promise.all(calls)) {
        assert.equal(result.status, 200, `${result.c} ${result.kind}`);
        if (result.kind === "lines") continue;
        const expected = own.get(result.c)!;
        assert.deepEqual([...new Set(result.ids)].sort(), [...expected].sort(), `${result.c} ${result.kind} round ${round}: exactly its own projects`);
      }
    }
  });

  test("the All Countries user sees every country, a no-country user sees none, and neither affects the others while running concurrently", async () => {
    const everything = new Set([...projectsOf.values()].flat().map((p) => p.projectId));
    const burst = await Promise.all([
      ...Array.from({ length: 6 }, () => get(tokens.get("all")!, `/projects?pageSize=200&search=${TAG}`).then(async (r) => ({ who: "all", status: r.status, ids: ((await json(r)).data?.items ?? []).map((i: any) => i.id) as string[] }))),
      ...Array.from({ length: 6 }, () => get(tokens.get("none")!, `/projects?pageSize=200&search=${TAG}`).then(async (r) => ({ who: "none", status: r.status, ids: ((await json(r)).data?.items ?? []).map((i: any) => i.id) as string[] }))),
      ...Array.from({ length: 6 }, () => get(tokens.get("Oman")!, `/projects?pageSize=200&search=${TAG}`).then(async (r) => ({ who: "oman", status: r.status, ids: ((await json(r)).data?.items ?? []).map((i: any) => i.id) as string[] }))),
    ]);
    for (const r of burst) {
      assert.equal(r.status, 200);
      if (r.who === "all") assert.deepEqual([...r.ids].sort(), [...everything].sort());
      if (r.who === "none") assert.deepEqual(r.ids, []);
      if (r.who === "oman") assert.deepEqual([...r.ids].sort(), projectsOf.get("Oman")!.map((p) => p.projectId).sort());
    }
  });

  test("direct API access to another country's projects is refused every time, however many requests overlap", async () => {
    const india = projectsOf.get("India")![0]!;
    const results = await Promise.all([
      ...Array.from({ length: 12 }, () => get(tokens.get("Oman")!, `/projects/${india.projectId}`).then((r) => r.status)),
      ...Array.from({ length: 6 }, () => get(tokens.get("Oman")!, `/projects/${india.projectId}/invoice-items`).then((r) => r.status)),
      ...Array.from({ length: 6 }, () => post(tokens.get("Oman")!, `/quantity/${india.itemId}/invoice-lines`, line({ invoiceNo: nextNo(), invoiceAmountINR: 10 })).then((r) => r.status)),
    ]);
    assert.ok(results.every((s) => s === 403), `every status was 403, got ${[...new Set(results)].join(",")}`);
    assert.equal(await prisma.invoiceLine.count({ where: { quantityItemId: india.itemId } }), 0, "nothing was written");
  });
});

describe("concurrent regional invoice writes keep their invariants", () => {
  test("eight users raise the SAME invoice number at once: exactly one wins, the rest get a clear conflict", async () => {
    const oman = projectsOf.get("Oman")![0]!;
    const no = nextNo();
    const statuses = await Promise.all(Array.from({ length: 8 }, () => post(tokens.get("Oman")!, `/quantity/${oman.itemId}/invoice-lines`, line({ invoiceNo: no, invoiceIntent: "new", invoiceAmountOriginal: 10 })).then((r) => r.status)));
    assert.equal(statuses.filter((s) => s === 201).length, 1, `statuses ${statuses.join(",")}`);
    assert.ok(statuses.filter((s) => s !== 201).every((s) => s === 409), `the others are conflicts, got ${statuses.join(",")}`);
    assert.equal(await prisma.invoiceLine.count({ where: { quantityItemId: oman.itemId, invoiceNo: no } }), 1);
  });

  test("the Work Order ceiling is never exceeded by overlapping raises (OMR 1,000: five requests of OMR 400 -> two succeed)", async () => {
    const project = await makeProject("Oman", "OMR", 1000);
    const statuses = await Promise.all(Array.from({ length: 5 }, () => post(tokens.get("Oman")!, `/quantity/${project.itemId}/invoice-lines`, line({ invoiceNo: nextNo(), invoiceAmountOriginal: 400 })).then((r) => r.status)));
    assert.equal(statuses.filter((s) => s === 201).length, 2, `statuses ${statuses.join(",")}`);
    assert.ok(statuses.filter((s) => s !== 201).every((s) => s === 400), `the rest are refused for the ceiling, got ${statuses.join(",")}`);
    const sum = await prisma.invoiceLine.aggregate({ where: { quantityItemId: project.itemId }, _sum: { invoiceAmountProject: true } });
    assert.ok(Number(sum._sum.invoiceAmountProject) <= 1000, `total ${sum._sum.invoiceAmountProject} within the work order value`);
  });

  test("the ceiling holds for a foreign-currency regional invoice too (QAR 1,000: USD 200 at 3.64 = QAR 728, three at once -> one succeeds)", async () => {
    const project = await makeProject("Qatar", "QAR", 1000);
    const statuses = await Promise.all(Array.from({ length: 3 }, () => post(tokens.get("Qatar")!, `/quantity/${project.itemId}/invoice-lines`, line({ invoiceNo: nextNo(), currency: "USD", exchangeRateToProject: "3.64", invoiceAmountOriginal: 200 })).then((r) => r.status)));
    assert.equal(statuses.filter((s) => s === 201).length, 1, `statuses ${statuses.join(",")}`);
    const rows = await prisma.invoiceLine.findMany({ where: { quantityItemId: project.itemId } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.invoiceAmountProject!.toFixed(2), "728.00");
  });

  test("simultaneous edits of one invoice line never tear it: the project-currency amount always equals the saved original at the saved rate", async () => {
    const project = await makeProject("Oman", "OMR", 100_000);
    const created1 = await json(await post(tokens.get("Oman")!, `/quantity/${project.itemId}/invoice-lines`, line({ invoiceNo: nextNo(), status: "Draft", currency: "USD", exchangeRateToProject: "0.385", invoiceAmountOriginal: 100 })));
    const id = created1.data.id as string;
    const amounts = [110, 120, 130, 140, 150, 160, 170, 180];
    const results = await Promise.all(amounts.map((a) => patch(tokens.get("Oman")!, `/invoice-lines/${id}`, { invoiceAmountOriginal: a }).then((r) => r.status)));
    assert.ok(results.every((s) => s === 200), `no failures or 5xx, got ${results.join(",")}`);
    const row = await prisma.invoiceLine.findUniqueOrThrow({ where: { id } });
    const original = row.invoiceAmountOriginal!;
    assert.ok(amounts.includes(original), `the final original ${original} is one of the values sent`);
    assert.equal(row.invoiceAmountProject!.toFixed(3), (Math.round(original * 0.385 * 1000) / 1000).toFixed(3), "project amount = original x 0.385, never a mix of two edits");
    assert.equal(row.exchangeRateToProject!.toFixed(3), "0.385");
    assert.equal(row.invoiceAmountINR, 0);
  });
});
