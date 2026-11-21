// Weekly email report exclusions (Nov 2026): Administrator-only Exclude controls on both Preview Report pages, the
// Excluded History page and its Settings link. Components render server-side (no browser, no requests); page wiring
// that needs the signed-in user is pinned in the source. The backend enforces the same rules (weeklyReportExclusion.http.test.ts).
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
const src = (p) => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf8");
const NOTIF = "/src/pages/Settings/components/weeklyEmails/weeklyEmailNotifications.ts";
const TABLES = "/src/pages/Settings/components/weeklyEmails/WeeklyEmailTables.tsx";
const EXCL_UI = "/src/pages/Settings/components/weeklyEmails/WeeklyEmailExclusions.tsx";
const EXCL_TEXT = "/src/pages/Settings/components/weeklyEmails/weeklyEmailExclusionText.ts";

const unpaidRow = (i, projectId = `p${i}`) => ({ projectId, prNo: `PR-${i}`, client: "Acme", projectTitle: `Title ${i}`, projectManager: null, invoiceNo: `INV-${i}`, invoiceDate: "2026-09-01", daysSinceRaised: 49, invoiceAmountINR: 1000, amountPaidINR: 0, outstandingINR: 1000, status: "Raised / Submitted", originalAmountNote: null, projectUrl: "http://x/p" });
const missingRow = { id: "a", prNo: "PR-9", client: "C", projectTitle: "T9", projectManager: null, projectStatus: "Active", projectUrl: "http://x/a" };
const exclusion = (over = {}) => ({ id: "e1", projectId: "p1", reportType: "missing_other_project_expenses", reportName: "Projects Missing Other Project Expenses", prNo: "PR-1", projectTitle: "Pump House", client: "Acme", excludedBy: "QA Admin", excludedAt: "2026-11-20T05:30:00.000Z", status: "Active", restoredBy: null, restoredAt: null, ...over });

// 1 + 2: who sees the Exclude controls

test("only Administrators get Exclude controls (role helper); PMO Managers keep Weekly Emails without them", async () => {
  const { canManageReportExclusions, canManageWeeklyEmails } = await load(NOTIF);
  assert.equal(canManageReportExclusions("Administrator"), true);
  for (const r of ["PMO Manager", "Accounts", "Engineer", null, undefined, "administrator"]) assert.equal(canManageReportExclusions(r), false, String(r));
  assert.equal(canManageWeeklyEmails("PMO Manager"), true, "existing Weekly Emails access unchanged");
});

test("preview tables: Exclude column/button only when onExclude is given; one button per row", async () => {
  const { UnpaidInvoicePreviewTable, MissingExpensePreviewTable } = await load(TABLES);
  const plainU = renderToStaticMarkup(h(UnpaidInvoicePreviewTable, { rows: [unpaidRow(1), unpaidRow(2)] }));
  const plainM = renderToStaticMarkup(h(MissingExpensePreviewTable, { rows: [missingRow] }));
  for (const html of [plainU, plainM]) {
    assert.equal(/data-action="exclude"/.test(html), false, "no Exclude for non-Administrators");
    assert.equal(/>Action</.test(html), false);
  }
  const adminU = renderToStaticMarkup(h(UnpaidInvoicePreviewTable, { rows: [unpaidRow(1), unpaidRow(2)], onExclude() {} }));
  const adminM = renderToStaticMarkup(h(MissingExpensePreviewTable, { rows: [missingRow], onExclude() {} }));
  assert.equal((adminU.match(/data-action="exclude"/g) ?? []).length, 2);
  assert.equal((adminM.match(/data-action="exclude"/g) ?? []).length, 1);
  assert.match(adminU, /Exclude project PR-1 \(all its invoices\) from this report/, "Report 2 says the whole project is excluded");
  assert.match(adminM, /Exclude PR-9 from this report/);
});

test("preview page passes onExclude only when the user is an Administrator AND the backend says canExclude", () => {
  const page = src("pages/Settings/WeeklyEmails/WeeklyEmailPreviewPage.tsx");
  assert.match(page, /isAdministrator=\{canManageReportExclusions\(user\?\.role\)\}/);
  assert.match(page, /const canExclude = isAdministrator && data\?\.canExclude === true;/);
  assert.equal((page.match(/\.\.\.\(canExclude \? \{ onExclude:/g) ?? []).length, 2, "both tables gated");
  assert.match(page, /canExclude \? \(\s*<Link\s+to=\{weeklyEmailExcludedPath\(config\.slug\)\}/, "Excluded History link only for Administrators");
});

// 5: confirmation dialogs

test("confirm dialogs name the project, PR Number and report (Report 2: all invoices); restore confirm too", async () => {
  const { excludeConfirmMessage, restoreConfirmMessage } = await load(EXCL_TEXT);
  const { findWeeklyEmailNotification } = await load(NOTIF);
  const target = { projectId: "p1", prNo: "IFE-PR-2026-001", projectTitle: "Pump House", client: "Acme" };
  const r1 = excludeConfirmMessage(findWeeklyEmailNotification("other-expenses"), target);
  const r2 = excludeConfirmMessage(findWeeklyEmailNotification("unpaid-invoices"), target);
  for (const m of [r1, r2]) {
    assert.match(m, /Project: Pump House/);
    assert.match(m, /PR Number: IFE-PR-2026-001/);
    assert.match(m, /no project, invoice, expense or payment data/);
  }
  assert.match(r1, /Report: Projects Missing Other Project Expenses/);
  assert.match(r2, /Report: Invoices Unpaid for 30\+ Days/);
  assert.match(r2, /All of this project's invoices/);
  const rr = restoreConfirmMessage(exclusion({ reportName: "Invoices Unpaid for 30+ Days" }));
  assert.match(rr, /Project: Pump House\nPR Number: PR-1\nReport: Invoices Unpaid for 30\+ Days/);
  const page = src("pages/Settings/WeeklyEmails/WeeklyEmailExcludedHistoryPage.tsx");
  assert.match(page, /<ConfirmDialog[\s\S]*title="Include this project again\?"/, "restore needs confirmation");
});

// 6 + 7: refresh after exclude / restore

test("a successful exclusion refreshes the preview; a restore refreshes the Excluded History", () => {
  const preview = src("pages/Settings/WeeklyEmails/WeeklyEmailPreviewPage.tsx");
  assert.match(preview, /await weeklyReportExclusionApi\.exclude\(config\.reportType, target\.projectId\);[\s\S]*?state\.retry\(\);/);
  const history = src("pages/Settings/WeeklyEmails/WeeklyEmailExcludedHistoryPage.tsx");
  assert.match(history, /await weeklyReportExclusionApi\.restore\(confirm\.id\);[\s\S]*?finally \{[\s\S]*?state\.retry\(\);/);
  // The preview always rebuilds from the server (no cached rows), so a restored project reappears on the next visit.
  assert.match(preview, /usePagedRequest\(fetchPage/);
});

test("API: exclude / restore / history requests", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { weeklyReportExclusionApi } = await load("/src/services/weeklyEmailService.ts");
  const calls = [];
  const og = apiClient.get;
  const op = apiClient.post;
  apiClient.get = async (p) => (calls.push(["GET", p]), { items: [] });
  apiClient.post = async (p, b) => (calls.push(["POST", p, b]), {});
  try {
    await weeklyReportExclusionApi.exclude("unpaid_invoices_30_days", "proj-1");
    await weeklyReportExclusionApi.restore("ex-1");
    await weeklyReportExclusionApi.list("missing_other_project_expenses", "active", 2, 50);
  } finally {
    apiClient.get = og;
    apiClient.post = op;
  }
  assert.deepEqual(calls, [
    ["POST", "/notification-settings/report-exclusions", { reportType: "unpaid_invoices_30_days", projectId: "proj-1" }],
    ["POST", "/notification-settings/report-exclusions/ex-1/restore", {}],
    ["GET", "/notification-settings/report-exclusions?reportType=missing_other_project_expenses&status=active&page=2&pageSize=50"],
  ]);
});

// 3 + 4: Excluded History access

test("Excluded History: route registered; Administrators only; Settings link only for Administrators", async () => {
  const layout = src("layouts/MainLayout.tsx");
  assert.match(layout, /path="\/settings\/weekly-emails\/excluded"\s+element=\{<ModuleRoute module="Settings"><Suspense fallback=\{pageFallback\}><WeeklyEmailExcludedHistoryPage \/>/);
  const { weeklyEmailExcludedPath } = await load(NOTIF);
  assert.ok(matchPath("/settings/weekly-emails/excluded", weeklyEmailExcludedPath("unpaid-invoices").split("?")[0]));
  assert.equal(weeklyEmailExcludedPath("unpaid-invoices"), "/settings/weekly-emails/excluded?report=unpaid-invoices");
  const page = src("pages/Settings/WeeklyEmails/WeeklyEmailExcludedHistoryPage.tsx");
  assert.match(page, /if \(!canManageReportExclusions\(user\?\.role\)\) return <AccessDenied moduleName="Excluded History" \/>;/);

  const { WeeklyEmailCardLinks } = await load("/src/pages/Settings/components/weeklyEmails/WeeklyEmailsSection.tsx");
  const { findWeeklyEmailNotification } = await load(NOTIF);
  const settings = { recipients: { toEmail: "info@ifluids.com", cc: [], isDefault: true, unresolvedDefaults: [], updatedAt: null, updatedBy: null }, emailEnabled: false, manualTriggerEnabled: false, schedule: { cron: "0 11 * * 1", timezone: "Asia/Kolkata" }, lastRun: null, totalRuns: 0 };
  const render = (show) => renderToStaticMarkup(h(MemoryRouter, null, h(WeeklyEmailCardLinks, { config: findWeeklyEmailNotification("other-expenses"), settings, running: false, onRunNow() {}, showExcludedHistory: show })));
  assert.match(render(true), /data-link="excluded" href="\/settings\/weekly-emails\/excluded\?report=other-expenses"|href="\/settings\/weekly-emails\/excluded\?report=other-expenses"[^>]*data-link="excluded"/);
  assert.equal(/data-link="excluded"/.test(render(false)), false);
  const settingsPage = src("pages/Settings/Settings.tsx");
  assert.match(settingsPage, /<WeeklyEmailsSection showExcludedHistory=\{canManageReportExclusions\(user\?\.role\)\} \/>/);
  const section = src("pages/Settings/components/weeklyEmails/WeeklyEmailsSection.tsx");
  assert.match(section, /<WeeklyEmailCard key=\{n\.slug\} config=\{n\} showExcludedHistory=\{showExcludedHistory\} \/>/);
});

test("Excluded History table: required columns, Active/Restored status, restore only on active rows, identities kept", async () => {
  const { ExcludedHistoryTable } = await load(EXCL_UI);
  const html = renderToStaticMarkup(
    h(ExcludedHistoryTable, {
      rows: [exclusion(), exclusion({ id: "e2", status: "Restored", restoredBy: "QA Admin Two", restoredAt: "2026-11-21T06:00:00.000Z", excludedBy: "QA Admin" })],
      onRestore() {},
    })
  );
  for (const col of ["Project", "PR Number", "Client", "Excluded From", "Excluded By", "Excluded At", "Status", "Action"]) assert.match(html, new RegExp(`>${col}<`), col);
  assert.equal((html.match(/data-action="restore"/g) ?? []).length, 1, "only the active row can be included again");
  assert.match(html, /Include Again/);
  assert.match(html, /data-exclusion-status="Restored"/);
  assert.match(html, /by QA Admin Two/);
  assert.equal((html.match(/QA Admin</g) ?? []).length, 2, "the excluding administrator stays on the restored row");
  assert.match(html, />Projects Missing Other Project Expenses</);
});

// 8: existing screens still work

test("existing preview summary unchanged for non-Administrators; Administrators also see the excluded count", async () => {
  const { PreviewSummary } = await load(TABLES);
  const { findWeeklyEmailNotification } = await load(NOTIF);
  const base = { generatedAt: "", generatedAtLabel: "x", timezone: "Asia/Kolkata", eligibleCount: 10, matchCount: 4, summary: undefined, page: 1, pageSize: 25, total: 4, totalPages: 1, items: [], recipients: { to: "info@ifluids.com", cc: [] }, emailEnabled: false, wouldSend: false };
  const cfg = findWeeklyEmailNotification("other-expenses");
  const nonAdmin = renderToStaticMarkup(h(PreviewSummary, { config: cfg, data: { ...base, excludedCount: 3, canExclude: false } }));
  assert.equal(/excluded by an Administrator/.test(nonAdmin), false);
  assert.match(nonAdmin, /Opening this preview never sends an email/);
  const legacy = renderToStaticMarkup(h(PreviewSummary, { config: cfg, data: base }));
  assert.equal(legacy, nonAdmin, "a response without the new fields renders exactly as before");
  const admin = renderToStaticMarkup(h(PreviewSummary, { config: cfg, data: { ...base, excludedCount: 3, canExclude: true } }));
  assert.match(admin, /Projects excluded by an Administrator<\/p><p[^>]*>3</);
});
