// Nov 2026 regression (PRAD-2613, Abu Dhabi): Edit Project opens a project in two steps - its general information first (no quantity lines: the
// browser mirror is empty after a logout), then its quantity lines. The first step used to replace a saved USD @ 3.67 with the regional AED @ 1,
// and the second step never brought it back. A currency someone chose must survive both steps; only the untouched INR @ 1 default is replaced.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
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
});
after(() => vite?.close());

const LINE = { id: "q1", description: "5 Year Revalidation HAZOP", woQty: 1, uom: "DAY", unitRate: 87260, currency: "USD", exchangeRate: 3.67 };

test("a saved USD @ 3.67 on an Abu Dhabi project stays USD @ 3.67 when it is opened without its lines and then gets them (the Edit Project load order)", async () => {
  const { normalizeProject } = await load("/src/services/projectService.ts");
  const general = { id: "p-ad", prNo: "PRAD-2613", prCategory: "Abu Dhabi", regionalCurrency: "AED", currency: "USD", currentExchangeRate: 3.67, contractExchangeRate: 3.67, quantityItems: [] };
  const step1 = normalizeProject(general);
  assert.deepEqual([step1.currency, step1.currentExchangeRate, step1.contractExchangeRate], ["USD", 3.67, 3.67], "step 1 (no lines yet) keeps the saved currency and rates");
  const step2 = normalizeProject({ ...step1, quantityItems: [LINE] });
  assert.deepEqual([step2.currency, step2.currentExchangeRate], ["USD", 3.67]);
  assert.equal(Math.round(step2.quantityItems[0].woValueRegional * 100) / 100, 320244.2, "the line is still AED 320,244.20");
});

test("a brand-new Abu Dhabi project (the untouched INR @ 1 default, nothing priced) still opens as AED @ 1, and a priced one keeps what was saved", async () => {
  const { normalizeProject } = await load("/src/services/projectService.ts");
  const fresh = normalizeProject({ id: "p-new", prNo: "PRAD-1", prCategory: "Abu Dhabi", regionalCurrency: "AED", currency: "INR", currentExchangeRate: 1, quantityItems: [] });
  assert.deepEqual([fresh.currency, fresh.currentExchangeRate], ["AED", 1]);
  const pricedAed = normalizeProject({ id: "p-aed", prNo: "PRAD-2", prCategory: "Abu Dhabi", regionalCurrency: "AED", currency: "AED", currentExchangeRate: 1, quantityItems: [{ ...LINE, currency: "AED", exchangeRate: 1 }] });
  assert.deepEqual([pricedAed.currency, pricedAed.currentExchangeRate], ["AED", 1]);
});
