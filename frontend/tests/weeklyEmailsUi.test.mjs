// Settings → Weekly Emails layout (Oct 2026): the Settings cards are compact
// (no run tables, no preview rows) and link to the dedicated, server-paged
// Preview Report and View All Runs pages. Components are rendered server-side
// (no browser, no requests — the card's `initial` seam supplies its data).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
let React;
let renderToStaticMarkup;
let MemoryRouter;
let matchPath;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  load = (p) => vite.ssrLoadModule(p);
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
  ({ MemoryRouter, matchPath } = await import("react-router-dom"));
});
after(() => vite?.close());

const h = (...a) => React.createElement(...a);

function settings(over = {}) {
  return {
    recipients: { toEmail: "info@ifluids.com", cc: [{ email: "monish.n@ifluids.com", portalUserId: "u1", userName: "Monish", userActive: true }], isDefault: false, unresolvedDefaults: [], updatedAt: null, updatedBy: null },
    emailEnabled: false,
    manualTriggerEnabled: false,
    schedule: { cron: "0 11 * * 1", timezone: "Asia/Kolkata" },
    lastRun: { id: "r1", periodKey: "2026-W43", trigger: "scheduled", status: "SENT", attempts: 1, eligibleCount: 40, missingCount: 3, recipientCount: 4, error: null, startedAt: "2026-10-19T05:30:00.000Z", finishedAt: "2026-10-19T05:30:05.000Z", retryable: false },
    totalRuns: 5000,
    ...over,
  };
}

/** The card's status line + link row (the rest of the card is the recipient form). */
async function renderCard(slug, over) {
  const { WeeklyEmailCardStatus, WeeklyEmailCardLinks } = await load("/src/pages/Settings/components/weeklyEmails/WeeklyEmailsSection.tsx");
  const { findWeeklyEmailNotification } = await load("/src/pages/Settings/components/weeklyEmails/weeklyEmailNotifications.ts");
  const config = findWeeklyEmailNotification(slug);
  const s = settings(over);
  return renderToStaticMarkup(h(MemoryRouter, null, h(WeeklyEmailCardStatus, { config, settings: s }), h(WeeklyEmailCardLinks, { config, settings: s, running: false, onRunNow() {} })));
}

const cardSource = () => readFileSync(fileURLToPath(new URL("../src/pages/Settings/components/weeklyEmails/WeeklyEmailsSection.tsx", import.meta.url)), "utf8");

const links = (html) =>
  [...html.matchAll(/<a [^>]*>/g)].map((m) => `${m[0].match(/data-link="(\w+)"/)?.[1]} ${m[0].match(/href="([^"]+)"/)?.[1]}`);

test("Settings cards render no run table and no preview rows — only the last-run line", async () => {
  for (const slug of ["other-expenses", "unpaid-invoices"]) {
    const html = await renderCard(slug);
    assert.equal(/<table/.test(html), false, `${slug}: no table on the Settings card`);
    assert.equal(/Recent runs/i.test(html), false);
    assert.match(html, /Last run:/);
    assert.match(html, /Sent/);
    assert.match(html, /Every Monday at 11:00 \(Asia\/Kolkata\)/);
    assert.match(html, /View All Runs \(5,000\)/, "the run count, not the runs");
  }
  // The whole card module: no table markup, no run list, no preview rows, no full-report call.
  const src = cardSource();
  assert.equal(/<table/.test(src), false);
  assert.equal(/recentRuns|\.runs\(|\.preview\(|previewPage/.test(src), false);
  assert.match(src, /<WeeklyEmailCardStatus config=\{config\} settings=\{settings\} \/>/);
  assert.match(src, /<WeeklyEmailCardLinks /);
  assert.match(await renderCard("other-expenses", { lastRun: null, totalRuns: 0 }), /No runs yet/);
});

test("each card links to its own Preview Report and View All Runs pages", async () => {
  assert.deepEqual(links(await renderCard("other-expenses")), ["preview /settings/weekly-emails/other-expenses/preview", "runs /settings/weekly-emails/other-expenses/runs"]);
  assert.deepEqual(links(await renderCard("unpaid-invoices")), ["preview /settings/weekly-emails/unpaid-invoices/preview", "runs /settings/weekly-emails/unpaid-invoices/runs"]);
});

test("Run now appears only when the server allows manual runs; a retryable week is pointed to the runs page", async () => {
  assert.equal(/Run now/.test(await renderCard("unpaid-invoices")), false);
  assert.match(await renderCard("unpaid-invoices", { manualTriggerEnabled: true }), /Run now/);
  const retry = await renderCard("other-expenses", { manualTriggerEnabled: true, lastRun: { ...settings().lastRun, status: "FAILED", retryable: true } });
  assert.match(retry, /Open View All Runs to retry it/);
  assert.equal(/Retry this week/.test(retry), false, "the retry itself lives on the runs page");
});

test("the routes the cards link to exist in MainLayout (lazy-loaded, behind the Settings module)", async () => {
  const { weeklyEmailPreviewPath, weeklyEmailRunsPath, WEEKLY_EMAIL_NOTIFICATIONS, findWeeklyEmailNotification } = await load("/src/pages/Settings/components/weeklyEmails/weeklyEmailNotifications.ts");
  const layout = readFileSync(fileURLToPath(new URL("../src/layouts/MainLayout.tsx", import.meta.url)), "utf8");
  for (const n of WEEKLY_EMAIL_NOTIFICATIONS) {
    assert.ok(matchPath("/settings/weekly-emails/:notification/preview", weeklyEmailPreviewPath(n.slug)));
    assert.ok(matchPath("/settings/weekly-emails/:notification/runs", weeklyEmailRunsPath(n.slug)));
    assert.equal(findWeeklyEmailNotification(n.slug), n);
  }
  assert.match(layout, /path="\/settings\/weekly-emails\/:notification\/preview"\s+element=\{<ModuleRoute module="Settings"><Suspense/);
  assert.match(layout, /path="\/settings\/weekly-emails\/:notification\/runs"\s+element=\{<ModuleRoute module="Settings"><Suspense/);
  assert.match(layout, /lazy\(\(\) => import\("\.\.\/pages\/Settings\/WeeklyEmails\/WeeklyEmailPreviewPage"\)\)/);
  assert.equal(findWeeklyEmailNotification("nope"), null);
  assert.equal(findWeeklyEmailNotification("unpaid-invoices").previewModule, "Invoices");
});

test("pagination bar: range text, page-size options 25/50/100, first/previous disabled on page 1, next/last disabled on the last page", async () => {
  const { PaginationBar } = await load("/src/pages/Settings/components/weeklyEmails/WeeklyEmailPaging.tsx");
  const bar = (info) => renderToStaticMarkup(h(PaginationBar, { info, noun: "invoice(s)", onPage() {}, onPageSize() {} }));
  const first = bar({ page: 1, pageSize: 25, total: 1144, totalPages: 46 });
  assert.match(first, /Showing 1–25 of 1,144 invoice\(s\)/);
  assert.match(first, /Page 1 of 46/);
  assert.deepEqual([...first.matchAll(/<option value="(\d+)"/g)].map((m) => m[1]), ["25", "50", "100"]);
  assert.match(first, /aria-label="Previous page" disabled=""/);
  assert.equal(/aria-label="Next page" disabled=""/.test(first), false);
  const lastPage = bar({ page: 46, pageSize: 25, total: 1144, totalPages: 46 });
  assert.match(lastPage, /Showing 1,126–1,144 of 1,144/);
  assert.match(lastPage, /aria-label="Next page" disabled=""/);
  assert.match(bar({ page: 1, pageSize: 25, total: 0, totalPages: 1 }), /No invoice\(s\)/);
});

test("preview tables: one row per item, Not recorded for Partially Paid, the email's date format, PR links", async () => {
  const { UnpaidInvoicePreviewTable, MissingExpensePreviewTable } = await load("/src/pages/Settings/components/weeklyEmails/WeeklyEmailTables.tsx");
  const row = (i, partial) => ({ projectId: `p${i}`, prNo: `PR-${i}`, client: "<b>Acme</b>", projectTitle: "T", projectManager: null, invoiceNo: `INV-${i}`, invoiceDate: "2026-09-01", daysSinceRaised: 49, invoiceAmountINR: 125000, amountPaidINR: partial ? null : 0, outstandingINR: partial ? null : 125000, status: partial ? "Partially Paid" : "Raised / Submitted", originalAmountNote: partial ? "USD 1,500.00" : null, projectUrl: `http://x/projects/view/p${i}` });
  const html = renderToStaticMarkup(h(UnpaidInvoicePreviewTable, { rows: [row(1, false), row(2, true)] }));
  assert.equal((html.match(/<tr /g) ?? []).length, 2, "exactly the given page of rows");
  assert.equal((html.match(/Not recorded/g) ?? []).length, 2);
  assert.match(html, /01 Sep 2026/);
  assert.match(html, /USD 1,500\.00/);
  assert.match(html, /&lt;b&gt;Acme&lt;\/b&gt;/, "user text is escaped");
  assert.match(html, /href="http:\/\/x\/projects\/view\/p1"/);
  const me = renderToStaticMarkup(h(MissingExpensePreviewTable, { rows: [{ id: "a", prNo: "PR-9", client: "C", projectTitle: "T", projectManager: null, projectStatus: "Active", projectUrl: "http://x/projects/view/a" }] }));
  assert.equal((me.match(/<tr /g) ?? []).length, 1);
});

test("preview summary shows whole-report totals and says a preview never sends", async () => {
  const { PreviewSummary } = await load("/src/pages/Settings/components/weeklyEmails/WeeklyEmailTables.tsx");
  const { findWeeklyEmailNotification } = await load("/src/pages/Settings/components/weeklyEmails/weeklyEmailNotifications.ts");
  const data = { generatedAt: "", generatedAtLabel: "20 Oct 2026, 10:41 IST (Asia/Kolkata)", timezone: "Asia/Kolkata", eligibleCount: 1350, matchCount: 1144, summary: { overdueDays: 30, knownOutstandingINR: 98765.4, partiallyPaidCount: 120 }, page: 3, pageSize: 25, total: 1144, totalPages: 46, items: [], recipients: { to: "info@ifluids.com", cc: ["a@x.com"] }, emailEnabled: false, wouldSend: false };
  const html = renderToStaticMarkup(h(PreviewSummary, { config: findWeeklyEmailNotification("unpaid-invoices"), data }));
  assert.match(html, /20 Oct 2026, 10:41 IST \(Asia\/Kolkata\)/);
  assert.match(html, /1,350/);
  assert.match(html, /1,144/);
  assert.match(html, /₹ 98,765\.40/);
  assert.match(html, />120</);
  assert.match(html, /Opening this preview never sends an email/);
  assert.match(html, /delivery is off/);
  assert.match(renderToStaticMarkup(h(PreviewSummary, { config: findWeeklyEmailNotification("unpaid-invoices"), data: { ...data, wouldSend: true } })), /would email info@ifluids\.com \+ 1 CC/);
});

test("run history table: every backend status has its own label; Retry only on rows the backend marked retryable", async () => {
  const { RunsTable } = await load("/src/pages/Settings/components/weeklyEmails/WeeklyEmailTables.tsx");
  const statuses = ["SENT", "NO_MISSING", "DISABLED", "FAILED", "INTERRUPTED", "DELIVERY_UNKNOWN", "RUNNING", "SENDING"];
  const runs = statuses.map((status, i) => ({ id: `r${i}`, periodKey: "2026-W43", trigger: i % 2 ? "manual" : "scheduled", status, attempts: 1, eligibleCount: 10, missingCount: 2, recipientCount: status === "SENT" ? 4 : null, error: status === "FAILED" ? "<smtp> refused" : null, startedAt: "2026-10-19T05:30:00.000Z", finishedAt: null, retryable: status === "FAILED" }));
  const html = renderToStaticMarkup(h(RunsTable, { runs, matchLabel: "Unpaid for 30+ days", onRetry() {} }));
  for (const label of ["Sent", "Checked — no email needed", "Delivery disabled", "Failed", "Interrupted", "Delivery unknown", "Running", "Sending"]) assert.ok(html.includes(`>${label}<`), label);
  assert.equal((html.match(/data-action="retry"/g) ?? []).length, 1, "only the retryable FAILED row");
  assert.match(html, /never re-sent automatically/);
  assert.match(html, /Delivered to 4 recipients/);
  assert.match(html, /&lt;smtp&gt; refused/, "error text is escaped");
  assert.match(html, />Manual</);
  assert.match(html, />Weekly 2026-W43</);
  const noRetry = renderToStaticMarkup(h(RunsTable, { runs: runs.map((r) => ({ ...r, retryable: false })), matchLabel: "x", onRetry() {} }));
  assert.equal(/data-action="retry"/.test(noRetry), false);
});

test("loading, empty and error states (with Try again) render distinctly", async () => {
  const { StateMessage } = await load("/src/pages/Settings/components/weeklyEmails/WeeklyEmailPaging.tsx");
  const loading = renderToStaticMarkup(h(StateMessage, { kind: "loading", title: "Loading run history…" }));
  const empty = renderToStaticMarkup(h(StateMessage, { kind: "empty", title: "No runs yet." }));
  const error = renderToStaticMarkup(h(StateMessage, { kind: "error", title: "Couldn't load", detail: "Network error", onRetry() {} }));
  assert.match(loading, /data-state="loading"/);
  assert.match(empty, /data-state="empty"/);
  assert.match(error, /data-state="error"/);
  assert.match(error, /Try again/);
  assert.equal(/Try again/.test(empty), false);
});

test("API: paged preview and run history ask the server for one page; empty filters are omitted", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { missingExpenseEmailApi, unpaidInvoiceEmailApi, pageQuery, MAX_PAGE_SIZE } = await load("/src/services/weeklyEmailService.ts");
  const calls = [];
  const orig = apiClient.get;
  apiClient.get = async (path) => (calls.push(path), { items: [] });
  try {
    await unpaidInvoiceEmailApi.previewPage(3, 50);
    await missingExpenseEmailApi.previewPage(1, 25);
    await unpaidInvoiceEmailApi.runs(2, 100, { status: "DELIVERY_UNKNOWN", trigger: "" });
    await missingExpenseEmailApi.runs(1, 25);
  } finally {
    apiClient.get = orig;
  }
  assert.deepEqual(calls, [
    "/notification-settings/unpaid-invoices/preview?page=3&pageSize=50",
    "/notification-settings/missing-expenses/preview?page=1&pageSize=25",
    "/notification-settings/unpaid-invoices/runs?page=2&pageSize=100&status=DELIVERY_UNKNOWN",
    "/notification-settings/missing-expenses/runs?page=1&pageSize=25",
  ]);
  assert.equal(pageQuery(1, 25, { status: "", trigger: "manual" }), "?page=1&pageSize=25&trigger=manual");
  assert.equal(MAX_PAGE_SIZE, 100);
});

test("both cards share ONE user-picker request while it is in flight, and nothing is cached after it settles", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { loadSharedUserOptions } = await load("/src/services/weeklyEmailService.ts");
  let calls = 0;
  const orig = apiClient.get;
  apiClient.get = async () => (calls++, await new Promise((r) => setTimeout(r, 10)), { items: [{ id: "u", fullName: "U", email: "u@x.com", role: null }] });
  try {
    const [a, b] = await Promise.all([loadSharedUserOptions(), loadSharedUserOptions()]);
    assert.equal(calls, 1);
    assert.deepEqual(a, b);
    await loadSharedUserOptions();
    assert.equal(calls, 2, "a later visit asks the server again");
  } finally {
    apiClient.get = orig;
  }
});

// ── Weekly email "Open" links → Edit Project sections (Oct 2026) ────────────

test("email links open Edit Project on the right section from a fresh page load, and the same URL reopens it after a refresh", async () => {
  const { readEditProjectDeepLink, EDIT_PROJECT_TABS } = await load("/src/pages/Projects/editProjectDeepLink.ts");
  // Fresh load from an email: no router state, only the URL.
  assert.deepEqual(readEditProjectDeepLink(null, "?tab=expenses"), { tab: "expenses" });
  assert.deepEqual(readEditProjectDeepLink(undefined, "?tab=invoices&invoiceLineId=line-1"), { tab: "invoices", invoiceLineId: "line-1" });
  // A refresh keeps the query string, so it resolves to the same section.
  const url = "?tab=invoices&invoiceLineId=line-1";
  assert.deepEqual(readEditProjectDeepLink(null, url), readEditProjectDeepLink(null, url));
  // In-app navigation (route state) still wins, unchanged.
  assert.deepEqual(readEditProjectDeepLink({ tab: "invoices", invoiceLineId: "n1", activityId: "a1" }, "?tab=expenses"), { tab: "invoices", invoiceLineId: "n1", activityId: "a1" });
  // Plain edit links and junk values open General as before.
  assert.deepEqual(readEditProjectDeepLink(null, ""), {});
  assert.deepEqual(readEditProjectDeepLink(null, "?tab=admin"), {});
  assert.deepEqual(readEditProjectDeepLink(null, "?tab=timeline"), {}, "View-only tab is not an Edit section");
  assert.deepEqual([...EDIT_PROJECT_TABS], ["general", "quantity", "payments", "budget", "team", "expenses", "invoices"]);
});

test("Edit Project's tab keys match ProjectForm's seven sections, and EditProject reads the deep link", async () => {
  const form = readFileSync(fileURLToPath(new URL("../src/pages/Projects/components/ProjectForm.tsx", import.meta.url)), "utf8");
  const editBlock = form.slice(form.indexOf("const TABS_EDIT"), form.indexOf("];", form.indexOf("const TABS_EDIT")));
  assert.deepEqual([...editBlock.matchAll(/key: "(\w+)"/g)].map((m) => m[1]), ["general", "quantity", "payments", "budget", "team", "expenses", "invoices"]);
  const edit = readFileSync(fileURLToPath(new URL("../src/pages/Projects/EditProject.tsx", import.meta.url)), "utf8");
  assert.match(edit, /readEditProjectDeepLink\(location\.state, location\.search\)/);
  // Still behind the Projects module (invoice data stays behind the backend's Invoices check).
  const layout = readFileSync(fileURLToPath(new URL("../src/layouts/MainLayout.tsx", import.meta.url)), "utf8");
  assert.match(layout, /path="\/projects\/edit\/:id"\s+element=\{<ModuleRoute module="Projects"><EditProject \/><\/ModuleRoute>\}/);
});

test("the Other Project Expenses card and preview describe Not Started as excluded", async () => {
  const { findWeeklyEmailNotification } = await load("/src/pages/Settings/components/weeklyEmails/weeklyEmailNotifications.ts");
  assert.match(findWeeklyEmailNotification("other-expenses").subtitle, /except Not Started, On Hold, Completed and Cancelled/);
});
