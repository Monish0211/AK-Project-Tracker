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
 * The country boundary on every INVOICE-FAMILY read and write that exists in this release: the Invoice Tracker (list, outstanding, raised breakdown, per-project
 * chain), the caller's invoice lines (/invoice-items, used by Reports and the Dashboard), a project's invoice items, invoice-line creation, and payment records.
 * The invoice code itself is unchanged by the country work: these routes already ask the shared project-access rules, and the country boundary lives in those rules.
 * This file pins that, so a later change to an invoice file cannot silently open another country's invoices. Enforce mode, real HTTP, real database.
 * India project data is raised with the normal INR columns; the other country's rows are inserted directly (invoicing a non-INR project is refused in this release).
 */
const TAG = `ifc-${Date.now()}`;
type Cat = keyof typeof PR_CATEGORY_PREFIX_MAP;
let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[] };
const regionId = new Map<string, string>();
const tokens = new Map<string, string>();
const data = new Map<Cat, { projectId: string; prNo: string; itemId: string; lineId: string; invoiceNo: string }>();
const setMode = (mode: "off" | "enforce") => {
  process.env["COUNTRY_ACCESS_MODE"] = mode;
};

async function makeUser(label: string, opts: { countries?: Cat[]; allCountries?: boolean }): Promise<void> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } });
  const modules = await prisma.module.findMany({ where: { name: { in: ["Projects", "Invoices", "Reminders"] } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `IFC ${label}`,
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

async function makeProjectWithInvoice(category: Cat, currency: string | null): Promise<void> {
  const prNo = `${PR_CATEGORY_PREFIX_MAP[category]}${TAG}`;
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-10",
      prCategory: category,
      prNo,
      client: `IFC Client ${category}`,
      department: "Process",
      domesticForeign: "Foreign",
      projectTitle: `IFC ${category}`,
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
  const item = await prisma.quantityItem.create({ data: { projectId: project.id, description: "Activity", woQty: 10, uom: "DAY", unitRate: 1000, exchangeRate: 1, unitRateINR: 1000, woValue: 10000 } });
  const invoiceNo = `${TAG}-${category}`;
  const line = await prisma.invoiceLine.create({
    data: { quantityItemId: item.id, invoiceNo, invoiceDate: new Date("2026-10-10T00:00:00.000Z"), quantityBilled: 0, invoiceAmountINR: 500, status: "Raised", createdBy: "Direct Entry" },
  });
  data.set(category, { projectId: project.id, prNo, itemId: item.id, lineId: line.id, invoiceNo });
}

const call = (who: string, path: string, method = "GET", body?: unknown) =>
  fetch(`${url}${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens.get(who)!}` }, body: body === undefined ? undefined : JSON.stringify(body) });
const json = async (res: Response) => (await res.json().catch(() => ({}))) as { data?: any; message?: string };

before(async () => {
  setMode("off");
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId.set(r.name, r.id);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await makeProjectWithInvoice("India", null);
  await makeProjectWithInvoice("Oman", "OMR");
  await makeUser("india", { countries: ["India"] });
  await makeUser("oman", { countries: ["Oman"] });
  await makeUser("both", { countries: ["India", "Oman"] });
  await makeUser("all", { allCountries: true });
  await makeUser("none", {});
  setMode("enforce");
});

after(async () => {
  try {
    const items = await prisma.quantityItem.findMany({ where: { projectId: { in: created.projects } }, select: { id: true } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItemId: { in: items.map((i) => i.id) } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.userRegionAccess.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    setMode("off");
    await closeServer();
  }
});

const IN = () => data.get("India")!;
const OM = () => data.get("Oman")!;

describe("Invoice Tracker lists only the caller's countries' projects", () => {
  const who: [string, ("India" | "Oman")[]][] = [["india", ["India"]], ["oman", ["Oman"]], ["both", ["India", "Oman"]], ["all", ["India", "Oman"]], ["none", []]];
  for (const [user, expected] of who) {
    test(`${user}: month list, outstanding and raised breakdown name exactly ${expected.join(" + ") || "nothing"}`, async () => {
      const wantPr = expected.map((c) => data.get(c)!.prNo).sort();
      const list = await call(user, `/invoice-tracker?month=2026-10&search=${TAG}&pageSize=100`);
      assert.equal(list.status, 200);
      assert.deepEqual(((await json(list)).data.items as { prNo: string }[]).map((i) => i.prNo).sort(), wantPr);
      const out = await call(user, `/invoice-tracker/outstanding?search=${TAG}&pageSize=100`);
      assert.equal(out.status, 200);
      assert.deepEqual(((await json(out)).data.items as { prNo: string }[]).map((i) => i.prNo).sort(), wantPr);
      const breakdown = await call(user, `/invoice-tracker/raised-breakdown?month=2026-10&search=${TAG}&pageSize=100`);
      assert.equal(breakdown.status, 200);
      const rows = ((await json(breakdown)).data.projects ?? []) as { prNo: string }[];
      assert.deepEqual(rows.map((i) => i.prNo).sort(), wantPr);
    });
  }

  test("the summary cards add up only the visible projects' invoices (India-only user: one invoice of 500)", async () => {
    const res = await call("india", `/invoice-tracker?month=2026-10&search=${TAG}&pageSize=100`);
    const summary = (await json(res)).data.summary;
    assert.equal(summary.invoiceCount, 1);
    assert.equal(summary.raisedAmountINR, 500);
  });

  test("a project's invoice chain is refused (403) across countries and open within a user's own country", async () => {
    assert.equal((await call("india", `/invoice-tracker/projects/${OM().projectId}/invoices?month=2026-10`)).status, 403);
    assert.equal((await call("oman", `/invoice-tracker/projects/${IN().projectId}/invoices?month=2026-10`)).status, 403);
    assert.equal((await call("none", `/invoice-tracker/projects/${IN().projectId}/invoices?month=2026-10`)).status, 403);
    assert.equal((await call("india", `/invoice-tracker/projects/${IN().projectId}/invoices?month=2026-10`)).status, 200);
    assert.equal((await call("all", `/invoice-tracker/projects/${OM().projectId}/invoices?month=2026-10`)).status, 200);
  });
});

describe("the caller's invoice lines, a project's invoice items and invoice writes respect the country", () => {
  test("/invoice-items (Reports and Dashboard source) holds only the caller's countries' lines", async () => {
    const mine = async (user: string): Promise<string[]> => {
      const res = await call(user, "/invoice-items");
      assert.equal(res.status, 200);
      return ((await json(res)).data.items as { invoiceNo: string }[]).map((l) => l.invoiceNo).filter((n) => n.startsWith(TAG)).sort();
    };
    assert.deepEqual(await mine("india"), [IN().invoiceNo]);
    assert.deepEqual(await mine("oman"), [OM().invoiceNo]);
    assert.deepEqual(await mine("all"), [IN().invoiceNo, OM().invoiceNo].sort());
    assert.deepEqual(await mine("none"), []);
  });

  test("another country's project invoice items, invoice-line creation and payment records are all refused with 403", async () => {
    assert.equal((await call("india", `/projects/${OM().projectId}/invoice-items`)).status, 403);
    assert.equal((await call("india", `/quantity/${OM().itemId}/invoice-lines`, "POST", { invoiceNo: `${TAG}-X`, invoiceDate: new Date("2026-10-11").toISOString(), quantityBilled: 0, invoiceAmountINR: 10 })).status, 403);
    assert.equal((await call("india", `/invoice-lines/${OM().lineId}`, "DELETE")).status, 403);
    assert.equal((await call("india", `/invoice-payments?projectId=${OM().projectId}&invoiceNo=${encodeURIComponent(OM().invoiceNo)}`)).status, 403);
    assert.equal((await call("india", `/invoice-payments?projectId=${IN().projectId}&invoiceNo=${encodeURIComponent(IN().invoiceNo)}`)).status, 200);
    assert.equal(await prisma.invoiceLine.count({ where: { quantityItemId: OM().itemId } }), 1, "nothing was written or removed");
  });

  test("with country access off, nothing narrows: the India-only user's tracker lists both projects as before", async () => {
    setMode("off");
    try {
      const res = await call("india", `/invoice-tracker?month=2026-10&search=${TAG}&pageSize=100`);
      assert.deepEqual(((await json(res)).data.items as { prNo: string }[]).map((i) => i.prNo).sort(), [IN().prNo, OM().prNo].sort());
    } finally {
      setMode("enforce");
    }
  });
});
