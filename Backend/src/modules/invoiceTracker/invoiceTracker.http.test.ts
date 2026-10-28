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
 * Invoice Tracker — the MONTHLY REPORT IS FILTERED BY INVOICE DATE (never the creation, raised, payment or updated date); its project
 * rows are ordered by the original approval submission, then by the displayed record (see invoiceTrackerApprovalOrder.http.test.ts
 * for the full request → invoice → paid lifecycle). GET /invoice-tracker (month / all history), /invoice-tracker/outstanding and
 * /invoice-tracker/projects/:id/invoices through the real routes and the scratch database.
 *
 * Every record is inserted with explicit dates (invoiceDate, createdAt and the recorded raise events), so the boundaries are
 * exact whatever time zone the scratch database runs in. The selected month is 2026-10. Invoice dates are date-only values at
 * UTC midnight (no zone conversion); recorded raise times are instants in India time (28 Oct 18:30 UTC .. 31 Oct 18:30 UTC rolls
 * the month). Every list is scoped with search=TAG so unrelated scratch data cannot interfere.
 *
 *  P1 (ownerA)  OCTOBER-dated:   RAISEDOCT Raised 1000 (raised 16 Oct) · PAIDOCT Paid 3000 (raised 3 Oct, paid 10 Nov) · RAISEDSEP Raised 500
 *               (raised 25 SEPT) · DRAFT 100 · PART PartiallyPaid 2000 (dated 31 Oct) · FIRSTDAY Raised 50 (dated 1 Oct) · CANC Cancelled 700
 *               · MULTI two lines 100+200 (one invoice dated 20 Oct) · SUBM legacy "Submitted" 400.
 *               NOT October:      JANCREATEDOCT (dated 15 Jan, CREATED in Oct) · JANRAISEDOCT (dated 20 Jan, RAISED 12 Oct) · NOVRAISEDOCT (dated
 *               5 Nov, created + raised in Oct) · SEP30 (dated 30 Sep) · NOV1 (dated 1 Nov) · LATEJOIN (a line dated 28 Sep and one dated 5 Oct
 *               → ONE invoice dated 28 Sep, its earliest line).
 *  P2 (On Hold) one Draft dated 5 Oct.   P3  an Open invoice request created 3 Oct (no invoice).
 *  P4 (ownerB)  Raised 500 dated 9 Oct but RAISED 2 Nov.
 *  P5           SEPT Raised 600 (dated 10 Sep) · JULY Raised 250 (dated 10 Jul, paid later) · BADDATE Raised 77 whose invoice date is
 *               unusable (year 1850) · OLDPAID (added by a test).
 *  P6           Raised 700 dated 20 Oct (raised 20 Oct) + a Completed request created 2 Oct fulfilled by it.
 *  P7           EDGEIN Raised 10 (raised 31 Oct 23:59:59 IST) · EDGEOUT Raised 20 (raised 1 Nov 00:00:00 IST).   F1-F3  no records.
 */

const TAG = `itk-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => {};
const userIds: string[] = [];
const projectIds: string[] = [];
const people: Record<string, { id: string; name: string; headers: Record<string, string> }> = {};
const P: Record<string, { id: string; items: string[] }> = {};
const L: Record<string, string> = {}; // invoice line ids by label

async function api(path: string, who: string | null, method = "GET", body?: unknown) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: who ? people[who]!.headers : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
}
const list = (who: string, query = "month=2026-10") => api(`/invoice-tracker?${query}&search=${TAG}`, who);
const chain = (who: string, project: string, month = "2026-10") => api(`/invoice-tracker/projects/${P[project]!.id}/invoices?month=${month}`, who);
const outstanding = (who: string, query = "") => api(`/invoice-tracker/outstanding?search=${TAG}${query}`, who);
const nosOf = (invoices: any[]) => invoices.map((i) => i.invoiceNo.slice(TAG.length + 1));
const prsOf = (items: any[]) => items.map((i) => i.prNo.slice(TAG.length + 1));

// SQL statement counter (pg Client.query) — proves the request cost does not grow with page size or invoice count.
const requirePg = createRequire(import.meta.url);
const pg = requirePg("pg");
let queryCount = 0;
const originalQuery = pg.Client.prototype.query;
pg.Client.prototype.query = function (this: unknown, ...args: unknown[]) {
  queryCount++;
  return originalQuery.apply(this, args);
};
async function countQueries(run: () => Promise<unknown>): Promise<number> {
  const before = queryCount;
  await run();
  return queryCount - before;
}

before(async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  const [engineer, adminRole, invoicesM, projectsM, raise, edit, del, viewAll] = await Promise.all([
    prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } }),
    prisma.portalRole.findFirstOrThrow({ where: { name: "Administrator" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Invoices" } }),
    prisma.module.findFirstOrThrow({ where: { name: "Projects" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Raise Invoice" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Edit Invoice" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "Delete Invoice" } }),
    prisma.approvalType.findFirstOrThrow({ where: { name: "View All Projects" } }),
  ]);
  const passwordHash = await hashPassword("ItkTest@123");
  const make = async (key: string, role: { id: string; name: string }, modules: string[], approvals: string[]) => {
    const email = `${TAG}-${key}@example.com`;
    const u = await prisma.portalUser.create({
      data: {
        fullName: `Itk ${key}`, email, passwordHash, department: "Accounts", roleId: role.id, forcePasswordChange: false,
        moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) },
        approvalPermissions: { create: approvals.map((approvalTypeId) => ({ approvalTypeId })) },
      },
    });
    userIds.push(u.id);
    people[key] = { id: u.id, name: u.fullName, headers: { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: u.id, email, roleId: role.id, roleName: role.name })}` } };
  };
  await make("ownerA", engineer, [projectsM.id, invoicesM.id], [raise.id, edit.id, del.id]);
  await make("ownerB", engineer, [invoicesM.id], []);
  await make("admin", adminRole, [invoicesM.id], [raise.id, edit.id, del.id]);
  await make("noInvoices", engineer, [projectsM.id], []);
  await make("accounts", engineer, [invoicesM.id], [edit.id, del.id]); // Accounts-like: Invoices module, owns no project
  await make("viewAll", engineer, [invoicesM.id], [viewAll.id]);

  const mkProject = async (key: string, owner: string, itemCount = 1) => {
    const p = await prisma.project.create({
      data: {
        poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-${key}`, client: key.startsWith("F") ? "Filler Client" : `Itk Client ${key}`, department: "Process", domesticForeign: "Domestic",
        projectTitle: `Itk ${key}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: key === "P2" ? "On Hold" : "Active", contractType: "LUMP SUM",
        createdByUserId: people[owner]!.id,
      },
    });
    projectIds.push(p.id);
    const items: string[] = [];
    for (let i = 0; i < itemCount; i++) {
      items.push((await prisma.quantityItem.create({ data: { projectId: p.id, description: `Activity ${i + 1}`, woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1_000_000 } })).id);
    }
    P[key] = { id: p.id, items };
  };
  await mkProject("P1", "ownerA", 2);
  await mkProject("P2", "ownerA");
  await mkProject("P3", "ownerA");
  await mkProject("P4", "ownerB");
  await mkProject("P5", "ownerA");
  await mkProject("P6", "ownerA");
  await mkProject("P7", "ownerA");
  for (let i = 1; i <= 3; i++) await mkProject(`F${i}`, "ownerA");

  /** invoiceDate (date-only), createdAt and the recorded raise are all explicit and deliberately DIFFERENT, to prove only the invoice date decides the month. */
  const direct = async (label: string, project: string, status: string, invoiceDate: string, createdAt: string, amount: number, opts: { item?: number; invoiceNo?: string } = {}) => {
    const row = await prisma.invoiceLine.create({
      data: {
        quantityItemId: P[project]!.items[opts.item ?? 0]!, invoiceNo: opts.invoiceNo ?? `${TAG}-${label}`, invoiceDate: new Date(`${invoiceDate}T00:00:00.000Z`),
        quantityBilled: 0, invoiceAmountINR: amount, status, createdBy: "Direct Entry", createdAt: new Date(createdAt),
      },
    });
    L[label] = row.id;
  };
  const ev = (label: string, project: string, eventType: string, from: string | null, to: string | null, occurredAt: string) =>
    prisma.invoiceStatusEvent.create({
      data: { projectId: P[project]!.id, prNo: `${TAG}-${project}`, invoiceLineId: L[label]!, invoiceNo: `${TAG}-${label}`, eventType, fromStatus: from, toStatus: to, actorUserId: people.ownerA!.id, actorName: "Itk ownerA", source: eventType === "CREATED" ? "invoice_create" : "invoice_update", occurredAt: new Date(occurredAt) },
    });

  // ── P1: dated in October ──
  await direct("RAISEDOCT", "P1", "Raised", "2026-10-15", "2026-10-14T06:00:00Z", 1000);
  await ev("RAISEDOCT", "P1", "CREATED", null, "Raised", "2026-10-16T06:00:00Z");
  await direct("PAIDOCT", "P1", "Paid", "2026-10-02", "2026-10-02T06:00:00Z", 3000);
  await ev("PAIDOCT", "P1", "CREATED", null, "Raised", "2026-10-03T06:00:00Z");
  await ev("PAIDOCT", "P1", "STATUS_CHANGED", "Raised", "Paid", "2026-11-10T06:00:00Z"); // paid in November — still an October invoice
  await direct("RAISEDSEP", "P1", "Raised", "2026-10-10", "2026-09-20T06:00:00Z", 500);
  await ev("RAISEDSEP", "P1", "CREATED", null, "Raised", "2026-09-25T06:00:00Z"); // dated in October, raised in SEPTEMBER
  await direct("DRAFT", "P1", "Draft", "2026-10-25", "2026-10-20T06:00:00Z", 100);
  await direct("PART", "P1", "PartiallyPaid", "2026-10-31", "2026-10-31T06:00:00Z", 2000); // last day of the month
  await direct("FIRSTDAY", "P1", "Raised", "2026-10-01", "2026-09-15T06:00:00Z", 50); // first day of the month
  await direct("CANC", "P1", "Cancelled", "2026-10-12", "2026-10-12T06:00:00Z", 700);
  await direct("MULTIa", "P1", "Raised", "2026-10-20", "2026-10-20T06:00:00Z", 100, { invoiceNo: `${TAG}-MULTI` });
  await direct("MULTIb", "P1", "Raised", "2026-10-22", "2026-10-22T06:00:00Z", 200, { item: 1, invoiceNo: `${TAG}-MULTI` }); // ONE invoice dated 20 Oct (its earliest line)
  await direct("SUBM", "P1", "Submitted", "2026-10-18", "2026-10-18T06:00:00Z", 400); // legacy stored status = Raised
  // ── P1: NOT dated in October ──
  await direct("JANCREATEDOCT", "P1", "Raised", "2026-01-15", "2026-10-10T06:00:00Z", 800); // created in October
  await direct("JANRAISEDOCT", "P1", "Raised", "2026-01-20", "2026-01-20T06:00:00Z", 850);
  await ev("JANRAISEDOCT", "P1", "CREATED", null, "Draft", "2026-01-20T06:00:00Z");
  await ev("JANRAISEDOCT", "P1", "STATUS_CHANGED", "Draft", "Raised", "2026-10-12T06:00:00Z"); // RAISED in October
  await direct("NOVRAISEDOCT", "P1", "Raised", "2026-11-05", "2026-10-20T06:00:00Z", 900);
  await ev("NOVRAISEDOCT", "P1", "CREATED", null, "Raised", "2026-10-21T06:00:00Z"); // created and raised in October, dated November
  await direct("SEP30", "P1", "Raised", "2026-09-30", "2026-10-05T06:00:00Z", 60); // the day before
  await direct("NOV1", "P1", "Raised", "2026-11-01", "2026-10-05T06:00:00Z", 70); // the day after
  await direct("LATEJOINa", "P1", "Raised", "2026-09-28", "2026-09-28T06:00:00Z", 900, { invoiceNo: `${TAG}-LATEJOIN` });
  await direct("LATEJOINb", "P1", "Raised", "2026-10-05", "2026-10-05T06:00:00Z", 100, { item: 1, invoiceNo: `${TAG}-LATEJOIN` }); // one invoice dated 28 Sep
  // ── other projects ──
  await direct("P2D", "P2", "Draft", "2026-10-05", "2026-10-05T06:00:00Z", 150);
  await direct("P4R", "P4", "Raised", "2026-10-09", "2026-10-09T06:00:00Z", 500);
  await ev("P4R", "P4", "CREATED", null, "Draft", "2026-10-09T06:00:00Z");
  await ev("P4R", "P4", "STATUS_CHANGED", "Draft", "Raised", "2026-11-02T06:00:00Z"); // dated in October, raised in NOVEMBER
  await direct("SEPT", "P5", "Raised", "2026-09-10", "2026-09-10T06:00:00Z", 600);
  await direct("JULY", "P5", "Raised", "2026-07-10", "2026-07-10T06:00:00Z", 250);
  await direct("BADDATE", "P5", "Raised", "1850-06-01", "2026-10-10T06:00:00Z", 77); // an unusable invoice date
  await direct("P6INV", "P6", "Raised", "2026-10-20", "2026-10-20T04:00:00Z", 700);
  await ev("P6INV", "P6", "CREATED", null, "Raised", "2026-10-20T06:00:00Z");
  await direct("EDGEIN", "P7", "Raised", "2026-10-28", "2026-10-28T06:00:00Z", 10);
  await ev("EDGEIN", "P7", "CREATED", null, "Raised", "2026-10-31T18:29:59Z"); // 23:59:59 IST on 31 October
  await direct("EDGEOUT", "P7", "Raised", "2026-10-29", "2026-10-29T06:00:00Z", 20);
  await ev("EDGEOUT", "P7", "CREATED", null, "Raised", "2026-10-31T18:30:00Z"); // 00:00:00 IST on 1 November

  await prisma.invoiceRequest.create({ data: { projectId: P.P3!.id, requestedByUserId: people.ownerA!.id, assignedToUserId: people.ownerA!.id, status: "Open", createdAt: new Date("2026-10-03T06:00:00Z") } });
  await prisma.invoiceRequest.create({
    data: { projectId: P.P6!.id, requestedByUserId: people.ownerA!.id, assignedToUserId: people.ownerA!.id, status: "Completed", fulfilledInvoiceLineId: L.P6INV!, createdAt: new Date("2026-10-02T06:00:00Z"), invoiceAmountNote: "about 7 lakh" },
  });
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
    await prisma.userApprovalPermission.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await closeServer();
  }
});

test("1-4: October lists exactly the invoices DATED in October — never by creation, raise, payment or update date", async () => {
  const p1 = (await chain("admin", "P1")).data;
  assert.deepEqual(nosOf(p1.invoices).sort(), ["CANC", "DRAFT", "FIRSTDAY", "MULTI", "PAIDOCT", "PART", "RAISEDOCT", "RAISEDSEP", "SUBM"].sort(), "an October invoice date qualifies (case 1)");
  for (const excluded of ["JANCREATEDOCT", "JANRAISEDOCT", "NOVRAISEDOCT", "SEP30", "NOV1", "LATEJOIN"]) assert.ok(!nosOf(p1.invoices).includes(excluded), `${excluded} is not an October invoice`);
  // 2: dated January but CREATED in October -> excluded; it belongs to January and keeps its dates separate
  const jan = (await chain("admin", "P1", "2026-01")).data.invoices;
  assert.deepEqual(nosOf(jan).sort(), ["JANCREATEDOCT", "JANRAISEDOCT"]);
  const created = jan.find((i: any) => i.invoiceNo === `${TAG}-JANCREATEDOCT`);
  assert.deepEqual([created.invoiceDate, created.createdAt, created.createdMonth, created.raisedAt], ["2026-01-15", "2026-10-10T06:00:00.000Z", "2026-10", null], "invoice date January, workflow created October, never raised");
  // 3: dated January but RAISED in October -> excluded; the raise date is its own field
  const raised = jan.find((i: any) => i.invoiceNo === `${TAG}-JANRAISEDOCT`);
  assert.deepEqual([raised.invoiceDate, raised.createdAt, raised.raisedAt, raised.raisedInPeriod], ["2026-01-20", "2026-01-20T06:00:00.000Z", "2026-10-12T06:00:00.000Z", false], "invoice date January, created January, raised 12 October — three different dates");
  // 4: dated November but raised in October -> excluded
  const nov = (await chain("admin", "P1", "2026-11")).data.invoices;
  assert.deepEqual(nosOf(nov).sort(), ["NOV1", "NOVRAISEDOCT"]);
  const novRaised = nov.find((i: any) => i.invoiceNo === `${TAG}-NOVRAISEDOCT`);
  assert.deepEqual([novRaised.invoiceDate, novRaised.raisedAt, novRaised.createdMonth, novRaised.raisedInPeriod], ["2026-11-05", "2026-10-21T06:00:00.000Z", "2026-10", false]);
  // LATEJOIN has lines dated 28 Sep and 5 Oct: ONE invoice, dated by its earliest line -> September
  assert.deepEqual(nosOf((await chain("admin", "P1", "2026-09")).data.invoices).sort(), ["LATEJOIN", "SEP30"]);
  // the list agrees: P1 appears in October with exactly those 9 invoices
  const oct = (await list("admin")).data;
  assert.equal(oct.items.find((i: any) => i.prNo === `${TAG}-P1`).records.invoiceCount, 9);
  // and the same project shows up in the other months only through the invoices dated there
  assert.deepEqual([(await list("admin", "month=2026-01")).data.summary.invoiceCount, (await list("admin", "month=2026-11")).data.summary.invoiceCount, (await list("admin", "month=2026-09")).data.summary.invoiceCount], [2, 2, 3]);
});

test("5-10: exact October totals — a Draft qualifies but is not raised; raised amounts, requests and the month's outstanding add up with no double counting", async () => {
  const s = (await list("admin")).data.summary;
  assert.deepEqual(s.byStatus, { raised: 9, partiallyPaid: 1, paid: 1, draft: 2, cancelled: 1 }, "14 invoices dated in October; legacy 'Submitted' is Raised; the Drafts are counted as Drafts");
  assert.deepEqual([s.invoiceCount, s.requestCount, s.recordCount, s.projectCount], [14, 2, 16, 6]);
  assert.deepEqual([s.invoicesRaised, s.raisedAmountINR], [11, 8480], "Raised 3480 + Partially Paid 2000 + Paid 3000 — not the Drafts (100 + 150), not Cancelled (700), not requests");
  assert.deepEqual([s.projectsRaised, s.projectsAwaitingApproval], [4, 1]);
  assert.deepEqual(s.requests, { open: 1, completed: 1 });
  assert.equal(s.pendingApproval.count, 1);
  assert.equal(s.pendingApproval.amountINR, null);
  assert.deepEqual([s.collected.amountINR, s.collected.basis, s.collected.paidInvoiceCount, s.collected.partiallyPaidExcludedCount, s.collected.needsReviewCount], [3000, "inferred_from_paid_status", 1, 1, 0],
    "Amount collected = the Paid invoice (PAIDOCT) at its full amount, inferred from its status; PART (Partially Paid) is excluded, not guessed");
  assert.match(s.collected.note, /inferred from the Paid status/);
  assert.deepEqual(s.outstanding, { scope: "selected_month", knownAmountINR: 3480, invoiceCount: 10, balanceNotRecordedCount: 1 });
  const draft = (await chain("admin", "P1")).data.invoices.find((i: any) => i.invoiceNo === `${TAG}-DRAFT`);
  assert.deepEqual([draft.status, draft.invoiceDate, draft.raisedAt, draft.financials.balance], ["Draft", "2026-10-25", null, "not_applicable"], "5: an October Draft qualifies, is not raised and is not owed");
  // the "Show" filter narrows the cards to exactly the listed projects, and the halves add up
  const raisedOnly = (await list("admin", "month=2026-10&filter=raised")).data;
  const notRaised = (await list("admin", "month=2026-10&filter=notRaised")).data;
  assert.deepEqual(prsOf(notRaised.items).sort(), ["P2", "P3"]);
  assert.deepEqual([notRaised.summary.invoicesRaised, notRaised.summary.raisedAmountINR, notRaised.summary.byStatus.draft, notRaised.summary.pendingApproval.count], [0, 0, 1, 1]);
  assert.equal(raisedOnly.summary.recordCount + notRaised.summary.recordCount, s.recordCount, "nothing double counted or lost");
  assert.equal(raisedOnly.summary.raisedAmountINR, s.raisedAmountINR);
  assert.equal((await list("admin", "month=2026-10&filter=requestPending")).data.items.length, 1);
});

test("9: month boundaries — first and last day are in, the days either side are out; invoice dates have no time-zone shift; raise edges follow India time", async () => {
  const p1 = (await chain("admin", "P1")).data.invoices;
  const by = (n: string) => p1.find((i: any) => i.invoiceNo === `${TAG}-${n}`);
  assert.equal(by("FIRSTDAY").invoiceDate, "2026-10-01", "1 October is in (inclusive start)");
  assert.equal(by("PART").invoiceDate, "2026-10-31", "31 October is in (last day of the month)");
  assert.ok(!(await chain("admin", "P1")).data.invoices.some((i: any) => ["SEP30", "NOV1"].includes(i.invoiceNo.slice(TAG.length + 1))), "30 September and 1 November are out (exclusive end)");
  assert.deepEqual([(await chain("admin", "P1", "2026-09")).data.invoices.some((i: any) => i.invoiceNo === `${TAG}-SEP30`), (await chain("admin", "P1", "2026-11")).data.invoices.some((i: any) => i.invoiceNo === `${TAG}-NOV1`)], [true, true], "…and each is in its own month");
  // the raised-in-the-month test is India time: 23:59:59 IST on 31 Oct is October, 00:00:00 IST on 1 Nov is November
  const p7 = (await chain("admin", "P7")).data.invoices;
  const edge = (n: string) => p7.find((i: any) => i.invoiceNo === `${TAG}-${n}`);
  assert.deepEqual([edge("EDGEIN").raisedInPeriod, edge("EDGEOUT").raisedInPeriod], [true, false]);
  assert.deepEqual([edge("EDGEIN").raisedAt, edge("EDGEOUT").raisedAt], ["2026-10-31T18:29:59.000Z", "2026-10-31T18:30:00.000Z"]);
});

test("6-7: project rows are ordered by the ORIGINAL approval submission first (LATEST first), then by the record each row displays (latest first); records inside a project keep their own order", async () => {
  const oct = (await list("admin")).data;
  assert.deepEqual(oct.items.map((i: any) => [i.prNo.slice(TAG.length + 1), i.sortTier]), [["P3", 1], ["P6", 1], ["P1", 2], ["P7", 2], ["P4", 2], ["P2", 3]],
    "group 1 = the displayed record belongs to an approval request submitted in October, LATEST submission first (P3 3 Oct, still Open, then P6 2 Oct — its request is already fulfilled by an invoice raised 20 Oct, and it stays below P3 because it was submitted earlier); " +
    "every other row follows by the date of the record it DISPLAYS, LATEST first (P1 PART 31 Oct, P7 EDGEOUT 29 Oct, P4 9 Oct); P2 only has a Draft, so it displays nothing (group 3). " +
    "A recorded raise does not rank a project: only the displayed record's date does");
  assert.deepEqual(oct.items.map((i: any) => i.approvalSubmittedAt), ["2026-10-03T06:00:00.000Z", "2026-10-02T06:00:00.000Z", null, null, null, null], "P6's fulfilled request keeps its original submission instant");
  assert.deepEqual(oct.items.map((i: any) => i.sortBasis), ["approval_submitted", "approval_submitted", "record_date", "record_date", "record_date", "month_records"]);
  // the ranking record IS the displayed record: every row's latestRecord equals the first record of its own expanded list
  for (const item of oct.items) {
    const expanded = (await chain("admin", item.prNo.slice(TAG.length + 1))).data;
    assert.deepEqual(expanded.latestRecord, item.latestRecord, `${item.prNo}: the expanded project shows the very record the row shows`);
    if (item.latestRecord) assert.equal(expanded.recordOrder[0].id, item.latestRecord.id, `${item.prNo}: …and lists it first`);
  }
  assert.deepEqual(oct.items.map((i: any) => i.records.raisedInPeriodCount), [0, 1, 2, 1, 0, 0], "the month's financial counts are untouched by the ordering change");
  // the order is a property of the whole result: every page size yields the same sequence
  const singles: string[] = [];
  for (let page = 1; page <= 6; page++) singles.push(...prsOf((await list("admin", `month=2026-10&pageSize=1&page=${page}`)).data.items));
  assert.deepEqual(singles, ["P3", "P6", "P1", "P7", "P4", "P2"]);
  const p1 = (await chain("admin", "P1")).data;
  assert.deepEqual(p1.order.map((o: any) => o.id.slice(TAG.length + 1)), ["RAISEDOCT", "PAIDOCT", "PART", "DRAFT", "MULTI", "SUBM", "CANC", "RAISEDSEP", "FIRSTDAY"],
    "6: RAISEDOCT (raised 16 Oct) and PAIDOCT (raised 3 Oct) lead, newest raise first; then the rest by invoice date, newest first — RAISEDSEP (raised in September) comes after the invoices raised in October; 7: the Draft is after them too");
  assert.deepEqual(p1.invoices.filter((i: any) => i.raisedInPeriod).map((i: any) => i.invoiceNo.slice(TAG.length + 1)).sort(), ["PAIDOCT", "RAISEDOCT"]);
  const raisedSep = p1.invoices.find((i: any) => i.invoiceNo === `${TAG}-RAISEDSEP`);
  assert.deepEqual([raisedSep.status, raisedSep.raisedAt, raisedSep.raisedInPeriod, raisedSep.createdMonth], ["Raised", "2026-09-25T06:00:00.000Z", false, "2026-09"], "dated in October, raised in September: a qualifying October invoice, but not 'raised this month'");
  const notRaisedYet = p1.invoices.find((i: any) => i.invoiceNo === `${TAG}-SUBM`);
  assert.equal(notRaisedYet.raisedAt, null, "no recorded raise -> nothing is shown or assumed");
  assert.deepEqual((await chain("admin", "P6")).data.order.map((o: any) => o.kind), ["invoice", "request"], "a request is never a raised invoice");
  assert.deepEqual((await chain("admin", "P7")).data.order.map((o: any) => o.id.slice(TAG.length + 1)), ["EDGEIN", "EDGEOUT"]);
  assert.equal((await chain("admin", "P4")).data.invoices[0].raisedInPeriod, false, "raised in November -> not this month");
  // all history has no raised-in-the-period group
  const all = (await chain("admin", "P1", "all")).data;
  assert.ok(all.invoices.every((i: any) => i.raisedInPeriod === false));
  assert.equal(all.invoices.length, 15, "every P1 invoice, any date");
});

test("expanded invoice: the three dates stay distinct and the status comes from the saved record", async () => {
  const r = await chain("admin", "P1");
  assert.equal(r.status, 200, r.message);
  const by = (n: string) => r.data.invoices.find((i: any) => i.invoiceNo === `${TAG}-${n}`);
  assert.deepEqual([by("RAISEDOCT").invoiceDate, by("RAISEDOCT").createdAt, by("RAISEDOCT").raisedAt], ["2026-10-15", "2026-10-14T06:00:00.000Z", "2026-10-16T06:00:00.000Z"], "invoice date, workflow created and raised are three separate values");
  assert.deepEqual([by("FIRSTDAY").invoiceDate, by("FIRSTDAY").createdMonth], ["2026-10-01", "2026-09"], "dated October, created September");
  assert.deepEqual([by("RAISEDOCT").status, by("PART").status, by("DRAFT").status, by("CANC").status, by("SUBM").status], ["Raised", "PartiallyPaid", "Draft", "Cancelled", "Raised"]);
  assert.deepEqual([by("MULTI").lines.length, by("MULTI").amountINR, by("MULTI").invoiceDate], [2, 300, "2026-10-20"], "two lines, ONE invoice, dated by its earliest line");
  assert.deepEqual(by("RAISEDOCT").financials, { amountINR: 1000, amountPaidINR: 0, paidBasis: "none_yet", outstandingINR: 1000, balance: "full", flags: [] });
  assert.deepEqual(by("PAIDOCT").financials, { amountINR: 3000, amountPaidINR: 3000, paidBasis: "inferred_from_status", outstandingINR: 0, balance: "settled", flags: [] }, "Paid, nothing outstanding: Amount Paid = the invoice amount, labelled as inferred from the status");
  assert.deepEqual([by("PART").financials.amountPaidINR, by("PART").financials.outstandingINR, by("PART").financials.paidBasis, by("PART").financials.balance], [null, null, "not_recorded", "not_recorded"]);
  const p6 = await chain("admin", "P6");
  assert.equal(p6.data.requests.length, 1);
  assert.deepEqual([p6.data.requests[0].status, p6.data.requests[0].requestedBy, p6.data.requests[0].amountNote, p6.data.requests[0].fulfilledByInvoiceNo], ["Completed", "Itk ownerA", "about 7 lakh", `${TAG}-P6INV`]);
  const p3 = await chain("admin", "P3");
  assert.deepEqual([p3.data.invoices.length, p3.data.requests[0].label], [0, "Invoice Requested"]);
  // invoices that predate history say so honestly
  assert.deepEqual([by("SUBM").hasRecordedHistory, by("SUBM").timeline, by("SUBM").raisedAt], [false, [], null]);
  assert.equal(by("SUBM").recordedInPortal.by, "Direct Entry");
});

test("8: an invoice with no usable invoice date is in NO month — it is never given its creation date — but stays visible and flagged in All history and Outstanding", async () => {
  // BADDATE: stored invoice date year 1850, created 10 Oct 2026, status Raised
  for (const month of ["2026-10", "2026-06", "2026-01"]) {
    assert.ok(!(await chain("admin", "P5", month)).data.invoices.some((i: any) => i.invoiceNo === `${TAG}-BADDATE`), `not in ${month} (its creation month, October, is NOT substituted)`);
  }
  assert.ok(!prsOf((await list("admin", "month=2026-10")).data.items).includes("P5"), "P5 has no usable October-dated invoice, so it is not listed in October");
  const all = (await chain("admin", "P5", "all")).data.invoices.find((i: any) => i.invoiceNo === `${TAG}-BADDATE`);
  assert.deepEqual([all.invoiceDate, all.status, all.createdMonth], [null, "Raised", "2026-10"], "all history shows it, with no invoice date");
  assert.match(all.financials.flags.join(" "), /invoice date is missing or invalid/i, "flagged for review");
  const out = (await outstanding("admin", "&pageSize=100")).data.items.find((i: any) => i.invoiceNo === `${TAG}-BADDATE`);
  assert.deepEqual([out.invoiceDate, out.daysOutstanding, out.outstandingINR], [null, null, 77], "still owed (Raised); no age can be calculated without a date");
});

test("previous invoices: this project's EARLIER-dated invoices are returned for billing context, separate from the month's invoices — never in both, never from a later month", async () => {
  const r = (await chain("admin", "P1")).data;
  const current = nosOf(r.invoices).sort();
  const previous = r.previousInvoices.map((i: any) => i.invoiceNo.slice(TAG.length + 1));
  assert.deepEqual(previous, ["SEP30", "LATEJOIN", "JANRAISEDOCT", "JANCREATEDOCT"], "dated before 1 October, newest invoice date first (30 Sep, 28 Sep, 20 Jan, 15 Jan)");
  assert.equal(current.length, 9, "October's own section is unchanged");
  assert.deepEqual(current.filter((n) => previous.includes(n)), [], "the same invoice is never in both sections");
  assert.ok(!previous.includes("NOV1") && !previous.includes("NOVRAISEDOCT"), "invoices dated after the month are not 'previous'");
  assert.ok(r.previousInvoices.every((i: any) => i.invoiceDate < "2026-10-01"), "every previous invoice is dated before the month");
  assert.ok(r.previousInvoices.every((i: any) => i.raisedInPeriod === false), "a previous invoice is never 'raised this month'");
  assert.ok(!r.order.some((o: any) => previous.includes(o.id.slice(TAG.length + 1))), "the display order of the month never includes a previous invoice");
  // each one carries its OWN date, status, amount and settlement information
  const by = (n: string) => r.previousInvoices.find((i: any) => i.invoiceNo === `${TAG}-${n}`);
  assert.deepEqual([by("SEP30").invoiceDate, by("SEP30").status, by("SEP30").amountINR, by("SEP30").financials.amountPaidINR, by("SEP30").financials.outstandingINR, by("SEP30").financials.paidBasis], ["2026-09-30", "Raised", 60, 0, 60, "none_yet"]);
  assert.deepEqual([by("LATEJOIN").invoiceDate, by("LATEJOIN").amountINR, by("LATEJOIN").lines.length], ["2026-09-28", 1000, 2], "two lines, one invoice, dated by its earliest line, listed once");
  assert.deepEqual([by("JANRAISEDOCT").invoiceDate, by("JANRAISEDOCT").createdMonth, by("JANRAISEDOCT").raisedAt, by("JANRAISEDOCT").amountINR], ["2026-01-20", "2026-01", "2026-10-12T06:00:00.000Z", 850], "its own dates stay as stored — the October raise is shown as the raise date, not as an October invoice date");
  assert.deepEqual([by("JANCREATEDOCT").invoiceDate, by("JANCREATEDOCT").createdMonth, by("JANCREATEDOCT").raisedAt], ["2026-01-15", "2026-10", null]);
  assert.ok(by("SEP30").timeline.length === 0 && by("SEP30").hasRecordedHistory === false, "history is honest for invoices that predate it");
  assert.equal(by("JANRAISEDOCT").timeline.length, 2, "…and shown when it was recorded");
  // other months: the same project, a different month, a different split
  const nov = (await chain("admin", "P1", "2026-11")).data;
  assert.deepEqual(nosOf(nov.invoices).sort(), ["NOV1", "NOVRAISEDOCT"]);
  assert.equal(nov.previousInvoices.length, 13, "everything dated before November: 9 October + 2 September + 2 January");
  assert.ok(!nov.previousInvoices.some((i: any) => nosOf(nov.invoices).includes(i.invoiceNo.slice(TAG.length + 1))), "never in both, in November either");
  const jan = (await chain("admin", "P1", "2026-01")).data;
  assert.deepEqual([jan.invoices.length, jan.previousInvoices.length], [2, 0], "nothing is earlier than the earliest invoices");
  const all = (await chain("admin", "P1", "all")).data;
  assert.deepEqual([all.invoices.length, all.previousInvoices.length, all.undatedInvoiceCount], [15, 0, 0], "all history lists everything once, in the main list");
});

test("previous invoices never touch the month's KPI totals or the project row's counts", async () => {
  const before = (await list("admin")).data;
  for (const project of ["P1", "P5", "P6"]) await chain("admin", project); // expanding rows loads the previous invoices
  const after = (await list("admin")).data;
  assert.deepEqual(after.summary, before.summary, "expanding projects changes nothing in the cards");
  assert.deepEqual([after.summary.invoiceCount, after.summary.invoicesRaised, after.summary.raisedAmountINR], [14, 11, 8480], "October's own invoices only");
  const p1 = after.items.find((i: any) => i.prNo === `${TAG}-P1`).records;
  assert.deepEqual([p1.invoiceCount, p1.byStatus.raised], [9, 5], "P1's row counts 9 October invoices, not the 13 it has by that date");
  const c1 = (await chain("admin", "P1")).data;
  const raisedInMonth = c1.invoices.filter((i: any) => ["Raised", "PartiallyPaid", "Paid"].includes(i.status)).reduce((t: number, i: any) => t + i.amountINR, 0);
  assert.equal(p1.raisedAmountINR, raisedInMonth, "…and the raised amount is exactly the month's own raised-state invoices (Raised, Partially Paid, Paid): none of SEP30 / LATEJOIN / JAN* (60 + 1000 + 850 + 800) is added");
  assert.ok(c1.previousInvoices.some((i: any) => i.status === "Raised"), "even though earlier Raised invoices exist for the project");
  // the monthly list endpoint carries no historical invoices at all
  assert.ok(!JSON.stringify(after).includes("previousInvoices"), "the list payload has no previous-invoice data to sum by accident");
});

test("requests stay separate from invoices: never in the previous list, never in an invoice total, shown with a reference, status and creator", async () => {
  const p6 = (await chain("admin", "P6")).data;
  assert.deepEqual(p6.previousInvoices, [], "P6 has nothing dated earlier");
  assert.equal(p6.requests.length, 1);
  const q = p6.requests[0];
  assert.deepEqual([q.status, q.label, q.assignedTo, q.requestedBy, q.amountNote, q.fulfilledByInvoiceNo], ["Completed", "Completed", "Itk ownerA", "Itk ownerA", "about 7 lakh", `${TAG}-P6INV`]);
  assert.match(q.ref, /^[0-9A-F]{8}$/, "a short reference — requests have no number of their own");
  assert.equal(typeof q.createdAt, "string");
  assert.equal("amountINR" in q, false, "a request has no numeric amount, so it can never enter a financial total");
  const p3 = (await chain("admin", "P3")).data;
  assert.deepEqual([p3.invoices.length, p3.previousInvoices.length, p3.requests.length, p3.requests[0].label], [0, 0, 1, "Invoice Requested"]);
  const s = (await list("admin")).data.summary;
  assert.equal(s.requestCount, 2, "requests are counted as requests …");
  assert.equal(s.invoiceCount, 14, "… and never as invoices");
});

test("8: an invoice with no usable date is in NEITHER section — it is not placed in a historical month by its creation date; the project reports it for review", async () => {
  const p5 = (await chain("admin", "P5")).data;
  assert.deepEqual(nosOf(p5.invoices), [], "P5 has no invoice dated in October");
  assert.deepEqual(p5.previousInvoices.map((i: any) => i.invoiceNo.slice(TAG.length + 1)), ["SEPT", "JULY"], "only invoices with a usable earlier date (10 Sep, 10 Jul)");
  assert.ok(!p5.previousInvoices.some((i: any) => i.invoiceNo === `${TAG}-BADDATE`), "BADDATE (created in October, unusable date) is not 'previous'");
  assert.equal(p5.undatedInvoiceCount, 1, "…it is counted, so the UI can flag it");
  const all = (await chain("admin", "P5", "all")).data;
  assert.deepEqual([all.undatedInvoiceCount, all.invoices.find((i: any) => i.invoiceNo === `${TAG}-BADDATE`)?.invoiceDate], [0, null], "all history shows it, with no date, in the main list");
});

test("9: permissions are identical for the month's and the previous invoices — no extra project is ever readable", async () => {
  assert.equal((await chain("ownerB", "P1")).status, 403, "another owner's project: no month invoices and no previous ones");
  assert.equal((await chain("accounts", "P1")).status, 403);
  assert.equal((await chain("noInvoices", "P1")).status, 403);
  assert.equal((await api(`/invoice-tracker/projects/${P.P1!.id}/invoices?month=2026-10`, null)).status, 401);
  const own = await chain("ownerA", "P1");
  assert.equal(own.status, 200);
  assert.equal(own.data.previousInvoices.length, 4, "the owner sees the earlier invoices of their own project");
  assert.equal((await chain("viewAll", "P1")).data.previousInvoices.length, 4, "View All Projects widens it, for both sections alike");
  const b = await chain("ownerB", "P4");
  assert.deepEqual([b.status, b.data.invoices.length, b.data.previousInvoices.length], [200, 1, 0]);
  const denied = await chain("ownerB", "P5");
  assert.equal(denied.status, 403);
  assert.equal(JSON.stringify(denied).includes("previousInvoices"), false);
});

test("previous invoices come from the same batched reads: statement count does not grow with the number of earlier invoices", async () => {
  const many = await countQueries(() => chain("admin", "P1", "2026-10")); // 9 this month + 4 previous
  const few = await countQueries(() => chain("admin", "P4", "2026-10")); // 1 + 0
  assert.equal(many, few, "chain: same statements with 13 invoices as with 1");
});

// ───────── Latest raised invoice (headline) · drafts · history · older outstanding ─────────

/** The invoice numbers (without the TAG) behind a list of keys of one chain payload. */
const noOfKeys = (data: any, keys: string[]) => {
  const byKey = new Map<string, any>([...data.invoices, ...data.previousInvoices].map((i: any) => [i.key, i]));
  return keys.map((k) => byKey.get(k)!.invoiceNo.slice(TAG.length + 1));
};
const sections = (data: any) => ({
  latest: data.latestRaisedKey === null ? null : noOfKeys(data, [data.latestRaisedKey])[0],
  inMonth: data.latestRaisedInMonth,
  drafts: noOfKeys(data, data.draftKeys),
  history: noOfKeys(data, data.historyKeys),
  older: { count: data.olderOutstanding.count, amount: data.olderOutstanding.amountINR, known: data.olderOutstanding.knownAmountINR, unknown: data.olderOutstanding.unknownCount, undated: data.olderOutstanding.undatedCount, keys: noOfKeys(data, data.olderOutstanding.keys).sort() },
});

/** A throw-away project with full control of its invoices — created and removed inside one test, so no other test's totals ever see it. */
async function withAdhocProject<T>(key: string, build: (add: (label: string, status: string, date: string, created: string, amount: number, opts?: { item?: number; invoiceNo?: string }) => Promise<string>, projectId: string, items: string[]) => Promise<void>, run: (projectId: string) => Promise<T>): Promise<T> {
  const p = await prisma.project.create({
    data: {
      poMonth: "2026-10", prCategory: "India", prNo: `${TAG}-${key}`, client: `Itk Client ${key}`, department: "Process", domesticForeign: "Domestic", projectTitle: `Itk ${key}`,
      workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", createdByUserId: people.ownerA!.id,
    },
  });
  projectIds.push(p.id);
  const items: string[] = [];
  for (let i = 0; i < 2; i++) items.push((await prisma.quantityItem.create({ data: { projectId: p.id, description: `Activity ${i + 1}`, woQty: 10, uom: "DAY", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1_000_000 } })).id);
  const add = async (label: string, status: string, date: string, created: string, amount: number, opts: { item?: number; invoiceNo?: string } = {}) =>
    (await prisma.invoiceLine.create({ data: { quantityItemId: items[opts.item ?? 0]!, invoiceNo: opts.invoiceNo ?? `${TAG}-${label}`, invoiceDate: new Date(`${date}T00:00:00.000Z`), quantityBilled: 0, invoiceAmountINR: amount, status, createdBy: "Direct Entry", createdAt: new Date(created) } })).id;
  try {
    await build(add, p.id, items);
    return await run(p.id);
  } finally {
    await prisma.invoiceRequest.deleteMany({ where: { projectId: p.id } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItemId: { in: items } } });
    await prisma.invoiceNumber.deleteMany({ where: { projectId: p.id } });
    await prisma.project.delete({ where: { id: p.id } });
    projectIds.splice(projectIds.indexOf(p.id), 1);
  }
}

test("headline (existing fixture, P1 October): the latest RAISED invoice is chosen by invoice date — here a Partially Paid one dated on the last day — and the rest sort into drafts and history", async () => {
  const d = (await chain("admin", "P1")).data;
  const v = sections(d);
  assert.equal(v.latest, "PART", "PART is dated 31 Oct, newer than every other raised invoice — whatever its status");
  assert.equal(v.inMonth, true);
  assert.deepEqual(v.drafts, ["DRAFT"], "the month's Draft goes to the drafts section — and, though dated 25 Oct, it is not the headline");
  assert.deepEqual(v.history, ["MULTI", "SUBM", "RAISEDOCT", "CANC", "RAISEDSEP", "PAIDOCT", "FIRSTDAY", "SEP30", "LATEJOIN", "JANRAISEDOCT", "JANCREATEDOCT"], "everything else dated up to the month's end, newest invoice date first — cancelled included, NOV1 / NOVRAISEDOCT (dated after) excluded");
  const all = [v.latest, ...v.drafts, ...v.history];
  assert.equal(new Set(all).size, all.length, "an invoice is in exactly one of headline / drafts / history");
  assert.equal(all.length, 13, "9 dated in October + 4 earlier");
  assert.deepEqual(v.older, { count: 9, amount: 4960, known: 4960, unknown: 0, undated: 0, keys: ["FIRSTDAY", "JANCREATEDOCT", "JANRAISEDOCT", "LATEJOIN", "MULTI", "RAISEDOCT", "RAISEDSEP", "SEP30", "SUBM"] }, "every older Raised invoice (Paid PAIDOCT, Cancelled CANC and the Draft are not outstanding; MULTI counted once at 300)");
  assert.ok(d.olderOutstanding.keys.every((k: string) => d.historyKeys.includes(k)), "the figure is traceable to rows of the history");
  assert.equal(d.olderOutstanding.keys.includes(d.latestRaisedKey), false, "the latest invoice is never counted as older");
});

test("headline across months: the same project, a different month — later months look further, earlier months never see the future; a total is withheld when a balance is unknown", async () => {
  const nov = sections((await chain("admin", "P1", "2026-11")).data);
  assert.equal(nov.latest, "NOVRAISEDOCT", "dated 5 Nov — the newest raised invoice up to the end of November");
  assert.equal(nov.inMonth, true);
  assert.equal(nov.older.count, 11);
  assert.equal(nov.older.unknown, 1, "PART is Partially Paid: counted, but its balance is not recorded");
  assert.equal(nov.older.known, 5030, "only the reliable balances are summed (4,960 + NOV1 70)");
  assert.equal(nov.older.amount, null, "…and so no total is given at all — never a partial or guessed one");
  const sep = sections((await chain("admin", "P1", "2026-09")).data);
  assert.equal(sep.latest, "SEP30", "up to 30 Sep: SEP30 (30 Sep) is newer than LATEJOIN (28 Sep) — October invoices are the future");
  assert.deepEqual(sep.history, ["LATEJOIN", "JANRAISEDOCT", "JANCREATEDOCT"]);
  assert.deepEqual([sep.older.count, sep.older.amount], [3, 1000 + 850 + 800]);
  const jan = sections((await chain("admin", "P1", "2026-01")).data);
  assert.equal(jan.latest, "JANRAISEDOCT");
  assert.deepEqual(jan.history, ["JANCREATEDOCT"]);
  const feb = sections((await chain("admin", "P1", "2026-02")).data);
  assert.equal(feb.latest, "JANRAISEDOCT");
  assert.equal(feb.inMonth, false, "nothing raised in February: the January invoice is only the latest AVAILABLE one");
  const all = (await chain("admin", "P1", "all")).data;
  assert.deepEqual([all.latestRaisedKey, all.latestRaisedInMonth, all.draftKeys, all.historyKeys, all.olderOutstanding.count], [null, null, [], [], 0], "All history has no headline sections: it lists every invoice once");
});

test("headline with a project that has NO raised invoice in the month: its older raised invoice is only the latest AVAILABLE; undated outstanding invoices are flagged and never counted or placed", async () => {
  const p5 = sections((await chain("admin", "P5")).data);
  assert.equal(p5.latest, "SEPT", "the newest raised invoice up to 31 Oct is the 10 Sep one…");
  assert.equal(p5.inMonth, false, "…and it is not dated in October");
  assert.deepEqual(p5.drafts, []);
  assert.deepEqual(p5.history, ["JULY"], "BADDATE (invalid date) is in no section");
  assert.deepEqual(p5.older, { count: 1, amount: 250, known: 250, unknown: 0, undated: 1, keys: ["JULY"] }, "JULY is older and outstanding; BADDATE is outstanding but undatable, so it is counted apart");
  const p2 = (await chain("admin", "P2")).data;
  assert.deepEqual([p2.latestRaisedKey, p2.latestRaisedInMonth, noOfKeys(p2, p2.draftKeys)], [null, null, ["P2D"]], "a project with only a Draft has no raised invoice — the Draft never stands in for it");
  const p3 = (await chain("admin", "P3")).data;
  assert.deepEqual([p3.latestRaisedKey, p3.draftKeys, p3.historyKeys, p3.requests.length, p3.olderOutstanding.count], [null, [], [], 1, 0], "a request-only project: nothing raised, the request is listed separately");
});

test("headline selection: invoice date decides — never creation or raise time, never a newer Draft or Cancelled invoice; Paid can stay the latest; duplicate lines count once; the history keeps every status", async () => {
  await withAdhocProject("P8", async (add, projectId, items) => {
    await add("NEWPAIDa", "Paid", "2026-10-20", "2026-08-01T06:00:00Z", 200, { invoiceNo: `${TAG}-NEWPAID` });
    await add("NEWPAIDb", "Paid", "2026-10-21", "2026-08-01T06:00:00Z", 250, { item: 1, invoiceNo: `${TAG}-NEWPAID` }); // ONE invoice, dated 20 Oct, 450
    await add("NEWDRAFT", "Draft", "2026-10-28", "2026-10-01T06:00:00Z", 20);
    await add("NEWCANC", "Cancelled", "2026-10-29", "2026-10-01T06:00:00Z", 15);
    const oldRaised = await add("OLDRAISED", "Raised", "2026-09-05", "2026-10-25T06:00:00Z", 120); // created and raised LATER than the Paid one — still older by invoice date
    await prisma.invoiceStatusEvent.create({ data: { projectId, prNo: `${TAG}-P8`, invoiceLineId: oldRaised, invoiceNo: `${TAG}-OLDRAISED`, eventType: "CREATED", fromStatus: null, toStatus: "Raised", actorUserId: people.ownerA!.id, actorName: "Itk ownerA", source: "invoice_create", occurredAt: new Date("2026-10-26T06:00:00Z") } });
    await add("OLDPART", "PartiallyPaid", "2026-08-01", "2026-08-01T06:00:00Z", 90);
    await add("OLDPAID", "Paid", "2026-07-01", "2026-07-01T06:00:00Z", 70);
    await add("OLDCANC", "Cancelled", "2026-09-15", "2026-09-15T06:00:00Z", 55);
    await add("OLDDRAFT", "Draft", "2026-09-20", "2026-09-20T06:00:00Z", 30);
    await prisma.invoiceRequest.create({ data: { projectId, requestedByUserId: people.ownerA!.id, assignedToUserId: people.ownerA!.id, status: "Open", createdAt: new Date("2026-10-05T06:00:00Z") } });
    void items;
  }, async (projectId) => {
    const at = (month: string) => api(`/invoice-tracker/projects/${projectId}/invoices?month=${month}`, "admin").then((r) => r.data);
    const oct = await at("2026-10");
    const o = sections(oct);
    assert.equal(o.latest, "NEWPAID", "a Paid invoice remains the latest raised invoice; the newer Draft (28 Oct) and Cancelled (29 Oct) invoices do not replace it");
    assert.equal(oct.invoices.find((i: any) => i.invoiceNo === `${TAG}-NEWPAID`).amountINR, 450, "two lines, one invoice: counted once");
    assert.equal(oct.invoices.find((i: any) => i.invoiceNo === `${TAG}-NEWPAID`).financials.paidBasis, "inferred_from_status");
    assert.deepEqual(o.drafts, ["NEWDRAFT"]);
    assert.deepEqual(o.history, ["NEWCANC", "OLDDRAFT", "OLDCANC", "OLDRAISED", "OLDPART", "OLDPAID"], "every status stays reachable — Cancelled and Draft included — newest invoice date first");
    assert.deepEqual(o.older, { count: 2, amount: null, known: 120, unknown: 1, undated: 0, keys: ["OLDPART", "OLDRAISED"] }, "Raised 120 is reliable; Partially Paid has no stored balance → count 2, total withheld; Paid, Draft and Cancelled never count");
    assert.equal(oct.requests.length, 1);
    const sep = sections(await at("2026-09"));
    assert.equal(sep.latest, "OLDRAISED", "October's invoices (the future) are ignored when looking at September");
    assert.deepEqual(sep.drafts, ["OLDDRAFT"]);
    assert.deepEqual(sep.history, ["OLDCANC", "OLDPART", "OLDPAID"]);
    assert.deepEqual([sep.older.count, sep.older.unknown, sep.older.amount], [1, 1, null]);
    const aug = sections(await at("2026-08"));
    assert.equal(aug.latest, "OLDPART", "Partially Paid is raised: it can be the latest");
    assert.deepEqual([aug.older.count, aug.older.amount], [0, 0], "the only older invoice is Paid — nothing outstanding");
    const nov = sections(await at("2026-11"));
    assert.deepEqual([nov.latest, nov.inMonth, nov.drafts], ["NEWPAID", false, []], "a month with nothing dated in it: the Paid invoice is the latest AVAILABLE one, with its real October date");

    // the month list: the same headline per project, a request-only month still reads all the project's invoices, and the cards ignore all of it
    const row = async (month: string) => (await api(`/invoice-tracker?month=${month}&search=${TAG}-P8`, "admin")).data;
    const octList = await row("2026-10");
    const item = octList.items[0];
    assert.deepEqual([item.latestRaised.invoiceNo.slice(TAG.length + 1), item.latestRaised.amountINR, item.latestRaised.status, item.latestRaised.inMonth, item.latestRaised.invoiceDate], ["NEWPAID", 450, "Paid", true, "2026-10-20"]);
    assert.deepEqual(item.olderOutstanding, { count: 2, amountINR: null, knownAmountINR: 120, unknownCount: 1, undatedCount: 0 });
    assert.deepEqual([octList.summary.invoiceCount, octList.summary.invoicesRaised, octList.summary.raisedAmountINR], [3, 1, 450], "the cards count only the 3 invoices dated in October (Paid, Draft, Cancelled) — the 6 older ones add nothing");
    const decList = await (async () => {
      await prisma.invoiceRequest.create({ data: { projectId, requestedByUserId: people.ownerA!.id, assignedToUserId: people.ownerA!.id, status: "Open", createdAt: new Date("2026-12-05T06:00:00Z") } });
      return row("2026-12");
    })();
    const dec = decList.items[0];
    assert.equal(decList.items.length, 1, "listed for its December request alone");
    assert.deepEqual([dec.latestRaised.invoiceNo.slice(TAG.length + 1), dec.latestRaised.inMonth, dec.records.invoiceCount, dec.olderOutstanding.count], ["NEWPAID", false, 0, 2], "request-only: no invoice is dated in December, yet the latest available invoice and the older outstanding ones are found");
    assert.equal(decList.summary.invoiceCount, 0);
    const allList = (await row("all")).items[0];
    assert.equal(allList.latestRaised.inMonth, null);
    assert.equal(allList.latestRaised.invoiceNo.slice(TAG.length + 1), "NEWPAID");
  });
});

test("headline tie-break: equal invoice dates fall back to the later creation time, then the invoice key — deterministic on every call", async () => {
  await withAdhocProject("P9", async (add) => {
    await add("TIEA", "Raised", "2026-06-10", "2026-06-01T06:00:00Z", 11);
    await add("TIEB", "Raised", "2026-06-10", "2026-06-02T06:00:00Z", 22); // same date, created later → the latest
    await add("TIEC", "Raised", "2026-05-10", "2026-05-01T06:00:00Z", 33);
    await add("TIED", "Raised", "2026-05-10", "2026-05-01T06:00:00Z", 44); // same date AND same creation time → the greater key
  }, async (projectId) => {
    const at = (month: string) => api(`/invoice-tracker/projects/${projectId}/invoices?month=${month}`, "admin").then((r) => sections(r.data));
    for (let i = 0; i < 3; i++) {
      const june = await at("2026-06");
      assert.equal(june.latest, "TIEB");
      assert.deepEqual(june.older, { count: 3, amount: 11 + 33 + 44, known: 88, unknown: 0, undated: 0, keys: ["TIEA", "TIEC", "TIED"] });
      assert.deepEqual(june.history, ["TIEA", "TIED", "TIEC"], "equal dates: later-created first; then the greater key — stable");
      const may = await at("2026-05");
      assert.equal(may.latest, "TIED");
      assert.deepEqual(may.history, ["TIEC"]);
    }
  });
});

test("the month list carries the headline per project without touching the cards, and never another user's project", async () => {
  const before = (await list("admin")).data;
  const byPr = (data: any, pr: string) => data.items.find((i: any) => i.prNo === `${TAG}-${pr}`);
  const p1 = byPr(before, "P1");
  assert.deepEqual([p1.latestRaised.invoiceNo.slice(TAG.length + 1), p1.latestRaised.amountINR, p1.latestRaised.status, p1.latestRaised.paymentStatus, p1.latestRaised.inMonth, p1.latestRaised.invoiceDate], ["PART", 2000, "PartiallyPaid", "Partially paid", true, "2026-10-31"]);
  assert.deepEqual(p1.olderOutstanding, { count: 9, amountINR: 4960, knownAmountINR: 4960, unknownCount: 0, undatedCount: 0 });
  assert.deepEqual([byPr(before, "P6").latestRaised.amountINR, byPr(before, "P6").olderOutstanding.count], [700, 0]);
  const p7 = byPr(before, "P7");
  assert.deepEqual([p7.latestRaised.invoiceNo.slice(TAG.length + 1), p7.olderOutstanding.count, p7.olderOutstanding.amountINR], ["EDGEOUT", 1, 10]);
  assert.equal(byPr(before, "P2").latestRaised, null, "a Draft-only project has no raised invoice");
  assert.equal(byPr(before, "P3").latestRaised, null, "a request-only project has none either");
  assert.deepEqual(byPr(before, "P3").olderOutstanding, { count: 0, amountINR: 0, knownAmountINR: 0, unknownCount: 0, undatedCount: 0 });
  assert.deepEqual([before.summary.invoiceCount, before.summary.invoicesRaised, before.summary.raisedAmountINR], [14, 11, 8480], "the cards are the October invoices only — unchanged by the headline fields");
  assert.ok(!JSON.stringify(before).includes("previousInvoices") && !JSON.stringify(before).includes("historyKeys"), "the list carries no history to sum by accident");
  // permissions: ownerB sees only their own project, and nothing of P1's older invoices
  const b = (await list("ownerB")).data;
  assert.deepEqual(prsOf(b.items), ["P4"]);
  assert.deepEqual([b.items[0].latestRaised.invoiceNo.slice(TAG.length + 1), b.items[0].olderOutstanding.count], ["P4R", 0]);
  assert.equal(JSON.stringify(b).includes("PART"), false);
  // statements: reading the headline of 6 projects costs no more than of 2 (page size 2 vs default)
  const small = await countQueries(() => api(`/invoice-tracker?month=2026-10&search=${TAG}&pageSize=2`, "admin"));
  const large = await countQueries(() => api(`/invoice-tracker?month=2026-10&search=${TAG}&pageSize=25`, "admin"));
  assert.equal(small, large, "list: the same statements whatever the page size");
});

test("delete: an invoice that fulfilled a request deletes cleanly (the request stays, un-linked); a repeated or racing delete is a 404, never a 500 or a second deletion; a rejected edit changes nothing; row, counts and cards follow", async () => {
  await withAdhocProject("P10", async (add, projectId) => {
    L.DELX = await add("DELX", "Raised", "2026-10-06", "2026-10-06T06:00:00Z", 700);
    L.KEEPY = await add("KEEPY", "Raised", "2026-10-07", "2026-10-07T06:00:00Z", 300);
    L.RACE = await add("RACE", "Draft", "2026-10-08", "2026-10-08T06:00:00Z", 50);
    await prisma.invoiceRequest.create({ data: { projectId, requestedByUserId: people.ownerA!.id, assignedToUserId: people.ownerA!.id, status: "Completed", fulfilledInvoiceLineId: L.DELX!, createdAt: new Date("2026-10-05T06:00:00Z") } });
  }, async (projectId) => {
    const view = async () => (await api(`/invoice-tracker/projects/${projectId}/invoices?month=2026-10`, "admin")).data;
    const cards = async () => (await api(`/invoice-tracker?month=2026-10&search=${TAG}-P10`, "admin")).data;
    const before = await cards();
    assert.deepEqual([before.summary.invoiceCount, before.summary.invoicesRaised, before.summary.raisedAmountINR, before.summary.requestCount], [3, 2, 1000, 1]);
    // a rejected edit (invalid date) is a 400 and leaves the invoice exactly as it was
    const bad = await api(`/invoice-lines/${L.DELX}`, "ownerA", "PATCH", { invoiceNo: `${TAG}-DELX`, invoiceDate: "not-a-date", quantityBilled: 0, invoiceAmountINR: 700, status: "Raised" });
    assert.equal(bad.status, 400, "validation failures are reported, not swallowed");
    const afterBad = await view();
    assert.deepEqual(afterBad.invoices.map((i: any) => [i.invoiceNo.slice(TAG.length + 1), i.amountINR, i.status]).sort(), [["DELX", 700, "Raised"], ["KEEPY", 300, "Raised"], ["RACE", 50, "Draft"]]);
    // no right to delete -> refused, nothing removed
    assert.equal((await api(`/invoice-lines/${L.DELX}`, "ownerB", "DELETE")).status, 403);
    assert.equal((await view()).invoices.length, 3);
    // delete the invoice that fulfilled the request
    assert.equal((await api(`/invoice-lines/${L.DELX}`, "ownerA", "DELETE")).status, 200, "the request's link is ON DELETE SET NULL — it does not block the delete");
    const after = await view();
    assert.deepEqual(after.invoices.map((i: any) => i.invoiceNo.slice(TAG.length + 1)).sort(), ["KEEPY", "RACE"], "the row is gone from the Tracker");
    assert.equal(after.requests.length, 1);
    assert.deepEqual([after.requests[0].status, after.requests[0].fulfilledByInvoiceNo], ["Completed", null], "the request is kept, no longer pointing at a deleted invoice");
    assert.equal(sections(after).latest, "KEEPY", "the headline moves to the remaining raised invoice");
    const c = await cards();
    assert.deepEqual([c.summary.invoiceCount, c.summary.invoicesRaised, c.summary.raisedAmountINR], [2, 1, 300], "cards follow: counts and amounts count the remaining invoices once");
    assert.equal(c.items[0].records.invoiceCount, 2);
    // the same delete again (a second click) and two deletes racing: exactly one wins, the rest are plain 404s
    assert.equal((await api(`/invoice-lines/${L.DELX}`, "ownerA", "DELETE")).status, 404, "an already-deleted invoice is not found — no second deletion, no error page");
    const race = await Promise.all([api(`/invoice-lines/${L.RACE}`, "ownerA", "DELETE"), api(`/invoice-lines/${L.RACE}`, "ownerA", "DELETE"), api(`/invoice-lines/${L.RACE}`, "ownerA", "DELETE")]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 404, 404], "three simultaneous deletes of one invoice: one 200, two 404");
    assert.deepEqual((await view()).invoices.map((i: any) => i.invoiceNo.slice(TAG.length + 1)), ["KEEPY"]);
  });
});

test("7-8 (later payment): an invoice raised and paid after its month keeps its invoice month and its latest status — never duplicated, never moved", async () => {
  const paid = (await chain("admin", "P1")).data.invoices.find((i: any) => i.invoiceNo === `${TAG}-PAIDOCT`);
  assert.deepEqual([paid.status, paid.invoiceDate, paid.raisedAt, paid.raisedInPeriod, paid.timeline.map((e: any) => [e.fromStatus, e.toStatus])], ["Paid", "2026-10-02", "2026-10-03T06:00:00.000Z", true, [[null, "Raised"], ["Raised", "Paid"]]], "paid on 10 Nov, still an October invoice raised in October");
  assert.equal((await chain("admin", "P1", "2026-11")).data.invoices.some((i: any) => i.invoiceNo === `${TAG}-PAIDOCT`), false, "payment in November does not make it a November record");
  const before = await chain("admin", "P5", "2026-07");
  assert.deepEqual(before.data.invoices.map((i: any) => i.status), ["Raised"]);
  await prisma.invoiceLine.update({ where: { id: L.JULY! }, data: { status: "Paid" } });
  const after = await chain("admin", "P5", "2026-07");
  assert.deepEqual([after.data.invoices.length, after.data.invoices[0].status, after.data.invoices[0].invoiceDate], [1, "Paid", "2026-07-10"]);
  assert.equal((await list("admin", "month=2026-11")).data.items.some((i: any) => i.prNo === `${TAG}-P5`), false);
});

test("11: Outstanding spans every month — older invoices included, Paid / Draft / Cancelled excluded, Partially Paid with no invented balance", async () => {
  const o = await outstanding("admin", "&pageSize=100");
  assert.equal(o.status, 200, o.message);
  const rows = o.data.items;
  assert.deepEqual(
    nosOf(rows).sort(),
    ["BADDATE", "EDGEIN", "EDGEOUT", "FIRSTDAY", "JANCREATEDOCT", "JANRAISEDOCT", "LATEJOIN", "MULTI", "NOV1", "NOVRAISEDOCT", "P4R", "P6INV", "PART", "RAISEDOCT", "RAISEDSEP", "SEPT", "SEP30", "SUBM"].sort(),
    "January, September and November invoices are all here regardless of any month; PAIDOCT / JULY (paid), DRAFT, CANC are not"
  );
  const by = (n: string) => rows.find((r: any) => r.invoiceNo === `${TAG}-${n}`);
  assert.deepEqual([by("SEPT").invoiceDate, by("SEPT").outstandingINR, by("SEPT").balance], ["2026-09-10", 600, "full"]);
  assert.deepEqual([by("JANCREATEDOCT").invoiceDate, by("JANCREATEDOCT").createdMonth], ["2026-01-15", "2026-10"], "an old invoice keeps both dates");
  assert.deepEqual([by("PART").outstandingINR, by("PART").amountPaidINR, by("PART").balance], [null, null, "not_recorded"]);
  assert.equal(by("SUBM").status, "Raised");
  assert.equal(by("MULTI").lineCount, 2);
  assert.deepEqual([o.data.totals.invoiceCount, o.data.totals.knownOutstandingINR, o.data.totals.partiallyPaidCount, o.data.totals.partiallyPaidInvoiceAmountINR], [18, 7837, 1, 2000]);
  assert.equal(o.data.total, 18);
  const days = rows.map((r: any) => r.daysOutstanding);
  const dated = days.filter((d: number | null) => d !== null) as number[];
  assert.deepEqual(dated, [...dated].sort((a, b) => b - a), "oldest first");
  assert.equal(days.at(-1), null, "the invoice with no date sorts last");
  assert.ok(dated.every((d) => Number.isInteger(d) && d >= 0), "never a negative age (an invoice dated in the future has been outstanding 0 days)");
  const filtered = await api(`/invoice-tracker/outstanding?search=${TAG}-P5`, "admin");
  assert.deepEqual(nosOf(filtered.data.items).sort(), ["BADDATE", "SEPT"]);
  assert.equal((await list("admin", "month=2026-12")).data.items.length, 0, "an outstanding invoice is not carried into other months");
});

test("12: All history spans every month — one row per project, every invoice of every date, same search and scope rules", async () => {
  const all = (await list("admin", "month=all")).data;
  assert.equal(all.month, "all");
  assert.deepEqual(prsOf(all.items).sort(), ["P1", "P2", "P3", "P4", "P5", "P6", "P7"], "F1-F3 have no record; P3 is there through its request");
  assert.deepEqual([all.summary.invoiceCount, all.summary.requestCount], [23, 2], "P1 15 + P2 1 + P4 1 + P5 3 + P6 1 + P7 2");
  assert.deepEqual(all.summary.byStatus, { raised: 17, partiallyPaid: 1, paid: 2, draft: 2, cancelled: 1 }, "JULY was paid by an earlier test");
  assert.ok(all.items.every((i: any) => i.records.raisedInPeriodCount === 0), "all history has no raised-in-the-period group");
  assert.deepEqual(all.items.map((i: any) => [i.prNo.slice(TAG.length + 1), i.sortTier]), [["P3", 1], ["P6", 1], ["P1", 0], ["P2", 0], ["P4", 0], ["P5", 0], ["P7", 0]],
    "all history: projects whose displayed record belongs to an approval request come first, latest submission first (P3 3 Oct, P6 2 Oct); projects with no approval request follow in PR-number order");
  const months = (await chain("admin", "P1", "all")).data.invoices.map((i: any) => i.invoiceDate.slice(0, 7));
  assert.deepEqual([...new Set(months)].sort(), ["2026-01", "2026-09", "2026-10", "2026-11"], "invoices of many different dates, all listed");
  const searched = (await api(`/invoice-tracker?month=all&search=${TAG}-P5`, "admin")).data;
  assert.deepEqual(prsOf(searched.items), ["P5"]);
  const byClient = (await api(`/invoice-tracker?month=2026-10&search=${encodeURIComponent("Itk Client P6")}`, "admin")).data;
  assert.deepEqual(prsOf(byClient.items), ["P6"]);
  const byStatus = (await list("admin", "month=2026-10&projectStatus=On Hold")).data;
  assert.deepEqual(prsOf(byStatus.items), ["P2"]);
  assert.deepEqual([byStatus.summary.invoiceCount, byStatus.summary.projectCount], [1, 1], "search / status narrow the totals too");
});

test("13: pagination is stable with no gaps or duplicates and the same whole-month totals on every page", async () => {
  const seen: string[] = [];
  let summary: unknown = null;
  for (let page = 1; page <= 3; page++) {
    const r = (await list("admin", `month=2026-10&pageSize=2&page=${page}`)).data;
    assert.equal(r.total, 6);
    assert.equal(r.totalPages, 3);
    seen.push(...prsOf(r.items));
    if (summary) assert.deepEqual(r.summary, summary, "totals are never limited to the visible page");
    summary = r.summary;
  }
  assert.deepEqual(seen, ["P3", "P6", "P1", "P7", "P4", "P2"], "the ranked order holds across pages");
  assert.equal((await list("admin", "month=2026-10&pageSize=2&page=9")).data.items.length, 0);
  const o1 = (await outstanding("admin", "&pageSize=4&page=1")).data;
  const o5 = (await outstanding("admin", "&pageSize=4&page=5")).data;
  assert.deepEqual([o1.total, o1.totalPages, o1.items.length, o5.items.length], [18, 5, 4, 2]);
  assert.deepEqual(o1.totals, o5.totals);
});

test("14: project scope and permissions are the existing rules — nothing is visible that the user could not already see", async () => {
  const own = (await list("ownerA")).data;
  assert.deepEqual(prsOf(own.items), ["P3", "P6", "P1", "P7", "P2"], "ownerA's own projects only — P4 belongs to ownerB");
  assert.equal(own.summary.invoiceCount, 13, "totals are scoped as well (P4's invoice is not counted)");
  assert.deepEqual(prsOf((await list("ownerB")).data.items), ["P4"]);
  assert.equal((await chain("ownerB", "P1")).status, 403, "another owner's project");
  assert.equal((await chain("ownerB", "P1", "all")).status, 403);
  assert.equal((await chain("accounts", "P1")).status, 403, "Invoices access alone grants no extra projects");
  assert.equal((await list("accounts")).data.summary.recordCount, 0);
  assert.equal((await outstanding("accounts")).data.total, 0);
  assert.deepEqual(nosOf((await outstanding("ownerB")).data.items), ["P4R"], "Outstanding is scoped too");
  assert.equal((await list("viewAll")).data.items.length, 6, "View All Projects widens it");
  for (const path of [`/invoice-tracker?month=2026-10`, `/invoice-tracker/outstanding`, `/invoice-tracker/projects/${P.P1!.id}/invoices?month=2026-10`]) {
    assert.equal((await api(path, "noInvoices")).status, 403, `${path}: the Invoices module is required`);
    assert.equal((await api(path, null)).status, 401, `${path}: unauthenticated`);
  }
  assert.equal((await api(`/invoice-tracker/projects/${P.P1!.id}/invoices?month=2026-10`, "admin", "DELETE")).status, 404, "the Tracker has no write routes");
  assert.equal((await api(`/invoice-tracker`, "admin", "POST", {})).status, 404);
});

test("input validation: a real month or 'all', strict parameters", async () => {
  for (const q of ["month=2026-13", "month=bad", "month=", "", "month=2026-10&page=0", "month=2026-10&pageSize=500", "month=2026-10&sort=x", "month=2026-10&filter=weird"]) {
    assert.equal((await api(`/invoice-tracker?${q}`, "admin")).status, 400, q || "(no month)");
  }
  assert.equal((await api(`/invoice-tracker/outstanding?month=2026-10`, "admin")).status, 400, "Outstanding takes no month");
  assert.equal((await api(`/invoice-tracker/outstanding?pageSize=1000`, "admin")).status, 400);
  assert.equal((await api(`/invoice-tracker/projects/not-a-uuid/invoices?month=2026-10`, "admin")).status, 400);
  assert.equal((await api(`/invoice-tracker/projects/${P.P1!.id}/invoices`, "admin")).status, 400, "month is required");
  assert.equal((await api(`/invoice-tracker/projects/00000000-0000-4000-8000-000000000000/invoices?month=all`, "admin")).status, 404);
});

test("14 (workflow): invoices created and changed through the EXISTING API show their saved status in the invoice's own month, with history and no duplicate", async () => {
  const created = await api(`/quantity/${P.P6!.items[0]}/invoice-lines`, "ownerA", "POST", {
    invoiceNo: `${TAG}-API1`, invoiceIntent: "new", invoiceDate: "2026-10-12", quantityBilled: 0, invoiceAmountINR: 1234, status: "Raised",
  });
  assert.equal(created.status, 201, created.message);
  L.API1 = created.data.id;
  const read = async () => (await chain("ownerA", "P6", "2026-10")).data.invoices.filter((i: any) => i.invoiceNo === `${TAG}-API1`);
  let inv = await read();
  assert.equal(inv.length, 1, "dated in October -> an October invoice, whenever it was created");
  const { createdAt } = inv[0];
  assert.deepEqual([inv[0].status, inv[0].invoiceDate, inv[0].hasRecordedHistory], ["Raised", "2026-10-12", true]);
  const projectStatuses = async () => (await list("ownerA", "month=2026-10")).data.items.find((i: any) => i.prNo === `${TAG}-P6`).records.byStatus;
  assert.deepEqual(await projectStatuses(), { raised: 2, partiallyPaid: 0, paid: 0, draft: 0, cancelled: 0 }, "P6INV + the new invoice");
  const patch = (status: string) =>
    api(`/invoice-lines/${L.API1}`, "ownerA", "PATCH", {
      invoiceNo: `${TAG}-API1`, invoiceDate: "2026-10-12", milestoneId: null, milestoneName: null, setIndex: null, description: null, quantityBilled: 0, invoiceAmountINR: 1234,
      clientReference: null, remarks: null, status,
    });
  assert.equal((await patch("PartiallyPaid")).status, 200);
  assert.deepEqual(await projectStatuses(), { raised: 1, partiallyPaid: 1, paid: 0, draft: 0, cancelled: 0 }, "the Edit Project -> Invoices change shows in the Tracker");
  assert.equal((await patch("Paid")).status, 200);
  assert.deepEqual(await projectStatuses(), { raised: 1, partiallyPaid: 0, paid: 1, draft: 0, cancelled: 0 });
  inv = await read();
  assert.equal(inv.length, 1, "status changes never create a second record");
  assert.deepEqual([inv[0].status, inv[0].createdAt, inv[0].invoiceDate, inv[0].financials.balance], ["Paid", createdAt, "2026-10-12", "settled"], "creation and invoice dates untouched by the status changes");
  assert.deepEqual(inv[0].timeline.map((e: any) => [e.eventType, e.fromStatus, e.toStatus, e.actorName, e.source]), [
    ["CREATED", null, "Raised", "Itk ownerA", "invoice_create"],
    ["STATUS_CHANGED", "Raised", "PartiallyPaid", "Itk ownerA", "invoice_update"],
    ["STATUS_CHANGED", "PartiallyPaid", "Paid", "Itk ownerA", "invoice_update"],
  ]);
  assert.ok(inv[0].raisedAt && Date.parse(inv[0].raisedAt) <= Date.parse(inv[0].timeline[1].occurredAt));
  assert.equal(typeof inv[0].raisedInPeriod, "boolean");
  // existing write gates are unchanged: no Delete Invoice right -> refused
  assert.equal((await api(`/invoice-lines/${L.API1}`, "ownerB", "DELETE")).status, 403);
  assert.equal((await api(`/invoice-lines/${L.API1}`, "ownerA", "DELETE")).status, 200);
  assert.equal((await read()).length, 0, "deleting removes it from the report");
  const events = await prisma.invoiceStatusEvent.findMany({ where: { invoiceLineId: L.API1! }, orderBy: [{ occurredAt: "asc" }, { seq: "asc" }] });
  assert.deepEqual(events.map((e) => [e.eventType, e.toStatus]), [["CREATED", "Raised"], ["STATUS_CHANGED", "PartiallyPaid"], ["STATUS_CHANGED", "Paid"], ["DELETED", null]], "history outlives the invoice");
});

test("an invoice that predates history and is only PAID through the API has no raise date — the payment time is never shown as the raise", async () => {
  const row = await prisma.invoiceLine.create({
    data: { quantityItemId: P.P5!.items[0]!, invoiceNo: `${TAG}-OLDPAID`, invoiceDate: new Date("2026-08-25T00:00:00.000Z"), quantityBilled: 0, invoiceAmountINR: 800, status: "Raised", createdBy: "Direct Entry", createdAt: new Date("2026-08-25T06:00:00.000Z") },
  });
  L.OLDPAID = row.id;
  const patched = await api(`/invoice-lines/${row.id}`, "ownerA", "PATCH", {
    invoiceNo: `${TAG}-OLDPAID`, invoiceDate: "2026-08-25", milestoneId: null, milestoneName: null, setIndex: null, description: null, quantityBilled: 0, invoiceAmountINR: 800,
    clientReference: null, remarks: null, status: "Paid",
  });
  assert.equal(patched.status, 200, patched.message);
  const inv = (await chain("ownerA", "P5", "2026-08")).data.invoices.find((i: any) => i.invoiceNo === `${TAG}-OLDPAID`);
  assert.deepEqual([inv.status, inv.invoiceDate, inv.createdMonth], ["Paid", "2026-08-25", "2026-08"], "an August invoice");
  assert.deepEqual(inv.timeline.map((e: any) => [e.fromStatus, e.toStatus]), [["Raised", "Paid"]], "only the payment was ever recorded");
  assert.equal(inv.raisedAt, null, "no raise was recorded, so none is shown");
  assert.ok(!(await outstanding("ownerA")).data.items.some((i: any) => i.invoiceNo === `${TAG}-OLDPAID`), "Paid -> not outstanding");
});

test("query cost does not grow with page size or with the number of records (no N+1)", async () => {
  const small = await countQueries(() => list("admin", "month=2026-10&pageSize=2"));
  const large = await countQueries(() => list("admin", "month=2026-10&pageSize=10"));
  assert.equal(small, large, "list: same statements for 2 or 6 projects");
  assert.ok(large <= 30, `list uses a bounded number of statements (${large})`);
  const many = await countQueries(() => chain("admin", "P1", "all")); // 15 invoices
  const one = await countQueries(() => chain("admin", "P4", "all")); // 1 invoice
  assert.equal(many, one, "chain: same statements for 15 invoices or 1");
  assert.ok(many <= 20, `chain uses a bounded number of statements (${many})`);
  const o2 = await countQueries(() => outstanding("admin", "&pageSize=2"));
  const o100 = await countQueries(() => outstanding("admin", "&pageSize=100"));
  assert.equal(o2, o100, "outstanding: page size does not change the statement count");
  assert.ok(o2 <= 20, `outstanding uses a bounded number of statements (${o2})`);
});

test("Amount paid / outstanding / invoice amount stay consistent for every status, and Amount collected counts each invoice once", async () => {
  const month = "2026-12";
  const dec = async (label: string, status: string, amount: number, invoiceDate: string, opts: { item?: number; invoiceNo?: string } = {}) =>
    prisma.invoiceLine.create({
      data: { quantityItemId: P.P5!.items[0]!, invoiceNo: opts.invoiceNo ?? `${TAG}-${label}`, invoiceDate: new Date(`${invoiceDate}T00:00:00.000Z`), quantityBilled: 0, invoiceAmountINR: amount, status, createdBy: "Direct Entry", createdAt: new Date(`${invoiceDate}T06:00:00.000Z`) },
    });
  await dec("PAIDOK", "Paid", 400, "2026-12-02");
  await dec("MULTIPAIDa", "Paid", 100, "2026-12-03", { invoiceNo: `${TAG}-MULTIPAID` });
  await dec("MULTIPAIDb", "Paid", 200, "2026-12-04", { invoiceNo: `${TAG}-MULTIPAID` }); // one invoice, two lines
  await dec("PAIDZERO", "Paid", 0, "2026-12-05"); // marked Paid with a zero amount: settled at 0, flagged because unusual
  await dec("PARTX", "PartiallyPaid", 900, "2026-12-06");
  await dec("RAISEDX", "Raised", 50, "2026-12-07");
  const r = (await list("admin", `month=${month}`)).data;
  assert.deepEqual(r.summary.byStatus, { raised: 1, partiallyPaid: 1, paid: 3, draft: 0, cancelled: 0 });
  assert.deepEqual(r.summary.collected, { amountINR: 700, basis: "inferred_from_paid_status", paidInvoiceCount: 3, partiallyPaidExcludedCount: 1, needsReviewCount: 0, note: r.summary.collected.note },
    "400 (PAIDOK) + 300 (MULTIPAID counted once) + 0 (PAIDZERO, settled at 0) — PARTX is excluded");
  const invoices = (await chain("admin", "P5", month)).data.invoices;
  const by = (n: string) => invoices.find((i: any) => i.invoiceNo === `${TAG}-${n}`).financials;
  assert.deepEqual([by("PAIDOK").amountPaidINR, by("PAIDOK").outstandingINR, by("PAIDOK").paidBasis], [400, 0, "inferred_from_status"]);
  assert.deepEqual([by("MULTIPAID").amountINR, by("MULTIPAID").amountPaidINR, by("MULTIPAID").outstandingINR], [300, 300, 0]);
  assert.deepEqual([by("PAIDZERO").amountPaidINR, by("PAIDZERO").outstandingINR, by("PAIDZERO").paidBasis, by("PAIDZERO").balance], [0, 0, "inferred_from_status", "settled"], "Paid with a zero amount: settled at 0 — it is Paid, so it shows an Amount Paid");
  assert.deepEqual(by("PAIDZERO").flags, ["Paid invoice has a zero amount — review"], "…flagged only because a zero invoice is unusual");
  assert.deepEqual([by("PARTX").amountPaidINR, by("PARTX").outstandingINR, by("PARTX").paidBasis], [null, null, "not_recorded"], "Partially Paid: no payment data, nothing guessed");
  assert.deepEqual([by("RAISEDX").amountPaidINR, by("RAISEDX").outstandingINR, by("RAISEDX").paidBasis], [0, 50, "none_yet"]);
  for (const i of invoices) {
    const f = i.financials;
    if (f.amountPaidINR !== null && f.outstandingINR !== null) assert.equal(f.amountPaidINR + f.outstandingINR, f.amountINR, `${i.invoiceNo}: paid + outstanding = invoice amount`);
  }
  // the all-history view uses the same rule, and Outstanding never lists a Paid invoice
  assert.ok(!(await outstanding("admin", "&pageSize=100")).data.items.some((i: any) => /PAID/.test(i.invoiceNo)));
  assert.equal((await list("admin", "month=all")).data.summary.collected.paidInvoiceCount >= 2, true);
});
