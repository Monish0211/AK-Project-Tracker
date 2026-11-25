import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { PR_CATEGORY_PREFIX_MAP } from "./project.constants.js";

/**
 * Project Tax (Nov 2026) over the real API on the local test database: which projects take Tax, persistence (Not Set vs 0%), partial updates,
 * India / legacy refusal, category changes, import, PR Request approval, and that GST, quantities and milestones are untouched.
 * SMTP is blank for test runs (no email). Fixtures are tagged and removed afterwards. Needs the country currencies configured
 * (scripts/country_config_seed.sql).
 */

const TAG = `ptax-${Date.now()}`;
const NON_INDIA: Record<string, string> = { Malaysia: "MYR", Oman: "OMR", "Abu Dhabi": "AED", FZI: "AED", "Elixir Qatar": "QAR", Qatar: "QAR" };

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[], requests: [] as string[] };

interface Actor {
  id: string;
  token: string;
}

async function makeUser(label: string, roleName: string, modules: string[]): Promise<Actor> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const mods = await prisma.module.findMany({ where: { name: { in: modules } } });
  const regions = await prisma.region.findMany();
  const user = await prisma.portalUser.create({
    data: {
      fullName: `Tax ${label}`, email: `${TAG}-${label}@example.com`, passwordHash: await hashPassword("PTaxTest@123"), department: "PMO",
      roleId: role.id, forcePasswordChange: false,
      moduleAccess: { create: mods.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: regions.map((r) => ({ regionId: r.id })) },
    },
  });
  created.users.push(user.id);
  return { id: user.id, token: signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName }) };
}

async function call(actor: Actor, path: string, opts: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${url}${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${actor.token}` },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let seq = 0;
const prNoFor = (category: string) => `${PR_CATEGORY_PREFIX_MAP[category as keyof typeof PR_CATEGORY_PREFIX_MAP]}${TAG}-${++seq}`;
function projectBody(category: string, extra: Record<string, unknown> = {}) {
  const prNo = prNoFor(category);
  return {
    poMonth: "2026-11", prCategory: category, prNo, rfqNo: "RFQ-TAX", client: "Tax Client", department: "Process", domesticForeign: "Foreign",
    projectTitle: `Tax project ${TAG}`, workOrderStatus: "Received", projectStartDate: "2026-11-01", projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`, workOrderDate: "2026-11-01", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "PMO", ...extra,
  };
}

let admin: Actor;
async function createVia(category: string, extra: Record<string, unknown> = {}) {
  const res = await call(admin, "/projects", { method: "POST", body: projectBody(category, extra) });
  assert.equal(res.status, 201, `${category}: ${JSON.stringify(res.body)}`);
  created.projects.push(res.body.data.id);
  return res.body.data;
}
const patch = (id: string, body: Record<string, unknown>) => call(admin, `/projects/${id}`, { method: "PATCH", body });
const reload = async (id: string) => (await call(admin, `/projects/${id}`)).body.data;
const row = (id: string) => prisma.project.findUniqueOrThrow({ where: { id } });
const tax = (p: { taxApplicable: unknown; taxRatePercent: unknown }) => [p.taxApplicable, p.taxRatePercent === null ? null : Number(p.taxRatePercent)];

before(async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  process.env["COUNTRY_ACCESS_MODE"] = "off";
  for (const [name, currency] of Object.entries({ ...NON_INDIA, India: "INR" })) {
    assert.equal((await prisma.region.findUniqueOrThrow({ where: { name } })).defaultCurrency, currency, `fixture: ${name} currency (country_config_seed.sql)`);
  }
  admin = await makeUser("admin", "PMO Manager", ["Projects", "Add Project", "Approvals", "PR Request", "Invoices"]);
});

after(async () => {
  delete process.env["COUNTRY_ACCESS_MODE"];
  try {
    await prisma.pRRequest.deleteMany({ where: { id: { in: created.requests } } });
    const ids = (await prisma.project.findMany({ where: { prNo: { contains: TAG } }, select: { id: true } })).map((p) => p.id);
    await prisma.project.deleteMany({ where: { id: { in: ids } } });
    await prisma.authAuditLog.deleteMany({ where: { email: { contains: TAG } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    await closeServer();
  }
});

describe("which projects take Tax", () => {
  test("the PR Category reference says GST for India and TAX for every other country, Malaysia included", async () => {
    const res = await call(admin, "/projects/pr-category-countries");
    const modes = Object.fromEntries((res.body.data.items as { prCategory: string; taxMode: string }[]).map((i) => [i.prCategory, i.taxMode]));
    assert.deepEqual(modes, { India: "GST", ...Object.fromEntries(Object.keys(NON_INDIA).map((c) => [c, "TAX"])) });
  });

  test("a new project outside India starts Not Set (never 0%); India is GST with no Tax values", async () => {
    for (const category of Object.keys(NON_INDIA)) {
      const p = await createVia(category);
      assert.deepEqual([p.taxMode, p.taxApplicable, p.taxRatePercent, p.gstApplicable], ["TAX", null, null, false], category);
      assert.deepEqual(tax(await row(p.id)), [null, null], category);
    }
    const india = await createVia("India", { gstApplicable: true });
    assert.deepEqual([india.taxMode, india.taxApplicable, india.taxRatePercent, india.gstApplicable], ["GST", null, null, true]);
  });

  test("India refuses Tax values on create and update (GST untouched); explicit nulls are harmless", async () => {
    const body = projectBody("India", { taxApplicable: true, taxRatePercent: 5 });
    const refused = await call(admin, "/projects", { method: "POST", body });
    assert.equal(refused.status, 400);
    assert.match(refused.body.message, /apply only to projects outside India/);
    assert.equal(await prisma.project.count({ where: { prNo: body.prNo } }), 0, "nothing created");
    const p = await createVia("India", { gstApplicable: true, taxApplicable: null, taxRatePercent: null });
    for (const fields of [{ taxApplicable: false }, { taxRatePercent: 0 }, { taxApplicable: true, taxRatePercent: 5 }]) {
      assert.equal((await patch(p.id, fields)).status, 400, JSON.stringify(fields));
    }
    assert.equal((await patch(p.id, { taxApplicable: null, taxRatePercent: null, gstApplicable: false })).status, 200);
    assert.deepEqual([(await row(p.id)).gstApplicable, ...tax(await row(p.id))], [false, null, null]);
  });

  test("the currency never decides it: India priced in USD stays GST; Abu Dhabi priced in INR or USD stays TAX", async () => {
    const india = await createVia("India", { currency: "USD", currentExchangeRate: 95, contractExchangeRate: 95 });
    assert.equal(india.taxMode, "GST");
    assert.equal((await patch(india.id, { taxRatePercent: 5 })).status, 400);
    for (const currency of ["USD", "INR"]) {
      const p = await createVia("Abu Dhabi", { currency, currentExchangeRate: 3.67, contractExchangeRate: 3.67, taxApplicable: true, taxRatePercent: 5 });
      assert.deepEqual([p.taxMode, p.currency, p.regionalCurrency, p.taxApplicable, p.taxRatePercent], ["TAX", currency, "AED", true, 5]);
    }
  });

  test("a legacy project outside India (no regional currency) keeps GST and refuses Tax", async () => {
    const p = await createVia("Elixir Qatar");
    await prisma.project.update({ where: { id: p.id }, data: { regionalCurrency: null, currency: "USD", gstApplicable: true } });
    assert.equal((await reload(p.id)).taxMode, "GST");
    assert.equal((await patch(p.id, { taxApplicable: true, taxRatePercent: 5 })).status, 400);
    assert.equal((await patch(p.id, { projectTitle: `Tax legacy ${TAG}` })).status, 200);
    const saved = await row(p.id);
    assert.deepEqual([saved.gstApplicable, saved.regionalCurrency, ...tax(saved)], [true, null, null, null], "old values preserved");
  });
});

describe("saving, reopening and partial updates", () => {
  test("every preset and custom decimal is saved and read back exactly; 0% is not Not Set", async () => {
    const p = await createVia("Oman");
    for (const rate of [0, 2, 5, 10, 12, 18, 7.5, 3, 15, 20, 12.3456, 100]) {
      const res = await patch(p.id, { taxApplicable: true, taxRatePercent: rate });
      assert.equal(res.status, 200, `${rate}: ${JSON.stringify(res.body)}`);
      assert.deepEqual([res.body.data.taxRatePercent, (await reload(p.id)).taxRatePercent], [rate, rate]);
    }
  });

  test("Not Applicable keeps the rate and switching back restores it; unrelated saves change nothing; explicit null returns to Not Set", async () => {
    const p = await createVia("Abu Dhabi", { taxApplicable: true, taxRatePercent: 7.5 });
    assert.equal((await patch(p.id, { taxApplicable: false })).status, 200);
    assert.deepEqual(tax(await row(p.id)), [false, 7.5]);
    assert.equal((await patch(p.id, { projectTitle: `Tax renamed ${TAG}`, currency: "USD", currentExchangeRate: 3.67, contractExchangeRate: 3.67, gstApplicable: false })).status, 200);
    assert.deepEqual(tax(await row(p.id)), [false, 7.5], "a save without the Tax fields never touches them");
    assert.equal((await patch(p.id, { taxApplicable: true })).status, 200);
    const back = await reload(p.id);
    assert.deepEqual([back.taxApplicable, back.taxRatePercent], [true, 7.5]);
    assert.equal((await patch(p.id, { taxApplicable: null, taxRatePercent: null })).status, 200);
    assert.deepEqual(tax(await row(p.id)), [null, null]);
  });

  test("invalid values are refused and nothing changes; the database itself refuses a rate outside 0..100", async () => {
    const p = await createVia("Qatar", { taxApplicable: true, taxRatePercent: 5 });
    for (const bad of [{ taxRatePercent: -1 }, { taxRatePercent: 100.5 }, { taxRatePercent: "5" }, { taxRatePercent: "" }, { taxRatePercent: 7.12345 }, { taxApplicable: "yes" }]) {
      assert.equal((await patch(p.id, bad)).status, 400, JSON.stringify(bad));
    }
    assert.deepEqual(tax(await row(p.id)), [true, 5]);
    for (const bad of [101, -1]) await assert.rejects(prisma.project.update({ where: { id: p.id }, data: { taxRatePercent: bad } }), /taxRatePercent_check|check constraint/i);
  });

  test("with country access enforced, a user holding the country still saves Tax", async () => {
    const p = await createVia("Malaysia");
    process.env["COUNTRY_ACCESS_MODE"] = "enforce";
    try {
      const res = await patch(p.id, { prCategory: "Malaysia", taxApplicable: true, taxRatePercent: 10 });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(tax(await row(p.id)), [true, 10]);
    } finally {
      process.env["COUNTRY_ACCESS_MODE"] = "off";
    }
  });
});

describe("category changes, import and isolation", () => {
  test("moving a project to India clears its Tax setting; a Tax value sent with that move is refused", async () => {
    const p = await createVia("Qatar", { taxApplicable: true, taxRatePercent: 5 });
    const mixed = await patch(p.id, { prCategory: "India", prNo: prNoFor("India"), taxRatePercent: 5 });
    assert.equal(mixed.status, 400);
    assert.deepEqual(tax(await row(p.id)), [true, 5]);
    const moved = await patch(p.id, { prCategory: "India", prNo: prNoFor("India") });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.deepEqual([moved.body.data.taxMode, moved.body.data.taxApplicable, moved.body.data.taxRatePercent], ["GST", null, null]);
    assert.deepEqual(tax(await row(p.id)), [null, null]);
  });

  test("import: a Tax value on an India row rejects the whole file; rows outside India may carry it", async () => {
    const bad = [projectBody("Oman", { taxApplicable: true, taxRatePercent: 5 }), projectBody("India", { taxRatePercent: 5 })];
    const refused = await call(admin, "/projects/import", { method: "POST", body: { projects: bad } });
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
    assert.equal(await prisma.project.count({ where: { prNo: { in: bad.map((b) => b.prNo) } } }), 0);
    const good = [projectBody("Oman", { taxApplicable: true, taxRatePercent: 5 }), projectBody("India"), projectBody("FZI")];
    const res = await call(admin, "/projects/import", { method: "POST", body: { projects: good } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const by = Object.fromEntries((res.body.data.items as { prCategory: string; taxApplicable: boolean | null; taxRatePercent: number | null }[]).map((i) => [i.prCategory, [i.taxApplicable, i.taxRatePercent]]));
    assert.deepEqual(by, { Oman: [true, 5], India: [null, null], FZI: [null, null] });
  });

  test("Tax never changes quantities, the Work Order Value or payment milestones (still excluding Tax)", async () => {
    const p = await createVia("Abu Dhabi", { currency: "USD", currentExchangeRate: 3.67, contractExchangeRate: 3.67 });
    const line = await call(admin, `/projects/${p.id}/quantity`, { method: "POST", body: { description: "Study", woQty: 1, uom: "DAY", currency: "USD", unitRate: 10000, exchangeRate: 3.67 } });
    assert.equal(line.status, 201, JSON.stringify(line.body));
    const ms = await call(admin, `/projects/${p.id}/milestones`, { method: "POST", body: { milestoneName: "Advance", paymentPercentage: 50 } });
    assert.equal(ms.status, 201, JSON.stringify(ms.body));
    const snapshot = async () => ({
      wo: (await reload(p.id)).workOrderValueRegional,
      milestones: (await call(admin, `/projects/${p.id}/milestones`)).body.data,
      lines: await prisma.quantityItem.findMany({ where: { projectId: p.id } }),
    });
    const before_ = await snapshot();
    assert.equal(before_.wo, 36700);
    assert.equal((await patch(p.id, { taxApplicable: true, taxRatePercent: 18 })).status, 200);
    assert.deepEqual(await snapshot(), before_);
    assert.equal((await row(p.id)).gstApplicable, false);
  });
});

describe("PR Request", () => {
  test("a request outside India keeps its Tax setting through save, reopen and both approvals onto the Project; India refuses it", async () => {
    const accounts = await makeUser("accounts", "Accounts", ["Approvals"]);
    const india = await call(admin, "/pr-requests", { method: "POST", body: { projectData: projectBody("India", { taxApplicable: true, taxRatePercent: 5 }) } });
    assert.equal(india.status, 400, JSON.stringify(india.body));
    assert.match(india.body.message, /apply only to projects outside India/);

    const data = projectBody("Oman", { taxApplicable: true, taxRatePercent: 7.5 });
    const draft = await call(admin, "/pr-requests", { method: "POST", body: { projectData: data } });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    const id = draft.body.data.id as string;
    created.requests.push(id);
    const reopened = (await call(admin, `/pr-requests/${id}`)).body.data.projectData;
    assert.deepEqual([reopened.taxApplicable, reopened.taxRatePercent], [true, 7.5]);

    const changedToIndia = await call(admin, `/pr-requests/${id}`, { method: "PATCH", body: { projectData: { ...data, prCategory: "India", prNo: prNoFor("India") } } });
    assert.equal(changedToIndia.status, 400, "a request moved to India cannot keep Tax values");

    assert.equal((await call(admin, `/pr-requests/${id}`, { method: "PATCH", body: { projectData: { ...data, taxRatePercent: 12 } } })).status, 200);
    const send = await call(admin, `/pr-requests/${id}/send-to-accounts`, { method: "POST", body: { assignedAccountsApproverId: accounts.id, assignedPmoManagerId: admin.id } });
    assert.equal(send.status, 200, JSON.stringify(send.body));
    assert.equal((await call(accounts, `/pr-requests/${id}/accounts-approve`, { method: "POST", body: {} })).status, 200);
    const approve = await call(admin, `/pr-requests/${id}/pmo-approve`, { method: "POST", body: {} });
    assert.equal(approve.status, 200, JSON.stringify(approve.body));
    const project = await prisma.project.findFirstOrThrow({ where: { prNo: data.prNo } });
    assert.deepEqual([project.taxApplicable, Number(project.taxRatePercent), project.gstApplicable], [true, 12, false]);
    assert.equal((await reload(project.id)).taxMode, "TAX");
  });
});
