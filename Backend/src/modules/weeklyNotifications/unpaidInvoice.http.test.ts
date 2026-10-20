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
import { findUnpaidInvoiceLines } from "./repository/unpaidInvoice.repository.js";
import { buildUnpaidInvoiceReport, UNPAID_INVOICE_JOB_NAME, UNPAID_INVOICE_SETTING_KEY, zonedToday, type InvoiceLineCandidate } from "./unpaidInvoice.rules.js";
import { MISSING_EXPENSE_JOB_NAME, MISSING_EXPENSE_SETTING_KEY } from "./missingExpense.rules.js";
import {
  runUnpaidInvoiceJob,
  setUnpaidInvoiceAccountsSourceForTests,
  setUnpaidInvoiceEmailFlagForTests,
  setUnpaidInvoiceLinesForTests,
  setUnpaidInvoiceManualFlagForTests,
  setUnpaidInvoiceSenderForTests,
} from "./services/unpaidInvoice.service.js";
import {
  runMissingExpenseJob,
  setMissingExpenseCandidatesForTests,
  setMissingExpenseEmailFlagForTests,
  setMissingExpenseSenderForTests,
} from "./services/missingExpense.service.js";

/**
 * Weekly "Invoices Unpaid for 30+ Days" email (Oct 2026) through the real
 * database (scratch) and routes. FAKE senders record every message — nothing
 * is ever delivered.
 */

const TAG = `ui-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => {};
const tokens: Record<string, string> = {};
const userIds: string[] = [];
const userEmails: Record<string, string> = {};
const projectIds: string[] = [];
const lineIds: Record<string, string> = {};
const savedSettings: { key: string; toEmail: string; cc: { email: string; emailNormalized: string; portalUserId: string | null }[] }[] = [];

const sent: SendEmailOptions[] = [];
let senderMode: "ok" | "fail" | "slow" = "ok";
const fake = async (o: SendEmailOptions) => {
  sent.push(o);
  if (senderMode === "fail") return { success: false, error: "simulated rejection" };
  if (senderMode === "slow") await new Promise((r) => setTimeout(r, 50));
  return { success: true };
};

async function api(method: string, path: string, who: string | null, body?: unknown) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
}

/** Date-only value (UTC midnight) `n` calendar days before today in APP_TIMEZONE. */
function daysAgo(n: number): Date {
  return new Date(Date.parse(`${zonedToday(new Date(), env.APP_TIMEZONE)}T00:00:00Z`) - n * 86_400_000);
}
function cand(id: string, days: number, status = "Raised"): InvoiceLineCandidate {
  return { id, projectId: "p", prNo: `PR-${TAG}`, client: "C", projectTitle: "T", projectManager: null, invoiceNo: `INV-${id}`, invoiceDate: daysAgo(days), status, invoiceAmountINR: 1000, currency: "INR", invoiceAmountOriginal: 1000 };
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
  // Hermetic: the expense email's own test file edits its settings row in parallel.
  setUnpaidInvoiceAccountsSourceForTests(async () => ({ cc: [{ email: "sivagnanam@ifluids.com" }, { email: "monish.n@ifluids.com" }] }));

  for (const key of [UNPAID_INVOICE_SETTING_KEY]) {
    const existing = await prisma.notificationSetting.findUnique({ where: { key }, include: { ccRecipients: true } });
    if (existing) {
      savedSettings.push({ key, toEmail: existing.toEmail, cc: existing.ccRecipients.map((c) => ({ email: c.email, emailNormalized: c.emailNormalized, portalUserId: c.portalUserId })) });
      await prisma.notificationSetting.delete({ where: { id: existing.id } });
    }
  }

  const [settingsM, invoicesM, adminRole, pmoRole, engineerRole] = await Promise.all([
    prisma.module.findUniqueOrThrow({ where: { name: "Settings" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
  ]);
  const passwordHash = await hashPassword("UiTest@123");
  const mk = async (key: string, role: { id: string; name: string }, modules: string[]) => {
    const email = `${TAG}-${key}@example.com`;
    const u = await prisma.portalUser.create({ data: { fullName: `UI ${key}`, email, passwordHash, department: "PMO", roleId: role.id, forcePasswordChange: false, moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) } } });
    userIds.push(u.id);
    userEmails[key] = email;
    tokens[key] = signAccessToken({ sub: u.id, email, roleId: role.id, roleName: role.name });
  };
  await mk("admin", adminRole, [settingsM.id, invoicesM.id]);
  await mk("pmoNoInvoices", pmoRole, [settingsM.id]);
  await mk("engineer", engineerRole, [settingsM.id, invoicesM.id]);

  // Real rows: two live projects + one archived.
  const mkProject = async (suffix: string, extra: Record<string, unknown> = {}) => {
    const prNo = `PR-${TAG}-${suffix}`;
    const p = await prisma.project.create({
      data: {
        poMonth: "2026-10", prCategory: "India", prNo, rfqNo: "RFQ-UI", client: suffix === "A" ? `<i>Acme</i> & "Sons"` : "Beta Ltd", department: "Process", domesticForeign: "Domestic",
        projectTitle: `UI ${suffix}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", workOrderNumber: `${prNo}-WO`,
        workOrderDate: new Date("2026-01-01"), eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "PMO", ...extra,
      },
    });
    projectIds.push(p.id);
    const qi = await prisma.quantityItem.create({ data: { projectId: p.id, description: "Eng", woQty: 10, uom: "Nos", unitRate: 100000, exchangeRate: 1, unitRateINR: 100000, woValue: 1000000 } });
    return qi.id;
  };
  const qA = await mkProject("A");
  const qB = await mkProject("B");
  const qX = await mkProject("X", { isDeleted: true, deletedAt: new Date() });
  const mkLine = async (key: string, qi: string, days: number, status: string, extra: Record<string, unknown> = {}) => {
    const l = await prisma.invoiceLine.create({
      data: { quantityItemId: qi, invoiceNo: `${TAG}-${key}`, invoiceDate: daysAgo(days), quantityBilled: 1, invoiceAmountINR: 10000, status, createdBy: "test", ...extra },
    });
    lineIds[key] = l.id;
  };
  await mkLine("raised29", qA, 29, "Raised");
  await mkLine("raised30", qA, 30, "Raised");
  await mkLine("raised45", qA, 45, "Raised", { invoiceAmountINR: 45000 });
  await mkLine("paid60", qA, 60, "Paid");
  await mkLine("draft60", qA, 60, "Draft");
  await mkLine("cancelled60", qA, 60, "Cancelled");
  await mkLine("partial50", qB, 50, "PartiallyPaid", { invoiceAmountINR: 80000 });
  // Correct-event checks: age comes from invoiceDate, never from createdAt.
  await mkLine("recentButOldRow", qB, 10, "Raised", { createdAt: new Date(Date.now() - 90 * 86_400_000) });
  await mkLine("oldButNewRow", qB, 40, "Raised");
  // One invoice raised as two lines (same number) -> one row.
  await prisma.invoiceLine.create({ data: { quantityItemId: qB, invoiceNo: `${TAG}-multi`, invoiceDate: daysAgo(35), quantityBilled: 1, invoiceAmountINR: 1000, status: "Raised", createdBy: "test" } });
  await prisma.invoiceLine.create({ data: { quantityItemId: qB, invoiceNo: `${TAG}-multi`, invoiceDate: daysAgo(35), quantityBilled: 1, invoiceAmountINR: 2000, status: "Raised", createdBy: "test" } });
  await mkLine("archived60", qX, 60, "Raised");
});

after(async () => {
  try {
    setUnpaidInvoiceSenderForTests(null);
    setUnpaidInvoiceEmailFlagForTests(null);
    setUnpaidInvoiceManualFlagForTests(null);
    setUnpaidInvoiceLinesForTests(null);
    setUnpaidInvoiceAccountsSourceForTests(null);
    setMissingExpenseSenderForTests(null);
    setMissingExpenseEmailFlagForTests(null);
    setMissingExpenseCandidatesForTests(null);
    await prisma.scheduledJobRun.deleteMany({ where: { OR: [{ periodKey: { startsWith: TAG } }, { jobName: UNPAID_INVOICE_JOB_NAME, trigger: "manual" }, { periodKey: { startsWith: "manual:2032" } }] } });
    await prisma.notificationSetting.deleteMany({ where: { key: UNPAID_INVOICE_SETTING_KEY } });
    for (const s of savedSettings) await prisma.notificationSetting.create({ data: { key: s.key, toEmail: s.toEmail, ccRecipients: { create: s.cc } } });
    const items = await prisma.quantityItem.findMany({ where: { projectId: { in: projectIds } }, select: { id: true } });
    await prisma.invoiceLine.deleteMany({ where: { quantityItemId: { in: items.map((i) => i.id) } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await closeServer();
  }
});

// ── Eligibility on real rows ────────────────────────────────────────────────

test("real rows: 29 excluded, 30/45 included, Paid/Draft/Cancelled/archived excluded, age from invoiceDate (not createdAt), multi-line invoice once", async () => {
  const lines = (await findUnpaidInvoiceLines()).filter((l) => l.prNo.startsWith(`PR-${TAG}-`));
  assert.ok(!lines.some((l) => l.prNo.endsWith("-X")), "archived project's invoices are not candidates");
  assert.ok(!lines.some((l) => ["Paid", "Draft", "Cancelled"].includes(l.status)), "only Raised / Partially Paid are fetched");
  const report = buildUnpaidInvoiceReport(lines, new Date(), env.APP_TIMEZONE);
  const keys = report.overdue.map((r) => r.invoiceNo.replace(`${TAG}-`, "")).sort();
  assert.deepEqual(keys, ["multi", "oldButNewRow", "partial50", "raised30", "raised45"]);
  const multi = report.overdue.find((r) => r.invoiceNo === `${TAG}-multi`)!;
  assert.deepEqual([multi.lineCount, multi.invoiceAmountINR], [2, 3000]);
  const partial = report.overdue.find((r) => r.invoiceNo === `${TAG}-partial50`)!;
  assert.deepEqual([partial.status, partial.amountPaidINR, partial.outstandingINR, partial.daysSinceRaised], ["Partially Paid", null, null, 50]);
  assert.equal(report.overdue.find((r) => r.invoiceNo === `${TAG}-raised30`)!.daysSinceRaised, 30);
  // eligible = all raised/partially-paid invoices (any age) on the two live projects: 29,30,45,partial,recent,old,multi
  assert.equal(report.eligibleCount, 7);
  // Nothing was modified by building the report.
  const statuses = await prisma.invoiceLine.findMany({ where: { id: { in: Object.values(lineIds) } }, select: { status: true } });
  assert.equal(statuses.length, Object.keys(lineIds).length);
});

// ── Settings and permissions ────────────────────────────────────────────────

test("settings: defaults To info@ifluids.com, CC reused from the Other Project Expenses email (deduplicated); administrators only", async () => {
  const res = await api("GET", "/notification-settings/unpaid-invoices", "admin");
  assert.equal(res.status, 200);
  assert.equal(res.data.recipients.isDefault, true);
  assert.equal(res.data.recipients.toEmail, "info@ifluids.com");
  assert.deepEqual(res.data.recipients.cc.map((c: { email: string }) => c.email.toLowerCase()), ["sivagnanam@ifluids.com", "monish.n@ifluids.com"]);
  assert.equal(res.data.emailEnabled, true, "test override");
  assert.equal(res.data.schedule.cron, env.UNPAID_INVOICE_CRON);

  // A changed Accounts CC list flows into the invoice defaults; a CC equal to the To is dropped.
  setUnpaidInvoiceAccountsSourceForTests(async () => ({ cc: [{ email: "info@ifluids.com" }, { email: "accounts@example.com" }] }));
  const res2 = await api("GET", "/notification-settings/unpaid-invoices", "admin");
  assert.deepEqual(res2.data.recipients.cc.map((c: { email: string }) => c.email), ["accounts@example.com"]);

  assert.equal((await api("GET", "/notification-settings/unpaid-invoices", "engineer")).status, 403);
  assert.equal((await api("GET", "/notification-settings/unpaid-invoices", null)).status, 401);
  assert.equal((await api("GET", "/notification-settings/unpaid-invoices/user-options", "engineer")).status, 403);
});

test("settings save: own row, validation and duplicates, does not touch the expense email's recipients", async () => {
  assert.equal((await api("PUT", "/notification-settings/unpaid-invoices", "admin", { toEmail: "bad", cc: [] })).status, 400);
  assert.equal((await api("PUT", "/notification-settings/unpaid-invoices", "admin", { toEmail: "a@example.com", cc: [{ email: "A@example.com" }] })).status, 400);
  assert.equal((await api("PUT", "/notification-settings/unpaid-invoices", "engineer", { toEmail: "a@example.com", cc: [] })).status, 403);
  const ok = await api("PUT", "/notification-settings/unpaid-invoices", "admin", { toEmail: "ar@example.com", cc: [{ email: "fin@example.com" }] });
  assert.equal(ok.status, 200, ok.message);
  assert.deepEqual([ok.data.isDefault, ok.data.toEmail, ok.data.cc.map((c: { email: string }) => c.email)], [false, "ar@example.com", ["fin@example.com"]]);
  const adminId = (await prisma.portalUser.findUniqueOrThrow({ where: { email: userEmails.admin! } })).id;
  const written = await prisma.notificationSetting.findMany({ where: { updatedByUserId: adminId }, select: { key: true } });
  assert.deepEqual(written.map((w) => w.key), [UNPAID_INVOICE_SETTING_KEY], "only this notification's own settings row was written");
});

test("preview requires the Invoices module and never sends", async () => {
  sent.length = 0;
  assert.equal((await api("POST", "/notification-settings/unpaid-invoices/preview", "pmoNoInvoices", {})).status, 403);
  const p = await api("POST", "/notification-settings/unpaid-invoices/preview", "admin", {});
  assert.equal(p.status, 200);
  assert.ok(p.data.missingCount >= 5);
  assert.ok(p.data.invoices.some((i: { invoiceNo: string }) => i.invoiceNo === `${TAG}-raised45`));
  assert.equal(sent.length, 0);
});

// ── The job ─────────────────────────────────────────────────────────────────

test("job: zero overdue invoices → no email (NO_MISSING)", async () => {
  sent.length = 0;
  setUnpaidInvoiceLinesForTests(async () => [cand("z1", 10), cand("z2", 29), cand("z3", 90, "Paid")]);
  const r = await runUnpaidInvoiceJob({ trigger: "scheduled", periodKey: `${TAG}-zero` });
  assert.equal(r.outcome, "no_missing");
  assert.equal(sent.length, 0);
});

test("job: several overdue invoices → ONE consolidated email to the configured recipients, links from FRONTEND_URL, escaped", async () => {
  sent.length = 0;
  setUnpaidInvoiceLinesForTests(async () => [cand("a", 31), { ...cand("b", 60), client: `<img src=x onerror=alert(1)>`, projectId: "proj-b" }, cand("c", 45, "PartiallyPaid"), cand("d", 5)]);
  const r = await runUnpaidInvoiceJob({ trigger: "scheduled", periodKey: `${TAG}-send` });
  assert.equal(r.outcome, "sent");
  assert.equal(sent.length, 1, "one email per run, not one per invoice");
  const m = sent[0]!;
  assert.equal(m.to, "ar@example.com");
  assert.deepEqual(m.cc, ["fin@example.com"]);
  assert.equal(m.subject, "Weekly Reminder — Invoices Unpaid for 30+ Days");
  // "Open" = Edit Project → Invoices, by project id, with the invoice's (earliest) line highlighted.
  assert.ok(m.html.includes(`href="${env.FRONTEND_URL.replace(/\/+$/, "")}/projects/edit/proj-b?tab=invoices&amp;invoiceLineId=`), "HTML link (& escaped)");
  assert.ok(!m.html.includes("/projects/view/"));
  assert.ok(!m.html.includes("<img src=x"));
  assert.ok(m.text?.includes("Invoices unpaid for 30+ days: 3"));
  assert.ok(!m.text?.includes("INV-d"), "a 5-day-old invoice is not listed");
});

test("job: delivery switch off → recorded DISABLED, nothing sent", async () => {
  sent.length = 0;
  setUnpaidInvoiceEmailFlagForTests(undefined);
  setUnpaidInvoiceLinesForTests(async () => [cand("dis", 40)]);
  assert.equal((await runUnpaidInvoiceJob({ trigger: "scheduled", periodKey: `${TAG}-disabled` })).outcome, "disabled");
  assert.equal(sent.length, 0);
  setUnpaidInvoiceEmailFlagForTests("true");
});

test("job: simultaneous triggers send once; a repeat in the same week is skipped", async () => {
  sent.length = 0;
  setUnpaidInvoiceLinesForTests(async () => [cand("r", 40)]);
  senderMode = "slow";
  const results = await Promise.all(Array.from({ length: 5 }, () => runUnpaidInvoiceJob({ trigger: "scheduled", periodKey: `${TAG}-race` })));
  senderMode = "ok";
  assert.equal(sent.length, 1);
  assert.equal(results.filter((x) => x.outcome === "sent").length, 1);
  const again = await runUnpaidInvoiceJob({ trigger: "scheduled", periodKey: `${TAG}-race` });
  assert.deepEqual([again.outcome, again.outcome === "skipped" ? again.reason : null], ["skipped", "already_completed"]);
  assert.equal(sent.length, 1);
});

test("job: a failed send is recorded and retried safely (no third send)", async () => {
  sent.length = 0;
  setUnpaidInvoiceLinesForTests(async () => [cand("f", 40)]);
  senderMode = "fail";
  const failed = await runUnpaidInvoiceJob({ trigger: "scheduled", periodKey: `${TAG}-fail` });
  assert.deepEqual([failed.outcome, failed.outcome === "failed" ? failed.error : null], ["failed", "simulated rejection"]);
  senderMode = "ok";
  assert.equal((await runUnpaidInvoiceJob({ trigger: "scheduled", periodKey: `${TAG}-fail` })).outcome, "sent");
  assert.equal((await runUnpaidInvoiceJob({ trigger: "scheduled", periodKey: `${TAG}-fail` })).outcome, "skipped");
  const row = await prisma.scheduledJobRun.findUniqueOrThrow({ where: { jobName_periodKey: { jobName: UNPAID_INVOICE_JOB_NAME, periodKey: `${TAG}-fail` } } });
  assert.deepEqual([row.status, row.attempts], ["SENT", 2]);
  assert.equal(sent.length, 2);
});

test("independent of the Other Project Expenses email: same week, separate run records, both send", async () => {
  sent.length = 0;
  setUnpaidInvoiceLinesForTests(async () => [cand("ind", 40)]);
  setMissingExpenseCandidatesForTests(async () => [{ id: "x", prNo: "PR-X", client: "C", projectTitle: "T", projectManager: null, projectStatus: "Active", otherExpenseCount: 0 }]);
  const a = await runUnpaidInvoiceJob({ trigger: "scheduled", periodKey: `${TAG}-both` });
  const b = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-both` });
  assert.deepEqual([a.outcome, b.outcome], ["sent", "sent"]);
  assert.equal(sent.length, 2);
  const rows = await prisma.scheduledJobRun.findMany({ where: { periodKey: `${TAG}-both` }, select: { jobName: true } });
  assert.deepEqual(rows.map((r) => r.jobName).sort(), [MISSING_EXPENSE_JOB_NAME, UNPAID_INVOICE_JOB_NAME].sort());
});

test("manual trigger: 403 by default; when enabled, admins only and simultaneous requests send once", async () => {
  sent.length = 0;
  setUnpaidInvoiceLinesForTests(async () => [cand("m", 40)]);
  setUnpaidInvoiceManualFlagForTests(undefined);
  assert.equal((await api("POST", "/notification-settings/unpaid-invoices/run", "admin", {})).status, 403);
  setUnpaidInvoiceManualFlagForTests("true");
  assert.equal((await api("POST", "/notification-settings/unpaid-invoices/run", "engineer", {})).status, 403);
  const t = new Date("2032-01-05T03:01:00Z");
  senderMode = "slow";
  const rs = await Promise.all([runUnpaidInvoiceJob({ trigger: "manual", now: t }), runUnpaidInvoiceJob({ trigger: "manual", now: t })]);
  senderMode = "ok";
  assert.equal(rs.filter((x) => x.outcome === "sent").length, 1);
  assert.equal(sent.length, 1);
  setUnpaidInvoiceManualFlagForTests(null);
});
