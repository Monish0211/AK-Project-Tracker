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
 * Invoice Tracker — GET /invoice-tracker/raised-breakdown: the invoices behind the "Raised invoice amount" card, through the real
 * routes and the scratch database. The one rule under test: the breakdown IS the card — same selection, same amounts — for every
 * month and every filter. Dates are explicit. Every list is scoped with search=TAG so unrelated scratch data cannot interfere.
 *
 * October 2026 (owner A, search=TAG):
 *  B1 (Active)   Raised 80,000 (10 Oct) · Raised 1,20,000 (15 Oct) · Paid 1,00,000 (28 Oct)  = 3,00,000 / 3 invoices. A NEWER open request (29 Oct)
 *                is the project's latest record, so the table row shows "—" — the breakdown must still list all three.
 *                NOT October: Paid 55,000 (10 Sep) and Raised 70,000 (5 Nov).
 *  B2 (Active)   Paid 3,33,000 (5 Oct) + a newer open request (22 Oct)                          = 3,33,000 / 1
 *  B3 (Active)   Raised 25,000 (3 Oct) · multi-line invoice 10,000 + 5,000 + a CANCELLED line 2,000 (8 Oct) = 15,000 · Partially Paid 40,000 (20 Oct)
 *                = 80,000 / 3.  Not counted: Draft 50,000 (25 Oct), Cancelled 70,000 (12 Oct).
 *  B4 (Active)   a Draft (11 Oct) and an open request — no raised invoice at all                  = not in the breakdown
 *  B5 (Active)   dated 15 Jan but CREATED in October · dated 20 Sep but its raise event is in OCTOBER · an invoice with an unusable date (year 1850)
 *                = nothing in October; the unusable one appears only in "all".
 *  B7 (On Hold)  legacy stored "Submitted" 7,000 (6 Oct)                                          = 7,000 / 1 (counts as Raised)
 *  B6 (owner B)  Raised 11,111 (9 Oct) — visible to owner B only.
 *  Owner A, October: 3,00,000 + 3,33,000 + 80,000 + 7,000 = 7,20,000 across 8 invoices in 4 projects.
 */

const TAG = `rbd-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => {};
const userIds: string[] = [];
const projectIds: string[] = [];
const people: Record<string, { id: string; headers: Record<string, string> }> = {};
const P: Record<string, { id: string; items: string[] }> = {};

async function api(path: string, who: string | null) {
  const res = await fetch(`${url}${path}`, { headers: who ? people[who]!.headers : { "Content-Type": "application/json" } });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
}
const prOf = (key: string) => `${TAG}-${key}`;
const qs = (o: Record<string, string | number>) => new URLSearchParams(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)]))).toString();
const list = (who: string, o: Record<string, string | number> = {}) => api(`/invoice-tracker?${qs({ month: "2026-10", search: TAG, ...o })}`, who);
const breakdown = (who: string, o: Record<string, string | number> = {}) => api(`/invoice-tracker/raised-breakdown?${qs({ month: "2026-10", search: TAG, ...o })}`, who);
const no = (invoiceNo: string) => invoiceNo.slice(TAG.length + 1);

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

  const [engineer, invoicesM, projectsM] = await Promise.all([
    prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Invoices" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Projects" } }),
  ]);
  const passwordHash = await hashPassword("RbdTest@123");
  const make = async (key: string, modules: string[]) => {
    const email = `${TAG}-${key}@example.com`;
    const u = await prisma.portalUser.create({
      data: { fullName: `Rbd ${key}`, email, passwordHash, department: "Accounts", roleId: engineer.id, forcePasswordChange: false, moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) } },
    });
    userIds.push(u.id);
    people[key] = { id: u.id, headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: u.id, email, roleId: engineer.id, roleName: engineer.name })}` } };
  };
  await make("ownerA", [projectsM.id, invoicesM.id]);
  await make("ownerB", [invoicesM.id]);
  await make("noInvoices", [projectsM.id]);

  const mkProject = async (key: string, owner: string, status = "Active") => {
    const p = await prisma.project.create({
      data: {
        poMonth: "2026-10", prCategory: "India", prNo: prOf(key), client: `Rbd Client ${key}`, department: "Process", domesticForeign: "Domestic",
        projectTitle: `Rbd ${key}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: status, contractType: "LUMP SUM", createdByUserId: people[owner]!.id,
      },
    });
    projectIds.push(p.id);
    const items: string[] = [];
    for (let i = 0; i < 3; i++) items.push((await prisma.quantityItem.create({ data: { projectId: p.id, description: `Activity ${i + 1}`, woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1_000_000 } })).id);
    P[key] = { id: p.id, items };
  };
  await mkProject("B1", "ownerA");
  await mkProject("B2", "ownerA");
  await mkProject("B3", "ownerA");
  await mkProject("B4", "ownerA");
  await mkProject("B5", "ownerA");
  await mkProject("B7", "ownerA", "On Hold");
  await mkProject("B6", "ownerB");

  const line = (key: string, label: string, status: string, invoiceDate: string, createdAt: string, amount: number, item = 0) =>
    prisma.invoiceLine.create({
      data: { quantityItemId: P[key]!.items[item]!, invoiceNo: `${TAG}-${label}`, invoiceDate: new Date(`${invoiceDate}T00:00:00.000Z`), quantityBilled: 0, invoiceAmountINR: amount, status, createdBy: "Direct Entry", createdAt: new Date(createdAt) },
    });
  const request = (key: string, status: "Open" | "Completed", createdAt: string) =>
    prisma.invoiceRequest.create({ data: { projectId: P[key]!.id, requestedByUserId: people.ownerA!.id, assignedToUserId: people.ownerA!.id, status, createdAt: new Date(createdAt), invoiceAmountNote: "about 9 lakh (free text, never counted)" } });

  // B1
  await line("B1", "B1-R1", "Raised", "2026-10-10", "2026-10-10T06:00:00Z", 80000);
  await line("B1", "B1-R2", "Raised", "2026-10-15", "2026-10-15T06:00:00Z", 120000);
  await line("B1", "B1-PAID", "Paid", "2026-10-28", "2026-10-28T06:00:00Z", 100000);
  await line("B1", "B1-SEP", "Paid", "2026-09-10", "2026-09-10T06:00:00Z", 55000);
  await line("B1", "B1-NOV", "Raised", "2026-11-05", "2026-11-05T06:00:00Z", 70000);
  await request("B1", "Open", "2026-10-29T06:00:00Z");
  // B2
  await line("B2", "B2-PAID", "Paid", "2026-10-05", "2026-10-05T06:00:00Z", 333000);
  await request("B2", "Open", "2026-10-22T06:00:00Z");
  // B3
  await line("B3", "B3-E", "Raised", "2026-10-03", "2026-10-03T06:00:00Z", 25000);
  await line("B3", "B3-M", "Raised", "2026-10-08", "2026-10-08T06:00:00Z", 10000, 0);
  await line("B3", "B3-M", "Raised", "2026-10-09", "2026-10-09T06:00:00Z", 5000, 1);
  await line("B3", "B3-M", "Cancelled", "2026-10-09", "2026-10-09T06:00:00Z", 2000, 2);
  await line("B3", "B3-PART", "PartiallyPaid", "2026-10-20", "2026-10-20T06:00:00Z", 40000);
  await line("B3", "B3-DRAFT", "Draft", "2026-10-25", "2026-10-25T06:00:00Z", 50000);
  await line("B3", "B3-CANC", "Cancelled", "2026-10-12", "2026-10-12T06:00:00Z", 70000);
  // B4
  await line("B4", "B4-DRAFT", "Draft", "2026-10-11", "2026-10-11T06:00:00Z", 9000);
  await request("B4", "Open", "2026-10-08T06:00:00Z");
  // B5
  await line("B5", "B5-JAN", "Raised", "2026-01-15", "2026-10-10T06:00:00Z", 90000); // created in October, dated January
  const sepDated = await line("B5", "B5-SEPDATED", "Raised", "2026-09-20", "2026-09-20T06:00:00Z", 60000); // raise recorded in October, dated September
  await prisma.invoiceStatusEvent.create({
    data: { projectId: P.B5!.id, prNo: prOf("B5"), invoiceLineId: sepDated.id, invoiceNo: `${TAG}-B5-SEPDATED`, eventType: "CREATED", fromStatus: null, toStatus: "Raised", actorUserId: people.ownerA!.id, actorName: "Rbd ownerA", source: "invoice_create", occurredAt: new Date("2026-10-12T06:00:00Z") },
  });
  await line("B5", "B5-BAD", "Raised", "1850-06-01", "2026-10-10T06:00:00Z", 77); // no usable invoice date
  // B7, B6
  await line("B7", "B7-SUBM", "Submitted", "2026-10-06", "2026-10-06T06:00:00Z", 7000);
  await line("B6", "B6-R", "Raised", "2026-10-09", "2026-10-09T06:00:00Z", 11111);
});

after(async () => {
  pg.Client.prototype.query = originalQuery;
  try {
    await prisma.invoiceStatusEvent.deleteMany({ where: { prNo: { startsWith: TAG } } });
    await prisma.invoiceRequest.deleteMany({ where: { projectId: { in: projectIds } } });
    const items = await prisma.quantityItem.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItemId: { in: items.map((i) => i.id) } } });
    await prisma.invoiceNumber.deleteMany({ where: { projectId: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await closeServer();
  }
});

/** Every internal total of a breakdown adds up, and it equals the card (the list's summary for the SAME query). */
async function assertReconciles(who: string, o: Record<string, string | number> = {}) {
  const [l, b] = await Promise.all([list(who, o), breakdown(who, { pageSize: 100, ...o })]);
  assert.equal(l.status, 200, l.message);
  assert.equal(b.status, 200, b.message);
  const sum = (xs: number[]) => Math.round(xs.reduce((a, c) => a + c, 0) * 100) / 100;
  assert.equal(b.data.totalINR, l.data.summary.raisedAmountINR, `the breakdown total IS the card (${JSON.stringify(o)})`);
  assert.equal(b.data.invoiceCount, l.data.summary.invoicesRaised, "…and its invoice count IS the card's count");
  assert.equal(sum(b.data.projects.map((p: any) => p.totalINR)), b.data.totalINR, "project totals add up to the total");
  assert.equal(b.data.projects.reduce((n: number, p: any) => n + p.invoiceCount, 0), b.data.invoiceCount, "project invoice counts add up");
  for (const p of b.data.projects) {
    assert.equal(sum(p.invoices.map((i: any) => i.amountINR)), p.totalINR, `${p.prNo}: its invoices add up to its total`);
    assert.equal(p.invoices.length, p.invoiceCount);
  }
  return { l, b };
}

test("October: the breakdown IS the card — 7,20,000 across 8 invoices in 4 projects, largest project first", async () => {
  const { l, b } = await assertReconciles("ownerA");
  assert.equal(l.data.summary.raisedAmountINR, 720000);
  assert.deepEqual([b.data.totalINR, b.data.invoiceCount, b.data.projectCount], [720000, 8, 4]);
  assert.deepEqual(b.data.projects.map((p: any) => [p.prNo.slice(TAG.length + 1), p.invoiceCount, p.totalINR]), [["B2", 1, 333000], ["B1", 3, 300000], ["B3", 3, 80000], ["B7", 1, 7000]]);
  assert.equal(b.data.periodStart, "2026-10-01");
});

test("a project whose newest record is a pending request still lists ALL its qualifying invoices (the table row shows only the request)", async () => {
  const l = await list("ownerA", { search: prOf("B1") });
  const row = l.data.items.find((i: any) => i.prNo === prOf("B1"));
  assert.deepEqual([row.latestRecord.kind, row.latestRecord.status, row.latestRecord.amountINR], ["request", "PendingApproval", null], "the row shows the request, with no amount");
  const b = await breakdown("ownerA", { search: prOf("B1") });
  const p = b.data.projects[0];
  assert.deepEqual(p.invoices.map((i: any) => [no(i.invoiceNo).replace("B1-", ""), i.invoiceDate, i.status, i.amountINR]), [
    ["PAID", "2026-10-28", "Paid", 100000],
    ["R2", "2026-10-15", "Raised", 120000],
    ["R1", "2026-10-10", "Raised", 80000],
  ], "newest first; the older October invoices are there");
  const b2 = await breakdown("ownerA", { search: prOf("B2") });
  assert.deepEqual([b2.data.totalINR, b2.data.projects[0].invoices[0].status], [333000, "Paid"], "a paid invoice behind a newer request is counted, once");
});

test("exclusions: drafts, cancelled invoices, cancelled lines, requests (and their free-text amounts), other months, creation/raise-date lookalikes", async () => {
  const b = await breakdown("ownerA", { pageSize: 100 });
  const all = b.data.projects.flatMap((p: any) => p.invoices.map((i: any) => no(i.invoiceNo)));
  assert.deepEqual([...all].sort(), ["B1-PAID", "B1-R1", "B1-R2", "B2-PAID", "B3-E", "B3-M", "B3-PART", "B7-SUBM"]);
  for (const excluded of ["B3-DRAFT", "B3-CANC", "B4-DRAFT", "B1-SEP", "B1-NOV", "B5-JAN", "B5-SEPDATED", "B5-BAD"]) assert.equal(all.includes(excluded), false, `${excluded} is not in October's raised amount`);
  assert.equal(b.data.projects.some((p: any) => p.prNo === prOf("B4")), false, "a project with only a draft and a request has no raised amount");
  const multi = b.data.projects.find((p: any) => p.prNo === prOf("B3")).invoices.find((i: any) => no(i.invoiceNo) === "B3-M");
  assert.deepEqual([multi.amountINR, multi.cancelledLineCount], [15000, 1], "one invoice at its live lines (10,000 + 5,000); the cancelled 2,000 line is left out");
  const legacy = b.data.projects.find((p: any) => p.prNo === prOf("B7")).invoices[0];
  assert.deepEqual([legacy.status, legacy.amountINR], ["Raised", 7000], "a legacy stored Submitted is Raised");
  const ids = b.data.projects.flatMap((p: any) => p.invoices.map((i: any) => i.key));
  assert.equal(new Set(ids).size, ids.length, "no invoice twice");
});

test("the month decides: other months reconcile to their own card; 'all' includes the invoice with no usable date; October-created lookalikes never leak", async () => {
  const sep = (await assertReconciles("ownerA", { month: "2026-09" })).b.data;
  assert.deepEqual(sep.projects.map((p: any) => [p.prNo.slice(TAG.length + 1), p.totalINR]).sort(), [["B1", 55000], ["B5", 60000]].sort(), "September: B1's paid 55,000 and B5's invoice DATED in September (raised in October) — by invoice date");
  const nov = (await assertReconciles("ownerA", { month: "2026-11" })).b.data;
  assert.deepEqual([nov.totalINR, nov.invoiceCount], [70000, 1]);
  const jan = (await assertReconciles("ownerA", { month: "2026-01" })).b.data;
  assert.deepEqual([jan.totalINR, jan.projects[0].invoices[0].invoiceNo.slice(TAG.length + 1)], [90000, "B5-JAN"], "dated January, so it is January's — not October's although created in October");
  const empty = (await assertReconciles("ownerA", { month: "2026-12" })).b.data;
  assert.deepEqual([empty.totalINR, empty.invoiceCount, empty.projects], [0, 0, []]);
  const all = (await assertReconciles("ownerA", { month: "all" })).b.data;
  assert.equal(all.totalINR, 720000 + 55000 + 70000 + 90000 + 60000 + 77, "every raised-class invoice of every month");
  const undated = all.projects.flatMap((p: any) => p.invoices).find((i: any) => no(i.invoiceNo) === "B5-BAD");
  assert.deepEqual([undated.invoiceDate, undated.amountINR], [null, 77], "no invoice date is shown rather than an invented one");
});

test("the same filters as the list: search, project status and 'Show' narrow the breakdown exactly as they narrow the card", async () => {
  for (const o of [{}, { filter: "all" }, { filter: "raised" }, { filter: "notRaised" }, { filter: "requestPending" }, { projectStatus: "On Hold" }, { projectStatus: "Active" }, { search: prOf("B3") }, { search: "no-such-project" }, { search: `${TAG}-B1`, filter: "requestPending" }]) {
    await assertReconciles("ownerA", o);
  }
  assert.equal((await breakdown("ownerA", { projectStatus: "On Hold" })).data.totalINR, 7000);
  assert.equal((await breakdown("ownerA", { filter: "notRaised" })).data.totalINR, 0, "projects with no raised invoice have no raised amount");
  assert.equal((await breakdown("ownerA", { filter: "requestPending" })).data.totalINR, 300000 + 333000, "projects with an open request: B1 and B2 — their older invoices still count");
});

test("paging is by project and never changes the totals: header figures are the whole report on every page; pages have no gaps or duplicates", async () => {
  const whole = (await breakdown("ownerA", { pageSize: 100 })).data;
  const seen: string[] = [];
  for (let page = 1; page <= 4; page++) {
    const r = await breakdown("ownerA", { pageSize: 1, page });
    assert.deepEqual([r.data.totalINR, r.data.invoiceCount, r.data.projectCount, r.data.totalPages], [whole.totalINR, whole.invoiceCount, whole.projectCount, 4], `page ${page} header`);
    assert.equal(r.data.projects.length, 1);
    seen.push(r.data.projects[0].prNo);
  }
  assert.deepEqual(seen, whole.projects.map((p: any) => p.prNo), "the same order on every call");
  assert.equal((await breakdown("ownerA", { pageSize: 1, page: 5 })).data.projects.length, 0, "past the last page: empty, not an error");
});

test("input and access: bad input is a 400; only the caller's projects; no Invoices module is refused; no token is refused", async () => {
  assert.equal((await breakdown("ownerA", { month: "2026-13" })).status, 400);
  assert.equal((await breakdown("ownerA", { page: 0 })).status, 400);
  assert.equal((await api(`/invoice-tracker/raised-breakdown?month=2026-10&bogus=1`, "ownerA")).status, 400, "unknown parameters are rejected like the list");
  const b = await assertReconciles("ownerB");
  assert.deepEqual([b.b.data.totalINR, b.b.data.projects.map((p: any) => p.prNo)], [11111, [prOf("B6")]], "owner B sees only the project they own");
  assert.equal((await breakdown("noInvoices")).status, 403);
  assert.equal((await breakdown(null as unknown as string)).status, 401);
});

test("one extra batched read: the number of statements does not grow with the number of projects or invoices", async () => {
  await breakdown("ownerA", { search: prOf("B2") }); // warm-up
  const one = await countQueries(() => breakdown("ownerA", { search: prOf("B2") }));
  const many = await countQueries(() => breakdown("ownerA", { pageSize: 100 }));
  assert.equal(many, one, `1 project: ${one} statements, 4 projects / 8 invoices: ${many}`);
  const month = await countQueries(() => list("ownerA", { pageSize: 100 }));
  assert.ok(many <= month + 2, `the breakdown costs about what the list costs (${many} vs ${month})`);
});
