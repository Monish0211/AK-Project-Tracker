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
import { buildMissingExpenseReport, STALE_RUN_MS, weeklyPeriodKey, type CandidateProject } from "./missingExpense.rules.js";
import { buildUnpaidInvoiceReport, totalKnownOutstanding, zonedToday, type InvoiceLineCandidate } from "./unpaidInvoice.rules.js";
import { MAX_PAGE_SIZE, pageOf } from "./weeklyPaging.js";
import { runHistoryView } from "./services/weeklyJob.runner.js";
import {
  setMissingExpenseCandidatesForTests,
  setMissingExpenseEmailFlagForTests,
  setMissingExpenseSenderForTests,
} from "./services/missingExpense.service.js";
import {
  setUnpaidInvoiceEmailFlagForTests,
  setUnpaidInvoiceLinesForTests,
  setUnpaidInvoiceSenderForTests,
} from "./services/unpaidInvoice.service.js";

/**
 * Settings → Weekly Emails preview and run-history pages (Oct 2026): server-
 * side paging over the complete report, exact totals on every page, stable
 * order across pages, a hard page-size ceiling, strict query validation,
 * unchanged permissions, and no email ever sent by a preview. Report data
 * comes from the services' test seams (1,000+ rows, no database rows); run
 * history uses test-only job names so parallel test files cannot disturb it.
 * FAKE senders with delivery switched ON — a preview that sent would be seen.
 */

const TAG = `wp-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => {};
const tokens: Record<string, string> = {};
const userIds: string[] = [];
const sent: SendEmailOptions[] = [];

const ME = "/notification-settings/missing-expenses";
const UI = "/notification-settings/unpaid-invoices";

async function api(method: string, path: string, who: string | null) {
  const res = await fetch(`${url}${path}`, { method, headers: { "Content-Type": "application/json", ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) }, body: method === "POST" ? "{}" : undefined });
  const json = (await res.json().catch(() => ({}))) as { data?: any; message?: string };
  return { status: res.status, data: json.data, message: json.message };
}

// ── Synthetic 1,000+ row reports (deterministic) ────────────────────────────

const PROJECT_STATUSES = ["Active", "In Progress", "On Hold", "Completed", "KoM Completed", "Cancelled", "Not Started", "Data Request Shared"];
const candidates: CandidateProject[] = Array.from({ length: 2600 }, (_, i) => ({
  id: `p-${String((i * 7919) % 2600).padStart(5, "0")}`, // shuffled input order
  prNo: `PR-${10000 + ((i * 7919) % 2600)}`,
  client: `Client ${i % 37} <b>&</b>`,
  projectTitle: `Project ${i}`,
  projectManager: i % 5 === 0 ? null : `PM ${i % 9}`,
  projectStatus: PROJECT_STATUSES[i % PROJECT_STATUSES.length]!,
  nonManhourBudgetAmount: 0, // budget entered (as 0) for every synthetic project, so this fixture exercises paging and status rules, not the budget rule
  otherExpenseCount: i % 10 === 0 ? 3 : 0,
}));

function daysAgo(n: number): Date {
  return new Date(Date.parse(`${zonedToday(new Date(), env.APP_TIMEZONE)}T00:00:00Z`) - n * 86_400_000);
}
const LINE_STATUSES = ["Raised", "Raised", "PartiallyPaid", "Raised", "Paid", "Submitted"];
const lines: InvoiceLineCandidate[] = Array.from({ length: 1400 }, (_, i) => {
  const n = (i * 104729) % 1400;
  return {
    id: `l-${String(i).padStart(5, "0")}`,
    projectId: `p-${n % 600}`,
    prNo: `PR-${20000 + (n % 600)}`,
    client: `Client ${n % 23}`,
    projectTitle: `Project ${n % 600}`,
    projectManager: `PM ${n % 7}`,
    invoiceNo: `INV-${n % 1250}`, // ~150 invoices raised as two lines
    invoiceDate: daysAgo(n % 400),
    status: LINE_STATUSES[n % LINE_STATUSES.length]!,
    invoiceAmountINR: 1000 + (n % 97) * 123.45,
    currency: n % 11 === 0 ? "USD" : "INR",
    invoiceAmountOriginal: n % 11 === 0 ? 12 + (n % 97) : null,
  };
});

before(async () => {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  const fake = async (o: SendEmailOptions) => (sent.push(o), { success: true as const });
  setMissingExpenseSenderForTests(fake);
  setUnpaidInvoiceSenderForTests(fake);
  setMissingExpenseEmailFlagForTests("true");
  setUnpaidInvoiceEmailFlagForTests("true");
  setMissingExpenseCandidatesForTests(async () => candidates);
  setUnpaidInvoiceLinesForTests(async () => lines);

  const [settingsM, invoicesM, adminRole, pmoRole, engineerRole] = await Promise.all([
    prisma.module.findUniqueOrThrow({ where: { name: "Settings" } }),
    prisma.module.findUniqueOrThrow({ where: { name: "Invoices" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
    prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
  ]);
  const passwordHash = await hashPassword("WpTest@123");
  const mk = async (key: string, role: { id: string; name: string }, modules: string[]) => {
    const email = `${TAG}-${key}@example.com`;
    const u = await prisma.portalUser.create({ data: { fullName: `WP ${key}`, email, passwordHash, department: "PMO", roleId: role.id, forcePasswordChange: false, moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) } } });
    userIds.push(u.id);
    tokens[key] = signAccessToken({ sub: u.id, email, roleId: role.id, roleName: role.name });
  };
  await mk("admin", adminRole, [settingsM.id, invoicesM.id]);
  await mk("pmoNoInvoices", pmoRole, [settingsM.id]);
  await mk("pmoNoSettings", pmoRole, [invoicesM.id]);
  await mk("engineer", engineerRole, [settingsM.id, invoicesM.id]);
});

after(async () => {
  try {
    setMissingExpenseSenderForTests(null);
    setUnpaidInvoiceSenderForTests(null);
    setMissingExpenseEmailFlagForTests(null);
    setUnpaidInvoiceEmailFlagForTests(null);
    setMissingExpenseCandidatesForTests(null);
    setUnpaidInvoiceLinesForTests(null);
    await prisma.scheduledJobRun.deleteMany({ where: { jobName: { startsWith: TAG } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: userIds } } });
  } finally {
    await closeServer();
  }
});

async function walk(base: string, pageSize: number) {
  const first = await api("GET", `${base}/preview?page=1&pageSize=${pageSize}`, "admin");
  assert.equal(first.status, 200, first.message);
  const pages = [first.data];
  for (let p = 2; p <= first.data.totalPages; p++) {
    const r = await api("GET", `${base}/preview?page=${p}&pageSize=${pageSize}`, "admin");
    assert.equal(r.status, 200, r.message);
    pages.push(r.data);
  }
  return pages;
}

// ── Pure paging ─────────────────────────────────────────────────────────────

test("pageOf: exact slices, last partial page, past-the-end page is empty with the real total", () => {
  const xs = Array.from({ length: 53 }, (_, i) => i);
  assert.deepEqual(pageOf(xs, { page: 1, pageSize: 25 }).items, xs.slice(0, 25));
  assert.deepEqual(pageOf(xs, { page: 3, pageSize: 25 }), { items: [50, 51, 52], page: 3, pageSize: 25, total: 53, totalPages: 3 });
  assert.deepEqual(pageOf(xs, { page: 9, pageSize: 25 }), { items: [], page: 9, pageSize: 25, total: 53, totalPages: 3 });
  assert.deepEqual(pageOf([], { page: 1, pageSize: 25 }), { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 });
});

// ── Preview: Other Project Expenses ─────────────────────────────────────────

test("missing-expense preview: pages of 25/50/100 cover the whole report exactly once, in the email's order, with exact totals", async () => {
  const expected = buildMissingExpenseReport(candidates);
  assert.ok(expected.missing.length > 1000, `fixture is a 1,000+ row report (${expected.missing.length})`);
  for (const size of [25, 50, 100]) {
    const pages = await walk(ME, size);
    const ids = pages.flatMap((p) => p.items.map((x: { id: string }) => x.id));
    assert.deepEqual(ids, expected.missing.map((p) => p.id), `pageSize ${size}: no gaps, no duplicates, same order`);
    for (const p of pages) {
      assert.ok(p.items.length <= size);
      assert.deepEqual([p.eligibleCount, p.matchCount, p.total], [expected.eligibleCount, expected.missing.length, expected.missing.length], "totals cover the complete result on every page");
      assert.equal(p.totalPages, Math.ceil(expected.missing.length / size));
      assert.equal(p.timezone, env.APP_TIMEZONE);
      assert.match(p.generatedAtLabel, new RegExp(env.APP_TIMEZONE.replace("/", "\\/")));
      assert.equal("html" in p || "text" in p, false, "the paged preview never carries the email body");
    }
  }
  const row = (await api("GET", `${ME}/preview?page=1&pageSize=1`, "admin")).data.items[0];
  assert.deepEqual(Object.keys(row).sort(), ["client", "id", "prNo", "projectManager", "projectStatus", "projectTitle", "projectUrl"]);
  assert.equal(row.projectUrl, `${env.FRONTEND_URL.replace(/\/+$/, "")}/projects/edit/${row.id}?tab=expenses`);
});

// ── Preview: Invoices Unpaid 30+ Days ───────────────────────────────────────

test("unpaid-invoice preview: pages cover every overdue invoice once in the email's order; counts and outstanding are whole-report figures", async () => {
  const expected = buildUnpaidInvoiceReport(lines, new Date(), env.APP_TIMEZONE);
  assert.ok(expected.overdue.length > 1000, `fixture is a 1,000+ row report (${expected.overdue.length})`);
  const known = totalKnownOutstanding(expected.overdue);
  const partial = expected.overdue.filter((r) => r.status === "Partially Paid").length;
  const pages = await walk(UI, 100);
  const keys = pages.flatMap((p) => p.items.map((x: { projectId: string; invoiceNo: string }) => `${x.projectId}/${x.invoiceNo}`));
  assert.deepEqual(keys, expected.overdue.map((r) => `${r.projectId}/${r.invoiceNo}`));
  assert.equal(new Set(keys).size, keys.length, "no duplicates across page boundaries");
  for (const p of pages) {
    assert.deepEqual(
      [p.eligibleCount, p.matchCount, p.summary.knownOutstandingINR, p.summary.partiallyPaidCount, p.summary.overdueDays],
      [expected.eligibleCount, expected.overdue.length, known, partial, 30]
    );
  }
  // The per-row figures add up to the whole-report total (Partially Paid outstanding stays null = "Not recorded").
  const rows = pages.flatMap((p) => p.items);
  assert.equal(Math.round(rows.reduce((s: number, r: { outstandingINR: number | null }) => s + (r.outstandingINR ?? 0), 0) * 100) / 100, known);
  assert.ok(rows.filter((r: { status: string }) => r.status === "Partially Paid").every((r: { amountPaidINR: unknown; outstandingINR: unknown }) => r.amountPaidINR === null && r.outstandingINR === null));
  // Same page twice → identical rows (stable while data is unchanged).
  const a = await api("GET", `${UI}/preview?page=7&pageSize=50`, "admin");
  const b = await api("GET", `${UI}/preview?page=7&pageSize=50`, "admin");
  assert.deepEqual(a.data.items, b.data.items);
});

test("the email itself is unchanged: the full POST /preview still lists every row and the same totals", async () => {
  const expected = buildUnpaidInvoiceReport(lines, new Date(), env.APP_TIMEZONE);
  const full = await api("POST", `${UI}/preview`, "admin");
  assert.equal(full.status, 200);
  assert.equal(full.data.invoices.length, expected.overdue.length);
  assert.equal(full.data.knownOutstandingINR, totalKnownOutstanding(expected.overdue));
  assert.ok(full.data.html.includes(expected.overdue.at(-1)!.invoiceNo), "the email body lists the last row too");
  const fullMe = await api("POST", `${ME}/preview`, "admin");
  assert.equal(fullMe.data.projects.length, buildMissingExpenseReport(candidates).missing.length);
  // The email path and the paged preview apply the same status rules: same counts, no Not Started rows.
  const pageMe = (await api("GET", `${ME}/preview?page=1&pageSize=100`, "admin")).data;
  assert.deepEqual([pageMe.eligibleCount, pageMe.matchCount], [fullMe.data.eligibleCount, fullMe.data.missingCount]);
  const notStartedIds = new Set(candidates.filter((c) => c.projectStatus === "Not Started").map((c) => c.id));
  assert.ok(notStartedIds.size > 0);
  assert.equal(fullMe.data.projects.some((p: { id: string }) => notStartedIds.has(p.id)), false);
  assert.equal(candidates.filter((c) => c.projectStatus === "Data Request Shared" && c.otherExpenseCount === 0).every((c) => fullMe.data.projects.some((p: { id: string }) => p.id === c.id)), true, "intermediate statuses stay included");
  assert.ok(fullMe.data.html.includes("Excluded statuses: Not Started, On Hold, Completed, Cancelled."));
  // Invoice rows link to Edit Project → Invoices with the earliest line of that invoice highlighted.
  const inv = full.data.invoices[0];
  assert.equal(inv.projectUrl, `${env.FRONTEND_URL.replace(/\/+$/, "")}/projects/edit/${inv.projectId}?tab=invoices&invoiceLineId=${inv.invoiceLineId}`);
  const earliest = lines.filter((l) => l.projectId === inv.projectId && l.invoiceNo.trim().toUpperCase() === inv.invoiceNo.trim().toUpperCase()).sort((a, b) => a.invoiceDate.getTime() - b.invoiceDate.getTime())[0]!;
  assert.equal(inv.invoiceLineId, earliest.id);
});

test("previews never send: delivery is ON with a fake sender, yet nothing was sent after every preview call above", async () => {
  await api("GET", `${UI}/preview?page=1&pageSize=100`, "admin");
  await api("GET", `${ME}/preview?page=1&pageSize=100`, "admin");
  assert.equal(sent.length, 0);
  const page = (await api("GET", `${UI}/preview?page=1&pageSize=5`, "admin")).data;
  assert.equal(page.wouldSend, true, "the page reports what the weekly run WOULD do");
  assert.equal(page.emailEnabled, true);
  assert.ok(page.recipients.to);
});

// ── Validation ──────────────────────────────────────────────────────────────

test("validation: page size is capped at 100; page/pageSize must be positive integers; unknown parameters (e.g. sort) are rejected", async () => {
  assert.equal(MAX_PAGE_SIZE, 100);
  const ok = await api("GET", `${UI}/preview?page=1&pageSize=100`, "admin");
  assert.equal(ok.data.items.length, 100);
  for (const q of ["pageSize=101", "pageSize=1000000", "pageSize=0", "page=0", "page=-1", "page=1.5", "pageSize=abc", "page=1&page=2", "sort=prNo", "pageSize=25&order=desc"]) {
    for (const base of [ME, UI]) {
      const r = await api("GET", `${base}/preview?${q}`, "admin");
      assert.equal(r.status, 400, `${base}/preview?${q}`);
    }
    const runs = await api("GET", `${ME}/runs?${q}`, "admin");
    assert.equal(runs.status, 400, `runs?${q}`);
  }
  for (const q of ["status=BOGUS", "status=sent", "trigger=cron", "status="]) {
    assert.equal((await api("GET", `${UI}/runs?${q}`, "admin")).status, 400, q);
  }
  const defaults = await api("GET", `${ME}/preview`, "admin");
  assert.deepEqual([defaults.data.page, defaults.data.pageSize, defaults.data.items.length], [1, 25, 25]);
  const past = await api("GET", `${ME}/preview?page=9999&pageSize=25`, "admin");
  assert.equal(past.status, 200);
  assert.deepEqual([past.data.items.length, past.data.total > 0], [0, true]);
});

// ── Authorization ───────────────────────────────────────────────────────────

test("authorization: Settings module + Administrator/PMO Manager for everything; invoice preview also needs Invoices", async () => {
  for (const path of [`${ME}/preview`, `${UI}/preview`, `${ME}/runs`, `${UI}/runs`]) {
    assert.equal((await api("GET", path, null)).status, 401, path);
    assert.equal((await api("GET", path, "engineer")).status, 403, `engineer ${path}`);
    assert.equal((await api("GET", path, "pmoNoSettings")).status, 403, `no Settings module ${path}`);
  }
  assert.equal((await api("GET", `${UI}/preview`, "pmoNoInvoices")).status, 403, "invoice rows need the Invoices module");
  assert.equal((await api("GET", `${ME}/preview`, "pmoNoInvoices")).status, 200);
  assert.equal((await api("GET", `${UI}/runs`, "pmoNoInvoices")).status, 200, "run history holds counts and statuses only");
});

// ── Settings payload ────────────────────────────────────────────────────────

test("settings response carries only the latest run and a count — never the run list", async () => {
  for (const base of [ME, UI]) {
    const res = await api("GET", base, "admin");
    assert.equal(res.status, 200);
    assert.equal("recentRuns" in res.data, false, base);
    assert.ok("lastRun" in res.data && typeof res.data.totalRuns === "number", base);
  }
});

// ── Run history (test-only job names, so nothing else writes these rows) ────

test("run history: newest first, id breaks start-time ties, pages never overlap or skip, totals exact", async () => {
  const job = `${TAG}-hist`;
  const t0 = Date.now() - 10 * 86_400_000;
  const data = Array.from({ length: 237 }, (_, i) => {
    const startedAt = new Date(t0 + Math.floor(i / 3) * 60_000); // three runs share each start time
    return { jobName: job, periodKey: `k-${i}`, trigger: i % 4 === 0 ? "manual" : "scheduled", status: ["SENT", "NO_MISSING", "DISABLED", "FAILED"][i % 4]!, claimToken: "t", startedAt, updatedAt: startedAt };
  });
  await prisma.scheduledJobRun.createMany({ data });
  const all = await prisma.scheduledJobRun.findMany({ where: { jobName: job }, orderBy: [{ startedAt: "desc" }, { id: "desc" }], select: { id: true, startedAt: true } });

  for (const size of [25, 100]) {
    const seen: string[] = [];
    const first = await runHistoryView(job, { page: 1, pageSize: size }, new Date(), false);
    assert.deepEqual([first.total, first.totalPages], [237, Math.ceil(237 / size)]);
    for (let p = 1; p <= first.totalPages; p++) {
      const pg = await runHistoryView(job, { page: p, pageSize: size }, new Date(), false);
      assert.ok(pg.items.length <= size);
      seen.push(...pg.items.map((r) => r.id));
    }
    assert.deepEqual(seen, all.map((r) => r.id), `pageSize ${size}`);
  }
  const times = all.map((r) => r.startedAt.getTime());
  assert.ok(times.every((t, i) => i === 0 || t <= times[i - 1]!), "newest first");

  const failed = await runHistoryView(job, { page: 1, pageSize: 100, status: "FAILED" }, new Date(), false);
  assert.equal(failed.total, data.filter((d) => d.status === "FAILED").length);
  assert.ok(failed.items.every((r) => r.status === "FAILED"));
  const manual = await runHistoryView(job, { page: 1, pageSize: 100, trigger: "manual" }, new Date(), false);
  assert.equal(manual.total, data.filter((d) => d.trigger === "manual").length);
  const both = await runHistoryView(job, { page: 1, pageSize: 100, status: "SENT", trigger: "manual" }, new Date(), false);
  assert.equal(both.total, data.filter((d) => d.trigger === "manual" && d.status === "SENT").length);
});

test("run history: status filters match the DISPLAYED status (stale RUNNING = Interrupted, stale SENDING = Delivery unknown)", async () => {
  const job = `${TAG}-stale`;
  const now = new Date();
  const stale = new Date(now.getTime() - STALE_RUN_MS - 60_000);
  const fresh = new Date(now.getTime() - 60_000);
  await prisma.scheduledJobRun.createMany({
    data: [
      { jobName: job, periodKey: "running-fresh", trigger: "scheduled", status: "RUNNING", claimToken: "t", startedAt: fresh, updatedAt: fresh },
      { jobName: job, periodKey: "running-stale", trigger: "scheduled", status: "RUNNING", claimToken: "t", startedAt: stale, updatedAt: stale },
      { jobName: job, periodKey: "sending-fresh", trigger: "scheduled", status: "SENDING", claimToken: "t", startedAt: fresh, updatedAt: fresh },
      { jobName: job, periodKey: "sending-stale", trigger: "scheduled", status: "SENDING", claimToken: "t", startedAt: stale, updatedAt: stale },
      { jobName: job, periodKey: "unknown", trigger: "manual", status: "DELIVERY_UNKNOWN", claimToken: "t", startedAt: stale, updatedAt: stale },
    ],
  });
  const keys = async (status: string) => (await runHistoryView(job, { page: 1, pageSize: 100, status }, now, true)).items.map((r) => `${r.periodKey}:${r.status}`).sort();
  assert.deepEqual(await keys("RUNNING"), ["running-fresh:RUNNING"]);
  assert.deepEqual(await keys("INTERRUPTED"), ["running-stale:INTERRUPTED"]);
  assert.deepEqual(await keys("SENDING"), ["sending-fresh:SENDING"]);
  assert.deepEqual(await keys("DELIVERY_UNKNOWN"), ["sending-stale:DELIVERY_UNKNOWN", "unknown:DELIVERY_UNKNOWN"]);
  const unchanged = await prisma.scheduledJobRun.findMany({ where: { jobName: job }, select: { status: true } });
  assert.deepEqual(unchanged.map((r) => r.status).sort(), ["DELIVERY_UNKNOWN", "RUNNING", "RUNNING", "SENDING", "SENDING"], "the history view never writes");
});

test("retry is offered only for this week's scheduled FAILED / INTERRUPTED run, only when manual runs are enabled — never for delivery unknown", async () => {
  const now = new Date();
  const week = weeklyPeriodKey(now, env.APP_TIMEZONE);
  const stale = new Date(now.getTime() - STALE_RUN_MS - 60_000);
  const cases: [string, Record<string, unknown>, boolean][] = [
    ["failed-this-week", { periodKey: week, trigger: "scheduled", status: "FAILED" }, true],
    ["interrupted-this-week", { periodKey: week, trigger: "scheduled", status: "RUNNING", startedAt: stale, updatedAt: stale }, true],
    ["unknown-this-week", { periodKey: week, trigger: "scheduled", status: "DELIVERY_UNKNOWN" }, false],
    ["stale-sending-this-week", { periodKey: week, trigger: "scheduled", status: "SENDING", startedAt: stale, updatedAt: stale }, false],
    ["sent-this-week", { periodKey: week, trigger: "scheduled", status: "SENT" }, false],
    ["failed-old-week", { periodKey: "2020-W01", trigger: "scheduled", status: "FAILED" }, false],
    ["failed-manual", { periodKey: "manual:2026-10-20T05:10Z", trigger: "manual", status: "FAILED" }, false],
  ];
  for (const [name, row, want] of cases) {
    const job = `${TAG}-retry-${name}`;
    await prisma.scheduledJobRun.create({ data: { jobName: job, claimToken: "t", ...(row as { periodKey: string; trigger: string; status: string }) } });
    const enabled = (await runHistoryView(job, { page: 1, pageSize: 25 }, now, true)).items[0]!;
    const disabled = (await runHistoryView(job, { page: 1, pageSize: 25 }, now, false)).items[0]!;
    assert.equal(enabled.retryable, want, name);
    assert.equal(disabled.retryable, false, `${name} with manual runs disabled`);
  }
});
