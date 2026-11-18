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
 * Global Multi-Country Phase 3 — regional currency vs transaction currency, end to end (route -> service -> database).
 * Uses the existing PR Category regions with their configured default currencies, tagged users and projects removed by id in `after`.
 */

const TAG = `cc3-${Date.now()}`;
const PASSWORD = "RegionalCurrency@123";
const EXPECTED_REGIONAL: Record<string, string> = {
  India: "INR",
  Malaysia: "MYR",
  Oman: "OMR",
  "Abu Dhabi": "AED",
  FZI: "AED",
  "Elixir Qatar": "QAR",
  Qatar: "QAR",
};

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[] };
const regionId = {} as Record<string, string>;

async function listen(): Promise<void> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

const setMode = (mode: "off" | "shadow" | "enforce") => {
  process.env["COUNTRY_ACCESS_MODE"] = mode;
};

interface Actor {
  id: string;
  token: string;
}

async function makeUser(label: string, categories: string[]): Promise<Actor> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } });
  const modules = await prisma.module.findMany({ where: { name: { in: ["Projects", "Add Project", "Invoices", "Dashboard"] } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `CC3 ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      moduleAccess: { create: modules.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: categories.map((c) => ({ regionId: regionId[c]! })) },
    },
  });
  created.users.push(user.id);
  return { id: user.id, token: signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: "PMO Manager" }) };
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
const prNoFor = (category: string, suffix = "") => {
  seq += 1;
  return `${PR_CATEGORY_PREFIX_MAP[category as keyof typeof PR_CATEGORY_PREFIX_MAP]}${TAG}-${seq}${suffix}`;
};

function projectBody(category: string, prNo = prNoFor(category)) {
  return {
    poMonth: "2026-11",
    prCategory: category,
    prNo,
    client: "CC3 Client",
    department: "Process",
    domesticForeign: "Foreign",
    projectTitle: `CC3 project ${TAG}`,
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01").toISOString(),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01").toISOString(),
    rfqNo: "RFQ-CC3",
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
  };
}

async function createProjectVia(actor: Actor, category: string) {
  const res = await call(actor, "/projects", { method: "POST", body: projectBody(category) });
  assert.equal(res.status, 201, `${category}: ${JSON.stringify(res.body)}`);
  created.projects.push(res.body.data.id);
  return res.body.data as { id: string; prNo: string; regionalCurrency: string | null };
}

const lineBody = (over: Record<string, unknown> = {}) => ({ description: "Study", woQty: 1, uom: "DAY", currency: "USD", unitRate: 9600, exchangeRate: 1, ...over });
const addLine = (actor: Actor, projectId: string, over: Record<string, unknown> = {}) =>
  call(actor, `/projects/${projectId}/quantity`, { method: "POST", body: lineBody(over) });
const getProject = async (actor: Actor, id: string) => (await call(actor, `/projects/${id}`)).body.data;

let admin: Actor;

before(async () => {
  await listen();
  setMode("off");
  const regions = await prisma.region.findMany({ where: { name: { in: Object.keys(EXPECTED_REGIONAL) } } });
  for (const r of regions) regionId[r.name] = r.id;
  for (const c of Object.keys(EXPECTED_REGIONAL)) {
    assert.ok(regionId[c], `fixture: region "${c}" must exist`);
    const row = regions.find((r) => r.name === c)!;
    assert.equal(row.defaultCurrency, EXPECTED_REGIONAL[c], `fixture: region "${c}" must carry its configured default currency (scratch seed)`);
  }
  admin = await makeUser("all", Object.keys(EXPECTED_REGIONAL));
  // Raising an invoice also needs the "Raise Invoice" approval permission (unchanged by Phase 3).
  const raiseInvoice = await prisma.approvalType.findUniqueOrThrow({ where: { name: "Raise Invoice" } });
  await prisma.userApprovalPermission.create({ data: { userId: admin.id, approvalTypeId: raiseInvoice.id } });
});

after(async () => {
  setMode("off");
  delete process.env["COUNTRY_ACCESS_MODE"];
  try {
    const ids = (await prisma.project.findMany({ where: { OR: [{ prNo: { contains: TAG } }, { id: { in: created.projects } }] }, select: { id: true } })).map((p) => p.id);
    // An invoice line restricts deleting its quantity item, so the invoice rows these tests created go first.
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: ids } } } });
    await prisma.invoiceNumber.deleteMany({ where: { projectId: { in: ids } } });
    await prisma.project.deleteMany({ where: { id: { in: ids } } });
    await prisma.authAuditLog.deleteMany({ where: { email: { contains: TAG } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    await closeServer();
  }
});

describe("regional currency is set from the project's country, once", () => {
  test("each country's project takes its confirmed regional currency (not the creator's, the selector's or the PR prefix)", async () => {
    for (const [category, currency] of Object.entries(EXPECTED_REGIONAL)) {
      const p = await createProjectVia(admin, category);
      assert.equal(p.regionalCurrency, currency, `${category} -> ${currency}`);
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).regionalCurrency, currency);
    }
  });

  test("the PR Category reference carries each country's default currency", async () => {
    const res = await call(admin, "/projects/pr-category-countries");
    const by = Object.fromEntries((res.body.data.items as { prCategory: string; country: { defaultCurrency: string | null } }[]).map((i) => [i.prCategory, i.country.defaultCurrency]));
    assert.deepEqual(by, EXPECTED_REGIONAL);
  });

  test("a bulk import stamps each row with its own country's regional currency, in any order", async () => {
    const cats = ["Qatar", "Malaysia", "India", "Oman", "FZI"];
    const rows = cats.map((c) => projectBody(c));
    const res = await call(admin, "/projects/import", { method: "POST", body: { projects: rows } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    for (const item of res.body.data.items as { id: string; prNo: string; regionalCurrency: string | null }[]) {
      created.projects.push(item.id);
      const category = cats[rows.findIndex((r) => r.prNo === item.prNo)]!;
      assert.equal(item.regionalCurrency, EXPECTED_REGIONAL[category], category);
    }
  });

  test("once quantities are priced the regional currency is pinned: a category change to a country with another currency is refused, one with the same currency is allowed", async () => {
    const qatar = await createProjectVia(admin, "Qatar");
    assert.equal((await addLine(admin, qatar.id, { exchangeRate: 3.64 })).status, 201);
    const refused = await call(admin, `/projects/${qatar.id}`, { method: "PATCH", body: { prCategory: "Oman", prNo: prNoFor("Oman") } });
    assert.equal(refused.status, 409);
    assert.match(refused.body.message, /regional currency \(QAR\) is fixed once quantities are priced/);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: qatar.id } })).regionalCurrency, "QAR");
    const same = await call(admin, `/projects/${qatar.id}`, { method: "PATCH", body: { prCategory: "Elixir Qatar", prNo: prNoFor("Elixir Qatar") } });
    assert.equal(same.status, 200, JSON.stringify(same.body));
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: qatar.id } })).regionalCurrency, "QAR", "same currency: never rewritten");
  });

  test("while nothing is priced yet the regional currency follows the new country, exactly as the country does (the long-standing re-categorising behaviour)", async () => {
    const p = await createProjectVia(admin, "Qatar");
    const moved = await call(admin, `/projects/${p.id}`, { method: "PATCH", body: { prCategory: "Oman", prNo: prNoFor("Oman") } });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    const row = await prisma.project.findUniqueOrThrow({ where: { id: p.id } });
    assert.equal(row.regionId, regionId["Oman"]);
    assert.equal(row.regionalCurrency, "OMR");
    assert.equal(row.currency, "OMR", "it was still in its old regional currency at rate 1, so it starts in the new one");
    assert.equal(row.currentExchangeRate, 1);
  });
});

describe("the regional amount is calculated from the manually entered rate (1 <transaction> = X <regional>)", () => {
  test("India: USD 9,600 at 1 USD = 95 INR is INR 9,12,000 in the work order value", async () => {
    const p = await createProjectVia(admin, "India");
    const res = await addLine(admin, p.id, { exchangeRate: 95 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.woValue, 912000);
    assert.equal(res.body.data.woValueRegional, 912000);
    const dto = await getProject(admin, p.id);
    assert.equal(dto.workOrderValueINR, 912000);
    assert.equal(dto.workOrderValueRegional, 912000);
  });

  test("Malaysia: USD 9,600 at 1 USD = 4.50 MYR is MYR 43,200, original amount preserved, INR columns 0", async () => {
    const p = await createProjectVia(admin, "Malaysia");
    const res = await addLine(admin, p.id, { exchangeRate: 4.5 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const d = res.body.data;
    assert.equal(d.currency, "USD");
    assert.equal(d.unitRate, 9600, "the original transaction amount is kept");
    assert.equal(d.exchangeRate, 4.5);
    assert.equal(d.unitRateRegional, 43200);
    assert.equal(d.woValueRegional, 43200);
    assert.equal(d.unitRateINR, 0);
    assert.equal(d.woValue, 0, "no MYR amount is ever written to an INR-named column");
    const dto = await getProject(admin, p.id);
    assert.equal(dto.workOrderValueRegional, 43200);
    assert.equal(dto.workOrderValueINR, 0);
    assert.equal(dto.pendingDueRegional, 43200);
  });

  test("Oman with a 3-decimal currency, Abu Dhabi, FZE and Qatar each convert at their own rate", async () => {
    const cases: [string, string, number, number][] = [
      ["Oman", "USD", 0.385, 3696],
      ["Abu Dhabi", "USD", 3.67, 35232],
      ["FZI", "USD", 3.67, 35232],
      ["Qatar", "USD", 3.64, 34944],
      ["Oman", "QAR", 0.1056, 1013.76],
    ];
    for (const [category, currency, rate, expected] of cases) {
      const p = await createProjectVia(admin, category);
      const res = await addLine(admin, p.id, { currency, exchangeRate: rate });
      assert.equal(res.status, 201, `${category}/${currency}: ${JSON.stringify(res.body)}`);
      assert.equal(res.body.data.woValueRegional, expected, `${category} ${currency}`);
    }
  });

  test("the regional currency is always rate 1 and read-only on the server: a sent rate is ignored", async () => {
    const p = await createProjectVia(admin, "Oman");
    const res = await addLine(admin, p.id, { currency: "OMR", unitRate: 500, exchangeRate: 83 });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.exchangeRate, 1);
    assert.equal(res.body.data.woValueRegional, 500);
  });

  test("a missing, zero or negative rate, and an unsupported currency, are refused", async () => {
    const p = await createProjectVia(admin, "Oman");
    for (const rate of [0, -2]) assert.equal((await addLine(admin, p.id, { exchangeRate: rate })).status, 400, `rate ${rate}`);
    const one = await addLine(admin, p.id, { exchangeRate: 1 });
    assert.equal(one.status, 400, "USD at exactly 1 OMR is refused");
    assert.match(one.body.message, /exactly 1/);
    assert.equal((await addLine(admin, p.id, { currency: "INR", exchangeRate: 1 })).status, 400, "the import template's INR at rate 1 on an Oman project");
    assert.equal((await addLine(admin, p.id, { currency: "XYZ", exchangeRate: 2 })).status, 400);
  });

  test("editing the rate or the currency recalculates the line; no stale rate survives a switch to the regional currency", async () => {
    const p = await createProjectVia(admin, "Malaysia");
    const line = (await addLine(admin, p.id, { exchangeRate: 4.5 })).body.data;
    const edited = await call(admin, `/quantity/${line.id}`, { method: "PATCH", body: { exchangeRate: 4.6 } });
    assert.equal(edited.body.data.woValueRegional, 44160);
    const toRegional = await call(admin, `/quantity/${line.id}`, { method: "PATCH", body: { currency: "MYR", unitRate: 1000 } });
    assert.equal(toRegional.body.data.exchangeRate, 1, "the 4.6 does not carry over");
    assert.equal(toRegional.body.data.woValueRegional, 1000);
  });

  test("payment milestone amounts are in the project's regional currency", async () => {
    const p = await createProjectVia(admin, "Oman");
    await addLine(admin, p.id, { exchangeRate: 0.385 });
    const m = await call(admin, `/projects/${p.id}/milestones`, { method: "POST", body: { milestoneName: "Advance", paymentPercentage: 50, dueDate: "2026-12-01" } });
    assert.equal(m.status, 201, JSON.stringify(m.body));
    assert.equal(m.body.data.amount, 1848, "50% of OMR 3,696");
  });
});

describe("legacy and India projects are unchanged", () => {
  test("a legacy project (no stored regional currency) keeps the original behaviour, including USD accepted at rate 1", async () => {
    const legacy = await prisma.project.create({
      data: {
        poMonth: "2026-11",
        prCategory: "Oman",
        prNo: prNoFor("Oman", "-legacy"),
        client: "CC3 Legacy",
        department: "Process",
        domesticForeign: "Foreign",
        projectTitle: `CC3 legacy ${TAG}`,
        workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"),
        projectStatus: "Active",
        regionId: regionId["Oman"]!,
        regionalCurrency: null,
      },
    });
    created.projects.push(legacy.id);
    const res = await addLine(admin, legacy.id, { exchangeRate: 1 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.woValue, 9600, "the original formula: INR value = unit rate x rate");
    assert.equal(res.body.data.unitRateINR, 9600);
    assert.equal(res.body.data.woValueRegional, 9600, "regional = INR for a legacy project");
    const dto = await getProject(admin, legacy.id);
    assert.equal(dto.regionalCurrency, null);
    assert.equal(dto.workOrderValueINR, 9600);
    assert.equal(dto.workOrderValueRegional, 9600);
  });

  test("an INR line on an India project is the unit rate itself, and the INR columns are populated", async () => {
    const p = await createProjectVia(admin, "India");
    const res = await addLine(admin, p.id, { currency: "INR", unitRate: 1234.5, woQty: 7, exchangeRate: 1 });
    assert.equal(res.body.data.woValue, 8641.5);
    assert.equal(res.body.data.unitRateINR, 1234.5);
  });
});

describe("invoicing a non-INR regional project is refused (never produces wrong INR amounts)", () => {
  const invoice = (itemId: string, no: string) =>
    call(admin, `/quantity/${itemId}/invoice-lines`, {
      method: "POST",
      body: { invoiceNo: no, invoiceDate: new Date("2026-11-20").toISOString(), quantityBilled: 1, invoiceAmountINR: 1000 },
    });

  test("an Oman project refuses invoicing with a clear 409, so no wrong INR figure is ever created", async () => {
    const p = await createProjectVia(admin, "Oman");
    const line = (await addLine(admin, p.id, { exchangeRate: 0.385 })).body.data;
    const res = await invoice(line.id, `INV-${TAG}-OM`);
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.match(String(res.body.message), /not available yet for a project whose currency is OMR/);
  });

  test("an India project is not blocked by the guard", async () => {
    const p = await createProjectVia(admin, "India");
    const line = (await addLine(admin, p.id, { currency: "INR", unitRate: 5000, exchangeRate: 1 })).body.data;
    const res = await invoice(line.id, `INV-${TAG}-IN`);
    assert.notEqual(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });
});

describe("currency never decides access (country access enforced)", () => {
  test("a user without the Oman country cannot price lines on an Oman project, and holding a currency grants nothing", async () => {
    const omanProject = await createProjectVia(admin, "Oman");
    const indiaOnly = await makeUser("india", ["India"]);
    setMode("enforce");
    try {
      const res = await addLine(indiaOnly, omanProject.id, { exchangeRate: 0.385 });
      assert.equal(res.status, 403);
      const create = await call(indiaOnly, "/projects", { method: "POST", body: projectBody("Oman") });
      assert.equal(create.status, 403);
      // The same user works normally in their own country, with a foreign transaction currency.
      const own = await call(indiaOnly, "/projects", { method: "POST", body: projectBody("India") });
      assert.equal(own.status, 201, JSON.stringify(own.body));
      created.projects.push(own.body.data.id);
      assert.equal((await addLine(indiaOnly, own.body.data.id, { exchangeRate: 95 })).status, 201);
    } finally {
      setMode("off");
    }
  });
});

describe("a new project starts in its regional currency (never the old INR default)", () => {
  const withoutCurrency = (category: string) => {
    const { ...body } = projectBody(category) as Record<string, unknown>;
    delete body["currency"];
    delete body["currentExchangeRate"];
    delete body["contractExchangeRate"];
    return body;
  };

  test("a project created without choosing a currency takes its country's regional currency at rate 1", async () => {
    for (const [category, currency] of Object.entries(EXPECTED_REGIONAL)) {
      const res = await call(admin, "/projects", { method: "POST", body: withoutCurrency(category) });
      assert.equal(res.status, 201, `${category}: ${JSON.stringify(res.body)}`);
      created.projects.push(res.body.data.id);
      assert.equal(res.body.data.currency, currency, `${category} starts in ${currency}`);
      assert.equal(res.body.data.currentExchangeRate, 1);
      assert.equal(res.body.data.contractExchangeRate, 1);
    }
  });

  test("a currency the caller really chose is left alone", async () => {
    const body = { ...projectBody("Oman"), currency: "USD", currentExchangeRate: 0.385, contractExchangeRate: 0.385 };
    const res = await call(admin, "/projects", { method: "POST", body });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    created.projects.push(res.body.data.id);
    assert.equal(res.body.data.currency, "USD");
    assert.equal(res.body.data.currentExchangeRate, 0.385);
  });

  test("a bulk import row with no chosen currency also starts in its own country's regional currency", async () => {
    const cats = ["Malaysia", "Oman", "India"];
    const rows = cats.map((c) => withoutCurrency(c));
    const res = await call(admin, "/projects/import", { method: "POST", body: { projects: rows } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    for (const item of res.body.data.items as { id: string; prNo: string; currency: string }[]) {
      created.projects.push(item.id);
      const category = cats[rows.findIndex((r) => r["prNo"] === item.prNo)]!;
      assert.equal(item.currency, EXPECTED_REGIONAL[category]);
    }
  });
});

describe("the dashboard totals each currency separately and never adds them together", () => {
  test("an Oman-only view is in OMR; a view that includes India stays in INR with Oman listed separately", async () => {
    // An earlier test left a LEGACY Oman project (no stored regional currency), which is INR by design; set it aside so this view is purely Phase 3.
    await prisma.project.updateMany({ where: { prNo: { contains: TAG }, regionalCurrency: null }, data: { isDeleted: true } });
    const omanOnly = await makeUser("dash-oman", ["Oman"]);
    const indiaOman = await makeUser("dash-both", ["India", "Oman"]);
    const oman = await createProjectVia(admin, "Oman");
    await addLine(admin, oman.id, { exchangeRate: 0.385 });
    const india = await createProjectVia(admin, "India");
    await addLine(admin, india.id, { currency: "INR", unitRate: 5000, exchangeRate: 1 });
    const omanWhere = { regionId: regionId["Oman"]!, isDeleted: false, regionalCurrency: "OMR" };
    const omanSum = (await prisma.quantityItem.aggregate({ where: { project: omanWhere }, _sum: { woValueRegional: true } }))._sum.woValueRegional ?? 0;
    const omanProjects = await prisma.project.count({ where: omanWhere });
    assert.ok(omanSum >= 3696, "this test's own Oman line is included");
    setMode("enforce");
    try {
      const o = (await call(omanOnly, "/dashboard/summary")).body.data;
      assert.equal(o.kpiCurrency, "OMR");
      assert.equal(o.kpis.totalWOValue, omanSum, "the OMR total is the sum of the Oman projects in OMR");
      assert.deepEqual(o.otherCurrencies, []);

      const both = (await call(indiaOman, "/dashboard/summary")).body.data;
      assert.equal(both.kpiCurrency, "INR", "INR stays the headline whenever INR projects are in view, so the India dashboard reads as before");
      const indiaWo = await prisma.quantityItem.aggregate({ where: { project: { regionId: regionId["India"]!, isDeleted: false, OR: [{ regionalCurrency: null }, { regionalCurrency: "INR" }] } }, _sum: { woValue: true } });
      assert.equal(both.kpis.totalWOValue, indiaWo._sum.woValue ?? 0, "the INR total contains only INR projects");
      assert.ok(!String(both.kpis.totalWOValue).includes("3696"));
      const omr = both.otherCurrencies.find((c: { currency: string }) => c.currency === "OMR");
      assert.ok(omr, "Oman is listed separately");
      assert.equal(omr.totalWOValue, omanSum);
      assert.equal(omr.totalProjects, omanProjects);
    } finally {
      setMode("off");
    }
  });
});

describe("the dashboard panels and the expense import carry each project's currency", () => {
  test("Recent Projects carry the project's own currency and value; Team Leads and Top Clients are in the headline currency", async () => {
    const omanOnly = await makeUser("dash-ctx", ["Oman"]);
    const oman = await createProjectVia(admin, "Oman");
    await addLine(admin, oman.id, { exchangeRate: 0.385 });
    setMode("enforce");
    try {
      const d = (await call(omanOnly, "/dashboard/summary")).body.data;
      const recent = (d.recentProjects as { id: string; workOrderValue: number; currency: string; workOrderValueINR: number }[]).find((r) => r.id === oman.id);
      assert.ok(recent, "the new Oman project is among the recent ones");
      assert.equal(recent.currency, "OMR");
      assert.equal(recent.workOrderValue, 3696);
      assert.equal(recent.workOrderValueINR, 0, "the INR-named value stays INR (0 here by design)");
      const clients = d.topClients as { client: string; workOrderValue: number }[];
      assert.ok(clients.every((c) => c.workOrderValue >= 0));
      assert.ok(clients.some((c) => c.workOrderValue >= 3696), "Top Clients are totalled in OMR for this view");
    } finally {
      setMode("off");
    }
  });

  test("formatCurrencyCompact: INR is unchanged; other currencies use their own prefix and never a rupee sign", async () => {
    const { formatCurrencyCompact } = await import("../dashboard/dashboard.formulas.js");
    assert.equal(formatCurrencyCompact(0), "₹ 0");
    assert.equal(formatCurrencyCompact(250000), "₹ 2.50 L");
    assert.equal(formatCurrencyCompact(25000000), "₹ 2.50 Cr");
    assert.equal(formatCurrencyCompact(43200, "MYR"), "RM 43.2K");
    assert.equal(formatCurrencyCompact(3696, "OMR"), "OMR 3.7K");
    assert.equal(formatCurrencyCompact(35232, "AED"), "AED 35.23K");
    assert.equal(formatCurrencyCompact(500, "QAR"), "QAR 500");
    assert.equal(formatCurrencyCompact(0, "OMR"), "OMR 0");
    assert.equal(formatCurrencyCompact(2_500_000, "AED"), "AED 2.5M");
    assert.ok(!formatCurrencyCompact(43200, "MYR").includes("₹"));
  });

  test("the expense import repository reports each matched project's regional currency", async () => {
    const { findActiveProjectsByNormalizedPrNos } = await import("../expenses/import/expenseImport.repository.js");
    const oman = await createProjectVia(admin, "Oman");
    const rows = await findActiveProjectsByNormalizedPrNos();
    assert.equal(rows.find((r) => r.id === oman.id)?.regionalCurrency, "OMR");
  });
});
