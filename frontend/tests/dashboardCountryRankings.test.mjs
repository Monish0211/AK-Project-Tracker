// Dashboard Top Clients and Department panels, country by country (Phase 4 final). Each country is a titled section in its own currency and number convention; a single-country
// view reads exactly as before; a summary from an older backend (no per-country field) is still shown as the single headline list; no section is converted or added to another.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
let React;
let renderToStaticMarkup;
let MemoryRouter;
globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 };

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
  ({ MemoryRouter } = await import("react-router-dom"));
});
after(() => vite?.close());

const dept = (department, workOrderValue, over = {}) => ({
  department, activeProjects: 2, completedProjects: 0, onHoldProjects: 0, delayedProjects: 0, teamMembers: 3, pendingInvoices: 0, timesheetPending: 0, upcomingDeliveries: 0,
  completion: 40, workOrderValue, workloadPercent: 50, ...over,
});
const deptBlock = (list) => ({ list, totals: { departments: list.length, totalProjects: 4, teamMembers: 6, averageCompletion: 40 } });

async function render(path, summary) {
  const ctx = await load("/src/pages/Dashboard/DashboardSummaryContext.tsx");
  const component = (await load(path)).default;
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(ctx.DashboardSummaryProvider, { value: summary }, React.createElement(component))));
}

const SEVEN_CLIENTS = [
  { countryKey: "India", country: "India", currency: "INR", clients: [{ client: "Acme", workOrderValue: 125_000_000 }, { client: "Beta", workOrderValue: 4_000_000 }] },
  { countryKey: "Malaysia", country: "Malaysia", currency: "MYR", clients: [{ client: "Acme", workOrderValue: 43_200 }] },
  { countryKey: "Oman", country: "Oman", currency: "OMR", clients: [{ client: "Beta", workOrderValue: 3_696.5 }, { client: "Acme", workOrderValue: 1_000 }] },
  { countryKey: "Abu Dhabi", country: "Abu Dhabi", currency: "AED", clients: [{ client: "Acme", workOrderValue: 52_850 }] },
  { countryKey: "FZI", country: "FZE", currency: "AED", clients: [{ client: "Acme", workOrderValue: 35_230 }] },
  { countryKey: "Elixir Qatar", country: "Elixir Qatar", currency: "QAR", clients: [{ client: "Gamma", workOrderValue: 18_200 }] },
  { countryKey: "Qatar", country: "Qatar", currency: "QAR", clients: [{ client: "Gamma", workOrderValue: 12_500 }] },
];

test("Top Clients, All Countries: a titled section per country, each amount in its own currency and convention, rank restarting at 1 in each", async () => {
  const html = await render("/src/pages/Dashboard/components/TopClients.tsx", { kpis: {}, topClients: [], recentProjects: [], kpiCurrency: "INR", topClientsByCountry: SEVEN_CLIENTS });
  const titles = [...html.matchAll(/data-testid="top-clients-section"[^>]*>\s*([^<]+?)\s*</g)].map((m) => m[1]);
  assert.deepEqual(titles, ["India – INR", "Malaysia – MYR", "Oman – OMR", "Abu Dhabi – AED", "FZE – AED", "Elixir Qatar – QAR", "Qatar – QAR"]);
  assert.match(html, /₹ 12\.5 Cr/, "India keeps Lakh / Crore");
  assert.match(html, /₹ 40 L/);
  assert.match(html, /RM 43\.2K/);
  assert.match(html, /OMR 3\.7K/);
  assert.match(html, /AED 52\.85K/);
  assert.match(html, /AED 35\.23K/);
  assert.match(html, /QAR 18\.2K/);
  assert.match(html, /QAR 12\.5K/);
  const visible = html.replace(/<[^>]+>/g, " "); // what a person reads (tooltips are attributes)
  assert.doesNotMatch(visible.replace(/₹ 12\.5 Cr|₹ 40 L/g, ""), /₹/, "no rupee sign outside the India section");
  assert.doesNotMatch(visible, /₹ 0(?![.\d])/, "no ₹ 0 for a country whose customers are outside the headline currency");
  // The same customer name is listed in several countries, each with that country's own value.
  assert.equal((html.match(/>Acme</g) ?? []).length, 5);
  // Rank badges restart in each section: 7 sections -> seven "1" badges.
  assert.equal((html.match(/shrink-0 border-2[^>]*>1</g) ?? []).length, 7);
});

test("Top Clients, single country: no section titles and the same layout as before, in the country's currency", async () => {
  const oman = await render("/src/pages/Dashboard/components/TopClients.tsx", { kpis: {}, topClients: [], recentProjects: [], kpiCurrency: "OMR", topClientsByCountry: [SEVEN_CLIENTS[2]] });
  assert.doesNotMatch(oman, /top-clients-section/);
  assert.match(oman, /OMR 3\.7K/);
  assert.doesNotMatch(oman, /₹/);
  const india = await render("/src/pages/Dashboard/components/TopClients.tsx", { kpis: {}, topClients: [], recentProjects: [], kpiCurrency: "INR", topClientsByCountry: [SEVEN_CLIENTS[0]] });
  assert.doesNotMatch(india, /top-clients-section/);
  assert.match(india, /₹ 12\.5 Cr/);
});

test("Top Clients: an older backend's summary (no per-country field) is shown as the single headline list, exactly as before", async () => {
  const html = await render("/src/pages/Dashboard/components/TopClients.tsx", { kpis: {}, recentProjects: [], topClients: [{ client: "Acme", workOrderValue: 912000 }] });
  assert.match(html, /₹ 9\.12 L/);
  assert.doesNotMatch(html, /top-clients-section/);
  const empty = await render("/src/pages/Dashboard/components/TopClients.tsx", { kpis: {}, recentProjects: [], topClients: [], topClientsByCountry: [] });
  assert.match(empty, /No client data available/);
});

const BASE_DEPT = { kpis: {}, topClients: [], recentProjects: [], kpiCurrency: "INR" };
const SEVEN_DEPTS = [
  { countryKey: "India", country: "India", currency: "INR", departments: deptBlock([dept("Process", 20_000_000), dept("Mechanical", 4_000_000)]) },
  { countryKey: "Malaysia", country: "Malaysia", currency: "MYR", departments: deptBlock([dept("Process", 43_200)]) },
  { countryKey: "Oman", country: "Oman", currency: "OMR", departments: deptBlock([dept("Process", 1_500), dept("Mechanical", 3_696.5)]) },
  { countryKey: "Abu Dhabi", country: "Abu Dhabi", currency: "AED", departments: deptBlock([dept("Process", 52_850)]) },
  { countryKey: "FZI", country: "FZE", currency: "AED", departments: deptBlock([dept("Process", 35_230)]) },
  { countryKey: "Elixir Qatar", country: "Elixir Qatar", currency: "QAR", departments: deptBlock([dept("Process", 18_200)]) },
  { countryKey: "Qatar", country: "Qatar", currency: "QAR", departments: deptBlock([dept("Process", 12_500)]) },
];

test("Department panel, All Countries: the WO Value column is a titled block per country in its own currency; the highest value is compared only inside a country", async () => {
  const overall = deptBlock([dept("Process", 20_000_000, { activeProjects: 14 }), dept("Mechanical", 4_000_000)]);
  const html = await render("/src/pages/Dashboard/components/DepartmentSummary.tsx", { ...BASE_DEPT, departments: overall, departmentsByCountry: SEVEN_DEPTS });
  const titles = [...html.matchAll(/data-testid="department-section-title"[^>]*>\s*([^<]+?)\s*</g)].map((m) => m[1]);
  assert.deepEqual(titles, ["India – INR", "Malaysia – MYR", "Oman – OMR", "Abu Dhabi – AED", "FZE – AED", "Elixir Qatar – QAR", "Qatar – QAR"]);
  for (const text of ["₹ 2 Cr", "₹ 40 L", "RM 43.2K", "OMR 1.5K", "OMR 3.7K", "AED 52.85K", "AED 35.23K", "QAR 18.2K", "QAR 12.5K"]) assert.match(html, new RegExp(text.replace(/[.₹]/g, "\\$&")), text);
  // The "Highest WO Value" insight lists each country's own leader (Mechanical leads Oman, Process leads the rest), never one cross-currency winner.
  const insight = html.slice(html.indexOf("highest-wo-by-country"));
  assert.match(insight, /Oman – OMR<\/span> · Mechanical · <span[^>]*>OMR 3\.7K/);
  assert.match(insight, /India – INR<\/span> · Process/);
  assert.match(insight, /FZE – AED<\/span> · Process/);
});

test("Department panel, single country or older backend: one block, no titles, the same figures as before", async () => {
  const oman = await render("/src/pages/Dashboard/components/DepartmentSummary.tsx", { ...BASE_DEPT, kpiCurrency: "OMR", departments: SEVEN_DEPTS[2].departments, departmentsByCountry: [SEVEN_DEPTS[2]] });
  assert.doesNotMatch(oman, /department-section|highest-wo-by-country/);
  assert.match(oman, /OMR 3\.7K/);
  assert.doesNotMatch(oman, /₹/);
  const legacy = await render("/src/pages/Dashboard/components/DepartmentSummary.tsx", { ...BASE_DEPT, departments: SEVEN_DEPTS[0].departments });
  assert.doesNotMatch(legacy, /department-section/);
  assert.match(legacy, /₹ 2 Cr/);
});

test("the section helpers never merge: countries stay separate even when they share a currency", async () => {
  const { topClientSections, departmentSections, sectionTitle } = await load("/src/utils/dashboardCountrySections.ts");
  const sections = topClientSections({ topClients: [], kpiCurrency: "INR", topClientsByCountry: SEVEN_CLIENTS });
  assert.equal(sections.length, 7);
  assert.equal(sections.filter((s) => s.currency === "AED").length, 2);
  assert.equal(new Set(sections.map((s) => s.key)).size, 7);
  assert.equal(sectionTitle(sections[4]), "FZE – AED");
  assert.equal(departmentSections({ departments: deptBlock([]), kpiCurrency: "OMR" })[0].currency, "OMR");
});

// ---- Collapsible country sections (UI only) -----------------------------------------------------------------------------------------------------------------------
const sectionHeaders = (html) => [...html.matchAll(/<button[^>]*aria-expanded="(true|false)"[^>]*aria-controls="(dept-panel-[^"]+)"/g)].map((m) => ({ open: m[1] === "true", panel: m[2] }));

test("Department panel, seven countries: every country is a collapsed section with its own summary, and its rows sit in a hidden body that Expand all can open", async () => {
  const overall = deptBlock([dept("Process", 20_000_000, { activeProjects: 14 }), dept("Mechanical", 4_000_000)]);
  const html = await render("/src/pages/Dashboard/components/DepartmentSummary.tsx", { ...BASE_DEPT, departments: overall, departmentsByCountry: SEVEN_DEPTS });
  const headers = sectionHeaders(html);
  assert.equal(headers.length, 7, "one header per country");
  assert.ok(headers.every((h) => h.open === false), "with more than two countries every section starts collapsed");
  assert.equal(new Set(headers.map((h) => h.panel)).size, 7, "each header controls its own body (FZE and Abu Dhabi share AED but stay separate)");
  for (const h of headers) assert.match(html, new RegExp('<tbody id="' + h.panel + '" hidden=""'), "collapsed body is hidden, not removed");
  assert.match(html, /Expand all/);
  assert.match(html, /Collapse all/);
  assert.match(html, /0 of 7 countries open/);
  // The header summary is that country's own: Oman has 2 departments, Malaysia 1; each section names its own leader in its own currency.
  const summaries = [...html.matchAll(/data-testid="department-section-summary"[^>]*>([^<]+)</g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  assert.equal(summaries.length, 7);
  assert.match(summaries[2], /^2 departments · 4 projects · 6 team · avg 40%$/);
  assert.match(summaries[1], /^1 department · 4 projects · 6 team · avg 40%$/);
  assert.match(html, /Top WO · Mechanical · <span[^>]*>OMR 3\.7K/);
  assert.match(html, /Top WO · Process · <span[^>]*>RM 43\.2K/);
});

test("Department panel: with two countries both sections start open; a single country or an older backend has no section header, no hidden body and no Expand / Collapse controls", async () => {
  const two = await render("/src/pages/Dashboard/components/DepartmentSummary.tsx", { ...BASE_DEPT, departments: SEVEN_DEPTS[0].departments, departmentsByCountry: [SEVEN_DEPTS[0], SEVEN_DEPTS[2]] });
  assert.deepEqual(sectionHeaders(two).map((h) => h.open), [true, true]);
  assert.doesNotMatch(two, /hidden=""/);
  assert.match(two, /2 of 2 countries open/);
  const one = await render("/src/pages/Dashboard/components/DepartmentSummary.tsx", { ...BASE_DEPT, kpiCurrency: "OMR", departments: SEVEN_DEPTS[2].departments, departmentsByCountry: [SEVEN_DEPTS[2]] });
  assert.equal(sectionHeaders(one).length, 0);
  assert.doesNotMatch(one, /Expand all|Collapse all|dept-panel|hidden=""/);
  const legacy = await render("/src/pages/Dashboard/components/DepartmentSummary.tsx", { ...BASE_DEPT, departments: SEVEN_DEPTS[0].departments });
  assert.equal(sectionHeaders(legacy).length, 0);
  assert.doesNotMatch(legacy, /Expand all|dept-panel/);
});

test("Department panel layout: the section body scrolls inside a bounded area and the workload card is compact (no stretched, whitespace-filled card)", async () => {
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/pages/Dashboard/components/DepartmentSummary.tsx", import.meta.url), "utf8");
  assert.match(src, /titled \? "max-h-\[440px\]"/, "the country table scrolls inside a bounded height when several countries are shown");
  assert.doesNotMatch(src, /flex-1 flex flex-col justify-around/, "the workload bars are no longer spread over the full column height");
  assert.match(src, /lg:col-span-5 flex flex-col justify-start gap-3\.5 self-start/, "the analytics column is top-aligned and only as tall as its content");
});

// ---- Financial summary per currency group (All Countries) --------------------------------------------------------------------------------------------------------------
const K = (projects, wo, raised, cash, cost, extra = {}) => ({ totalProjects: projects, totalWOValue: wo, totalInvoiceRaised: raised, totalPaymentReceived: cash, totalOutstanding: wo - cash, totalExpenses: 0, totalActualProjectCost: cost, totalProfit: 0, totalProfitPercentage: 0, ...extra });
// Synthetic figures with the shape of the QA run: 295 accessible projects = 43 INR + 84 AED + 84 QAR + 42 MYR + 42 OMR.
const ALL_COUNTRIES = {
  kpis: K(295, 10_000_000, 541_758, 76_779, 10_505_000),
  kpiCurrency: "INR",
  otherCurrencies: [
    { currency: "AED", ...K(84, 16_080_373, 983_507, 155_993, 438_359.1, { manhourIncompleteProjects: 3 }) },
    { currency: "QAR", ...K(84, 16_027_500, 984_374.98, 156_834.01, 430_082.65) },
    { currency: "MYR", ...K(42, 8_064_802, 494_606, 78_879, 222_571.44) },
    { currency: "OMR", ...K(42, 8_005_644, 491_182, 76_894.5, 201_802.086) },
  ],
  topClients: [], recentProjects: [],
  departments: deptBlock([dept("Process", 1)]),
  departmentsByCountry: SEVEN_DEPTS,
};
const groupsMod = () => load("/src/utils/dashboardCurrencyGroups.ts");

test("currency groups: five groups, each with its own project count and the six figures, derived with the headline formulas and nothing added across currencies", async () => {
  const { currencyGroups } = await groupsMod();
  const groups = currencyGroups(ALL_COUNTRIES);
  assert.deepEqual(groups.map((g) => [g.currency, g.projects]), [["INR", 43], ["AED", 84], ["QAR", 84], ["MYR", 42], ["OMR", 42]]);
  assert.equal(groups.reduce((n, g) => n + g.projects, 0), 295, "every project is in exactly one group: no duplicate counting");
  const inr = groups[0];
  assert.equal(inr.unbilled, 10_000_000 - 541_758);
  assert.equal(Number(inr.billedInPercent.toFixed(3)), 5.418);
  const aed = groups[1];
  assert.equal(aed.workOrderValue, 16_080_373);
  assert.equal(aed.unbilled, 16_080_373 - 983_507);
  assert.equal(aed.actualProjectCost, 438_359.1);
  assert.equal(aed.rateNotSetProjects, 3);
  assert.deepEqual(aed.countries, ["Abu Dhabi", "FZE"], "AED covers Abu Dhabi and FZE");
  assert.deepEqual(groups[2].countries, ["Elixir Qatar", "Qatar"], "QAR covers Elixir Qatar and Qatar");
  assert.deepEqual(groups[0].countries, ["India"]);
  // Never below zero, never above 100 %, never divided by zero.
  const odd = currencyGroups({ kpis: K(2, 100, 250, 0, 0), kpiCurrency: "OMR", otherCurrencies: [{ currency: "AED", ...K(1, 0, 5, 0, 0) }], departmentsByCountry: [] });
  assert.equal(odd[0].unbilled, 0);
  assert.equal(odd[0].billedInPercent, 100);
  assert.equal(odd[1].billedInPercent, 0);
  assert.deepEqual(odd[0].countries, [], "an older backend sends no per-country sections");
});

test("All Countries: one compact card per currency with its title, project count and six figures in its own currency; the totals are never added together", async () => {
  const html = await render("/src/pages/Dashboard/components/KPISection.tsx", ALL_COUNTRIES);
  const text = (testid) => [...html.matchAll(new RegExp('data-testid="' + testid + '"[^>]*>\\s*([^<]+?)\\s*<', "g"))].map((m) => m[1].replace(/\s+/g, " "));
  assert.deepEqual(text("currency-group-code"), ["INR", "AED", "QAR", "MYR", "OMR"]);
  assert.deepEqual(text("currency-group-countries"), ["India", "Abu Dhabi + FZE", "Elixir Qatar + Qatar", "Malaysia", "Oman"]);
  const counts = [...html.matchAll(/data-testid="currency-group-projects"[^>]*>\s*([^<]+?)\s*</g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  assert.deepEqual(counts, ["43 projects", "84 projects", "84 projects", "42 projects", "42 projects"]);
  assert.doesNotMatch(html, /dept-panel/, "no leftover department markup");
  const group = (code) => { const i = html.indexOf('data-currency-group="' + code + '"'); const next = html.indexOf('data-currency-group="', i + 1); return html.slice(i, next < 0 ? html.length : next); };
  for (const label of ["Work Order Value", "Unbilled", "Invoice Raised", "Payment Received", "Actual Project Cost", "Billed In %"]) {
    for (const code of ["INR", "AED", "QAR", "MYR", "OMR"]) assert.ok(group(code).includes(">" + label + "<"), code + " carries " + label);
  }
  assert.match(group("AED"), /AED 16\.08M/);
  assert.match(group("AED"), /AED 15\.1M/);
  assert.match(group("AED"), /6\.12 %/);
  assert.match(group("QAR"), /QAR 16\.03M/);
  assert.match(group("MYR"), /RM 8\.06M/);
  assert.match(group("OMR"), /OMR 8\.01M/);
  assert.match(group("INR"), /₹ 1 Cr/);
  assert.match(group("INR"), /5\.42 %/);
  // No rupee sign inside a non-INR group, and no figure that adds currencies (INR 1.00 Cr + 16.08M ... would be around 26.1M).
  for (const code of ["AED", "QAR", "MYR", "OMR"]) assert.doesNotMatch(group(code), /₹/, code);
  assert.doesNotMatch(html, /48\.\d+M|26\.\d+M/);
  assert.match(html, /295 accessible projects in 5 currencies/);
  assert.match(html, /the cards above cover INR projects only \(43\)/);
  assert.match(html, /Rate not set · 3 projects/, "a compact marker stays in the Actual Project Cost cell");
  assert.doesNotMatch(html, /because no manpower conversion rate has been applied yet|Rate not set: man-hour cost/, "the long explanatory sentences are not shown");
  // The section opens by default and has one Hide / Show toggle; the figures sit in an aligned table, one row per currency.
  assert.match(html, /aria-controls="currency-groups-body"[^>]*>|aria-expanded="true"[^>]*aria-controls="currency-groups-body"/);
  assert.match(html, /Hide/);
  assert.doesNotMatch(html, /id="currency-groups-body" hidden/);
  assert.match(html, /Billed In %/);
  assert.match(html, /width:6\.12%|width:6\.1\d*%/, "Billed In % shows a small progress bar");
});

test("a single currency (one country, India-only, an older backend) shows no group section at all: the dashboard is exactly as before", async () => {
  const oman = await render("/src/pages/Dashboard/components/KPISection.tsx", { kpis: K(42, 8_005_644, 491_182, 76_894.5, 201_802.086), kpiCurrency: "OMR", otherCurrencies: [], topClients: [], recentProjects: [], departmentsByCountry: [SEVEN_DEPTS[2]] });
  assert.doesNotMatch(oman, /currency-groups|data-currency-group/);
  assert.match(oman, /OMR 8\.01M/);
  const india = await render("/src/pages/Dashboard/components/KPISection.tsx", { kpis: K(42, 9_500_000, 541_758, 76_779, 10_310_000), kpiCurrency: "INR", otherCurrencies: [], topClients: [], recentProjects: [] });
  assert.doesNotMatch(india, /currency-groups/);
  const older = await render("/src/pages/Dashboard/components/KPISection.tsx", { kpis: K(3, 5000, 0, 0, 0), topClients: [], recentProjects: [] });
  assert.doesNotMatch(older, /currency-groups/);
});

test("a user with two currencies (India + Oman) gets exactly two groups, each with only its own projects", async () => {
  const { currencyGroups } = await groupsMod();
  const groups = currencyGroups({ kpis: K(84, 9_500_000, 541_758, 76_779, 10_310_000), kpiCurrency: "INR", otherCurrencies: [{ currency: "OMR", ...K(42, 8_005_644, 491_182, 76_894.5, 201_802.086) }], departmentsByCountry: [SEVEN_DEPTS[0], SEVEN_DEPTS[2]] });
  assert.deepEqual(groups.map((g) => [g.currency, g.projects, g.countries.join("+")]), [["INR", 42, "India"], ["OMR", 42, "Oman"]]);
});
