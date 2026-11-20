// Phase 4 (central country conversion rates): the separate "Manpower Conversion Rates" Module Access permission, where it shows up and where it must not, the service
// that talks to the server, and the page's rules (India fixed, nothing to edit without the right role). The server enforces every permission; these tests prove the
// screens offer exactly what the server would allow and reach the right endpoints.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 };
globalThis.window ??= { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
globalThis.__calls = [];

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      {
        // Records every request the service makes instead of calling a server.
        name: "stub-api-client",
        enforce: "pre",
        resolveId: (id) => (/\/apiClient$/.test(id) ? "virtual-stub-api-client" : null),
        load: (id) =>
          id === "virtual-stub-api-client"
            ? `export class ApiError extends Error {}
               const rec = (method) => async (path, body) => { globalThis.__calls.push({ method, path, body }); return { items: [], history: [] }; };
               export const apiClient = { get: rec("GET"), post: rec("POST"), patch: rec("PATCH"), delete: rec("DELETE") };`
            : null,
      },
    ],
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
const MODULE = "Manpower Conversion Rates";
const session = (role, modules) => ({ id: "u", role, modules, regions: [], approvalPermissions: [] });

test("the permission is a separate item in the Module Access list, never pre-ticked for any role (not even Administrator)", async () => {
  const { MODULE_FIELDS } = await load("/src/utils/accessFields.ts");
  const field = MODULE_FIELDS.find((f) => f.label === MODULE);
  assert.ok(field, "listed in Add / Edit User");
  assert.equal(field.key, "manpowerConversionRates");
  assert.ok(MODULE_FIELDS.some((f) => f.label === "Manpower"), "alongside, not instead of, ordinary Manpower");
  const { ROLE_MODULE_DEFAULTS } = await load("/src/utils/roleDefaults.ts");
  for (const [role, modules] of Object.entries(ROLE_MODULE_DEFAULTS)) {
    assert.equal(modules.manpowerConversionRates, false, `${role}: an Administrator must tick it explicitly`);
  }
});

test("permission helpers: the grant alone lets a user look; changing needs a manager role as well; ordinary Manpower access gives nothing; there is no role bypass", async () => {
  const { canViewConversionRates, canManageConversionRates, hasModuleAccess } = await load("/src/auth/permissions.ts");
  // A: ordinary Manpower access, no grant.
  const a = session("PMO Manager", ["Manpower", "Projects"]);
  assert.equal(canViewConversionRates(a), false);
  assert.equal(canManageConversionRates(a), false);
  // B: the grant, a manager role.
  const b = session("PMO Manager", [MODULE]);
  assert.equal(canViewConversionRates(b), true, "no Manpower module needed");
  assert.equal(canManageConversionRates(b), true);
  assert.equal(hasModuleAccess(b, "Manpower"), false);
  // The grant with a non-manager role: view only.
  assert.equal(canViewConversionRates(session("Project Manager", [MODULE])), true);
  assert.equal(canManageConversionRates(session("Project Manager", [MODULE])), false);
  assert.equal(canManageConversionRates(session("Read Only", [MODULE])), false);
  // C: neither.
  assert.equal(canViewConversionRates(session("Engineer", ["Projects"])), false);
  // An Administrator without the grant sees nothing: the role is not a bypass.
  assert.equal(canViewConversionRates(session("Administrator", ["Manpower", "Dashboard"])), false);
  assert.equal(canManageConversionRates(session("Administrator", ["Manpower"])), false);
  assert.equal(canViewConversionRates(null), false);
});

test("navigation: the menu item and the route need ONLY the new grant; the ordinary Manpower route is unchanged", () => {
  const sidebar = src("components/Sidebar/Sidebar.tsx");
  assert.match(sidebar, /\{ label: "Manpower Conversion Rates", to: "\/manpower\/conversion-rates"/, "the label is the exact module name, so the existing filter hides it without the grant");
  assert.match(sidebar, /hasModuleAccess\(user, item\.module \?\? item\.label\)/, "menu entries are filtered by module");
  assert.match(sidebar, /end=\{to === "\/" \|\| to === "\/manpower"\}/, "Manpower is not highlighted while Conversion Rates is open");
  const layout = src("layouts/MainLayout.tsx");
  assert.match(layout, /path="\/manpower\/conversion-rates"\s+element=\{<ModuleRoute module="Manpower Conversion Rates">/, "direct URL access is blocked without the grant");
  assert.match(layout, /path="\/manpower"\s+element=\{<ModuleRoute module="Manpower">/, "ordinary Manpower is still guarded by its own module");
  const manpower = src("pages/Manpower/Manpower.tsx");
  assert.match(manpower, /canSeeConversionRates &&/, "the in-page link shows only for a holder of the grant");
});

test("the service talks to the country endpoints (no project id anywhere) and sends the version the user previewed", async () => {
  const svc = await load("/src/services/manhourConversionRateService.ts");
  globalThis.__calls.length = 0;
  await svc.getCountryRates();
  await svc.getCountryRateHistory("R1");
  await svc.saveCountryRate("R1", "243.156", " note ");
  await svc.previewCountryApply("R1");
  await svc.applyCountryRate("R1", 4, "  why ");
  await svc.getOpenCountryApplyRuns();
  await svc.retryCountryApply("RUN1");
  const calls = globalThis.__calls.map((c) => `${c.method} ${c.path}`);
  assert.deepEqual(calls, [
    "GET /manhour-conversion-rates",
    "GET /manhour-conversion-rates/R1/history",
    "POST /manhour-conversion-rates/R1/versions",
    "GET /manhour-conversion-rates/R1/apply-preview",
    "POST /manhour-conversion-rates/R1/apply",
    "GET /manhour-conversion-rates/runs",
    "POST /manhour-conversion-rates/runs/RUN1/retry",
  ]);
  assert.deepEqual(globalThis.__calls[2].body, { inrPerRegionalUnit: "243.156", note: "note" });
  assert.deepEqual(globalThis.__calls[4].body, { expectedVersion: 4, reason: "why" });
  assert.equal(svc.saveCountryRate.length, 3);
  globalThis.__calls.length = 0;
  await svc.saveCountryRate("R1", "20", "");
  assert.equal(globalThis.__calls[0].body.note, null, "a blank note is not sent as text");
});

test("the page: India is fixed with no editing; every other country offers history, and a manager also gets save and review-and-apply; saving leads straight to the review", () => {
  const page = src("pages/Manpower/ManpowerConversionRates.tsx");
  assert.match(page, /country\.fixed \? <span>INR 1 <Badge tone="neutral">Fixed<\/Badge><\/span>/, "India reads INR 1, fixed");
  assert.match(page, /country\.fixed \? \(\s*<span className="text-\[11\.5px\] text-\[var\(--nu-text-muted\)\]">No editing<\/span>/, "no actions for India");
  assert.match(page, /\{data\.canManage && \(\s*<Fragment>\s*<Button size="sm" variant="primary" onClick=\{\(\) => openPanel\("save"/, "save is offered only when the server says the user can manage");
  assert.match(page, /await openPanel\("review", country\)/, "after saving, the user is taken to the review of the affected projects");
  assert.match(page, /Saving a new version changes nothing by itself/, "the page says saving does not rewrite costs");
  assert.match(page, /data-testid="country-apply"/);
  assert.match(page, /preview\.rate\.version/, "apply sends the version that was previewed");
  assert.match(page, /RATE_NOT_SET/, "a country without a rate says Rate not set");
  for (const column of ["Country", "Currency", "Rate", "Version", "Last updated", "Updated by", "Note"]) assert.ok(page.includes(`>${column}</th>`), `column ${column}`);
  assert.match(page, /formatMoney/, "amounts use the shared currency formatter");
});

test("the project screens only DISPLAY the country's rate: nothing calls a per-project rate API, and the wording points to the central page", () => {
  for (const file of ["pages/Projects/components/ExpandableTeamMembersCard.tsx", "pages/Projects/components/ExpenseBudgetView.tsx", "pages/ReportsPage.tsx", "pages/Dashboard/components/KPISection.tsx"]) { // the dashboard's own sentence was removed: the checks below still prove it never sends the user to a per-project rate
    const text = src(file);
    assert.ok(!/manhour-rate|saveManhourRate|applyManhourRate/.test(text), `${file}: no per-project rate call`);
    assert.ok(!/in the Team Assigned tab|in the project's Team Assigned tab|Project &gt; Team Assigned/.test(text), `${file}: no longer tells the user to set a rate on the project`);
  }
  assert.match(src("pages/Projects/components/ExpenseBudgetView.tsx"), /Manpower Conversion Rates/);
  assert.match(src("pages/ReportsPage.tsx"), /Manpower Conversion Rates/);
});

test("the refresh banner offers Retry only for the kind of recalculation the user is allowed to retry", () => {
  const banner = src("pages/Projects/components/ManhourRefreshBanner.tsx");
  assert.match(banner, /canRetryEmployee = hasModuleAccess\(user, "Manpower"\) && canMutateData\(user\)/);
  assert.match(banner, /canRetryCountry = canManageConversionRates\(user\)/);
  assert.match(banner, /canRetry = canRetryEmployee \|\| canRetryCountry/);
});

test("the amount tooltip uses the amount's own currency: AED, OMR, MYR and QAR never show a rupee sign or Lakhs/Crores; INR reads exactly as before", async () => {
  const { moneyTooltipText } = await load("/src/utils/moneyTooltipText.ts");
  const inr = moneyTooltipText(52_848);
  assert.match(inr.exact, /₹/);
  assert.match(inr.note, /Lakhs\/Crores/);
  assert.deepEqual(moneyTooltipText(52_848, "INR"), inr, "no currency = INR, unchanged");
  for (const [currency, symbol] of [["AED", "AED"], ["OMR", "OMR"], ["MYR", "RM"], ["QAR", "QAR"]]) {
    const t = moneyTooltipText(52_848, currency);
    assert.ok(t.exact.includes(symbol), `${currency}: exact amount in ${symbol}`);
    assert.ok(t.compact.includes(symbol) && t.compact.includes("K"), `${currency}: rounded form in ${symbol}`);
    assert.doesNotMatch(`${t.exact} ${t.compact} ${t.note}`, /₹|Lakh|Crore/, `${currency}: no rupee wording`);
  }
  assert.equal(moneyTooltipText(52_848, "AED").exact, "AED 52,848.00");
  assert.equal(moneyTooltipText(1_234.5, "OMR").exact, "OMR 1,234.500", "OMR keeps its three decimals");
});

test("every Dashboard KPI tile passes its currency to the tooltip; the Invoice Management tiles pass the project's own currency", () => {
  const kpi = src("pages/Dashboard/components/KPISection.tsx");
  const tiles = kpi.match(/<StatTile [^\n]*rawValue=/g) ?? [];
  assert.equal(tiles.length, 5);
  for (const tile of tiles) assert.ok(kpi.includes(`${tile}`), "tile found");
  assert.equal((kpi.match(/rawValue=\{[^}]+\} currency=\{kpiCurrency\}/g) ?? []).length, 5, "all five money tiles carry the KPI currency");
  assert.match(src("components/ui/StatTile.tsx"), /<MoneyTooltip value=\{rawValue\} currency=\{currency\}>/);
  // Nov 2026: invoice amounts are in the project's own currency since regional invoicing (4cf51c5), so the Invoice Management tiles now pass it
  // through to the tooltip (INR for India / legacy, unchanged). Rendered behaviour is pinned in invoiceKpiOrder.test.mjs.
  assert.match(src("pages/Projects/components/Invoice/SummaryCards.tsx"), /currency=\{tile\.currency\}/, "invoice tiles pass their currency");
  assert.match(src("pages/Projects/components/Invoice/CommercialSummary.tsx"), /projectMoney\(project\)/, "invoice tiles use the project's currency");
});

test("the legacy-records review is a read-only report: it reads one endpoint, is open to every holder of the grant, and never offers to apply or pick a rate", async () => {
  const svc = await load("/src/services/manhourConversionRateService.ts");
  globalThis.__calls.length = 0;
  await svc.getLegacyReview("R1");
  assert.deepEqual(globalThis.__calls.map((c) => `${c.method} ${c.path}`), ["GET /manhour-conversion-rates/R1/legacy-review"]);
  const page = src("pages/Manpower/ManpowerConversionRates.tsx");
  // The button sits with History (outside the manager-only block): any holder of the grant can look.
  assert.match(page, /openPanel\("history", country\)[\s\S]*?openPanel\("legacy", country\)[\s\S]*?\{data\.canManage && \(/);
  for (const text of ["Older project rate", "Older country version", "Rate not set", "Needs review", "Consistent"]) assert.ok(page.includes(text), text);
  assert.match(page, /no rate is chosen or assumed/);
  assert.match(page, /Nothing is applied automatically/);
  for (const column of ["Previous rate", "Approved rate", "Now (", "Proposed (", "Reason", "Records"]) assert.ok(page.includes(column), `column ${column}`);
  assert.match(page, /data-testid="legacy-conflict"/, "a conflict between legacy rates is shown");
  const panel = page.slice(page.indexOf('open === "legacy"'), page.indexOf('open === "review"'));
  assert.ok(!/applyCountryRate|saveCountryRate|country-apply/.test(panel), "the report panel has no write action");
});
