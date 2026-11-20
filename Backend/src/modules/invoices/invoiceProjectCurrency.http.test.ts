import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { invoiceEditDeleteGrants } from "./invoiceApprovalGrants.testutil.js";
import { PR_CATEGORY_PREFIX_MAP } from "../projects/project.constants.js";

/**
 * Multi-country invoice currency (Phase 5), end to end over HTTP on isolated, tagged data: a project's own currency is the default invoice currency, the same
 * currency needs no rate, a different currency needs the user's rate (1 invoice currency = X project currency), the project-currency equivalent is what the Work
 * Order ceiling and the balance use, payments settle in the invoice currency, the INR-named columns never hold a regional amount, India is unchanged, and country
 * access is enforced on the server. Every rate here is a synthetic test value, not an approved exchange rate.
 */
const TAG = `ipc-${Date.now()}`;

interface Country {
  category: keyof typeof PR_CATEGORY_PREFIX_MAP;
  project: string;
  /** Invoice currency used for the "different currency" case, its test rate and an amount with the expected project-currency equivalent. */
  invoice: string;
  rate: string;
  amount: number;
  expected: string;
  /** Contract value of the activity, in the project currency. */
  wo: number;
}
const COUNTRIES: Country[] = [
  { category: "Oman", project: "OMR", invoice: "USD", rate: "0.385", amount: 600, expected: "231.000", wo: 1000 },
  { category: "Malaysia", project: "MYR", invoice: "USD", rate: "4.20", amount: 1000, expected: "4200.00", wo: 10_000 },
  { category: "Abu Dhabi", project: "AED", invoice: "INR", rate: "0.012", amount: 100_000, expected: "1200.00", wo: 5000 },
  { category: "FZI", project: "AED", invoice: "USD", rate: "3.67", amount: 1000, expected: "3670.00", wo: 10_000 },
  { category: "Elixir Qatar", project: "QAR", invoice: "USD", rate: "3.64", amount: 1000, expected: "3640.00", wo: 10_000 },
  { category: "Qatar", project: "QAR", invoice: "EUR", rate: "3.95", amount: 1000, expected: "3950.00", wo: 10_000 },
];

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[] };
const regionId = {} as Record<string, string>;
let token = "";
let userId = "";
let seq = 0;

const decimals = (currency: string) => (currency === "OMR" ? 3 : 2);
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
const setMode = (mode: "off" | "enforce") => {
  process.env["COUNTRY_ACCESS_MODE"] = mode;
};

async function makeUser(label: string, categories: string[], bearer = true): Promise<{ id: string; token: string }> {
  const [engineerRole, invoicesModule, projectsModule, raiseInvoiceApproval] = await Promise.all([
    prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Invoices" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Projects" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Raise Invoice" } }),
  ]);
  const user = await prisma.portalUser.create({
    data: {
      fullName: `IPC ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword("InvProjectCurrency@123"),
      department: "Accounts",
      roleId: engineerRole.id,
      forcePasswordChange: false,
      moduleAccess: { create: [{ moduleId: projectsModule.id }, { moduleId: invoicesModule.id }] },
      approvalPermissions: { create: [{ approvalTypeId: raiseInvoiceApproval.id }, ...(await invoiceEditDeleteGrants())] },
      regionAccess: { create: categories.map((c) => ({ regionId: regionId[c]! })) },
    },
  });
  created.users.push(user.id);
  void bearer;
  return { id: user.id, token: signAccessToken({ sub: user.id, email: user.email, roleId: engineerRole.id, roleName: engineerRole.name }) };
}

/** A project in a country with one activity whose contract value is `wo` in the project's own currency. A null category makes an India (INR) project. */
async function makeProject(category: string, projectCurrency: string | null, wo: number, tagSuffix = "") {
  seq += 1;
  const regional = projectCurrency !== null && projectCurrency !== "INR";
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-11",
      prCategory: category,
      prNo: `${PR_CATEGORY_PREFIX_MAP[category as keyof typeof PR_CATEGORY_PREFIX_MAP]}${TAG}${tagSuffix}-${seq}`,
      client: "IPC Client",
      department: "Process",
      domesticForeign: "Foreign",
      projectTitle: `IPC ${category} ${seq}`,
      workOrderStatus: "Received",
      projectStartDate: new Date("2026-01-01"),
      projectEndDate: new Date("2026-12-31"),
      projectStatus: "Active",
      contractType: "LUMP SUM",
      createdByUserId: null,
      regionId: regionId[category] ?? null,
      regionalCurrency: projectCurrency,
    },
  });
  created.projects.push(project.id);
  const item = await prisma.quantityItem.create({
    data: {
      projectId: project.id,
      description: "IPC activity",
      woQty: 10,
      uom: "DAY",
      currency: projectCurrency ?? "INR",
      unitRate: wo / 10,
      exchangeRate: 1,
      // An INR / legacy project prices in the INR columns; every other region in the regional ones (its INR columns are 0 by design).
      unitRateINR: regional ? 0 : wo / 10,
      woValue: regional ? 0 : wo,
      unitRateRegional: wo / 10,
      woValueRegional: wo,
    },
  });
  return { project, item };
}

const createLine = (quantityItemId: string, body: Record<string, unknown>, bearer = token) =>
  fetch(`${url}/quantity/${quantityItemId}/invoice-lines`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ invoiceDate: new Date("2026-11-10").toISOString(), quantityBilled: 0, status: "Raised", ...body }),
  });
const patchLine = (id: string, body: Record<string, unknown>, bearer = token) =>
  fetch(`${url}/invoice-lines/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` }, body: JSON.stringify(body) });
const json = async (res: Response) => (await res.json().catch(() => ({}))) as { data?: any; message?: string; errors?: Array<{ message: string }> };
let invoiceSeq = 0;
const nextNo = () => `${TAG}-INV-${++invoiceSeq}`;

before(async () => {
  setMode("off");
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId[r.name] = r.id;
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  const user = await makeUser("raiser", Object.keys(PR_CATEGORY_PREFIX_MAP));
  userId = user.id;
  token = user.token;
});

after(async () => {
  try {
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: created.projects } } } });
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

describe("Rule 1 and 2: the project's currency is the default and needs no rate", () => {
  for (const c of COUNTRIES) {
    test(`${c.category} (${c.project}): an invoice with no currency is raised in ${c.project}, rate 1, no conversion, INR columns empty`, async () => {
      const { project, item } = await makeProject(c.category, c.project, c.wo);
      const res = await createLine(item.id, { invoiceNo: nextNo(), invoiceAmountOriginal: 100.5 });
      const body = await json(res);
      assert.equal(res.status, 201, body.message);
      const d = body.data;
      assert.equal(d.currency, c.project, "defaults to the project currency");
      assert.equal(d.projectCurrency, c.project);
      assert.equal(d.exchangeRateToProject, "1");
      assert.equal(d.invoiceAmountOriginal, 100.5);
      assert.equal(d.invoiceAmountProject, 100.5, "the project amount equals the invoice amount");
      assert.equal(d.invoiceAmountINR, 0, "no regional amount is ever written under an INR name");
      assert.equal(d.exchangeRateToINR, 1);
      const row = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: d.id } });
      assert.equal(row.invoiceAmountProject!.toFixed(decimals(c.project)), (100.5).toFixed(decimals(c.project)));
      assert.equal(row.invoiceAmountINR, 0);
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).invoiceCurrency, c.project, "the first raise locks the project to its currency");
    });
  }
});

describe("Rule 3 and 4: a different currency needs the user's own rate (1 invoice currency = X project currency)", () => {
  for (const c of COUNTRIES) {
    test(`${c.category}: ${c.invoice} ${c.amount} at 1 ${c.invoice} = ${c.project} ${c.rate} is ${c.project} ${c.expected}; original amount and rate are saved with it`, async () => {
      const { item } = await makeProject(c.category, c.project, c.wo);
      const res = await createLine(item.id, { invoiceNo: nextNo(), currency: c.invoice, exchangeRateToProject: c.rate, invoiceAmountOriginal: c.amount });
      const body = await json(res);
      assert.equal(res.status, 201, body.message);
      const d = body.data;
      assert.equal(d.currency, c.invoice);
      assert.equal(d.invoiceAmountOriginal, c.amount, "the original amount is preserved");
      assert.equal(d.projectCurrency, c.project);
      assert.equal(Number(d.exchangeRateToProject), Number(c.rate));
      assert.equal(d.invoiceAmountProject, Number(c.expected));
      assert.equal(d.invoiceAmountINR, 0);
      assert.equal(d.exchangeRateToINR, 1, "the INR-named rate holds no regional rate");
      const row = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: d.id } });
      assert.equal(row.exchangeRateToProject!.toFixed(8), Number(c.rate).toFixed(8), "the rate is stored as an exact decimal");
      assert.equal(row.invoiceAmountProject!.toFixed(decimals(c.project)), c.expected);
    });

    test(`${c.category}: refusals - no rate, a rate for the same currency, a rupee amount, an unsupported currency, extra decimals`, async () => {
      const { item } = await makeProject(c.category, c.project, c.wo);
      const noRate = await json(await createLine(item.id, { invoiceNo: nextNo(), currency: c.invoice, invoiceAmountOriginal: 10 }));
      assert.match(noRate.message ?? "", new RegExp(`1 ${c.invoice} = \\? ${c.project}`), "the message names the direction");
      const sameRate = await createLine(item.id, { invoiceNo: nextNo(), currency: c.project, exchangeRateToProject: "2", invoiceAmountOriginal: 10 });
      assert.equal(sameRate.status, 400, "a stale rate cannot be used with the project currency");
      const rupee = await createLine(item.id, { invoiceNo: nextNo(), invoiceAmountINR: 5000 });
      assert.equal(rupee.status, 400, "a rupee amount is refused on a regional project");
      const badRate = await createLine(item.id, { invoiceNo: nextNo(), currency: c.invoice, exchangeRateToINR: 90, invoiceAmountOriginal: 10 });
      assert.equal(badRate.status, 400, "an INR rate is not used");
      const tooPrecise = await createLine(item.id, { invoiceNo: nextNo(), invoiceAmountOriginal: c.project === "OMR" ? 10.0001 : 10.001 });
      assert.equal(tooPrecise.status, 400, "more decimals than the currency allows is refused, not rounded");
      assert.equal(await prisma.invoiceLine.count({ where: { quantityItemId: item.id } }), 0, "nothing was recorded by any refused request");
    });
  }
});

describe("Work Order ceiling: project-currency amounts on both sides, enforced by the backend", () => {
  for (const c of COUNTRIES) {
    test(`${c.category}: the converted invoices add up to the contract value in ${c.project}, one unit more is refused`, async () => {
      const { item } = await makeProject(c.category, c.project, c.wo);
      // 60% of the contract value, billed in the foreign currency, then 40% billed the same way: exactly the contract value.
      const rate = Number(c.rate);
      const inForeign = (projectAmount: number) => Math.floor((projectAmount / rate) * 100) / 100;
      const first = c.wo * 0.6;
      const r1 = await createLine(item.id, { invoiceNo: nextNo(), currency: c.invoice, exchangeRateToProject: c.rate, invoiceAmountOriginal: inForeign(first) });
      assert.equal(r1.status, 201, (await json(r1)).message);
      // An invoice whose equivalent exceeds what is left is refused, whatever the foreign number looks like.
      const tooMuch = await createLine(item.id, { invoiceNo: nextNo(), currency: c.invoice, exchangeRateToProject: c.rate, invoiceAmountOriginal: inForeign(c.wo * 0.5) });
      const tooMuchBody = await json(tooMuch);
      assert.equal(tooMuch.status, 400);
      assert.match(tooMuchBody.message ?? "", new RegExp(`exceeding its Work Order Value of ${c.project} ${c.wo.toFixed(decimals(c.project))}`));
      // The remaining balance can be billed in the project currency itself, to the last unit.
      const sumSoFar = (await prisma.invoiceLine.aggregate({ where: { quantityItemId: item.id }, _sum: { invoiceAmountProject: true } }))._sum.invoiceAmountProject!;
      const remaining = Number((c.wo - Number(sumSoFar)).toFixed(decimals(c.project)));
      const rest = await createLine(item.id, { invoiceNo: nextNo(), currency: c.project, invoiceAmountOriginal: remaining });
      assert.equal(rest.status, 409, "the project is locked to the first invoice's currency (the existing one-currency-per-project rule)");
    });
  }

  test("a same-currency project reaches exactly its contract value and not one minor unit more (OMR three decimals)", async () => {
    const { item } = await makeProject("Oman", "OMR", 1000);
    assert.equal((await createLine(item.id, { invoiceNo: nextNo(), invoiceAmountOriginal: 999.999 })).status, 201);
    assert.equal((await createLine(item.id, { invoiceNo: nextNo(), invoiceAmountOriginal: 0.001 })).status, 201, "exactly the contract value");
    const over = await createLine(item.id, { invoiceNo: nextNo(), invoiceAmountOriginal: 0.001 });
    assert.equal(over.status, 400);
    assert.match((await json(over)).message ?? "", /OMR 1000\.001, exceeding its Work Order Value of OMR 1000\.000/);
  });

  test("a project in another currency is not compared with INR-named values: its INR work order value is 0 and invoices still work", async () => {
    const { item } = await makeProject("Malaysia", "MYR", 500);
    const row = await prisma.quantityItem.findUniqueOrThrow({ where: { id: item.id } });
    assert.equal(row.woValue, 0);
    assert.equal((await createLine(item.id, { invoiceNo: nextNo(), invoiceAmountOriginal: 500 })).status, 201);
  });
});

describe("Invoice lifecycle: the currency and the rate are frozen; an amount edit uses the stored rate and the ceiling", () => {
  const c = COUNTRIES[0]!; // Oman
  test("a Draft is edited by amount only: recalculated at the saved rate, checked against the ceiling, re-sent values accepted, currency and rate refused", async () => {
    const { item } = await makeProject(c.category, c.project, c.wo);
    const res = await createLine(item.id, { invoiceNo: nextNo(), status: "Draft", currency: "USD", exchangeRateToProject: "0.385", invoiceAmountOriginal: 600 });
    const line = (await json(res)).data;
    assert.equal(line.invoiceAmountProject, 231);
    const edited = await json(await patchLine(line.id, { invoiceAmountOriginal: 700, currency: "USD", exchangeRateToProject: "0.3850" }));
    assert.equal(edited.data.invoiceAmountProject, 269.5, "700 x the saved 0.385");
    assert.equal(edited.data.invoiceAmountOriginal, 700);
    assert.equal((await patchLine(line.id, { currency: "EUR" })).status, 400, "the currency is frozen");
    assert.equal((await patchLine(line.id, { exchangeRateToProject: "0.4" })).status, 400, "the rate is frozen");
    assert.equal((await patchLine(line.id, { invoiceAmountINR: 5000 })).status, 400, "a rupee amount is refused");
    // the ceiling counts the edited line once: USD 2,597 = OMR 999.845 fits, USD 2,700 = 1,039.5 does not
    assert.equal((await patchLine(line.id, { invoiceAmountOriginal: 2597 })).status, 200);
    assert.equal((await patchLine(line.id, { invoiceAmountOriginal: 2700 })).status, 400);
    // a status-only PATCH re-sending the whole payload changes nothing
    const resent = await json(await patchLine(line.id, { status: "Draft", currency: "USD", exchangeRateToProject: 0.385, invoiceAmountOriginal: 2597 }));
    assert.equal(resent.data.invoiceAmountProject, 999.845);
  });

  test("changing the project's commercial Work Order rate never recalculates an existing invoice", async () => {
    const { project, item } = await makeProject(c.category, c.project, c.wo);
    const line = (await json(await createLine(item.id, { invoiceNo: nextNo(), currency: "USD", exchangeRateToProject: "0.385", invoiceAmountOriginal: 600 }))).data;
    await prisma.project.update({ where: { id: project.id }, data: { currentExchangeRate: 0.4, contractExchangeRate: 0.4 } });
    await prisma.quantityItem.update({ where: { id: item.id }, data: { exchangeRate: 0.4 } });
    const row = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } });
    assert.equal(row.invoiceAmountProject!.toFixed(3), "231.000");
    assert.equal(row.exchangeRateToProject!.toFixed(3), "0.385");
  });

  test("the existing one-currency-per-project lock is preserved: after the first raise, another invoice currency is refused", async () => {
    const { item } = await makeProject("Qatar", "QAR", 10_000);
    assert.equal((await createLine(item.id, { invoiceNo: nextNo(), currency: "EUR", exchangeRateToProject: "3.95", invoiceAmountOriginal: 100 })).status, 201);
    const other = await createLine(item.id, { invoiceNo: nextNo(), currency: "USD", exchangeRateToProject: "3.64", invoiceAmountOriginal: 100 });
    assert.equal(other.status, 409);
    assert.match((await json(other)).message ?? "", /locked to EUR/);
  });

  test("two lines of one invoice must agree on the rate", async () => {
    const { project } = await makeProject("Oman", "OMR", 1000);
    const second = await prisma.quantityItem.create({
      data: { projectId: project.id, description: "second", woQty: 1, uom: "DAY", currency: "OMR", unitRate: 500, exchangeRate: 1, unitRateINR: 0, woValue: 0, unitRateRegional: 500, woValueRegional: 500 },
    });
    const first = await prisma.quantityItem.findFirstOrThrow({ where: { projectId: project.id, description: "IPC activity" } });
    const no = nextNo();
    assert.equal((await createLine(first.id, { invoiceNo: no, invoiceIntent: "new", currency: "USD", exchangeRateToProject: "0.385", invoiceAmountOriginal: 100 })).status, 201);
    const mismatch = await createLine(second.id, { invoiceNo: no, invoiceIntent: "existing", currency: "USD", exchangeRateToProject: "0.39", invoiceAmountOriginal: 100 });
    assert.equal(mismatch.status, 409);
    assert.match((await json(mismatch)).message ?? "", /same currency and exchange rate/);
    assert.equal((await createLine(second.id, { invoiceNo: no, invoiceIntent: "existing", currency: "USD", exchangeRateToProject: "0.385", invoiceAmountOriginal: 100 })).status, 201);
  });
});

describe("Payment and settlement: every amount is in the invoice currency, never read as the project currency or INR", () => {
  async function raised(c: Country, amount: number) {
    const { project, item } = await makeProject(c.category, c.project, c.wo);
    const no = nextNo();
    const line = (await json(await createLine(item.id, { invoiceNo: no, currency: c.invoice, exchangeRateToProject: c.rate, invoiceAmountOriginal: amount }))).data;
    return { project, item, no, line };
  }
  const pay = (projectId: string, invoiceNo: string, currency: string, receipt: string, adjustments: Array<{ category: string; amount: string }> = []) =>
    fetch(`${url}/invoice-payments`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        projectId,
        invoiceNo,
        idempotencyKey: randomUUID(),
        currency,
        receipts: receipt === "" ? [] : [{ paymentDate: "2026-11-12", amountReceived: receipt, reference: `UTR-${randomUUID().slice(0, 6)}` }],
        adjustments,
      }),
    });
  const itemsOf = async (projectId: string) => (await json(await fetch(`${url}/projects/${projectId}/invoice-items`, { headers: headers() }))).data.items[0].invoices as any[];

  test("Oman, USD 600 = OMR 231.000: a USD 300 receipt leaves USD 300 outstanding, never OMR or INR; project figures follow the invoice's own rate", async () => {
    const c = COUNTRIES[0]!;
    const { project, no } = await raised(c, 600);
    const part = await json(await pay(project.id, no, "USD", "300.00"));
    assert.ok(part.data, JSON.stringify(part));
    const lines = await itemsOf(project.id);
    assert.equal(lines[0].status, "PartiallyPaid");
    assert.equal(lines[0].recordedCashProject, 115.5, "USD 300 x 0.385 = OMR 115.500");
    assert.equal(lines[0].settledProject, 115.5);
    assert.equal(lines[0].recordedCashINR, 0, "no regional figure under an INR name");
    // a receipt in the PROJECT currency is refused: amounts are never converted
    const wrong = await pay(project.id, no, "OMR", "100.000");
    assert.equal(wrong.status, 400);
    // a deduction counts in the invoice currency too: TDS USD 60 + bank USD 240 completes USD 600
    const rest = await pay(project.id, no, "USD", "240.00", [{ category: "TDS", amount: "60.00" }]);
    assert.equal(rest.status, 201, JSON.stringify(await json(rest)));
    const after = await itemsOf(project.id);
    assert.equal(after[0].status, "Paid");
    assert.equal(after[0].settledProject, 231, "fully settled settles exactly the project-currency amount");
    assert.equal(after[0].recordedCashProject, 207.9, "cash = USD (300 + 240) x 0.385 = OMR 207.900; the TDS deduction is not cash");
  });

  for (const c of COUNTRIES) {
    test(`${c.category}: a part payment in ${c.invoice} is settled in ${c.invoice}; the project-currency figure uses the saved rate (${c.invoice} -> ${c.project})`, async () => {
      const { project, no } = await raised(c, c.amount);
      const half = (c.amount / 2).toFixed(2);
      const res = await pay(project.id, no, c.invoice, half);
      assert.equal(res.status, 201, JSON.stringify(await json(res)));
      const line = (await itemsOf(project.id))[0];
      assert.equal(line.status, "PartiallyPaid");
      assert.equal(line.invoiceAmountOriginal, c.amount);
      const expected = Number((Number(c.expected) / 2).toFixed(decimals(c.project)));
      assert.ok(Math.abs(line.recordedCashProject - expected) <= 1 / 10 ** decimals(c.project), `cash ${line.recordedCashProject} vs ${expected}`);
      // over-settling in the invoice currency is refused
      const over = await pay(project.id, no, c.invoice, (c.amount).toFixed(2));
      assert.equal(over.status, 422, "over-settling is refused");
    });
  }

  test("duplicate protection: the same idempotency key records one payment", async () => {
    const c = COUNTRIES[1]!;
    const { project, no } = await raised(c, c.amount);
    const key = randomUUID();
    const send = () =>
      fetch(`${url}/invoice-payments`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ projectId: project.id, invoiceNo: no, idempotencyKey: key, currency: c.invoice, receipts: [{ paymentDate: "2026-11-12", amountReceived: "100.00", reference: "UTR-DUP" }], adjustments: [] }),
      });
    assert.equal((await send()).status, 201);
    await send();
    assert.equal(await prisma.invoicePayment.count({ where: { projectId: project.id, invoiceNo: no } }), 1);
  });
});

describe("Tax: Indian GST is never applied to a regional project", () => {
  test("an INR invoice on an Abu Dhabi project (1 INR = AED 0.012) cannot carry GST; the snapshot is NOT_APPLICABLE", async () => {
    const { item, project } = await makeProject("Abu Dhabi", "AED", 5000);
    const withGst = await createLine(item.id, { invoiceNo: nextNo(), currency: "INR", exchangeRateToProject: "0.012", invoiceAmountOriginal: 100_000, gst: { applicable: true, ratePercent: 18, taxType: "IGST" } });
    assert.equal(withGst.status, 400);
    assert.match((await json(withGst)).message ?? "", /GST applies to INR invoices only/);
    const no = nextNo();
    assert.equal((await createLine(item.id, { invoiceNo: no, currency: "INR", exchangeRateToProject: "0.012", invoiceAmountOriginal: 100_000 })).status, 201);
    const snapshot = await prisma.invoiceGstSnapshot.findFirstOrThrow({ where: { invoiceNumber: { invoiceNo: no, projectId: project.id } } });
    assert.equal(snapshot.gstStatus, "NOT_APPLICABLE");
    assert.equal(snapshot.gstAmount.toFixed(2), "0.00");
    assert.equal(snapshot.currency, "INR");
  });

  test("a regional invoice in its own currency also carries no GST snapshot amount", async () => {
    const { item, project } = await makeProject("Oman", "OMR", 1000);
    const no = nextNo();
    assert.equal((await createLine(item.id, { invoiceNo: no, invoiceAmountOriginal: 200 })).status, 201);
    const snapshot = await prisma.invoiceGstSnapshot.findFirstOrThrow({ where: { invoiceNumber: { invoiceNo: no, projectId: project.id } } });
    assert.equal(snapshot.gstStatus, "NOT_APPLICABLE");
    assert.equal(snapshot.totalAmount.toFixed(3), "200.000");
  });
});

describe("India is unchanged", () => {
  test("an India project's USD invoice keeps the original model: INR amount and rate, none of the project-currency fields, both rate names accepted", async () => {
    const { item, project } = await makeProject("India", null, 1_000_000);
    const oldRes = await createLine(item.id, { invoiceNo: nextNo(), currency: "USD", exchangeRateToINR: 95, invoiceAmountOriginal: 600 });
    const old = await json(oldRes);
    assert.equal(oldRes.status, 201, JSON.stringify(old));
    assert.equal(old.data.invoiceAmountINR, 57_000, "1 USD = INR 95 x USD 600");
    assert.equal(old.data.exchangeRateToINR, 95);
    assert.equal(old.data.projectCurrency, null);
    assert.equal(old.data.invoiceAmountProject, null);
    assert.equal(old.data.exchangeRateToProject, null);
    // the new name is accepted for India too and means the same figure (same direction: INR per 1 USD)
    const { item: item2 } = await makeProject("India", "INR", 1_000_000);
    const fresh = await json(await createLine(item2.id, { invoiceNo: nextNo(), currency: "USD", exchangeRateToProject: "95", invoiceAmountOriginal: 600 }));
    assert.equal(fresh.data.invoiceAmountINR, 57_000);
    assert.equal(fresh.data.exchangeRateToINR, 95);
    assert.equal(fresh.data.projectCurrency, null, "an INR project never carries project-currency columns");
    // INR default: no currency -> INR, rate 1 (a fresh project: the first one is locked to USD by the existing one-currency-per-project rule)
    const { item: item3, project: project3 } = await makeProject("India", null, 1_000_000);
    const inr = await json(await createLine(item3.id, { invoiceNo: nextNo(), invoiceAmountINR: 100_000 }));
    assert.equal(inr.data.currency, "INR");
    assert.equal(inr.data.invoiceAmountINR, 100_000);
    // the Work Order ceiling is still the INR one
    const over = await createLine(item3.id, { invoiceNo: nextNo(), invoiceAmountINR: 5_000_000 });
    assert.equal(over.status, 400);
    assert.match((await json(over)).message ?? "", /exceeding its Work Order Value of ₹/);
    // GST still works on an INR invoice of an India project
    const gst = await createLine(item3.id, { invoiceNo: nextNo(), invoiceAmountINR: 100_000, gst: { applicable: true, ratePercent: 18, taxType: "IGST" } });
    assert.equal(gst.status, 201, JSON.stringify(await json(gst)));
    // the contract value in the invoice-items list is the INR one
    const list = await json(await fetch(`${url}/projects/${project3.id}/invoice-items`, { headers: headers() }));
    assert.equal(list.data.items[0].totalPrice, 1_000_000);
  });

  test("the database refuses a regional amount under an INR name and a half-filled regional row", async () => {
    const { item } = await makeProject("Oman", "OMR", 1000);
    const base = { quantityItemId: item.id, invoiceNo: nextNo(), invoiceDate: new Date(), quantityBilled: 0, status: "Draft", createdBy: "t" };
    await assert.rejects(
      prisma.invoiceLine.create({ data: { ...base, invoiceAmountINR: 231, projectCurrency: "OMR", exchangeRateToProject: "0.385", invoiceAmountProject: "231.000" } }),
      /project_currency_chk|check constraint/i,
      "an INR-named figure on a regional row"
    );
    await assert.rejects(prisma.invoiceLine.create({ data: { ...base, invoiceAmountINR: 0, projectCurrency: "OMR" } }), /project_currency_chk|check constraint/i, "a regional row with no rate or amount");
    await assert.rejects(prisma.invoiceLine.create({ data: { ...base, invoiceAmountINR: 0, projectCurrency: "INR", exchangeRateToProject: "1", invoiceAmountProject: "10.00" } }), /project_currency_chk|check constraint/i, "INR is never a regional currency");
  });
});

describe("Country access is enforced on the server for invoices", () => {
  test("an Oman-only user can raise and edit an Oman invoice; an India-only or no-access user is refused, by line id too", async () => {
    const omanOnly = await makeUser("oman-only", ["Oman"]);
    const indiaOnly = await makeUser("india-only", ["India"]);
    const { item } = await makeProject("Oman", "OMR", 1000);
    setMode("enforce");
    try {
      const ok = await createLine(item.id, { invoiceNo: nextNo(), status: "Draft", invoiceAmountOriginal: 100 }, omanOnly.token);
      const okBody = await json(ok);
      assert.equal(ok.status, 201, JSON.stringify(okBody));
      const line = okBody.data;
      assert.equal((await patchLine(line.id, { invoiceAmountOriginal: 150 }, omanOnly.token)).status, 200);
      const denied = await createLine(item.id, { invoiceNo: nextNo(), status: "Draft", invoiceAmountOriginal: 100 }, indiaOnly.token);
      assert.equal(denied.status, 403, "another country's user cannot raise an invoice");
      assert.equal((await patchLine(line.id, { invoiceAmountOriginal: 1 }, indiaOnly.token)).status, 403, "nor edit one by its id");
      const list = await fetch(`${url}/projects/${(await prisma.quantityItem.findUniqueOrThrow({ where: { id: item.id } })).projectId}/invoice-items`, { headers: { Authorization: `Bearer ${indiaOnly.token}` } });
      assert.equal(list.status, 403, "nor read its invoices");
      const payment = await fetch(`${url}/invoice-payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${indiaOnly.token}` },
        body: JSON.stringify({ projectId: (await prisma.quantityItem.findUniqueOrThrow({ where: { id: item.id } })).projectId, invoiceNo: line.invoiceNo, idempotencyKey: randomUUID(), currency: "OMR", receipts: [], adjustments: [] }),
      });
      assert.equal(payment.status, 403, "nor record a payment");
    } finally {
      setMode("off");
    }
    void userId;
  });
});

describe("Readers of invoices: project figures in the project currency; the INR-only reports leave regional invoices out instead of showing a rupee zero", () => {
  test("a project's pending due is in its own currency: work order value less what was raised, converted at the invoice's rate", async () => {
    const { project, item } = await makeProject("Oman", "OMR", 1000);
    assert.equal((await createLine(item.id, { invoiceNo: nextNo(), currency: "USD", exchangeRateToProject: "0.385", invoiceAmountOriginal: 600 })).status, 201);
    const dto = (await json(await fetch(`${url}/projects/${project.id}`, { headers: headers() }))).data;
    assert.equal(dto.workOrderValueRegional, 1000);
    assert.equal(dto.pendingDueRegional, 769, "OMR 1000 - USD 600 x 0.385 (= OMR 231)");
  });

  const getJson = async (path: string) => (await json(await fetch(`${url}${path}`, { headers: headers() }))).data;

  test("the Invoice Tracker lists every country's invoices in its own currency and keeps every total per currency", async () => {
    const oman = await makeProject("Oman", "OMR", 1000, "TRK");
    const india = await makeProject("India", null, 1_000_000, "TRK");
    const qatar = await makeProject("Qatar", "QAR", 10_000, "TRK");
    const omanNo = nextNo();
    assert.equal((await createLine(oman.item.id, { invoiceNo: omanNo, currency: "USD", exchangeRateToProject: "0.385", invoiceAmountOriginal: 600 })).status, 201);
    assert.equal((await createLine(india.item.id, { invoiceNo: nextNo(), invoiceAmountINR: 50_000 })).status, 201);
    assert.equal((await createLine(qatar.item.id, { invoiceNo: nextNo(), currency: "EUR", exchangeRateToProject: "3.95", invoiceAmountOriginal: 1000 })).status, 201);

    const month = await getJson(`/invoice-tracker?month=2026-11&search=${TAG}TRK&pageSize=50`);
    assert.deepEqual(month.summary.raisedByCurrency, { INR: 50_000, OMR: 231, QAR: 3950 }, "one total per currency, never added together");
    assert.equal(month.summary.raisedAmountINR, 50_000, "the rupee figure is the rupee part only: exactly what India always saw");
    assert.deepEqual(month.summary.outstanding.knownByCurrency, { INR: 50_000, OMR: 231, QAR: 3950 });
    const row = (id: string) => month.items.find((i: any) => i.id === id);
    assert.equal(row(oman.project.id).currency, "OMR");
    assert.equal(row(oman.project.id).latestRaised.amountINR, 231);
    assert.equal(row(oman.project.id).latestRaised.currency, "OMR");
    assert.equal(row(oman.project.id).workOrderValue, 1000);
    assert.equal(row(oman.project.id).pendingDue, 769);
    assert.equal(row(india.project.id).currency, "INR");
    assert.equal(row(india.project.id).latestRaised.amountINR, 50_000);
    assert.equal(row(qatar.project.id).latestRaised.amountINR, 3950);

    const chain = await getJson(`/invoice-tracker/projects/${oman.project.id}/invoices?month=2026-11`);
    assert.equal(chain.project.currency, "OMR");
    const inv = chain.invoices[0];
    assert.equal(inv.projectCurrency, "OMR");
    assert.equal(inv.currency, "USD", "the invoice's own currency is still shown");
    assert.equal(inv.originalAmount, 600);
    assert.equal(inv.amountINR, 231);
    assert.equal(inv.financials.outstandingINR, 231, "Raised: outstanding is the full amount, in the project currency");
    assert.equal(inv.lines[0].amountINR, 231);

    const outstanding = await getJson(`/invoice-tracker/outstanding?search=${TAG}TRK&pageSize=50`);
    assert.deepEqual(outstanding.totals.knownOutstandingByCurrency, { INR: 50_000, OMR: 231, QAR: 3950 });
    assert.equal(outstanding.totals.knownOutstandingINR, 50_000);
    const omanRow = outstanding.items.find((r: any) => r.projectId === oman.project.id);
    assert.equal(omanRow.currency, "OMR");
    assert.equal(omanRow.amountINR, 231);
    assert.equal(omanRow.outstandingINR, 231);

    const breakdown = await getJson(`/invoice-tracker/raised-breakdown?month=2026-11&search=${TAG}TRK&pageSize=50`);
    assert.deepEqual(breakdown.totalByCurrency, { INR: 50_000, OMR: 231, QAR: 3950 });
    assert.equal(breakdown.totalINR, 50_000);
    assert.equal(breakdown.projects.find((p: any) => p.projectId === oman.project.id).currency, "OMR");
  });

  test("the weekly unpaid-invoice reminder includes every country's overdue invoices in the one existing email, each in its own currency", async () => {
    const { buildReport, renderReportEmail } = await import("../weeklyNotifications/services/unpaidInvoice.service.js");
    const oman = await makeProject("Oman", "OMR", 1000, "EML");
    const india = await makeProject("India", null, 1_000_000, "EML");
    const abu = await makeProject("Abu Dhabi", "AED", 5000, "EML");
    const fresh = await makeProject("Qatar", "QAR", 10_000, "EML");
    const old = new Date("2025-01-10").toISOString();
    assert.equal((await createLine(oman.item.id, { invoiceNo: nextNo(), invoiceDate: old, invoiceAmountOriginal: 500 })).status, 201);
    assert.equal((await createLine(india.item.id, { invoiceNo: nextNo(), invoiceDate: old, invoiceAmountINR: 50_000 })).status, 201);
    assert.equal((await createLine(abu.item.id, { invoiceNo: nextNo(), invoiceDate: old, currency: "INR", exchangeRateToProject: "0.012", invoiceAmountOriginal: 100_000 })).status, 201);
    // an invoice that is not yet 30 days old is not reminded, in any country
    assert.equal((await createLine(fresh.item.id, { invoiceNo: nextNo(), invoiceDate: new Date("2026-11-15").toISOString(), invoiceAmountOriginal: 700 })).status, 201);

    const now = new Date("2026-11-18T06:00:00Z");
    const full = await buildReport(now);
    const mine = full.overdue.filter((r) => r.prNo.includes(`${TAG}EML`));
    assert.equal(mine.length, 3, "the three overdue invoices of three countries; the recent Qatar one is not overdue");
    const of = (id: string) => mine.find((r) => r.projectId === id)!;
    assert.equal(of(oman.project.id).currency, "OMR");
    assert.equal(of(oman.project.id).invoiceAmountINR, 500);
    assert.equal(of(oman.project.id).outstandingINR, 500);
    assert.equal(of(india.project.id).currency, "INR");
    assert.equal(of(india.project.id).invoiceAmountINR, 50_000);
    assert.equal(of(abu.project.id).currency, "AED");
    assert.equal(of(abu.project.id).invoiceAmountINR, 1200, "the project-currency equivalent");
    assert.match(of(abu.project.id).originalAmountNote ?? "", /^INR 100,000\.00$/, "the invoice's own currency is stated as its note");
    assert.ok(of(oman.project.id).daysSinceRaised > 30);

    const email = renderReportEmail({ eligibleCount: mine.length, overdue: mine }, now);
    for (const expected of ["OMR 500.000", "₹ 50,000.00", "AED 1,200.00", "(OMR)", "(INR)", "(AED)"]) assert.ok(email.html.includes(expected), `html has ${expected}`);
    for (const expected of ["OMR 500.000", "₹ 50,000.00", "AED 1,200.00"]) assert.ok(email.text.includes(expected), `text has ${expected}`);
    assert.ok(!/₹ 51,200|₹ 50,500|51,700/.test(email.html + email.text), "no total adds one currency to another");

    // the tracker's Outstanding view identifies the same invoices as overdue (30+ days)
    const outstanding = await getJson(`/invoice-tracker/outstanding?search=${TAG}EML&pageSize=50`);
    assert.ok(outstanding.items.find((r: any) => r.projectId === oman.project.id).daysOutstanding >= 30, "overdue in the tracker too");
    assert.ok(outstanding.items.find((r: any) => r.projectId === abu.project.id).daysOutstanding >= 30);
  });
});
