// Global Multi-Country Phase 3 (Reports): the Reports module is country-aware. A project's country is the one its stored PR Category maps to; every
// country + currency group is calculated and rendered on its own, in its own currency, and groups are NEVER added together. These tests cover all
// seven regions: per-country isolation, correct currency and symbol in cards / tables / charts / exports, All Regions kept separate, India unchanged,
// empty and zero handling, and that the temporary "figures are in rupees" banner is gone.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
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
    // The registry's per-project PDF button reads the app's toast provider, which portals into the document (not available server-side). This test
    // renders the table only, so that one hook is replaced by a no-op for THIS test server; nothing else is stubbed.
    plugins: [
      {
        name: "stub-pmo-toast",
        enforce: "pre",
        resolveId: (id) => (/usePmoToast$/.test(id) ? "virtual-stub-pmo-toast" : null),
        load: (id) => (id === "virtual-stub-pmo-toast" ? "export function usePmoToast(){return {showToast(){},dismissToast(){}}}" : null),
      },
    ],
  });
  load = (p) => vite.ssrLoadModule(p);
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});
after(() => vite?.close());

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

// The backend's PR Category -> country reference, as the Reports page reads it (FZE's stored category name is FZI).
const REFERENCE = {
  enforced: true,
  items: [
    { prCategory: "India", prNoPrefix: "1", country: { code: "IN", name: "India", displayName: "India", defaultCurrency: "INR" }, authorized: true },
    { prCategory: "Malaysia", prNoPrefix: "2", country: { code: "MY", name: "Malaysia", displayName: "Malaysia", defaultCurrency: "MYR" }, authorized: true },
    { prCategory: "Oman", prNoPrefix: "3", country: { code: "OM", name: "Oman", displayName: "Oman", defaultCurrency: "OMR" }, authorized: true },
    { prCategory: "Abu Dhabi", prNoPrefix: "4", country: { code: "AD", name: "Abu Dhabi", displayName: "Abu Dhabi", defaultCurrency: "AED" }, authorized: true },
    { prCategory: "FZI", prNoPrefix: "5", country: { code: "FZE", name: "FZI", displayName: "FZE", defaultCurrency: "AED" }, authorized: true },
    { prCategory: "Elixir Qatar", prNoPrefix: "6", country: { code: "EQ", name: "Elixir Qatar", displayName: "Elixir Qatar", defaultCurrency: "QAR" }, authorized: true },
    { prCategory: "Qatar", prNoPrefix: "7", country: { code: "QA", name: "Qatar", displayName: "Qatar", defaultCurrency: "QAR" }, authorized: true },
  ],
};

const REGIONS = [
  { category: "India", label: "India", currency: "INR", regional: null, wo: 1_000_000, expected: /₹ 10 L/ },
  { category: "Malaysia", label: "Malaysia", currency: "MYR", regional: "MYR", wo: 43_200, expected: /RM 43\.2K/ },
  { category: "Oman", label: "Oman", currency: "OMR", regional: "OMR", wo: 3_696, expected: /OMR 3\.7K/ },
  { category: "Abu Dhabi", label: "Abu Dhabi", currency: "AED", regional: "AED", wo: 35_232, expected: /AED 35\.23K/ },
  { category: "FZI", label: "FZE", currency: "AED", regional: "AED", wo: 20_000, expected: /AED 20K/ },
  { category: "Elixir Qatar", label: "Elixir Qatar", currency: "QAR", regional: "QAR", wo: 12_000, expected: /QAR 12K/ },
  { category: "Qatar", label: "Qatar", currency: "QAR", regional: "QAR", wo: 8_000, expected: /QAR 8K/ },
];

/** A project as the live Reports data delivers it. For a regional-currency project the INR-named WO value is 0 by design; the regional value is separate. */
function project(region, over = {}) {
  const nonInr = region.regional !== null;
  return {
    id: `p-${region.category}`,
    prNo: `PR-${region.category}`,
    prCategory: region.category,
    client: `${region.label} Client`,
    projectTitle: `${region.label} Study`,
    department: "Process Safety",
    projectStatus: "Active",
    regionalCurrency: region.regional,
    workOrderValueINR: nonInr ? 0 : region.wo,
    workOrderValueRegional: region.wo,
    nonManhourExpenses: [{ id: "e1", quantity: 1, unitCost: region.wo / 10, totalCost: region.wo / 10 }],
    resources: [],
    quantityItems: [],
    invoiceItems: [],
    manhourBudgetAmount: 0,
    nonManhourBudgetAmount: 0,
    ...over,
  };
}

const projects = REGIONS.map((r) => project(r));

test("country comes from the stored PR Category via the backend reference, never the PR number prefix", async () => {
  const { countryOfProject } = await load("/src/components/reports/reportCurrency.ts");
  // A PR number that LOOKS like Oman's prefix on an India project must not change its country.
  assert.deepEqual(countryOfProject({ prCategory: "India", prNo: "3-001" }, REFERENCE), { key: "IN", label: "India" });
  assert.equal(countryOfProject({ prCategory: "FZI" }, REFERENCE).label, "FZE", "stored FZI reads as FZE");
  // Without the reference (a caller who cannot read it) the stored category name is the label; nothing is guessed.
  assert.deepEqual(countryOfProject({ prCategory: "Oman" }, null), { key: "category:Oman", label: "Oman" });
  assert.deepEqual(countryOfProject({ prCategory: "" }, REFERENCE), { key: "none", label: "No country" });
});

test("All Regions: seven separate groups, one currency each, never merged (AED twice, QAR twice)", async () => {
  const { groupReportProjects } = await load("/src/components/reports/reportCurrency.ts");
  const groups = groupReportProjects(projects, REFERENCE);
  assert.equal(groups.length, 7, "Abu Dhabi and FZE share AED, Elixir Qatar and Qatar share QAR, yet stay separate countries");
  assert.deepEqual(groups.map((g) => `${g.countryLabel}|${g.currency}`).sort(), [
    "Abu Dhabi|AED", "Elixir Qatar|QAR", "FZE|AED", "India|INR", "Malaysia|MYR", "Oman|OMR", "Qatar|QAR",
  ]);
  for (const g of groups) assert.equal(g.projects.length, 1);
});

test("a country with older INR-entered projects and newer regional ones is two groups, never one mixed total", async () => {
  const { groupReportProjects } = await load("/src/components/reports/reportCurrency.ts");
  const legacyOman = project({ category: "Oman", label: "Oman", regional: null, wo: 500_000 }, { id: "legacy-oman" });
  const newOman = project(REGIONS[2], { id: "new-oman" });
  const groups = groupReportProjects([legacyOman, newOman], REFERENCE);
  assert.deepEqual(groups.map((g) => `${g.countryLabel}|${g.currency}`).sort(), ["Oman|INR", "Oman|OMR"]);
});

test("report basis: a regional project carries its REGIONAL value; an INR / legacy project is returned untouched; LD never crosses currency", async () => {
  const { reportBasis } = await load("/src/components/reports/reportCurrency.ts");
  const india = project(REGIONS[0], { ldApplicable: true, ldAmountINR: 5000 });
  assert.equal(reportBasis(india), india, "India / legacy: the very same object, nothing adapted");
  const oman = project(REGIONS[2], { ldApplicable: true, ldAmountINR: 5000 });
  const basis = reportBasis(oman);
  assert.equal(basis.workOrderValueINR, 3_696, "report input is the OMR value");
  assert.equal(basis.ldApplicable, null);
  assert.equal(basis.ldAmountINR, null);
  assert.equal(oman.workOrderValueINR, 0, "the stored project is never modified");
  assert.equal(oman.ldAmountINR, 5000);
});

test("per-group analytics: each country's totals are its own, with no mixing", async () => {
  const { groupReportProjects } = await load("/src/components/reports/reportCurrency.ts");
  const { computeReportAnalytics } = await load("/src/components/reports/reportAnalytics.ts");
  const groups = groupReportProjects(projects, REFERENCE);
  for (const region of REGIONS) {
    const group = groups.find((g) => g.countryLabel === region.label);
    const a = computeReportAnalytics(group.projects, new Map(), true);
    assert.equal(a.totalWOValue, region.wo, `${region.label}: Work Order Value is that country's only`);
    assert.equal(a.totalExpenses, region.wo / 10, `${region.label}: expenses are that country's only`);
  }
  // Prove the bug this replaces: one pass over everything adds rupees to dirhams, rials and ringgit.
  const mixed = computeReportAnalytics(projects.map((p) => (p.regionalCurrency ? { ...p, workOrderValueINR: p.workOrderValueRegional } : p)), new Map(), true);
  assert.equal(mixed.totalWOValue, REGIONS.reduce((s, r) => s + r.wo, 0), "a single combined pass would produce one meaningless number");
});

test("Phase 4: a non-INR section counts only man-hour cost converted with a rate; a row with no rate is 0 and flagged; India still includes its INR cost", async () => {
  const { groupReportProjects, hasManhourRateMissing } = await load("/src/components/reports/reportCurrency.ts");
  const { computeReportAnalytics } = await load("/src/components/reports/reportAnalytics.ts");
  const resources = [{ id: "r1", employeeNo: "E1", totalHours: 100, manhourCost: 125_000 }];
  const oman = project(REGIONS[2], { resources });
  const india = project(REGIONS[0], { resources });
  assert.equal(hasManhourRateMissing(oman), true, "no costingStatus: Rate not set");
  assert.equal(hasManhourRateMissing(india), false);
  const groups = groupReportProjects([oman, india], REFERENCE);
  const omanGroup = groups.find((g) => g.countryLabel === "Oman");
  const indiaGroup = groups.find((g) => g.countryLabel === "India");
  assert.equal(omanGroup.manhourRateMissingProjects, 1);
  assert.equal(indiaGroup.manhourRateMissingProjects, 0);
  const omanA = computeReportAnalytics(omanGroup.projects, new Map(), true);
  assert.equal(omanA.totalExpenses, 369.6, "OMR expenses only: the 125,000 INR man-hour cost is not added");
  assert.equal(omanA.totalManhourExpenses, 0);
  assert.equal(omanGroup.projects[0].resources[0].totalHours, 100, "hours are kept");
  assert.equal(oman.resources[0].manhourCost, 125_000, "the stored project is never modified");
  const indiaA = computeReportAnalytics(indiaGroup.projects, new Map(), true);
  assert.equal(indiaA.totalManhourExpenses, 125_000, "India keeps its man-hour cost exactly as before");
  assert.equal(indiaA.totalExpenses, 100_000 + 125_000);

  // Converted rows (the backend applied the project's rate): only their regional amount counts, and nothing is flagged.
  const converted = project(REGIONS[2], {
    id: "oman-converted",
    resources: [{ id: "r2", employeeNo: "E1", totalHours: 100, manhourCost: 125_000, costingStatus: "CONVERTED", manhourCostRegional: 514.073, fxRateInrPerRegional: 243.156 }],
  });
  assert.equal(hasManhourRateMissing(converted), false);
  const convertedGroup = groupReportProjects([converted], REFERENCE)[0];
  assert.equal(convertedGroup.manhourRateMissingProjects, 0);
  const convertedA = computeReportAnalytics(convertedGroup.projects, new Map(), true);
  assert.equal(convertedA.totalManhourExpenses, 514.073, "the OMR amount, not the INR 125,000");
  assert.equal(convertedA.totalExpenses, Number((369.6 + 514.073).toFixed(3)));
  // A mix of converted and unconverted rows on one project counts only the converted ones and flags the project.
  const mixed = project(REGIONS[2], {
    id: "oman-mixed",
    resources: [
      { id: "r3", employeeNo: "E1", totalHours: 100, manhourCost: 125_000, costingStatus: "CONVERTED", manhourCostRegional: 514.073 },
      { id: "r4", employeeNo: "E2", totalHours: 50, manhourCost: 40_000, costingStatus: "RATE_MISSING", manhourCostRegional: null },
    ],
  });
  assert.equal(hasManhourRateMissing(mixed), true);
  const mixedA = computeReportAnalytics(groupReportProjects([mixed], REFERENCE)[0].projects, new Map(), true);
  assert.equal(mixedA.totalManhourExpenses, 514.073);
});

test("a specific country filter keeps only that country's projects; All Regions keeps every one", async () => {
  const { matchesCountryFilter, countryOptions } = await load("/src/components/reports/reportCurrency.ts");
  for (const region of REGIONS) {
    const kept = projects.filter((p) => matchesCountryFilter(p, REFERENCE.items.find((i) => i.prCategory === region.category).country.code, REFERENCE));
    assert.deepEqual(kept.map((p) => p.prCategory), [region.category]);
  }
  assert.equal(projects.filter((p) => matchesCountryFilter(p, "ALL", REFERENCE)).length, 7);
  // Options list only the countries present in what the caller may read: an unauthorized country never appears.
  const visible = projects.filter((p) => p.prCategory === "India" || p.prCategory === "Oman");
  assert.deepEqual(countryOptions(visible, REFERENCE).map((o) => o.label), ["India", "Oman"]);
});

test("KPI cards read the right symbol / code for every country, and India is unchanged", async () => {
  const { groupReportProjects } = await load("/src/components/reports/reportCurrency.ts");
  const { computeReportAnalytics } = await load("/src/components/reports/reportAnalytics.ts");
  const { ReportGroupContext } = await load("/src/components/reports/reportCurrencyContext.ts");
  const { ExecutiveSummaryCards } = await load("/src/components/reports/ExecutiveSummary/ExecutiveSummaryCards.tsx");
  const { InvoiceAccessContext } = await load("/src/components/reports/Shared/invoiceAccess.ts");
  const groups = groupReportProjects(projects, REFERENCE);
  for (const region of REGIONS) {
    const group = groups.find((g) => g.countryLabel === region.label);
    const analytics = computeReportAnalytics(group.projects, new Map(), true);
    const html = renderToStaticMarkup(
      React.createElement(
        InvoiceAccessContext.Provider,
        { value: true },
        React.createElement(
          ReportGroupContext.Provider,
          { value: { currency: group.currency, countryLabel: group.countryLabel, label: group.label } },
          React.createElement(ExecutiveSummaryCards, { analytics, onDrillDown: () => undefined, invoiceDataAvailable: true })
        )
      )
    );
    assert.match(html, region.expected, `${region.label}: Work Order Value in ${region.currency}`);
    if (region.currency !== "INR") {
      assert.doesNotMatch(html, /₹/, `${region.label}: no rupee sign anywhere on a ${region.currency} card`);
    }
  }
});

test("Project Commercial Registry: shows the country, names the currency, formats every amount in it", async () => {
  const { groupReportProjects } = await load("/src/components/reports/reportCurrency.ts");
  const { ReportGroupContext } = await load("/src/components/reports/reportCurrencyContext.ts");
  const { ExecutiveSummaryTable } = await load("/src/components/reports/ExecutiveSummary/ExecutiveSummaryTable.tsx");
  const { InvoiceAccessContext } = await load("/src/components/reports/Shared/invoiceAccess.ts");
  const groups = groupReportProjects(projects, REFERENCE);
  const oman = groups.find((g) => g.countryLabel === "Oman");
  const html = renderToStaticMarkup(
    React.createElement(
      InvoiceAccessContext.Provider,
      { value: true },
      React.createElement(
        ReportGroupContext.Provider,
        { value: { currency: "OMR", countryLabel: "Oman", label: oman.label } },
        React.createElement(ExecutiveSummaryTable, { projects: oman.projects, invoiceDataAvailable: true })
      )
    )
  );
  assert.match(html, /data-testid="registry-country-header"/);
  assert.match(html, /data-testid="registry-country"[^>]*>Oman</);
  assert.match(html, /WO Value \(OMR\)/);
  assert.match(html, /OMR 3\.7K/, "work order value in OMR");
  assert.match(html, /OMR 369\.6/, "expenses in OMR, not zero and not rupees");
  assert.doesNotMatch(html, /₹/);
});

test("empty and zero: a group with nothing renders zero in its own currency, never a rupee zero", async () => {
  const { computeReportAnalytics } = await load("/src/components/reports/reportAnalytics.ts");
  const { ReportGroupContext } = await load("/src/components/reports/reportCurrencyContext.ts");
  const { FinancialCards } = await load("/src/components/reports/Financial/FinancialCards.tsx");
  const { InvoiceAccessContext } = await load("/src/components/reports/Shared/invoiceAccess.ts");
  const analytics = computeReportAnalytics([], new Map(), true);
  assert.equal(analytics.totalWOValue, 0);
  const html = renderToStaticMarkup(
    React.createElement(
      InvoiceAccessContext.Provider,
      { value: true },
      React.createElement(ReportGroupContext.Provider, { value: { currency: "QAR", countryLabel: "Qatar", label: "Qatar · QAR" } }, React.createElement(FinancialCards, { analytics }))
    )
  );
  assert.match(html, /QAR 0</);
  assert.doesNotMatch(html, /₹/);
});

test("exports: Country and Currency lead every row, existing columns keep their names and order, files are named per country", async () => {
  const { withGroupColumns, exportFileBase } = await load("/src/components/reports/reportCurrency.ts");
  const rows = [{ prNo: "PR-1", woValue: 3696, expenses: 369.6 }];
  const out = withGroupColumns(rows, { currency: "OMR", countryLabel: "Oman", label: "Oman · OMR" });
  assert.deepEqual(Object.keys(out[0]), ["Country", "Currency", "prNo", "woValue", "expenses"]);
  assert.equal(out[0].Country, "Oman");
  assert.equal(out[0].Currency, "OMR");
  assert.equal(out[0].woValue, 3696, "no silent zero, no conversion");
  assert.equal(withGroupColumns(rows, { currency: "INR", countryLabel: "", label: "" }), rows, "outside a group the rows are returned as they are");
  assert.equal(exportFileBase("PMO_Executive_Summary_Report", { currency: "AED", countryLabel: "Abu Dhabi", label: "" }), "PMO_Executive_Summary_Report_Abu_Dhabi");
  assert.equal(exportFileBase("PMO_Executive_Summary_Report", { currency: "INR", countryLabel: "", label: "" }), "PMO_Executive_Summary_Report");
});

test("the temporary rupee banner is gone, the legacy domestic/foreign filter is gone, and no report component formats with the INR-only formatter", () => {
  const page = src("pages/ReportsPage.tsx");
  assert.ok(!page.includes("reports-currency-note"), "banner removed");
  assert.ok(!page.includes("not added into these rupee totals"));
  assert.ok(!src("components/reports/useReportsData.ts").includes("domesticForeign"), "Country / Region no longer filters on domesticForeign");
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(name) && /formatBusinessINR/.test(readFileSync(full, "utf8"))) offenders.push(full);
    }
  };
  walk(fileURLToPath(new URL("../src/components/reports", import.meta.url)));
  assert.deepEqual(offenders, [], "every report component formats through useReportMoney()");
});
