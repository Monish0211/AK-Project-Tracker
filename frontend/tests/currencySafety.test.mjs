// Approved currency rules (Nov 2026): a currency, rate or value the user entered is never silently replaced - on a PR Category change, when the
// category list arrives late, when a saved PR request is opened, and between two Edit Project windows.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.window = { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: "stub-notification-service", enforce: "pre", load(id) { return id.split("\\").join("/").endsWith("/src/notifications/notificationService.ts") ? "export const notificationService = new Proxy({}, { get: () => () => undefined });" : null; } }],
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());
const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

const Q = () => load("/src/utils/quantityCalculations.ts");
const S = () => load("/src/utils/regionalCurrencySync.ts");
const line = (over = {}) => ({ id: "q1", description: "Study", woQty: 1, invoiceQty: 0, uom: "DAY", unitRate: 87260, currency: "USD", exchangeRate: 3.6725, ...over });
const project = (over = {}) => ({ prCategory: "Abu Dhabi", regionalCurrency: "AED", currency: "USD", currentExchangeRate: 3.6725, contractExchangeRate: 3.6725, gstApplicable: false, quantityItems: [line()], ...over });
const money = (p) => [p.currency, p.currentExchangeRate, p.quantityItems.map((i) => [i.currency, i.unitRate])];
const change = async (p, regional) => ({ ...p, ...(await Q()).applyRegionalCurrencyToProject(p, regional) });
const reference = {
  enforced: true,
  items: [["India", "INR"], ["Abu Dhabi", "AED"], ["FZI", "AED"], ["Oman", "OMR"], ["Unmapped", null]].map(([prCategory, c]) => ({ prCategory, prNoPrefix: "X", authorized: true, country: c ? { code: prCategory, name: prCategory, displayName: prCategory, defaultCurrency: c } : null })),
};

test("CATEGORY CHANGE, same country currency (Abu Dhabi <-> FZE): currency, rate, prices and value stay", async () => {
  const there = await change(project(), "AED");
  assert.deepEqual(money(there), ["USD", 3.6725, [["USD", 87260]]]);
  assert.equal(Math.round(there.workOrderValueRegional * 100) / 100, 320462.35);
  assert.deepEqual(money(await change(there, "AED")), money(there));
});

test("CATEGORY CHANGE, other country currency: the currency and prices stay, the rate is cleared - never silently relabelled or set to 1", async () => {
  const oman = await change(project(), "OMR");
  assert.deepEqual(money(oman), ["USD", 0, [["USD", 87260]]]);
  assert.equal(oman.regionalCurrency, "OMR");
  assert.equal(oman.workOrderValueRegional, 0);
  assert.deepEqual(money(await change(oman, "AED")), ["USD", 0, [["USD", 87260]]], "never AED 87,260");
  const inAed = project({ currency: "AED", currentExchangeRate: 1, contractExchangeRate: 1, quantityItems: [line({ currency: "AED", exchangeRate: 1 })] });
  assert.deepEqual(money(await change(inAed, "OMR")), ["AED", 0, [["AED", 87260]]], "AED prices moved to Oman stay AED");
});

test("CATEGORY CHANGE into the price currency: rate 1; with nothing priced the form takes the new country's currency, as before", async () => {
  const intoOwn = await change(project({ regionalCurrency: "INR", currency: "AED", currentExchangeRate: 22.5, quantityItems: [line({ currency: "AED", exchangeRate: 22.5 })] }), "AED");
  assert.deepEqual(money(intoOwn), ["AED", 1, [["AED", 87260]]]);
  const unpriced = await change(project({ quantityItems: [line({ unitRate: 0 })] }), "OMR");
  assert.deepEqual([unpriced.currency, unpriced.currentExchangeRate, unpriced.quantityItems[0].currency], ["OMR", 1, "OMR"]);
});

test("SAVED REQUEST OPENED, list not yet loaded: no line rate is rewritten (INR priced in an AED project kept its 0.0441)", async () => {
  const { recalculateProjectQuantities } = await Q();
  for (const [currency, rate] of [["INR", 0.0441], ["USD", 3.6725]]) {
    const opened = project({ regionalCurrency: undefined, currency, currentExchangeRate: rate, quantityItems: [line({ currency, exchangeRate: rate })] });
    assert.equal(recalculateProjectQuantities(opened, undefined).quantityItems[0].exchangeRate, rate, currency);
    const { regionalCurrencyUpdate } = await S();
    const settled = { ...opened, ...regionalCurrencyUpdate(opened, reference, "Abu Dhabi") };
    assert.deepEqual(money(settled), [currency, rate, [[currency, 87260]]]);
    assert.equal(settled.quantityItems[0].exchangeRate, rate);
    assert.equal(settled.regionalCurrency, "AED");
    assert.equal(regionalCurrencyUpdate(settled, reference, "Abu Dhabi"), null, "settled once");
  }
});

test("LATE LIST: a new form takes its category's currency; a saved request whose category was changed first follows the change rule", async () => {
  const { regionalCurrencyUpdate, isRegionalCurrencyReady } = await S();
  const blank = project({ regionalCurrency: undefined, currency: "INR", currentExchangeRate: 1, quantityItems: [line({ unitRate: 0, currency: "INR", exchangeRate: 1 })] });
  assert.equal(isRegionalCurrencyReady(blank, null), false, "no list: not ready");
  assert.equal(isRegionalCurrencyReady(blank, reference), false, "category currency not applied yet");
  const ready = { ...blank, ...regionalCurrencyUpdate(blank, reference, "") };
  assert.deepEqual([ready.currency, ready.currentExchangeRate, ready.regionalCurrency], ["AED", 1, "AED"]);
  assert.equal(isRegionalCurrencyReady(ready, reference), true);
  const movedBeforeList = project({ prCategory: "Oman", regionalCurrency: undefined });
  const moved = { ...movedBeforeList, ...regionalCurrencyUpdate(movedBeforeList, reference, "Abu Dhabi") };
  assert.deepEqual([moved.currency, moved.currentExchangeRate, moved.regionalCurrency], ["USD", 0, "OMR"], "the AED rate is not reused for Oman");
  assert.equal(regionalCurrencyUpdate(project({ prCategory: "" }), reference, ""), null);
  assert.equal(isRegionalCurrencyReady(project({ prCategory: "Unmapped", regionalCurrency: undefined }), reference), true);
});

test("a foreign currency without a rate is named before anything is saved", async () => {
  const { missingExchangeRateMessage } = await S();
  assert.equal(missingExchangeRateMessage(project({ regionalCurrency: "OMR", currentExchangeRate: 0 })), "Enter the exchange rate on the Quantity tab: 1 USD = ? OMR.");
  assert.equal(missingExchangeRateMessage(project()), null);
  assert.equal(missingExchangeRateMessage(project({ currency: "AED", currentExchangeRate: 0 })), null);
  assert.equal(missingExchangeRateMessage(project({ regionalCurrency: undefined, currentExchangeRate: 0 })), null);
});

test("TWO WINDOWS: a change of currency, rate or any quantity value is detected; the same data in another order is not", async () => {
  const guard = await load("/src/services/projectCurrencyGuard.ts");
  const { apiClient } = await load("/src/services/apiClient.ts");
  const original = apiClient.get;
  const server = { currency: "USD", currentExchangeRate: 3.6725, contractExchangeRate: 3.6725, lines: [line({ id: "b" }), line({ id: "a", description: "Other" })] };
  apiClient.get = async (path) => (path.endsWith("/quantity") ? { items: server.lines } : server);
  try {
    const opened = await guard.readSavedCurrencyState("p1");
    server.lines = [...server.lines].reverse();
    assert.equal(guard.savedStateChanged(opened, await guard.readSavedCurrencyState("p1")), false);
    for (const alter of [() => (server.currency = "EUR"), () => (server.currentExchangeRate = 4.01), () => (server.lines = [line({ id: "a", unitRate: 1 }), line({ id: "b" })]), () => (server.lines = [line({ id: "a" })])]) {
      const keep = { ...server };
      alter();
      assert.equal(guard.savedStateChanged(opened, await guard.readSavedCurrencyState("p1")), true, String(alter));
      Object.assign(server, keep);
    }
  } finally {
    apiClient.get = original;
  }
  assert.equal(guard.currencyDiffers({ currency: "USD", currentExchangeRate: 3.6725, contractExchangeRate: 3.6725 }, { currency: "USD", currentExchangeRate: 3.6725, contractExchangeRate: 3.6725 }), false);
});

test("wiring: General saves without the currency, which follows the saved lines; screens wait for the currency; the heading names no currency", () => {
  const buttons = src("pages/Projects/components/FormButtons.tsx");
  assert.match(buttons, /createProjectGeneralInfo\(project, \{ omitCurrency: true \}\)/);
  assert.match(buttons, /updateProjectGeneralInfo\(existing\.id, project, \{ omitCurrency: true \}\)/);
  assert.ok(buttons.indexOf("syncQuantityItemsWithApi(projectToSave.id") < buttons.indexOf("saveProjectCurrency(projectToSave.id"), "lines first, then the currency");
  assert.ok(buttons.indexOf("savedStateChanged(opened, now)") < buttons.indexOf("updateProjectGeneralInfo(existing.id"), "stale check before any write");
  assert.match(buttons, /The currency change was not saved/);
  const review = src("pages/PRRequests/PRRequestReviewFormButtons.tsx");
  assert.equal(review.split("|| !ready}").length - 1, 4, "Save, Reject, Confirm Rejection and Approve wait");
  assert.match(src("pages/PRRequests/RequestPRFormButtons.tsx"), /disabled=\{isSaving \|\| !ready\}/);
  assert.match(src("pages/Projects/components/ProjectForm.tsx"), /useRegionalCurrency\(project, setProject, prCategoryCountries, mode === "add"\)/);
  assert.doesNotMatch(src("pages/Projects/Projects.tsx"), /WO Value \(INR\)/);
});
