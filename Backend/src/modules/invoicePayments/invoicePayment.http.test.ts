import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Invoice Payment workflow — backend contract. Real HTTP against the real app and database, isolated tagged data, cleaned up
 * in `after`. No invoice request exists for any invoice here and SMTP is off, so no email path is reachable. Lines are seeded
 * directly (status Raised) so only the payment workflow itself changes their status.
 *
 * The rule under test: Total Settled = bank amount + all deductions (invoice currency); nothing -> status unchanged,
 * part -> Partially Paid, exact -> Paid, more -> refused. Every deduction category counts. GST is never a deduction or a payment field; the invoice-level
 * GST snapshot (see invoiceGst/) only changes the settlement TARGET of an invoice that has one. The invoices SEEDED in this file have no snapshot, i.e.
 * they are LEGACY invoices, which keep settling on their taxable amount exactly as before.
 */

const TAG = `ipay-${Date.now()}`;
const TRIGGER = `trg_${TAG.replace(/-/g, "_")}`;
let url = "";
let closeServer: () => Promise<void> = async () => {};
const userIds: string[] = [];
const projectIds: string[] = [];
const people: Record<string, { id: string; headers: Record<string, string> }> = {};

interface ProjectFx {
  id: string;
  qi: string;
}
const projects: Record<string, ProjectFx> = {};

async function api(method: string, path: string, who: string, body?: unknown) {
  const res = await fetch(`${url}${path}`, { method, headers: people[who]!.headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, body: json, data: json.data, message: json.message as string | undefined };
}

let counter = 0;
interface SeedOptions {
  status?: string;
  currency?: string;
  original?: number;
  inr?: number;
  rate?: number;
  lines?: number;
}
/** A seeded invoice (all lines Raised unless said otherwise). Returns its number and line ids. */
async function seedInvoice(project: ProjectFx, options: SeedOptions = {}) {
  const invoiceNo = `${TAG}-INV-${++counter}`;
  const { status = "Raised", currency = "INR", original = 100000, inr = original, rate = 1, lines = 1 } = options;
  const ids: string[] = [];
  for (let i = 0; i < lines; i += 1) {
    const row = await prisma.invoiceLine.create({
      data: {
        quantityItemId: project.qi, invoiceNo, invoiceDate: new Date("2026-09-01"), quantityBilled: 0, invoiceAmountINR: inr / lines,
        currency, exchangeRateToINR: rate, invoiceAmountOriginal: original / lines, status, createdBy: "test",
      },
    });
    ids.push(row.id);
  }
  return { invoiceNo, lineIds: ids };
}

const lineStatuses = async (ids: string[]) => (await prisma.invoiceLine.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } })).map((l) => l.status);
const paymentCount = (projectId: string, invoiceNo: string) => prisma.invoicePayment.count({ where: { projectId, invoiceNo } });
const overviewOf = (who: string, project: ProjectFx, invoiceNo: string) => api("GET", `/invoice-payments?projectId=${project.id}&invoiceNo=${encodeURIComponent(invoiceNo)}`, who);

/** A payment: bank amount plus deductions, in the invoice currency. */
function pay(project: ProjectFx, invoiceNo: string, bank: string, deductions: Array<[string, string] | Record<string, unknown>> = [], extra: Record<string, unknown> = {}) {
  return {
    projectId: project.id,
    invoiceNo,
    idempotencyKey: randomUUID(),
    receipts: bank === "" ? [] : [{ paymentDate: "2026-10-30", amountReceived: bank, reference: "UTR-1" }],
    adjustments: deductions.map((d) => (Array.isArray(d) ? { category: d[0], amount: d[1] } : d)),
    ...extra,
  };
}

before(async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  const [engineer, adminRole, readOnlyRole, invoicesM, projectsM, dashboardM, raise, edit, del] = await Promise.all([
    prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
    prisma.portalRole.findFirstOrThrow({ where: { name: "Administrator" } }),
    prisma.portalRole.findFirstOrThrow({ where: { name: "Read Only" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Invoices" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Projects" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Dashboard" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Raise Invoice" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Edit Invoice" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Delete Invoice" } }),
  ]);
  const passwordHash = await hashPassword("IpayTest@123");
  const make = async (key: string, role: { id: string; name: string }, modules: string[], approvals: string[]) => {
    const email = `${TAG}-${key}@example.com`;
    const u = await prisma.portalUser.create({
      data: {
        fullName: `Ipay ${key}`, email, passwordHash, department: "Accounts", roleId: role.id, forcePasswordChange: false,
        moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) },
        approvalPermissions: { create: approvals.map((approvalTypeId) => ({ approvalTypeId })) },
      },
    });
    userIds.push(u.id);
    people[key] = { id: u.id, headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: u.id, email, roleId: role.id, roleName: role.name })}` } };
  };
  const both = [projectsM.id, invoicesM.id];
  await make("recorder", engineer, both, [edit.id, del.id, raise.id]);
  await make("recorder2", engineer, both, [edit.id]);
  await make("viewer", engineer, [projectsM.id, invoicesM.id, dashboardM.id], []);
  await make("noApproval", engineer, both, [raise.id]);
  await make("noModule", engineer, [projectsM.id], [edit.id]);
  await make("readOnly", readOnlyRole, both, [edit.id]);
  await make("admin", adminRole, [], []);

  const mkProject = async (suffix: string, extra: { currency?: string; gstApplicable?: boolean; createdByUserId?: string | null } = {}) => {
    const p = await prisma.project.create({
      data: {
        poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-${suffix}`, client: "Ipay Client", department: "Process", domesticForeign: "Domestic",
        projectTitle: `Ipay ${suffix}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM",
        createdByUserId: extra.createdByUserId ?? null, currency: extra.currency ?? "INR", gstApplicable: extra.gstApplicable ?? false,
      },
    });
    projectIds.push(p.id);
    const qi = (await prisma.quantityItem.create({ data: { projectId: p.id, description: "Item", woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 10_000_000 } })).id;
    projects[suffix] = { id: p.id, qi };
  };
  // A project whose own GST switch is ON — it must make no difference to a payment (GST is not part of this workflow).
  await mkProject("INR", { gstApplicable: true });
  await mkProject("USD", { currency: "USD" });
  await mkProject("AED", { currency: "AED" });
  await mkProject("OMR", { currency: "OMR" });
  await mkProject("OWNED", { createdByUserId: people.admin!.id });
});

after(async () => {
  try {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIGGER} ON "InvoiceStatusEvent"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIGGER}()`);
    await prisma.invoicePaymentEvent.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.invoiceStatusEvent.deleteMany({ where: { prNo: { startsWith: TAG } } });
    await prisma.notification.deleteMany({ where: { entityId: { in: projectIds } } });
    const items = await prisma.quantityItem.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItemId: { in: items.map((i) => i.id) } } });
    await prisma.invoiceNumber.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await closeServer();
  }
});

// ── The settlement rule and the invoice status ──────────────────────────────────────────────────

test("no payment: the invoice stays Raised and everything is outstanding", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const view = await overviewOf("recorder", P, inv.invoiceNo);
  assert.equal(view.status, 200);
  assert.deepEqual([view.data.invoice.status, view.data.payments, view.data.summary.outcome, view.data.summary.resultingStatus], ["Raised", [], "NONE", null]);
  assert.deepEqual([view.data.summary.invoiceAmount, view.data.summary.totalSettled, view.data.summary.outstanding], ["100000.00", "0.00", "100000.00"]);
});

test("example 1: bank 70,000 + TDS, Security Deposit and LD of 10,000 each = 1,00,000 -> Paid, bank cash kept separate", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P, { lines: 2 });
  const res = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "70000.00", [["TDS", "10000.00"], ["SECURITY_DEPOSIT", "10000.00"], ["LD_AMOUNT", "10000.00"]]));
  assert.equal(res.status, 201, res.message);
  assert.equal(res.data.newInvoiceStatus, "Paid");
  assert.deepEqual(await lineStatuses(inv.lineIds), ["Paid", "Paid"], "every line of THIS invoice");
  const s = res.data.overview.summary;
  assert.deepEqual([s.bankReceived, s.deductions, s.totalSettled, s.outstanding, s.outcome, s.resultingStatus], ["70000.00", "30000.00", "100000.00", "0.00", "SETTLED", "Paid"]);
  assert.equal(res.data.overview.invoice.status, "Paid");

  // Persisted exactly, with the authenticated user as actor; the audit trail records the payment and the status change.
  const row = await prisma.invoicePayment.findUniqueOrThrow({ where: { id: res.data.payment.id }, include: { receipts: true, adjustments: true } });
  assert.deepEqual([row.recordedByUserId, row.currency, row.gstApplicable, row.gstAmount], [people.recorder!.id, "INR", false, null]);
  assert.equal(row.receipts[0]!.amountReceived.toFixed(3), "70000.000");
  assert.deepEqual(row.adjustments.map((a) => [a.category, a.amount.toFixed(2), a.countsTowardSettlement]), [["TDS", "10000.00", true], ["SECURITY_DEPOSIT", "10000.00", true], ["LD_AMOUNT", "10000.00", true]]);
  const events = await prisma.invoiceStatusEvent.findMany({ where: { invoiceLineId: { in: inv.lineIds } } });
  assert.deepEqual(events.map((e) => [e.fromStatus, e.toStatus, e.source, e.actorUserId]), [["Raised", "Paid", "invoice_payment", people.recorder!.id], ["Raised", "Paid", "invoice_payment", people.recorder!.id]]);
  assert.deepEqual((await prisma.invoicePaymentEvent.findMany({ where: { paymentId: row.id } })).map((e) => e.eventType), ["PAYMENT_RECORDED"]);
});

test("example 2: bank 70,000 + deductions 10,000 = 80,000 -> Partially Paid with 20,000 outstanding; a second payment completes it -> Paid", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const first = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "70000.00", [["TDS", "10000.00"]]));
  assert.equal(first.status, 201, first.message);
  assert.equal(first.data.newInvoiceStatus, "PartiallyPaid");
  assert.deepEqual(await lineStatuses(inv.lineIds), ["PartiallyPaid"]);
  assert.deepEqual([first.data.overview.summary.totalSettled, first.data.overview.summary.outstanding, first.data.overview.invoice.status], ["80000.00", "20000.00", "PartiallyPaid"]);

  const second = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "5000.00", [["WAIVE_OFF", "15000.00"]]));
  assert.equal(second.status, 201, second.message);
  assert.equal(second.data.newInvoiceStatus, "Paid");
  assert.deepEqual(await lineStatuses(inv.lineIds), ["Paid"]);
  assert.equal(second.data.overview.payments.length, 2);
  assert.equal(second.data.overview.summary.bankReceived, "75000.00");
  assert.deepEqual((await prisma.invoiceStatusEvent.findMany({ where: { invoiceLineId: inv.lineIds[0]! }, orderBy: [{ occurredAt: "asc" }, { seq: "asc" }] })).map((e) => [e.fromStatus, e.toStatus]), [["Raised", "PartiallyPaid"], ["PartiallyPaid", "Paid"]]);
});

test("a bank amount alone, less than the invoice amount, makes it Partially Paid", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const res = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "30000.00"));
  assert.equal(res.status, 201, res.message);
  assert.equal(res.data.newInvoiceStatus, "PartiallyPaid");
});

test("total settled above the invoice amount is refused with the actual amounts named; nothing is saved and the status is untouched; earlier payments count", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const over = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "70000.00", [["TDS", "30000.01"]]));
  assert.equal(over.status, 422);
  assert.equal(over.body.violations[0].code, "OVER_SETTLED");
  assert.equal(over.message, "Bank amount INR 70000.00 + deductions INR 30000.01 = INR 100000.01, which exceeds the invoice amount of INR 100000.00 by INR 0.01.");
  assert.equal(await paymentCount(P.id, inv.invoiceNo), 0);
  assert.deepEqual(await lineStatuses(inv.lineIds), ["Raised"]);

  // Earlier active payments are part of the total.
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "80000.00"))).status, 201);
  const cumulative = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "10000.00", [["TDS", "10000.01"]]));
  assert.equal(cumulative.status, 422);
  assert.match(cumulative.message ?? "", /Bank amount INR 90000\.00 \+ deductions INR 10000\.01 = INR 100000\.01/);
  assert.equal(await paymentCount(P.id, inv.invoiceNo), 1);
  assert.deepEqual(await lineStatuses(inv.lineIds), ["PartiallyPaid"]);
});

test("only the exact invoice whose settlement changed is updated, even with several invoices under one project", async () => {
  const P = projects.INR!;
  const a = await seedInvoice(P);
  const b = await seedInvoice(P);
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, a.invoiceNo, "100000.00"))).status, 201);
  assert.deepEqual(await lineStatuses(a.lineIds), ["Paid"]);
  assert.deepEqual(await lineStatuses(b.lineIds), ["Raised"], "the other invoice is untouched");
  assert.equal((await overviewOf("recorder", P, b.invoiceNo)).data.payments.length, 0);
});

// ── Deduction categories ────────────────────────────────────────────────────────────────────────

test("EVERY deduction category counts toward Total Settled on its own, with no approval step", async () => {
  const P = projects.INR!;
  for (const category of ["TDS", "SECURITY_DEPOSIT", "ISD", "OTHER_DEDUCTIONS", "LD_AMOUNT", "BANK_CHARGES", "WITHHOLDING_TAXES", "FX_LOSS", "WAIVE_OFF"]) {
    const inv = await seedInvoice(P, { original: 1000 });
    const res = await api("POST", "/invoice-payments", "recorder2", pay(P, inv.invoiceNo, "900.00", [[category, "100.00"]]));
    assert.equal(res.status, 201, `${category}: ${res.message}`);
    assert.equal(res.data.newInvoiceStatus, "Paid", `${category} settles the remaining 100`);
    assert.equal(res.data.overview.summary.bankReceived, "900.00", `${category} is never counted as bank cash`);
  }
});

test("Security Deposit and ISD persist their expected release and reminder dates; the dates are refused on any other category", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const res = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "50000.00", [
    { category: "SECURITY_DEPOSIT", amount: "10000.00", expectedReleaseDate: "2027-01-15", reminderDate: "2027-01-01" },
    { category: "ISD", amount: "5000.00", expectedReleaseDate: "2027-02-20", reminderDate: "2027-02-10" },
  ]));
  assert.equal(res.status, 201, res.message);
  const rows = await prisma.invoicePaymentAdjustment.findMany({ where: { paymentId: res.data.payment.id }, orderBy: { position: "asc" } });
  assert.deepEqual(rows.map((r) => [r.category, r.expectedReleaseDate?.toISOString().slice(0, 10), r.reminderDate?.toISOString().slice(0, 10)]), [["SECURITY_DEPOSIT", "2027-01-15", "2027-01-01"], ["ISD", "2027-02-20", "2027-02-10"]]);
  const dto = res.data.payment.adjustments.map((a: any) => [a.category, a.expectedReleaseDate, a.reminderDate]);
  assert.deepEqual(dto, [["SECURITY_DEPOSIT", "2027-01-15", "2027-01-01"], ["ISD", "2027-02-20", "2027-02-10"]], "and they come back with the payment history");

  const other = await seedInvoice(P);
  const bad = await api("POST", "/invoice-payments", "recorder", pay(P, other.invoiceNo, "1.00", [{ category: "TDS", amount: "1.00", expectedReleaseDate: "2027-01-01" }]));
  assert.equal(bad.status, 400);
  assert.equal(bad.body.errors[0].path, "adjustments.0.expectedReleaseDate");
  const worse = await api("POST", "/invoice-payments", "recorder", pay(P, other.invoiceNo, "1.00", [{ category: "ISD", amount: "1.00", reminderDate: "2027-13-40" }]));
  assert.equal(worse.status, 400);
});

test("GST is not a payment field: GST fields are ignored, GST TDS is not a category, and a project's GST switch changes nothing for a legacy invoice", async () => {
  const P = projects.INR!; // its GST switch is ON
  const inv = await seedInvoice(P);
  const res = await api("POST", "/invoice-payments", "recorder", { ...pay(P, inv.invoiceNo, "60000.00", [["TDS", "40000.00"]]), gst: { ratePercent: "18", amount: "18000.00" } });
  assert.equal(res.status, 201, res.message);
  assert.equal(res.data.newInvoiceStatus, "Paid", "settled against the invoice amount alone, with no GST due");
  const row = await prisma.invoicePayment.findUniqueOrThrow({ where: { id: res.data.payment.id }, include: { receipts: true } });
  assert.deepEqual([row.gstApplicable, row.gstAmount, row.gstRatePercent, row.receipts[0]!.gstReceived.toFixed(2)], [false, null, null, "0.00"], "a GST figure in the request is not stored");
  // No GST appears in the payment, its receipts / deductions or the settlement summary; the only GST in the response is the invoice's own breakdown,
  // which for a legacy invoice says so and adds no tax.
  const paymentText = JSON.stringify({ payment: res.data.payment, summary: res.data.overview.summary, payments: res.data.overview.payments });
  assert.ok(!/"gst[A-Za-z]*"|GST/.test(paymentText), `no GST key or text in the payment / summary: ${paymentText.match(/.{30}("gst[A-Za-z]*"|GST).{30}/)?.[0]}`);
  assert.deepEqual([res.data.overview.invoice.gst.availability, res.data.overview.invoice.gst.gstAmount, res.data.overview.invoice.gst.totalAmount], ["LEGACY", "0.00", "100000.00"]);

  const other = await seedInvoice(P);
  const gstTds = await api("POST", "/invoice-payments", "recorder", pay(P, other.invoiceNo, "1.00", [["GST_TDS", "1.00"]]));
  assert.equal(gstTds.status, 400);
  assert.equal(gstTds.body.errors[0].message, "Unknown deduction category.");
});

// ── Currency ────────────────────────────────────────────────────────────────────────────────────

test("USD: invoice USD 6,000, bank USD 5,000 + TDS USD 1,000 -> Paid, settled in USD; the INR figure never enters", async () => {
  const P = projects.USD!;
  const inv = await seedInvoice(P, { currency: "USD", original: 6000, inr: 540000, rate: 90 });
  const view = await overviewOf("recorder", P, inv.invoiceNo);
  assert.deepEqual([view.data.invoice.currency, view.data.invoice.invoiceAmount, view.data.invoice.exchangeRateToINR], ["USD", "6000.00", "90"]);
  const res = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "5000.00", [["TDS", "1000.00"]], { currency: "USD" }));
  assert.equal(res.status, 201, res.message);
  assert.equal(res.data.newInvoiceStatus, "Paid");
  assert.deepEqual([res.data.overview.summary.bankReceived, res.data.overview.summary.totalSettled, res.data.payment.currency], ["5000.00", "6000.00", "USD"]);
  assert.equal((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: inv.lineIds[0]! } })).invoiceAmountINR, 540000, "the invoice's INR amount is untouched");
  // A USD amount that is short is Partially Paid in USD, and one that is over is refused naming USD.
  const half = await seedInvoice(P, { currency: "USD", original: 6000, inr: 540000, rate: 90 });
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, half.invoiceNo, "3000.00"))).data.newInvoiceStatus, "PartiallyPaid");
  const over = await api("POST", "/invoice-payments", "recorder", pay(P, half.invoiceNo, "3000.01"));
  assert.equal(over.status, 422);
  assert.match(over.message ?? "", /exceeds the invoice amount of USD 6000\.00 by USD 0\.01/);
});

test("receipt currency must match the invoice currency", async () => {
  const P = projects.USD!;
  const inv = await seedInvoice(P, { currency: "USD", original: 1000, inr: 83000, rate: 83 });
  const wrong = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "900.00", [], { currency: "INR" }));
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.errors[0].path, "currency");
  assert.match(wrong.body.errors[0].message, /must match the invoice currency \(USD\)/);
  assert.equal(await paymentCount(P.id, inv.invoiceNo), 0);
});

test("AED keeps two decimals: three are rejected, never rounded", async () => {
  const P = projects.AED!;
  const inv = await seedInvoice(P, { currency: "AED", original: 1234.56, inr: 28000, rate: 22.68 });
  const three = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "1111.105", [["TDS", "123.46"]], { currency: "AED" }));
  assert.equal(three.status, 400);
  assert.equal(three.body.errors[0].path, "receipts.0.amountReceived");
  assert.match(three.body.errors[0].message, /at most 2 decimal places/);
  const ok = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "1111.10", [["TDS", "123.46"]], { currency: "AED" }));
  assert.equal(ok.status, 201, ok.message);
  assert.equal(ok.data.newInvoiceStatus, "Paid");
});

test("OMR accepts and persists three decimals exactly; one baisa short is Partially Paid, one over is refused", async () => {
  const P = projects.OMR!;
  const inv = await seedInvoice(P, { currency: "OMR", original: 1000.125, inr: 220027.5, rate: 220 });
  const short = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "900.124", [["TDS", "100.000"]], { currency: "OMR" }));
  assert.equal(short.status, 201, short.message);
  assert.equal(short.data.newInvoiceStatus, "PartiallyPaid");
  assert.equal(short.data.overview.summary.outstanding, "0.001");
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "0.002", [], { currency: "OMR" }))).status, 422);
  const exact = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "0.001", [], { currency: "OMR" }));
  assert.equal(exact.status, 201, exact.message);
  assert.equal(exact.data.newInvoiceStatus, "Paid");
  const rows = await prisma.invoicePaymentReceipt.findMany({ where: { payment: { projectId: P.id, invoiceNo: inv.invoiceNo } } });
  assert.deepEqual(rows.map((r) => r.amountReceived.toFixed(3)).sort(), ["0.001", "900.124"]);
});

// ── Nothing is mandatory; what is typed is validated ────────────────────────────────────────────

test("no field is mandatory: only an amount is needed — no date, reference, notes, reason or other deduction", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const bare = await api("POST", "/invoice-payments", "recorder", { projectId: P.id, invoiceNo: inv.invoiceNo, idempotencyKey: randomUUID(), receipts: [{ amountReceived: "40000" }], adjustments: [{ category: "WAIVE_OFF", amount: "1000" }, { category: "TDS", amount: "", reason: "typed but no amount" }, { category: "LD_AMOUNT", amount: "0" }] });
  assert.equal(bare.status, 201, bare.message);
  assert.deepEqual([bare.data.payment.receipts[0].paymentDate, bare.data.payment.receipts[0].reference], [null, ""]);
  assert.deepEqual(bare.data.payment.adjustments.map((a: any) => a.category), ["WAIVE_OFF"], "entries without an amount record nothing");
  const empty = await api("POST", "/invoice-payments", "recorder", { projectId: P.id, invoiceNo: inv.invoiceNo, idempotencyKey: randomUUID(), receipts: [{}], adjustments: [] });
  assert.equal(empty.status, 400);
  assert.match(empty.body.errors[0].message, /at least one amount/);
});

test("invalid payloads are rejected field by field and nothing is persisted", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const bad = async (over: Record<string, unknown>) => api("POST", "/invoice-payments", "recorder", { ...pay(P, inv.invoiceNo, "1.00"), ...over });
  const field = (r: { body: any }) => r.body.errors.map((e: any) => e.path);
  const r = (extra: Record<string, unknown>) => ({ receipts: [{ amountReceived: "1", ...extra }] });

  assert.ok(field(await bad(r({ paymentDate: "2026-02-31" }))).includes("receipts.0.paymentDate"));
  assert.ok(field(await bad(r({ paymentDate: "12026-10-30" }))).includes("receipts.0.paymentDate"));
  assert.ok(field(await bad(r({ paymentDate: "2999-01-01" }))).includes("receipts.0.paymentDate"), "a future payment date");
  assert.ok(field(await bad(r({ amountReceived: "-5" }))).includes("receipts.0.amountReceived"));
  assert.ok(field(await bad(r({ amountReceived: "1e3" }))).includes("receipts.0.amountReceived"));
  assert.ok(field(await bad(r({ amountReceived: "1.234" }))).includes("receipts.0.amountReceived"));
  assert.ok(field(await bad(r({ reference: "x".repeat(101) }))).includes("receipts.0.reference"));
  assert.ok(field(await bad({ adjustments: [{ category: "BOGUS", amount: "1" }] })).includes("adjustments.0.category"));
  assert.ok(field(await bad({ adjustments: [{ category: "TDS", amount: "1.999" }] })).includes("adjustments.0.amount"));
  assert.ok(field(await bad({ adjustments: [{ category: "TDS", amount: "1", exchangeRate: "83" }] })).includes("adjustments.0.exchangeRate"));
  assert.equal((await bad({ idempotencyKey: "not-a-uuid" })).status, 400);
  assert.equal((await api("POST", "/invoice-payments", "recorder", { projectId: P.id })).status, 400);
  assert.equal(await paymentCount(P.id, inv.invoiceNo), 0);
  assert.deepEqual(await lineStatuses(inv.lineIds), ["Raised"]);
});

test("an invoice that is Draft, already Paid, or unknown cannot take a payment", async () => {
  const P = projects.INR!;
  const draft = await seedInvoice(P, { status: "Draft" });
  const paid = await seedInvoice(P, { status: "Paid" });
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, draft.invoiceNo, "1.00"))).status, 409);
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, paid.invoiceNo, "1.00"))).status, 409);
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, `${TAG}-NOPE`, "1.00"))).status, 404);
  assert.equal((await overviewOf("recorder", P, `${TAG}-NOPE`)).status, 404);
});

// ── Preview ─────────────────────────────────────────────────────────────────────────────────────

test("preview returns the backend's settlement and the already-recorded amounts without persisting anything", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "20000.00", [["TDS", "5000.00"]]))).status, 201);
  const count = await paymentCount(P.id, inv.invoiceNo);

  const ok = await api("POST", "/invoice-payments/preview", "recorder", pay(P, inv.invoiceNo, "75000.00"));
  assert.deepEqual([ok.data.valid, ok.data.canSave, ok.data.summary.resultingStatus, ok.data.summary.outstanding], [true, true, "Paid", "0.00"]);
  assert.deepEqual([ok.data.alreadyRecorded.bankReceived, ok.data.alreadyRecorded.deductions, ok.data.alreadyRecorded.totalSettled], ["20000.00", "5000.00", "25000.00"]);

  const over = await api("POST", "/invoice-payments/preview", "recorder", pay(P, inv.invoiceNo, "75000.01"));
  assert.deepEqual([over.data.valid, over.data.canSave, over.data.summary.outcome], [true, false, "INVALID"]);

  const invalid = await api("POST", "/invoice-payments/preview", "recorder", pay(P, inv.invoiceNo, ""));
  assert.deepEqual([invalid.data.valid, invalid.data.canSave, invalid.data.summary], [false, false, null]);
  assert.equal(await paymentCount(P.id, inv.invoiceNo), count);
});

// ── Authorization ───────────────────────────────────────────────────────────────────────────────

test("authorization: approval, module, Read Only and project access are enforced on the backend", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const attempt = (who: string, p = P, no = inv.invoiceNo) => api("POST", "/invoice-payments", who, pay(p, no, "1000.00"));

  assert.equal((await attempt("noApproval")).status, 403, "no Edit Invoice approval");
  assert.equal((await attempt("noModule")).status, 403, "no Invoices module");
  assert.equal((await attempt("readOnly")).status, 403, "Read Only role");
  assert.equal((await api("POST", "/invoice-payments/preview", "noApproval", pay(P, inv.invoiceNo, "1.00"))).status, 403);

  const owned = projects.OWNED!;
  const ownedInv = await seedInvoice(owned);
  assert.equal((await attempt("recorder", owned, ownedInv.invoiceNo)).status, 403, "a project the caller cannot access");
  assert.equal((await overviewOf("recorder", owned, ownedInv.invoiceNo)).status, 403);
  assert.equal((await attempt("admin", owned, ownedInv.invoiceNo)).status, 403, "an Administrator without the approval still needs it");
  assert.equal((await api("POST", "/invoice-payments", "recorder", { ...pay(P, inv.invoiceNo, "1.00"), projectId: "nope" })).status, 404);

  assert.equal(await paymentCount(P.id, inv.invoiceNo), 0);
  assert.equal(await paymentCount(owned.id, ownedInv.invoiceNo), 0);
  assert.deepEqual(await lineStatuses(inv.lineIds), ["Raised"]);

  const view = await overviewOf("readOnly", P, inv.invoiceNo);
  assert.equal(view.status, 200);
  assert.equal(view.data.invoice.canRecord, false);
  assert.equal((await overviewOf("noApproval", P, inv.invoiceNo)).data.invoice.canRecord, false);
  assert.equal((await overviewOf("recorder", P, inv.invoiceNo)).data.invoice.canRecord, true);
  assert.equal((await overviewOf("noModule", P, inv.invoiceNo)).status, 403);
});

// ── Duplicate submission and concurrency ────────────────────────────────────────────────────────

test("a repeated Save of the same attempt returns the stored payment; the same key for another invoice or user is refused", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const payload = pay(P, inv.invoiceNo, "100000.00");
  const first = await api("POST", "/invoice-payments", "recorder", payload);
  const again = await api("POST", "/invoice-payments", "recorder", payload);
  assert.deepEqual([first.status, again.status, again.data.replayed, again.data.payment.id === first.data.payment.id], [201, 200, true, true]);
  assert.equal(await paymentCount(P.id, inv.invoiceNo), 1);
  assert.equal(await prisma.invoicePaymentEvent.count({ where: { paymentId: first.data.payment.id } }), 1);
  assert.equal(await prisma.invoiceStatusEvent.count({ where: { invoiceLineId: { in: inv.lineIds } } }), 1);
  const other = await seedInvoice(P);
  assert.equal((await api("POST", "/invoice-payments", "recorder", { ...payload, invoiceNo: other.invoiceNo })).status, 409);
  assert.equal((await api("POST", "/invoice-payments", "recorder2", payload)).status, 409);
});

test("rapid repeated Save clicks (same attempt, concurrent) create exactly one payment", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const payload = pay(P, inv.invoiceNo, "60000.00", [["TDS", "10000.00"]]);
  const results = await Promise.all(Array.from({ length: 6 }, () => api("POST", "/invoice-payments", "recorder", payload)));
  assert.ok(results.every((r) => r.status === 201 || r.status === 200), results.map((r) => r.status).join(","));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(new Set(results.map((r) => r.data.payment.id)).size, 1);
  assert.equal(await paymentCount(P.id, inv.invoiceNo), 1);
  assert.equal(await prisma.invoiceStatusEvent.count({ where: { invoiceLineId: { in: inv.lineIds } } }), 1);
});

test("two users settling the same invoice at once: the totals can never exceed the invoice amount", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const [a, b] = await Promise.all([
    api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "100000.00")),
    api("POST", "/invoice-payments", "recorder2", pay(P, inv.invoiceNo, "100000.00")),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  assert.equal(await paymentCount(P.id, inv.invoiceNo), 1);
  assert.deepEqual(await lineStatuses(inv.lineIds), ["Paid"]);

  const part = await seedInvoice(P);
  const racers = await Promise.all([
    api("POST", "/invoice-payments", "recorder", pay(P, part.invoiceNo, "60000.00")),
    api("POST", "/invoice-payments", "recorder2", pay(P, part.invoiceNo, "60000.00")),
  ]);
  assert.deepEqual(racers.map((r) => r.status).sort(), [201, 422], "the second would push the total over 1,00,000, so it is refused");
  const view = await overviewOf("recorder", P, part.invoiceNo);
  assert.equal(view.data.summary.totalSettled, "60000.00");
});

// ── Transaction rollback ────────────────────────────────────────────────────────────────────────

test("transaction rollback: a failure while updating the invoice status leaves no payment, no event, and the status untouched", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION ${TRIGGER}() RETURNS trigger AS $$ BEGIN IF NEW."invoiceNo" = '${inv.invoiceNo}' THEN RAISE EXCEPTION 'forced failure for rollback test'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(`CREATE TRIGGER ${TRIGGER} BEFORE INSERT ON "InvoiceStatusEvent" FOR EACH ROW EXECUTE FUNCTION ${TRIGGER}()`);
  try {
    const res = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "100000.00"));
    assert.equal(res.status, 500);
    assert.equal(await paymentCount(P.id, inv.invoiceNo), 0, "the payment row was rolled back");
    assert.equal(await prisma.invoicePaymentEvent.count({ where: { projectId: P.id, invoiceNo: inv.invoiceNo } }), 0);
    assert.deepEqual(await lineStatuses(inv.lineIds), ["Raised"]);
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${TRIGGER} ON "InvoiceStatusEvent"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${TRIGGER}()`);
  }
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "100000.00"))).status, 201);
});

// ── Reversal / correction ───────────────────────────────────────────────────────────────────────

test("reversal: needs a reason and the approval; Paid -> Partially Paid -> Raised as payments are reversed; excluded from totals; audited; not repeatable", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P, { lines: 2 });
  const a = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "60000.00"));
  const b = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "30000.00", [["TDS", "10000.00"]]));
  assert.deepEqual(await lineStatuses(inv.lineIds), ["Paid", "Paid"]);
  const idB = b.data.payment.id as string;

  assert.equal((await api("POST", `/invoice-payments/${idB}/reverse`, "recorder", { reason: "" })).status, 400);
  assert.equal((await api("POST", `/invoice-payments/${idB}/reverse`, "noApproval", { reason: "wrong amount" })).status, 403);
  assert.equal((await api("POST", `/invoice-payments/${idB}/reverse`, "readOnly", { reason: "wrong amount" })).status, 403);
  assert.equal((await api("POST", `/invoice-payments/nope/reverse`, "recorder", { reason: "wrong amount" })).status, 404);
  assert.deepEqual(await lineStatuses(inv.lineIds), ["Paid", "Paid"], "refused attempts changed nothing");

  // Reversing the second payment: back to Partially Paid, and its amounts no longer count.
  const r1 = await api("POST", `/invoice-payments/${idB}/reverse`, "recorder2", { reason: "Bank credit was reversed by the bank" });
  assert.equal(r1.status, 200, r1.message);
  assert.equal(r1.data.newInvoiceStatus, "PartiallyPaid");
  assert.deepEqual(await lineStatuses(inv.lineIds), ["PartiallyPaid", "PartiallyPaid"]);
  assert.deepEqual([r1.data.overview.summary.bankReceived, r1.data.overview.summary.deductions, r1.data.overview.summary.outstanding], ["60000.00", "0.00", "40000.00"]);
  assert.deepEqual(r1.data.overview.payments.map((p: any) => p.id), [a.data.payment.id], "only the active payment is listed");
  assert.deepEqual([r1.data.overview.reversedPayments[0].reversal.byName, r1.data.overview.reversedPayments[0].reversal.reason], ["Ipay recorder2", "Bank credit was reversed by the bank"]);
  assert.equal((await api("POST", `/invoice-payments/${idB}/reverse`, "recorder", { reason: "again" })).status, 409, "already reversed");

  // Reversing the first as well: nothing left, the invoice returns to the status it had before any payment.
  const r2 = await api("POST", `/invoice-payments/${a.data.payment.id}/reverse`, "recorder", { reason: "entered on the wrong invoice" });
  assert.equal(r2.data.newInvoiceStatus, "Raised");
  assert.deepEqual(await lineStatuses(inv.lineIds), ["Raised", "Raised"]);
  assert.deepEqual([r2.data.overview.payments, r2.data.overview.summary.outcome], [[], "NONE"]);

  // Audit: payment events and the status history, in order.
  const events = await prisma.invoicePaymentEvent.findMany({ where: { paymentId: idB }, orderBy: [{ occurredAt: "asc" }, { seq: "asc" }] });
  assert.deepEqual(events.map((e) => [e.eventType, e.actorUserId]), [["PAYMENT_RECORDED", people.recorder!.id], ["PAYMENT_REVERSED", people.recorder2!.id]]);
  const history = await prisma.invoiceStatusEvent.findMany({ where: { invoiceLineId: inv.lineIds[0]! }, orderBy: [{ occurredAt: "asc" }, { seq: "asc" }] });
  assert.deepEqual(history.map((e) => [e.fromStatus, e.toStatus, e.source]), [
    ["Raised", "PartiallyPaid", "invoice_payment"],
    ["PartiallyPaid", "Paid", "invoice_payment"],
    ["Paid", "PartiallyPaid", "invoice_payment_reversal"],
    ["PartiallyPaid", "Raised", "invoice_payment_reversal"],
  ]);

  // A correction is a new payment, and it works.
  const again = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "100000.00"));
  assert.equal(again.status, 201, again.message);
  assert.equal(again.data.overview.payments.length, 1);
  assert.equal(again.data.overview.reversedPayments.length, 2);
  assert.equal(await paymentCount(P.id, inv.invoiceNo), 3, "all three rows exist in the database");
});

test("a reversed payment is excluded from every total but its row, reason and audit events are preserved; a fresh payment is not blocked", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const first = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "20000.00", [["SECURITY_DEPOSIT", "100.00"]]));
  const id = first.data.payment.id as string;
  assert.equal((await api("POST", `/invoice-payments/${id}/reverse`, "recorder", { reason: "entered on the wrong invoice" })).status, 200);
  const view = await overviewOf("recorder", P, inv.invoiceNo);
  assert.deepEqual([view.data.payments, view.data.summary.bankReceived, view.data.summary.deductions, view.data.summary.outstanding], [[], "0.00", "0.00", "100000.00"]);
  assert.equal(view.data.reversedPayments[0].adjustments[0].category, "SECURITY_DEPOSIT");
  const row = await prisma.invoicePayment.findUniqueOrThrow({ where: { id }, include: { receipts: true, adjustments: true } });
  assert.deepEqual([row.status, row.reversalReason, row.receipts.length, row.adjustments.length], ["REVERSED", "entered on the wrong invoice", 1, 1]);
  const fresh = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "100000.00"));
  assert.equal(fresh.status, 201, fresh.message);
  assert.equal(fresh.data.overview.summary.bankReceived, "100000.00", "only the new payment counts");
});

test("the invoice is re-raised after a reversal: the old reversed payment neither shows nor blocks a payment on the new invoice, and its audit trail is intact", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  await prisma.invoiceNumber.create({ data: { invoiceNo: inv.invoiceNo, normalizedInvoiceNo: inv.invoiceNo.toUpperCase(), projectId: P.id } });
  const paid = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "100000.00"));
  const oldId = paid.data.payment.id as string;
  assert.equal((await api("POST", `/invoice-payments/${oldId}/reverse`, "recorder", { reason: "invoice must be re-raised" })).status, 200);
  assert.equal((await patchLine("recorder", inv.lineIds[0]!, { status: "Cancelled" })).status, 200);
  // Re-raising on a project whose GST switch is ON is a deliberate raise, so the GST choice is explicit (0% here keeps the target at the taxable 1,00,000).
  const reraised = await api("POST", `/quantity/${P.qi}/invoice-lines`, "recorder", { invoiceNo: inv.invoiceNo, invoiceIntent: "existing", invoiceDate: "2026-10-02", quantityBilled: 0, invoiceAmountINR: 100000, status: "Raised", gst: { applicable: true, ratePercent: 0, taxType: "IGST" } });
  assert.equal(reraised.status, 201, reraised.message);
  const before = await overviewOf("recorder", P, inv.invoiceNo);
  assert.deepEqual([before.data.payments, before.data.invoice.status, before.data.invoice.recordBlockedReason], [[], "Raised", null]);
  const fresh = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "100000.00"));
  assert.equal(fresh.status, 201, fresh.message);
  assert.deepEqual(await lineStatuses([reraised.data.id]), ["Paid"]);
  assert.deepEqual([fresh.data.overview.payments.length, fresh.data.overview.reversedPayments.length], [1, 1]);
  const events = await prisma.invoicePaymentEvent.findMany({ where: { paymentId: oldId }, orderBy: [{ occurredAt: "asc" }, { seq: "asc" }] });
  assert.deepEqual(events.map((e) => e.eventType), ["PAYMENT_RECORDED", "PAYMENT_REVERSED"]);
});

// ── No bypass of the workflow ───────────────────────────────────────────────────────────────────

const patchBody = (line: any, over: Record<string, unknown> = {}) => ({
  invoiceNo: line.invoiceNo, invoiceDate: String(line.invoiceDate).slice(0, 10), milestoneId: null, milestoneName: null, setIndex: null, description: null,
  quantityBilled: line.quantityBilled, invoiceAmountINR: line.invoiceAmountINR, clientReference: null, remarks: line.remarks ?? null, status: line.status, createdBy: "x", ...over,
});
const patchLine = async (who: string, id: string, over: Record<string, unknown> = {}) => {
  const line = await prisma.invoiceLine.findUniqueOrThrow({ where: { id } });
  return api("PATCH", `/invoice-lines/${id}`, who, patchBody({ ...line, invoiceDate: line.invoiceDate.toISOString() }, over));
};

test("a status PATCH can no longer make an invoice Paid; unchanged re-sends and legacy changes still work", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const lineId = inv.lineIds[0]!;
  const toPaid = await patchLine("recorder", lineId, { status: "Paid" });
  assert.equal(toPaid.status, 409);
  assert.match(toPaid.message ?? "", /payment is recorded in Invoice Payment Details/);
  assert.equal((await api("PATCH", `/invoice-lines/${lineId}`, "recorder", { status: "Paid" })).status, 409, "direct partial API call");
  assert.deepEqual(await lineStatuses(inv.lineIds), ["Raised"]);
  assert.equal((await patchLine("recorder", lineId, { remarks: "edited" })).status, 200);

  // A legacy line that is ALREADY Paid (no payment record) keeps working.
  const legacy = await seedInvoice(P, { status: "Paid" });
  assert.equal((await patchLine("recorder", legacy.lineIds[0]!, { remarks: "legacy edit" })).status, 200);
  assert.equal((await patchLine("recorder", legacy.lineIds[0]!, { status: "Raised" })).status, 200);
});

test("a recorded payment anchors the invoice: amount, number, cancel, leaving Paid / Partially Paid and delete are refused until it is reversed", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const lineId = inv.lineIds[0]!;
  const saved = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "70000.00"));
  assert.equal(saved.status, 201);
  assert.deepEqual(await lineStatuses(inv.lineIds), ["PartiallyPaid"]);
  assert.equal((await patchLine("recorder", lineId, { invoiceAmountINR: 60000 })).status, 409);
  assert.equal((await patchLine("recorder", lineId, { invoiceNo: `${inv.invoiceNo}-X` })).status, 409);
  assert.equal((await patchLine("recorder", lineId, { status: "Cancelled" })).status, 409);
  assert.equal((await patchLine("recorder", lineId, { status: "Raised" })).status, 409, "a Partially Paid invoice with a recorded payment cannot be set back");
  assert.equal((await api("DELETE", `/invoice-lines/${lineId}`, "recorder")).status, 409);
  assert.equal((await patchLine("recorder", lineId, { remarks: "note after payment" })).status, 200);
  assert.equal((await api("POST", `/invoice-payments/${saved.data.payment.id}/reverse`, "recorder", { reason: "re-entering" })).status, 200);
  assert.equal((await patchLine("recorder", lineId, { invoiceAmountINR: 60000 })).status, 200, "free again after the reversal");
});

// ── Dashboard and reports ───────────────────────────────────────────────────────────────────────

const kpis = async () => (await api("GET", "/dashboard/summary", "viewer")).data.kpis as { totalPaymentReceived: number; totalOutstanding: number; totalInvoiceRaised: number };

test("Cash Realized is the ACTUAL bank cash and Outstanding falls by everything settled (deductions included)", async () => {
  const P = projects.INR!;
  const inv = await seedInvoice(P);
  const k0 = await kpis();
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "70000.00", [["TDS", "10000.00"]]))).status, 201);
  const k1 = await kpis();
  assert.equal(k1.totalPaymentReceived - k0.totalPaymentReceived, 70000, "bank cash only");
  assert.equal(k0.totalOutstanding - k1.totalOutstanding, 80000, "outstanding falls by bank + deductions");
  assert.equal(k1.totalInvoiceRaised, k0.totalInvoiceRaised);
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "0", [["SECURITY_DEPOSIT", "20000.00"]]))).status, 201);
  const k2 = await kpis();
  assert.equal(k2.totalPaymentReceived - k0.totalPaymentReceived, 70000, "a deduction is never cash");
  assert.equal(k0.totalOutstanding - k2.totalOutstanding, 100000);
});

test("a Paid line with NO payment record keeps counting its full invoice amount (legacy rule unchanged)", async () => {
  const P = projects.INR!;
  const k0 = await kpis();
  await seedInvoice(P, { status: "Paid", original: 7000 });
  const k1 = await kpis();
  assert.equal(k1.totalPaymentReceived - k0.totalPaymentReceived, 7000);
  assert.equal(k0.totalOutstanding - k1.totalOutstanding, 7000);
});

test("a foreign invoice's cash is converted at the invoice's own recorded rate; reversing takes it back out", async () => {
  const P = projects.USD!;
  const inv = await seedInvoice(P, { currency: "USD", original: 6000, inr: 540000, rate: 90 });
  const k0 = await kpis();
  const saved = await api("POST", "/invoice-payments", "recorder", pay(P, inv.invoiceNo, "5000.00", [["TDS", "1000.00"]], { currency: "USD" }));
  assert.equal(saved.status, 201, saved.message);
  const k1 = await kpis();
  assert.equal(k1.totalPaymentReceived - k0.totalPaymentReceived, 450000, "USD 5,000 at the invoice's own rate of 90");
  assert.equal(k0.totalOutstanding - k1.totalOutstanding, 540000);
  const items = await api("GET", `/projects/${P.id}/invoice-items`, "recorder");
  const lineDto = items.data.items.flatMap((i: any) => i.invoices).find((l: any) => l.invoiceNo === inv.invoiceNo);
  assert.deepEqual([lineDto.recordedCashINR, lineDto.settledINR, lineDto.status], [450000, 540000, "Paid"]);
  const report = await api("GET", "/invoice-items", "viewer");
  const reportLine = report.data.items.find((l: any) => l.id === inv.lineIds[0]);
  assert.deepEqual([reportLine.recordedCashINR, reportLine.settledINR], [450000, 540000]);
  assert.equal((await api("POST", `/invoice-payments/${saved.data.payment.id}/reverse`, "recorder", { reason: "test reversal" })).status, 200);
  const k2 = await kpis();
  assert.deepEqual([k2.totalPaymentReceived, k2.totalOutstanding], [k0.totalPaymentReceived, k0.totalOutstanding]);
  const after = await api("GET", `/projects/${P.id}/invoice-items`, "recorder");
  assert.equal("recordedCashINR" in after.data.items.flatMap((i: any) => i.invoices).find((l: any) => l.invoiceNo === inv.invoiceNo), false);
});

// ── Audit trail is append-only ──────────────────────────────────────────────────────────────────

test("no code updates or deletes a payment audit event or edits a payment row outside the reviewed paths (source scan)", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name) && !/testutil\.ts$/.test(name)) {
        const text = readFileSync(full, "utf8");
        if (/invoicePaymentEvent\.(update|updateMany|delete|deleteMany|upsert)\b/.test(text)) offenders.push(`${full}: mutates InvoicePaymentEvent`);
        if (/invoicePayment(Receipt|Adjustment)\.(update|updateMany|delete|deleteMany|upsert)\b/.test(text)) offenders.push(`${full}: mutates a receipt/adjustment`);
        if (/invoicePayment\.(delete|deleteMany)\b/.test(text)) offenders.push(`${full}: deletes a payment`);
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});
