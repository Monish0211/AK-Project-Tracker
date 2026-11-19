import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { PR_CATEGORY_PREFIX_MAP } from "../projects/project.constants.js";
import { runMissingExpenseJob, setMissingExpenseEmailFlagForTests, setMissingExpenseSenderForTests } from "../weeklyNotifications/services/missingExpense.service.js";
import { runUnpaidInvoiceJob, setUnpaidInvoiceEmailFlagForTests, setUnpaidInvoiceSenderForTests } from "../weeklyNotifications/services/unpaidInvoice.service.js";

/**
 * The two Weekly Emails are GLOBAL management reports (scope correction, Nov 2026): "Projects Missing Other Project Expenses" and "Invoices Unpaid for 30+ Days" each
 * cover qualifying items in ALL SEVEN countries, with ONE schedule and ONE To/CC configuration. Neither the scheduled email nor the preview is limited by the requesting
 * user's countries or selected country, even with COUNTRY_ACCESS_MODE=enforce. No email can leave: every send goes to an in-memory fake.
 */
const TAG = `wkg-${Date.now()}`;
const COUNTRIES = ["India", "Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"] as const;
type Country = (typeof COUNTRIES)[number];

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const region = new Map<string, { id: string; code: string }>();
const created = { users: [] as string[], projects: [] as string[] };
const prNos = new Map<Country, string>();
const invoiceNos = new Map<Country, string>();
let indiaToken = "";
const sent: { to: string; cc: string[]; html: string }[] = [];
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

before(async () => {
  process.env["COUNTRY_ACCESS_MODE"] = "enforce";
  for (const r of await prisma.region.findMany({ select: { id: true, name: true, code: true } })) region.set(r.name, { id: r.id, code: r.code ?? r.name });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  // One qualifying project per country: Active, non-man-hour budget entered, no Other Project Expense (missing-expense email), and one Raised invoice 45 days old (unpaid email).
  for (const [i, c] of COUNTRIES.entries()) {
    const prNo = `${PR_CATEGORY_PREFIX_MAP[c]}${TAG}-${i}`;
    const p = await prisma.project.create({
      data: {
        poMonth: "2026-10", prCategory: c, prNo, client: `WKG ${c}`, department: "Process", domesticForeign: "Foreign", projectTitle: `WKG ${c}`, workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", createdByUserId: null, regionId: region.get(c)!.id, nonManhourBudgetAmount: 1000,
      },
    });
    created.projects.push(p.id);
    prNos.set(c, prNo);
    const qi = await prisma.quantityItem.create({ data: { projectId: p.id, description: "Eng", woQty: 10, uom: "Nos", unitRate: 1000, exchangeRate: 1, unitRateINR: 1000, woValue: 10000 } });
    const invoiceNo = `${TAG}-INV-${i}`;
    await prisma.invoiceLine.create({ data: { quantityItemId: qi.id, invoiceNo, invoiceDate: daysAgo(45), quantityBilled: 1, invoiceAmountINR: 1000, status: "Raised", createdBy: "test" } });
    invoiceNos.set(c, invoiceNo);
  }

  // An India-only Administrator (the reports must still show every country to them).
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } });
  const modules = await prisma.module.findMany({ where: { name: { in: ["Settings", "Invoices", "Projects"] } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: "WKG India", email: `${TAG}-india@example.com`, passwordHash: await hashPassword("Weekly@123"), department: "PMO", roleId: role.id, forcePasswordChange: false,
      moduleAccess: { create: modules.map((m) => ({ moduleId: m.id })) }, regionAccess: { create: [{ regionId: region.get("India")!.id }] },
    },
  });
  created.users.push(user.id);
  indiaToken = signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: "Administrator" });

  const fake = async (o: { to: unknown; cc?: unknown; html?: string }) => {
    sent.push({ to: String(o.to).toLowerCase(), cc: ((o.cc as string[] | undefined) ?? []).map((e) => e.toLowerCase()), html: o.html ?? "" });
    return { success: true } as never;
  };
  setMissingExpenseSenderForTests(fake as never);
  setUnpaidInvoiceSenderForTests(fake as never);
  setMissingExpenseEmailFlagForTests("true");
  setUnpaidInvoiceEmailFlagForTests("true");
});

after(async () => {
  try {
    setMissingExpenseSenderForTests(null);
    setUnpaidInvoiceSenderForTests(null);
    setMissingExpenseEmailFlagForTests(null);
    setUnpaidInvoiceEmailFlagForTests(null);
    await prisma.scheduledJobRun.deleteMany({ where: { periodKey: { startsWith: TAG } } });
    await prisma.invoiceLine.deleteMany({ where: { invoiceNo: { startsWith: TAG } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.userRegionAccess.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    process.env["COUNTRY_ACCESS_MODE"] = "off";
    await closeServer();
  }
});

const get = async (path: string, headers: Record<string, string> = {}) => {
  const res = await fetch(`${url}${path}`, { headers: { Authorization: `Bearer ${indiaToken}`, ...headers } });
  return { status: res.status, data: ((await res.json().catch(() => ({}))) as { data?: any }).data };
};

/** Every row of a paged preview (all pages), as seen by the India-only user with India SELECTED. */
async function allPreviewRows(base: string): Promise<any[]> {
  const rows: any[] = [];
  for (let page = 1; ; page += 1) {
    const res = await get(`${base}/preview?page=${page}&pageSize=100`, { "X-Active-Country": region.get("India")!.code });
    assert.equal(res.status, 200, `${base} page ${page}`);
    rows.push(...res.data.items);
    if (page >= res.data.totalPages) return rows;
  }
}

describe("Weekly Emails stay global: every country, one schedule, one recipient list", () => {
  test("missing Other Project Expenses: the preview lists the qualifying projects of all seven countries, even for an India-only user with India selected", async () => {
    const listed = new Set((await allPreviewRows("/notification-settings/missing-expenses")).map((r) => r.prNo));
    for (const c of COUNTRIES) assert.ok(listed.has(prNos.get(c)), `${c} project is in the report`);
  });

  test("unpaid invoices 30+ days: the preview lists the qualifying invoices of all seven countries, even for an India-only user with India selected", async () => {
    const listed = new Set((await allPreviewRows("/notification-settings/unpaid-invoices")).map((r) => r.invoiceNo));
    for (const c of COUNTRIES) assert.ok(listed.has(invoiceNos.get(c)), `${c} invoice is in the report`);
  });

  test("the scheduled missing-expense email is ONE email covering all seven countries, sent to the global To/CC", async () => {
    const settings = (await get("/notification-settings/missing-expenses")).data;
    sent.length = 0;
    const outcome = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-me` });
    assert.equal(outcome.outcome, "sent", JSON.stringify(outcome));
    assert.equal(sent.length, 1, "one email, not one per country");
    for (const c of COUNTRIES) assert.ok(sent[0]!.html.includes(prNos.get(c)!), `${c} project in the email`);
    assert.equal(sent[0]!.to, String(settings.recipients.toEmail).toLowerCase(), "the global To");
    for (const cc of settings.recipients.cc as { email: string }[]) assert.ok(sent[0]!.cc.includes(cc.email.toLowerCase()), `global CC ${cc.email}`);
  });

  test("the scheduled unpaid-invoice email is ONE email covering all seven countries, sent to the global To", async () => {
    const settings = (await get("/notification-settings/unpaid-invoices")).data;
    sent.length = 0;
    const outcome = await runUnpaidInvoiceJob({ trigger: "scheduled", periodKey: `${TAG}-ui` });
    assert.equal(outcome.outcome, "sent", JSON.stringify(outcome));
    assert.equal(sent.length, 1, "one email, not one per country");
    for (const c of COUNTRIES) assert.ok(sent[0]!.html.includes(invoiceNos.get(c)!), `${c} invoice in the email`);
    assert.equal(sent[0]!.to, String(settings.recipients.toEmail).toLowerCase(), "the global To");
  });

  test("the original single global schedules are the ones started (no per-country weekly scheduler)", () => {
    const server = readFileSync(new URL("../../server.ts", import.meta.url), "utf8");
    assert.match(server, /startMissingExpenseScheduler\(\);/);
    assert.match(server, /startUnpaidInvoiceScheduler\(\);/);
    assert.doesNotMatch(server, /CountryReminderScheduler/);
  });
});
