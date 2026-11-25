// Project Tax (Nov 2026): the Tax setting of a project outside India - calculation (regional Work Order Value, currency decimals), which card a project
// shows, what a save sends, PR Request drafts and the two screens. India keeps the GST card and calculation unchanged.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
let React;
let render;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
globalThis.window = { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: "stub-notification-service", enforce: "pre", load(id) { return id.split("\\").join("/").endsWith("/src/notifications/notificationService.ts") ? "export const notificationService = new Proxy({}, { get: () => () => undefined });" : null; } }],
  });
  load = (p) => vite.ssrLoadModule(p);
  React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  render = (el) => renderToStaticMarkup(el);
});
after(() => vite?.close());

const T = () => load("/src/utils/projectTax.ts");
const REFERENCE = {
  enforced: true,
  items: [
    ["India", "INR", "GST"], ["Malaysia", "MYR", "TAX"], ["Oman", "OMR", "TAX"], ["Abu Dhabi", "AED", "TAX"], ["FZI", "AED", "TAX"], ["Elixir Qatar", "QAR", "TAX"], ["Qatar", "QAR", "TAX"],
  ].map(([prCategory, defaultCurrency, taxMode]) => ({ prCategory, prNoPrefix: "X", country: { code: null, name: prCategory, displayName: prCategory, defaultCurrency }, taxMode, authorized: true })),
};
// the 4th argument is passed through as given (undefined included); omitted = Applicable
const calc = async (workOrderValue, currency, ratePercent, ...rest) => (await T()).computeProjectTax({ workOrderValue, currency, applicable: rest.length ? rest[0] : true, ratePercent });
const amounts = (f) => [f.taxAmount, f.grandTotal];

test("EXAMPLE: AED 42,000 at 5% = tax 2,100, total 44,100; every preset and custom decimals", async () => {
  assert.deepEqual(amounts(await calc(42000, "AED", 5)), [2100, 44100]);
  for (const [rate, tax] of [[0, 0], [2, 840], [5, 2100], [10, 4200], [12, 5040], [18, 7560], [7.5, 3150], [3, 1260], [15, 6300], [20, 8400], [100, 42000]]) {
    assert.deepEqual(amounts(await calc(42000, "AED", rate)), [tax, 42000 + tax], `${rate}%`);
  }
});

test("PRECISION: OMR has 3 decimals, the others 2; rounding is half up on whole minor units and the three figures always add up", async () => {
  assert.deepEqual(amounts(await calc(3696, "OMR", 5)), [184.8, 3880.8]);
  assert.deepEqual(amounts(await calc(1234.567, "OMR", 7.5)), [92.593, 1327.16], "92.592525 -> 92.593");
  assert.deepEqual(amounts(await calc(0.1, "AED", 5)), [0.01, 0.11], "0.005 rounds up");
  assert.deepEqual(amounts(await calc(100.1, "QAR", 2.5)), [2.5, 102.6], "2.5025 -> 2.50");
  assert.equal((await calc(1.005, "MYR", 0)).workOrderValue, 1.01, "no binary-float loss");
  assert.deepEqual(amounts(await calc(320244.2, "AED", 5)), [16012.21, 336256.41]);
  assert.deepEqual(amounts(await calc(987654321.99, "AED", 12.3456)), [121931851.98, 1109586173.97]);
  for (const [wo, rate] of [[12345.678, 7.5], [0.001, 18], [99999.999, 3.3333]]) {
    const f = await calc(wo, "OMR", rate);
    assert.equal(Math.round((f.workOrderValue + f.taxAmount) * 1000), Math.round(f.grandTotal * 1000));
  }
});

test("STATES: Not Applicable = tax 0 and total = Work Order Value; Not Set and a missing rate have NO tax amount (never assumed 0%)", async () => {
  const na = await calc(42000, "AED", 5, false);
  assert.deepEqual([na.status, na.taxAmount, na.grandTotal], ["NOT_APPLICABLE", 0, 42000]);
  for (const applicable of [null, undefined]) {
    const ns = await calc(42000, "AED", 5, applicable);
    assert.deepEqual([ns.status, ns.taxAmount, ns.grandTotal], ["NOT_SET", null, 42000]);
  }
  const missing = await calc(42000, "AED", null, true);
  assert.deepEqual([missing.status, missing.taxAmount, missing.grandTotal], ["RATE_MISSING", null, 42000]);
  assert.deepEqual([(await calc(42000, "AED", 0)).status, (await calc(42000, "AED", 0)).taxAmount], ["APPLIED", 0], "0% is a real choice");
});

test("CUSTOM INPUT: up to 4 decimals within 0..100", async () => {
  const { parseTaxRateInput } = await T();
  for (const [text, rate] of [["7.5", 7.5], ["3", 3], ["0", 0], ["100", 100], [".5", 0.5], ["7.", 7], ["12.3456", 12.3456]]) assert.deepEqual(parseTaxRateInput(text), { rate, error: null }, text);
  for (const text of ["", "101", "100.5", "-1", "abc", "1.23456", "1,5"]) {
    const r = parseTaxRateInput(text);
    assert.equal(r.rate, null, text);
    assert.ok(r.error, text);
  }
});

test("MODE: the server's verdict - per saved project while its category is unchanged, else per category; never the currency", async () => {
  const { resolveTaxMode, taxFieldsApply } = await T();
  assert.equal(resolveTaxMode({ prCategory: "India" }, REFERENCE), "GST");
  for (const c of ["Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"]) assert.equal(resolveTaxMode({ prCategory: c }, REFERENCE), "TAX", c);
  const legacy = { prCategory: "Elixir Qatar", taxMode: "GST", taxModeCategory: "Elixir Qatar" };
  assert.equal(resolveTaxMode(legacy, REFERENCE), "GST", "a saved legacy project keeps GST");
  assert.equal(taxFieldsApply(legacy), false);
  assert.equal(resolveTaxMode({ ...legacy, prCategory: "Oman" }, REFERENCE), "TAX", "a changed category follows the new category");
  assert.equal(resolveTaxMode({ prCategory: "Oman" }, null), "GST", "reference not loaded: the existing card, nothing invented");
  assert.equal(resolveTaxMode({ prCategory: "Oman", taxMode: "TAX", taxModeCategory: "Oman" }, null), "TAX");
});

test("PAYLOAD: India and legacy never send Tax; unknown (undefined) values are not sent; a known value, including null, is", async () => {
  const { taxPayloadFields } = await T();
  assert.deepEqual(taxPayloadFields({ prCategory: "India", taxApplicable: true, taxRatePercent: 5 }), {});
  assert.deepEqual(taxPayloadFields({ prCategory: "Elixir Qatar", taxMode: "GST", taxModeCategory: "Elixir Qatar", taxApplicable: null }), {});
  assert.deepEqual(taxPayloadFields({ prCategory: "Oman" }), {});
  assert.deepEqual(taxPayloadFields({ prCategory: "Oman", taxApplicable: false, taxRatePercent: 7.5 }), { taxApplicable: false, taxRatePercent: 7.5 });
  assert.deepEqual(taxPayloadFields({ prCategory: "Oman", taxApplicable: null, taxRatePercent: null }), { taxApplicable: null, taxRatePercent: null });
});

const SERVER_ROW = { id: "p-tax", prNo: "PRAD-9", prCategory: "Abu Dhabi", regionalCurrency: "AED", currency: "USD", currentExchangeRate: 3.67, contractExchangeRate: 3.67, projectTitle: "T", client: "C", gstApplicable: false, taxMode: "TAX", taxApplicable: true, taxRatePercent: 5 };

test("SAVE + RELOAD: a save sends the Tax settings and the reopened project (general info first, then lines) keeps them", async () => {
  const svc = await load("/src/services/projectService.ts");
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    sent.push({ method: init.method ?? "GET", body });
    return new Response(JSON.stringify({ success: true, data: { ...SERVER_ROW, ...(body ?? {}), createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    mem.clear();
    await svc.updateProjectGeneralInfo("p-tax", { ...createEmptyProject(), id: "p-tax", prCategory: "Abu Dhabi", taxApplicable: true, taxRatePercent: 7.5 });
    assert.deepEqual([sent.at(-1).body.taxApplicable, sent.at(-1).body.taxRatePercent], [true, 7.5]);
    await svc.updateProjectGeneralInfo("p-tax", { ...createEmptyProject(), id: "p-tax", prCategory: "India", gstApplicable: true, taxApplicable: true, taxRatePercent: 7.5 });
    assert.equal("taxApplicable" in sent.at(-1).body, false, "India sends no Tax field");
    assert.equal("taxRatePercent" in sent.at(-1).body, false);
    assert.equal(sent.at(-1).body.gstApplicable, true);
    await svc.createProjectGeneralInfo({ ...createEmptyProject(), prCategory: "Oman" });
    assert.equal("taxApplicable" in sent.at(-1).body, false, "an untouched new project sends nothing: the server stores Not Set");

    mem.clear();
    const fetched = await svc.fetchProjectByIdFromApi("p-tax", { includeResources: false });
    assert.deepEqual([fetched.taxMode, fetched.taxApplicable, fetched.taxRatePercent, fetched.currency], ["TAX", true, 5, "USD"]);
    const withLines = svc.normalizeProject({ ...fetched, quantityItems: [{ id: "q1", description: "x", woQty: 1, uom: "DAY", unitRate: 11444.2, currency: "USD", exchangeRate: 3.67 }] });
    assert.deepEqual([withLines.taxApplicable, withLines.taxRatePercent], [true, 5]);
    assert.equal(withLines.gstAmount, 0, "no GST is computed for a regional currency");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("RECALCULATION: quantity, unit rate, currency and exchange rate changes move the regional Work Order Value and so the Tax", async () => {
  const { recalcQuantityItem, calculateQuantity } = await load("/src/utils/quantityCalculations.ts");
  const run = async (qty, unitRate, currency, rate) => {
    const item = recalcQuantityItem({ id: "1", woQty: qty, uom: "DAY", unitRate, invoiceQty: 0 }, currency, rate, "AED");
    const totals = calculateQuantity([item], currency, rate, false, "AED");
    const f = await calc(totals.workOrderValueRegional, "AED", 5);
    return [f.workOrderValue, f.taxAmount, f.grandTotal];
  };
  assert.deepEqual(await run(1, 42000, "AED", 1), [42000, 2100, 44100]);
  assert.deepEqual(await run(1, 87260, "USD", 3.67), [320244.2, 16012.21, 336256.41], "USD priced: Tax on the AED value, not on USD or INR");
  assert.deepEqual(await run(2, 87260, "USD", 3.67), [640488.4, 32024.42, 672512.82]);
  assert.deepEqual(await run(1, 87260, "USD", 3.6725), [320462.35, 16023.12, 336485.47]);
});

test("PR REQUEST: the draft carries the Tax settings both ways; India drafts carry none", async () => {
  const { projectToDraftPayload, draftPayloadToProject } = await load("/src/pages/PRRequests/draftMapping.ts");
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  const project = { ...createEmptyProject(), prCategory: "Oman", taxApplicable: true, taxRatePercent: 7.5 };
  const payload = projectToDraftPayload(project);
  assert.deepEqual([payload.taxApplicable, payload.taxRatePercent], [true, 7.5]);
  const back = draftPayloadToProject(createEmptyProject(), JSON.parse(JSON.stringify(payload)));
  assert.deepEqual([back.taxApplicable, back.taxRatePercent], [true, 7.5]);
  assert.equal("taxApplicable" in projectToDraftPayload({ ...project, prCategory: "India" }), false);
  assert.equal("taxApplicable" in projectToDraftPayload({ ...createEmptyProject(), prCategory: "India" }), false);
});

test("VALIDATION: Applicable needs a rate (0% counts); Not Set, Not Applicable and India are never blocked", async () => {
  const { validateQuantityTab } = await load("/src/utils/projectValidation.ts");
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  const base = { ...createEmptyProject(), prCategory: "Oman" };
  const err = (over) => validateQuantityTab({ ...base, ...over }).taxRatePercent;
  assert.match(err({ taxApplicable: true, taxRatePercent: null }), /Select a Tax Rate/);
  assert.match(err({ taxApplicable: true }), /Select a Tax Rate/);
  for (const over of [{ taxApplicable: true, taxRatePercent: 0 }, { taxApplicable: false, taxRatePercent: null }, { taxApplicable: null }, {}, { prCategory: "India", taxApplicable: true }]) assert.equal(err(over), undefined, JSON.stringify(over));
});

const card = async (props) => render(React.createElement((await load("/src/pages/Projects/components/ProjectTaxCard.tsx")).default, { currency: "AED", workOrderValue: 42000, editable: true, ...props }));
const text = (html, id) => html.match(new RegExp(`data-testid="${id}"[^>]*>([^<]*)`))?.[1];

test("TAX CARD: Not Set, Applicable preset, custom, Not Applicable and read-only", async () => {
  const notSet = await card({ applicable: null, ratePercent: null });
  assert.equal(text(notSet, "tax-applicability-value"), "Not Set");
  assert.equal(text(notSet, "tax-amount"), "—");
  assert.match(text(notSet, "tax-grand-total"), /AED\s42,000\.00/);
  assert.match(notSet, /Not Set<\/option>/);
  assert.ok(!notSet.includes('data-testid="tax-rate"'), "no rate selector until Applicable");

  const five = await card({ applicable: true, ratePercent: 5 });
  assert.match(text(five, "tax-amount"), /AED\s2,100\.00/);
  assert.match(text(five, "tax-grand-total"), /AED\s44,100\.00/);
  for (const p of [0, 2, 5, 10, 12, 18]) assert.match(five, new RegExp(`<option value="${p}"[^>]*>${p}%</option>`));
  assert.match(five, />Custom<\/option>/);
  assert.ok(!five.includes("tax-rate-custom"), "a preset shows no custom box");

  const custom = await card({ applicable: true, ratePercent: 7.5 });
  assert.match(custom, /data-testid="tax-rate-custom"[^>]*value="7.5"|value="7.5"[^>]*data-testid="tax-rate-custom"/);
  assert.match(text(custom, "tax-amount"), /AED\s3,150\.00/);

  const off = await card({ applicable: false, ratePercent: 7.5 });
  assert.ok(!off.includes('data-testid="tax-rate"') && !off.includes("tax-rate-custom"), "selector hidden when Not Applicable");
  assert.match(text(off, "tax-amount"), /AED\s0\.00/);
  assert.match(text(off, "tax-grand-total"), /AED\s42,000\.00/);

  const view = await card({ editable: false, applicable: true, ratePercent: 7.5 });
  assert.ok(!view.includes("<select"), "read only");
  assert.equal(text(view, "tax-rate-value"), "7.5%");
  const omr = await card({ currency: "OMR", workOrderValue: 3696, applicable: true, ratePercent: 5 });
  assert.match(text(omr, "tax-amount"), /OMR\s184\.800/);
});

test("SCREENS: Edit and View show the Tax card outside India and the unchanged GST card for India and legacy projects", async () => {
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  const Card = (await load("/src/pages/Projects/components/QuantityCard.tsx")).default;
  const Table = (await load("/src/pages/Projects/components/QuantityTable.tsx")).default;
  const { normalizeProject } = await load("/src/services/projectService.ts");
  const make = (over) => normalizeProject({ ...createEmptyProject(), id: "x", ...over });
  const editHtml = (p) => render(React.createElement(Card, { project: p, setProject: () => {}, categoryReference: REFERENCE }));
  const viewHtml = (p) => render(React.createElement(Table, { project: p }));

  for (const over of [{ prCategory: "Oman", regionalCurrency: "OMR", currency: "OMR" }, { prCategory: "Malaysia", regionalCurrency: "MYR", currency: "USD" }, { prCategory: "Abu Dhabi", regionalCurrency: "AED", currency: "INR" }]) {
    const p = make(over);
    for (const html of [editHtml(p), viewHtml({ ...p, taxMode: "TAX", taxModeCategory: p.prCategory })]) {
      assert.match(html, /data-testid="project-tax-card"/, over.prCategory);
      assert.ok(!/GST/.test(html), `${over.prCategory}: no GST wording`);
    }
  }
  const india = make({ prCategory: "India", regionalCurrency: "INR", currency: "INR", gstApplicable: true, quantityItems: [{ id: "q", description: "x", woQty: 1, uom: "DAY", unitRate: 100000, currency: "INR", exchangeRate: 1 }] });
  const legacy = make({ prCategory: "Elixir Qatar", currency: "USD", taxMode: "GST", taxModeCategory: "Elixir Qatar" });
  for (const p of [india, legacy]) for (const html of [editHtml(p), viewHtml(p)]) {
    assert.ok(!html.includes("project-tax-card"), p.prCategory);
    assert.match(html, /GST Applicability/);
    assert.match(html, /Grand Total \(Incl\. GST\)/);
  }
  assert.match(editHtml(india), /18<!-- -->%|>18%/);
});
