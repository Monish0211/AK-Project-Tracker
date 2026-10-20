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
import { findCandidateProjects } from "./repository/missingExpense.repository.js";
import { buildMissingExpenseReport, MISSING_EXPENSE_JOB_NAME, MISSING_EXPENSE_SETTING_KEY, type CandidateProject } from "./missingExpense.rules.js";
import {
  runMissingExpenseJob,
  setMissingExpenseCandidatesForTests,
  setMissingExpenseEmailFlagForTests,
  setMissingExpenseManualFlagForTests,
  setMissingExpenseSenderForTests,
} from "./services/missingExpense.service.js";

/**
 * Weekly "Projects Missing Other Project Expenses" email (Oct 2026) through
 * the real database (scratch) and routes. A FAKE sender records every message
 * — nothing is ever delivered. Covers eligibility against real rows,
 * settings/permissions, the user picker, one consolidated email, duplicate
 * and concurrent runs, failure + safe retry, and interrupted sends.
 */

const TAG = `mx-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => {};
const tokens: Record<string, string> = {};
const userIds: string[] = [];
const userEmails: Record<string, string> = {};
const projectIds: Record<string, string> = {};
let savedSetting: { toEmail: string; cc: { email: string; emailNormalized: string; portalUserId: string | null }[] } | null = null;

const sent: SendEmailOptions[] = [];
let senderMode: "ok" | "fail" | "throw" | "slow" = "ok";

async function api(method: string, path: string, who: string | null, body?: unknown) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
}

function candidate(id: string, status: string, otherExpenseCount: number, extra: Partial<CandidateProject> = {}): CandidateProject {
  return { id, prNo: `PR-${TAG}-${id}`, client: "Client", projectTitle: "Title", projectManager: "PM", projectStatus: status, otherExpenseCount, ...extra };
}

before(async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  setMissingExpenseSenderForTests(async (options) => {
    sent.push(options);
    if (senderMode === "throw") throw new Error("simulated SMTP outage");
    if (senderMode === "fail") return { success: false, error: "simulated rejection" };
    if (senderMode === "slow") await new Promise((r) => setTimeout(r, 50));
    return { success: true };
  });
  setMissingExpenseEmailFlagForTests("true");

  // Preserve any existing settings row (scratch DB) and start from defaults.
  const existing = await prisma.notificationSetting.findUnique({ where: { key: MISSING_EXPENSE_SETTING_KEY }, include: { ccRecipients: true } });
  if (existing) {
    savedSetting = { toEmail: existing.toEmail, cc: existing.ccRecipients.map((c) => ({ email: c.email, emailNormalized: c.emailNormalized, portalUserId: c.portalUserId })) };
    await prisma.notificationSetting.delete({ where: { id: existing.id } });
  }

  const [settingsModule, projectsModule, adminRole, pmoRole, engineerRole, readOnlyRole] = await Promise.all([
    prisma.module.findUniqueOrThrow({ where: { name: "Settings" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Read Only" } }),
  ]);
  const passwordHash = await hashPassword("MxTest@123");
  const mk = async (key: string, role: { id: string; name: string }, modules: string[], isActive = true) => {
    const email = `${TAG}-${key}@example.com`;
    const u = await prisma.portalUser.create({
      data: { fullName: `MX ${key}`, email, passwordHash, department: "PMO", roleId: role.id, isActive, forcePasswordChange: false, moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) } },
    });
    userIds.push(u.id);
    userEmails[key] = email;
    tokens[key] = signAccessToken({ sub: u.id, email, roleId: role.id, roleName: role.name });
    return u.id;
  };
  await mk("admin", adminRole, [settingsModule.id, projectsModule.id]);
  await mk("pmo", pmoRole, [settingsModule.id]);
  await mk("engineer", engineerRole, [settingsModule.id, projectsModule.id]);
  await mk("readonly", readOnlyRole, [settingsModule.id]);
  await mk("adminNoSettings", adminRole, [projectsModule.id]);
  await mk("inactive", engineerRole, [], false);

  // Real projects for the eligibility query.
  const mkProject = async (key: string, projectStatus: string, extra: Record<string, unknown> = {}) => {
    const prNo = `PR-${TAG}-${key}`;
    const row = await prisma.project.create({
      data: {
        poMonth: "2026-10", prCategory: "India", prNo, rfqNo: "RFQ-MX", client: key === "xss" ? `<b>Evil</b> & "Co"` : "MX Client", department: "Process",
        domesticForeign: "Domestic", projectTitle: `MX ${key}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus,
        workOrderNumber: `${prNo}-WO`, workOrderDate: new Date("2026-01-01"), eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "PMO", ...extra,
      },
    });
    projectIds[key] = row.id;
    return row.id;
  };
  await mkProject("noExpense", "Active");
  await mkProject("kom", "KoM Completed");
  await mkProject("zeroValue", "Active");
  await prisma.projectExpense.create({ data: { projectId: projectIds.zeroValue!, category: "Travel", description: "zero", quantity: 0, unitCost: 0, totalCost: 0 } });
  await mkProject("manhourOnly", "Ongoing");
  await prisma.projectResource.create({ data: { projectId: projectIds.manhourOnly!, employeeNo: `${TAG}-E1`, hourlyRateSnapshot: 500, workingDays: 1, totalHours: 8, manhourCost: 4000 } });
  await mkProject("budgetOnly", "On-going", { manhourBudgetAmount: 100000, nonManhourBudgetAmount: 50000 });
  await mkProject("supersededOnly", "Active");
  await prisma.projectExpense.create({ data: { projectId: projectIds.supersededOnly!, category: "Travel", description: "old import", quantity: 1, unitCost: 10, totalCost: 10, isActive: false } });
  await mkProject("onHold", " on hold ");
  await mkProject("notStarted", "Not Started");
  await mkProject("notStartedVariant", " not-STARTED ");
  await mkProject("completed", "Completed");
  await mkProject("cancelled", "CANCELLED");
  await mkProject("archived", "Active", { isDeleted: true, deletedAt: new Date() });
  await mkProject("xss", "Active");
});

after(async () => {
  try {
    setMissingExpenseSenderForTests(null);
    setMissingExpenseEmailFlagForTests(null);
    setMissingExpenseManualFlagForTests(null);
    setMissingExpenseCandidatesForTests(null);
    await prisma.scheduledJobRun.deleteMany({ where: { jobName: MISSING_EXPENSE_JOB_NAME, OR: [{ periodKey: { startsWith: TAG } }, { trigger: "manual", startedAt: { gte: new Date(Date.now() - 3600_000) } }] } });
    await prisma.notificationSetting.deleteMany({ where: { key: MISSING_EXPENSE_SETTING_KEY } });
    if (savedSetting) {
      await prisma.notificationSetting.create({ data: { key: MISSING_EXPENSE_SETTING_KEY, toEmail: savedSetting.toEmail, ccRecipients: { create: savedSetting.cc } } });
    }
    const ids = Object.values(projectIds);
    await prisma.projectExpense.deleteMany({ where: { projectId: { in: ids } } });
    await prisma.projectResource.deleteMany({ where: { projectId: { in: ids } } });
    await prisma.project.deleteMany({ where: { id: { in: ids } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await closeServer();
  }
});

// ── Eligibility against real rows ───────────────────────────────────────────

test("eligibility (real DB): no-expense eligible projects are missing; a zero-value record, man-hours and Expense Budget are handled correctly", async () => {
  const candidates = await findCandidateProjects();
  const mine = candidates.filter((c) => c.prNo.startsWith(`PR-${TAG}-`));
  const byKey = (k: string) => mine.find((c) => c.id === projectIds[k]);
  assert.equal(byKey("archived"), undefined, "archived projects are not candidates");
  assert.equal(byKey("zeroValue")?.otherExpenseCount, 1, "a zero-value record still counts as a record");
  assert.equal(byKey("supersededOnly")?.otherExpenseCount, 0, "superseded (inactive) imported rows do not count");

  const report = buildMissingExpenseReport(mine);
  const missingKeys = Object.entries(projectIds).filter(([, id]) => report.missing.some((m) => m.id === id)).map(([k]) => k).sort();
  assert.deepEqual(missingKeys, ["budgetOnly", "kom", "manhourOnly", "noExpense", "supersededOnly", "xss"]);
  // Eligible = all non-archived tagged projects minus Not Started / On Hold / Completed / Cancelled.
  assert.equal(report.eligibleCount, 7);
  assert.ok(byKey("notStarted") && byKey("notStartedVariant"), "Not Started projects are fetched, then excluded by the rules");
  assert.equal(report.missing.some((m) => m.id === projectIds.notStarted || m.id === projectIds.notStartedVariant), false);
});

// ── Settings and permissions ────────────────────────────────────────────────

test("settings: defaults shown until saved; only Administrator/PMO Manager with Settings module can read", async () => {
  const res = await api("GET", "/notification-settings/missing-expenses", "admin");
  assert.equal(res.status, 200);
  assert.equal(res.data.recipients.isDefault, true);
  assert.equal(res.data.recipients.toEmail, "info@ifluids.com");
  assert.deepEqual(res.data.recipients.cc.map((c: { email: string }) => c.email.toLowerCase()), ["sivagnanam@ifluids.com", "monish.n@ifluids.com"]);
  assert.deepEqual(res.data.recipients.unresolvedDefaults, ["Suresh"]);
  assert.equal(res.data.schedule.timezone, env.APP_TIMEZONE);
  assert.equal(JSON.stringify(res.data).toLowerCase().includes("smtp_pass"), false, "no secrets exposed");

  assert.equal((await api("GET", "/notification-settings/missing-expenses", "pmo")).status, 200);
  assert.equal((await api("GET", "/notification-settings/missing-expenses", "engineer")).status, 403);
  assert.equal((await api("GET", "/notification-settings/missing-expenses", "readonly")).status, 403);
  assert.equal((await api("GET", "/notification-settings/missing-expenses", "adminNoSettings")).status, 403);
  assert.equal((await api("GET", "/notification-settings/missing-expenses", null)).status, 401);
});

test("user picker: real active PMO users with stored emails; restricted to administrators", async () => {
  const res = await api("GET", "/notification-settings/missing-expenses/user-options", "admin");
  assert.equal(res.status, 200);
  const emails: string[] = res.data.items.map((u: { email: string }) => u.email);
  assert.ok(emails.includes(userEmails.engineer!), "a real user is offered");
  assert.ok(!emails.includes(userEmails.inactive!), "inactive users are not offered");
  assert.equal((await api("GET", "/notification-settings/missing-expenses/user-options", "engineer")).status, 403);
  assert.equal((await api("GET", "/notification-settings/missing-expenses/user-options", null)).status, 401);
});

test("settings save: validation, duplicates, user-linked CC uses the stored email; unauthorized users cannot edit", async () => {
  const engineer = (await prisma.portalUser.findUniqueOrThrow({ where: { email: userEmails.engineer! } })).id;
  const inactive = (await prisma.portalUser.findUniqueOrThrow({ where: { email: userEmails.inactive! } })).id;

  for (const [body, re] of [
    [{ toEmail: "not-an-email", cc: [] }, /not a valid email/],
    [{ toEmail: "accounts@example.com", cc: [{ email: "bad@" }] }, /not a valid email/],
    [{ toEmail: "accounts@example.com", cc: [{ email: "x@example.com" }, { email: "X@Example.com" }] }, /more than once/],
    [{ toEmail: "accounts@example.com", cc: [{ email: "ACCOUNTS@example.com" }] }, /more than once/],
    [{ toEmail: "accounts@example.com", cc: [{ portalUserId: inactive }] }, /inactive/],
  ] as const) {
    const r = await api("PUT", "/notification-settings/missing-expenses", "admin", body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.message ?? "", re);
  }

  assert.equal((await api("PUT", "/notification-settings/missing-expenses", "engineer", { toEmail: "a@example.com", cc: [] })).status, 403);
  assert.equal((await api("PUT", "/notification-settings/missing-expenses", "readonly", { toEmail: "a@example.com", cc: [] })).status, 403);

  const ok = await api("PUT", "/notification-settings/missing-expenses", "admin", {
    toEmail: " accounts@example.com ",
    cc: [{ portalUserId: engineer, email: "spoofed@evil.example" }, { email: "outside@example.com" }],
  });
  assert.equal(ok.status, 200, ok.message);
  assert.equal(ok.data.isDefault, false);
  assert.equal(ok.data.toEmail, "accounts@example.com");
  assert.deepEqual(ok.data.cc.map((c: { email: string }) => c.email), [userEmails.engineer, "outside@example.com"], "client-sent email ignored for a picked user");
  const reread = await api("GET", "/notification-settings/missing-expenses", "pmo");
  assert.equal(reread.data.recipients.toEmail, "accounts@example.com");
  assert.equal(reread.data.recipients.cc.length, 2);
});

// ── The job ─────────────────────────────────────────────────────────────────

test("job: zero missing projects → no email, recorded as NO_MISSING", async () => {
  sent.length = 0;
  setMissingExpenseCandidatesForTests(async () => [candidate("a", "Active", 2), candidate("b", "Completed", 0)]);
  const r = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-zero` });
  assert.equal(r.outcome, "no_missing");
  assert.equal(sent.length, 0);
  const row = await prisma.scheduledJobRun.findUniqueOrThrow({ where: { jobName_periodKey: { jobName: MISSING_EXPENSE_JOB_NAME, periodKey: `${TAG}-zero` } } });
  assert.deepEqual([row.status, row.eligibleCount, row.missingCount], ["NO_MISSING", 1, 0]);
});

test("job: missing projects → ONE consolidated email to the configured To + CC, links from FRONTEND_URL, escaped HTML", async () => {
  sent.length = 0;
  setMissingExpenseCandidatesForTests(async () => [
    candidate("m1", "Active", 0, { client: `<img src=x onerror=alert(1)>` }),
    candidate("m2", "KoM Completed", 0),
    candidate("h1", "On Hold", 0),
    candidate("n1", "Not Started", 0),
    candidate("e1", "Active", 4),
  ]);
  const r = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-send` });
  assert.equal(r.outcome, "sent");
  assert.equal(sent.length, 1, "one email per run, not one per project");
  const msg = sent[0]!;
  assert.equal(msg.to, "accounts@example.com");
  assert.deepEqual(msg.cc, [userEmails.engineer, "outside@example.com"]);
  assert.equal(msg.subject, "Weekly Report — Projects Missing Other Project Expenses");
  const base = env.FRONTEND_URL.replace(/\/+$/, "");
  // "Open" = Edit Project → Other Project Expenses, by project id.
  assert.ok(msg.html.includes(`href="${base}/projects/edit/m1?tab=expenses"`) && msg.html.includes(`${base}/projects/edit/m2?tab=expenses`));
  assert.ok(msg.text?.includes(`${base}/projects/edit/m1?tab=expenses`));
  assert.ok(!msg.html.includes("/projects/view/"));
  assert.ok(!msg.html.includes("PR-" + TAG + "-n1"), "Not Started not listed");
  assert.ok(msg.html.includes("Excluded statuses: Not Started, On Hold, Completed, Cancelled.") && msg.text?.includes("Excluded statuses: Not Started, On Hold, Completed, Cancelled."));
  assert.ok(!msg.html.includes("<img src=x"), "client value escaped");
  assert.ok(!msg.html.includes("PR-" + TAG + "-h1"), "excluded status not listed");
  assert.ok(msg.text?.includes("Eligible projects checked: 3"));
});

test("job: email disabled → check recorded as DISABLED, nothing sent", async () => {
  sent.length = 0;
  setMissingExpenseEmailFlagForTests(undefined); // unset → false
  setMissingExpenseCandidatesForTests(async () => [candidate("d1", "Active", 0)]);
  const r = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-disabled` });
  assert.equal(r.outcome, "disabled");
  assert.equal(sent.length, 0);
  setMissingExpenseEmailFlagForTests("true");
});

test("job: a repeated run for the same week does not send again; concurrent runs send exactly once", async () => {
  sent.length = 0;
  setMissingExpenseCandidatesForTests(async () => [candidate("r1", "Active", 0)]);
  const first = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-dup` });
  const second = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-dup` });
  assert.equal(first.outcome, "sent");
  assert.deepEqual([second.outcome, second.outcome === "skipped" ? second.reason : null], ["skipped", "already_completed"]);
  assert.equal(sent.length, 1);

  sent.length = 0;
  senderMode = "slow";
  const results = await Promise.all(Array.from({ length: 6 }, () => runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-race` })));
  senderMode = "ok";
  assert.equal(sent.length, 1, "six concurrent ticks → one email");
  assert.equal(results.filter((x) => x.outcome === "sent").length, 1);
  assert.ok(results.filter((x) => x.outcome !== "sent").every((x) => x.outcome === "skipped"));
});

test("job: mail failure is recorded accurately and can be retried safely; a thrown send counts as a failure", async () => {
  sent.length = 0;
  setMissingExpenseCandidatesForTests(async () => [candidate("f1", "Active", 0)]);
  senderMode = "fail";
  const failed = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-fail` });
  assert.deepEqual([failed.outcome, failed.outcome === "failed" ? failed.error : null], ["failed", "simulated rejection"]);
  let row = await prisma.scheduledJobRun.findUniqueOrThrow({ where: { jobName_periodKey: { jobName: MISSING_EXPENSE_JOB_NAME, periodKey: `${TAG}-fail` } } });
  assert.deepEqual([row.status, row.error, row.attempts], ["FAILED", "simulated rejection", 1]);

  senderMode = "ok";
  const retried = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-fail` });
  assert.equal(retried.outcome, "sent");
  row = await prisma.scheduledJobRun.findUniqueOrThrow({ where: { id: row.id } });
  assert.deepEqual([row.status, row.attempts, row.error], ["SENT", 2, null]);
  assert.equal((await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-fail` })).outcome, "skipped");
  assert.equal(sent.length, 2, "one failed attempt + one successful retry, no third send");

  senderMode = "throw";
  const thrown = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-throw` });
  senderMode = "ok";
  assert.deepEqual([thrown.outcome, thrown.outcome === "failed" ? thrown.error : null], ["failed", "simulated SMTP outage"]);
});

test("job: an abandoned RUNNING claim is taken over; an interrupted SENDING run is never re-sent", async () => {
  sent.length = 0;
  setMissingExpenseCandidatesForTests(async () => [candidate("s1", "Active", 0)]);
  const old = new Date(Date.now() - 2 * 3600_000);
  await prisma.scheduledJobRun.create({ data: { jobName: MISSING_EXPENSE_JOB_NAME, periodKey: `${TAG}-stale`, trigger: "scheduled", status: "RUNNING", claimToken: "dead", startedAt: old } });
  assert.equal((await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-stale` })).outcome, "sent");

  await prisma.scheduledJobRun.create({ data: { jobName: MISSING_EXPENSE_JOB_NAME, periodKey: `${TAG}-fresh`, trigger: "scheduled", status: "RUNNING", claimToken: "live" } });
  const busy = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-fresh` });
  assert.deepEqual([busy.outcome, busy.outcome === "skipped" ? busy.reason : null], ["skipped", "in_progress"]);

  const sending = await prisma.scheduledJobRun.create({ data: { jobName: MISSING_EXPENSE_JOB_NAME, periodKey: `${TAG}-sending`, trigger: "scheduled", status: "SENDING", claimToken: "dead" } });
  await prisma.$executeRaw`UPDATE "ScheduledJobRun" SET "updatedAt" = ${old} WHERE id = ${sending.id}`;
  const unknown = await runMissingExpenseJob({ trigger: "scheduled", periodKey: `${TAG}-sending` });
  assert.deepEqual([unknown.outcome, unknown.outcome === "skipped" ? unknown.reason : null], ["skipped", "delivery_unknown"]);
  assert.equal((await prisma.scheduledJobRun.findUniqueOrThrow({ where: { id: sending.id } })).status, "DELIVERY_UNKNOWN");
  assert.equal(sent.length, 1, "only the stale-RUNNING takeover sent");
});

test("manual trigger: disabled by default (403); enabled → admin can run, others cannot; preview never sends", async () => {
  sent.length = 0;
  setMissingExpenseCandidatesForTests(async () => [candidate("u1", "Active", 0)]);
  setMissingExpenseManualFlagForTests(undefined);
  assert.equal((await api("POST", "/notification-settings/missing-expenses/run", "admin", {})).status, 403);

  setMissingExpenseManualFlagForTests("true");
  assert.equal((await api("POST", "/notification-settings/missing-expenses/run", "engineer", {})).status, 403);
  assert.equal((await api("POST", "/notification-settings/missing-expenses/run", "readonly", {})).status, 403);
  assert.equal((await api("POST", "/notification-settings/missing-expenses/run", null, {})).status, 401);

  const preview = await api("POST", "/notification-settings/missing-expenses/preview", "admin", {});
  assert.equal(preview.status, 200);
  assert.equal(preview.data.missingCount, 1);
  assert.equal(sent.length, 0, "preview never sends");
  assert.equal((await api("POST", "/notification-settings/missing-expenses/preview", "engineer", {})).status, 403);

  const run = await api("POST", "/notification-settings/missing-expenses/run", "admin", { mode: "manual" });
  assert.equal(run.status, 200);
  assert.equal(run.data.outcome, "sent");
  assert.equal(sent.length, 1);
  setMissingExpenseManualFlagForTests(null);
});

test("audit: concurrent and repeated manual runs in the same window send ONE email; a failed manual run can be retried", async () => {
  // Pinned clock inside one 10-minute window that no other test uses.
  const t = new Date("2031-03-03T03:01:00.000Z");
  const key = "manual:2031-03-03T03:00Z";
  sent.length = 0;
  setMissingExpenseCandidatesForTests(async () => [candidate("mr1", "Active", 0)]);
  senderMode = "slow";
  const results = await Promise.all([runMissingExpenseJob({ trigger: "manual", now: t }), runMissingExpenseJob({ trigger: "manual", now: t }), runMissingExpenseJob({ trigger: "manual", now: t })]);
  senderMode = "ok";
  assert.equal(sent.length, 1, "three simultaneous Run now requests → one email");
  assert.equal(results.filter((r) => r.outcome === "sent").length, 1);
  const again = await runMissingExpenseJob({ trigger: "manual", now: new Date(t.getTime() + 5 * 60_000) });
  assert.deepEqual([again.outcome, again.outcome === "skipped" ? again.reason : null], ["skipped", "already_completed"]);
  assert.equal(sent.length, 1);

  // A failed manual run in a fresh window is retried (FAILED is reclaimable) without a duplicate.
  const t2 = new Date("2031-03-03T03:11:00.000Z");
  senderMode = "fail";
  assert.equal((await runMissingExpenseJob({ trigger: "manual", now: t2 })).outcome, "failed");
  senderMode = "ok";
  assert.equal((await runMissingExpenseJob({ trigger: "manual", now: t2 })).outcome, "sent");
  assert.equal(sent.length, 3, "1 (first window) + failed attempt + successful retry");
  await prisma.scheduledJobRun.deleteMany({ where: { jobName: MISSING_EXPENSE_JOB_NAME, periodKey: { in: [key, "manual:2031-03-03T03:10Z"] } } });
});

test("audit: Settings shows a stale SENDING run as delivery unknown (read-only — the row is not modified)", async () => {
  const old = new Date(Date.now() - 2 * 3600_000);
  const row = await prisma.scheduledJobRun.create({ data: { jobName: MISSING_EXPENSE_JOB_NAME, periodKey: `${TAG}-view-sending`, trigger: "scheduled", status: "SENDING", claimToken: "dead", startedAt: new Date(Date.now() + 60_000) } });
  await prisma.$executeRaw`UPDATE "ScheduledJobRun" SET "updatedAt" = ${old} WHERE id = ${row.id}`;
  const res = await api("GET", "/notification-settings/missing-expenses", "admin");
  assert.equal(res.data.lastRun?.periodKey, `${TAG}-view-sending`, "the newest run is the card's last run");
  assert.equal(res.data.lastRun?.status, "DELIVERY_UNKNOWN");
  assert.equal(res.data.lastRun?.retryable, false, "delivery unknown is never offered for retry");
  const history = await api("GET", "/notification-settings/missing-expenses/runs?status=DELIVERY_UNKNOWN&pageSize=100", "admin");
  const shown = history.data.items.find((r: { periodKey: string }) => r.periodKey === `${TAG}-view-sending`);
  assert.equal(shown?.status, "DELIVERY_UNKNOWN", "the status filter matches what the row displays");
  assert.equal((await prisma.scheduledJobRun.findUniqueOrThrow({ where: { id: row.id } })).status, "SENDING", "view never writes");
});
