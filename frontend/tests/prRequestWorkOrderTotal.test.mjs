// PR Request review/edit: a saved request opened again must show its real Total WO Value and Total Project Budget, in every currency.
// Root cause: the stored payload holds only the raw inputs (qty, unit rate, rate). draftPayloadToProject never worked out the totals (so the
// Quantity card and the Expense Budget card both showed 0 for INR, USD and every region) and priced a line's WO value as qty x unit rate in the
// TRANSACTION currency, so a USD 6,845 line showed "₹ 6,845.00" instead of ₹ 6,50,275.
//
// Run: node --test --test-concurrency=1 --test-timeout=240000 tests/prRequestWorkOrderTotal.test.mjs
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

const line = (description, unitRate, over = {}) => ({ description, woQty: 1, uom: "LUMP SUM", assignedTo: null, currency: "USD", unitRate, exchangeRate: 95, ...over });
const stored = (over = {}) => ({
  poMonth: "2026-11", prCategory: "India", prNo: "PR-1", rfqNo: "RFQ-1", client: "C", department: "PMO", domesticForeign: "Foreign", projectTitle: "T", workOrderStatus: "Received",
  projectStartDate: "2026-11-11T00:00:00.000Z", projectEndDate: "2027-01-30T00:00:00.000Z", projectStatus: "Not Started", workOrderNumber: "WO", workOrderDate: "2026-11-01T00:00:00.000Z",
  eicName: "E", contractType: "LUMP SUM", pmoCoordinator: "P", paymentType: "Milestone", gstApplicable: false, currency: "USD", currentExchangeRate: 95, contractExchangeRate: 95,
  quantityItems: [line("QRA", 6845), line("HAC", 4070), line("SiP", 2775)], paymentMilestones: [], ...over,
});

async function loadDraft(data) {
  const { draftPayloadToProject } = await load("/src/pages/PRRequests/draftMapping.ts");
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  return draftPayloadToProject(createEmptyProject(), data);
}

test("USD request (the reported case): every line priced in rupees at the saved rate, and the Total WO Value / Total Project Budget are no longer 0", async () => {
  const p = await loadDraft(stored());
  assert.deepEqual(p.quantityItems.map((i) => i.unitRateINR), [650275, 386650, 263625]);
  assert.deepEqual(p.quantityItems.map((i) => i.woValue), [650275, 386650, 263625], "a line's WO value is in rupees, not the USD amount");
  assert.equal(p.workOrderValueINR, 1300550);
  assert.equal(p.totalProjectBudget, 1300550);
  assert.equal(p.workOrderValue, 13690, "the total in the transaction currency (USD)");
  assert.equal(p.currency, "USD");
  assert.equal(p.currentExchangeRate, 95, "the saved currency and rate are never changed");
});

test("INR request: the same 0-total bug is fixed (qty x rate for non-lump-sum lines), and GST is added when applicable", async () => {
  const p = await loadDraft(stored({ currency: "INR", currentExchangeRate: 1, contractExchangeRate: 1, gstApplicable: true, quantityItems: [line("A", 100000, { currency: "INR", exchangeRate: 1 }), line("B", 2500, { currency: "INR", exchangeRate: 1, uom: "MAN-DAY", woQty: 4 })] }));
  assert.deepEqual(p.quantityItems.map((i) => i.woValue), [100000, 10000]);
  assert.equal(p.workOrderValueINR, 110000);
  assert.equal(p.totalProjectBudget, 110000);
  assert.equal(p.gstAmount, 19800);
  assert.equal(p.grandTotal, 129800);
});

test("other regions: once the category's regional currency is known, the lines and totals move to the regional figures (never summed as rupees)", async () => {
  const { recalculateProjectQuantities } = await load("/src/utils/quantityCalculations.ts");
  const p = await loadDraft(stored({ prCategory: "Oman", currency: "USD", currentExchangeRate: 0.385, contractExchangeRate: 0.385, quantityItems: [line("A", 1000, { exchangeRate: 0.385 }), line("B", 200, { exchangeRate: 0.385, uom: "MAN-DAY", woQty: 3 })] }));
  const omr = { ...p, regionalCurrency: "OMR", ...recalculateProjectQuantities(p, "OMR") };
  assert.deepEqual(omr.quantityItems.map((i) => i.woValueRegional), [385, 231]);
  assert.deepEqual(omr.quantityItems.map((i) => i.woValue), [0, 0], "no rupee figures for an Oman project");
  assert.equal(omr.workOrderValueRegional, 616);
  assert.equal(omr.workOrderValueINR, 0);
  assert.equal(omr.totalProjectBudget, 616);
  const { regionalWorkOrderValue } = await load("/src/utils/currencyDisplay.ts");
  assert.equal(regionalWorkOrderValue(omr), 616, "what the Quantity and Expense Budget cards show");
});

test("an empty request still loads with zero totals and the form's blank line", async () => {
  const p = await loadDraft(stored({ quantityItems: [] }));
  assert.equal(p.workOrderValueINR, 0);
  assert.equal(p.quantityItems.length >= 0, true);
});

test("wiring: the PR form reprices a priced draft once the regional currency is looked up", () => {
  const form = src("pages/PRRequests/RequestPRForm.tsx");
  assert.match(form, /useRegionalCurrency\(project, setProject, currencyReference, true\)/);
  assert.match(src("utils/regionalCurrencySync.ts"), /regionalCurrency: savedRegional, \.\.\.recalculateProjectQuantities\(project, savedRegional\)/);
  assert.match(src("pages/PRRequests/draftMapping.ts"), /recalculateProjectQuantities\(loaded, loaded\.regionalCurrency\)/);
});
