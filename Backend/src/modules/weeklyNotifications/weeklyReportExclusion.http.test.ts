import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { env } from "../../shared/utils/env.js";
import type { SendEmailOptions } from "../../shared/email/email.types.js";
import { zonedToday, UNPAID_INVOICE_JOB_NAME } from "./unpaidInvoice.rules.js";
import { MISSING_EXPENSE_JOB_NAME } from "./missingExpense.rules.js";
import {
  runUnpaidInvoiceJob,
  setUnpaidInvoiceAccountsSourceForTests,
  setUnpaidInvoiceEmailFlagForTests,
  setUnpaidInvoiceSenderForTests,
} from "./services/unpaidInvoice.service.js";
import { runMissingExpenseJob, setMissingExpenseEmailFlagForTests, setMissingExpenseSenderForTests } from "./services/missingExpense.service.js";
import { AUDIT_EXCLUDED, AUDIT_RESTORED } from "./services/weeklyReportExclusion.service.js";

/**
 * Weekly email report exclusions (Nov 2026) through the real database (scratch) and routes: Administrator-only exclude /
 * restore / Excluded History, per-report independence, filtering of the preview AND the scheduled send, audit, and no
 * change to any financial row. FAKE senders record every message - nothing is ever delivered.
 */

const TAG = `wx-${Date.now()}`;
const R1 = MISSING_EXPENSE_JOB_NAME;
const R2 = UNPAID_INVOICE_JOB_NAME;
let url = "";
let closeServer: () => Promise<void> = async () => {};
const tokens: Record<string, string> = {};
const userIds: Record<string, string> = {};
const projectIds: Record<string, string> = {};
const prNos: Record<string, string> = {};
const sent: SendEmailOptions[] = [];
const fake = async (o: SendEmailOptions) => {
  sent.push(o);
  return { success: true };
};

async function api(method: string, path: string, who: string, body?: unknown) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens[who]}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
}

function daysAgo(n: number): Date {
  return new Date(Date.parse(`${zonedToday(new Date(), env.APP_TIMEZONE)}T00:00:00Z`) - n * 86_400_000);
}

const EXCL = "/notification-settings/report-exclusions";
const exclude = (who: string, reportType: string, key: string) => api("POST", EXCL, who, { reportType, projectId: projectIds[key] });
/** Full (unpaged) report lists - the legacy POST /preview returns every row. */
async function r1Rows(who = "admin"): Promise<{ id: string; prNo: string }[]> {
  const r = await api("POST", "/notification-settings/missing-expenses/preview", who);
  assert.equal(r.status, 200, r.message);
  return r.data.projects;
}
async function r2Rows(who = "admin"): Promise<{ projectId: string; invoiceNo: string }[]> {
  const r = await api("POST", "/notification-settings/unpaid-invoices/preview", who);
  assert.equal(r.status, 200, r.message);
  return r.data.invoices;
}
const r1Has = async (key: string) => (await r1Rows()).some((p) => p.id === projectIds[key]);
const r2Invoices = async (key: string) => (await r2Rows()).filter((i) => i.projectId === projectIds[key]).map((i) => i.invoiceNo).sort();
const page = (slug: string, who = "admin") => api("GET", `/notification-settings/${slug}/preview?page=1&pageSize=25`, who);
const activeId = async (reportType: string, key: string) =>
  (await prisma.weeklyReportExclusion.findFirst({ where: { reportType, projectId: projectIds[key], restoredAt: null }, select: { id: true } }))?.id;

/** Every financial / project value these tests could possibly touch, to prove none changed. */
async function financialSnapshot() {
  const ids = Object.values(projectIds);
  const items = await prisma.quantityItem.findMany({ where: { projectId: { in: ids } }, orderBy: { id: "asc" } });
  const lines = await prisma.invoiceLine.findMany({ where: { quantityItemId: { in: items.map((i) => i.id) } }, orderBy: { id: "asc" } });
  const projects = await prisma.project.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } });
  const expenses = await prisma.projectExpense.findMany({ where: { projectId: { in: ids } }, orderBy: { id: "asc" } });
  return JSON.stringify({ items, lines, projects, expenses });
}

before(async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  setUnpaidInvoiceSenderForTests(fake);
  setUnpaidInvoiceEmailFlagForTests("true");
  setMissingExpenseSenderForTests(fake);
  setMissingExpenseEmailFlagForTests("true");
  setUnpaidInvoiceAccountsSourceForTests(async () => ({ cc: [] }));

  const [settingsM, invoicesM, adminRole, pmoRole] = await Promise.all([
    prisma.module.findUniqueOrThrow({ where: { name: "Settings" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
  ]);
  const passwordHash = await hashPassword("WxTest@123");
  const mk = async (key: string, role: { id: string; name: string }, tokenRole: { id: string; name: string } = role) => {
    const email = `${TAG}-${key}@example.com`;
    const u = await prisma.portalUser.create({
      data: { fullName: `WX ${key}`, email, passwordHash, department: "PMO", roleId: role.id, forcePasswordChange: false, moduleAccess: { create: [settingsM.id, invoicesM.id].map((moduleId) => ({ moduleId })) } },
    });
    userIds[key] = u.id;
    tokens[key] = signAccessToken({ sub: u.id, email, roleId: tokenRole.id, roleName: tokenRole.name });
  };
  await mk("admin", adminRole);
  await mk("admin2", adminRole);
  await mk("pmo", pmoRole);
  // Holds an Administrator token but is a PMO Manager in the database (demoted after login): the service must refuse.
  await mk("demoted", pmoRole, adminRole);

  const mkProject = async (key: string, extra: Record<string, unknown> = {}) => {
    const prNo = `PR-${TAG}-${key}`;
    const p = await prisma.project.create({
      data: {
        poMonth: "2026-10", prCategory: "India", prNo, rfqNo: "RFQ-WX", client: `Client ${key}`, department: "Process", domesticForeign: "Domestic",
        projectTitle: `WX ${key}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", workOrderNumber: `${prNo}-WO`,
        workOrderDate: new Date("2026-01-01"), eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "PMO", nonManhourBudgetAmount: 0, ...extra,
      },
    });
    projectIds[key] = p.id;
    prNos[key] = prNo;
    const qi = await prisma.quantityItem.create({ data: { projectId: p.id, description: "Eng", woQty: 10, uom: "Nos", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1000000 } });
    return qi.id;
  };
  const mkLine = (qi: string, key: string, days: number, status: string, amount = 10000) =>
    prisma.invoiceLine.create({ data: { quantityItemId: qi, invoiceNo: `${TAG}-${key}`, invoiceDate: daysAgo(days), quantityBilled: 1, invoiceAmountINR: amount, status, createdBy: "test" } });

  // A: in BOTH reports (no Other Project Expenses; two overdue invoices + one recent).
  const qA = await mkProject("A");
  await mkLine(qA, "A45", 45, "Raised", 45000);
  await mkLine(qA, "A50", 50, "PartiallyPaid", 80000);
  await mkLine(qA, "A10", 10, "Raised");
  // B: in BOTH reports (one overdue invoice).
  const qB = await mkProject("B");
  await mkLine(qB, "B40", 40, "Raised", 40000);
  // N: never eligible - budget not entered (Report 1) and only a Paid invoice (Report 2).
  const qN = await mkProject("N", { nonManhourBudgetAmount: null });
  await mkLine(qN, "N60", 60, "Paid");
});

after(async () => {
  try {
    setUnpaidInvoiceSenderForTests(null);
    setUnpaidInvoiceEmailFlagForTests(null);
    setUnpaidInvoiceAccountsSourceForTests(null);
    setMissingExpenseSenderForTests(null);
    setMissingExpenseEmailFlagForTests(null);
    await prisma.scheduledJobRun.deleteMany({ where: { periodKey: { startsWith: TAG } } });
    const ids = Object.values(projectIds);
    // Exclusion history is permanent by design (DB trigger): those rows stay, keyed by these now-removed project ids.
    // Restore any that are still active so they can never affect another test file's report.
    await prisma.weeklyReportExclusion.updateMany({
      where: { projectId: { in: ids }, restoredAt: null },
      data: { restoredAt: new Date(), restoredByUserId: userIds["admin"]!, restoredByName: "test teardown" },
    });
    const items = await prisma.quantityItem.findMany({ where: { projectId: { in: ids } }, select: { id: true } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItemId: { in: items.map((i) => i.id) } } });
    await prisma.project.deleteMany({ where: { id: { in: ids } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: Object.values(userIds) }, event: { in: [AUDIT_EXCLUDED, AUDIT_RESTORED] } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: Object.values(userIds) } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: Object.values(userIds) } } });
  } finally {
    await closeServer();
  }
});

// ── Baseline: existing eligibility rules ────────────────────────────────────

test("baseline: existing eligibility rules unchanged (budget/status/Paid/age) and both previews offer Exclude only to Administrators", async () => {
  assert.ok(await r1Has("A"));
  assert.ok(await r1Has("B"));
  assert.ok(!(await r1Has("N")), "budget not entered -> not in Report 1");
  assert.deepEqual(await r2Invoices("A"), [`${TAG}-A45`, `${TAG}-A50`], "29-day rule: the 10-day invoice is not listed");
  assert.deepEqual(await r2Invoices("B"), [`${TAG}-B40`]);
  assert.deepEqual(await r2Invoices("N"), [], "Paid invoices never listed");

  for (const slug of ["missing-expenses", "unpaid-invoices"]) {
    const admin = await page(slug, "admin");
    assert.equal(admin.status, 200);
    assert.equal(admin.data.canExclude, true);
    assert.equal(typeof admin.data.excludedCount, "number");
    const pmo = await page(slug, "pmo");
    assert.equal(pmo.status, 200, "PMO Managers keep their preview access");
    assert.equal(pmo.data.canExclude, false);
    const demoted = await page(slug, "demoted");
    assert.equal(demoted.data.canExclude, false, "decided from the database, not the token");
  }
});

// ── Authorization ───────────────────────────────────────────────────────────

test("non-Administrators cannot exclude, view Excluded History or restore (route AND database re-check)", async () => {
  for (const who of ["pmo", "demoted"]) {
    const ex = await exclude(who, R1, "A");
    assert.equal(ex.status, 403, `${who} exclude`);
    const list = await api("GET", `${EXCL}?reportType=${R1}`, who);
    assert.equal(list.status, 403, `${who} history`);
  }
  assert.equal(await prisma.weeklyReportExclusion.count({ where: { projectId: { in: Object.values(projectIds) } } }), 0, "nothing was written");

  const ok = await exclude("admin", R1, "B");
  assert.equal(ok.status, 201, ok.message);
  for (const who of ["pmo", "demoted"]) {
    const r = await api("POST", `${EXCL}/${ok.data.id}/restore`, who);
    assert.equal(r.status, 403, `${who} restore`);
  }
  assert.ok(await activeId(R1, "B"), "still active after the refused restores");
  const back = await api("POST", `${EXCL}/${ok.data.id}/restore`, "admin");
  assert.equal(back.status, 200, back.message);
});

test("validation: unknown report 400, unknown project 404, unknown exclusion 404", async () => {
  assert.equal((await api("POST", EXCL, "admin", { reportType: "something_else", projectId: projectIds["A"] })).status, 400);
  assert.equal((await api("POST", EXCL, "admin", { reportType: R1, projectId: "00000000-0000-0000-0000-000000000000" })).status, 404);
  assert.equal((await api("POST", `${EXCL}/00000000-0000-0000-0000-000000000000/restore`, "admin")).status, 404);
  assert.equal((await api("GET", `${EXCL}?reportType=nope`, "admin")).status, 400);
});

// ── Report 1 ────────────────────────────────────────────────────────────────

test("Report 1: Administrator excludes a project -> gone from the preview and its counts; Report 2 untouched", async () => {
  const before1 = (await page("missing-expenses")).data;
  const before2 = (await page("unpaid-invoices")).data;
  const r2Before = await r2Invoices("A");

  const res = await exclude("admin", R1, "A");
  assert.equal(res.status, 201, res.message);
  assert.equal(res.data.status, "Active");
  assert.equal(res.data.prNo, prNos["A"]);
  assert.equal(res.data.reportName, "Projects Missing Other Project Expenses");
  assert.equal(res.data.excludedBy, "WX admin");

  assert.ok(!(await r1Has("A")), "excluded from the Report 1 preview");
  assert.ok(await r1Has("B"), "other projects stay");
  const after1 = (await page("missing-expenses")).data;
  assert.equal(after1.matchCount, before1.matchCount - 1, "matching count reflects the exclusion");
  assert.equal(after1.eligibleCount, before1.eligibleCount - 1, "an excluded project is not counted as checked either");
  assert.equal(after1.excludedCount, before1.excludedCount + 1);
  assert.equal(after1.total, before1.total - 1);

  assert.deepEqual(await r2Invoices("A"), r2Before, "Report 2 is independent");
  const after2 = (await page("unpaid-invoices")).data;
  assert.equal(after2.matchCount, before2.matchCount);
  assert.equal(after2.excludedCount, before2.excludedCount);
});

test("duplicate active exclusion is refused (409), also under two simultaneous requests", async () => {
  const dup = await exclude("admin2", R1, "A");
  assert.equal(dup.status, 409);
  const [x, y] = await Promise.all([exclude("admin", R2, "B"), exclude("admin2", R2, "B")]);
  assert.deepEqual([x.status, y.status].sort(), [201, 409]);
  assert.equal(await prisma.weeklyReportExclusion.count({ where: { projectId: projectIds["B"], reportType: R2, restoredAt: null } }), 1);
  // Put B back for the following tests.
  assert.equal((await api("POST", `${EXCL}/${await activeId(R2, "B")}/restore`, "admin")).status, 200);
});

// ── Report 2 ────────────────────────────────────────────────────────────────

test("Report 2: excluding a project removes ALL its qualifying invoices (rows, counts, outstanding); Report 1 untouched", async () => {
  const before2 = (await page("unpaid-invoices")).data;
  const r1HadB = await r1Has("B");
  assert.equal((await r2Invoices("A")).length, 2);

  const res = await exclude("admin2", R2, "A");
  assert.equal(res.status, 201, res.message);
  assert.equal(res.data.reportName, "Invoices Unpaid for 30+ Days");
  assert.equal(res.data.excludedBy, "WX admin2");

  assert.deepEqual(await r2Invoices("A"), [], "every invoice of the project is gone");
  assert.deepEqual(await r2Invoices("B"), [`${TAG}-B40`]);
  const after2 = (await page("unpaid-invoices")).data;
  assert.equal(after2.matchCount, before2.matchCount - 2, "both invoices leave the matching count");
  assert.equal(after2.eligibleCount, before2.eligibleCount - 3, "all three raised/partially-paid invoices leave the checked count");
  assert.equal(after2.summary.partiallyPaidCount, before2.summary.partiallyPaidCount - 1);
  assert.equal(Math.round((before2.summary.knownOutstandingINR - after2.summary.knownOutstandingINR) * 100) / 100, 45000, "the fully unpaid invoice's outstanding leaves the total");
  assert.equal(await r1Has("B"), r1HadB, "Report 1 independent");
});

// ── Scheduled send ──────────────────────────────────────────────────────────

test("scheduled email generation applies the same exclusions (fake sender, nothing delivered)", async () => {
  sent.length = 0;
  const m = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-r1` });
  assert.equal(m.outcome, "sent");
  const u = await runUnpaidInvoiceJob({ trigger: "scheduled", periodKey: `${TAG}-r2` });
  assert.equal(u.outcome, "sent");
  assert.equal(sent.length, 2);
  const [r1Mail, r2Mail] = sent;
  assert.ok(!r1Mail!.html.includes(prNos["A"]!), "A excluded from the Report 1 email");
  assert.ok(r1Mail!.html.includes(prNos["B"]!), "B still in the Report 1 email");
  assert.ok(!r2Mail!.html.includes(`${TAG}-A45`) && !r2Mail!.html.includes(`${TAG}-A50`), "A's invoices excluded from the Report 2 email");
  assert.ok(r2Mail!.html.includes(`${TAG}-B40`), "B's invoice still in the Report 2 email");
  // The run log counts match the preview.
  if (m.outcome !== "skipped") assert.equal(m.missingCount, (await page("missing-expenses")).data.matchCount);
  if (u.outcome !== "skipped") assert.equal(u.missingCount, (await page("unpaid-invoices")).data.matchCount);
});

// ── Excluded History + restore ──────────────────────────────────────────────

test("Excluded History: per report, status filter, who/when; restore requires an active row and makes the project eligible again", async () => {
  const h1 = await api("GET", `${EXCL}?reportType=${R1}&status=active`, "admin2");
  assert.equal(h1.status, 200, h1.message);
  const rowA = h1.data.items.find((r: any) => r.projectId === projectIds["A"]);
  assert.ok(rowA);
  assert.deepEqual([rowA.prNo, rowA.client, rowA.projectTitle, rowA.reportName, rowA.excludedBy, rowA.status, rowA.restoredBy], [prNos["A"], "Client A", "WX A", "Projects Missing Other Project Expenses", "WX admin", "Active", null]);
  assert.ok(!h1.data.items.some((r: any) => r.reportType !== R1), "only this report's rows");
  assert.ok(h1.data.counts[R1].active >= 1 && h1.data.counts[R2].active >= 1);

  const restored = await api("POST", `${EXCL}/${rowA.id}/restore`, "admin2");
  assert.equal(restored.status, 200, restored.message);
  assert.equal(restored.data.status, "Restored");
  assert.equal(restored.data.restoredBy, "WX admin2");
  assert.equal(restored.data.excludedBy, "WX admin", "the exclusion identity is preserved");
  assert.ok(restored.data.restoredAt && Date.parse(restored.data.restoredAt) >= Date.parse(restored.data.excludedAt));
  // Real times, whatever the database session time zone (a shifted value would be hours away from now).
  for (const iso of [restored.data.excludedAt, restored.data.restoredAt]) assert.ok(Math.abs(Date.parse(iso) - Date.now()) < 120_000, `time is now, not shifted: ${iso}`);
  assert.equal((await api("POST", `${EXCL}/${rowA.id}/restore`, "admin")).status, 409, "already restored");

  assert.ok(await r1Has("A"), "eligible again for Report 1");
  assert.deepEqual(await r2Invoices("A"), [], "still excluded from Report 2 (independent)");

  const all = await api("GET", `${EXCL}?reportType=${R1}&status=all&pageSize=100`, "admin");
  assert.ok(all.data.items.some((r: any) => r.id === rowA.id && r.status === "Restored"), "restored rows stay in the history");
  const onlyRestored = await api("GET", `${EXCL}?reportType=${R1}&status=restored&pageSize=100`, "admin");
  assert.ok(onlyRestored.data.items.every((r: any) => r.status === "Restored"));

  // Exclude again later = a new history row; the old one is untouched.
  const again = await exclude("admin", R1, "A");
  assert.equal(again.status, 201);
  assert.notEqual(again.data.id, rowA.id);
  assert.equal(await prisma.weeklyReportExclusion.count({ where: { projectId: projectIds["A"], reportType: R1 } }), 2);
  assert.equal((await api("POST", `${EXCL}/${again.data.id}/restore`, "admin")).status, 200);

  // Restore Report 2 too: all of A's invoices are back.
  assert.equal((await api("POST", `${EXCL}/${await activeId(R2, "A")}/restore`, "admin")).status, 200);
  assert.deepEqual(await r2Invoices("A"), [`${TAG}-A45`, `${TAG}-A50`]);
});

test("history is permanent: the database refuses deleting a row or changing a restored row", async () => {
  const row = await prisma.weeklyReportExclusion.findFirstOrThrow({ where: { projectId: projectIds["A"], restoredAt: { not: null } } });
  await assert.rejects(prisma.weeklyReportExclusion.delete({ where: { id: row.id } }));
  await assert.rejects(prisma.weeklyReportExclusion.update({ where: { id: row.id }, data: { restoredByName: "someone else" } }));
  await assert.rejects(prisma.weeklyReportExclusion.update({ where: { id: row.id }, data: { restoredAt: null, restoredByUserId: null, restoredByName: null } }));
  const still = await prisma.weeklyReportExclusion.findUniqueOrThrow({ where: { id: row.id } });
  assert.deepEqual(still, row);
});

// ── Audit + no financial change ─────────────────────────────────────────────

test("audit: every exclude and restore is recorded with the administrator, the report and the time", async () => {
  const rows = await prisma.authAuditLog.findMany({
    where: { event: { in: [AUDIT_EXCLUDED, AUDIT_RESTORED] }, userId: { in: Object.values(userIds) } },
    orderBy: { createdAt: "asc" },
  });
  const forA = rows.filter((r) => (r.details as any)?.projectId === projectIds["A"]);
  const summary = forA.map((r) => `${r.event}:${(r.details as any).reportType}:${r.email.split("@")[0]!.replace(`${TAG}-`, "")}`);
  assert.deepEqual(summary, [
    `${AUDIT_EXCLUDED}:${R1}:admin`,
    `${AUDIT_EXCLUDED}:${R2}:admin2`,
    `${AUDIT_RESTORED}:${R1}:admin2`,
    `${AUDIT_EXCLUDED}:${R1}:admin`,
    `${AUDIT_RESTORED}:${R1}:admin`,
    `${AUDIT_RESTORED}:${R2}:admin`,
  ]);
  for (const r of forA) {
    const d = r.details as any;
    assert.equal(d.prNo, prNos["A"]);
    assert.ok(d.exclusionId && d.reportName && d.at);
  }
  assert.ok(!rows.some((r) => ["pmo", "demoted"].some((k) => r.userId === userIds[k])), "refused attempts wrote nothing");
});

test("no financial or project data changed by excluding / restoring", async () => {
  const before = await financialSnapshot();
  const ex1 = await exclude("admin", R1, "B");
  const ex2 = await exclude("admin", R2, "B");
  assert.equal(ex1.status, 201);
  assert.equal(ex2.status, 201);
  assert.equal((await api("POST", `${EXCL}/${ex1.data.id}/restore`, "admin")).status, 200);
  assert.equal((await api("POST", `${EXCL}/${ex2.data.id}/restore`, "admin")).status, 200);
  assert.equal(await financialSnapshot(), before, "projects, quantity items, invoice lines and expenses are byte-identical");
});
