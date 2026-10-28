import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { setEmailTransportForTests } from "../../shared/email/transporter.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Invoice Tracker — PROJECT ROWS ARE ORDERED BY THE ORIGINAL APPROVAL SUBMISSION (InvoiceRequest.createdAt), LATEST first, and stay there while
 * the request is fulfilled by an invoice, the invoice is raised, paid or re-dated. Through the real routes and the scratch database.
 *
 * The raise / payment / date edits go through the EXISTING invoice API (so the real request fulfilment runs). Email is captured by the test
 * transport seam, so nothing is ever sent. The report month is 2026-10; every list is scoped with search=TAG.
 *
 *  PA  Open request submitted 3 Oct (fulfilled later by the test through POST /quantity/:id/invoice-lines).
 *  PB  Open request submitted 5 Oct (raised later with an invoice dated EARLIER than PA's).
 *  PC  no request: Raised invoice dated 20 Oct (recorded raise 21 Oct).
 *  PD  request 1 Oct fulfilled by D1INV (Raised, dated 8 Oct) + a newer Open request submitted 12 Oct.
 *  PE  a Completed request (7 Oct) that no invoice carries (a historical, un-linked request).
 *  PF  request 6 Oct fulfilled by a two-line invoice FINV (100 + 200, dated 9 Oct).
 * Later tests add a NEW request to PA, projects without any request (PG, PH, PI, PJ) for the fallback order, the requirement's example table
 * (X1001-X1005), and requests on the month boundaries (B*). Each of those uses its own PR prefix so a scoped search never mixes them.
 */

const TAG = `itao-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => {};
const userIds: string[] = [];
const projectIds: string[] = [];
const people: Record<string, { id: string; headers: Record<string, string> }> = {};
const P: Record<string, { id: string; items: string[] }> = {};
const sentMail: unknown[] = [];

const requirePg = createRequire(import.meta.url);
const pg = requirePg("pg");
let queryCount = 0;
const originalQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (this: unknown, ...args: unknown[]) {
  queryCount++;
  return originalQuery.apply(this, args);
};

async function api(path: string, who: string | null, method = "GET", body?: unknown) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: who ? people[who]!.headers : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
}
const list = async (query = "month=2026-10") => (await api(`/invoice-tracker?${query}&search=${TAG}&pageSize=50`, "admin")).data;
const chain = async (project: string, month = "2026-10") => (await api(`/invoice-tracker/projects/${P[project]!.id}/invoices?month=${month}`, "admin")).data;
const outstanding = async () => (await api(`/invoice-tracker/outstanding?search=${TAG}&pageSize=100`, "admin")).data;
const key = (prNo: string) => prNo.slice(TAG.length + 1);
const orderOf = (data: any) => data.items.map((i: any) => key(i.prNo));
const row = (data: any, project: string) => data.items.find((i: any) => i.prNo === `${TAG}-${project}`);
const noOf = (invoiceNo: string) => invoiceNo.slice(TAG.length + 1);

async function waitFor(check: () => Promise<boolean>, what: string) {
  for (let i = 0; i < 60; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`timed out waiting for ${what}`);
}
const requestOf = (project: string) => prisma.invoiceRequest.findFirstOrThrow({ where: { projectId: P[project]!.id }, orderBy: { createdAt: "asc" } });

before(async () => {
  // Nothing may ever reach a real mail server: the fulfilment path sends "your invoice has been raised" mails.
  setEmailTransportForTests({ sendMail: async (options: unknown) => { sentMail.push(options); return {} as never; } });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  const [engineer, adminRole, invoicesM, projectsM, raise, edit, del] = await Promise.all([
    prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
    prisma.portalRole.findFirstOrThrow({ where: { name: "Administrator" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Invoices" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Projects" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Raise Invoice" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Edit Invoice" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Delete Invoice" } }),
  ]);
  const passwordHash = await hashPassword("ItaoTest@123");
  const make = async (k: string, role: { id: string; name: string }, modules: string[]) => {
    const email = `${TAG}-${k}@example.com`;
    const u = await prisma.portalUser.create({
      data: {
        fullName: `Itao ${k}`, email, passwordHash, department: "Accounts", roleId: role.id, forcePasswordChange: false,
        moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) },
        approvalPermissions: { create: [raise.id, edit.id, del.id].map((approvalTypeId) => ({ approvalTypeId })) },
      },
    });
    userIds.push(u.id);
    people[k] = { id: u.id, headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: u.id, email, roleId: role.id, roleName: role.name })}` } };
  };
  await make("owner", engineer, [projectsM.id, invoicesM.id]);
  await make("admin", adminRole, [invoicesM.id]);

  const mkProject = async (k: string, itemCount = 1) => {
    const p = await prisma.project.create({
      data: {
        poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-${k}`, client: `Itao Client ${k}`, department: "Process", domesticForeign: "Domestic",
        projectTitle: `Itao ${k}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM",
        createdByUserId: people.owner!.id,
      },
    });
    projectIds.push(p.id);
    const items: string[] = [];
    for (let i = 0; i < itemCount; i++) {
      items.push((await prisma.quantityItem.create({ data: { projectId: p.id, description: `Activity ${i + 1}`, woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1_000_000 } })).id);
    }
    P[k] = { id: p.id, items };
  };
  for (const k of ["PA", "PB", "PC", "PD", "PE"]) await mkProject(k);
  await mkProject("PF", 2);

  const direct = (label: string, project: string, status: string, invoiceDate: string, amount: number, opts: { item?: number; invoiceNo?: string } = {}) =>
    prisma.invoiceLine.create({
      data: {
        quantityItemId: P[project]!.items[opts.item ?? 0]!, invoiceNo: opts.invoiceNo ?? `${TAG}-${label}`, invoiceDate: new Date(`${invoiceDate}T00:00:00.000Z`),
        quantityBilled: 0, invoiceAmountINR: amount, status, createdBy: "Direct Entry", createdAt: new Date(`${invoiceDate}T06:00:00.000Z`),
      },
    });
  const request = (project: string, status: "Open" | "Completed", createdAt: string, fulfilledInvoiceLineId: string | null = null) =>
    prisma.invoiceRequest.create({ data: { projectId: P[project]!.id, requestedByUserId: people.owner!.id, assignedToUserId: people.owner!.id, status, fulfilledInvoiceLineId, createdAt: new Date(createdAt) } });

  await request("PA", "Open", "2026-10-03T06:00:00Z");
  await request("PB", "Open", "2026-10-05T06:00:00Z");
  const cinv = await direct("CINV", "PC", "Raised", "2026-10-20", 700);
  await prisma.invoiceStatusEvent.create({
    data: { projectId: P.PC!.id, prNo: `${TAG}-PC`, invoiceLineId: cinv.id, invoiceNo: `${TAG}-CINV`, eventType: "CREATED", fromStatus: null, toStatus: "Raised", actorUserId: people.owner!.id, actorName: "Itao owner", source: "invoice_create", occurredAt: new Date("2026-10-21T06:00:00Z") },
  });
  const d1 = await direct("D1INV", "PD", "Raised", "2026-10-08", 1000);
  await request("PD", "Completed", "2026-10-01T06:00:00Z", d1.id);
  await request("PD", "Open", "2026-10-12T06:00:00Z");
  await request("PE", "Completed", "2026-10-07T06:00:00Z", null);
  const f1a = await direct("F1a", "PF", "Raised", "2026-10-09", 100, { invoiceNo: `${TAG}-FINV` });
  await direct("F1b", "PF", "Raised", "2026-10-09", 200, { item: 1, invoiceNo: `${TAG}-FINV` });
  await request("PF", "Completed", "2026-10-06T06:00:00Z", f1a.id);
});

after(async () => {
  pg.Client.prototype.query = originalQuery;
  setEmailTransportForTests(null);
  try {
    await prisma.invoiceStatusEvent.deleteMany({ where: { prNo: { startsWith: TAG } } });
    await prisma.invoiceRequest.deleteMany({ where: { projectId: { in: projectIds } } });
    const items = await prisma.quantityItem.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItemId: { in: items.map((i) => i.id) } } });
    await prisma.invoiceNumber.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userApprovalPermission.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await closeServer();
  }
});

const EXPECTED = ["PD", "PE", "PF", "PB", "PA", "PC"];
const patchBody = (invoiceNo: string, invoiceDate: string, amount: number, status: string) => ({
  invoiceNo, invoiceDate, milestoneId: null, milestoneName: null, setIndex: null, description: null, quantityBilled: 0, invoiceAmountINR: amount, clientReference: null, remarks: null, status,
});

test("1. approvals are listed LATEST submission first; each row shows its own latest record (historical un-linked request included)", async () => {
  const month = await list();
  assert.deepEqual(orderOf(month), EXPECTED, "12 Oct (PD's newer open request), 7 Oct (un-linked), 6 Oct (fulfilled), 5 Oct, 3 Oct — then PC, which has no approval");
  assert.deepEqual(month.items.map((i: any) => i.sortTier), [1, 1, 1, 1, 1, 2]);
  assert.deepEqual(month.items.map((i: any) => i.approvalSubmittedAt), ["2026-10-12T06:00:00.000Z", "2026-10-07T06:00:00.000Z", "2026-10-06T06:00:00.000Z", "2026-10-05T06:00:00.000Z", "2026-10-03T06:00:00.000Z", null], "PE displays nothing, yet its un-linked historical request (7 Oct) still places it");
  assert.deepEqual([row(month, "PA").latestRecord.status, row(month, "PA").latestRecord.amountINR], ["PendingApproval", null], "a pending approval: no amount");
  assert.deepEqual([row(month, "PF").latestRecord.status, row(month, "PF").latestRecord.amountINR, row(month, "PF").latestRecord.kind], ["Raised", 300, "invoice"], "a multi-line invoice is one record at the summed amount");
  assert.equal(row(month, "PE").latestRecord, null, "a historical request no invoice carries displays nothing — and nothing is invented");
  assert.deepEqual([row(month, "PD").latestRecord.kind, row(month, "PD").latestRecord.status], ["request", "PendingApproval"], "PD displays its NEWER open request — and is positioned by that request");
  assert.equal(row(month, "PC").approvalSubmittedAt, null, "an invoice raised outside the request workflow has no approval submission");
  // 7: no approval request -> the documented fallback: the displayed record's date, latest first
  assert.equal(row(month, "PC").sortBasis, "record_date");
  // 8: All history agrees on the order of the approval-anchored projects
  const history = await list("month=all");
  assert.deepEqual(orderOf(history), EXPECTED, "all history: latest submission first, then the project with no approval (PR-number order)");
  assert.deepEqual(history.items.map((i: any) => i.sortTier), [1, 1, 1, 1, 1, 0]);
});

test("2. approval A is fulfilled by a Raised invoice through the real API: the row keeps its position, shows the new status, and the original submission survives", async () => {
  const before = await requestOf("PA");
  const created = await api(`/quantity/${P.PA!.items[0]}/invoice-lines`, "owner", "POST", { invoiceNo: `${TAG}-AINV`, invoiceIntent: "new", invoiceDate: "2026-10-25", quantityBilled: 0, invoiceAmountINR: 5000, status: "Raised" });
  assert.equal(created.status, 201, created.message);
  await waitFor(async () => (await requestOf("PA")).status === "Completed", "request A to be fulfilled");
  const after = await requestOf("PA");
  assert.equal(after.fulfilledInvoiceLineId, created.data.id, "the request stays linked to the invoice that fulfilled it");
  assert.equal(after.createdAt.toISOString(), before.createdAt.toISOString(), "the ORIGINAL submission timestamp is untouched by the fulfilment");
  assert.ok(after.updatedAt.getTime() > before.createdAt.getTime(), "the request's updatedAt did move — it must not (and does not) order the row");

  const month = await list();
  assert.deepEqual(orderOf(month), EXPECTED, "PA keeps its place (the earliest of the approvals)");
  const pa = row(month, "PA");
  assert.deepEqual([pa.latestRecord.kind, pa.latestRecord.status, pa.latestRecord.amountINR, pa.approvalSubmittedAt], ["invoice", "Raised", 5000, "2026-10-03T06:00:00.000Z"], "status and amount updated in the same row");
  assert.deepEqual([pa.sortTier, pa.sortBasis], [1, "approval_submitted"]);
  assert.ok(sentMail.length > 0, "the fulfilment e-mail went to the captured test transport — never to a real mail server");
});

test("2b. approval B (submitted LATER) is raised with an invoice dated EARLIER than A's: B still sits ABOVE A", async () => {
  const created = await api(`/quantity/${P.PB!.items[0]}/invoice-lines`, "owner", "POST", { invoiceNo: `${TAG}-BINV`, invoiceIntent: "new", invoiceDate: "2026-10-01", quantityBilled: 0, invoiceAmountINR: 800, status: "Raised" });
  assert.equal(created.status, 201, created.message);
  await waitFor(async () => (await requestOf("PB")).status === "Completed", "request B to be fulfilled");
  const month = await list();
  assert.deepEqual(orderOf(month), EXPECTED, "by invoice date A (25 Oct) would now lead B (1 Oct); by original submission B (5 Oct) still sits above A (3 Oct)");
  assert.deepEqual([row(month, "PB").latestRecord.status, row(month, "PB").latestRecord.amountINR], ["Raised", 800]);
});

test("3. the invoice moves to Partially Paid and then Paid: the displayed status follows, the position does not", async () => {
  const invoice = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceNo: `${TAG}-AINV` } });
  for (const [status, label] of [["PartiallyPaid", "Partially Paid"], ["Paid", "Paid"]] as const) {
    const res = await api(`/invoice-lines/${invoice.id}`, "owner", "PATCH", patchBody(`${TAG}-AINV`, "2026-10-25", 5000, status));
    assert.equal(res.status, 200, `${label}: ${res.message}`);
    const month = await list();
    assert.deepEqual(orderOf(month), EXPECTED, `${label}: position unchanged`);
    assert.deepEqual([row(month, "PA").latestRecord.status, row(month, "PA").latestRecord.amountINR, row(month, "PA").approvalSubmittedAt], [status, 5000, "2026-10-03T06:00:00.000Z"], `${label}: status updated in place`);
    assert.deepEqual(orderOf(await list("month=all")), EXPECTED, `${label}: all history agrees`);
  }
  const after = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(after.createdAt.toISOString(), invoice.createdAt.toISOString(), "no second invoice, creation instant untouched");
  assert.equal(await prisma.invoiceLine.count({ where: { invoiceNo: `${TAG}-AINV` } }), 1, "a status change never creates a record");
});

test("4. editing the invoice date does not move the row — not even when the invoice leaves October", async () => {
  const invoice = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceNo: `${TAG}-AINV` } });
  for (const date of ["2026-10-02", "2026-10-31", "2026-09-15"]) {
    const res = await api(`/invoice-lines/${invoice.id}`, "owner", "PATCH", patchBody(`${TAG}-AINV`, date, 5000, "Paid"));
    assert.equal(res.status, 200, `${date}: ${res.message}`);
    assert.deepEqual(orderOf(await list()), EXPECTED, `invoice dated ${date}: October order unchanged`);
    assert.equal(row(await list(), "PA").approvalSubmittedAt, "2026-10-03T06:00:00.000Z");
  }
  // dated November: October is a report of the approval submitted in October — it still shows that approval, in the same place
  assert.equal((await api(`/invoice-lines/${invoice.id}`, "owner", "PATCH", patchBody(`${TAG}-AINV`, "2026-11-15", 5000, "Paid"))).status, 200);
  const oct = await list();
  assert.deepEqual(orderOf(oct), EXPECTED);
  assert.deepEqual([row(oct, "PA").latestRecord.kind, row(oct, "PA").latestRecord.status, row(oct, "PA").latestRecord.raisedLater?.invoiceDate], ["request", "Raised", "2026-11-15"], "October shows the request, pointing at the November invoice");
  const nov = await list("month=2026-11");
  assert.deepEqual([orderOf(nov), row(nov, "PA").latestRecord.kind, row(nov, "PA").latestRecord.status], [["PA"], "invoice", "Paid"], "November lists the invoice under its own month");
  assert.equal(row(nov, "PA").approvalSubmittedAt, "2026-10-03T06:00:00.000Z", "the invoice is still associated with the original request");
  assert.equal((await api(`/invoice-lines/${invoice.id}`, "owner", "PATCH", patchBody(`${TAG}-AINV`, "2026-10-25", 5000, "Paid"))).status, 200);
  assert.deepEqual(orderOf(await list()), EXPECTED);
});

test("5. several requests and invoices on one project: the right association and displayed status are kept (and expanded history stays newest first)", async () => {
  const month = await list();
  const pd = row(month, "PD");
  assert.deepEqual([pd.latestRecord.kind, pd.latestRecord.status, pd.approvalSubmittedAt], ["request", "PendingApproval", "2026-10-12T06:00:00.000Z"]);
  const c = await chain("PD");
  const d1 = await prisma.invoiceRequest.findFirstOrThrow({ where: { projectId: P.PD!.id, status: "Completed" } });
  assert.deepEqual(c.requests.map((r: any) => r.status).sort(), ["Completed", "Open"]);
  assert.equal(c.requests.find((r: any) => r.status === "Completed").fulfilledByInvoiceNo, `${TAG}-D1INV`, "the completed request points at ITS invoice");
  assert.equal(d1.fulfilledInvoiceLineId !== null, true);
  assert.deepEqual(c.recordOrder.map((o: any) => o.kind), ["request", "invoice", "request"], "latest first (open request 12 Oct), then newest first: invoice 8 Oct, request 1 Oct");
  assert.equal(c.recordOrder[0].id, c.latestRecord.id, "the first record is exactly what the row displays");
  // multi-line: one invoice, one row, both lines, the request that was linked through line 1
  const pf = await chain("PF");
  assert.deepEqual([pf.invoices.length, pf.invoices[0].lines.length, pf.invoices[0].amountINR], [1, 2, 300]);
  assert.equal(pf.invoices[0].invoiceRequest.id, (await requestOf("PF")).id);
  assert.equal(month.items.filter((i: any) => key(i.prNo) === "PF").length, 1, "one row for the project");
});

test("9-10. Outstanding, totals and expanded-history ordering are unchanged by the approval ordering", async () => {
  const o = await outstanding();
  const rows = o.items;
  assert.deepEqual(rows.map((r: any) => noOf(r.invoiceNo)).sort(), ["BINV", "CINV", "D1INV", "FINV"], "A's invoice is Paid, so it left Outstanding; every other raised invoice is listed once (FINV is one invoice with two lines)");
  const days = rows.map((r: any) => r.daysOutstanding) as number[];
  assert.deepEqual(days, [...days].sort((a, b) => b - a), "Outstanding keeps its own order: oldest invoice date first");
  assert.equal(rows.find((r: any) => noOf(r.invoiceNo) === "FINV").lineCount, 2);
  assert.deepEqual([o.totals.invoiceCount, o.totals.knownOutstandingINR], [4, 800 + 700 + 1000 + 300], "Raised invoices at their full amounts: BINV 800 + CINV 700 + D1INV 1000 + FINV 300");
  const s = (await list()).summary;
  assert.deepEqual(s.byStatus, { raised: 4, partiallyPaid: 0, paid: 1, draft: 0, cancelled: 0 }, "AINV Paid; BINV, CINV, D1INV, FINV Raised");
  assert.deepEqual([s.invoicesRaised, s.raisedAmountINR], [5, 5000 + 800 + 700 + 1000 + 300], "the month's financial totals follow the invoices, not the row order");
  assert.deepEqual([s.requests.open, s.requests.completed, s.projectCount], [1, 5, 6]);
  // each page size yields the same sequence, and the statement count does not grow with the page size
  const seen: string[] = [];
  for (let page = 1; page <= 6; page++) seen.push(...orderOf((await api(`/invoice-tracker?month=2026-10&search=${TAG}&pageSize=1&page=${page}`, "admin")).data));
  assert.deepEqual(seen, EXPECTED, "a stable order across pages");
  const count = async (size: number) => {
    const before = queryCount;
    await api(`/invoice-tracker?month=2026-10&search=${TAG}&pageSize=${size}`, "admin");
    return queryCount - before;
  };
  const [small, large] = [await count(2), await count(25)];
  assert.equal(small, large, "the same statements whatever the page size");
  assert.ok(large <= 32, `a bounded number of statements (${large})`);
});

test("11. a NEW approval request for the same project becomes the displayed record and re-anchors the row; the old invoice's date can no longer move it", async () => {
  // PA's first lifecycle (request 3 Oct -> AINV) is finished. A genuinely new request is submitted on 20 Oct.
  await prisma.invoiceRequest.create({ data: { projectId: P.PA!.id, requestedByUserId: people.owner!.id, assignedToUserId: people.owner!.id, status: "Open", createdAt: new Date("2026-10-20T06:00:00Z") } });
  const NEW_ORDER = ["PA", "PD", "PE", "PF", "PB", "PC"];
  let month = await list();
  assert.deepEqual(orderOf(month), NEW_ORDER, "PA's row is now represented by the NEW request (20 Oct), not by its first-ever one (3 Oct): it moves to the TOP, above PD (12 Oct)");
  assert.deepEqual([row(month, "PA").latestRecord.kind, row(month, "PA").latestRecord.status, row(month, "PA").approvalSubmittedAt], ["request", "PendingApproval", "2026-10-20T06:00:00.000Z"]);

  // Accounts raises the invoice for the new request through the real API
  const created = await api(`/quantity/${P.PA!.items[0]}/invoice-lines`, "owner", "POST", { invoiceNo: `${TAG}-ANEW`, invoiceIntent: "new", invoiceDate: "2026-10-28", quantityBilled: 0, invoiceAmountINR: 900, status: "Raised" });
  assert.equal(created.status, 201, created.message);
  await waitFor(async () => (await prisma.invoiceRequest.count({ where: { projectId: P.PA!.id, status: "Open" } })) === 0, "the new request to be fulfilled");
  const linked = await prisma.invoiceRequest.findFirstOrThrow({ where: { projectId: P.PA!.id, createdAt: new Date("2026-10-20T06:00:00Z") } });
  assert.equal(linked.fulfilledInvoiceLineId, created.data.id, "the new request is linked to ITS invoice; the first request keeps its own link");
  assert.equal((await requestOf("PA")).fulfilledInvoiceLineId !== created.data.id, true);
  month = await list();
  assert.deepEqual(orderOf(month), NEW_ORDER, "fulfilment did not move the row");
  assert.deepEqual([row(month, "PA").latestRecord.kind, row(month, "PA").latestRecord.reference, row(month, "PA").latestRecord.status, row(month, "PA").latestRecord.amountINR, row(month, "PA").approvalSubmittedAt], ["invoice", `${TAG}-ANEW`, "Raised", 900, "2026-10-20T06:00:00.000Z"]);

  // paid, then the dates of BOTH invoices are edited around: nothing moves, nothing flips to the old lifecycle
  const edit = (invoiceNo: string, id: string, date: string, status: string, amount: number) => api(`/invoice-lines/${id}`, "owner", "PATCH", patchBody(invoiceNo, date, amount, status));
  assert.equal((await edit(`${TAG}-ANEW`, created.data.id, "2026-10-28", "Paid", 900)).status, 200);
  const oldInvoice = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceNo: `${TAG}-AINV` } });
  for (const [which, no, id, date, amount] of [["old invoice to 31 Oct", `${TAG}-AINV`, oldInvoice.id, "2026-10-31", 5000], ["old invoice to 1 Sep", `${TAG}-AINV`, oldInvoice.id, "2026-09-01", 5000], ["new invoice to 1 Oct", `${TAG}-ANEW`, created.data.id, "2026-10-01", 900]] as const) {
    assert.equal((await edit(no, id, date, "Paid", amount)).status, 200, which);
    month = await list();
    assert.deepEqual(orderOf(month), NEW_ORDER, `${which}: position unchanged`);
    assert.deepEqual([row(month, "PA").latestRecord.reference, row(month, "PA").latestRecord.status, row(month, "PA").approvalSubmittedAt], [`${TAG}-ANEW`, "Paid", "2026-10-20T06:00:00.000Z"], `${which}: same displayed record, status updated in place`);
    assert.deepEqual(orderOf(await list("month=all")), NEW_ORDER, `${which}: all history agrees`);
  }

  // expanded history: the row's record first, then everything newest first; event timelines oldest first (unchanged behaviour)
  const c = await chain("PA", "all");
  assert.deepEqual(c.latestRecord, row(await list("month=all"), "PA").latestRecord, "the expanded project shows the very record the row shows");
  assert.equal(c.recordOrder[0].id, c.latestRecord.id);
  const dayOf = (o: { kind: string; id: string }) => (o.kind === "invoice" ? c.invoices.find((i: any) => i.key === o.id).invoiceDate : c.requests.find((r: any) => r.id === o.id).createdAt.slice(0, 10));
  const rest = c.recordOrder.slice(1).map(dayOf);
  assert.deepEqual(rest, [...rest].sort().reverse(), "the other records stay newest first");
  assert.deepEqual(c.recordOrder.length, 4, "two invoices and two requests, none duplicated or lost");
  for (const inv of c.invoices) {
    const times = inv.timeline.map((e: any) => Date.parse(e.occurredAt));
    assert.deepEqual(times, [...times].sort((a, b) => a - b), `${inv.invoiceNo}: status events oldest first`);
  }
});

test("12. projects without an approval request follow the displayed record's invoice date, LATEST first, then PR number; row and expanded record always agree; pages are stable", async () => {
  const makeProject = async (k: string) => {
    const proj = await prisma.project.create({
      data: {
        poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-${k}`, client: `Itao Client ${k}`, department: "Process", domesticForeign: "Domestic",
        projectTitle: `Itao ${k}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", createdByUserId: people.owner!.id,
      },
    });
    projectIds.push(proj.id);
    const item = await prisma.quantityItem.create({ data: { projectId: proj.id, description: "Activity 1", woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1_000_000 } });
    P[k] = { id: proj.id, items: [item.id] };
    return item.id;
  };
  const invoice = async (k: string, no: string, status: string, date: string) =>
    prisma.invoiceLine.create({ data: { quantityItemId: await makeProject(k), invoiceNo: `${TAG}-${no}`, invoiceDate: new Date(`${date}T00:00:00.000Z`), quantityBilled: 0, invoiceAmountINR: 10, status, createdBy: "Direct Entry", createdAt: new Date(`${date}T06:00:00.000Z`) } });
  await invoice("PG", "GINV", "Raised", "2026-10-10");
  await invoice("PH", "HINV", "Raised", "2026-10-20");
  await invoice("PI", "IINV", "Paid", "2026-10-20"); // the same date as PH and PC: the PR number breaks the tie
  await invoice("PJ", "JINV", "Draft", "2026-10-29"); // a Draft is not a displayed record

  const month = await list();
  assert.deepEqual(orderOf(month), ["PA", "PD", "PE", "PF", "PB", "PC", "PH", "PI", "PG", "PJ"],
    "approvals first, latest submission first (20, 12, 7, 6, 5 Oct); then the others by displayed invoice date, latest first (PC, PH, PI all 20 Oct -> PR number, then PG 10 Oct); PJ displays nothing, last");
  assert.deepEqual(month.items.map((i: any) => i.sortTier), [1, 1, 1, 1, 1, 2, 2, 2, 2, 3]);
  assert.deepEqual(month.items.slice(5, 9).map((i: any) => i.sortBasis), ["record_date", "record_date", "record_date", "record_date"]);
  const history = await list("month=all");
  assert.deepEqual(orderOf(history), ["PA", "PD", "PE", "PF", "PB", "PC", "PG", "PH", "PI", "PJ"], "all history: approval-linked projects first in the same order, the rest in PR-number order");
  assert.deepEqual(history.items.map((i: any) => i.sortTier), [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);

  // the ranking record IS the displayed record — in both views, for every row
  for (const [view, data] of [["2026-10", month], ["all", history]] as const) {
    for (const item of data.items) {
      const expanded = await chain(key(item.prNo), view);
      assert.deepEqual(expanded.latestRecord, item.latestRecord, `${view} ${item.prNo}: the row and its expanded list show the same record`);
      if (item.latestRecord) assert.equal(expanded.recordOrder[0].id, item.latestRecord.id, `${view} ${item.prNo}: it is listed first`);
    }
  }
  // stable across page sizes
  const seen: string[] = [];
  for (let page = 1; page <= 4; page++) seen.push(...orderOf((await api(`/invoice-tracker?month=2026-10&search=${TAG}&pageSize=3&page=${page}`, "admin")).data));
  assert.deepEqual(seen, orderOf(month), "the order does not change with the page size");
});

/** A project with one quantity item, registered for clean-up; returns its first item id. */
async function newProject(k: string): Promise<string> {
  const proj = await prisma.project.create({
    data: {
      poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-${k}`, client: `Itao Client ${k}`, department: "Process", domesticForeign: "Domestic",
      projectTitle: `Itao ${k}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", createdByUserId: people.owner!.id,
    },
  });
  projectIds.push(proj.id);
  const item = await prisma.quantityItem.create({ data: { projectId: proj.id, description: "Activity 1", woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1_000_000 } });
  P[k] = { id: proj.id, items: [item.id] };
  return item.id;
}
const requestRow = (k: string, status: "Open" | "Completed", createdAt: string, fulfilledInvoiceLineId: string | null = null) =>
  prisma.invoiceRequest.create({ data: { projectId: P[k]!.id, requestedByUserId: people.owner!.id, assignedToUserId: people.owner!.id, status, fulfilledInvoiceLineId, createdAt: new Date(createdAt) } });

test("13. the requirement's example through the real routes: 25 Oct Paid, 23 Oct Raised, 21 Oct Pending, 18 Oct Completed — latest submission first, and no status change moves a row", async () => {
  const xs = async (query = "month=2026-10", size = 50) => (await api(`/invoice-tracker?${query}&search=${TAG}-X&pageSize=${size}`, "admin")).data;
  const direct = async (k: string, no: string, status: string, date: string, amount: number) =>
    prisma.invoiceLine.create({ data: { quantityItemId: await newProject(k), invoiceNo: `${TAG}-${no}`, invoiceDate: new Date(`${date}T00:00:00.000Z`), quantityBilled: 0, invoiceAmountINR: amount, status, createdBy: "Direct Entry", createdAt: new Date(`${date}T06:00:00.000Z`) } });
  const l1003 = await direct("X1003", "X1003INV", "Raised", "2026-10-26", 300);
  await requestRow("X1003", "Completed", "2026-10-25T06:00:00Z", l1003.id);
  const l1002 = await direct("X1002", "X1002INV", "Raised", "2026-10-24", 200);
  await requestRow("X1002", "Completed", "2026-10-23T06:00:00Z", l1002.id);
  await newProject("X1005");
  await requestRow("X1005", "Open", "2026-10-21T06:00:00Z");
  await newProject("X1001");
  await requestRow("X1001", "Completed", "2026-10-18T06:00:00Z", null); // completed by some other raise: nothing carries it

  const EXAMPLE = ["X1003", "X1002", "X1005", "X1001"];
  const patch = (no: string, id: string, date: string, amount: number, status: string) => api(`/invoice-lines/${id}`, "owner", "PATCH", patchBody(`${TAG}-${no}`, date, amount, status));
  assert.equal((await patch("X1003INV", l1003.id, "2026-10-26", 300, "Paid")).status, 200);
  let data = await xs();
  assert.deepEqual(orderOf(data), EXAMPLE, "the table in the requirement: 25 Oct (Paid), 23 Oct (Raised), 21 Oct (Pending), 18 Oct (Completed)");
  assert.deepEqual(data.items.map((i: any) => i.approvalSubmittedAt), ["2026-10-25T06:00:00.000Z", "2026-10-23T06:00:00.000Z", "2026-10-21T06:00:00.000Z", "2026-10-18T06:00:00.000Z"]);
  assert.deepEqual(data.items.map((i: any) => i.latestRecord?.status ?? null), ["Paid", "Raised", "PendingApproval", null]);
  assert.deepEqual(data.items.map((i: any) => i.sortTier), [1, 1, 1, 1]);

  // Pending -> Raised -> Partially Paid -> Paid on X1005 (earlier submission): it must not move above the later ones
  const raised = await api(`/quantity/${P.X1005!.items[0]}/invoice-lines`, "owner", "POST", { invoiceNo: `${TAG}-X1005INV`, invoiceIntent: "new", invoiceDate: "2026-10-30", quantityBilled: 0, invoiceAmountINR: 500, status: "Raised" });
  assert.equal(raised.status, 201, raised.message);
  await waitFor(async () => (await prisma.invoiceRequest.count({ where: { projectId: P.X1005!.id, status: "Open" } })) === 0, "the 21 Oct request to be fulfilled");
  data = await xs();
  assert.deepEqual(orderOf(data), EXAMPLE, "Pending -> Raised (invoice dated 30 Oct, the newest date of all) does not move the 21 Oct row");
  assert.equal(row(data, "X1005").latestRecord.status, "Raised");
  for (const status of ["PartiallyPaid", "Paid"]) {
    assert.equal((await patch("X1005INV", raised.data.id, "2026-10-30", 500, status)).status, 200);
    data = await xs();
    assert.deepEqual(orderOf(data), EXAMPLE, `X1005 ${status}: position unchanged`);
    assert.equal(row(data, "X1005").latestRecord.status, status, `X1005: status updated in place`);
  }
  // Raised -> Partially Paid -> Paid on X1002
  for (const status of ["PartiallyPaid", "Paid"]) {
    assert.equal((await patch("X1002INV", l1002.id, "2026-10-24", 200, status)).status, 200);
    data = await xs();
    assert.deepEqual(orderOf(data), EXAMPLE, `X1002 ${status}: position unchanged`);
    assert.equal(row(data, "X1002").latestRecord.status, status);
  }
  assert.deepEqual(data.items.map((i: any) => i.approvalSubmittedAt), ["2026-10-25T06:00:00.000Z", "2026-10-23T06:00:00.000Z", "2026-10-21T06:00:00.000Z", "2026-10-18T06:00:00.000Z"], "no submission instant changed");
  assert.deepEqual(orderOf(await xs("month=all")), EXAMPLE, "all history agrees");

  // pagination: every page size gives the same sequence, no gaps, no duplicates
  for (const size of [1, 2, 3]) {
    const seen: string[] = [];
    for (let page = 1; page <= Math.ceil(4 / size); page++) seen.push(...orderOf(await xs(`month=2026-10&page=${page}`, size)));
    assert.deepEqual(seen, EXAMPLE, `page size ${size}`);
  }

  // a genuinely NEW request on X1002 (26 Oct) becomes its displayed record and puts it first; fulfilling it and editing the OLD invoice's date changes nothing
  await requestRow("X1002", "Open", "2026-10-26T06:00:00Z");
  data = await xs();
  assert.deepEqual(orderOf(data), ["X1002", "X1003", "X1005", "X1001"], "the new 26 Oct request moves X1002 to the top");
  assert.deepEqual([row(data, "X1002").latestRecord.kind, row(data, "X1002").latestRecord.status, row(data, "X1002").approvalSubmittedAt], ["request", "PendingApproval", "2026-10-26T06:00:00.000Z"]);
  const second = await api(`/quantity/${P.X1002!.items[0]}/invoice-lines`, "owner", "POST", { invoiceNo: `${TAG}-X1002INV2`, invoiceIntent: "new", invoiceDate: "2026-10-27", quantityBilled: 0, invoiceAmountINR: 250, status: "Raised" });
  assert.equal(second.status, 201, second.message);
  await waitFor(async () => (await prisma.invoiceRequest.count({ where: { projectId: P.X1002!.id, status: "Open" } })) === 0, "the 26 Oct request to be fulfilled");
  for (const date of ["2026-10-31", "2026-09-01", "2026-10-24"]) {
    assert.equal((await patch("X1002INV", l1002.id, date, 200, "Paid")).status, 200);
    data = await xs();
    assert.deepEqual(orderOf(data), ["X1002", "X1003", "X1005", "X1001"], `old invoice dated ${date}: nothing moves`);
    assert.deepEqual([row(data, "X1002").latestRecord.reference, row(data, "X1002").approvalSubmittedAt], [`${TAG}-X1002INV2`, "2026-10-26T06:00:00.000Z"]);
  }
  // expanded history is unchanged: the displayed record first, the rest newest first
  const c = await chain("X1002", "all");
  assert.equal(c.recordOrder[0].id, c.latestRecord.id);
  assert.equal(c.recordOrder.length, 4, "two invoices and two requests");
});

test("14. month boundaries through the real routes (India time): 23:59:59 IST on 30 Sep is September, 00:00:00 IST on 1 Oct is October; 23:59:59 IST on 31 Oct is October, 00:00:00 IST on 1 Nov is November", async () => {
  const bs = async (query: string) => (await api(`/invoice-tracker?${query}&search=${TAG}-B&pageSize=50`, "admin")).data;
  for (const [k, at] of [["BSEP", "2026-09-30T18:29:59Z"], ["BOCT1", "2026-09-30T18:30:00Z"], ["BOCT2", "2026-10-31T18:29:59Z"], ["BNOV", "2026-10-31T18:30:00Z"]] as const) {
    await newProject(k);
    await requestRow(k, "Open", at);
  }
  assert.deepEqual(orderOf(await bs("month=2026-09")), ["BSEP"], "only the request submitted at 23:59:59 IST on 30 Sep");
  assert.deepEqual(orderOf(await bs("month=2026-10")), ["BOCT2", "BOCT1"], "1 Oct 00:00:00 and 31 Oct 23:59:59 IST are both October; the later submission is first");
  assert.deepEqual(orderOf(await bs("month=2026-11")), ["BNOV"], "only the request submitted at 00:00:00 IST on 1 Nov");
  assert.deepEqual(orderOf(await bs("month=all")), ["BNOV", "BOCT2", "BOCT1", "BSEP"], "all history: latest submission first");
  const oct = await bs("month=2026-10");
  assert.deepEqual(oct.items.map((i: any) => [i.sortTier, i.approvalSubmittedAt]), [[1, "2026-10-31T18:29:59.000Z"], [1, "2026-09-30T18:30:00.000Z"]]);
});

test("the Tracker still has no write routes, and no real mail was sent", async () => {
  assert.equal((await api(`/invoice-tracker`, "admin", "POST", {})).status, 404);
  assert.ok(sentMail.length > 0 && sentMail.every((m: any) => typeof m === "object"), "every outgoing mail was captured by the test transport");
});
