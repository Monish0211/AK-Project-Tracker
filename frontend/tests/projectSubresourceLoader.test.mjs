// Edit Project load (Oct 2026 performance pass): the four lists are READ at the same time, while the one-time migration of older
// browser-stored data keeps its original order and acts as the barrier the lists after it wait for. Deterministic — no millisecond
// thresholds: requests are gated and counted, and the real services run against a stubbed API and a real (in-memory) mirror.
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
const store = new Map();
before(async () => {
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
  globalThis.sessionStorage = globalThis.localStorage;
  globalThis.window = { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: "stub-notification-service", enforce: "pre", load: (id) => (id.split("\\").join("/").endsWith("/src/notifications/notificationService.ts") ? "export const notificationService = new Proxy({}, { get: () => () => undefined });" : null) }],
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());
beforeEach(() => store.clear());

const LOADER = "/src/services/projectSubresourceLoader.ts";
const tick = () => new Promise((r) => setTimeout(r, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

// ───────────────────────── orchestration, with fake dependencies ─────────────────────────
function fakeDeps(over = {}) {
  const log = [];
  const gates = {};
  const gate = (name) => (gates[name] ??= deferred());
  const reads = (name, value) => () => {
    log.push(`read:${name}`);
    if (over.failRead === name) return Promise.reject(new Error(`${name} read failed`));
    return over.gated ? gate(`read:${name}`).promise.then(() => value) : Promise.resolve(value);
  };
  const loads = (name) => async (id, prefetched) => {
    log.push(`load:${name}${prefetched === undefined ? ":own-read" : ":prefetched"}`);
    if (over.failLoad === name) throw new Error(`${name} migration failed`);
    if (over.gatedLoads) await gate(`load:${name}`).promise;
    log.push(`done:${name}`);
    return `${name}-result`;
  };
  const local = { invoiceItems: [], nonManhourExpenses: [], ...(over.local ?? { quantityItems: [{ id: "lq" }], paymentMilestones: [{ id: "lm" }] }) };
  const deps = {
    readQuantity: reads("quantity", over.quantity ?? ["q"]),
    readMilestones: reads("milestones", over.milestones ?? ["m"]),
    readInvoices: reads("invoices", over.invoices ?? [{ id: "i", invoices: [] }]),
    readExpenses: reads("expenses", { items: ["e"], count: 1, latestUpdatedAt: null }),
    refreshResources: async (p) => (log.push("read:resources"), { ...p, resources: ["r"] }),
    loadQuantity: loads("quantity"),
    loadMilestones: loads("milestones"),
    loadInvoices: loads("invoices"),
    loadExpenses: loads("expenses"),
    getLocalProject: () => local,
    rememberExpensesBaseline: () => log.push("baseline"),
  };
  return { deps, log, gate };
}

test("all five reads start together, before any has answered, and are each made exactly once", async () => {
  const { loadProjectSubresources } = await load(LOADER);
  const { deps, log, gate } = fakeDeps({ gated: true });
  const pending = loadProjectSubresources("p1", { id: "p1" }, deps);
  await tick();
  assert.deepEqual([...log].sort(), ["read:expenses", "read:invoices", "read:milestones", "read:quantity", "read:resources"], "all in flight at once");
  assert.equal(log.some((l) => l.startsWith("load:")), false, "no loader has started: Phase 1 only reads");
  for (const n of ["quantity", "milestones", "invoices", "expenses"]) gate(`read:${n}`).resolve();
  const result = await pending;
  assert.equal(log.filter((l) => l.startsWith("read:")).length, 5, "no read is repeated");
  assert.equal(result.quantityItems.ok && result.paymentMilestones.ok && result.invoiceItems.ok && result.nonManhourExpenses.ok, true);
  assert.deepEqual(result.project.resources, ["r"], "the project comes back with the server's resources merged");
});

test("the loaders then run in their ORIGINAL order — Quantity, Milestones, Invoices, Expenses — each starting only after the previous finished (the migration barrier)", async () => {
  const { loadProjectSubresources } = await load(LOADER);
  const { deps, log, gate } = fakeDeps({ gatedLoads: true, quantity: [] }); // a Quantity migration is possible -> the ordered path
  const pending = loadProjectSubresources("p1", { id: "p1" }, deps);
  const order = ["quantity", "milestones", "invoices", "expenses"];
  for (let i = 0; i < order.length; i++) {
    await tick();
    const started = log.filter((l) => l.startsWith("load:")).map((l) => l.split(":")[1]);
    assert.deepEqual(started, order.slice(0, i + 1), `only ${order.slice(0, i + 1).join(" → ")} have started`);
    gate(`load:${order[i]}`).resolve();
  }
  await pending;
  assert.deepEqual(log.filter((l) => l.startsWith("done:")), order.map((n) => `done:${n}`));
});

test("a list that depends on a migration is never trusted from the concurrent read: Invoices read again after Quantity / Milestones when either may migrate", async () => {
  const { loadProjectSubresources } = await load(LOADER);
  const tag = (log) => log.find((l) => l.startsWith("load:invoices"));
  // quantity empty on the server, something in the mirror -> will migrate -> invoices must read for themselves, afterwards
  let t = fakeDeps({ quantity: [], local: { quantityItems: [{ id: "lq" }], paymentMilestones: [] } });
  await loadProjectSubresources("p1", { id: "p1" }, t.deps);
  assert.equal(tag(t.log), "load:invoices:own-read");
  // milestones empty on the server, something in the mirror
  t = fakeDeps({ milestones: [], local: { quantityItems: [], paymentMilestones: [{ id: "lm", milestoneName: "Advance", paymentPercentage: 50 }] } });
  await loadProjectSubresources("p2", { id: "p2" }, t.deps);
  assert.equal(tag(t.log), "load:invoices:own-read");
  // …but the empty starting milestone row every project has locally is NOT migrated (the loader skips incomplete rows), so it must not
  // cost an extra Invoice read
  t = fakeDeps({ milestones: [], local: { quantityItems: [], paymentMilestones: [{ id: "filler", milestoneName: "", paymentPercentage: 0 }] } });
  await loadProjectSubresources("p2b", { id: "p2b" }, t.deps);
  assert.equal(t.log.some((l) => l.startsWith("load:")), false, "nothing to migrate: no loader at all, so no extra Invoice read either");
  assert.equal(t.log.filter((l) => l === "read:invoices").length, 1);
  // when Quantity migrates, the other lists use their concurrent read except Invoices
  t = fakeDeps({ quantity: [] });
  await loadProjectSubresources("p5", { id: "p5" }, t.deps);
  assert.equal(["milestones", "expenses"].every((n) => t.log.includes(`load:${n}:prefetched`)), true, "the other lists use their concurrent read");
});

test("failures stay isolated and never leave a half-applied list: a failed read is reported, not retried, and its loader never runs; a failed migration does not stop the lists after it", async () => {
  const { loadProjectSubresources } = await load(LOADER);
  let t = fakeDeps({ failRead: "milestones" });
  let r = await loadProjectSubresources("p1", { id: "p1" }, t.deps);
  assert.equal(r.paymentMilestones.ok, false);
  assert.match(String(r.paymentMilestones.error), /milestones read failed/);
  assert.deepEqual([r.quantityItems.ok, r.invoiceItems.ok, r.nonManhourExpenses.ok], [true, true, true], "the other lists load");
  assert.equal(t.log.filter((l) => l === "read:milestones").length, 1, "one attempt, no silent retry");
  assert.equal(t.log.some((l) => l.startsWith("load:milestones")), false, "nothing was written for the failed list");
  t = fakeDeps({ failLoad: "quantity", quantity: [] });
  r = await loadProjectSubresources("p2", { id: "p2" }, t.deps);
  assert.equal(r.quantityItems.ok, false);
  assert.match(String(r.quantityItems.error), /quantity migration failed/);
  assert.deepEqual([r.paymentMilestones.ok, r.invoiceItems.ok, r.nonManhourExpenses.ok], [true, true, true], "later lists still run, as before");
  // a synchronous throw is an outcome too — the orchestration itself never rejects
  t = fakeDeps();
  t.deps.readInvoices = () => { throw new Error("sync boom"); };
  r = await loadProjectSubresources("p3", { id: "p3" }, t.deps);
  assert.equal(r.invoiceItems.ok, false);
  // a failing resources refresh falls back to the project as fetched
  t = fakeDeps();
  t.deps.refreshResources = async () => { throw new Error("nope"); };
  r = await loadProjectSubresources("p4", { id: "p4", marker: 1 }, t.deps);
  assert.equal(r.project.marker, 1);
});

test("a second open of the same project while one is loading shares it — no repeated read, no repeated migration — and a later open starts fresh", async () => {
  const { loadProjectSubresources } = await load(LOADER);
  const { deps, log, gate } = fakeDeps({ gated: true, quantity: [] });
  const a = loadProjectSubresources("p1", { id: "p1" }, deps);
  const b = loadProjectSubresources("p1", { id: "p1" }, deps);
  assert.equal(a, b, "the very same run");
  await tick();
  for (const n of ["quantity", "milestones", "invoices", "expenses"]) gate(`read:${n}`).resolve();
  await Promise.all([a, b]);
  assert.equal(log.filter((l) => l.startsWith("read:")).length, 5);
  assert.equal(log.filter((l) => l.startsWith("load:")).length, 4, "each loader — and so each migration — ran once");
  const second = fakeDeps({ quantity: [] });
  await loadProjectSubresources("p1", { id: "p1" }, second.deps);
  assert.equal(second.log.filter((l) => l.startsWith("load:")).length, 4, "after it finished, a new open is a new run");
  // different projects never share
  const other = fakeDeps({ gated: true });
  assert.notEqual(loadProjectSubresources("pA", { id: "pA" }, other.deps), loadProjectSubresources("pB", { id: "pB" }, other.deps));
});

// ───────────────────────── the real services, a stubbed API and a real mirror ─────────────────────────
function backendApi(apiClient, state, { gate = false, failGet = null, failPost = null } = {}) {
  const log = [];
  const waiting = [];
  let n = 0;
  const dto = (q) => ({ id: q.id, description: q.description, woQty: q.woQty, invoiceQty: 0, pendingQty: q.woQty, uom: "DAY", assignedTo: null, currency: "INR", unitRate: 100, exchangeRate: 1, unitRateINR: 100, woValue: q.woQty * 100, pendingAmount: 0 });
  const bodyFor = (route) =>
    route === "/quantity" ? { items: state.quantity.map(dto) }
    : route === "/milestones" ? { items: state.milestones }
    : route === "/invoice-items" ? { items: state.quantity.map((q) => ({ id: q.id, description: q.description, qty: q.woQty, uom: "DAY", unitPrice: 100, totalPrice: q.woQty * 100, invoices: state.lines.filter((l) => l.quantityItemId === q.id) })) }
    : route === "/expenses" ? { items: state.expenses, count: state.expenses.length, latestUpdatedAt: null }
    : route === "/resources" ? { items: [] }
    : {};
  const original = { get: apiClient.get, post: apiClient.post };
  apiClient.get = (path) => {
    const route = path.replace(/^\/projects\/p1/, "") || "/";
    log.push(`GET ${route}`);
    if (failGet && route === failGet) return Promise.reject(new Error(`GET ${route} failed`));
    return gate ? new Promise((resolve) => waiting.push(() => resolve(bodyFor(route)))) : Promise.resolve(bodyFor(route));
  };
  apiClient.post = (path, body) => {
    const route = path.replace(/^\/projects\/p1/, "");
    log.push(`POST ${route}`);
    if (failPost && route === failPost) return Promise.reject(new Error(`POST ${route} failed`));
    if (route === "/quantity") { const q = { id: `qn${++n}`, description: body.description, woQty: body.woQty }; state.quantity.push(q); return Promise.resolve(dto(q)); }
    if (route === "/milestones/ingest") { state.milestones = body.milestones.map((m) => ({ id: m.id, milestoneName: m.milestoneName, paymentPercentage: m.paymentPercentage, dueDate: m.dueDate, amount: 0 })); return Promise.resolve({ items: state.milestones }); }
    if (route === "/invoice-items/ingest") { for (const l of body.lines) state.lines.push({ ...l, milestoneId: l.milestoneId ?? null, milestoneName: null, setIndex: null, description: null, unitPriceINR: null, calculatedAmountINR: null, commercialAdjustmentINR: null, clientReference: null, remarks: null, createdBy: "x" }); return Promise.resolve({ items: state.lines }); }
    if (route === "/expenses") { const e = { id: `en${++n}`, ...body }; state.expenses.push(e); return Promise.resolve(e); }
    return Promise.resolve({});
  };
  return { log, release: () => waiting.splice(0).forEach((f) => f()), restore: () => Object.assign(apiClient, original) };
}

async function mirrorWith(over) {
  const { createEmptyProject } = await load("/src/utils/createEmptyProject.ts");
  const { saveProjects, normalizeProject } = await load("/src/services/projectService.ts");
  const project = normalizeProject({ ...createEmptyProject(), id: "p1", prNo: "PR-1", ...over });
  saveProjects([project]);
  return project;
}
const emptyState = () => ({ quantity: [], milestones: [], lines: [], expenses: [] });
const fetchedProject = { id: "p1", prNo: "PR-1", resources: [] };
const legacyQuantity = (id, extra = {}) => ({ id, description: "Legacy activity", woQty: 5, uom: "DAY", currency: "INR", unitRate: 100, exchangeRate: 1, unitRateINR: 100, woValue: 500, invoiceQty: 0, pendingQty: 5, ...extra });

test("real services, nothing to migrate: the five reads go out together, once each, no write is made, and the lists come back correct", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { loadProjectSubresources } = await load(LOADER);
  const state = { quantity: [{ id: "q1", description: "Eng", woQty: 10 }], milestones: [{ id: "m1", milestoneName: "Advance", paymentPercentage: 100, dueDate: null, amount: 1000 }], lines: [], expenses: [{ id: "e1", expenseType: "Travel", description: "t", amountINR: 5 }] };
  await mirrorWith({});
  const api = backendApi(apiClient, state, { gate: true });
  try {
    const pending = loadProjectSubresources("p1", fetchedProject);
    await tick();
    assert.deepEqual([...api.log].sort(), ["GET /expenses", "GET /invoice-items", "GET /milestones", "GET /quantity", "GET /resources"], "all five in flight before any answered");
    api.release();
    const r = await pending;
    assert.equal(api.log.length, 5, "no repeated read, and no POST (nothing was migrated)");
    assert.deepEqual([r.quantityItems.value.map((q) => q.id), r.paymentMilestones.value.map((m) => m.id), r.invoiceItems.value.map((i) => i.id), r.nonManhourExpenses.value.map((e) => e.id)], [["q1"], ["m1"], ["q1"], ["e1"]]);
  } finally {
    api.restore();
  }
});

test("real services, legacy data in the browser and an empty server: migration runs ONCE, Quantity first, Invoices read again afterwards; Milestones and Expenses migrate too; a repeat open migrates nothing", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { loadProjectSubresources } = await load(LOADER);
  const state = emptyState();
  await mirrorWith({
    quantityItems: [legacyQuantity("lq1")],
    paymentMilestones: [{ id: "lm1", milestoneName: "Advance", paymentPercentage: 100, dueDate: "", amount: 0 }],
    nonManhourExpenses: [{ id: "le1", expenseType: "Travel", description: "legacy", amountINR: 10 }],
  });
  const api = backendApi(apiClient, state);
  try {
    const first = loadProjectSubresources("p1", fetchedProject);
    const second = loadProjectSubresources("p1", fetchedProject);
    assert.equal(first, second, "a second open while this runs shares it");
    const r = await first;
    const count = (entry) => api.log.filter((l) => l === entry).length;
    assert.equal(count("POST /quantity"), 1, "one quantity row migrated, once");
    assert.equal(count("POST /milestones/ingest"), 1);
    assert.equal(count("POST /expenses"), 1);
    assert.ok(api.log.indexOf("POST /quantity") < api.log.indexOf("POST /milestones/ingest"), "Quantity migrates before Milestones, as it always did");
    assert.ok(api.log.lastIndexOf("GET /invoice-items") > api.log.indexOf("POST /quantity"), "the Invoice list was read AGAIN after Quantity migrated — the concurrent read predated it");
    assert.deepEqual([r.quantityItems.ok, r.paymentMilestones.ok, r.invoiceItems.ok, r.nonManhourExpenses.ok], [true, true, true, true]);
    assert.deepEqual(r.quantityItems.value.map((q) => q.id), ["qn1"], "the migrated row carries the server's new id");
    assert.deepEqual(r.invoiceItems.value.map((i) => i.id), ["qn1"], "Invoice Items follow the migrated Quantity");
    // opening it again: the server now has everything, so nothing migrates
    api.log.length = 0;
    await loadProjectSubresources("p1", fetchedProject);
    assert.equal(api.log.filter((l) => l.startsWith("POST")).length, 0, "migration never runs twice");
  } finally {
    api.restore();
  }
});

test("real services: legacy invoice history on a server that already has the Quantity is ingested exactly once, after the concurrent read, then re-read", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { loadProjectSubresources } = await load(LOADER);
  const state = { quantity: [{ id: "q1", description: "Eng", woQty: 10 }], milestones: [{ id: "m1", milestoneName: "Advance", paymentPercentage: 100, dueDate: null, amount: 1000 }], lines: [], expenses: [] };
  const legacyLine = { id: "L1", invoiceNo: "INV-1", invoiceDate: "2026-03-01", milestoneId: null, milestoneName: null, setIndex: null, description: null, quantityBilled: 1, invoiceAmountINR: 100, clientReference: null, remarks: null, status: "Raised", createdBy: "x" };
  await mirrorWith({ quantityItems: [legacyQuantity("q1", { description: "Eng", woQty: 10, woValue: 1000, pendingQty: 10 })], invoiceItems: [{ id: "q1", description: "Eng", qty: 10, uom: "DAY", unitPrice: 100, totalPrice: 1000, invoices: [legacyLine] }] });
  const api = backendApi(apiClient, state);
  try {
    const r = await loadProjectSubresources("p1", fetchedProject);
    assert.equal(api.log.filter((l) => l === "POST /invoice-items/ingest").length, 1, "ingested once");
    assert.equal(api.log.filter((l) => l === "GET /invoice-items").length, 2, "the concurrent read, then one re-read after the ingest — not a third");
    assert.ok(api.log.indexOf("POST /invoice-items/ingest") > api.log.indexOf("GET /invoice-items"));
    assert.equal(api.log.filter((l) => l === "POST /quantity").length, 0, "the Quantity the server already had is not migrated");
    assert.deepEqual(r.invoiceItems.value[0].invoices.map((l) => l.id), ["L1"], "the legacy history is now on the server and returned");
  } finally {
    api.restore();
  }
});

test("real services, failures: a failed read leaves the mirror's data for that list untouched and writes nothing; a failed migration is reported and the rest still load", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { loadProjectSubresources } = await load(LOADER);
  const { getProjectById } = await load("/src/services/projectService.ts");
  const state = { quantity: [{ id: "q1", description: "Eng", woQty: 10 }], milestones: [], lines: [], expenses: [] };
  await mirrorWith({ paymentMilestones: [{ id: "lm1", milestoneName: "Local only", paymentPercentage: 50, dueDate: "", amount: 0 }] });
  let api = backendApi(apiClient, state, { failGet: "/milestones" });
  try {
    const r = await loadProjectSubresources("p1", fetchedProject);
    assert.equal(r.paymentMilestones.ok, false);
    assert.deepEqual([r.quantityItems.ok, r.invoiceItems.ok, r.nonManhourExpenses.ok], [true, true, true]);
    assert.equal(api.log.filter((l) => l === "GET /milestones").length, 1, "one attempt");
    assert.equal(api.log.some((l) => l.startsWith("POST")), false, "a failed read triggers no migration and no write");
    assert.deepEqual(getProjectById("p1").paymentMilestones.map((m) => m.milestoneName), ["Local only"], "the mirror still holds the user's milestones");
  } finally {
    api.restore();
  }
  // migration failure: the legacy Quantity cannot be pushed
  store.clear();
  const state2 = emptyState();
  await mirrorWith({ quantityItems: [legacyQuantity("lq1")] });
  api = backendApi(apiClient, state2, { failPost: "/quantity" });
  try {
    const r = await loadProjectSubresources("p1", fetchedProject);
    assert.equal(r.quantityItems.ok, false);
    assert.match(String(r.quantityItems.error), /POST \/quantity failed/);
    assert.deepEqual([r.paymentMilestones.ok, r.invoiceItems.ok, r.nonManhourExpenses.ok], [true, true, true], "the other lists load regardless");
    assert.equal(api.log.filter((l) => l === "POST /quantity").length, 1, "tried once, not retried");
  } finally {
    api.restore();
  }
});

test("Edit Project applies each list only when it loaded, with the same save-blocking flags as before, in the original order", async () => {
  const { readFileSync } = await import("node:fs");
  const text = readFileSync(fileURLToPath(new URL("../src/pages/Projects/EditProject.tsx", import.meta.url)), "utf8");
  assert.match(text, /fetchProjectByIdFromApi\(id, \{ includeResources: false \}\)/, "the resources are read with the lists, not before them");
  assert.match(text, /await loadProjectSubresources\(id, fetched\)/);
  assert.match(text, /if \(loaded\.quantityItems\.ok\) \{[^]*?quantity: false/);
  assert.match(text, /if \(loaded\.paymentMilestones\.ok\) \{[^]*?milestones: false/);
  assert.match(text, /if \(loaded\.nonManhourExpenses\.ok\) \{[^]*?expenses: false[^]*?getLastKnownExpensesMeta\(id\)/);
  assert.doesNotMatch(text, /await loadQuantityForProject|await loadMilestonesForProject|await loadInvoiceForProject|await loadExpensesForProject/, "no sequential awaits of the loaders any more");
  const order = ["quantityItems: loaded", "paymentMilestones: loaded", "invoiceItems: loaded", "nonManhourExpenses: loaded"].map((k) => text.indexOf(k));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "applied in the original order: Quantity, Milestones, Invoices, Expenses");
});

test("fast path: when no list can migrate the lists are applied as read — no loader runs, no mirror work — and the starting milestone row and expenses baseline are kept; any possible migration switches EVERY list to the ordered path", async () => {
  const { loadProjectSubresources } = await load(LOADER);
  // server has data everywhere
  let t = fakeDeps();
  let r = await loadProjectSubresources("p1", { id: "p1" }, t.deps);
  assert.equal(t.log.some((l) => l.startsWith("load:")), false, "no loader ran");
  assert.deepEqual([r.quantityItems.value, r.paymentMilestones.value, r.invoiceItems.value.map((i) => i.id), r.nonManhourExpenses.value], [["q"], ["m"], ["i"], ["e"]]);
  assert.equal(t.log.filter((l) => l === "baseline").length, 1, "the expenses concurrency baseline is still recorded");
  // brand-new project: empty server, nothing local to push — the local starting milestone row is what the loader returned, so it still is
  t = fakeDeps({ quantity: [], milestones: [], invoices: [], local: { quantityItems: [], paymentMilestones: [{ id: "filler", milestoneName: "", paymentPercentage: 0 }] } });
  r = await loadProjectSubresources("p2", { id: "p2" }, t.deps);
  assert.equal(t.log.some((l) => l.startsWith("load:")), false);
  assert.deepEqual([r.quantityItems.value, r.paymentMilestones.value.map((m) => m.id), r.invoiceItems.value], [[], ["filler"], []]);
  // legacy invoice history in the mirror with nothing on the server -> the ordered path for ALL lists
  t = fakeDeps({ invoices: [{ invoices: [] }], local: { quantityItems: [{ id: "q" }], paymentMilestones: [], invoiceItems: [{ id: "q", invoices: [{ id: "L1" }] }] } });
  await loadProjectSubresources("p3", { id: "p3" }, t.deps);
  assert.deepEqual(t.log.filter((l) => l.startsWith("load:")).map((l) => l.split(":")[1]), ["quantity", "milestones", "invoices", "expenses"], "one list may migrate -> every list takes the ordered path, in order");
  // legacy expenses only
  t = fakeDeps({ local: { quantityItems: [], paymentMilestones: [], nonManhourExpenses: [{ id: "le" }] } });
  t.deps.readExpenses = async () => ({ items: [], count: 0, latestUpdatedAt: null });
  await loadProjectSubresources("p4", { id: "p4" }, t.deps);
  assert.equal(t.log.filter((l) => l.startsWith("load:")).length, 4);
  // a failed read is still a failure on the fast path, and nothing else is disturbed
  t = fakeDeps({ failRead: "invoices" });
  r = await loadProjectSubresources("p5", { id: "p5" }, t.deps);
  assert.deepEqual([r.invoiceItems.ok, r.quantityItems.ok, r.paymentMilestones.ok, r.nonManhourExpenses.ok], [false, true, true, true]);
});

test("real services, fast path: opening a project that needs no migration writes NOTHING to the local mirror during the load, makes five reads, and still records the expenses baseline", async () => {
  const { apiClient } = await load("/src/services/apiClient.ts");
  const { loadProjectSubresources } = await load(LOADER);
  const { getLastKnownExpensesMeta } = await load("/src/services/otherProjectExpenseService.ts");
  const state = { quantity: [{ id: "q1", description: "Eng", woQty: 10 }], milestones: [{ id: "m1", milestoneName: "Advance", paymentPercentage: 100, dueDate: null, amount: 1000 }], lines: [], expenses: [{ id: "e1", expenseType: "Travel", description: "t", amountINR: 5 }] };
  await mirrorWith({});
  const before = store.get("projects");
  const api = backendApi(apiClient, state);
  try {
    const r = await loadProjectSubresources("p1", fetchedProject);
    assert.equal(api.log.length, 5);
    assert.equal(store.get("projects"), before, "the mirror was not rewritten by the load (Edit Project's own final write-through does that once)");
    assert.deepEqual([r.quantityItems.value[0].id, r.paymentMilestones.value[0].id, r.nonManhourExpenses.value[0].id], ["q1", "m1", "e1"]);
    assert.deepEqual(getLastKnownExpensesMeta("p1"), { count: 1, latestUpdatedAt: null });
  } finally {
    api.restore();
  }
});
