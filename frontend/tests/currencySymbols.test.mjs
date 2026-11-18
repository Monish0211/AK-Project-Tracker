// Global Multi-Country Phase 3: every project amount shows the symbol of ITS currency (not always the rupee sign). The shared formatter must reproduce the
// long-standing INR output exactly (India unchanged), use RM for Malaysia and the ISO code for the others, and the screens that show a project's own
// money must use the project's regional currency. Invoice currency stays separate and is not touched here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  });
  load = (p) => vite.ssrLoadModule(p);
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});
after(() => vite?.close());

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
const REGIONAL = { India: "INR", Malaysia: "MYR", Oman: "OMR", "Abu Dhabi": "AED", FZE: "AED", "Elixir Qatar": "QAR", Qatar: "QAR" };

test("each of the seven regional currencies shows its own symbol: ₹ for India, RM for Malaysia, the code for the rest", async () => {
  const d = await load("/src/utils/currencyDisplay.ts");
  assert.deepEqual(
    Object.entries(REGIONAL).map(([country, cur]) => [country, d.formatMoney(1234.5, cur)]),
    [
      ["India", "₹ 1,234.50"],
      ["Malaysia", "RM 1,234.50"],
      ["Oman", "OMR 1,234.500"],
      ["Abu Dhabi", "AED 1,234.50"],
      ["FZE", "AED 1,234.50"],
      ["Elixir Qatar", "QAR 1,234.50"],
      ["Qatar", "QAR 1,234.50"],
    ]
  );
  assert.equal(d.currencySymbol("INR"), "₹");
  assert.equal(d.currencySymbol("MYR"), "RM");
  assert.equal(d.currencySymbol("OMR"), "OMR");
  for (const [country, cur] of Object.entries(REGIONAL)) {
    if (cur !== "INR") assert.doesNotMatch(d.formatMoney(1000, cur), /₹/, `${country} never shows a rupee sign`);
  }
});

test("the worked examples read the way the business expects", async () => {
  const d = await load("/src/utils/currencyDisplay.ts");
  assert.equal(d.formatMoney(43200, "MYR"), "RM 43,200.00");
  assert.equal(d.formatMoney(3696, "OMR"), "OMR 3,696.000");
  assert.equal(d.formatMoney(35232, "AED"), "AED 35,232.00");
  assert.equal(d.formatMoney(34944, "QAR"), "QAR 34,944.00");
  assert.equal(d.formatMoneyCompact(43200, "MYR"), "RM 43.2K");
  assert.equal(d.formatMoneyCompact(35232, "AED"), "AED 35.23K");
});

test("negative, zero, missing and non-finite values are formatted safely in every currency", async () => {
  const d = await load("/src/utils/currencyDisplay.ts");
  assert.equal(d.formatMoney(-500, "AED"), "-AED 500.00");
  assert.equal(d.formatMoney(-500, "MYR"), "-RM 500.00");
  assert.equal(d.formatMoney(0, "OMR"), "OMR 0.000");
  assert.equal(d.formatMoney(Number.NaN, "QAR"), "QAR 0.00");
  assert.equal(d.formatMoneyCompact(-1500, "AED"), "-AED 1.5K");
  const m = d.moneyFormatter("OMR");
  assert.equal(m.compact(undefined), "OMR 0");
  assert.equal(m.exact(null), "OMR 0.000");
  assert.equal(d.moneyFormatter(null).currency, "INR", "no currency means INR");
});

test("INR output is byte-for-byte the long-standing INR formatters (India is unchanged)", async () => {
  const f = await load("/src/utils/formatCurrency.ts");
  const d = await load("/src/utils/currencyDisplay.ts");
  const m = d.moneyFormatter("INR");
  const legacy = d.projectMoney({});
  for (const v of [0, 1, 999, 1000, 1234.5, 99999, 100000, 912000, 12345678.9, 1e8, -2500, -1.25, 0.004]) {
    assert.equal(m.compact(v), f.formatBusinessINR(v), `compact ${v}`);
    assert.equal(m.full(v), f.formatFullINR(v), `full ${v}`);
    assert.equal(m.exact(v), f.formatIndianCurrency(v), `exact ${v}`);
    assert.equal(legacy.compact(v), f.formatBusinessINR(v), "a legacy project (no regional currency) reads as INR");
  }
  assert.equal(d.projectMoney({ regionalCurrency: "INR" }).compact(912000), f.formatBusinessINR(912000));
});

test("a project's own money uses its regional currency; an INR invoice or INR-denominated amount keeps the rupee sign", async () => {
  const d = await load("/src/utils/currencyDisplay.ts");
  assert.equal(d.projectMoney({ regionalCurrency: "OMR" }).compact(3696), "OMR 3.7K");
  assert.equal(d.projectMoney({ regionalCurrency: "MYR" }).exact(500), "RM 500.00");
  assert.equal(d.projectMoney({ regionalCurrency: "AED" }).full(500), "AED 500.00");
  // An Oman project's USD invoice is the invoice's OWN currency (code first), and an INR amount in any project is still rupees.
  const inv = await load("/src/pages/Projects/components/Invoice/invoiceCurrency.ts");
  assert.equal(inv.formatInvoiceMoney(1000, "USD"), "USD 1,000.00");
  assert.equal(inv.formatInvoiceMoney(90400, "INR"), "₹ 90,400.00");
  assert.equal(inv.formatInvoiceMoney(12.345, "OMR"), "OMR 12.345");
});

test("the money icon is the rupee glyph only for INR", async () => {
  const mod = await load("/src/components/ui/currencyIconFor.ts");
  const rupee = mod.currencyIconFor("INR");
  assert.equal(mod.currencyIconFor(undefined), rupee);
  assert.equal(mod.currencyIconFor(null), rupee);
  for (const cur of ["MYR", "OMR", "AED", "QAR", "USD"]) assert.notEqual(mod.currencyIconFor(cur), rupee, `${cur} gets a neutral banknote`);
});

test("Project summary strip: an Oman project reads OMR with no rupee sign or glyph; an India project still reads rupees", async () => {
  const mod = await load("/src/pages/Projects/components/workspace/ProjectSummaryStrip.tsx");
  const props = { workOrderValue: 3696, invoiceRaised: 0, paymentReceived: 0, outstanding: 3696, budget: 1000, expenses: 50, profit: 3646, completionPercent: 0, milestoneCount: 1, teamCount: 0 };
  const oman = renderToStaticMarkup(React.createElement(mod.default, { ...props, currency: "OMR" }));
  assert.match(oman, /OMR 3\.7K/);
  assert.match(oman, /OMR 50/);
  assert.doesNotMatch(oman, /₹/);
  assert.doesNotMatch(oman, /lucide-indian-rupee/);
  const india = renderToStaticMarkup(React.createElement(mod.default, { ...props, workOrderValue: 912000, currency: "INR" }));
  assert.match(india, /₹/);
  assert.match(india, /lucide-indian-rupee/);
  const noCurrency = renderToStaticMarkup(React.createElement(mod.default, { ...props, workOrderValue: 912000 }));
  assert.equal(noCurrency, india, "no currency given: exactly as before");
  const my = renderToStaticMarkup(React.createElement(mod.default, { ...props, workOrderValue: 43200, currency: "MYR" }));
  assert.match(my, /RM 43\.2K/);
});

test("Other Project Expenses (view and table): amounts use the project's regional currency", async () => {
  const view = await load("/src/pages/Projects/components/NonManhourExpenseView.tsx");
  const row = { id: "e1", category: "Travel", description: "Flights", quantity: 2, unitCost: 250, totalCost: 500, remarks: "" };
  const aed = renderToStaticMarkup(React.createElement(view.default, { expenses: [row], currency: "AED" }));
  assert.match(aed, /AED 250\.00/);
  assert.match(aed, /AED 500\.00/);
  assert.doesNotMatch(aed, /₹/);
  const india = renderToStaticMarkup(React.createElement(view.default, { expenses: [row] }));
  assert.match(india, /₹ 250\.00/);
  assert.match(india, /₹ 500\.00/);
  const mview = await load("/src/pages/Projects/components/ManhourExpenseView.tsx");
  const mrow = { id: "m1", employeeName: "A", employeeNo: "E1", department: "P", reportingManager: "B", manhourRate: 40, bookedHours: 10, totalCost: 400, remarks: "" };
  const myr = renderToStaticMarkup(React.createElement(mview.default, { expenses: [mrow], currency: "MYR" }));
  assert.match(myr, /RM 40\.00/);
  assert.match(myr, /RM 400\.00/);
});

test("the screens that show a project's own money are wired to the project's regional currency (source check)", () => {
  const read = (p) => src(p);
  assert.match(read("pages/Projects/components/workspace/ProjectWorkspaceHeader.tsx"), /projectMoney\(project\)/);
  assert.match(read("pages/Projects/components/ExpandableTeamMembersCard.tsx"), /projectMoney\(project\)/);
  assert.match(read("pages/Projects/components/ExpenseInformation/ManhourExpenseCard.tsx"), /currency=\{regionalCurrencyOf\(project\)\}/);
  assert.match(read("pages/Projects/components/ExpenseInformation/NonManhourExpenseCard.tsx"), /currency=\{regionalCurrencyOf\(project\)\}/);
  assert.match(read("pages/Projects/ViewProject.tsx"), /currency=\{regionalCurrencyOf\(project\)\}/);
  assert.match(read("pages/Projects/Projects.tsx"), /moneyFormatter\(stats\.currency\)/);
  assert.match(read("reports/projectPdf/buildProjectFinancialPdf.ts"), /formatReportMoney\(value, currency\)/);
  // Reports are now country-aware (one section per country and currency, see reportsCountryAware.test.mjs); the old rupee-only banner is gone.
  assert.match(read("pages/ReportsPage.tsx"), /ReportGroupContext\.Provider/);
});

test("the Project Financial PDF prints the project's own currency, and INR output is unchanged", async () => {
  const pdf = await load("/src/reports/projectPdf/buildProjectFinancialPdf.ts");
  assert.equal(pdf.formatReportMoney(912000, "INR"), pdf.formatReportINR(912000));
  assert.equal(pdf.formatReportMoney(43200, "MYR"), "RM 43,200.00");
  assert.equal(pdf.formatReportMoney(3696, "OMR"), "OMR 3,696.000");
  assert.equal(pdf.formatReportMoney(-500, "AED"), "-AED 500.00");
  assert.equal(pdf.formatReportMoney(-0.0001, "QAR"), "QAR 0.00", "never prints a negative zero");
});

test("Dashboard panels: Recent Projects show each project's own currency; Top Clients follow the headline currency; INR is unchanged", async () => {
  const { MemoryRouter } = await import("react-router-dom");
  const ctx = await load("/src/pages/Dashboard/DashboardSummaryContext.tsx");
  const recent = await load("/src/pages/Dashboard/components/RecentProjects.tsx");
  const top = await load("/src/pages/Dashboard/components/TopClients.tsx");
  const render = (component, summary) =>
    renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(ctx.DashboardSummaryProvider, { value: summary }, React.createElement(component)))
    );
  const base = { kpis: {}, topClients: [], recentProjects: [] };
  const rp = (over) => ({ id: "p", prNo: "PR-1", client: "Acme", projectStatus: "Active", workOrderValueINR: 0, createdAt: "2026-11-01T00:00:00.000Z", ...over });

  const mixed = render(recent.default, {
    ...base,
    recentProjects: [rp({ id: "a", prNo: "PRAD-1", currency: "AED", workOrderValue: 35232 }), rp({ id: "b", prNo: "PR-2", currency: "INR", workOrderValue: 912000, workOrderValueINR: 912000 }), rp({ id: "c", prNo: "PR-3", workOrderValueINR: 5000 })],
  });
  assert.match(mixed, /AED 35\.23K/, "an Abu Dhabi project reads AED");
  assert.match(mixed, /₹ 9\.12 L/, "an India project still reads rupees");
  assert.match(mixed, /₹ 5 K/, "a backend that sends no currency is read as INR");
  const oman = render(recent.default, { ...base, recentProjects: [rp({ currency: "OMR", workOrderValue: 3696 })] });
  assert.match(oman, /OMR 3\.7K/);
  assert.doesNotMatch(oman, /₹/);

  const omanClients = render(top.default, { ...base, kpiCurrency: "OMR", topClients: [{ client: "Acme", workOrderValue: 3696 }] });
  assert.match(omanClients, /OMR 3\.7K/);
  assert.doesNotMatch(omanClients, /₹/);
  const indiaClients = render(top.default, { ...base, topClients: [{ client: "Acme", workOrderValue: 912000 }] });
  assert.match(indiaClients, /₹ 9\.12 L/);
});

test("Expense import preview and Department summary are wired to the right currency (source check)", () => {
  const modal = src("pages/Projects/components/ExpenseInformation/ExpenseImportModal.tsx");
  assert.match(modal, /fmtSheet\(sheet, sheet\.computedDebitOnlyTotal\)/);
  assert.equal((modal.match(/formatINR\(/g) || []).length, 1, "formatINR is only the INR fallback inside fmtSheet");
  // Department values are per country, each in its own currency (Phase 4 final); a single section keeps the headline formatter.
  const departments = src("pages/Dashboard/components/DepartmentSummary.tsx");
  assert.match(departments, /departmentSections\(summary\)/);
  assert.match(departments, /moneyFormatter\(s\.currency\)/);
  assert.match(departments, /: kpiCurrency\)/);
  assert.match(src("services/expenseImportService.ts"), /matchedRegionalCurrency/);
});
