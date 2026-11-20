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
import { buildReport } from "../weeklyNotifications/services/unpaidInvoice.service.js";

/**
 * Financial reconciliation across the seven countries (synthetic rates, scratch database, enforce mode, real HTTP). For every country the same two projects are
 * built - one invoiced in the project's own currency, one in a DIFFERENT currency at an invoice-specific rate - then paid (partly, fully, with a TDS deduction), and every
 * module that shows the money is checked against values computed by hand here: the stored rows, the project summary, the invoice list, the Invoice Tracker (month,
 * Outstanding, history, breakdown), the dashboard totals, the report feed and the weekly reminder. Currencies are never added together, INR-named fields never hold a
 * regional amount, and a project's exchange rate changing later never moves a saved invoice.
 */
const TAG = `fr-${Date.now()}`;
type Cat = keyof typeof PR_CATEGORY_PREFIX_MAP;

interface Scenario {
  category: Cat;
  slug: string;
  /** null = India / legacy (rupee model). */
  currency: string | null;
  /** The different-currency invoice: currency, rate (1 unit = X project currency), original amount, the amount paid in cash against it (in that currency). */
  fx: { currency: string; rate: string; amount: number; cash: number };
}
const SCENARIOS: Scenario[] = [
  { category: "India", slug: "IN", currency: null, fx: { currency: "USD", rate: "95", amount: 1000, cash: 400 } },
  { category: "Malaysia", slug: "MY", currency: "MYR", fx: { currency: "USD", rate: "4.20", amount: 1000, cash: 400 } },
  { category: "Oman", slug: "OM", currency: "OMR", fx: { currency: "USD", rate: "0.385", amount: 600, cash: 240 } },
  { category: "Abu Dhabi", slug: "AD", currency: "AED", fx: { currency: "INR", rate: "0.012", amount: 100_000, cash: 40_000 } },
  { category: "FZI", slug: "FZ", currency: "AED", fx: { currency: "USD", rate: "3.67", amount: 1000, cash: 400 } },
  { category: "Elixir Qatar", slug: "EQ", currency: "QAR", fx: { currency: "USD", rate: "3.64", amount: 1000, cash: 400 } },
  { category: "Qatar", slug: "QA", currency: "QAR", fx: { currency: "EUR", rate: "3.95", amount: 1000, cash: 400 } },
];
const WO = 1_000_000;
const decimalsOf = (currency: string) => (currency === "OMR" ? 3 : 2);
const round = (value: number, dp: number) => Math.round(value * 10 ** dp + 1e-9) / 10 ** dp;
const money = (value: number, currency: string) => value.toFixed(decimalsOf(currency));

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[] };
const regionId = new Map<string, string>();
let token = "";
let seq = 0;
const evidence: Record<string, Record<string, unknown>> = {};

const setMode = (mode: "off" | "enforce") => {
  process.env["COUNTRY_ACCESS_MODE"] = mode;
};
const auth = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` });
const json = async (res: Response) => (await res.json().catch(() => ({}))) as { data?: any; message?: string };
const getJson = async (path: string) => {
  const res = await fetch(`${url}${path}`, { headers: auth() });
  assert.equal(res.status, 200, `${path} -> ${res.status}`);
  return (await json(res)).data;
};

async function makeProject(s: Scenario, role: "own" | "fx") {
  seq += 1;
  const regional = s.currency !== null;
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-11",
      prCategory: s.category,
      prNo: `${PR_CATEGORY_PREFIX_MAP[s.category]}${TAG}${s.slug}${role}-${seq}`,
      client: `FR Client ${s.slug}`,
      department: "Process",
      domesticForeign: "Foreign",
      projectTitle: `FR ${s.category} ${role}`,
      workOrderStatus: "Received",
      projectStartDate: new Date("2026-01-01"),
      projectEndDate: new Date("2026-12-31"),
      projectStatus: "Active",
      contractType: "LUMP SUM",
      createdByUserId: null,
      regionId: regionId.get(s.category) ?? null,
      regionalCurrency: s.currency,
      // the project's own commercial Work Order rate (must never leak into an invoice's own rate)
      currentExchangeRate: 1.5,
      contractExchangeRate: 1.5,
    },
  });
  created.projects.push(project.id);
  const item = await prisma.quantityItem.create({
    data: {
      projectId: project.id,
      description: "FR activity",
      woQty: 10,
      uom: "DAY",
      currency: s.currency ?? "INR",
      unitRate: WO / 10,
      exchangeRate: 1.5,
      unitRateINR: regional ? 0 : WO / 10,
      woValue: regional ? 0 : WO,
      unitRateRegional: WO / 10,
      woValueRegional: WO,
    },
  });
  return { project, itemId: item.id };
}

let invSeq = 0;
const nextNo = (slug: string) => `${TAG}-${slug}-${++invSeq}`;
const raise = async (itemId: string, body: Record<string, unknown>) => {
  const res = await fetch(`${url}/quantity/${itemId}/invoice-lines`, { method: "POST", headers: auth(), body: JSON.stringify({ invoiceDate: new Date("2026-11-10").toISOString(), quantityBilled: 0, status: "Raised", ...body }) });
  const out = await json(res);
  assert.equal(res.status, 201, JSON.stringify(out));
  return out.data;
};
const pay = async (projectId: string, invoiceNo: string, currency: string, cash: string, adjustments: { category: string; amount: string }[] = []) => {
  const res = await fetch(`${url}/invoice-payments`, {
    method: "POST",
    headers: auth(),
    body: JSON.stringify({ projectId, invoiceNo, idempotencyKey: randomUUID(), currency, receipts: [{ paymentDate: "2026-11-12", amountReceived: cash, reference: `UTR-${randomUUID().slice(0, 6)}` }], adjustments }),
  });
  assert.equal(res.status, 201, JSON.stringify(await json(res)));
};

/** The headline totals of one currency from the dashboard: the headline group or the "other currencies" list. */
const dashTotals = async (currency: string) => {
  const d = await getJson("/dashboard/summary");
  const k = d.kpiCurrency === currency ? d.kpis : d.otherCurrencies.find((o: any) => o.currency === currency);
  return { wo: k?.totalWOValue ?? 0, raised: k?.totalInvoiceRaised ?? 0, received: k?.totalPaymentReceived ?? 0, outstanding: k?.totalOutstanding ?? 0 };
};

before(async () => {
  setMode("off");
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId.set(r.name, r.id);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  const [role, ...mods] = await Promise.all([
    prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
    ...["Projects", "Invoices", "Dashboard"].map((name) => prisma.module.findFirstOrThrow({ where: { name } })),
  ]);
  const raise2 = await prisma.approvalType.findFirstOrThrow({ where: { name: "Raise Invoice" } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: "FR all-countries",
      email: `${TAG}@example.com`,
      passwordHash: await hashPassword("Reconcile@123"),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      allCountriesAccess: true,
      moduleAccess: { create: mods.map((m) => ({ moduleId: m.id })) },
      approvalPermissions: { create: [{ approvalTypeId: raise2.id }, ...(await invoiceEditDeleteGrants())] },
    },
  });
  created.users.push(user.id);
  token = signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: role.name });
  setMode("enforce");
});

after(async () => {
  try {
    console.log("FINANCIAL-EVIDENCE " + JSON.stringify(evidence));
    await prisma.invoiceStatusEvent.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.invoicePayment.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.invoiceGstSnapshot.deleteMany({ where: { invoiceNumber: { projectId: { in: created.projects } } } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: created.projects } } } });
    await prisma.invoiceNumber.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.notification.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    setMode("off");
    await closeServer();
  }
});

describe("every country: the money reconciles across invoices, payments, tracker, dashboard, reports and the weekly reminder", () => {
  for (const s of SCENARIOS) {
    const cur = s.currency ?? "INR"; // the project's own currency
    const dp = decimalsOf(cur);
    test(`${s.category} (${cur})`, async () => {
      const ev: Record<string, unknown> = { projectCurrency: cur };
      evidence[s.category] = ev;
      const before = await dashTotals(cur);
      const own = await makeProject(s, "own");
      const fxp = await makeProject(s, "fx");

      // ---- invoices in the project's OWN currency: no rate, rate 1; A3 is old-dated so the weekly reminder picks it up ----
      const a1 = money(1250.5, cur);
      const a2 = money(749.5, cur);
      const a3 = money(300, cur);
      const ownBody = (no: string, amount: string, extra: Record<string, unknown> = {}) => (s.currency === null ? { invoiceNo: no, invoiceAmountINR: Number(amount), gst: { applicable: false }, ...extra } : { invoiceNo: no, invoiceAmountOriginal: Number(amount), ...extra });
      const no1 = nextNo(s.slug);
      const no2 = nextNo(s.slug);
      const no3 = nextNo(s.slug);
      const l1 = await raise(own.itemId, ownBody(no1, a1));
      const l2 = await raise(own.itemId, ownBody(no2, a2));
      const l3 = await raise(own.itemId, ownBody(no3, a3, { invoiceDate: new Date("2025-01-10").toISOString() }));
      if (s.currency === null) {
        assert.equal(l1.invoiceAmountINR, 1250.5);
        assert.equal(l1.projectCurrency ?? null, null, "India keeps the original model");
      } else {
        assert.equal(l1.currency, cur, "the invoice currency defaults to the project's own");
        assert.equal(l1.exchangeRateToProject, "1", "same currency: rate 1, none asked for");
        assert.equal(l1.invoiceAmountProject, Number(a1));
        assert.equal(l1.invoiceAmountOriginal, Number(a1));
      }

      // ---- the DIFFERENT-currency invoice, at the invoice's own rate ----
      const fxNo = nextNo(s.slug);
      const projectAmount = round(s.fx.amount * Number(s.fx.rate), dp);
      const fxLine = await raise(
        fxp.itemId,
        s.currency === null
          ? { invoiceNo: fxNo, currency: s.fx.currency, exchangeRateToINR: Number(s.fx.rate), invoiceAmountOriginal: s.fx.amount, gst: { applicable: false } }
          : { invoiceNo: fxNo, currency: s.fx.currency, exchangeRateToProject: s.fx.rate, invoiceAmountOriginal: s.fx.amount }
      );
      assert.equal(fxLine.invoiceAmountOriginal, s.fx.amount, "the original amount is preserved");
      assert.equal(fxLine.currency, s.fx.currency);
      if (s.currency === null) {
        assert.equal(fxLine.invoiceAmountINR, projectAmount);
        assert.equal(fxLine.exchangeRateToINR, Number(s.fx.rate));
      } else {
        assert.equal(Number(fxLine.exchangeRateToProject), Number(s.fx.rate), "the invoice's own rate, never the project's Work Order rate (1.5)");
        assert.equal(fxLine.invoiceAmountProject, projectAmount);
        assert.equal(fxLine.invoiceAmountINR, 0);
        assert.equal(fxLine.exchangeRateToINR, 1);
      }
      ev["fxInvoice"] = `${s.fx.currency} ${s.fx.amount} at 1 ${s.fx.currency} = ${cur} ${s.fx.rate} -> ${cur} ${money(projectAmount, cur)}`;

      // ---- payments in the INVOICE currency: partial, full with a TDS deduction, partial on the foreign invoice ----
      const half = round(1250.5 / 2, dp);
      await pay(own.project.id, no1, cur, money(half, cur));
      await pay(own.project.id, no2, cur, money(700, cur), [{ category: "TDS", amount: money(49.5, cur) }]);
      const fxCashProject = round(s.fx.cash * Number(s.fx.rate), dp);
      await pay(fxp.project.id, fxNo, s.fx.currency, money(s.fx.cash, s.fx.currency));

      // ---- 1. stored rows ----
      const rows = await prisma.invoiceLine.findMany({ where: { quantityItem: { projectId: { in: [own.project.id, fxp.project.id] } } } });
      assert.equal(rows.length, 4);
      for (const r of rows) {
        if (s.currency === null) {
          assert.ok(r.invoiceAmountINR > 0 && r.projectCurrency === null && r.invoiceAmountProject === null, "India rows keep the rupee model");
        } else {
          assert.equal(r.invoiceAmountINR, 0, "an INR-named amount never holds a regional amount");
          assert.equal(r.exchangeRateToINR, 1);
          assert.ok(!r.unitPriceINR && !r.calculatedAmountINR && !r.commercialAdjustmentINR);
          assert.equal(r.projectCurrency, cur);
        }
      }

      // ---- 2. project summary: Work Order, invoiced, balance (each project in its own currency) ----
      const projA = await getJson(`/projects/${own.project.id}`);
      const raisedOwn = Number(a1) + Number(a2) + Number(a3);
      if (s.currency === null) {
        assert.equal(projA.workOrderValueINR, WO);
        assert.equal(projA.pendingDueINR, round(WO - raisedOwn, 2));
      }
      assert.equal(projA.workOrderValueRegional, WO);
      assert.equal(projA.pendingDueRegional, round(WO - raisedOwn, dp));
      const projB = await getJson(`/projects/${fxp.project.id}`);
      assert.equal(projB.pendingDueRegional, round(WO - projectAmount, dp), "the foreign-currency invoice counts against the balance in project currency");

      // ---- 3. invoice list: cash and settled in the project currency ----
      const listA = (await getJson(`/projects/${own.project.id}/invoice-items`)).items[0].invoices as any[];
      const byNo = (no: string) => listA.find((l) => l.invoiceNo === no)!;
      const cashOf = (l: any) => (s.currency === null ? l.recordedCashINR : l.recordedCashProject);
      const settledOf = (l: any) => (s.currency === null ? l.settledINR : l.settledProject);
      assert.equal(byNo(no1).status, "PartiallyPaid");
      assert.equal(cashOf(byNo(no1)), half);
      assert.equal(byNo(no2).status, "Paid", "700 cash + 49.5 TDS settles 749.5");
      assert.equal(cashOf(byNo(no2)), 700, "cash excludes the TDS deduction");
      assert.equal(settledOf(byNo(no2)), 749.5, "settled = cash + the TDS deduction");
      assert.equal(byNo(no3).status, "Raised");
      const listB = (await getJson(`/projects/${fxp.project.id}/invoice-items`)).items[0].invoices as any[];
      assert.equal(listB[0].status, "PartiallyPaid");
      assert.equal(cashOf(listB[0]), fxCashProject, `${s.fx.currency} ${s.fx.cash} received converts at the invoice's own rate`);
      assert.equal(settledOf(listB[0]), fxCashProject);
      ev["payments"] = `A1 part ${money(half, cur)}; A2 700 + TDS 49.5 = Paid; FX cash ${s.fx.currency} ${s.fx.cash} = ${cur} ${money(fxCashProject, cur)}`;

      // ---- 4. Invoice Tracker (every month, only these two projects) ----
      const search = `${TAG}${s.slug}`;
      const tracker = await getJson(`/invoice-tracker?month=all&search=${search}&pageSize=50`);
      const raisedAll = round(raisedOwn + projectAmount, dp);
      assert.deepEqual(Object.keys(tracker.summary.raisedByCurrency), [cur], "one currency in this scope - nothing else is added in");
      assert.equal(tracker.summary.raisedByCurrency[cur], raisedAll);
      assert.equal(tracker.summary.invoicesRaised, 4);
      assert.equal(tracker.summary.outstanding.knownByCurrency[cur], Number(a3), "only the unpaid (Raised) invoice has a known balance");
      assert.equal(tracker.summary.collected.byCurrency[cur], 749.5, "Paid invoices at full amount (inferred from status)");
      const rowA = tracker.items.find((i: any) => i.id === own.project.id);
      assert.equal(rowA.currency, cur);
      assert.equal(rowA.workOrderValue, WO);
      assert.equal(rowA.pendingDue, round(WO - raisedOwn, dp));
      const chain = await getJson(`/invoice-tracker/projects/${fxp.project.id}/invoices?month=all`);
      const inv = chain.invoices[0];
      assert.equal(inv.projectCurrency, cur);
      assert.equal(inv.amountINR, projectAmount, "the invoice's amount in the project currency");
      assert.equal(inv.currency, s.fx.currency, "the invoice's own currency stays identifiable");
      assert.equal(inv.originalAmount, s.fx.currency === cur ? null : s.fx.amount, "and its original amount");
      const outstanding = await getJson(`/invoice-tracker/outstanding?search=${search}&pageSize=50`);
      assert.equal(outstanding.totals.knownOutstandingByCurrency[cur], Number(a3));
      assert.equal(outstanding.totals.partiallyPaidCount, 2);
      assert.equal(outstanding.totals.overdue30PlusCount, 1, "only the old-dated unpaid invoice is overdue");
      const breakdown = await getJson(`/invoice-tracker/raised-breakdown?month=all&search=${search}&pageSize=50`);
      assert.equal(breakdown.totalByCurrency[cur], raisedAll);
      assert.equal(breakdown.invoiceCount, 4);

      // ---- 5. report feed: the same invoices, the same amounts ----
      const feed = ((await getJson("/invoice-items")).items as any[]).filter((l) => [own.project.id, fxp.project.id].includes(l.projectId));
      assert.equal(feed.length, 4);
      const feedAmount = (l: any) => (s.currency === null ? l.invoiceAmountINR : l.invoiceAmountProject);
      assert.equal(round(feed.reduce((sum, l) => sum + feedAmount(l), 0), dp), raisedAll, "the report feed adds up to the tracker's raised total");

      // ---- 6. dashboard: the currency's totals moved by exactly this scenario ----
      const after2 = await dashTotals(cur);
      const settledTotal = round(half + 749.5 + fxCashProject, dp);
      const cashTotal = round(half + 700 + fxCashProject, dp);
      assert.equal(round(after2.wo - before.wo, dp), 2 * WO);
      assert.equal(round(after2.raised - before.raised, dp), raisedAll);
      assert.equal(round(after2.received - before.received, dp), cashTotal, "Payment Received = bank cash only (the TDS is not cash)");
      assert.equal(round(after2.outstanding - before.outstanding, dp), round(2 * WO - settledTotal, dp), "Outstanding = Work Order - settled (cash + TDS)");

      // ---- 7. the weekly reminder: the old unpaid invoice, in the project currency, nothing else of this scenario ----
      const report = await buildReport(new Date("2026-11-18T06:00:00Z"));
      const mine = report.overdue.filter((r) => r.prNo.includes(search));
      assert.equal(mine.length, 1, "the one overdue invoice (A3); the others are paid, part-paid or recent");
      assert.equal(mine[0]!.currency, cur);
      assert.equal(mine[0]!.invoiceAmountINR, Number(a3));
      assert.equal(mine[0]!.outstandingINR, Number(a3));

      // ---- 8. history is immutable: the project's exchange rates change, the saved invoices do not ----
      await prisma.project.update({ where: { id: fxp.project.id }, data: { currentExchangeRate: 99, contractExchangeRate: 99 } });
      await prisma.quantityItem.updateMany({ where: { projectId: { in: [own.project.id, fxp.project.id] } }, data: { exchangeRate: 99 } });
      const again = await prisma.invoiceLine.findMany({ where: { quantityItem: { projectId: fxp.project.id } } });
      if (s.currency === null) assert.equal(again[0]!.invoiceAmountINR, projectAmount);
      else {
        assert.equal(again[0]!.invoiceAmountProject!.toFixed(dp), money(projectAmount, cur));
        assert.equal(again[0]!.exchangeRateToProject!.toFixed(4), Number(s.fx.rate).toFixed(4));
      }
      const listAgain = (await getJson(`/projects/${fxp.project.id}/invoice-items`)).items[0].invoices as any[];
      assert.equal(cashOf(listAgain[0]), fxCashProject, "cash and settled figures do not move either");

      Object.assign(ev, {
        ownCurrencyInvoices: `${a1} + ${a2} + ${a3} = ${money(raisedOwn, cur)}`,
        projectSummary: `WO ${cur} ${WO.toLocaleString("en-US")}; pending due own ${money(round(WO - raisedOwn, dp), cur)}, fx ${money(round(WO - projectAmount, dp), cur)}`,
        trackerRaised: `${cur} ${money(raisedAll, cur)} (4 invoices)`,
        trackerKnownOutstanding: `${cur} ${a3}`,
        dashboardDelta: `WO +${2 * WO}, raised +${money(raisedAll, cur)}, received +${money(cashTotal, cur)}, outstanding +${money(round(2 * WO - settledTotal, dp), cur)}`,
        reminder: `1 overdue: ${cur} ${a3}`,
      });
    });
  }
});

describe("mixed countries at once: nothing is added across currencies, every view agrees with the per-country totals", () => {
  test("the tracker, the Outstanding view and the dashboard keep each currency separate over all seven scenarios", async () => {
    const all = await getJson(`/invoice-tracker?month=all&search=${TAG}&pageSize=100`);
    const expectedCurrencies = new Set(SCENARIOS.map((s) => s.currency ?? "INR"));
    assert.deepEqual(new Set(Object.keys(all.summary.raisedByCurrency)), expectedCurrencies, "INR, MYR, OMR, AED and QAR - each its own line");
    // AED holds two countries (Abu Dhabi and FZE): its total is the sum of the two, in AED, and nothing else
    const expectedFor = (cur: string) => SCENARIOS.filter((s) => (s.currency ?? "INR") === cur).reduce((sum, s) => {
      const dp = decimalsOf(cur);
      return round(sum + 1250.5 + 749.5 + 300 + round(s.fx.amount * Number(s.fx.rate), dp), dp);
    }, 0);
    for (const cur of expectedCurrencies) assert.equal(all.summary.raisedByCurrency[cur], expectedFor(cur), `${cur} total`);
    assert.equal(all.summary.raisedAmountINR, all.summary.raisedByCurrency["INR"], "the legacy rupee figure is the rupee part only");
    const out = await getJson(`/invoice-tracker/outstanding?search=${TAG}&pageSize=100`);
    for (const cur of expectedCurrencies) assert.equal(out.totals.knownOutstandingByCurrency[cur], 300 * SCENARIOS.filter((s) => (s.currency ?? "INR") === cur).length, `${cur} known outstanding`);
    // exactly five currency totals, one per currency: no combined "grand total" exists anywhere in the response
    assert.equal(Object.keys(all.summary.raisedByCurrency).length, 5);
    assert.equal(typeof all.summary.raisedAmountINR, "number");
    assert.equal(all.summary.raisedAmountINR, expectedFor("INR"));
  });

  test("the weekly reminder carries all seven countries in one email, one outstanding line per currency, no cross-currency sum", async () => {
    const { renderReportEmail } = await import("../weeklyNotifications/services/unpaidInvoice.service.js");
    const now = new Date("2026-11-18T06:00:00Z");
    const report = await buildReport(now);
    const mine = report.overdue.filter((r) => r.prNo.includes(TAG));
    assert.equal(mine.length, 7, "one overdue invoice per country");
    const email = renderReportEmail({ eligibleCount: mine.length, overdue: mine }, now);
    for (const label of ["(INR)", "(MYR)", "(OMR)", "(AED)", "(QAR)"]) assert.ok(email.html.includes(label) && email.text.includes(label), `outstanding line ${label}`);
    assert.ok(email.html.includes("AED 600.00"), "Abu Dhabi + FZE AED 300 each, shown as AED 600.00 and never added to another currency");
    assert.ok(email.html.includes("QAR 600.00") && email.html.includes("OMR 300.000") && email.html.includes("MYR 300.00") && email.html.includes("₹ 300.00"));
    // no email was sent: rendering only
  });
});
