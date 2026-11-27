// PR detail page (Nov 2026): the Work Order Value shown to the approver. Same currency -> one "Total Work Order Value"; different currency -> regional value,
// transaction value and the exchange rate applied. Every region, the same pricing and totals as the review form (no second formula, no INR hop).
//
// Run: node --test --test-concurrency=1 --test-timeout=240000 tests/prCommercialSummary.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      {
        name: "stub-notification-service",
        enforce: "pre",
        load(id) {
          return id.split("\\").join("/").endsWith("/src/notifications/notificationService.ts") ? "export const notificationService = new Proxy({}, { get: () => () => undefined });" : null;
        },
      },
    ],
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());
const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

const line = (description, unitRate, currency, exchangeRate, over = {}) => ({ description, woQty: 1, uom: "LUMP SUM", assignedTo: null, currency, unitRate, exchangeRate, ...over });
const stored = (prCategory, lines, over = {}) => ({
  poMonth: "2026-11", prCategory, prNo: "PR-1", rfqNo: "RFQ-1", client: "C", department: "PMO", domesticForeign: "Foreign", projectTitle: "T", workOrderStatus: "Received",
  projectStartDate: "2026-11-11T00:00:00.000Z", projectEndDate: "2027-01-30T00:00:00.000Z", projectStatus: "Not Started", workOrderNumber: "WO", workOrderDate: "2026-11-01T00:00:00.000Z",
  eicName: "E", contractType: "LUMP SUM", pmoCoordinator: "P", paymentType: "Milestone", gstApplicable: false, currency: lines[0]?.currency ?? "INR",
  currentExchangeRate: lines[0]?.exchangeRate ?? 1, contractExchangeRate: lines[0]?.exchangeRate ?? 1, quantityItems: lines, paymentMilestones: [], ...over,
});
const summary = async (data, regional) => (await load("/src/pages/PRRequests/prCommercialSummary.ts")).buildPRCommercialSummary(data, regional);
const money = async (v, c) => (await load("/src/utils/currencyDisplay.ts")).formatMoney(v, c);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-4, `${msg ?? ""} ${a} vs ${b}`);

// Region -> its currency (configuration, passed in exactly as the server's regionalCurrency field); a foreign currency to price in; a rate for it.
const REGIONS = [
  ["India", "INR", "USD", 95],
  ["FZI", "AED", "USD", 3.6725],
  ["Abu Dhabi", "AED", "USD", 3.6725],
  ["Oman", "OMR", "USD", 0.3845],
  ["Qatar", "QAR", "USD", 3.64],
  ["Elixir Qatar", "QAR", "EUR", 3.95],
  ["Malaysia", "MYR", "USD", 4.4],
];

for (const [region, regional, foreign, rate] of REGIONS) {
  test(`${region} (${regional}): lines priced in ${regional} -> ONE Total Work Order Value, nothing converted`, async () => {
    const s = await summary(stored(region, [line("A", 1000, regional, 1), line("B", 500.5, regional, 1, { uom: "DAY", woQty: 3 })]), regional);
    assert.equal(s.kind, "same");
    assert.equal(s.regionalCurrency, regional);
    near(s.total, 1000 + 500.5 * 3);
  });

  test(`${region} (${regional}): ${foreign} lines -> regional value = transaction value x saved rate, rate shown "1 ${foreign} = ${rate} ${regional}"`, async () => {
    const s = await summary(stored(region, [line("A", 10000, foreign, rate), line("B", 250.25, foreign, rate, { uom: "DAY", woQty: 4 })]), regional);
    assert.equal(s.kind, "different");
    assert.equal(s.regionalCurrency, regional);
    assert.equal(s.groups.length, 1);
    const [g] = s.groups;
    assert.equal(g.currency, foreign);
    near(g.transactionTotal, 10000 + 250.25 * 4);
    assert.equal(g.exchangeRate, rate);
    assert.equal(g.rateProblem, null);
    assert.equal(g.ratesVary, false);
    near(s.regionalTotal, (10000 + 250.25 * 4) * rate, "regional value");
    assert.equal(s.nativeTotal, null);
    const { rateDirectionLabel } = await load("/src/utils/currencyDisplay.ts");
    assert.equal(rateDirectionLabel(g.currency, regional, g.exchangeRate), `1 ${foreign} = ${rate} ${regional}`);
  });
}

test("the reported shape: USD 11,444.69 at 3.67 into Abu Dhabi AED reads AED 42,002.01 / USD 11,444.69 / 1 USD = 3.67 AED", async () => {
  const s = await summary(stored("Abu Dhabi", [line("A", 11444.69, "USD", 3.67)]), "AED");
  assert.equal(s.kind, "different");
  assert.match(await money(s.regionalTotal, "AED"), /42,002\.01/, "11,444.69 x 3.67");
  assert.match(await money(s.groups[0].transactionTotal, "USD"), /11,444\.69/);
  const { rateDirectionLabel } = await load("/src/utils/currencyDisplay.ts");
  assert.equal(rateDirectionLabel("USD", "AED", s.groups[0].exchangeRate), "1 USD = 3.67 AED");
});

test("India, same currency: one total in rupees, Indian grouping (the reported example, Rs 50,00,000)", async () => {
  const s = await summary(stored("India", [line("A", 2500000, "INR", 1), line("B", 2500000, "INR", 1)]), "INR");
  assert.equal(s.kind, "same");
  assert.equal(s.total, 5000000);
  assert.match(await money(s.total, "INR"), /50,00,000/);
});

test("Oman keeps THREE decimals in both the regional and the OMR figure", async () => {
  const s = await summary(stored("Oman", [line("A", 100, "USD", 0.3845, { uom: "DAY", woQty: 7 })]), "OMR");
  assert.equal(s.kind, "different");
  near(s.regionalTotal, 269.15);
  assert.match(await money(s.regionalTotal, "OMR"), /269\.150$/);
  const same = await summary(stored("Oman", [line("A", 1234.567, "OMR", 1)]), "OMR");
  assert.match(await money(same.total, "OMR"), /1,234\.567$/);
});

test("the exchange rate keeps its precision (not rounded to 2 decimals)", async () => {
  const s = await summary(stored("Malaysia", [line("A", 1000, "USD", 4.4123)]), "MYR");
  assert.equal(s.groups[0].exchangeRate, 4.4123);
  const { rateDirectionLabel } = await load("/src/utils/currencyDisplay.ts");
  assert.equal(rateDirectionLabel("USD", "MYR", 4.4123), "1 USD = 4.4123 MYR");
});

test("several lines: quantity x rate, LUMP SUM counted once, in one aggregation", async () => {
  const s = await summary(
    stored("FZI", [line("A", 100, "USD", 3.6725, { uom: "DAY", woQty: 10 }), line("B", 400, "USD", 3.6725), line("C", 50, "USD", 3.6725, { uom: "HOUR", woQty: 2 })]),
    "AED"
  );
  near(s.groups[0].transactionTotal, 1000 + 400 + 100);
  near(s.regionalTotal, 1500 * 3.6725);
});

test("it matches the review form's own totals (calculateQuantity) to the last decimal - no second formula", async () => {
  const { calculateQuantity, recalcQuantityItem } = await load("/src/utils/quantityCalculations.ts");
  const { draftPayloadToProject } = await load("/src/pages/PRRequests/draftMapping.ts");
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  for (const [region, regional, foreign, rate] of REGIONS) {
    const data = stored(region, [line("A", 8765.43, foreign, rate), line("B", 12.345, foreign, rate, { uom: "DAY", woQty: 17 })]);
    const s = await summary(data, regional);
    const p = draftPayloadToProject(createEmptyProject(), data);
    const lines = p.quantityItems.map((i) => recalcQuantityItem(i, i.currency, i.exchangeRate, regional));
    const t = calculateQuantity(lines, lines[0].currency, 1, false, regional);
    near(s.regionalTotal, t.workOrderValueRegional, `${region} regional`);
  }
});

test("a rate changed and saved: reopening shows the NEW rate and the NEW regional value", async () => {
  const before = await summary(stored("Abu Dhabi", [line("A", 10000, "USD", 3.6725)]), "AED");
  const after = await summary(stored("Abu Dhabi", [line("A", 10000, "USD", 3.7)]), "AED");
  near(before.regionalTotal, 36725);
  near(after.regionalTotal, 37000);
  assert.equal(after.groups[0].exchangeRate, 3.7);
});

test("two foreign currencies: one transaction value and one rate per currency, regional value is the sum of both", async () => {
  const s = await summary(stored("Qatar", [line("A", 1000, "USD", 3.64), line("B", 2000, "EUR", 3.95)]), "QAR");
  assert.equal(s.kind, "different");
  assert.deepEqual(s.groups.map((g) => g.currency), ["EUR", "USD"]);
  near(s.regionalTotal, 1000 * 3.64 + 2000 * 3.95);
  near(s.groups.find((g) => g.currency === "EUR").transactionTotal, 2000);
});

test("a mix of regional-currency and foreign lines reports the regional-currency part separately and still adds up", async () => {
  const s = await summary(stored("Qatar", [line("A", 1000, "USD", 3.64), line("B", 500, "QAR", 1)]), "QAR");
  assert.equal(s.kind, "different");
  near(s.regionalTotal, 3640 + 500);
  near(s.nativeTotal, 500);
});

test("missing exchange rate: no regional figure is invented, and the problem is flagged", async () => {
  for (const bad of [0, null, undefined, NaN]) {
    const s = await summary(stored("FZI", [line("A", 1000, "USD", bad)]), "AED");
    assert.equal(s.kind, "different");
    assert.equal(s.regionalTotal, null);
    assert.equal(s.groups[0].rateProblem, "missing");
    assert.equal(s.groups[0].exchangeRate, null);
    near(s.groups[0].transactionTotal, 1000, "the transaction value is still shown");
  }
});

test("a rate of exactly 1 between two different currencies is flagged (approval refuses it)", async () => {
  const s = await summary(stored("FZI", [line("A", 1000, "USD", 1)]), "AED");
  assert.equal(s.groups[0].rateProblem, "one");
});

test("lines of one currency with different rates: flagged, not averaged", async () => {
  const s = await summary(stored("FZI", [line("A", 1000, "USD", 3.6), line("B", 1000, "USD", 3.7)]), "AED");
  assert.equal(s.groups[0].ratesVary, true);
  assert.equal(s.groups[0].exchangeRate, null);
  near(s.regionalTotal, 3600 + 3700);
});

test("no lines / unpriced lines -> empty; no regional currency configured -> legacy INR, never a guess from the amounts", async () => {
  assert.equal((await summary(stored("India", []), "INR")).kind, "empty");
  assert.equal((await summary(stored("India", [line("A", 0, "INR", 1)]), "INR")).kind, "empty");
  const legacy = await summary(stored("Unmapped", [line("A", 1000, "INR", 1)]), null);
  assert.equal(legacy.kind, "same");
  assert.equal(legacy.regionalCurrency, "INR");
  const usd = await summary(stored("Unmapped", [line("A", 100, "USD", 95)]), null);
  assert.equal(usd.kind, "different");
  assert.equal(usd.regionalCurrency, "INR");
  near(usd.regionalTotal, 9500);
});

test("the shared transaction sum counts a LUMP SUM line once and others as quantity x rate", async () => {
  const { sumTransactionCurrencyValue } = await load("/src/utils/quantityCalculations.ts");
  assert.equal(sumTransactionCurrencyValue([{ uom: "LUMP SUM", woQty: 9, unitRate: 100 }, { uom: "DAY", woQty: 3, unitRate: 10 }, { uom: " lump sum ", woQty: 2, unitRate: 5 }]), 135);
  assert.equal(sumTransactionCurrencyValue([]), 0);
});

test("wiring: the detail page renders the summary after the timeline, from the server's regionalCurrency, and the Approve/Reject bar is untouched", () => {
  const page = src("pages/PRRequests/PRRequestDetail.tsx");
  assert.match(page, /buildPRCommercialSummary\(request\.projectData, request\.regionalCurrency\)/);
  assert.ok(page.indexOf("<ProjectTimeline") < page.indexOf("<CommercialSummaryCard"));
  assert.match(src("types/PRRequest.ts"), /regionalCurrency: string \| null/);
  assert.match(page, /canActOnAccountsStage/);
  assert.match(page, /Approve – Create Project|Approve - Create Project|Create Project/);
});
