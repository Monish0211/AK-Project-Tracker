import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Invoice Tracker — the project row's LATEST RECORD (Latest Invoice Amount + Status) and the records list ("View records"), through the
 * real routes and the scratch database. Dates are explicit wherever the order matters; the request → raise → pay lifecycle (1-3) runs
 * through the EXISTING public API so the Tracker is proven to follow what the workflow really stores.
 *
 *  Q0 no records at all.                         Q1 only a Draft dated 5 Oct (listed, but nothing relevant → no latest record).
 *  Q2 request -> raise -> pay through the API.   Q3 older PAID invoice (10 Sep) + NEWER open request (14 Oct).
 *  Q4 three raised invoices (Aug Paid 1000, Sep Raised 2000, Oct Partially Paid 4000).
 *  Q5 two raised invoices; the OLDER one is paid afterwards (API) — it must not become the latest.
 *  Q6 request created 28 Oct, fulfilled by an invoice dated 4 Nov.   Q7 invoice dated 15 Oct, raised 16 Oct, PAID 10 Nov.
 *  Q8 an old paid invoice whose history must not change while a new request / raise / payment happen around it.
 */

const TAG = `ilr-${Date.now()}`;
/**
 * Invoices raised through the API are dated in the future on purpose: a request made through the API is created "now", so its place in
 * the order would otherwise depend on the day the suite runs. A date far ahead keeps the API-made invoice newer than the API-made request.
 */
const FUT = "2030-01-15";
let url = "";
let closeServer: () => Promise<void> = async () => {};
const userIds: string[] = [];
const projectIds: string[] = [];
const people: Record<string, { id: string; headers: Record<string, string> }> = {};
const P: Record<string, { id: string; items: string[] }> = {};
const L: Record<string, string> = {};

async function api(path: string, who: string | null, method = "GET", body?: unknown) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: who ? people[who]!.headers : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
}
const prOf = (key: string) => `${TAG}-${key}`;
/** The list scoped to ONE project by its exact PR number (search matches the PR number as a substring; keys are unique). */
const row = async (who: string, key: string, month: string) => {
  const r = await api(`/invoice-tracker?month=${month}&search=${prOf(key)}`, who);
  assert.equal(r.status, 200, r.message);
  return { page: r.data, item: (r.data.items as any[]).find((i) => i.prNo === prOf(key)) };
};
const chain = (who: string, key: string, month: string) => api(`/invoice-tracker/projects/${P[key]!.id}/invoices?month=${month}`, who);

const requirePg = createRequire(import.meta.url);
const pg = requirePg("pg");
let queryCount = 0;
const originalQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (this: unknown, ...args: unknown[]) {
  queryCount++;
  return originalQuery.apply(this, args);
};
async function countQueries(run: () => Promise<unknown>): Promise<number> {
  const start = queryCount;
  await run();
  return queryCount - start;
}

before(async () => {
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
  const passwordHash = await hashPassword("IlrTest@123");
  const make = async (key: string, role: { id: string; name: string }, modules: string[], approvals: string[]) => {
    const email = `${TAG}-${key}@example.com`;
    const u = await prisma.portalUser.create({
      data: {
        fullName: `Ilr ${key}`, email, passwordHash, department: "Accounts", roleId: role.id, forcePasswordChange: false,
        moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) },
        approvalPermissions: { create: approvals.map((approvalTypeId) => ({ approvalTypeId })) },
      },
    });
    userIds.push(u.id);
    people[key] = { id: u.id, headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: u.id, email, roleId: role.id, roleName: role.name })}` } };
  };
  await make("ownerA", engineer, [projectsM.id, invoicesM.id], [raise.id, edit.id, del.id]);
  await make("ownerB", engineer, [invoicesM.id], []);
  await make("accounts", adminRole, [invoicesM.id], [raise.id, edit.id, del.id]); // the responsible person who raises invoices
  await make("noInvoices", engineer, [projectsM.id], []);

  const mkProject = async (key: string) => {
    const p = await prisma.project.create({
      data: {
        poMonth: "2026-10", prCategory: "India", prNo: prOf(key), client: `Ilr Client ${key}`, department: "Process", domesticForeign: "Domestic",
        projectTitle: `Ilr ${key}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM",
        createdByUserId: people.ownerA!.id,
      },
    });
    projectIds.push(p.id);
    const item = await prisma.quantityItem.create({ data: { projectId: p.id, description: "Activity", woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1_000_000 } });
    P[key] = { id: p.id, items: [item.id] };
  };
  for (const k of ["Q0", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8"]) await mkProject(k);

  const direct = async (label: string, key: string, status: string, invoiceDate: string, createdAt: string, amount: number) => {
    const r = await prisma.invoiceLine.create({
      data: { quantityItemId: P[key]!.items[0]!, invoiceNo: `${TAG}-${label}`, invoiceDate: new Date(`${invoiceDate}T00:00:00.000Z`), quantityBilled: 0, invoiceAmountINR: amount, status, createdBy: "Direct Entry", createdAt: new Date(createdAt) },
    });
    L[label] = r.id;
  };
  const ev = (label: string, key: string, eventType: string, from: string | null, to: string | null, occurredAt: string) =>
    prisma.invoiceStatusEvent.create({
      data: { projectId: P[key]!.id, prNo: prOf(key), invoiceLineId: L[label]!, invoiceNo: `${TAG}-${label}`, eventType, fromStatus: from, toStatus: to, actorUserId: people.ownerA!.id, actorName: "Ilr ownerA", source: eventType === "CREATED" ? "invoice_create" : "invoice_update", occurredAt: new Date(occurredAt) },
    });
  const request = (key: string, status: "Open" | "Completed", createdAt: string, extra: { fulfilledInvoiceLineId?: string; invoiceAmountNote?: string } = {}) =>
    prisma.invoiceRequest.create({ data: { projectId: P[key]!.id, requestedByUserId: people.ownerA!.id, assignedToUserId: people.accounts!.id, status, createdAt: new Date(createdAt), ...extra } });

  await direct("Q1D", "Q1", "Draft", "2026-10-05", "2026-10-05T06:00:00Z", 900);

  await direct("Q3OLD", "Q3", "Paid", "2026-09-10", "2026-09-10T06:00:00Z", 90000);
  await ev("Q3OLD", "Q3", "CREATED", null, "Raised", "2026-09-11T06:00:00Z");
  await ev("Q3OLD", "Q3", "STATUS_CHANGED", "Raised", "Paid", "2026-09-25T06:00:00Z");
  await request("Q3", "Open", "2026-10-14T06:00:00Z", { invoiceAmountNote: "about 1.2 lakh" });

  await direct("Q4A", "Q4", "Paid", "2026-08-01", "2026-08-01T06:00:00Z", 1000);
  await direct("Q4B", "Q4", "Raised", "2026-09-01", "2026-09-01T06:00:00Z", 2000);
  await direct("Q4C", "Q4", "PartiallyPaid", "2026-10-02", "2026-10-02T06:00:00Z", 4000);

  await direct("Q5OLD", "Q5", "Raised", "2026-09-01", "2026-09-01T06:00:00Z", 1500);
  await ev("Q5OLD", "Q5", "CREATED", null, "Raised", "2026-09-02T06:00:00Z");
  await direct("Q5NEW", "Q5", "Raised", "2026-10-10", "2026-10-10T06:00:00Z", 2500);
  await ev("Q5NEW", "Q5", "CREATED", null, "Raised", "2026-10-11T06:00:00Z");

  await direct("Q6INV", "Q6", "Raised", "2026-11-04", "2026-11-04T06:00:00Z", 250000);
  await ev("Q6INV", "Q6", "CREATED", null, "Raised", "2026-11-04T07:00:00Z");
  await request("Q6", "Completed", "2026-10-28T06:00:00Z", { fulfilledInvoiceLineId: L.Q6INV! });

  await direct("Q7INV", "Q7", "Paid", "2026-10-15", "2026-10-15T06:00:00Z", 5000);
  await ev("Q7INV", "Q7", "CREATED", null, "Raised", "2026-10-16T06:00:00Z");
  await ev("Q7INV", "Q7", "STATUS_CHANGED", "Raised", "Paid", "2026-11-10T06:00:00Z"); // paid in NOVEMBER

  await direct("Q8OLD", "Q8", "Paid", "2026-09-05", "2026-09-05T06:00:00Z", 30000);
  await ev("Q8OLD", "Q8", "CREATED", null, "Raised", "2026-09-06T06:00:00Z");
  await ev("Q8OLD", "Q8", "STATUS_CHANGED", "Raised", "Paid", "2026-09-30T06:00:00Z");
});

after(async () => {
  pg.Client.prototype.query = originalQuery;
  try {
    await prisma.invoiceStatusEvent.deleteMany({ where: { prNo: { startsWith: TAG } } });
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.invoiceRequest.deleteMany({ where: { projectId: { in: projectIds } } });
    const items = await prisma.quantityItem.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItemId: { in: items.map((i) => i.id) } } });
    await prisma.invoiceNumber.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userApprovalPermission.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await closeServer();
  }
});

/** The fulfilment of open requests runs right after the raise, off the request path: wait for it. */
async function waitUntilCompleted(requestId: string) {
  for (let i = 0; i < 100; i++) {
    const r = await prisma.invoiceRequest.findUniqueOrThrow({ where: { id: requestId }, select: { status: true } });
    if (r.status === "Completed") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail("the open request was never completed by the raise");
}
const patchStatus = (lineId: string, no: string, date: string, amount: number, status: string) =>
  api(`/invoice-lines/${lineId}`, "ownerA", "PATCH", {
    invoiceNo: no, invoiceDate: date, milestoneId: null, milestoneName: null, setIndex: null, description: null, quantityBilled: 0, invoiceAmountINR: amount,
    clientReference: null, remarks: null, status,
  });

test("1-3 (real workflow): request -> Pending Approval with no amount -> raised by Accounts shows the entered amount as Raised -> Paid; one lifecycle, KPIs keep requests, raised and collected apart", async () => {
  // 1. a request is submitted through the real API
  const created = await api(`/projects/${P.Q2!.id}/invoice-requests`, "ownerA", "POST", { assignedToUserId: people.accounts!.id, ccMemberUserIds: [], notes: "ilr lifecycle" });
  assert.equal(created.status, 201, created.message);
  const requestId = created.data.id as string;
  let r = await row("ownerA", "Q2", "all");
  assert.ok(r.item, "the project is listed as soon as the request exists");
  assert.equal(r.item.latestRecord.kind, "request");
  assert.equal(r.item.latestRecord.status, "PendingApproval");
  assert.equal(r.item.latestRecord.amountINR, null, "no invoice amount yet");
  assert.equal(r.item.latestRecord.reference, requestId.slice(0, 8).toUpperCase());
  assert.deepEqual([r.page.summary.pendingApproval.count, r.page.summary.invoicesRaised, r.page.summary.raisedAmountINR, r.page.summary.collected.amountINR], [1, 0, 0, 0], "a request is not a raised invoice and not collected money");
  // the current India month lists it too (a request belongs to the month it was created in)
  const now = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
  assert.ok((await row("ownerA", "Q2", now)).item, "listed in the month of the request date");

  // 2. Accounts raises the invoice: the amount entered appears, the status is Raised, the request is the same lifecycle
  const raised = await api(`/quantity/${P.Q2!.items[0]}/invoice-lines`, "accounts", "POST", { invoiceNo: `${TAG}-Q2INV`, invoiceIntent: "new", invoiceDate: FUT, quantityBilled: 0, invoiceAmountINR: 7777, status: "Raised" });
  assert.equal(raised.status, 201, raised.message);
  L.Q2INV = raised.data.id;
  await waitUntilCompleted(requestId);
  r = await row("ownerA", "Q2", "all");
  assert.equal(r.item.latestRecord.kind, "invoice");
  assert.deepEqual([r.item.latestRecord.status, r.item.latestRecord.amountINR, r.item.latestRecord.reference], ["Raised", 7777, `${TAG}-Q2INV`]);
  assert.equal(r.item.latestRecord.requestRef, requestId.slice(0, 8).toUpperCase(), "the fulfilled request belongs to this invoice's lifecycle");
  assert.deepEqual([r.page.summary.pendingApproval.count, r.page.summary.invoicesRaised, r.page.summary.raisedAmountINR, r.page.summary.collected.amountINR], [0, 1, 7777, 0], "raised, not yet collected");
  assert.equal(r.page.summary.requests.completed, 1);

  // 3. payment received: the same record becomes Paid at the same amount, and the invoice is still counted once
  assert.equal((await patchStatus(L.Q2INV!, `${TAG}-Q2INV`, FUT, 7777, "Paid")).status, 200);
  r = await row("ownerA", "Q2", "all");
  assert.deepEqual([r.item.latestRecord.status, r.item.latestRecord.amountINR, r.item.latestRecord.reference], ["Paid", 7777, `${TAG}-Q2INV`]);
  assert.deepEqual([r.page.summary.invoicesRaised, r.page.summary.invoiceCount, r.page.summary.raisedAmountINR, r.page.summary.collected.amountINR, r.page.summary.collected.paidInvoiceCount], [1, 1, 7777, 7777, 1], "collected only once the invoice is Paid; still one invoice");
  const c = await chain("ownerA", "Q2", "all");
  assert.equal(c.data.invoices.length, 1, "status changes created no second invoice");
  assert.equal(c.data.requests.length, 1, "and no second request");
  assert.deepEqual(c.data.recordOrder, [{ kind: "invoice", id: `${TAG}-Q2INV`.toUpperCase() }, { kind: "request", id: requestId }], "both records are listed, the (future-dated) invoice first");
});

test("1. (month view) a project whose only record is a request is listed for the request's month with Pending Approval and no amount", async () => {
  const r = await row("ownerA", "Q3", "2026-10");
  assert.equal(r.item.latestRecord.status, "PendingApproval");
  assert.equal(r.item.latestRecord.amountINR, null);
  assert.equal(r.page.summary.pendingApproval.count, 1);
  assert.equal(r.page.summary.pendingApproval.amountINR, null, "no approval amount is invented");
});

test("4. an older PAID invoice and a NEWER pending request: the row shows the request; View records lists both, the request first, the invoice unchanged", async () => {
  const r = await row("ownerA", "Q3", "2026-10");
  assert.deepEqual([r.item.latestRecord.kind, r.item.latestRecord.status, r.item.latestRecord.amountINR], ["request", "PendingApproval", null]);
  const c = await chain("ownerA", "Q3", "2026-10");
  assert.equal(c.status, 200, c.message);
  assert.deepEqual(c.data.recordOrder.map((o: any) => o.kind), ["request", "invoice"], "latest first");
  assert.equal(c.data.latestRecord.kind, "request");
  assert.equal(c.data.recordOrder[0].id, c.data.latestRecord.id, "the first listed record IS the row's record");
  const old = c.data.previousInvoices.find((i: any) => i.invoiceNo === `${TAG}-Q3OLD`);
  assert.deepEqual([old.status, old.amountINR, old.invoiceDate], ["Paid", 90000, "2026-09-10"]);
  assert.deepEqual(old.timeline.map((e: any) => e.toStatus), ["Raised", "Paid"], "its recorded history is intact");
  // September, as of September: only the paid invoice existed
  const sep = await row("ownerA", "Q3", "2026-09");
  assert.deepEqual([sep.item.latestRecord.kind, sep.item.latestRecord.status, sep.item.latestRecord.amountINR], ["invoice", "Paid", 90000]);
});

test("5. several raised invoices: the row shows the latest only (never a sum); earlier months see the latest as of their end", async () => {
  const oct = (await row("ownerA", "Q4", "2026-10")).item.latestRecord;
  assert.deepEqual([oct.reference, oct.amountINR, oct.status, oct.recordDate], [`${TAG}-Q4C`, 4000, "PartiallyPaid", "2026-10-02"], "not 7000");
  const sep = (await row("ownerA", "Q4", "2026-09")).item.latestRecord;
  assert.deepEqual([sep.reference, sep.amountINR, sep.status], [`${TAG}-Q4B`, 2000, "Raised"]);
  const all = (await row("ownerA", "Q4", "all")).item.latestRecord;
  assert.equal(all.reference, `${TAG}-Q4C`);
  const c = await chain("ownerA", "Q4", "2026-10");
  assert.deepEqual(c.data.recordOrder.map((o: any) => o.id), [`${TAG}-Q4C`, `${TAG}-Q4B`, `${TAG}-Q4A`].map((s) => s.toUpperCase()), "newest to oldest, all three kept");
});

test("6. the OLDER invoice changes status after a newer one exists: it does not become the latest, and nothing is merged or duplicated", async () => {
  const before = (await row("ownerA", "Q5", "2026-10")).item.latestRecord;
  assert.equal(before.reference, `${TAG}-Q5NEW`);
  for (const status of ["PartiallyPaid", "Paid"]) {
    assert.equal((await patchStatus(L.Q5OLD!, `${TAG}-Q5OLD`, "2026-09-01", 1500, status)).status, 200);
    const after = (await row("ownerA", "Q5", "2026-10")).item.latestRecord;
    assert.deepEqual([after.reference, after.amountINR, after.status], [`${TAG}-Q5NEW`, 2500, "Raised"], `older invoice now ${status}`);
  }
  const c = await chain("ownerA", "Q5", "2026-10");
  assert.equal(c.data.invoices.length + c.data.previousInvoices.length, 2, "still exactly two invoices");
  const older = c.data.previousInvoices.find((i: any) => i.invoiceNo === `${TAG}-Q5OLD`);
  assert.equal(older.status, "Paid", "the older invoice does show its own new status in the history");
});

test("7. an October request raised in November: October keeps the REQUEST (no amount, pointing at the November invoice); November shows the invoice and its amount; KPIs stay in their own months", async () => {
  const oct = await row("ownerA", "Q6", "2026-10");
  assert.ok(oct.item, "the project appears in October because the request was made in October");
  assert.deepEqual([oct.item.latestRecord.kind, oct.item.latestRecord.amountINR, oct.item.latestRecord.status], ["request", null, "Raised"]);
  assert.deepEqual(oct.item.latestRecord.raisedLater, { invoiceNo: `${TAG}-Q6INV`, invoiceDate: "2026-11-04" });
  assert.deepEqual([oct.page.summary.invoiceCount, oct.page.summary.invoicesRaised, oct.page.summary.raisedAmountINR, oct.page.summary.requestCount, oct.page.summary.requests.completed, oct.page.summary.pendingApproval.count], [0, 0, 0, 1, 1, 0], "October holds the request, not the November invoice's amount");
  const nov = await row("ownerA", "Q6", "2026-11");
  assert.deepEqual([nov.item.latestRecord.kind, nov.item.latestRecord.amountINR, nov.item.latestRecord.status], ["invoice", 250000, "Raised"]);
  assert.deepEqual([nov.page.summary.invoiceCount, nov.page.summary.invoicesRaised, nov.page.summary.raisedAmountINR, nov.page.summary.requestCount], [1, 1, 250000, 0], "November holds the raised amount, not the October request");
  const octChain = await chain("ownerA", "Q6", "2026-10");
  assert.equal(octChain.data.requests[0].fulfilledByInvoiceNo, `${TAG}-Q6INV`);
  assert.equal(octChain.data.requests[0].fulfilledByInvoiceDate, "2026-11-04", "the request says where its invoice (and amount) lives");
  assert.equal(octChain.data.invoices.length + octChain.data.previousInvoices.length, 0, "the November invoice is not part of October's records");
});

test("8. payment received in a later month: the invoice keeps its October date and counts, the project does not reappear as a November raise", async () => {
  const oct = await row("ownerA", "Q7", "2026-10");
  assert.deepEqual([oct.item.latestRecord.status, oct.item.latestRecord.amountINR, oct.item.latestRecord.recordDate], ["Paid", 5000, "2026-10-15"]);
  assert.deepEqual([oct.page.summary.invoiceCount, oct.page.summary.invoicesRaised, oct.page.summary.byStatus.paid, oct.page.summary.byStatus.raised], [1, 1, 1, 0], "one October invoice, now paid");
  assert.equal(oct.item.records.raisedInPeriodCount, 1, "its raise (16 Oct) is still an October raise");
  const nov = await api(`/invoice-tracker?month=2026-11&search=${prOf("Q7")}`, "ownerA");
  assert.equal(nov.data.items.length, 0, "payment in November does not list the project in November");
  assert.deepEqual([nov.data.summary.invoiceCount, nov.data.summary.invoicesRaised, nov.data.summary.raisedAmountINR], [0, 0, 0], "and is not a new raised invoice there");
  const novChain = await chain("ownerA", "Q7", "2026-11");
  assert.equal(novChain.data.invoices.length, 0);
  assert.equal(novChain.data.previousInvoices.length, 1, "November sees it only as an earlier invoice");
  assert.equal(novChain.data.latestRecord.inMonth, false, "never mistaken for a November invoice");
});

test("9. no records: a project with nothing is not listed; one listed only for a Draft has no latest record; View records is empty", async () => {
  assert.equal((await row("ownerA", "Q0", "all")).item, undefined, "no record in any month -> not in the report");
  const draftOnly = await row("ownerA", "Q1", "2026-10");
  assert.ok(draftOnly.item);
  assert.equal(draftOnly.item.latestRecord, null, "a Draft is not a raised invoice and not an approval request");
  const c0 = await chain("ownerA", "Q0", "2026-10");
  assert.equal(c0.status, 200);
  assert.deepEqual([c0.data.latestRecord, c0.data.recordOrder, c0.data.invoices, c0.data.requests, c0.data.previousRequests], [null, [], [], [], []]);
  const c1 = await chain("ownerA", "Q1", "2026-10");
  assert.equal(c1.data.latestRecord, null);
  assert.equal(c1.data.recordOrder.length, 1, "the draft is still a listed record");
});

test("10. earlier history is unchanged by a new request, a new raised invoice and its payment", async () => {
  const snapshot = async () => {
    const c = await chain("ownerA", "Q8", "all");
    return JSON.stringify(c.data.invoices.find((i: any) => i.invoiceNo === `${TAG}-Q8OLD`));
  };
  const original = await snapshot();
  assert.ok(original.includes('"status":"Paid"'));
  const created = await api(`/projects/${P.Q8!.id}/invoice-requests`, "ownerA", "POST", { assignedToUserId: people.accounts!.id, ccMemberUserIds: [] });
  assert.equal(created.status, 201, created.message);
  assert.equal(await snapshot(), original, "after a new request");
  const raised = await api(`/quantity/${P.Q8!.items[0]}/invoice-lines`, "accounts", "POST", { invoiceNo: `${TAG}-Q8NEW`, invoiceIntent: "new", invoiceDate: FUT, quantityBilled: 0, invoiceAmountINR: 4242, status: "Raised" });
  assert.equal(raised.status, 201, raised.message);
  await waitUntilCompleted(created.data.id);
  assert.equal(await snapshot(), original, "after the invoice is raised");
  assert.equal((await patchStatus(raised.data.id, `${TAG}-Q8NEW`, FUT, 4242, "Paid")).status, 200);
  assert.equal(await snapshot(), original, "after the new invoice is paid");
  const c = await chain("ownerA", "Q8", "all");
  assert.deepEqual(c.data.recordOrder.map((o: any) => o.kind), ["invoice", "request", "invoice"], "new invoice, its request, then the old invoice — newest first, nothing lost");
  assert.equal(c.data.latestRecord.reference, `${TAG}-Q8NEW`);
});

test("records are only ever the caller's: another user and a user without the Invoices module see nothing", async () => {
  const other = await api(`/invoice-tracker?month=all&search=${TAG}`, "ownerB");
  assert.equal(other.status, 200);
  assert.equal(other.data.items.length, 0, "no project of ownerA is visible to ownerB, so no latest record leaks");
  assert.equal((await api(`/invoice-tracker?month=all&search=${TAG}`, "noInvoices")).status, 403);
  assert.ok([403, 404].includes((await chain("ownerB", "Q4", "all")).status));
  assert.equal((await api(`/invoice-tracker?month=all&search=${TAG}`, null)).status, 401);
});

test("the latest record costs ONE extra batched read: statements do not grow with the number of projects on the page", async () => {
  await api(`/invoice-tracker?month=all&search=${prOf("Q4")}`, "ownerA"); // warm up
  const one = await countQueries(() => api(`/invoice-tracker?month=all&search=${prOf("Q4")}`, "ownerA"));
  const many = await countQueries(() => api(`/invoice-tracker?month=all&search=${TAG}`, "ownerA"));
  assert.equal(many, one, `1 project: ${one} statements, ${(await api(`/invoice-tracker?month=all&search=${TAG}`, "ownerA")).data.items.length} projects: ${many}`);
});

test("ordering is stable across pages: pageSize 1 walks every project once, each with exactly one latest record", async () => {
  const seen: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await api(`/invoice-tracker?month=all&search=${TAG}&page=${page}&pageSize=1`, "ownerA");
    for (const i of r.data.items) {
      seen.push(i.prNo);
      assert.ok(i.latestRecord === null || typeof i.latestRecord.kind === "string");
    }
    if (page >= r.data.totalPages) break;
  }
  assert.equal(new Set(seen).size, seen.length, "no project twice");
  assert.ok(seen.length >= 8);
});
