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
 * Invoice Tracker (Oct 2026) — GET /invoice-tracker and GET /invoice-tracker/projects/:id/invoices through the real
 * routes and the scratch database. One fixed scenario: 10 projects (all tagged), invoices on exact month
 * boundaries, a two-line invoice, a request-fulfilled invoice, an Open request, and users with different project
 * scope. Every assertion scopes the list with search=TAG so unrelated scratch data cannot interfere.
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
const list = (who: string, query = "month=2026-03") => api(`/invoice-tracker?${query}&search=${TAG}`, who);
const chain = (who: string, project: string, month = "2026-03") => api(`/invoice-tracker/projects/${P[project]!.id}/invoices?month=${month}`, who);

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
  for (let i = 1; i <= 6; i++) await mkProject(`F${i}`, "ownerA");

  const direct = async (label: string, project: string, status: string, date: string, amount: number, item = 0, invoiceNo = `${TAG}-${label}`) => {
    const row = await prisma.invoiceLine.create({
      data: { quantityItemId: P[project]!.items[item]!, invoiceNo, invoiceDate: new Date(`${date}T00:00:00.000Z`), quantityBilled: 0, invoiceAmountINR: amount, status, createdBy: "Direct Entry" },
    });
    L[label] = row.id;
  };
  // INV1 goes through the real API so it has recorded history: CREATED (Raised) then STATUS_CHANGED (→ PartiallyPaid).
  const created = await api(`/quantity/${P.P1!.items[0]}/invoice-lines`, "ownerA", "POST", {
    invoiceNo: `${TAG}-INV1`, invoiceIntent: "new", invoiceDate: "2026-03-01", quantityBilled: 0, invoiceAmountINR: 1000, status: "Raised",
  });
  assert.equal(created.status, 201, created.message);
  L.INV1 = created.data.id;
  const patched = await api(`/invoice-lines/${L.INV1}`, "ownerA", "PATCH", {
    invoiceNo: `${TAG}-INV1`, invoiceDate: "2026-03-01", milestoneId: null, milestoneName: null, setIndex: null, description: null, quantityBilled: 0, invoiceAmountINR: 1000,
    clientReference: null, remarks: null, status: "PartiallyPaid",
  });
  assert.equal(patched.status, 200, patched.message);

  await direct("INV2", "P1", "PartiallyPaid", "2026-03-31", 2000); // last day of the month
  await direct("INV3", "P1", "Paid", "2026-03-15", 3000);
  await direct("INV4", "P1", "Draft", "2026-03-10", 400);
  await direct("INV5", "P1", "Cancelled", "2026-03-12", 500);
  await direct("INV6a", "P1", "Raised", "2026-03-20", 100, 0, `${TAG}-INV6`); // one invoice, two lines, two activities
  await direct("INV6b", "P1", "Raised", "2026-03-20", 200, 1, `${TAG}-INV6`);
  await direct("INVFEB", "P1", "Raised", "2026-02-28", 700); // one day before the window
  await direct("INVAPR", "P1", "Raised", "2026-04-01", 800); // first day after the window
  await direct("P2D", "P2", "Draft", "2026-03-05", 150);
  await direct("P4R", "P4", "Raised", "2026-03-09", 500);

  // Request linked to INV1 (fulfilled by its raise) and an Open request on P3 (the "+" source).
  await prisma.invoiceRequest.create({ data: { projectId: P.P1!.id, requestedByUserId: people.ownerA!.id, assignedToUserId: people.ownerA!.id, status: "Completed", fulfilledInvoiceLineId: L.INV1! } });
  await prisma.invoiceRequest.create({ data: { projectId: P.P3!.id, requestedByUserId: people.ownerA!.id, assignedToUserId: people.ownerA!.id, status: "Open" } });
});

after(async () => {
  pg.Client.prototype.query = originalQuery;
  try {
    await prisma.invoiceStatusEvent.deleteMany({ where: { prNo: { startsWith: TAG } } });
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

test("month totals: exact boundaries, invoices vs projects, status mix, and every project listed including those with no invoice", async () => {
  const march = (await list("admin")).data;
  assert.equal(march.month, "2026-03");
  assert.deepEqual(march.summary.projectCount, 10);
  assert.deepEqual(
    [march.summary.projectsRaised, march.summary.projectsNotRaised, march.summary.invoiceCount, march.summary.invoicesRaised, march.summary.raisedAmountINR, march.summary.approvalPendingCount],
    [2, 8, 8, 5, 6800, 1],
    "P1 (4 raised: INV1, INV2 on the 31st, INV3, two-line INV6) + P4 (1) — INVFEB and INVAPR are outside the month"
  );
  assert.deepEqual(march.summary.byStatus, { raised: 2, partiallyPaid: 2, paid: 1, draft: 2, cancelled: 1 });
  const p1 = march.items.find((i: any) => i.prNo === `${TAG}-P1`);
  assert.deepEqual([p1.month.state, p1.month.raisedInvoiceCount, p1.month.invoiceCount, p1.month.draftInvoiceCount, p1.month.cancelledInvoiceCount], ["Raised", 4, 6, 1, 1], "one project row, six invoices");
  const p2 = march.items.find((i: any) => i.prNo === `${TAG}-P2`);
  assert.deepEqual([p2.month.state, p2.month.invoiceCount, p2.month.draftInvoiceCount], ["Not Raised", 1, 1], "a Draft never makes a project Raised");
  const f1 = march.items.find((i: any) => i.prNo === `${TAG}-F1`);
  assert.deepEqual([f1.month.state, f1.month.invoiceCount], ["Not Raised", 0], "a project with no invoice is listed as Not Raised");
  assert.equal(march.items.length, 10);

  const feb = (await list("admin", "month=2026-02")).data.summary;
  assert.deepEqual([feb.projectsRaised, feb.invoicesRaised, feb.raisedAmountINR], [1, 1, 700]);
  const apr = (await list("admin", "month=2026-04")).data.summary;
  assert.deepEqual([apr.projectsRaised, apr.invoicesRaised, apr.raisedAmountINR], [1, 1, 800]);
  const empty = (await list("admin", "month=2025-06")).data.summary;
  assert.deepEqual([empty.projectCount, empty.projectsRaised, empty.invoiceCount, empty.raisedAmountINR], [10, 0, 0, 0]);
});

test("each project's Repository fields come from the same source as Project Repository (WO value, pending due, the + flag)", async () => {
  const items = (await list("admin")).data.items;
  const p3 = items.find((i: any) => i.prNo === `${TAG}-P3`);
  assert.equal(p3.hasOpenInvoiceRequest, true, "an Open request shows the + indicator");
  assert.equal(items.find((i: any) => i.prNo === `${TAG}-P1`).hasOpenInvoiceRequest, false, "a Completed request does not");
  const p1 = items.find((i: any) => i.prNo === `${TAG}-P1`);
  assert.equal(p1.workOrderValueINR, 2_000_000, "two activities of 1,000,000");
  // GET /projects needs the Projects module, which the Invoices-only admin user lacks — ownerA owns P1 and P3 and has it.
  const repoRes = await api(`/projects?page=1&pageSize=100&search=${TAG}-P`, "ownerA");
  assert.equal(repoRes.status, 200, repoRes.message);
  const repository = repoRes.data.items.find((i: any) => i.prNo === `${TAG}-P1`);
  assert.deepEqual([p1.workOrderValueINR, p1.pendingDueINR, p1.hasOpenInvoiceRequest], [repository.workOrderValueINR, repository.pendingDueINR, repository.hasOpenInvoiceRequest], "identical to GET /projects");
  const repoP3 = (await api(`/projects?page=1&pageSize=100&search=${TAG}-P3`, "ownerA")).data.items[0];
  assert.equal(repoP3.hasOpenInvoiceRequest, p3.hasOpenInvoiceRequest);
});

test("pagination: stable order, no gaps or duplicates, and the same whole-month totals on every page", async () => {
  const full = (await list("admin", "month=2026-03&page=1&pageSize=100")).data;
  const order = full.items.map((i: any) => i.id);
  assert.equal(new Set(order).size, 10);
  const seen: string[] = [];
  let totals: unknown;
  for (let page = 1; page <= 4; page++) {
    const r = (await list("admin", `month=2026-03&page=${page}&pageSize=3`)).data;
    assert.equal(r.total, 10);
    assert.equal(r.totalPages, 4);
    assert.ok(r.items.length <= 3);
    seen.push(...r.items.map((i: any) => i.id));
    totals ??= r.summary;
    assert.deepEqual(r.summary, totals, `page ${page}: totals never depend on the page`);
  }
  assert.deepEqual(seen, order, "page boundaries lose and repeat nothing");
  const past = (await list("admin", "month=2026-03&page=99&pageSize=3")).data;
  assert.deepEqual([past.items.length, past.total], [0, 10]);
  assert.deepEqual(full.items.map((i: any) => i.prNo.slice(TAG.length + 1)), ["F1", "F2", "F3", "F4", "F5", "F6", "P1", "P2", "P3", "P4"], "PR number order");
});

test("filters narrow the table only; search and project status narrow the totals too", async () => {
  const names = (r: any) => r.data.items.map((i: any) => i.prNo.slice(TAG.length + 1)).sort();
  const raised = await list("admin", "month=2026-03&filter=raised");
  assert.deepEqual(names(raised), ["P1", "P4"]);
  assert.equal(raised.data.summary.projectCount, 10, "the Raised filter does not shrink the totals");
  const notRaised = await list("admin", "month=2026-03&filter=notRaised");
  assert.equal(notRaised.data.total, 8);
  assert.ok(!names(notRaised).includes("P1"));
  assert.deepEqual(names(await list("admin", "month=2026-03&filter=requestPending")), ["P3"]);
  const onHold = (await list("admin", "month=2026-03&projectStatus=On%20Hold")).data;
  assert.deepEqual([onHold.summary.projectCount, onHold.total, onHold.summary.invoiceCount], [1, 1, 1], "status filter narrows the totals");
  const bySearch = (await api(`/invoice-tracker?month=2026-03&search=Filler%20Client`, "admin")).data;
  assert.ok(bySearch.items.every((i: any) => i.client === "Filler Client"));
});

test("project scope is the existing rule: own projects only, View All Projects widens, Invoices access alone grants no extra projects", async () => {
  const a = (await list("ownerA")).data.summary;
  assert.deepEqual([a.projectCount, a.projectsRaised, a.invoicesRaised, a.raisedAmountINR], [9, 1, 4, 6300], "ownerA's nine projects; never P4");
  const b = (await list("ownerB")).data.summary;
  assert.deepEqual([b.projectCount, b.projectsRaised, b.invoicesRaised, b.raisedAmountINR], [1, 1, 1, 500]);
  const accounts = (await list("accounts")).data;
  assert.deepEqual([accounts.summary.projectCount, accounts.items.length, accounts.summary.invoiceCount], [0, 0, 0], "an Accounts-style user with no grant and no projects sees nothing — no silent expansion");
  assert.equal((await list("viewAll")).data.summary.projectCount, 10, "View All Projects is an explicit admin grant");
  assert.equal((await chain("ownerB", "P1")).status, 403, "another owner's project");
  assert.equal((await chain("accounts", "P1")).status, 403);
  assert.equal((await chain("viewAll", "P1")).status, 200);
});

test("permissions: Invoices module required; unauthenticated is rejected; invalid input is a 400", async () => {
  assert.equal((await api(`/invoice-tracker?month=2026-03`, null)).status, 401);
  assert.equal((await list("noInvoices")).status, 403, "Projects module alone is not enough");
  assert.equal((await chain("noInvoices", "P1")).status, 403);
  for (const q of ["", "month=2026-13", "month=2026-3", "month=abc", "month=2026-03&pageSize=101", "month=2026-03&pageSize=0", "month=2026-03&page=0", "month=2026-03&sort=prNo", "month=2026-03&filter=weird", "month=2026-03&page=1.5"]) {
    assert.equal((await api(`/invoice-tracker?${q}`, "admin")).status, 400, q || "(no month)");
  }
  assert.equal((await api(`/invoice-tracker/projects/not-a-uuid/invoices?month=2026-03`, "admin")).status, 400);
  assert.equal((await api(`/invoice-tracker/projects/${P.P1!.id}/invoices`, "admin")).status, 400, "month is required");
  assert.equal((await api(`/invoice-tracker/projects/00000000-0000-4000-8000-000000000000/invoices?month=2026-03`, "admin")).status, 404);
  assert.equal((await api(`/invoice-tracker?month=2026-03&pageSize=100`, "admin")).status, 200, "the page-size ceiling is inclusive");
});

test("existing invoice write endpoints keep their own approval gates (the Tracker adds no way around them)", async () => {
  const line = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: L.P4R! } });
  const body = { invoiceNo: line.invoiceNo, invoiceDate: "2026-03-09", milestoneId: null, milestoneName: null, setIndex: null, description: null, quantityBilled: 0, invoiceAmountINR: 999, clientReference: null, remarks: null, status: "Raised" };
  assert.equal((await api(`/invoice-lines/${L.P4R}`, "ownerB", "PATCH", body)).status, 403, "no Edit Invoice → content edit refused");
  assert.equal((await api(`/invoice-lines/${L.P4R}`, "ownerB", "DELETE")).status, 403, "no Delete Invoice → delete refused");
  assert.equal((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: L.P4R! } })).invoiceAmountINR, 500);
});

test("expanded chain: ALL of the project's invoices (every date), newest first, one entry per invoice, flagged when dated in the selected month", async () => {
  const r = await chain("admin", "P1");
  assert.equal(r.status, 200, r.message);
  const nos = r.data.invoices.map((i: any) => i.invoiceNo.slice(TAG.length + 1));
  assert.deepEqual([...nos].sort(), ["INV1", "INV2", "INV3", "INV4", "INV5", "INV6", "INVAPR", "INVFEB"], "the February and April invoices are listed too, not only March's");
  const dates = r.data.invoices.map((i: any) => i.invoiceDate);
  assert.deepEqual(dates, [...dates].sort().reverse(), "newest invoice first");
  const by = (n: string) => r.data.invoices.find((i: any) => i.invoiceNo === `${TAG}-${n}`);
  assert.deepEqual(r.data.invoices.filter((i: any) => i.inSelectedMonth).map((i: any) => i.invoiceNo.slice(TAG.length + 1)).sort(), ["INV1", "INV2", "INV3", "INV4", "INV5", "INV6"], "only March's invoices carry the selected-month flag");
  assert.deepEqual([by("INVFEB").inSelectedMonth, by("INVAPR").inSelectedMonth], [false, false]);
  const april = await chain("admin", "P1", "2026-04");
  assert.deepEqual(april.data.invoices.filter((i: any) => i.inSelectedMonth).map((i: any) => i.invoiceNo.slice(TAG.length + 1)), ["INVAPR"], "the same invoices, a different selected month");
  assert.equal(april.data.invoices.length, r.data.invoices.length);
  assert.deepEqual([by("INV1").status, by("INV1").paymentStatus, by("INV1").invoiceDate, by("INV1").amountINR, by("INV1").currency], ["PartiallyPaid", "Partially paid", "2026-03-01", 1000, "INR"]);
  assert.deepEqual([by("INV2").invoiceDate, by("INV2").status], ["2026-03-31", "PartiallyPaid"]);
  assert.deepEqual([by("INV3").status, by("INV3").paymentStatus], ["Paid", "Paid"]);
  assert.deepEqual([by("INV4").status, by("INV4").paymentStatus], ["Draft", "Not applicable"]);
  assert.deepEqual([by("INV5").status, by("INV5").paymentStatus, by("INV5").amountINR], ["Cancelled", "Not applicable", 0]);
  const inv6 = by("INV6");
  assert.deepEqual([inv6.lines.length, inv6.amountINR, inv6.status, inv6.mixedLineStatuses], [2, 300, "Raised", false], "two lines, ONE invoice");
  assert.deepEqual(inv6.lines.map((l: any) => l.activity).sort(), ["Activity 1", "Activity 2"]);
  assert.equal(r.data.project.prNo, `${TAG}-P1`);
});

test("history: recorded events show previous → new status with actor and time; invoices from before the feature say so honestly", async () => {
  const r = await chain("admin", "P1");
  const inv1 = r.data.invoices.find((i: any) => i.invoiceNo === `${TAG}-INV1`);
  assert.equal(inv1.hasRecordedHistory, true);
  assert.deepEqual(inv1.timeline.map((e: any) => [e.eventType, e.fromStatus, e.toStatus, e.actorName, e.source]), [
    ["CREATED", null, "Raised", "Itk ownerA", "invoice_create"],
    ["STATUS_CHANGED", "Raised", "PartiallyPaid", "Itk ownerA", "invoice_update"],
  ]);
  assert.ok(inv1.timeline.every((e: any) => !Number.isNaN(Date.parse(e.occurredAt))) && inv1.timeline[0].occurredAt <= inv1.timeline[1].occurredAt);
  for (const n of ["INV2", "INV3", "INV4", "INV5", "INV6", "INVFEB", "INVAPR"]) {
    const inv = r.data.invoices.find((i: any) => i.invoiceNo === `${TAG}-${n}`);
    assert.deepEqual([inv.hasRecordedHistory, inv.timeline], [false, []], `${n} predates history tracking — no event is invented`);
    assert.equal(inv.recordedInPortal.by, "Direct Entry", "record metadata (who typed it in) is separate from status events");
  }
  assert.equal(inv1.invoiceRequest.submittedBy, "Itk ownerA", "the request that this invoice's raise fulfilled");
  assert.equal(r.data.invoices.filter((i: any) => i.invoiceRequest).length, 1, "no request is linked to an invoice it did not fulfil");
  const p3 = await chain("admin", "P3");
  assert.deepEqual(p3.data.invoices, [], "a project with no invoices at all has an empty chain (the Open request is project-level, not an invoice)");
});

test("a project whose only invoice is from another month: listed as Not Raised, month totals unchanged, and expanding shows that invoice", async () => {
  const before = (await list("admin")).data;
  const old = await prisma.invoiceLine.create({
    data: { quantityItemId: P.P3!.items[0]!, invoiceNo: `${TAG}-INVSEP`, invoiceDate: new Date("2026-02-10T00:00:00.000Z"), quantityBilled: 0, invoiceAmountINR: 777, status: "Raised", createdBy: "Direct Entry" },
  });
  try {
    const after = (await list("admin")).data;
    assert.deepEqual(after.summary, before.summary, "an invoice dated in February is not counted in March's summary");
    const row = after.items.find((p: any) => p.prNo === `${TAG}-P3`);
    assert.equal(row.month.state, "Not Raised");
    assert.equal(row.month.invoiceCount, 0);
    const c = await chain("admin", "P3");
    assert.deepEqual(c.data.invoices.map((i: any) => [i.invoiceNo, i.invoiceDate, i.status, i.inSelectedMonth, i.hasRecordedHistory]), [[`${TAG}-INVSEP`, "2026-02-10", "Raised", false, false]]);
    assert.equal((await chain("ownerB", "P3")).status, 403, "the wider chain is still project-scoped");
    assert.equal((await chain("noInvoices", "P3")).status, 403);
  } finally {
    await prisma.invoiceLine.delete({ where: { id: old.id } });
  }
});

test("query cost does not grow with page size or with the number of invoices (no N+1)", async () => {
  const small = await countQueries(() => list("admin", "month=2026-03&pageSize=2"));
  const large = await countQueries(() => list("admin", "month=2026-03&pageSize=10"));
  assert.equal(small, large, "list: same statements for 2 or 10 projects");
  assert.ok(large <= 30, `list uses a bounded number of statements (${large})`);
  const many = await countQueries(() => chain("admin", "P1")); // 6 invoices, 7 lines
  const one = await countQueries(() => chain("admin", "P4")); // 1 invoice
  assert.equal(many, one, "chain: same statements for 6 invoices or 1");
  assert.ok(many <= 20, `chain uses a bounded number of statements (${many})`);
});

test("deleting an invoice removes it from the chain but its recorded history stays in the audit table", async () => {
  assert.equal((await api(`/invoice-lines/${L.INV1}`, "ownerA", "DELETE")).status, 200);
  const r = await chain("admin", "P1");
  assert.ok(!r.data.invoices.some((i: any) => i.invoiceNo === `${TAG}-INV1`));
  const events = await prisma.invoiceStatusEvent.findMany({ where: { invoiceLineId: L.INV1! }, orderBy: [{ occurredAt: "asc" }, { seq: "asc" }] });
  assert.deepEqual(events.map((e) => [e.eventType, e.toStatus]), [["CREATED", "Raised"], ["STATUS_CHANGED", "PartiallyPaid"], ["DELETED", null]]);
  const march = (await list("admin")).data.summary;
  assert.deepEqual([march.invoicesRaised, march.byStatus.partiallyPaid], [4, 1], "month totals follow the live invoices");
});
