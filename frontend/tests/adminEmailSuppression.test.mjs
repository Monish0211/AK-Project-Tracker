// Administrative Controls - "Raise invoice without sending email" and Review navigation (Nov 2026 fixes).
// Pins: the switch is consumed only by a save that actually RAISED an invoice (never by a draft edit or a failed save), the flag travels only
// on raising writes, both invoice screens share ONE implementation, Invoice Tracker deletes follow the same D3 rules, the new history entry
// reads clearly, and an administrator's Review from the normal queue opens the administrative review instead of an access error.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
let React;
let renderToStaticMarkup;
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
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});
after(() => vite?.close());

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
const ACTIONS = "/src/pages/Projects/components/Invoice/invoiceLineActions.ts";
const SERVICE = "/src/services/invoiceService.ts";

const line = (id, invoiceNo, status, extra = {}) => ({ id, invoiceNo, invoiceDate: "2026-11-01", quantityBilled: 1, invoiceAmountINR: 1000, status, createdBy: "x", ...extra });
const item = (id, invoices) => ({ id, description: id, qty: 1, uom: "DAY", unitPrice: 1, totalPrice: 1, invoices });
const proj = (items) => ({ id: "p1", prNo: "PR-1", invoiceCurrency: "INR", invoiceItems: items });

function harness({ fail = null } = {}) {
  const log = { raised: [], sync: [], synced: 0, toasts: [] };
  const deps = {
    updateProject: () => undefined,
    syncInvoiceLinesWithApi: async (...a) => {
      log.sync.push(a);
      if (fail) throw fail;
      return a[2];
    },
    fetchInvoiceItemsFromApi: async () => [],
    fetchProjectInvoiceCurrency: async () => "INR",
    showToast: (t) => log.toasts.push(t),
    now: () => "NOW",
  };
  const syncing = { current: false };
  const args = (project, updatedProject) => ({ project, updatedProject, setProject: () => undefined, syncing, onSynced: () => log.synced++, onRaised: (n) => log.raised.push(n), deps });
  const settle = async () => {
    for (let i = 0; i < 50 && syncing.current; i++) await new Promise((r) => setImmediate(r));
  };
  return { log, args, settle };
}

test("countRaisingLines counts exactly the lines a save raises", async () => {
  const { countRaisingLines } = await load(ACTIONS);
  const before = [item("q1", [line("a", "INV-1", "Draft"), line("b", "INV-2", "Raised")])];
  assert.equal(countRaisingLines(before, [item("q1", [line("a", "INV-1", "Draft", { remarks: "edited" }), line("b", "INV-2", "Raised")])]), 0, "a draft edit raises nothing");
  assert.equal(countRaisingLines(before, [item("q1", [line("a", "INV-1", "Raised"), line("b", "INV-2", "Raised")])]), 1, "Draft -> Raised");
  assert.equal(countRaisingLines(before, [item("q1", [line("a", "INV-1", "Cancelled"), line("b", "INV-2", "PartiallyPaid")])]), 0, "Draft -> Cancelled and a payment move are not raises");
  assert.equal(countRaisingLines(before, [item("q1", [line("a", "INV-1", "Draft"), line("b", "INV-2", "Raised"), line("n1", "INV-3", "Raised"), line("n2", "INV-3", "Raised"), line("n3", "INV-4", "Draft")])]), 2, "new raised lines count; a new draft does not");
});

test("the switch is consumed only after a successful save that raised: draft edits and failed saves leave it on", async () => {
  const { persistInvoiceProjectChange } = await load(ACTIONS);
  const p = proj([item("q1", [line("a", "INV-1", "Draft"), line("c", "INV-5", "Draft")])]);

  const edit = harness();
  persistInvoiceProjectChange(edit.args(p, { ...proj([item("q1", [line("a", "INV-1", "Draft", { remarks: "x" }), line("c", "INV-5", "Draft")])]), invoiceSuppressEmail: true }));
  await edit.settle();
  assert.deepEqual(edit.log.raised, [], "an ordinary draft edit does not consume it");
  assert.equal(edit.log.synced, 1);

  const raise = harness();
  // A first raise of an INR invoice must carry its GST choice (existing rule) - here "No GST" for both invoices.
  const noGst = { "INV-1": { applicable: false }, "INV-5": { applicable: false } };
  persistInvoiceProjectChange(raise.args(p, { ...proj([item("q1", [line("a", "INV-1", "Raised"), line("c", "INV-5", "Raised")])]), invoiceSuppressEmail: true, invoiceGstSelections: noGst }));
  await raise.settle();
  assert.equal(raise.log.sync.length, 1, "the raise reached the server");
  assert.deepEqual(raise.log.raised, [2], "a save that raised two lines reports 2 - then the switch is consumed");
  assert.equal(raise.log.sync[0][4], true, "the flag reaches the sync (5th argument)");
  assert.ok(!("invoiceSuppressEmail" in raise.log.sync[0][2]), "the transient flag never reaches state");

  const { ApiError } = await load("/src/services/apiClient.ts");
  for (const failure of [new Error("network down"), new ApiError("refused", 409)]) {
    const failed = harness({ fail: failure });
    persistInvoiceProjectChange(failed.args(p, { ...proj([item("q1", [line("a", "INV-1", "Raised"), line("c", "INV-5", "Draft")])]), invoiceSuppressEmail: true, invoiceGstSelections: noGst }));
    assert.equal(failed.log.sync.length, 1, "the save really reached the server and failed there");
    await failed.settle();
    assert.deepEqual(failed.log.raised, [], `a failed save (${failure.message}) does not consume it`);
  }
});

function stubFetch() {
  const calls = [];
  const original = globalThis.fetch;
  const store = new Map();
  const hadStorage = "localStorage" in globalThis;
  const hadWindow = "window" in globalThis;
  if (!hadWindow) globalThis.window = { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
  if (!hadStorage) globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, String(v)), removeItem: (k) => void store.delete(k) };
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    return { ok: true, status: 200, json: async () => ({ success: true, data: call.method === "GET" ? { items: [] } : {} }) };
  };
  return { calls, restore: () => { globalThis.fetch = original; if (!hadStorage) delete globalThis.localStorage; if (!hadWindow) delete globalThis.window; } };
}

test("the flag travels only on writes that raise an invoice, and never when the switch is off", async () => {
  const { syncInvoiceLinesWithApi } = await load(SERVICE);
  const prev = [item("q1", [line("d1", "INV-1", "Draft"), line("r1", "INV-2", "Raised")])];
  const next = [item("q1", [line("d1", "INV-1", "Raised"), line("r1", "INV-2", "Raised", { remarks: "content edit" }), line("new-raised", "INV-3", "Raised"), line("new-draft", "INV-4", "Draft")])];
  const stub = stubFetch();
  try {
    await syncInvoiceLinesWithApi("p1", prev, next, undefined, true);
    const writes = stub.calls.filter((c) => c.method !== "GET");
    const flagged = (pred) => writes.filter(pred).map((c) => c.body.suppressEmail === true);
    assert.deepEqual(flagged((c) => c.method === "PATCH" && c.url.endsWith("/invoice-lines/d1")), [true], "Draft -> Raised carries it");
    assert.deepEqual(flagged((c) => c.method === "PATCH" && c.url.endsWith("/invoice-lines/r1")), [false], "a content edit of a raised line does not");
    assert.deepEqual(writes.filter((c) => c.method === "POST").map((c) => [c.body.invoiceNo, c.body.suppressEmail === true]), [["INV-3", true], ["INV-4", false]], "a new Raised line carries it, a new Draft does not");
    stub.calls.length = 0;
    await syncInvoiceLinesWithApi("p1", prev, next, undefined, false);
    assert.ok(stub.calls.every((c) => c.body === undefined || c.body.suppressEmail === undefined), "switch off: no write carries the flag");
  } finally {
    stub.restore();
  }
});

test("ONE switch implementation, used by both Edit Project -> Invoices and Invoice Tracker, and shown in the shared drawer", async () => {
  const shared = src("pages/Projects/components/Invoice/useRaiseWithoutEmail.ts");
  assert.match(shared, /holds\(INVOICE_ADMINISTRATION\)/, "only Invoice Administration holders");
  const dash = src("pages/Projects/components/Invoice/InvoiceDashboard.tsx");
  const tracker = src("pages/InvoiceTracker/InvoiceTracker.tsx");
  const host = src("pages/InvoiceTracker/InvoiceActionHost.tsx");
  for (const [name, file] of [["dashboard", dash], ["tracker", tracker]]) {
    assert.match(file, /useRaiseWithoutEmail\(\)/, `${name} uses the shared hook`);
    assert.match(file, /<RaiseWithoutEmailSwitch state=\{raiseWithoutEmail\}/, `${name} renders the shared switch`);
  }
  assert.match(dash, /suppressEmail: raiseWithoutEmail\.active,\s*onSuppressedRaise: raiseWithoutEmail\.consume/);
  assert.doesNotMatch(dash, /setRaiseWithoutEmail\(false\)/, "no longer switched off by every save");
  assert.match(host, /suppressEmail: raiseWithoutEmail\?\.active \?\? false,\s*onSuppressedRaise: raiseWithoutEmail\?\.consume/, "Tracker saves go through the same option");
  assert.match(src("pages/Projects/components/Invoice/InvoiceActionDrawer.tsx"), /<RaiseWithoutEmailNotice active=\{actions\.suppressEmail\} \/>/);
});

test("the switch renders nothing for non-holders and explains itself when on", async () => {
  // The auth module reads browser storage on import - same in-memory stand-in the other UI tests use.
  if (!("localStorage" in globalThis)) {
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, String(v)), removeItem: (k) => void store.delete(k) };
  }
  if (!("window" in globalThis)) globalThis.window = { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {}, location: { href: "" } };
  const { RaiseWithoutEmailSwitch } = await load("/src/pages/Projects/components/Invoice/RaiseWithoutEmail.tsx");
  const state = (over) => ({ available: true, active: false, enabled: false, setEnabled() {}, consume() {}, ...over });
  assert.equal(renderToStaticMarkup(React.createElement(RaiseWithoutEmailSwitch, { state: state({ available: false }) })), "");
  const off = renderToStaticMarkup(React.createElement(RaiseWithoutEmailSwitch, { state: state() }));
  assert.match(off, /Raise invoice without sending email/);
  const on = renderToStaticMarkup(React.createElement(RaiseWithoutEmailSwitch, { state: state({ enabled: true, active: true }), draftInvoiceCount: 3 }));
  assert.match(on, /applies to every invoice raised in your next save/);
  assert.match(on, /Saves that raise nothing keep it on/);
  assert.match(on, /Draft invoices that could be raised here: 3/);
});

test("Invoice Tracker delete follows D3: Draft as before; raised needs Invoice Administration + reason; paid never", () => {
  const host = src("pages/InvoiceTracker/InvoiceActionHost.tsx");
  assert.match(host, /const mayAdminDelete = !isDraft && !isPaid && \(raiseWithoutEmail\?\.available \?\? false\);/);
  assert.match(host, /actions\.adminDeleteRaisedInvoiceLine\(line, deleteReason\.trim\(\)\)/);
  assert.match(host, /confirmDisabled=\{mayAdminDelete && deleteReason\.trim\(\)\.length < 5\}/);
  assert.match(host, /A paid or partly paid invoice is never deleted/);
});

test("the new history entry reads clearly in the Tracker timeline", async () => {
  const { describeEvent } = await load("/src/pages/InvoiceTracker/trackerFormat.ts");
  assert.match(describeEvent({ eventType: "EMAIL_SUPPRESSED", fromStatus: "Raised", toStatus: "Raised", lineCount: 1 }), /without sending email — automatic email not sent/);
  assert.equal(describeEvent({ eventType: "STATUS_CHANGED", fromStatus: "Draft", toStatus: "Raised", lineCount: 1 }).includes("email"), false, "ordinary entries unchanged");
});

test("Review from the normal Approvals queue: holders who are not the assigned approver go to the administrative review; everyone else unchanged", () => {
  const queue = src("pages/PRRequests/PRRequests.tsx");
  assert.match(queue, /tab === "queue" && !assignedToMe && holds\(PR_APPROVAL_ADMINISTRATION\) \? `\/admin\/pr-requests\/\$\{row\.id\}\/review` : `\/pr-requests\/\$\{row\.id\}\/edit`/);
  assert.match(queue, /onClick=\{\(\) => navigate\(reviewPath\)\}/);
  const loader = src("pages/PRRequests/RequestPR.tsx");
  assert.match(loader, /navigate\(`\/admin\/pr-requests\/\$\{id\}\/review`, \{ replace: true \}\)/, "direct link / refresh: same request, administrative review");
  assert.match(loader, /You do not have access to edit this PR Request\./, "non-holders keep the existing message");
  const layout = src("layouts/MainLayout.tsx");
  assert.match(layout, /path="\/admin\/pr-requests\/:id\/review"\s*element=\{<AdminRightRoute right=\{PR_APPROVAL_ADMINISTRATION\}><RequestPR admin \/><\/AdminRightRoute>\}/, "the route itself stays guarded");
});
