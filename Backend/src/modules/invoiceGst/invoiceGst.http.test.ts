import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Invoice-level GST snapshot + GST-inclusive Record Payment - real HTTP against the real app and the local scratch database. Isolated tagged data,
 * cleaned up in `after`; no invoice request exists and SMTP is blank, so no email path is reachable.
 *
 * Contract under test (confirmed decisions): the snapshot is created when an invoice is first raised, then FROZEN (rate/type) while its taxable amount
 * and GST follow the invoice lines; a rename carries it; a missing snapshot is a LEGACY invoice (settles on its taxable value, never backfilled);
 * Record Payment settles against taxable + saved GST; GST is an invoice component, never a deduction.
 */

const TAG = `igst-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => {};
const userIds: string[] = [];
const projectIds: string[] = [];
const people: Record<string, { id: string; headers: Record<string, string> }> = {};
interface ProjectFx { id: string; qi: string }
const projects: Record<string, ProjectFx> = {};

async function api(method: string, path: string, who: string, body?: unknown) {
  const res = await fetch(`${url}${path}`, { method, headers: people[who]!.headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, body: json, data: json.data, message: json.message as string | undefined };
}

let counter = 0;
const nextNo = () => `${TAG}-INV-${++counter}`;
const gst18 = (extra: Record<string, unknown> = {}) => ({ applicable: true, ratePercent: 18, taxType: "CGST_SGST", buyerStateKnown: true, ...extra });

/** Raises a NEW single-line invoice through the real route. */
function createLine(P: ProjectFx, invoiceNo: string, amount: number, extra: Record<string, unknown> = {}) {
  return api("POST", `/quantity/${P.qi}/invoice-lines`, "recorder", { invoiceNo, invoiceIntent: "new", invoiceDate: "2026-11-01", quantityBilled: 0, invoiceAmountINR: amount, status: "Raised", ...extra });
}
const snapshotOf = async (invoiceNo: string) => (await prisma.invoiceNumber.findUnique({ where: { normalizedInvoiceNo: invoiceNo.toUpperCase() }, include: { gstSnapshot: true } }))?.gstSnapshot ?? null;
const dec = (v: { toFixed(n: number): string } | null | undefined) => (v === null || v === undefined ? null : v.toFixed(2));
const overviewOf = (P: ProjectFx, invoiceNo: string) => api("GET", `/invoice-payments?projectId=${P.id}&invoiceNo=${encodeURIComponent(invoiceNo)}`, "recorder");
const lineIdsOf = async (invoiceNo: string) => (await prisma.invoiceLine.findMany({ where: { invoiceNo }, orderBy: { createdAt: "asc" } })).map((l) => l.id);
const statusesOf = async (invoiceNo: string) => (await prisma.invoiceLine.findMany({ where: { invoiceNo } })).map((l) => l.status);

function pay(P: ProjectFx, invoiceNo: string, bank: string, deductions: Array<[string, string] | Record<string, unknown>> = [], extra: Record<string, unknown> = {}) {
  return {
    projectId: P.id, invoiceNo, idempotencyKey: randomUUID(),
    receipts: bank === "" ? [] : [{ paymentDate: "2026-11-02", amountReceived: bank, reference: "UTR-1" }],
    adjustments: deductions.map((d) => (Array.isArray(d) ? { category: d[0], amount: d[1] } : d)),
    ...extra,
  };
}

before(async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  const [engineer, invoicesM, projectsM, raise, edit, del] = await Promise.all([
    prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Invoices" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Projects" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Raise Invoice" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Edit Invoice" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Delete Invoice" } }),
  ]);
  const passwordHash = await hashPassword("IgstTest@123");
  const email = `${TAG}-recorder@example.com`;
  const u = await prisma.portalUser.create({
    data: {
      fullName: "Igst recorder", email, passwordHash, department: "Accounts", roleId: engineer.id, forcePasswordChange: false,
      moduleAccess: { create: [projectsM.id, invoicesM.id].map((moduleId) => ({ moduleId })) },
      approvalPermissions: { create: [raise.id, edit.id, del.id].map((approvalTypeId) => ({ approvalTypeId })) },
    },
  });
  userIds.push(u.id);
  people.recorder = { id: u.id, headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: u.id, email, roleId: engineer.id, roleName: engineer.name })}` } };

  const mkProject = async (suffix: string, extra: { currency?: string; gstApplicable?: boolean } = {}) => {
    const p = await prisma.project.create({
      data: {
        poMonth: "2026-11", prCategory: "India", prNo: `${TAG}-${suffix}`, client: "Igst Client", department: "Process", domesticForeign: "Domestic",
        projectTitle: `Igst ${suffix}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM",
        currency: extra.currency ?? "INR", gstApplicable: extra.gstApplicable ?? false,
      },
    });
    projectIds.push(p.id);
    const qi = (await prisma.quantityItem.create({ data: { projectId: p.id, description: "Item", woQty: 1000, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 100_000_000 } })).id;
    projects[suffix] = { id: p.id, qi };
  };
  await mkProject("GST", { gstApplicable: true }); // GST switch ON, INR  -> GST-eligible
  await mkProject("PLAIN"); // switch OFF, INR       -> GST not applicable
  await mkProject("GSTUSD", { gstApplicable: true, currency: "USD" }); // switch ON but project priced in USD -> not eligible
});

after(async () => {
  try {
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

// ── Snapshot creation ───────────────────────────────────────────────────────────────────────────

test("raising a new invoice at 18% saves the snapshot: taxable 90,000 + GST 16,200 = 1,06,200 (CGST 8,100 + SGST 8,100)", async () => {
  const P = projects.GST!;
  const no = nextNo();
  const res = await createLine(P, no, 90000, { gst: gst18({ expectedGstAmount: 16200 }) });
  assert.equal(res.status, 201, res.message);
  const s = (await snapshotOf(no))!;
  assert.ok(s, "a snapshot exists");
  assert.deepEqual([s.gstStatus, s.ratePercent?.toFixed(4), s.taxType, s.buyerStateKnown, s.currency], ["APPLICABLE", "18.0000", "CGST_SGST", true, "INR"]);
  assert.deepEqual([dec(s.taxableAmount), dec(s.cgstAmount), dec(s.sgstAmount), dec(s.igstAmount), dec(s.gstAmount), dec(s.totalAmount)], ["90000.00", "8100.00", "8100.00", "0.00", "16200.00", "106200.00"]);
  // the line itself is untouched by GST: its amount is still the taxable value
  assert.equal((await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceNo: no } })).invoiceAmountINR, 90000);
  // exposed on the invoice list for every line of the invoice
  const list = await api("GET", `/projects/${P.id}/invoice-items`, "recorder");
  const line = list.data.items.flatMap((i: any) => i.invoices).find((l: any) => l.invoiceNo === no);
  assert.deepEqual([line.gstSnapshot.gstStatus, line.gstSnapshot.ratePercent, line.gstSnapshot.gstAmount, line.gstSnapshot.totalAmount], ["APPLICABLE", "18", "16200.00", "106200.00"]);
});

test("variable rates 5%, 12%, 28%, a fractional 12.5% and an explicit 0% each save their own snapshot (IGST uses igstAmount)", async () => {
  const P = projects.GST!;
  const cases: Array<[number, "IGST" | "CGST_SGST", string, string]> = [[5, "IGST", "4500.00", "94500.00"], [12, "CGST_SGST", "10800.00", "100800.00"], [28, "IGST", "25200.00", "115200.00"], [12.5, "IGST", "11250.00", "101250.00"], [0, "IGST", "0.00", "90000.00"]];
  for (const [rate, taxType, gstAmount, total] of cases) {
    const no = nextNo();
    const res = await createLine(P, no, 90000, { gst: { applicable: true, ratePercent: rate, taxType, buyerStateKnown: false } });
    assert.equal(res.status, 201, `${rate}% ${res.message}`);
    const s = (await snapshotOf(no))!;
    assert.deepEqual([s.gstStatus, Number(s.ratePercent), s.taxType, dec(s.gstAmount), dec(s.totalAmount)], ["APPLICABLE", rate, taxType, gstAmount, total], `rate ${rate}`);
    assert.equal(dec(taxType === "IGST" ? s.igstAmount : s.cgstAmount), taxType === "IGST" ? gstAmount : (Number(gstAmount) / 2).toFixed(2));
    assert.equal(s.buyerStateKnown, false);
  }
});

test("GST is entered on the invoice, NOT taken from the project's Quantity-section switch: the same GST choice works on a project with the switch OFF or ON, and 'no GST' is its own explicit choice", async () => {
  // switch OFF project + GST declared on the invoice -> APPLICABLE
  const offNo = nextNo();
  assert.equal((await createLine(projects.PLAIN!, offNo, 90000, { gst: gst18() })).status, 201);
  const off = (await snapshotOf(offNo))!;
  assert.deepEqual([off.gstStatus, Number(off.ratePercent), off.taxType, dec(off.gstAmount), dec(off.totalAmount)], ["APPLICABLE", 18, "CGST_SGST", "16200.00", "106200.00"]);
  // switch ON project + a different rate chosen on the invoice -> that rate (the project switch carries no rate)
  const onNo = nextNo();
  assert.equal((await createLine(projects.GST!, onNo, 90000, { gst: { applicable: true, ratePercent: 5, taxType: "IGST", buyerStateKnown: false } })).status, 201);
  const on = (await snapshotOf(onNo))!;
  assert.deepEqual([on.gstStatus, Number(on.ratePercent), dec(on.gstAmount)], ["APPLICABLE", 5, "4500.00"]);
  // switch ON project, explicit 'no GST' -> NOT_APPLICABLE; and NO declaration at all -> NOT_APPLICABLE too (the switch does not force GST)
  const noGst = nextNo();
  assert.equal((await createLine(projects.GST!, noGst, 90000, { gst: { applicable: false } })).status, 201);
  assert.equal((await snapshotOf(noGst))!.gstStatus, "NOT_APPLICABLE");
  const none = nextNo();
  assert.equal((await createLine(projects.GST!, none, 90000)).status, 201);
  const n = (await snapshotOf(none))!;
  assert.deepEqual([n.gstStatus, dec(n.gstAmount), dec(n.totalAmount)], ["NOT_APPLICABLE", "0.00", "90000.00"]);
  // GST at 0% is still different from 'no GST'
  const zero = nextNo();
  assert.equal((await createLine(projects.PLAIN!, zero, 90000, { gst: { applicable: true, ratePercent: 0, taxType: "IGST" } })).status, 201);
  assert.equal((await snapshotOf(zero))!.gstStatus, "APPLICABLE");
});

test("an invoice with no GST declaration records NO GST, and a USD-priced project with GST ON also gets an explicit NOT_APPLICABLE snapshot decided by the server", async () => {
  const plain = nextNo();
  assert.equal((await createLine(projects.PLAIN!, plain, 50000)).status, 201);
  const a = (await snapshotOf(plain))!;
  assert.deepEqual([a.gstStatus, a.ratePercent, a.taxType, dec(a.gstAmount), dec(a.totalAmount)], ["NOT_APPLICABLE", null, null, "0.00", "50000.00"]);
  const usd = nextNo();
  const created = await createLine(projects.GSTUSD!, usd, 0, { currency: "USD", exchangeRateToINR: 90, invoiceAmountOriginal: 1000, invoiceAmountINR: undefined });
  assert.equal(created.status, 201, created.message);
  const b = (await snapshotOf(usd))!;
  assert.deepEqual([b.gstStatus, b.currency, dec(b.taxableAmount), dec(b.totalAmount)], ["NOT_APPLICABLE", "USD", "1000.00", "1000.00"]);
});

test("the server refuses inconsistent declarations, and the refused invoice is NOT created (the line and its snapshot are one transaction)", async () => {
  const P = projects.GST!;
  const cases: Array<[string, Record<string, unknown> | undefined, number, RegExp]> = [
    ["rate missing", { applicable: true, taxType: "IGST" }, 400, /rate|number/i],
    ["tax type missing (no state is assumed)", { applicable: true, ratePercent: 18 }, 400, /tax type/],
    ["rate above 100", { applicable: true, ratePercent: 150, taxType: "IGST" }, 400, /100/],
    ["a displayed GST amount that does not match the server's", gst18({ expectedGstAmount: 16000 }), 409, /does not match/],
  ];
  for (const [name, gst, status, message] of cases) {
    const no = nextNo();
    const res = await createLine(P, no, 90000, gst === undefined ? {} : { gst });
    assert.equal(res.status, status, `${name}: ${res.message}`);
    assert.match(res.message ?? JSON.stringify(res.body), message, name);
    assert.equal(await prisma.invoiceLine.count({ where: { invoiceNo: no } }), 0, `${name}: no line was created`);
    assert.equal(await prisma.invoiceNumber.count({ where: { normalizedInvoiceNo: no.toUpperCase() } }), 0, `${name}: the invoice number was not registered`);
  }
  const usdClaim = await createLine(projects.GSTUSD!, nextNo(), 90000, { currency: "USD", exchangeRateToINR: 90, invoiceAmountOriginal: 1000, gst: gst18() });
  assert.equal(usdClaim.status, 400, "GST never applies to a foreign-currency invoice");
  assert.match(usdClaim.message ?? "", /INR invoices only/);
});

// ── Draft, first raise, freezing ────────────────────────────────────────────────────────────────

test("a Draft has no snapshot; the first Draft -> Raised creates it; afterwards the rate and tax type are frozen against any later declaration", async () => {
  const P = projects.GST!;
  const no = nextNo();
  const draft = await createLine(P, no, 90000, { status: "Draft" });
  assert.equal(draft.status, 201, draft.message);
  assert.equal(await snapshotOf(no), null, "a Draft invoice has no snapshot");

  const lineId = (await lineIdsOf(no))[0]!;
  const raised = await api("PATCH", `/invoice-lines/${lineId}`, "recorder", { status: "Raised", gst: gst18({ taxType: "IGST" }) });
  assert.equal(raised.status, 200, raised.message);
  const s = (await snapshotOf(no))!;
  assert.deepEqual([s.gstStatus, Number(s.ratePercent), s.taxType, dec(s.igstAmount), dec(s.gstAmount)], ["APPLICABLE", 18, "IGST", "16200.00", "16200.00"]);

  // a later edit that DECLARES a different rate / type changes nothing: the snapshot is frozen
  const edit = await api("PATCH", `/invoice-lines/${lineId}`, "recorder", { remarks: "edited", gst: { applicable: true, ratePercent: 5, taxType: "CGST_SGST" } });
  assert.equal(edit.status, 200, edit.message);
  const after = (await snapshotOf(no))!;
  assert.deepEqual([Number(after.ratePercent), after.taxType, dec(after.gstAmount)], [18, "IGST", "16200.00"]);
});

test("a GST choice made on a DRAFT is saved and kept through the raise (never asked twice); it can change until the invoice is first raised and is frozen afterwards", async () => {
  const P = projects.GST!;
  const no = nextNo();
  assert.equal((await createLine(P, no, 90000, { status: "Draft", gst: gst18({ taxType: "IGST" }) })).status, 201);
  let s = (await snapshotOf(no))!;
  assert.deepEqual([s.gstStatus, Number(s.ratePercent), s.taxType, dec(s.gstAmount)], ["APPLICABLE", 18, "IGST", "16200.00"], "the Draft already carries its GST");
  const lineId = (await lineIdsOf(no))[0]!;

  // still a Draft: the choice can be changed
  assert.equal((await api("PATCH", `/invoice-lines/${lineId}`, "recorder", { remarks: "re-chosen", gst: { applicable: true, ratePercent: 5, taxType: "IGST" } })).status, 200);
  s = (await snapshotOf(no))!;
  assert.deepEqual([Number(s.ratePercent), dec(s.gstAmount)], [5, "4500.00"]);

  // the raise carries NO declaration and keeps what was chosen on the Draft
  const raised = await api("PATCH", `/invoice-lines/${lineId}`, "recorder", { status: "Raised" });
  assert.equal(raised.status, 200, raised.message);
  s = (await snapshotOf(no))!;
  assert.deepEqual([s.gstStatus, Number(s.ratePercent), s.taxType, dec(s.gstAmount), dec(s.totalAmount)], ["APPLICABLE", 5, "IGST", "4500.00", "94500.00"]);

  // frozen from the raise: a later declaration is ignored
  assert.equal((await api("PATCH", `/invoice-lines/${lineId}`, "recorder", { remarks: "after raise", gst: gst18() })).status, 200);
  s = (await snapshotOf(no))!;
  assert.deepEqual([Number(s.ratePercent), s.taxType, dec(s.gstAmount)], [5, "IGST", "4500.00"]);

  // an explicit 'No GST' on a Draft is kept too
  const none = nextNo();
  assert.equal((await createLine(P, none, 50000, { status: "Draft", gst: { applicable: false } })).status, 201);
  assert.equal((await snapshotOf(none))!.gstStatus, "NOT_APPLICABLE");
  const noneLine = (await lineIdsOf(none))[0]!;
  assert.equal((await api("PATCH", `/invoice-lines/${noneLine}`, "recorder", { status: "Raised" })).status, 200);
  assert.deepEqual([(await snapshotOf(none))!.gstStatus, dec((await snapshotOf(none))!.totalAmount)], ["NOT_APPLICABLE", "50000.00"]);
});

test("changing the project's GST switch afterwards does not move an existing invoice's GST or settlement target; an amount edit recomputes with the FROZEN rate", async () => {
  const P = projects.GST!;
  const no = nextNo();
  assert.equal((await createLine(P, no, 90000, { gst: gst18() })).status, 201);
  await prisma.project.update({ where: { id: P.id }, data: { gstApplicable: false } });
  try {
    const view = await overviewOf(P, no);
    assert.deepEqual([view.data.invoice.gst.availability, view.data.invoice.gst.status, view.data.invoice.gst.ratePercent, view.data.invoice.invoiceAmount], ["SNAPSHOT", "APPLICABLE", "18", "106200.00"]);
    // raising the amount while the project switch is OFF still uses the frozen 18%
    const lineId = (await lineIdsOf(no))[0]!;
    const edit = await api("PATCH", `/invoice-lines/${lineId}`, "recorder", { invoiceAmountINR: 100000 });
    assert.equal(edit.status, 200, edit.message);
    const s = (await snapshotOf(no))!;
    assert.deepEqual([dec(s.taxableAmount), dec(s.cgstAmount), dec(s.sgstAmount), dec(s.gstAmount), dec(s.totalAmount)], ["100000.00", "9000.00", "9000.00", "18000.00", "118000.00"]);
    assert.equal((await overviewOf(P, no)).data.invoice.invoiceAmount, "118000.00");
  } finally {
    await prisma.project.update({ where: { id: P.id }, data: { gstApplicable: true } });
  }
});

test("a multi-line invoice: the first raised line creates the snapshot; later lines recompute it with the frozen rate; deleting a line recomputes again", async () => {
  const P = projects.GST!;
  const no = nextNo();
  assert.equal((await createLine(P, no, 40000, { gst: gst18({ taxType: "IGST" }) })).status, 201);
  assert.deepEqual([dec((await snapshotOf(no))!.taxableAmount), dec((await snapshotOf(no))!.gstAmount)], ["40000.00", "7200.00"]);
  // the second line DECLARES 5% - ignored, the invoice keeps its 18% IGST
  const second = await api("POST", `/quantity/${P.qi}/invoice-lines`, "recorder", { invoiceNo: no, invoiceIntent: "existing", invoiceDate: "2026-11-01", quantityBilled: 0, invoiceAmountINR: 50000, status: "Raised", gst: { applicable: true, ratePercent: 5, taxType: "CGST_SGST" } });
  assert.equal(second.status, 201, second.message);
  const two = (await snapshotOf(no))!;
  assert.deepEqual([dec(two.taxableAmount), Number(two.ratePercent), two.taxType, dec(two.gstAmount), dec(two.totalAmount)], ["90000.00", 18, "IGST", "16200.00", "106200.00"]);
  const removed = await api("DELETE", `/invoice-lines/${second.data.id}`, "recorder");
  assert.equal(removed.status, 200, removed.message);
  const one = (await snapshotOf(no))!;
  assert.deepEqual([dec(one.taxableAmount), dec(one.gstAmount)], ["40000.00", "7200.00"]);
});

// ── Rename ──────────────────────────────────────────────────────────────────────────────────────

test("renaming a single-line invoice carries the snapshot to the new number before the old register row is released - it never falls back to legacy", async () => {
  const P = projects.GST!;
  const oldNo = nextNo();
  const newNo = nextNo();
  assert.equal((await createLine(P, oldNo, 90000, { gst: gst18() })).status, 201);
  const lineId = (await lineIdsOf(oldNo))[0]!;
  const res = await api("PATCH", `/invoice-lines/${lineId}`, "recorder", { invoiceNo: newNo });
  assert.equal(res.status, 200, res.message);
  assert.equal(await prisma.invoiceNumber.count({ where: { normalizedInvoiceNo: oldNo.toUpperCase() } }), 0, "the old register row was released");
  const s = (await snapshotOf(newNo))!;
  assert.ok(s, "the renamed invoice kept a snapshot");
  assert.deepEqual([Number(s.ratePercent), s.taxType, dec(s.taxableAmount), dec(s.gstAmount), dec(s.totalAmount)], [18, "CGST_SGST", "90000.00", "16200.00", "106200.00"]);
  const view = await overviewOf(P, newNo);
  assert.deepEqual([view.data.invoice.gst.availability, view.data.invoice.invoiceAmount], ["SNAPSHOT", "106200.00"]);
});

test("moving one line of a multi-line invoice to a new number: the new invoice inherits the frozen settings, the old one is recomputed", async () => {
  const P = projects.GST!;
  const oldNo = nextNo();
  const newNo = nextNo();
  assert.equal((await createLine(P, oldNo, 40000, { gst: gst18({ taxType: "IGST" }) })).status, 201);
  const second = await api("POST", `/quantity/${P.qi}/invoice-lines`, "recorder", { invoiceNo: oldNo, invoiceIntent: "existing", invoiceDate: "2026-11-01", quantityBilled: 0, invoiceAmountINR: 50000, status: "Raised" });
  assert.equal(second.status, 201, second.message);
  assert.equal(dec((await snapshotOf(oldNo))!.taxableAmount), "90000.00");
  const moved = await api("PATCH", `/invoice-lines/${second.data.id}`, "recorder", { invoiceNo: newNo });
  assert.equal(moved.status, 200, moved.message);
  const fresh = (await snapshotOf(newNo))!;
  assert.deepEqual([Number(fresh.ratePercent), fresh.taxType, dec(fresh.taxableAmount), dec(fresh.gstAmount)], [18, "IGST", "50000.00", "9000.00"]);
  const old = (await snapshotOf(oldNo))!;
  assert.deepEqual([dec(old.taxableAmount), dec(old.gstAmount), dec(old.totalAmount)], ["40000.00", "7200.00", "47200.00"]);
});

test("deleting a whole invoice removes its snapshot with its register row (no orphan)", async () => {
  const P = projects.GST!;
  const no = nextNo();
  assert.equal((await createLine(P, no, 90000, { gst: gst18() })).status, 201);
  const registryId = (await prisma.invoiceNumber.findUniqueOrThrow({ where: { normalizedInvoiceNo: no.toUpperCase() } })).id;
  assert.equal((await api("DELETE", `/invoice-lines/${(await lineIdsOf(no))[0]}`, "recorder")).status, 200);
  assert.equal(await prisma.invoiceGstSnapshot.count({ where: { invoiceNumberId: registryId } }), 0);
});

// ── GST-inclusive settlement ────────────────────────────────────────────────────────────────────

test("THE ACCEPTANCE EXAMPLE: taxable 90,000 + GST 16,200 = 1,06,200; bank 97,200 + TDS 9,000 -> settled 1,06,200, outstanding 0, Paid; no GST deduction exists", async () => {
  const P = projects.GST!;
  const no = nextNo();
  assert.equal((await createLine(P, no, 90000, { gst: gst18() })).status, 201);
  const before = await overviewOf(P, no);
  assert.deepEqual([before.data.invoice.invoiceAmount, before.data.invoice.gst.taxableAmount, before.data.invoice.gst.gstAmount, before.data.invoice.gst.totalAmount], ["106200.00", "90000.00", "16200.00", "106200.00"]);
  assert.deepEqual([before.data.summary.invoiceAmount, before.data.summary.outstanding], ["106200.00", "106200.00"]);

  const preview = await api("POST", "/invoice-payments/preview", "recorder", pay(P, no, "97200.00", [["TDS", "9000.00"]]));
  assert.equal(preview.status, 200, preview.message);
  assert.deepEqual([preview.data.valid, preview.data.canSave, preview.data.summary.outcome, preview.data.summary.totalSettled, preview.data.summary.outstanding, preview.data.gst.totalAmount], [true, true, "SETTLED", "106200.00", "0.00", "106200.00"]);

  const saved = await api("POST", "/invoice-payments", "recorder", pay(P, no, "97200.00", [["TDS", "9000.00"]]));
  assert.equal(saved.status, 201, saved.message);
  assert.equal(saved.data.newInvoiceStatus, "Paid");
  const s = saved.data.overview.summary;
  assert.deepEqual([s.invoiceAmount, s.bankReceived, s.deductions, s.totalSettled, s.outstanding, s.outcome, s.resultingStatus], ["106200.00", "97200.00", "9000.00", "106200.00", "0.00", "SETTLED", "Paid"]);
  assert.deepEqual(await statusesOf(no), ["Paid"]);

  const row = await prisma.invoicePayment.findUniqueOrThrow({ where: { id: saved.data.payment.id }, include: { receipts: true, adjustments: true } });
  assert.deepEqual(row.adjustments.map((a) => [a.category, dec(a.amount)]), [["TDS", "9000.00"]], "only the TDS the client deducted - GST is not a deduction");
  assert.deepEqual([row.gstApplicable, row.gstAmount, row.gstRatePercent], [false, null, null], "the legacy per-payment GST columns stay unused (the snapshot is the source)");
  assert.deepEqual([dec(row.receipts[0]!.amountReceived), dec(row.receipts[0]!.gstReceived)], ["97200.00", "0.00"]);
  assert.equal(dec((await snapshotOf(no))!.totalAmount), "106200.00", "settling never alters the snapshot");

  // history survives; reversal excludes the payment, restores Raised and keeps the history
  const reversed = await api("POST", `/invoice-payments/${saved.data.payment.id}/reverse`, "recorder", { reason: "entered on the wrong invoice" });
  assert.equal(reversed.status, 200, reversed.message);
  assert.deepEqual([reversed.data.overview.summary.totalSettled, reversed.data.overview.summary.outstanding, reversed.data.overview.invoice.invoiceAmount], ["0.00", "106200.00", "106200.00"]);
  assert.equal(reversed.data.overview.payments.length, 0, "the reversed payment is not active");
  assert.equal(reversed.data.overview.reversedPayments.length, 1, "but its history is retained");
  assert.deepEqual(await statusesOf(no), ["Raised"]);
  // a fresh payment is allowed after the reversal
  const again = await api("POST", "/invoice-payments", "recorder", pay(P, no, "106200.00"));
  assert.equal(again.status, 201, again.message);
  assert.equal(again.data.newInvoiceStatus, "Paid");
});

test("partial payment: bank 90,000 + TDS 5,000 = 95,000 against 1,06,200 -> Partially Paid, outstanding 11,200", async () => {
  const P = projects.GST!;
  const no = nextNo();
  assert.equal((await createLine(P, no, 90000, { gst: gst18() })).status, 201);
  const res = await api("POST", "/invoice-payments", "recorder", pay(P, no, "90000.00", [["TDS", "5000.00"]]));
  assert.equal(res.status, 201, res.message);
  const s = res.data.overview.summary;
  assert.deepEqual([s.totalSettled, s.outstanding, s.outcome, s.resultingStatus], ["95000.00", "11200.00", "PARTIAL", "PartiallyPaid"]);
  assert.deepEqual(await statusesOf(no), ["PartiallyPaid"]);
});

test("bank 1,06,200 with no deductions settles the invoice exactly -> Paid", async () => {
  const P = projects.GST!;
  const no = nextNo();
  assert.equal((await createLine(P, no, 90000, { gst: gst18() })).status, 201);
  const res = await api("POST", "/invoice-payments", "recorder", pay(P, no, "106200.00"));
  assert.equal(res.status, 201, res.message);
  assert.deepEqual([res.data.newInvoiceStatus, res.data.overview.summary.outstanding], ["Paid", "0.00"]);
});

test("over-settlement against the GST-inclusive total is refused and nothing is persisted: bank 1,00,000 + TDS 10,000 = 1,10,000 > 1,06,200", async () => {
  const P = projects.GST!;
  const no = nextNo();
  assert.equal((await createLine(P, no, 90000, { gst: gst18() })).status, 201);
  const res = await api("POST", "/invoice-payments", "recorder", pay(P, no, "100000.00", [["TDS", "10000.00"]]));
  assert.equal(res.status, 422);
  assert.match(res.message ?? "", /exceeds the invoice amount of INR 106200\.00 by INR 3800\.00/);
  assert.equal(await prisma.invoicePayment.count({ where: { projectId: P.id, invoiceNo: no } }), 0);
  assert.deepEqual(await statusesOf(no), ["Raised"]);
});

test("a previous and a current payment add up against the GST-inclusive total: 50,000 + 5,000 then 46,200 + 5,000 = 1,06,200 -> Paid", async () => {
  const P = projects.GST!;
  const no = nextNo();
  assert.equal((await createLine(P, no, 90000, { gst: gst18() })).status, 201);
  const first = await api("POST", "/invoice-payments", "recorder", pay(P, no, "50000.00", [["TDS", "5000.00"]]));
  assert.equal(first.status, 201, first.message);
  assert.equal(first.data.newInvoiceStatus, "PartiallyPaid");
  const view = await overviewOf(P, no);
  assert.deepEqual([view.data.summary.bankReceived, view.data.summary.deductions, view.data.summary.outstanding], ["50000.00", "5000.00", "51200.00"]);
  const second = await api("POST", "/invoice-payments", "recorder", pay(P, no, "46200.00", [["TDS", "5000.00"]]));
  assert.equal(second.status, 201, second.message);
  const s = second.data.overview.summary;
  assert.deepEqual([s.bankReceived, s.deductions, s.totalSettled, s.outstanding, s.resultingStatus], ["96200.00", "10000.00", "106200.00", "0.00", "Paid"]);
});

test("all nine deduction categories still count against the GST-inclusive total, and Security Deposit / ISD dates persist", async () => {
  const P = projects.GST!;
  const no = nextNo();
  assert.equal((await createLine(P, no, 90000, { gst: gst18() })).status, 201);
  const nine = ["TDS", "SECURITY_DEPOSIT", "ISD", "OTHER_DEDUCTIONS", "LD_AMOUNT", "BANK_CHARGES", "WITHHOLDING_TAXES", "FX_LOSS", "WAIVE_OFF"].map((category) => ({
    category, amount: "5000.00",
    ...(category === "SECURITY_DEPOSIT" ? { expectedReleaseDate: "2027-01-15", reminderDate: "2027-01-08" } : {}),
    ...(category === "ISD" ? { expectedReleaseDate: "2027-02-10" } : {}),
  }));
  const res = await api("POST", "/invoice-payments", "recorder", pay(P, no, "61200.00", nine)); // 61,200 + 9 x 5,000 = 1,06,200
  assert.equal(res.status, 201, res.message);
  assert.deepEqual([res.data.overview.summary.deductions, res.data.overview.summary.totalSettled, res.data.newInvoiceStatus], ["45000.00", "106200.00", "Paid"]);
  const rows = await prisma.invoicePaymentAdjustment.findMany({ where: { paymentId: res.data.payment.id }, orderBy: { position: "asc" } });
  assert.equal(rows.length, 9);
  const sd = rows.find((r) => r.category === "SECURITY_DEPOSIT")!;
  const isd = rows.find((r) => r.category === "ISD")!;
  assert.deepEqual([sd.expectedReleaseDate?.toISOString().slice(0, 10), sd.reminderDate?.toISOString().slice(0, 10), isd.expectedReleaseDate?.toISOString().slice(0, 10)], ["2027-01-15", "2027-01-08", "2027-02-10"]);
  assert.ok(!rows.some((r) => /gst/i.test(r.category)), "no GST deduction category");
});

test("a client cannot override the authoritative total: GST / total fields in the payment body are ignored", async () => {
  const P = projects.GST!;
  const no = nextNo();
  assert.equal((await createLine(P, no, 90000, { gst: gst18() })).status, 201);
  const res = await api("POST", "/invoice-payments", "recorder", { ...pay(P, no, "90000.00"), invoiceAmount: "90000.00", gst: { ratePercent: "0", amount: "0" }, totalAmount: "90000.00" });
  assert.equal(res.status, 201, res.message);
  assert.equal(res.data.overview.summary.outstanding, "16200.00", "still measured against 1,06,200, not the client's 90,000");
  assert.equal(res.data.newInvoiceStatus, "PartiallyPaid");
});

test("duplicate submissions of one save create one payment; concurrent payments can never over-settle the GST-inclusive total", async () => {
  const P = projects.GST!;
  const dup = nextNo();
  assert.equal((await createLine(P, dup, 90000, { gst: gst18() })).status, 201);
  const body = pay(P, dup, "30000.00");
  const sent = await Promise.all([1, 2, 3, 4].map(() => api("POST", "/invoice-payments", "recorder", body)));
  assert.deepEqual(sent.map((r) => r.status).sort(), [200, 200, 200, 201]);
  assert.equal(await prisma.invoicePayment.count({ where: { projectId: P.id, invoiceNo: dup } }), 1);

  const race = nextNo();
  assert.equal((await createLine(P, race, 90000, { gst: gst18() })).status, 201);
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => api("POST", "/invoice-payments", "recorder", pay(P, race, "30000.00"))));
  assert.equal(results.filter((r) => r.status === 201).length, 3, "3 x 30,000 = 90,000 fits in 1,06,200; the 4th would exceed it");
  assert.equal(results.filter((r) => r.status === 422).length, 2);
  const view = await overviewOf(P, race);
  assert.deepEqual([view.data.summary.totalSettled, view.data.summary.outstanding], ["90000.00", "16200.00"]);
});

// ── Mismatch ────────────────────────────────────────────────────────────────────────────────────

test("a snapshot whose taxable amount no longer matches the lines blocks payment with a clear error - nothing falls back, nothing is repaired", async () => {
  const P = projects.GST!;
  const no = nextNo();
  assert.equal((await createLine(P, no, 90000, { gst: gst18() })).status, 201);
  // the lines are changed behind the service's back (an import or a manual database edit would do the same)
  await prisma.invoiceLine.updateMany({ where: { invoiceNo: no }, data: { invoiceAmountINR: 95000, invoiceAmountOriginal: 95000 } });
  const view = await overviewOf(P, no);
  assert.equal(view.status, 200);
  assert.equal(view.data.invoice.gst.mismatch, true);
  assert.match(view.data.invoice.recordBlockedReason, /saved GST details.*taxable amount of INR 90000\.00.*lines now total INR 95000\.00.*reconciled/);
  const preview = await api("POST", "/invoice-payments/preview", "recorder", pay(P, no, "1000.00"));
  assert.equal(preview.status, 409);
  const save = await api("POST", "/invoice-payments", "recorder", pay(P, no, "1000.00"));
  assert.equal(save.status, 409);
  assert.match(save.message ?? "", /reconciled/);
  assert.equal(await prisma.invoicePayment.count({ where: { projectId: P.id, invoiceNo: no } }), 0);
  const s = (await snapshotOf(no))!;
  assert.deepEqual([dec(s.taxableAmount), dec(s.totalAmount)], ["90000.00", "106200.00"], "the snapshot was not overwritten or repaired");
  assert.deepEqual(await statusesOf(no), ["Raised"]);
});

// ── Legacy invoices ─────────────────────────────────────────────────────────────────────────────

test("a legacy invoice (raised before snapshots, no register row / no snapshot) settles on its taxable value, shows the legacy note, and is never given a snapshot", async () => {
  const P = projects.GST!; // its GST switch is ON - a legacy invoice must NOT pick GST up from it
  const no = nextNo();
  const row = await prisma.invoiceLine.create({ data: { quantityItemId: P.qi, invoiceNo: no, invoiceDate: new Date("2026-09-01"), quantityBilled: 0, invoiceAmountINR: 90000, currency: "INR", exchangeRateToINR: 1, invoiceAmountOriginal: 90000, status: "Raised", createdBy: "legacy" } });
  const view = await overviewOf(P, no);
  assert.equal(view.status, 200);
  assert.deepEqual([view.data.invoice.gst.availability, view.data.invoice.gst.status, view.data.invoice.gst.note, view.data.invoice.invoiceAmount, view.data.invoice.gst.gstAmount, view.data.invoice.gst.totalAmount], ["LEGACY", null, "GST details not available (legacy invoice)", "90000.00", "0.00", "90000.00"]);
  assert.equal(await snapshotOf(no), null, "opening the popup created nothing");
  // an edit that carries a GST declaration does not backfill it
  const edit = await api("PATCH", `/invoice-lines/${row.id}`, "recorder", { remarks: "touched", gst: gst18() });
  assert.equal(edit.status, 200, edit.message);
  assert.equal(await snapshotOf(no), null);
  // settles against the taxable amount exactly as before
  const full = await api("POST", "/invoice-payments", "recorder", pay(P, no, "81000.00", [["TDS", "9000.00"]]));
  assert.equal(full.status, 201, full.message);
  assert.deepEqual([full.data.newInvoiceStatus, full.data.overview.summary.invoiceAmount, full.data.overview.summary.outstanding], ["Paid", "90000.00", "0.00"]);
  assert.equal(await prisma.invoiceGstSnapshot.count({ where: { invoiceNumber: { projectId: P.id, normalizedInvoiceNo: no.toUpperCase() } } }), 0, "settling a legacy invoice created no snapshot either");
});

test("an invoice that was ALREADY raised when it gains a registered number is not backfilled either (a legacy raised invoice stays legacy)", async () => {
  const P = projects.GST!;
  const no = nextNo();
  // a raised line with a register row but no snapshot = what every pre-feature invoice looks like after the migration
  await prisma.invoiceNumber.create({ data: { invoiceNo: no, normalizedInvoiceNo: no.toUpperCase(), projectId: P.id } });
  const line = await prisma.invoiceLine.create({ data: { quantityItemId: P.qi, invoiceNo: no, invoiceDate: new Date("2026-09-01"), quantityBilled: 0, invoiceAmountINR: 90000, currency: "INR", exchangeRateToINR: 1, invoiceAmountOriginal: 90000, status: "Raised", createdBy: "legacy" } });
  const second = await api("POST", `/quantity/${P.qi}/invoice-lines`, "recorder", { invoiceNo: no, invoiceIntent: "existing", invoiceDate: "2026-11-01", quantityBilled: 0, invoiceAmountINR: 10000, status: "Raised", gst: gst18() });
  assert.equal(second.status, 201, second.message);
  assert.equal(await snapshotOf(no), null, "adding a line to a legacy raised invoice creates no snapshot");
  const edit = await api("PATCH", `/invoice-lines/${line.id}`, "recorder", { invoiceAmountINR: 80000, gst: gst18() });
  assert.equal(edit.status, 200, edit.message);
  assert.equal(await snapshotOf(no), null);
  const view = await overviewOf(P, no);
  assert.deepEqual([view.data.invoice.gst.availability, view.data.invoice.invoiceAmount], ["LEGACY", "90000.00"]);
});

// ── Foreign currency, dashboard figures ─────────────────────────────────────────────────────────

test("a foreign-currency invoice settles in its own currency with a NOT_APPLICABLE snapshot (total = taxable), unchanged by this feature", async () => {
  const P = projects.GSTUSD!;
  const no = nextNo();
  const created = await createLine(P, no, 0, { currency: "USD", exchangeRateToINR: 90, invoiceAmountOriginal: 6000, invoiceAmountINR: undefined });
  assert.equal(created.status, 201, created.message);
  const view = await overviewOf(P, no);
  assert.deepEqual([view.data.invoice.currency, view.data.invoice.invoiceAmount, view.data.invoice.gst.status, view.data.invoice.gst.totalAmount, view.data.invoice.exchangeRateToINR], ["USD", "6000.00", "NOT_APPLICABLE", "6000.00", "90"]);
  const res = await api("POST", "/invoice-payments", "recorder", pay(P, no, "5000.00", [["TDS", "1000.00"]]));
  assert.equal(res.status, 201, res.message);
  assert.deepEqual([res.data.newInvoiceStatus, res.data.overview.summary.totalSettled], ["Paid", "6000.00"]);
});

test("dashboard / report figures stay EX-GST: a GST invoice reads fully settled when Paid, and a part-paid one reads exactly its real outstanding (documented rule)", async () => {
  const P = projects.GST!;
  const paidNo = nextNo();
  assert.equal((await createLine(P, paidNo, 90000, { gst: gst18() })).status, 201);
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, paidNo, "97200.00", [["TDS", "9000.00"]]))).status, 201);
  const partNo = nextNo();
  assert.equal((await createLine(P, partNo, 90000, { gst: gst18() })).status, 201);
  assert.equal((await api("POST", "/invoice-payments", "recorder", pay(P, partNo, "90000.00", [["TDS", "5000.00"]]))).status, 201);
  const list = await api("GET", `/projects/${P.id}/invoice-items`, "recorder");
  const lines = list.data.items.flatMap((i: any) => i.invoices);
  const paid = lines.find((l: any) => l.invoiceNo === paidNo);
  const part = lines.find((l: any) => l.invoiceNo === partNo);
  // fully settled: ex-GST settled = the whole taxable 90,000 (outstanding 0); cash is capped at what is settled ex-GST
  assert.deepEqual([paid.invoiceAmountINR, paid.settledINR, paid.recordedCashINR], [90000, 90000, 90000]);
  // 95,000 settled of 1,06,200: outstanding 11,200 stays 11,200 ex-GST, so settled ex-GST = 90,000 - 11,200 = 78,800 (never "fully settled")
  assert.deepEqual([part.settledINR, part.recordedCashINR], [78800, 78800]);
  assert.ok(part.settledINR < part.invoiceAmountINR, "a part-paid GST invoice never looks fully settled on the dashboard");
});
