// Reports page with several countries in view: a country bar and a comparison overview instead of every country's report stacked (UI only). Each card is one country in its own
// currency; nothing is converted or added across countries; one country in view is untouched.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let lens;
let lensLogic;
let React;
let renderToStaticMarkup;
globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 };
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  lens = await vite.ssrLoadModule("/src/components/reports/Shared/CountryReportLens.tsx");
  lensLogic = await vite.ssrLoadModule("/src/components/reports/countryLens.ts");
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});
after(() => vite?.close());
const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8");

const group = (key, countryKey, countryLabel, currency, n, wo, raised, cash, cost, extra = {}) => ({
  key, countryKey, countryLabel, label: `${countryLabel} · ${currency}`, currency, projects: new Array(n).fill({}), manhourRateMissingProjects: 0, manhourRefreshProblemProjects: 0,
  analytics: { totalWOValue: wo, totalInvoiceRaised: raised, totalPaymentReceived: cash, totalOutstanding: wo - cash, totalActualProjectCost: cost, collectionPercent: raised ? (cash / raised) * 100 : 0, totalProfitPercentage: wo ? ((wo - cost) / wo) * 100 : 0 },
  invoiceLines: [], ...extra,
});
const GROUPS = [
  group("India|INR", "India", "India", "INR", 43, 10_000_000, 541_758, 76_779, 10_505_000),
  group("Malaysia|MYR", "Malaysia", "Malaysia", "MYR", 42, 8_064_802, 494_606, 78_879, 222_571.44, { manhourRateMissingProjects: 40 }),
  group("Abu Dhabi|AED", "Abu Dhabi", "Abu Dhabi", "AED", 42, 8_052_848, 490_980, 77_379, 220_754.55),
  group("FZI|AED", "FZI", "FZE", "AED", 42, 8_027_525, 492_527, 78_614, 217_604.55),
];
const render = (value, invoiceDataAvailable = true, groups = GROUPS) => renderToStaticMarkup(React.createElement(lens.CountryReportLens, { groups, invoiceDataAvailable, value, onChange() {} }));

test("resolveLensView: one country never needs the bar, an unknown selection falls back to the overview, a known one is kept", () => {
  assert.equal(lensLogic.resolveLensView("overview", [GROUPS[0]]), "all", "a single country renders its report exactly as before");
  assert.equal(lensLogic.resolveLensView("Oman|OMR", GROUPS), "overview", "a country removed by a filter falls back");
  assert.equal(lensLogic.resolveLensView("FZI|AED", GROUPS), "FZI|AED");
  assert.equal(lensLogic.resolveLensView("all", GROUPS), "all");
  assert.equal(lensLogic.resolveLensView("overview", GROUPS), "overview");
});

test("the bar has Overview, one chip per country (name, currency, project count; FZE and Abu Dhabi stay separate even in the same currency) and All stacked", () => {
  const html = render("overview");
  assert.match(html, /role="tablist"/);
  const chips = [...html.matchAll(/data-lens="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(chips, ["overview", "India|INR", "Malaysia|MYR", "Abu Dhabi|AED", "FZI|AED", "all"]);
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1, "exactly one chip is selected");
  assert.match(html, /data-lens="overview"[^>]*>|aria-selected="true"[^>]*data-lens="overview"/);
  assert.match(html, />FZE</);
});

test("the overview is one card per country with its own currency and Indian or international numbering; nothing is added across currencies", () => {
  const html = render("overview");
  const cards = [...html.matchAll(/data-overview-card="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(cards, ["India|INR", "Malaysia|MYR", "Abu Dhabi|AED", "FZI|AED"]);
  const card = (key) => { const i = html.indexOf(`data-overview-card="${key}"`); const next = html.indexOf("data-overview-card=", i + 1); return html.slice(i, next < 0 ? html.length : next); };
  assert.match(card("India|INR"), /₹ 1 Cr/, "India keeps Lakh / Crore");
  assert.match(card("Malaysia|MYR"), /RM 8\.06M/);
  assert.match(card("Abu Dhabi|AED"), /AED 8\.05M/);
  assert.match(card("FZI|AED"), /AED 8\.03M/);
  for (const key of ["Malaysia|MYR", "Abu Dhabi|AED", "FZI|AED"]) assert.doesNotMatch(card(key), /₹/, key);
  assert.doesNotMatch(html, /AED 16\.\d+M|26\.\d+M|36\.\d+M/, "the two AED countries are never summed");
  assert.match(card("Malaysia|MYR"), /rate not set/);
  assert.doesNotMatch(card("India|INR"), /rate not set/);
  assert.match(html, /never added together/);
});

test("a selected country (or All stacked) shows no overview; without invoice access the invoice figures read a dash and the bars are hidden", () => {
  assert.doesNotMatch(render("Malaysia|MYR"), /data-overview-card|country-overview/);
  assert.doesNotMatch(render("all"), /country-overview/);
  const noInvoice = render("overview", false);
  const card = noInvoice.slice(noInvoice.indexOf('data-overview-card="India|INR"'), noInvoice.indexOf('data-overview-card="Malaysia|MYR"'));
  assert.match(card, />—</);
  assert.doesNotMatch(card, /Collected/);
  assert.match(card, /Work Order Value/);
});

test("the Reports page renders only the selected country (or none on the overview); one country in view has no bar and no extra chrome", () => {
  const page = src("pages/ReportsPage.tsx");
  assert.match(page, /resolveLensView\(lens, groups\)/);
  assert.match(page, /const visibleGroups = lensView === "all" \? groups : lensView === "overview" \? \[\] : groups\.filter\(\(g\) => g\.key === lensView\)/);
  assert.match(page, /\{visibleGroups\.map\(\(group\) => \(/);
  assert.match(page, /\{groups\.length > 1 && \(\s*<CountryReportLens/);
  assert.match(page, /lensView === "all" && groups\.length > 1/, "the long-view note only belongs to the stacked view");
  assert.match(page, /ReportGroupContext\.Provider/, "each rendered country still reads its own currency");
});
