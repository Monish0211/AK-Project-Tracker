// Invoice View / Edit / Delete / status logic shared by Edit Project → Invoices and Invoice Tracker (Oct 2026).
// These tests pin the behaviour that moved out of InvoiceDashboard.tsx unchanged: the pure project transforms and the
// save-to-server path (optimistic write, overlap guard, server reconcile, rejection reload, failure messages).
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
    // Same inert stub as reportsLiveData.test.mjs: the notification engine mounts on import.
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

const line = (id, invoiceNo, status = "Raised", extra = {}) => ({ id, invoiceNo, invoiceDate: "2026-03-01", quantityBilled: 1, invoiceAmountINR: 1000, status, createdBy: "x", ...extra });
const project = () => ({
  id: "p1", prNo: "PR-1", invoiceCurrency: "INR",
  invoiceItems: [
    { id: "q1", description: "A", qty: 1, uom: "DAY", unitPrice: 1, totalPrice: 1, invoices: [line("l1", "INV-1"), line("l2", "INV-2", "Draft")] },
    { id: "q2", description: "B", qty: 1, uom: "DAY", unitPrice: 1, totalPrice: 1, invoices: [line("l3", "INV-1", "Raised"), line("l4", "INV-3", "Paid")] },
  ],
});
const ACTIONS = "/src/pages/Projects/components/Invoice/invoiceLineActions.ts";

test("removeInvoiceLine removes only that line of that activity and leaves the rest (and the original) untouched", async () => {
  const { removeInvoiceLine } = await load(ACTIONS);
  const p = project();
  const next = removeInvoiceLine(p, p.invoiceItems[0], p.invoiceItems[0].invoices[0]);
  assert.deepEqual(next.invoiceItems[0].invoices.map((l) => l.id), ["l2"]);
  assert.deepEqual(next.invoiceItems[1].invoices.map((l) => l.id), ["l3", "l4"], "another activity's lines — even with the same invoice number — are not touched");
  assert.equal(next.prNo, "PR-1");
  assert.equal(p.invoiceItems[0].invoices.length, 2, "the input is not mutated");
});

test("setInvoiceCycleStatus changes every line of that invoice number across activities and reports the previous status", async () => {
  const { setInvoiceCycleStatus } = await load(ACTIONS);
  const p = project();
  const { updatedProject, oldStatus } = setInvoiceCycleStatus(p, "INV-1", "Paid");
  assert.deepEqual(updatedProject.invoiceItems.flatMap((i) => i.invoices).map((l) => [l.id, l.status]), [["l1", "Paid"], ["l2", "Draft"], ["l3", "Paid"], ["l4", "Paid"]]);
  assert.equal(oldStatus, "Raised");
  assert.equal(p.invoiceItems[0].invoices[0].status, "Raised", "the input is not mutated");
  assert.equal(setInvoiceCycleStatus(p, "NOPE", "Paid").oldStatus, "Draft", "an unknown invoice number leaves the default");
});

test("resolveActiveDrawer re-resolves against the live project, and falls back to the clicked snapshot when the line is gone", async () => {
  const { resolveActiveDrawer, removeInvoiceLine } = await load(ACTIONS);
  const p = project();
  assert.equal(resolveActiveDrawer(p, null), null);
  const clicked = { item: p.invoiceItems[0], mode: "edit", existingLine: p.invoiceItems[0].invoices[0] };
  const edited = { ...p, invoiceItems: p.invoiceItems.map((i) => (i.id === "q1" ? { ...i, invoices: [line("l1", "INV-1", "Paid"), i.invoices[1]] } : i)) };
  assert.equal(resolveActiveDrawer(edited, clicked).existingLine.status, "Paid", "shows the live line, not the stale click-time copy");
  const gone = removeInvoiceLine(p, p.invoiceItems[0], p.invoiceItems[0].invoices[0]);
  assert.equal(resolveActiveDrawer(gone, clicked).existingLine.id, "l1", "falls back to the snapshot");
  assert.equal(resolveActiveDrawer(p, { item: p.invoiceItems[0], mode: "view" }).existingLine, undefined);
});

function harness(overrides = {}) {
  const log = { setProject: [], updateProject: [], toasts: [], sync: [], currencyReads: 0, reloads: 0, synced: 0 };
  const deps = {
    updateProject: (p) => log.updateProject.push(p),
    syncInvoiceLinesWithApi: async (id, prev, next) => (log.sync.push([id, prev, next]), overrides.sync ? overrides.sync(id, prev, next) : next.map((i) => ({ ...i, reconciled: true }))),
    fetchInvoiceItemsFromApi: async () => (log.reloads++, [{ id: "server", invoices: [] }]),
    fetchProjectInvoiceCurrency: async () => (log.currencyReads++, overrides.currency ? overrides.currency() : "USD"),
    showToast: (t) => log.toasts.push(t),
    now: () => "NOW",
  };
  const syncing = { current: false };
  const args = (project, updatedProject, extra = {}) => ({ project, updatedProject, setProject: (p) => log.setProject.push(p), syncing, onSynced: () => log.synced++, deps, ...extra });
  const settle = async () => { for (let i = 0; i < 50 && syncing.current; i++) await new Promise((r) => setImmediate(r)); };
  return { log, syncing, args, settle };
}

test("persist: optimistic write first, then the server's answer replaces it (items and currency lock), and the guard is released", async () => {
  const { persistInvoiceProjectChange } = await load(ACTIONS);
  const h = harness();
  const p = project();
  const updated = { ...p, invoiceItems: [{ ...p.invoiceItems[0], invoices: [line("l1", "INV-1", "Paid")] }] };
  assert.equal(persistInvoiceProjectChange(h.args(p, updated)), true);
  assert.equal(h.syncing.current, true, "guard is held while the save runs");
  assert.deepEqual([h.log.setProject.length, h.log.updateProject.length], [1, 1], "optimistic write happens synchronously");
  assert.equal(h.log.updateProject[0].updatedAt, "NOW");
  await h.settle();
  assert.deepEqual(h.log.sync[0].slice(0, 1), ["p1"]);
  assert.equal(h.log.sync[0][1], p.invoiceItems, "diffs the previous items…");
  assert.equal(h.log.sync[0][2], updated.invoiceItems, "…against the updated ones");
  assert.equal(h.log.setProject.length, 2);
  assert.equal(h.log.setProject[1].invoiceItems[0].reconciled, true, "server-reconciled items replace the optimistic guess");
  assert.equal(h.log.setProject[1].invoiceCurrency, "USD", "the server's current currency lock");
  assert.equal(h.log.updateProject.length, 2);
  assert.equal(h.log.synced, 1);
  assert.deepEqual(h.log.toasts, []);
  assert.equal(h.syncing.current, false);
});

test("persist: a second change while one is still saving is refused with a message and does nothing", async () => {
  const { persistInvoiceProjectChange } = await load(ACTIONS);
  const h = harness();
  const p = project();
  assert.equal(persistInvoiceProjectChange(h.args(p, { ...p })), true);
  assert.equal(persistInvoiceProjectChange(h.args(p, { ...p })), false);
  assert.equal(h.log.toasts.length, 1);
  assert.deepEqual([h.log.toasts[0].type, h.log.toasts[0].title], ["error", "Previous invoice change still saving"]);
  assert.match(h.log.toasts[0].message, /wait a moment/);
  assert.equal(h.log.sync.length, 1, "only the first save reached the server");
  assert.equal(h.log.setProject.length, 1, "and the second left no optimistic write");
  await h.settle();
  assert.equal(persistInvoiceProjectChange(h.args(p, { ...p })), true, "allowed again once the first finished");
  await h.settle();
});

test("persist: onStart fires exactly once per ACCEPTED save (never for a refused second one), before the server round trip; a delete goes through the same guard", async () => {
  const { persistInvoiceProjectChange, removeInvoiceLine } = await load(ACTIONS);
  const h = harness();
  const p = project();
  let started = 0;
  const args = (updated) => h.args(p, updated, { onStart: () => { started++; assert.equal(h.log.sync.length, 0, "announced before anything reaches the server"); } });
  const afterDelete = removeInvoiceLine(p, p.invoiceItems[0], p.invoiceItems[0].invoices[0]);
  assert.equal(persistInvoiceProjectChange(args(afterDelete)), true, "the delete is accepted");
  assert.equal(started, 1);
  assert.equal(persistInvoiceProjectChange(args(afterDelete)), false, "a repeated Delete while the first is saving is refused");
  assert.equal(persistInvoiceProjectChange(args({ ...p })), false, "so is an Edit");
  assert.equal(started, 1, "refused saves are not announced");
  assert.equal(h.log.sync.length, 1, "exactly one mutation reached the server");
  await h.settle();
  assert.equal(started, 1);
});

test("persist: a rejected change (4xx) shows the server's message, reloads the server's invoices, and releases the guard", async () => {
  const { persistInvoiceProjectChange } = await load(ACTIONS);
  const { ApiError } = await load("/src/services/apiClient.ts");
  const h = harness({ sync: () => Promise.reject(new ApiError(409, "Invoice amount exceeds the activity's value.")), currency: () => "INR" });
  const errors = console.error;
  console.error = () => {};
  try {
    const p = project();
    persistInvoiceProjectChange(h.args(p, { ...p }));
    await h.settle();
  } finally {
    console.error = errors;
  }
  assert.deepEqual(h.log.toasts.map((t) => [t.title, t.message, t.duration]), [["Invoice change was rejected", "Invoice amount exceeds the activity's value.", 0]]);
  assert.equal(h.log.reloads, 1);
  assert.equal(h.log.setProject.at(-1).invoiceItems[0].id, "server", "the screen shows what the server actually has");
  assert.equal(h.log.synced, 0, "not treated as synced");
  assert.equal(h.syncing.current, false);
});

test("persist: a server or network failure keeps the local change, says it is not saved, and does not reload", async () => {
  const { persistInvoiceProjectChange } = await load(ACTIONS);
  const { ApiError } = await load("/src/services/apiClient.ts");
  for (const failure of [new ApiError(500, "boom"), new ApiError(0, "Network error."), new Error("offline")]) {
    const h = harness({ sync: () => Promise.reject(failure) });
    const errors = console.error;
    console.error = () => {};
    try {
      const p = project();
      persistInvoiceProjectChange(h.args(p, { ...p }));
      await h.settle();
    } finally {
      console.error = errors;
    }
    assert.deepEqual(h.log.toasts.map((t) => [t.title, t.duration]), [["Invoice change not saved to the server", 0]], String(failure));
    assert.match(h.log.toasts[0].message, /showing locally/);
    assert.equal(h.log.reloads, 0);
    assert.equal(h.log.setProject.length, 1, "the optimistic state stands");
    assert.equal(h.syncing.current, false);
  }
});

test("persist: an unreadable currency lock falls back to the value already known; a read-only context (no setProject) still works", async () => {
  const { persistInvoiceProjectChange } = await load(ACTIONS);
  const failing = harness({ currency: () => Promise.reject(new Error("transient")) });
  const p = { ...project(), invoiceCurrency: "OMR" };
  persistInvoiceProjectChange(failing.args(p, { ...p }));
  await failing.settle();
  assert.equal(failing.log.setProject.at(-1).invoiceCurrency, "OMR");
  const undef = harness({ currency: () => undefined });
  persistInvoiceProjectChange(undef.args(p, { ...p }));
  await undef.settle();
  assert.equal(undef.log.setProject.at(-1).invoiceCurrency, "OMR", "undefined from an older backend never invents a lock");
  const bare = harness();
  assert.equal(persistInvoiceProjectChange(bare.args(p, { ...p }, { setProject: undefined })), true);
  await bare.settle();
  assert.equal(bare.log.updateProject.length, 2);
});

test("Edit Project → Invoices still gates Edit and Delete on the same rights, through the shared hook (no second implementation)", () => {
  const dash = readFileSync(fileURLToPath(new URL("../src/pages/Projects/components/Invoice/InvoiceDashboard.tsx", import.meta.url)), "utf8");
  assert.match(dash, /useInvoiceLineActions\(\{ project, setProject, readOnly, onSynced:/);
  assert.match(dash, /onEdit=\{isReadOnly \|\| !canEditInvoice \? undefined : handleEditInvoiceLine\}/);
  assert.match(dash, /onDelete=\{isReadOnly \|\| !canDeleteInvoice \? undefined : handleDeleteInvoiceLine\}/);
  assert.match(dash, /onView=\{handleViewInvoiceLine\}/);
  assert.doesNotMatch(dash, /syncInvoiceLinesWithApi|updateProject\(/, "the save path lives only in invoiceLineActions.ts now");
  const hook = readFileSync(fileURLToPath(new URL("../src/pages/Projects/components/Invoice/useInvoiceLineActions.ts", import.meta.url)), "utf8");
  assert.match(hook, /hasApprovalPermission\(user, "Edit Invoice"\)/);
  assert.match(hook, /hasApprovalPermission\(user, "Delete Invoice"\)/);
});
