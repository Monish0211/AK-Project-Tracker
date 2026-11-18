// Global Multi-Country Phase 3 (frontend): regional currency vs transaction currency. The rate is REGIONAL currency per ONE unit of the
// TRANSACTION currency ("1 USD = 4.50 MYR"). The backend is the authority; these tests prove the screen prices lines the same way,
// that a legacy / India project is unchanged, and that nothing non-INR is ever shown or summed as rupees.
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
const line = (over = {}) => ({ woQty: 1, uom: "DAY", currency: "USD", unitRate: 9600, exchangeRate: 1, ...over });
const item = (over = {}) => ({ id: "i1", description: "Study", woQty: 1, invoiceQty: 0, pendingQty: 1, uom: "DAY", assignedTo: "", currency: "USD", unitRate: 9600, exchangeRate: 1, unitRateINR: 0, woValue: 0, pendingAmount: 0, ...over });

/** The original (pre-Phase 3) formula, copied verbatim, to prove a legacy or India project is unchanged. */
const original = (f) => {
  const lump = f.uom.trim().toUpperCase() === "LUMP SUM";
  const unitRateINR = f.currency === "INR" ? f.unitRate : f.unitRate * f.exchangeRate;
  return { unitRateINR, woValue: lump ? unitRateINR : f.woQty * unitRateINR };
};

// ---- the pricing rule ---------------------------------------------------------------------------------------------------------
test("India: USD 9,600 at 1 USD = 95 INR is INR 9,12,000", async () => {
  const { priceQuantityLine } = await load("/src/utils/quantityCalculations.ts");
  const r = priceQuantityLine(line({ exchangeRate: 95 }), "INR");
  assert.equal(r.woValue, 912000);
  assert.equal(r.woValueRegional, 912000);
});

test("Malaysia: USD 9,600 at 1 USD = 4.50 MYR is MYR 43,200 and the INR-named values stay 0", async () => {
  const { priceQuantityLine } = await load("/src/utils/quantityCalculations.ts");
  const r = priceQuantityLine(line({ exchangeRate: 4.5 }), "MYR");
  assert.equal(r.woValueRegional, 43200);
  assert.equal(r.unitRateRegional, 43200);
  assert.equal(r.unitRateINR, 0);
  assert.equal(r.woValue, 0);
});

test("Oman: USD 9,600 at 0.385 is OMR 3,696 with no floating-point noise; quantity multiplies; LUMP SUM ignores it", async () => {
  const { priceQuantityLine } = await load("/src/utils/quantityCalculations.ts");
  assert.equal(priceQuantityLine(line({ exchangeRate: 0.385 }), "OMR").woValueRegional, 3696);
  assert.equal(priceQuantityLine(line({ woQty: 3, unitRate: 100, exchangeRate: 4.5 }), "MYR").woValueRegional, 1350);
  assert.equal(priceQuantityLine(line({ woQty: 3, unitRate: 100, exchangeRate: 4.5, uom: "LUMP SUM" }), "MYR").woValueRegional, 450);
});

test("the regional currency itself is always rate 1, whatever rate is passed", async () => {
  const { priceQuantityLine } = await load("/src/utils/quantityCalculations.ts");
  const r = priceQuantityLine(line({ currency: "OMR", unitRate: 500, exchangeRate: 83 }), "OMR");
  assert.equal(r.exchangeRate, 1);
  assert.equal(r.woValueRegional, 500);
});

test("a legacy project and an India project reproduce the original formula exactly", async () => {
  const { priceQuantityLine } = await load("/src/utils/quantityCalculations.ts");
  const samples = [
    line({ currency: "INR", unitRate: 1234.5, woQty: 7 }),
    line({ currency: "USD", unitRate: 9600, exchangeRate: 83.25 }),
    line({ currency: "EUR", unitRate: 33.333, woQty: 3, exchangeRate: 91.7, uom: "MAN-DAY" }),
    line({ currency: "AED", unitRate: 100, woQty: 10, exchangeRate: 22.6, uom: "LUMP SUM" }),
    line({ currency: "INR", unitRate: 33.333, woQty: 3 }),
  ];
  for (const s of samples) {
    const expected = original(s);
    for (const regional of [undefined, null, "", "INR"]) {
      const r = priceQuantityLine(s, regional);
      assert.equal(r.unitRateINR, expected.unitRateINR, `${JSON.stringify(s)} regional=${String(regional)}`);
      assert.equal(r.woValue, expected.woValue);
      assert.equal(r.woValueRegional, expected.woValue);
    }
  }
});

test("recalcQuantityItem prices a line, forces rate 1 for the regional currency, and keeps pending amount in the regional currency", async () => {
  const { recalcQuantityItem } = await load("/src/utils/quantityCalculations.ts");
  const usd = recalcQuantityItem(item({ woQty: 2 }), "USD", 4.5, "MYR");
  assert.equal(usd.woValueRegional, 86400);
  assert.equal(usd.pendingQty, 2);
  assert.equal(usd.pendingAmount, 86400);
  assert.equal(usd.woValue, 0);
  const same = recalcQuantityItem(item({ currency: "MYR", unitRate: 1000 }), "MYR", 4.5, "MYR");
  assert.equal(same.exchangeRate, 1);
  assert.equal(same.woValueRegional, 1000);
  // Legacy: no regional currency, so INR behaves exactly as before.
  const legacy = recalcQuantityItem(item({ currency: "INR", unitRate: 500 }), "INR", 83);
  assert.equal(legacy.exchangeRate, 1);
  assert.equal(legacy.woValue, 500);
});

test("totals: the regional work order value and grand total; GST exists only for INR; an INR or legacy project is unchanged", async () => {
  const { calculateQuantity, recalcQuantityItem } = await load("/src/utils/quantityCalculations.ts");
  const my = [recalcQuantityItem(item(), "USD", 4.5, "MYR"), recalcQuantityItem(item({ id: "i2", unitRate: 400 }), "USD", 4.5, "MYR")];
  const t = calculateQuantity(my, "USD", 4.5, true, "MYR");
  assert.equal(t.workOrderValueRegional, 45000);
  assert.equal(t.grandTotalRegional, 45000, "no GST outside INR");
  assert.equal(t.workOrderValueINR, 0);
  assert.equal(t.gstAmount, 0);
  const inr = [recalcQuantityItem(item({ currency: "INR", unitRate: 1000 }), "INR", 1, "INR")];
  const ti = calculateQuantity(inr, "INR", 1, true, "INR");
  assert.equal(ti.workOrderValueINR, 1000);
  assert.equal(ti.workOrderValueRegional, 1000);
  assert.equal(ti.gstAmount, 180, "India GST is untouched");
  assert.equal(ti.grandTotalRegional, 1180);
  const legacy = calculateQuantity([recalcQuantityItem(item({ currency: "INR", unitRate: 1000 }), "INR", 1)], "INR", 1, false);
  assert.equal(legacy.workOrderValueRegional, legacy.workOrderValueINR);
});

test("choosing the PR Category (Add Project) switches the project to its regional currency at rate 1 and reprices every line", async () => {
  const { applyRegionalCurrencyToProject, recalcQuantityItem } = await load("/src/utils/quantityCalculations.ts");
  const project = { gstApplicable: false, quantityItems: [recalcQuantityItem(item({ currency: "USD", exchangeRate: 83 }), "USD", 83)] };
  const oman = applyRegionalCurrencyToProject(project, "OMR");
  assert.equal(oman.regionalCurrency, "OMR");
  assert.equal(oman.currency, "OMR");
  assert.equal(oman.currentExchangeRate, 1);
  assert.equal(oman.contractExchangeRate, 1);
  assert.equal(oman.quantityItems[0].currency, "OMR");
  assert.equal(oman.quantityItems[0].exchangeRate, 1, "the previous 83 does not carry over");
  assert.equal(oman.workOrderValueRegional, 9600);
  const none = applyRegionalCurrencyToProject(project, null);
  assert.deepEqual(none, { regionalCurrency: null }, "no configured currency leaves a legacy-style INR project untouched");
});

// ---- display ------------------------------------------------------------------------------------------------------------------
test("amounts: INR keeps the rupee format; every other currency shows its code and its own decimals (OMR has three)", async () => {
  const d = await load("/src/utils/currencyDisplay.ts");
  assert.equal(d.formatMoney(912000, "INR"), "₹ 9,12,000.00");
  assert.equal(d.formatMoney(43200, "MYR"), "RM 43,200.00");
  assert.equal(d.formatMoney(3696, "OMR"), "OMR 3,696.000");
  assert.doesNotMatch(d.formatMoney(43200, "MYR"), /₹/);
  assert.equal(d.formatMoneyCompact(43200, "MYR"), "RM 43.2K");
  assert.equal(d.formatMoneyCompact(2_500_000, "AED"), "AED 2.5M");
  assert.match(d.formatMoneyCompact(912000, "INR"), /₹/);
  assert.equal(d.currencyPrefix("INR"), "₹");
  assert.equal(d.currencyPrefix("QAR"), "QAR");
});

test("the rate direction is spelled out: 1 <transaction> = X <regional>", async () => {
  const d = await load("/src/utils/currencyDisplay.ts");
  assert.equal(d.rateDirectionLabel("USD", "OMR"), "1 USD = ? OMR");
  assert.equal(d.rateDirectionLabel("USD", "OMR", 0.385), "1 USD = 0.385 OMR");
  assert.equal(d.rateDirectionLabel("QAR", "OMR", 0), "1 QAR = ? OMR");
});

test("a legacy project reads as INR; regional helpers pick the right figure", async () => {
  const d = await load("/src/utils/currencyDisplay.ts");
  assert.equal(d.regionalCurrencyOf({}), "INR");
  assert.equal(d.regionalCurrencyOf({ regionalCurrency: null }), "INR");
  assert.equal(d.regionalCurrencyOf({ regionalCurrency: "QAR" }), "QAR");
  assert.equal(d.isNonInrRegional({ regionalCurrency: "INR" }), false);
  assert.equal(d.regionalWorkOrderValue({ workOrderValueINR: 500, regionalCurrency: null }), 500);
  assert.equal(d.regionalWorkOrderValue({ workOrderValueINR: 0, workOrderValueRegional: 43200, regionalCurrency: "MYR" }), 43200);
  assert.equal(d.lineRegionalValue({ woValue: 10, woValueRegional: 99 }, { regionalCurrency: null }), 10);
  assert.equal(d.lineRegionalValue({ woValue: 0, woValueRegional: 99 }, { regionalCurrency: "MYR" }), 99);
  assert.equal(d.lineRegionalUnitRate({ unitRateINR: 0, unitRateRegional: 4.5 }, { regionalCurrency: "MYR" }), 4.5);
});

// ---- validation ---------------------------------------------------------------------------------------------------------------
test("validation: a different currency needs a real rate; the regional currency needs none; legacy projects are unchanged", async () => {
  const { validateQuantityTab } = await load("/src/utils/projectValidation.ts");
  const base = (over) => ({ currency: "USD", regionalCurrency: "OMR", currentExchangeRate: 0.385, quantityItems: [], ...over });
  assert.equal(validateQuantityTab(base({}))["exchangeRate"], undefined);
  assert.match(validateQuantityTab(base({ currentExchangeRate: 0 }))["exchangeRate"], /1 USD = \? OMR/);
  assert.match(validateQuantityTab(base({ currentExchangeRate: 1 }))["exchangeRate"], /exactly 1/);
  assert.equal(validateQuantityTab(base({ currency: "OMR", currentExchangeRate: 1 }))["exchangeRate"], undefined, "regional currency: rate 1 is correct");
  assert.equal(validateQuantityTab(base({ regionalCurrency: null, currentExchangeRate: 1 }))["exchangeRate"], undefined, "legacy USD at 1 is not newly rejected here");
  assert.equal(validateQuantityTab(base({ regionalCurrency: null, currency: "INR", currentExchangeRate: 1 }))["exchangeRate"], undefined);
});

// ---- the screens --------------------------------------------------------------------------------------------------------------
test("Commercial Summary: a Malaysia project shows RM with no rupee sign and no GST amount; an India project still shows rupees and GST", async () => {
  const mod = await load("/src/pages/Projects/components/CommercialSummaryCard.tsx");
  const render = (props) =>
    renderToStaticMarkup(
      React.createElement(mod.default, { currency: "USD", workOrderValueINR: 0, gstApplicable: false, gstRate: 0, gstAmount: 0, grandTotal: 0, editable: false, ...props })
    );
  const my = render({ regionalCurrency: "MYR", workOrderValueRegional: 43200, grandTotalRegional: 43200 });
  assert.match(my, /RM 43\.2K/);
  assert.doesNotMatch(my, /₹/);
  const india = render({ currency: "INR", regionalCurrency: "INR", workOrderValueINR: 912000, workOrderValueRegional: 912000, gstApplicable: true, gstRate: 18, gstAmount: 164160, grandTotal: 1076160, grandTotalRegional: 1076160 });
  assert.match(india, /₹/);
  assert.match(india, /18%/);
  const legacy = render({ currency: "INR", workOrderValueINR: 5000, gstApplicable: false });
  assert.match(legacy, /₹ 5 K/);
});

test("Quantity Details (view): an Oman project shows OMR amounts with three decimals and the rate direction, not rupees", async () => {
  const mod = await load("/src/pages/Projects/components/QuantityTable.tsx");
  const { recalcQuantityItem } = await load("/src/utils/quantityCalculations.ts");
  const priced = recalcQuantityItem(item(), "USD", 0.385, "OMR");
  const project = {
    currency: "USD",
    regionalCurrency: "OMR",
    currentExchangeRate: 0.385,
    quantityItems: [priced],
    projectStartDate: "2026-01-01",
    projectEndDate: "2026-02-01",
    workOrderValueINR: 0,
    workOrderValueRegional: 3696,
    grandTotalRegional: 3696,
    gstApplicable: false,
    gstRate: 0,
    gstAmount: 0,
    grandTotal: 0,
  };
  const html = renderToStaticMarkup(React.createElement(mod.default, { project }));
  assert.match(html, /1 USD = 0\.385 OMR/);
  assert.match(html, /OMR 3,696\.000/);
  assert.match(html, /Unit Rate \(OMR\)/);
  assert.doesNotMatch(html, /₹/);
});

test("Quantity Details (edit): the rate is read-only for the regional currency, shows its direction otherwise, and never carries a stale rate", () => {
  const card = src("pages/Projects/components/QuantityCard.tsx");
  assert.match(card, /disabled=\{isRegionalCurrency\}/, "rate input is read-only for the regional currency");
  assert.match(card, /rateDirectionLabel\(project\.currency, regionalCurrency, project\.currentExchangeRate\)/);
  assert.match(card, /currency === regional \? 1 : currency === prev\.currency \? prev\.currentExchangeRate : 0/, "a switch starts with no rate");
  assert.match(card, /Regional currency \(\$\{regionalCurrency\}\): rate fixed at 1/);
});

test("Add Project: choosing the PR Category sets the regional currency from the backend's reference, never the PR prefix", () => {
  const form = src("pages/Projects/components/GeneralInfoCard.tsx");
  assert.match(form, /applyRegionalCurrencyToProject\(/);
  assert.match(form, /country\?\.defaultCurrency/);
  assert.match(src("pages/Projects/components/ProjectForm.tsx"), /applyRegionalCurrency=\{mode === "add"\}/);
  assert.doesNotMatch(src("utils/currencyDisplay.ts"), /Oman|Malaysia|Qatar|Abu Dhabi/, "no country or currency table is hard-coded on the frontend");
});

// ---- opening a project, the dashboard, the PR Request form --------------------------------------------------------------------
test("an Oman project with no priced line opens as OMR at rate 1 (not the old INR default); a priced or legacy project keeps what was saved", async () => {
  const { resolveOpeningCurrency } = await load("/src/utils/quantityCalculations.ts");
  const fresh = resolveOpeningCurrency({ regionalCurrency: "OMR", currency: "INR", quantityItems: [] });
  assert.deepEqual(fresh, { currency: "OMR", useRegionalDefault: true });
  assert.deepEqual(resolveOpeningCurrency({ regionalCurrency: "OMR", currency: "INR", quantityItems: [{ unitRate: 0 }] }), { currency: "OMR", useRegionalDefault: true }, "an empty placeholder line is not priced");
  const priced = resolveOpeningCurrency({ regionalCurrency: "OMR", currency: "USD", quantityItems: [{ unitRate: 9600 }] });
  assert.deepEqual(priced, { currency: "USD", useRegionalDefault: false }, "a priced project keeps its saved commercial currency");
  assert.deepEqual(resolveOpeningCurrency({ regionalCurrency: "OMR", currency: "OMR", quantityItems: [] }), { currency: "OMR", useRegionalDefault: false });
  assert.deepEqual(resolveOpeningCurrency({ regionalCurrency: null, currency: "INR", quantityItems: [] }), { currency: "INR", useRegionalDefault: false }, "a legacy project is untouched");
  assert.deepEqual(resolveOpeningCurrency({ currency: "USD" }), { currency: "USD", useRegionalDefault: false });
  // ...and normalizeProject really uses it for both the currency and the rates.
  const svc = src("services/projectService.ts");
  assert.match(svc, /resolveOpeningCurrency\(project\)/);
  assert.match(svc, /useRegionalDefault \? 1 :/);
});

test("Dashboard tiles: an Oman view reads OMR with no rupee sign; an India view still reads rupees; other currencies are listed, never added in", async () => {
  const mod = await load("/src/pages/Dashboard/components/KPISection.tsx");
  const ctx = await load("/src/pages/Dashboard/DashboardSummaryContext.tsx");
  const kpis = (v) => ({ totalProjects: 2, totalWOValue: v, totalInvoiceRaised: 0, totalPaymentReceived: 0, totalOutstanding: v, totalExpenses: 0, totalActualProjectCost: 0, totalProfit: v, totalProfitPercentage: 100 });
  const render = (summary) => renderToStaticMarkup(React.createElement(ctx.DashboardSummaryProvider, { value: summary }, React.createElement(mod.default)));
  const oman = render({ kpis: kpis(43200), kpiCurrency: "OMR", otherCurrencies: [] });
  assert.match(oman, /OMR 43\.2K/);
  assert.doesNotMatch(oman, /₹/);
  const india = render({ kpis: kpis(912000), kpiCurrency: "INR", otherCurrencies: [{ ...kpis(3696), currency: "OMR", totalProjects: 1 }] });
  assert.match(india, /₹/);
  assert.match(india, /never added to another/);
  assert.match(india, /data-currency-group="OMR"/);
  assert.match(india, /OMR 3\.7K/);
  const older = render({ kpis: kpis(5000) });
  assert.match(older, /₹ 5 K/, "a backend that sends no currency is read as INR");
  assert.doesNotMatch(older, /currency-groups/);
});

test("PR Request form: the requester's project takes the country's regional currency, and which categories can be chosen is unchanged", () => {
  const form = src("pages/PRRequests/RequestPRForm.tsx");
  assert.match(form, /applyRegionalCurrency/);
  assert.match(form, /currencyReference=\{currencyReference\}/);
  assert.doesNotMatch(form, /categoryCountries/, "no category is disabled or hinted for a requester");
  assert.match(src("pages/Projects/components/GeneralInfoCard.tsx"), /categoryCountries \?\? currencyReference/);
});
