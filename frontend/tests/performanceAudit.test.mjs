// Performance audit fixes (Oct 2026), verified without a browser:
//  1. A page of projects reads the localStorage mirror ONCE (it used to be
//     parsed + normalized once per row — quadratic; ~19 s on Reports with a
//     large mirror), with exactly the same merge results.
//  2. The Dashboard re-requests its summary only for data that can change it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
const store = new Map();
let getItemCalls = 0;
before(async () => {
  globalThis.localStorage = {
    getItem: (k) => (getItemCalls++, store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  globalThis.sessionStorage = globalThis.localStorage;
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    // Same inert stub as reportsLiveData.test.mjs: the notification engine mounts on import and would read the mirror mid-evaluation.
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

function dto(id, extra = {}) {
  return {
    id, poMonth: "2026-10", prCategory: "India", prNo: `PR-${id}`, rfqNo: null, client: `Client ${id}`, department: "Process", domesticForeign: "Domestic",
    projectTitle: `Server title ${id}`, workOrderStatus: "Received", projectStartDate: "2026-01-01T00:00:00.000Z", projectEndDate: null, projectStatus: "Active",
    workOrderValueINR: 1000, pendingDueINR: 500, ...extra,
  };
}

test("a page of N projects reads the mirror once, not N times — and merges exactly as before", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { queryProjectsFromApi, normalizeProject } = await load("/src/services/projectService.ts");
  // Mirror: 300 projects with local-only data, plus a stale DUPLICATE of p-1 after the first (legacy mirrors can hold one).
  const mirror = Array.from({ length: 300 }, (_, i) => normalizeProject({ id: `p-${i}`, prNo: `OLD-${i}`, projectTitle: `Local title ${i}`, nonManhourExpenses: [{ id: `e-${i}`, category: "Travel", description: "local", quantity: 1, unitCost: i, totalCost: i }] }));
  mirror.push(normalizeProject({ id: "p-1", prNo: "DUPLICATE", projectTitle: "second copy", nonManhourExpenses: [] }));
  store.set("projects", JSON.stringify(mirror));

  const rows = [...Array.from({ length: 200 }, (_, i) => dto(`p-${i}`)), dto("brand-new")];
  const orig = apiClient.get;
  apiClient.get = async () => ({ items: rows, total: rows.length, page: 1, pageSize: 201 });
  try {
    getItemCalls = 0;
    const result = await queryProjectsFromApi({ page: 1, pageSize: 201 });
    assert.equal(getItemCalls, 1, "one mirror read for the whole page");
    assert.equal(result.items.length, 201);
    const p5 = result.items.find((p) => p.id === "p-5");
    assert.equal(p5.prNo, "PR-p-5", "server general info wins");
    assert.equal(p5.projectTitle, "Server title p-5");
    assert.deepEqual(p5.nonManhourExpenses.map((e) => e.id), ["e-5"], "local-only collections are kept from the mirror");
    const p1 = result.items.find((p) => p.id === "p-1");
    assert.deepEqual(p1.nonManhourExpenses.map((e) => e.id), ["e-1"], "duplicate ids resolve to the FIRST mirror entry, as getProjects().find() did");
    const fresh = result.items.find((p) => p.id === "brand-new");
    assert.deepEqual(fresh.quantityItems, [], "a project not in the mirror starts empty, as before");
    assert.deepEqual(fresh.nonManhourExpenses, []);
  } finally {
    apiClient.get = orig;
  }
});

test("Dashboard re-requests its summary only for project / timesheet / customer changes", async () => {
  const { pmoDataChangedMatches } = await load("/src/utils/pmoDataChanged.ts");
  const ev = (entity) => ({ detail: entity ? { entity } : undefined });
  const ENTITIES = ["project", "timesheet", "customer"];
  for (const e of ["project", "timesheet", "customer"]) assert.equal(pmoDataChangedMatches(ev(e), ENTITIES), true, e);
  for (const e of ["employee", "reminder", "user", "department", "reportingManager"]) assert.equal(pmoDataChangedMatches(ev(e), ENTITIES), false, e);
  assert.equal(pmoDataChangedMatches(ev(null), ENTITIES), true, "an event without detail still refreshes (defensive)");
  assert.equal(pmoDataChangedMatches(ev("employee")), true, "other pages (no filter) still react to everything");
  const dash = readFileSync(fileURLToPath(new URL("../src/pages/Dashboard/Dashboard.tsx", import.meta.url)), "utf8");
  assert.match(dash, /const DASHBOARD_REFRESH_ENTITIES: PmoEntity\[\] = \["project", "timesheet", "customer"\];/);
  assert.match(dash, /useLiveRefresh\(DASHBOARD_REFRESH_ENTITIES\)/);
  const hook = readFileSync(fileURLToPath(new URL("../src/hooks/useLiveRefresh.ts", import.meta.url)), "utf8");
  assert.match(hook, /pmoDataChangedMatches\(event, filter\)/);
});
