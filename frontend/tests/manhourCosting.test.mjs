// Phase 4 (frontend): country-aware manpower costing. The employee's INR rate and the existing INR calculation are unchanged; for a non-INR project the
// INR amount is converted ONCE with the project's own manpower rate ("1 regional unit = X INR": regional = INR / X), rounded half-up to the currency's
// decimals (OMR 3, others 2). These tests cover the exact conversion, Expense Budget and Team Assigned for all seven countries, the "Rate not set"
// state (never an INR number labelled in another currency), and that India is unchanged. Rates here are TEST FIXTURES (243.156 is the brief's example).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// An in-memory localStorage, seeded BEFORE any app module loads (the services read it at first use).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
const employee = (employeeNo, rate, grade) => ({
  id: employeeNo, employeeNo, employeeName: `Emp ${employeeNo}`, designation: "Engineer", department: "Process", location: "Chennai",
  reportingManager: "Mgr", grade, manhourExpenses: rate, status: "Active", createdAt: "2026-01-01T00:00:00Z",
});
store.set("employees_v6", JSON.stringify([employee("E1", 1250, "MG4"), employee("E2", 800, "MG2")]));
const entry = (id, employeeNo, date, hours) => ({ id, employeeNo, employeeName: `Emp ${employeeNo}`, projectCode: "PR-P4", projectName: "P4 project", date, hours, status: "Active" });
store.set(
  "timesheets_imports",
  JSON.stringify([
    {
      id: "m1", month: "2026-10", importType: "monthly", uploadedAt: "2026-10-31T00:00:00Z", uploadedBy: "Test",
      entries: [entry("a1", "E1", "2026-10-01", 60), entry("a2", "E1", "2026-10-02", 40), entry("b1", "E2", "2026-10-01", 50)],
    },
  ])
);

let vite;
let load;
let React;
let renderToStaticMarkup;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    // The central-costing hook fetches in an effect (not run server-side); it is replaced by a stub that returns whatever the test sets on globalThis.__costingState.
    plugins: [
      {
        // The central-costing hook fetches in an effect (not run server-side). Replaced by a stub that returns whatever the test sets on globalThis.__costingState.
        name: "stub-manhour-costing-hook",
        enforce: "pre",
        resolveId: (id) => (/useManhourCosting$/.test(id) ? "virtual-stub-manhour-costing" : null),
        load: (id) => (id === "virtual-stub-manhour-costing" ? "export function useManhourCosting(){return globalThis.__costingState}" : null),
      },
      {
        // Loading the real projectService starts a background hydrate (network / IndexedDB) that outlives these pure tests. The Expense Budget analysis only
        // needs it for its default project lookup, which these tests bypass by passing the project in, so a no-op stand-in is enough.
        name: "stub-project-service",
        enforce: "pre",
        resolveId: (id) => (/\/projectService$/.test(id) ? "virtual-stub-project-service" : null),
        load: (id) => (id === "virtual-stub-project-service" ? "export function getProjectById(){return null}\nexport function getProjects(){return []}" : null),
      },
    ],
  });
  load = (p) => vite.ssrLoadModule(p);
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});
after(() => vite?.close());

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

const COUNTRIES = [
  { country: "India", currency: "INR" },
  { country: "Malaysia", currency: "MYR" },
  { country: "Oman", currency: "OMR" },
  { country: "Abu Dhabi", currency: "AED" },
  { country: "FZE", currency: "AED" },
  { country: "Elixir Qatar", currency: "QAR" },
  { country: "Qatar", currency: "QAR" },
];

test("exact conversion: INR / rate, half-up once to the currency's decimals; the brief's worked example", async () => {
  const { convertInrToProjectCurrency, manhourMinorUnits } = await load("/src/utils/manhourCosting.ts");
  assert.equal(convertInrToProjectCurrency(125_000, 243.156, "OMR"), 514.073);
  assert.equal(convertInrToProjectCurrency(1_250, 243.156, "OMR"), 5.141);
  assert.equal(convertInrToProjectCurrency(125_000, "243.156", "OMR"), 514.073, "a numeric string rate is accepted");
  assert.equal(manhourMinorUnits("OMR"), 3);
  for (const currency of ["MYR", "AED", "QAR"]) assert.equal(manhourMinorUnits(currency), 2);
  assert.equal(convertInrToProjectCurrency(1_000, 3, "AED"), 333.33);
  assert.equal(convertInrToProjectCurrency(1_000, 3, "OMR"), 333.333);
  // Half-up, not banker's and not floating-point luck: 0.01 / 2 = 0.005 -> 0.01; 1.0005 OMR -> 1.001.
  assert.equal(convertInrToProjectCurrency(0.01, 2, "AED"), 0.01);
  assert.equal(convertInrToProjectCurrency(2.001, 2, "OMR"), 1.001);
  assert.equal(convertInrToProjectCurrency(0.3, 0.3, "AED"), 1, "no floating-point drift");
  assert.equal(convertInrToProjectCurrency(0, 243.156, "OMR"), 0, "zero hours / zero cost stay zero");
  assert.ok(convertInrToProjectCurrency(125_000, 243.156, "OMR") < 125_000, "divided by the rate, never multiplied");
});

test("a missing, zero, negative or invalid rate converts to nothing (callers show \"Rate not set\"), never an INR amount", async () => {
  const { convertInrToProjectCurrency, hasUsableRate } = await load("/src/utils/manhourCosting.ts");
  for (const bad of [null, undefined, 0, -5, "abc", NaN, Infinity, ""]) assert.equal(convertInrToProjectCurrency(125_000, bad, "OMR"), 0, `rate ${String(bad)}`);
  assert.equal(hasUsableRate(null), false);
  assert.equal(hasUsableRate({ current: null }), false);
  assert.equal(hasUsableRate({ current: { inrPerRegionalUnit: "0.000000" } }), false);
  assert.equal(hasUsableRate({ current: { inrPerRegionalUnit: "243.156000" } }), true);
});

const project = (category, currency, over = {}) => ({
  id: `p-${category}`, prNo: "PR-P4", prCategory: category, projectTitle: `${category} project`, client: "C", department: "Process",
  projectStatus: "Active", regionalCurrency: currency === "INR" ? null : currency, workOrderValueINR: currency === "INR" ? 1_000_000 : 0,
  workOrderValueRegional: 1_000_000, manhourBudgetAmount: 1_000, nonManhourBudgetAmount: 200, nonManhourExpenses: [{ id: "x", totalCost: 100 }],
  resources: [], quantityItems: [], invoiceItems: [], ...over,
});

/**
 * The server's central costing (GET /projects/:id/manhour-costing) as a fixture. The amounts are what the BACKEND would store; these tests prove the
 * screens present exactly those figures and never price hours themselves. Rates are TEST FIXTURES (243.156 is the brief's example).
 */
function costingFixture(currency, { rate = 25, missing = false, status = "CURRENT", projectId = "p-fixture", rows = [["E1", 100, 1250], ["E2", 50, 800]] } = {}) {
  const requiresRate = currency !== "INR";
  const digits = currency === "OMR" ? 3 : 2;
  const out = rows.map(([employeeNo, hours, hourly]) => {
    const costInr = Math.round(hours * hourly * 100) / 100;
    const costRegional = requiresRate && !missing ? Number((costInr / rate).toFixed(digits)) : null;
    return {
      employeeNo, totalHours: hours, workingDays: 1, hourlyRateInr: hourly, costInr, costCurrency: currency,
      costingStatus: !requiresRate ? "INR" : missing ? "RATE_MISSING" : "CONVERTED",
      fxRateVersion: !requiresRate || missing ? null : 1, fxRateInrPerRegional: !requiresRate || missing ? null : rate, costRegional,
      months: [{ month: "2026-10", hours, costInr, costRegional }],
    };
  });
  const costInr = Math.round(out.reduce((s, r) => s + r.costInr, 0) * 100) / 100;
  const converted = out.reduce((s, r) => s + (r.costRegional ?? 0), 0);
  return {
    projectId, regionalCurrency: currency, requiresRate, refreshStatus: status, rows: out,
    countryRate: requiresRate && !missing ? { countryName: "Fixture country", version: 1, inrPerRegionalUnit: rate, effectiveFrom: "2026-11-01T00:00:00Z" } : null,
    totals: { costInr, costInProjectCurrency: requiresRate ? Number(converted.toFixed(digits)) : costInr, rateNotSetRows: requiresRate ? out.filter((r) => r.costRegional === null).length : 0 },
  };
}

test("central figures: an employee's cost for the lifetime or one month, totals equal the sum of the rows, a missing rate is null (never an INR amount), an unknown employee is null", async () => {
  const { employeeCostFigure, costingTotals } = await load("/src/utils/manhourCosting.ts");
  const costing = costingFixture("OMR", { rate: 250, rows: [["E1", 100, 1000]] });
  costing.rows[0].months = [
    { month: "2026-09", hours: 40, costInr: 40_000, costRegional: 160 },
    { month: "2026-10", hours: 60, costInr: 60_000, costRegional: 240 },
  ];
  const life = employeeCostFigure(costing, " e1 ");
  assert.equal(life.costInr, 100_000);
  assert.equal(life.costProject, 400);
  assert.equal(life.hourlyProject, 4, "derived from the authoritative cost and hours");
  assert.equal(life.hourlyInr, 1000);
  const oct = employeeCostFigure(costing, "E1", "2026-10");
  assert.deepEqual([oct.hours, oct.costInr, oct.costProject], [60, 60_000, 240]);
  assert.equal(employeeCostFigure(costing, "E1", "2026-08").costProject, 0, "a month with no hours");
  assert.equal(employeeCostFigure(costing, "NOPE"), null);
  assert.equal(employeeCostFigure(null, "E1"), null);
  const totals = costingTotals(costing, ["E1", "NOPE"]);
  assert.deepEqual([totals.costInr, totals.costProject, totals.missing], [100_000, 400, 1]);
  const none = costingFixture("OMR", { missing: true });
  assert.equal(employeeCostFigure(none, "E1").costProject, null, "Rate not set: no project-currency figure");
  const noneTotals = costingTotals(none, ["E1", "E2"]);
  assert.deepEqual([noneTotals.costProject, noneTotals.rateNotSet, noneTotals.costInr], [0, 2, 165_000]);
  const inr = costingFixture("INR");
  assert.equal(employeeCostFigure(inr, "E1").costProject, 125_000, "an INR project's own money is its INR figure");
});

test("Expense Budget, all seven countries: the actual man-hour cost IS the server's figure (never priced here); INR is never added to a regional amount", async () => {
  const { calculateBudgetExecution } = await load("/src/services/expenseBudgetAnalysisService.ts");
  for (const { country, currency } of COUNTRIES) {
    const p = project(country, currency);
    const costing = costingFixture(currency);
    const a = calculateBudgetExecution(p.id, p, costing);
    assert.equal(a.actualManhourBudgetInr, 165_000, `${country}: INR as stored`);
    assert.equal(a.actualManhourBudget, costing.totals.costInProjectCurrency, `${country}: exactly the server's project-currency total`);
    assert.equal(a.manhourCostingPending, false);
    assert.equal(a.manhourRateMissing, false);
    if (currency === "INR") assert.equal(a.actualTotalBudget, 165_100);
    else {
      assert.ok(a.actualTotalBudget < 165_000, `${country}: the INR 165,000 is not in the regional total`);
      assert.equal(a.actualTotalBudget, Number((costing.totals.costInProjectCurrency + 100).toFixed(currency === "OMR" ? 3 : 2)));
    }
  }
});

test("Expense Budget is pending (not zero) until the server costing loads, flags missing FX rates, and carries the refresh status", async () => {
  const { calculateBudgetExecution } = await load("/src/services/expenseBudgetAnalysisService.ts");
  const p = project("Oman", "OMR");
  const loading = calculateBudgetExecution(p.id, p, null);
  assert.equal(loading.manhourCostingPending, true);
  assert.equal(loading.actualManhourBudget, 0);
  const missing = calculateBudgetExecution(p.id, p, costingFixture("OMR", { missing: true }));
  assert.equal(missing.manhourRateMissing, true);
  assert.equal(missing.actualManhourBudget, 0);
  assert.equal(missing.actualTotalBudget, 100, "only the non-man-hour expenses, which are already OMR");
  assert.equal(missing.actualManhourBudgetInr, 165_000, "the INR figure is kept for reference");
  assert.equal(calculateBudgetExecution(p.id, p, costingFixture("OMR", { status: "FAILED" })).manhourRefreshStatus, "FAILED");
  assert.equal(calculateBudgetExecution(p.id, p, costingFixture("OMR")).manhourRefreshStatus, "CURRENT");
});

test("OMR precision: Expense Budget keeps 3 decimals for an OMR project and the same 2 as before for every other currency and for INR", async () => {
  const { calculateBudgetExecution } = await load("/src/services/expenseBudgetAnalysisService.ts");
  const omr = calculateBudgetExecution("p", project("Oman", "OMR", { nonManhourExpenses: [{ id: "x", totalCost: 12.345 }] }), costingFixture("OMR", { rate: 243.156 }));
  assert.equal(omr.actualNonManhourBudget, 12.345);
  assert.equal(omr.actualManhourBudget, 678.576, "514.073 + 164.503");
  const aed = calculateBudgetExecution("p", project("Abu Dhabi", "AED", { nonManhourExpenses: [{ id: "x", totalCost: 12.345 }] }), costingFixture("AED", { rate: 22.5 }));
  assert.equal(aed.actualNonManhourBudget, 12.35, "2 decimals, as before");
  const inr = calculateBudgetExecution("p", project("India", "INR", { nonManhourExpenses: [{ id: "x", totalCost: 12.345 }] }), costingFixture("INR"));
  assert.equal(inr.actualNonManhourBudget, 12.35);
});

const render = async (costing, p, { loading = false } = {}) => {
  globalThis.__costingState = { costing, loading, error: null, reload() {} };
  const { default: Card } = await load("/src/pages/Projects/components/ExpandableTeamMembersCard.tsx");
  // The app always renders screens inside its AuthProvider (the refresh banner reads the session to decide whether to offer Retry).
  const { AuthProvider } = await load("/src/auth/authContext.tsx");
  return renderToStaticMarkup(React.createElement(AuthProvider, null, React.createElement(Card, { project: p })));
};
test("Team Assigned (Oman): the server's converted cost and rate are shown, the INR base and the rate sentence are not, the KPI equals the sum of the rows", async () => {
  const p = project("Oman", "OMR");
  const html = await render(costingFixture("OMR", { rate: 243.156 }), p);
  assert.match(html, /Total Man-Hour Cost \(OMR\)/);
  assert.match(html, /OMR 678\.576/, "KPI = 514.073 + 164.503");
  assert.match(html, /OMR 514\.073/, "E1 row");
  assert.match(html, /OMR 164\.503/, "E2 row");
  assert.match(html, /OMR 5\.141/, "E1 hourly rate derived from the server's cost and hours");
  assert.doesNotMatch(html, /₹ 1,250\.00 base/, "the employee's INR base rate is not shown under the converted rate");
  assert.doesNotMatch(html, /₹ 1,25,000\.00 INR/, "nor the INR cost under the converted cost");
  assert.doesNotMatch(html, /INR Base Rate|INR Man-Hour Cost/, "nor in the expanded row");
  assert.doesNotMatch(html, /INR base/, "the INR base footnote under the KPI is hidden from project users");
  assert.doesNotMatch(html, /1 OMR = INR|Manpower conversion rate for/, "the conversion rate is not shown on a project");
  assert.doesNotMatch(html, /Rate not set/);
  assert.doesNotMatch(html, /manhour-refresh-banner/, "a current project shows no refresh banner");
});

test("Team Assigned follows the server for a changed employee rate: the same hours at INR 1,500 read INR 1,50,000 / OMR 600", async () => {
  const p = project("Oman", "OMR");
  const html = await render(costingFixture("OMR", { rate: 250, rows: [["E1", 100, 1500], ["E2", 50, 800]] }), p);
  assert.match(html, /OMR 600\.000/, "E1: 100 h x INR 1,500 / 250");
  assert.doesNotMatch(html, /₹ 1,50,000\.00 INR|₹ 1,500\.00 base/, "no INR base lines on the rows");
});

test("Team Assigned (Oman, FX rate not set on the rows): every project-currency amount reads \"Rate not set\"; the INR amounts are labelled INR and never OMR", async () => {
  const p = project("Oman", "OMR");
  const html = await render(costingFixture("OMR", { missing: true }), p);
  assert.match(html, /Rate not set/);
  assert.doesNotMatch(html, /manhour-country-rate/, "no rate sentence is shown on a project");
  assert.doesNotMatch(html, /manhour-rate-form|Save new version/, "nothing to edit on a project");
  assert.doesNotMatch(html, /OMR\s*\d/, "no OMR amount at all while no rate exists");
  assert.doesNotMatch(html, /₹ 1,250\.00 base/);
});

test("Team Assigned shows a placeholder, never a zero, while the server costing loads", async () => {
  const html = await render(null, project("Oman", "OMR"), { loading: true });
  assert.doesNotMatch(html, /OMR\s*0\b/);
  assert.match(html, /…/);
});

test("Team Assigned (India): exactly as before - rupee amounts, no rate panel, no conversion text", async () => {
  const p = project("India", "INR");
  const html = await render(costingFixture("INR"), p);
  assert.match(html, /Total Man-Hour Cost</);
  assert.match(html, /₹ 1\.65 L/);
  assert.match(html, /₹1,25,000\.00/);
  assert.doesNotMatch(html, /Rate not set/);
  assert.doesNotMatch(html, /manhour-rate-panel/);
  assert.doesNotMatch(html, /INR base/);
});

test("Team Assigned renders the server's figures for all six non-INR countries, each in its own currency", async () => {
  for (const { country, currency } of COUNTRIES.filter((c) => c.currency !== "INR")) {
    const p = project(country, currency);
    const costing = costingFixture(currency, { rate: 25 });
    const html = await render(costing, p);
    const digits = currency === "OMR" ? 3 : 2;
    const total = costing.totals.costInProjectCurrency.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    assert.match(html, new RegExp(`Total Man-Hour Cost \\(${currency}\\)`), country);
    assert.ok(html.includes(currency === "MYR" ? `RM ${total}` : `${currency} ${total}`), `${country}: the server's total ${total} in ${currency}`);
  }
});

test("a pending or failed recalculation is shown on Team Assigned, never presented as current", async () => {
  const p = project("Oman", "OMR");
  for (const [status, text] of [["PENDING", /still in progress/], ["FAILED", /failed/]]) {
    const html = await render(costingFixture("OMR", { rate: 250, status }), p);
    assert.match(html, /data-testid="manhour-refresh-banner"/, status);
    assert.match(html, text, status);
  }
});

test("a project no longer manages a conversion rate: no form, no panel, and the rate itself is not shown either", async () => {
  const p = project("Oman", "OMR");
  const html = await render(costingFixture("OMR", { rate: 243.156 }), p);
  assert.doesNotMatch(html, /data-testid="manhour-country-rate"/, "the rate sentence is hidden from project users");
  assert.doesNotMatch(html, /Manpower conversion rate for|1 OMR = INR 243/);
  assert.doesNotMatch(html, /INR base:? ₹ 1,25,000\.00 INR|base<\/div>/, "no INR base line under any row");
  assert.doesNotMatch(html, /manhour-rate-form|manhour-rate-panel|Save new version|Review and apply/, "no project-level management of any kind");
  for (const gone of ["pages/Projects/components/ManhourRatePanel.tsx", "pages/Projects/useManhourRate.ts", "services/manhourRateService.ts"]) {
    assert.ok(!existsSync(new URL(`../src/${gone}`, import.meta.url)), `${gone} was removed`);
  }
  const team = src("pages/Projects/components/ExpandableTeamMembersCard.tsx");
  assert.ok(!/saveManhourRate|applyManhourRate|ManhourRatePanel|useManhourRate/.test(team), "Team Assigned no longer calls a per-project rate API");
  // India reads exactly as before: no country rate line at all.
  assert.doesNotMatch(await render(costingFixture("INR"), project("India", "INR")), /manhour-country-rate/);
});

test("Option A source wiring: no screen prices hours with an employee rate; the server's costing feeds Team Assigned, Expense Budget, Dashboard, Reports and the PDF", () => {
  const team = src("pages/Projects/components/ExpandableTeamMembersCard.tsx");
  assert.ok(!/\.totalCost|\.hourlyRate\b/.test(team), "Team Assigned no longer reads the live-priced cost or rate");
  assert.match(team, /useManhourCosting\(project\.id\)/);
  const budgetService = src("services/expenseBudgetAnalysisService.ts");
  assert.ok(!/getProcessedTeamMembers|member\.totalCost/.test(budgetService), "Expense Budget no longer prices timesheet hours");
  assert.match(src("pages/Projects/components/ExpenseBudgetView.tsx"), /calculateBudgetExecution\(project\.id, project, costingState\.costing\)/);
  assert.match(src("pages/Dashboard/components/KPISection.tsx"), /manhourRefreshPendingProjects/);
  const reports = src("components/reports/reportCurrency.ts");
  assert.match(reports, /manhourCostRegional/);
  assert.match(reports, /manhourRefreshProblemProjects/);
  assert.match(src("pages/ReportsPage.tsx"), /reports-refresh-note/);
  assert.match(src("reports/projectPdf/buildProjectFinancialPdf.ts"), /manhourRefreshStatus/);
  // A rate change on the Manpower screens tells every open project screen, report and costing view to reload.
  const employees = src("services/employeeService.ts");
  assert.match(employees, /if \(dto\.costingRefresh\) dispatchPmoDataChanged\(\{ entity: "project" \}\)/);
  assert.match(employees, /if \(result\.costingRefresh\) dispatchPmoDataChanged\(\{ entity: "project" \}\)/);
  assert.match(src("components/reports/useReportsData.ts"), /\["project", "timesheet", "employee"\]/);
  // The employee Manpower screens themselves still show and maintain the original INR rate.
  assert.match(src("pages/Manpower/components/EmployeeRow.tsx"), /employee\.manhourExpenses/);
});

test("Reports: a project whose recalculation is pending or failed is counted in its country section", async () => {
  const { groupReportProjects } = await load("/src/components/reports/reportCurrency.ts");
  const reference = {
    enforced: true,
    items: [{ prCategory: "Oman", prNoPrefix: "3", country: { code: "OM", name: "Oman", displayName: "Oman", defaultCurrency: "OMR" }, authorized: true }],
  };
  const mk = (id, status) => ({ id, prCategory: "Oman", regionalCurrency: "OMR", workOrderValueRegional: 1000, manhourRefreshStatus: status, resources: [] });
  const [group] = groupReportProjects([mk("a", "FAILED"), mk("b", "PENDING"), mk("c", "CURRENT"), mk("d", undefined)], reference);
  assert.equal(group.manhourRefreshProblemProjects, 2);
});

// ── Project Financial PDF ────────────────────────────────────────────────

async function pdfText(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false });
  const doc = await task.promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => it.str).join(" ").replace(/\s+/g, " "));
  }
  await task.destroy();
  return pages.join("\n");
}

const pdfProject = (over) => ({
  id: "p1", prNo: "PR-P4", rfqNo: null, projectTitle: "P4 project", client: "Client", department: "Process", domesticForeign: "Foreign", contractType: "LUMP SUM",
  projectStatus: "Active", workOrderStatus: "Received", workOrderNumber: null, workOrderDate: null, projectStartDate: null, projectEndDate: null,
  actualCompletionDate: null, primaryProjectManager: null, secondaryProjectManager: null, pmoCoordinator: null, workOrderValueINR: 0, ldApplicable: null,
  ldAmountINR: null, ldRemarks: null, regionalCurrency: "OMR", workOrderValueRegional: 10_000, ...over,
});
const row = (employeeNo, hours, rate, extra) => ({
  employeeNo, employeeName: `Emp ${employeeNo}`, nameFromDirectory: true, designation: null, assignmentStatus: "Active", totalHours: hours, hourlyRate: rate,
  manhourCost: hours * rate, costingStatus: null, manhourCostRegional: null, fxRateInrPerRegional: null, ...extra,
});

test("PDF (Oman): converted man-hour cost in OMR with the INR base in brackets; a row with no rate reads Rate not set and is left out of the totals", async () => {
  const { buildProjectFinancialPdf } = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  const data = {
    project: pdfProject({}),
    manhourRows: [
      row("E1", 100, 1250, { costingStatus: "CONVERTED", manhourCostRegional: 514.073, fxRateInrPerRegional: 243.156 }),
      row("E2", 50, 800), // no rate applied
    ],
    nonManhourRows: [{ category: "Travel", description: "Trip", quantity: 1, unitCost: 100, totalCost: 100, remarks: null }],
    invoiceRows: [],
    fetchedAt: new Date("2026-11-17T05:00:00Z"),
  };
  const all = await pdfText(buildProjectFinancialPdf(data, { timeZone: "Asia/Kolkata" }).bytes);
  assert.ok(all.includes("Rate / hr (OMR)"), "currency named in the header");
  assert.ok(all.includes("Man-hour Cost (OMR)"));
  assert.ok(all.includes("OMR 514.073"), "E1 cost in OMR");
  assert.ok(all.includes("OMR 5.141"), "E1 project hourly rate");
  assert.ok(all.includes("₹ 1,25,000.00"), "the INR base cost, labelled in rupees");
  assert.ok(all.includes("Rate not set"), "E2 has no rate");
  assert.ok(all.includes("not converted into OMR"), "the note says what is left out");
  // Man-hour subtotal is the converted amount only; expenses = 514.073 + 100.
  assert.ok(/Man-hour subtotal OMR 514\.073/.test(all), "subtotal excludes the unconverted row");
  assert.ok(all.includes("OMR 614.073"), "total expenses = converted man-hour + non-man-hour, all OMR");
  assert.ok(!all.includes("OMR 40,000"), "an INR amount is never printed as OMR");
  assert.ok(!all.includes("OMR 1,65,000"), "nor the INR total");
});

test("PDF (India): the man-hour section is exactly as before - rupees, no conversion wording", async () => {
  const { buildProjectFinancialPdf } = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  const data = {
    project: pdfProject({ regionalCurrency: null, workOrderValueINR: 1_000_000 }),
    manhourRows: [row("E1", 100, 1250)],
    nonManhourRows: [],
    invoiceRows: [],
    fetchedAt: new Date("2026-11-17T05:00:00Z"),
  };
  const all = await pdfText(buildProjectFinancialPdf(data, { timeZone: "Asia/Kolkata" }).bytes);
  assert.ok(all.includes("Man-hour Cost") && !all.includes("Man-hour Cost (INR)"));
  assert.ok(all.includes("₹ 1,25,000.00"));
  assert.ok(!all.includes("Rate not set"));
  assert.ok(!all.includes("not converted into"));
});
