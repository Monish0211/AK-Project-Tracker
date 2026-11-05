// Invoice-level GST snapshot (Nov 2026) — the browser side. GST is entered ON THE INVOICE, independent of the project's Quantity-section
// GST switch and rate. Pins: the shared snapshot-aware GST function the four workspaces use (frozen rate / tax type, edited base, the
// distinct states), the rules for CHOOSING "No GST" or a rate and tax type (nothing assumed or prefilled), the central guard
// and hand-off in the one save path, what the service sends to the server, and the read-only GST panel in the Record Payment popup.
// The calculation and settlement themselves are the BACKEND's job and are tested there (invoiceGst.*.test.ts).
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

const DIR = "/src/pages/Projects/components/Invoice";
const CALC = `${DIR}/InvoiceCalculations.ts`;
const GST = `${DIR}/invoiceGst.ts`;
const ACTIONS = `${DIR}/invoiceLineActions.ts`;
const SERVICE = "/src/services/invoiceService.ts";
const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const snapshot = (over = {}) => ({
  gstStatus: "APPLICABLE", ratePercent: "18", taxType: "IGST", buyerStateKnown: true, currency: "INR",
  taxableAmount: "90000.00", cgstAmount: "0.00", sgstAmount: "0.00", igstAmount: "16200.00", gstAmount: "16200.00", totalAmount: "106200.00", ...over,
});
const line = (id, invoiceNo, status, amount = 90000, extra = {}) => ({ id, invoiceNo, invoiceDate: "2026-11-01", quantityBilled: 1, invoiceAmountINR: amount, status, createdBy: "x", ...extra });
const projectWith = (invoices, extra = {}) => ({
  id: "p1", prNo: "PR-1", gstApplicable: true, gstRate: 18, currency: "INR", invoiceCurrency: "INR",
  invoiceItems: [{ id: "q1", description: "A", qty: 1, uom: "DAY", unitPrice: 1, totalPrice: 1, invoices }],
  ...extra,
});

// ── the shared function: getGstBreakdown ────────────────────────────────────────────────────────

test("a saved snapshot is FROZEN: its rate and tax type win over the project's current GST switch and rate; only the edited amount moves", async () => {
  const { getGstBreakdown } = await load(CALC);
  const p = projectWith([line("l1", "INV-1", "Raised", 90000, { gstSnapshot: snapshot() })], { gstApplicable: false, gstRate: 5 });
  const same = getGstBreakdown(p, 90000, "INR", "INV-1");
  assert.deepEqual([same.source, same.isApplicable, same.taxType, same.ratePercent, same.gstAmount, same.grandTotal], ["snapshot", true, "IGST", 18, 16200, 106200]);
  const edited = getGstBreakdown(p, 95000, "INR", "INV-1");
  assert.deepEqual([edited.ratePercent, edited.gstAmount, edited.grandTotal], [18, 17100, 112100], "the frozen rate is applied to the edited base");
  assert.equal(getGstBreakdown(p, 90000, "INR", "inv-1 ").gstAmount, 16200, "invoice numbers compare ignoring case and outer spaces");
});

test("distinct states: no snapshot (legacy / draft), NOT_APPLICABLE, and APPLICABLE at 0%", async () => {
  const { getGstBreakdown } = await load(CALC);
  const legacy = projectWith([line("l1", "INV-1", "Raised")]);
  const noGst = projectWith([line("l1", "INV-1", "Raised", 90000, { gstSnapshot: snapshot({ gstStatus: "NOT_APPLICABLE", ratePercent: null, taxType: null, buyerStateKnown: false, igstAmount: "0.00", gstAmount: "0.00", totalAmount: "90000.00" }) })]);
  const zero = projectWith([line("l1", "INV-1", "Raised", 90000, { gstSnapshot: snapshot({ ratePercent: "0", igstAmount: "0.00", gstAmount: "0.00", totalAmount: "90000.00" }) })]);
  const a = getGstBreakdown(legacy, 90000, "INR", "INV-1");
  const b = getGstBreakdown(noGst, 90000, "INR", "INV-1");
  const c = getGstBreakdown(zero, 90000, "INR", "INV-1");
  assert.deepEqual([a.source, a.isApplicable], ["none", false], "no snapshot and no choice: no GST is shown - the project's Quantity-section GST is not used");
  assert.deepEqual([b.source, b.isApplicable, b.taxType, b.gstAmount], ["snapshot", false, null, 0], "a NOT_APPLICABLE snapshot stays not applicable even though the project switch is on");
  assert.deepEqual([c.source, c.isApplicable, c.taxType, c.ratePercent, c.gstAmount, c.grandTotal], ["snapshot", true, "IGST", 0, 0, 90000], "0% is a real, applicable rate");
});

test("a chosen rate and tax type drive the figures when the invoice has no snapshot yet; variable rates, IGST and CGST + SGST", async () => {
  const { getGstBreakdown } = await load(CALC);
  const p = projectWith([line("l1", "INV-1", "Draft")]);
  for (const [rate, gst] of [[0, 0], [5, 4500], [12, 10800], [18, 16200], [28, 25200], [12.5, 11250]]) {
    const g = getGstBreakdown(p, 90000, "INR", "INV-1", { applicable: true, ratePercent: rate, taxType: "IGST", buyerStateKnown: true });
    assert.deepEqual([g.source, g.gstAmount, g.igst], ["selection", gst, gst], `rate ${rate}`);
  }
  const split = getGstBreakdown(p, 90000, "INR", "INV-1", { applicable: true, ratePercent: 18, taxType: "CGST_SGST", buyerStateKnown: false });
  assert.deepEqual([split.cgst, split.sgst, split.igst, split.gstAmount, split.grandTotal, split.taxType], [8100, 8100, 0, 16200, 106200, "CGST_SGST"]);
  assert.equal(getGstBreakdown(p, 90000, "INR", "INV-1", { applicable: true, ratePercent: 5, taxType: "IGST", buyerStateKnown: true }).ratePercent, 5, "the project's own 18% is never used or forced");
  const none = getGstBreakdown(p, 90000, "INR", "INV-1", { applicable: false });
  assert.deepEqual([none.source, none.isApplicable, none.gstAmount, none.grandTotal], ["selection", false, 0, 90000], "an explicit 'No GST'");
});

test("invoice GST is independent of the project's Quantity-section GST: the switch and rate neither enable nor change it", async () => {
  const { getGstBreakdown } = await load(CALC);
  const choice = { applicable: true, ratePercent: 12, taxType: "IGST", buyerStateKnown: false };
  const off = projectWith([line("l1", "I", "Draft")], { gstApplicable: false, gstRate: 0 });
  const on = projectWith([line("l1", "I", "Draft")], { gstApplicable: true, gstRate: 18 });
  for (const p of [off, on]) {
    const g = getGstBreakdown(p, 10000, "INR", "I", choice);
    assert.deepEqual([g.isApplicable, g.ratePercent, g.gstAmount], [true, 12, 1200], "the chosen 12% applies whatever the project says");
    assert.equal(getGstBreakdown(p, 10000, "INR", "I").isApplicable, false, "with nothing chosen there is no GST even when the project switch is on");
  }
});

test("GST never applies to a foreign-currency invoice - whatever was chosen or the project says", async () => {
  const { getGstBreakdown } = await load(CALC);
  const choice = { applicable: true, ratePercent: 18, taxType: "IGST", buyerStateKnown: true };
  for (const currency of ["USD", "EUR", "AED", "OMR"]) assert.equal(getGstBreakdown(projectWith([line("l1", "I", "Draft")]), 1000, currency, "I", choice).isApplicable, false, currency);
});

test("the screen's rounding is unchanged (the server copies it): 0.25 at 18% is 0.05 IGST but 0.02 + 0.02 as CGST + SGST", async () => {
  const { computeGstTax } = await load(CALC);
  assert.equal(computeGstTax(0.25, 18, true).totalTax, 0.05);
  const split = computeGstTax(0.25, 18, false);
  assert.deepEqual([split.cgst, split.sgst, split.totalTax], [0.02, 0.02, 0.04]);
});

// ── choosing a rate and tax type: nothing assumed ───────────────────────────────────────────────

test("rate input: 0-100 with at most four decimals; anything else is rejected", async () => {
  const { parseGstRate } = await load(GST);
  for (const [text, value] of [["0", 0], ["18", 18], [" 12.5 ", 12.5], ["0.0001", 0.0001], ["100", 100]]) assert.equal(parseGstRate(text), value, text);
  for (const bad of ["", "abc", "-1", "100.01", "101", "12.34567", "1e2", "18%", "1,8"]) assert.equal(parseGstRate(bad), null, bad);
});

test("tax type is suggested ONLY from a buyer state that is already saved - never assumed, and never Tamil Nadu by default", async () => {
  const { suggestedGstTaxType } = await load(GST);
  const withState = (stateName) => projectWith([line("l1", "INV-1", "Draft")], { invoiceDocumentDetailsMap: { "INV-1": { buyerInformation: { stateName } } } });
  assert.equal(suggestedGstTaxType(projectWith([line("l1", "INV-1", "Draft")]), "INV-1"), null, "no buyer state: nothing is suggested");
  assert.equal(suggestedGstTaxType(withState("   "), "INV-1"), null, "a blank state is no state");
  assert.equal(suggestedGstTaxType(withState("Karnataka"), "INV-1"), "IGST");
  assert.equal(suggestedGstTaxType(withState("Tamil Nadu"), "INV-1"), "CGST_SGST");
});

test("nothing is prefilled from the project: no rate suggestion exists, and the choice starts empty", async () => {
  const gst = await load(GST);
  assert.equal(gst.suggestedGstRateText, undefined, "the project's rate is not offered as a suggestion any more");
  const hook = src("pages/Projects/components/Invoice/useInvoiceGstChoice.ts");
  assert.match(hook, /initialChoiceFrom\(snapshot\)/, "the choice starts from a saved Draft choice");
  assert.match(hook, /if \(!snapshot\) return \{ rateChoice: "", customRate: "", taxType: "" \};/, "and is empty when there is none");
  assert.ok(!/gstRate|gstApplicable/.test(hook.replace(/\/\*[\s\S]*?\*\//g, "")), "the hook never reads the project's GST setting");
});

test("a GST choice is needed for every INR invoice with no snapshot and no raised line, whatever the project's GST switch; a raised invoice without a snapshot is LEGACY", async () => {
  const { isGstChoiceNeeded, isLegacyGstInvoice } = await load(GST);
  const draft = projectWith([line("l1", "INV-1", "Draft")]);
  assert.equal(isGstChoiceNeeded(draft, "INV-1", "INR"), true);
  assert.equal(isGstChoiceNeeded(draft, "INV-NEW", "INR"), true, "a brand-new number");
  assert.equal(isGstChoiceNeeded(projectWith([line("l1", "INV-1", "Draft", 1, { gstSnapshot: snapshot() })]), "INV-1", "INR"), false, "already has a snapshot");
  const legacy = projectWith([line("l1", "INV-1", "Raised"), line("l2", "INV-1", "Draft")]);
  assert.equal(isGstChoiceNeeded(legacy, "INV-1", "INR"), false, "raised before snapshots existed: never given one");
  assert.equal(isLegacyGstInvoice(legacy, "INV-1", "INR"), true);
  assert.equal(isLegacyGstInvoice(draft, "INV-1", "INR"), false);
  assert.equal(isGstChoiceNeeded(draft, "INV-1", "USD"), false, "foreign invoice");
  assert.equal(isGstChoiceNeeded(projectWith([line("l1", "INV-1", "Draft")], { gstApplicable: false }), "INV-1", "INR"), true, "the project's Quantity-section switch does not decide it");
});

test("a complete selection needs a valid rate AND an explicit tax type; a Draft never needs one but a raised status does", async () => {
  const { buildGstSelection, gstChoiceBlocker, GST_CHOICE_REQUIRED_MESSAGE } = await load(GST);
  assert.deepEqual(buildGstSelection("18", "IGST", true), { applicable: true, ratePercent: 18, taxType: "IGST", buyerStateKnown: true });
  assert.deepEqual(buildGstSelection("0", "CGST_SGST", false), { applicable: true, ratePercent: 0, taxType: "CGST_SGST", buyerStateKnown: false }, "0% is a valid choice");
  assert.deepEqual(buildGstSelection("", "", false, true), { applicable: false }, "'No GST' needs no rate and no tax type, and is not the same as 0%");
  assert.equal(buildGstSelection("18", "", true), null, "no tax type picked");
  assert.equal(buildGstSelection("", "IGST", true), null, "no rate picked");
  assert.equal(buildGstSelection("abc", "IGST", true), null);
  assert.equal(gstChoiceBlocker({ needed: true, status: "Draft", selection: null }), null);
  assert.equal(gstChoiceBlocker({ needed: true, status: "Cancelled", selection: null }), null);
  for (const status of ["Raised", "PartiallyPaid", "Paid"]) assert.equal(gstChoiceBlocker({ needed: true, status, selection: null }), GST_CHOICE_REQUIRED_MESSAGE, status);
  assert.equal(gstChoiceBlocker({ needed: true, status: "Raised", selection: { applicable: true, ratePercent: 18, taxType: "IGST", buyerStateKnown: true } }), null);
  assert.equal(gstChoiceBlocker({ needed: true, status: "Raised", selection: { applicable: false } }), null, "an explicit No GST satisfies the requirement");
  assert.equal(gstChoiceBlocker({ needed: false, status: "Raised", selection: null }), null);
});

// ── the central guard ───────────────────────────────────────────────────────────────────────────

test("findInvoiceMissingGstChoice: a first raise with no choice is reported; a choice, a draft, an already-raised invoice, a rename of a raised invoice and an ineligible project are not", async () => {
  const { findInvoiceMissingGstChoice } = await load(GST);
  const choice = { "INV-1": { applicable: true, ratePercent: 18, taxType: "IGST", buyerStateKnown: true } };
  const before = projectWith([line("l1", "INV-1", "Draft")]);
  const raise = (invoices, extra = {}) => projectWith(invoices, extra);
  assert.equal(findInvoiceMissingGstChoice(before, raise([line("l1", "INV-1", "Raised")]), undefined), "INV-1");
  assert.equal(findInvoiceMissingGstChoice(before, raise([line("l1", "INV-1", "Raised")]), choice), null);
  assert.equal(findInvoiceMissingGstChoice(before, raise([line("l1", "INV-1", "Draft")]), undefined), null, "a Draft needs none");
  const raised = projectWith([line("l1", "INV-1", "Raised"), line("l2", "INV-1", "Draft")]);
  assert.equal(findInvoiceMissingGstChoice(raised, raise([line("l1", "INV-1", "Raised"), line("l2", "INV-1", "Raised")]), undefined), null, "the invoice was already raised (legacy or snapshotted)");
  assert.equal(findInvoiceMissingGstChoice(raised, raise([line("l1", "INV-2", "Raised"), line("l2", "INV-1", "Draft")]), undefined), null, "a line moved out of a raised invoice: the server carries its snapshot / legacy state");
  assert.equal(findInvoiceMissingGstChoice(before, raise([line("l1", "INV-1", "Raised")], { gstApplicable: false }), undefined), "INV-1", "the project switch does not exempt an INR invoice from choosing");
  assert.equal(findInvoiceMissingGstChoice(before, raise([line("l1", "INV-1", "Raised")]), { "INV-1": { applicable: false } }), null, "an explicit No GST is a choice");
  assert.equal(findInvoiceMissingGstChoice(before, raise([line("l1", "INV-1", "Raised", 1, { currency: "USD" })]), undefined), null, "a foreign invoice never carries GST");
});

function harness() {
  const log = { setProject: [], updateProject: [], toasts: [], sync: [] };
  const deps = {
    updateProject: (p) => log.updateProject.push(p),
    syncInvoiceLinesWithApi: async (...args) => (log.sync.push(args), args[2]),
    fetchInvoiceItemsFromApi: async () => [],
    fetchProjectInvoiceCurrency: async () => "INR",
    showToast: (t) => log.toasts.push(t),
    now: () => "NOW",
  };
  const syncing = { current: false };
  const args = (project, updatedProject) => ({ project, updatedProject, setProject: (p) => log.setProject.push(p), syncing, deps });
  const settle = async () => { for (let i = 0; i < 50 && syncing.current; i++) await new Promise((r) => setImmediate(r)); };
  return { log, syncing, args, settle };
}

test("persist: a first raise of a GST invoice with no choice is refused with a clear message - nothing is written, nothing reaches the server, the guard stays free", async () => {
  const { persistInvoiceProjectChange } = await load(ACTIONS);
  const h = harness();
  const p = projectWith([line("l1", "INV-1", "Draft")]);
  assert.equal(persistInvoiceProjectChange(h.args(p, projectWith([line("l1", "INV-1", "Raised")]))), false);
  assert.equal(h.log.toasts.length, 1);
  assert.equal(h.log.toasts[0].title, "Choose the GST for this invoice");
  assert.match(h.log.toasts[0].message, /INV-1.*No GST, or a rate.*IGST or CGST \+ SGST/);
  assert.deepEqual([h.log.sync.length, h.log.setProject.length, h.log.updateProject.length, h.syncing.current], [0, 0, 0, false]);
});

test("persist: the chosen rate / tax type go to the server with the save and are NEVER stored locally or kept in React state", async () => {
  const { persistInvoiceProjectChange } = await load(ACTIONS);
  const h = harness();
  const p = projectWith([line("l1", "INV-1", "Draft")]);
  const selection = { applicable: true, ratePercent: 12, taxType: "CGST_SGST", buyerStateKnown: false };
  const updated = { ...projectWith([line("l1", "INV-1", "Raised")]), invoiceGstSelections: { "INV-1": selection } };
  assert.equal(persistInvoiceProjectChange(h.args(p, updated)), true);
  await h.settle();
  assert.deepEqual(h.log.sync[0][3], { "INV-1": selection }, "handed to the sync as its 4th argument");
  for (const stored of [...h.log.setProject, ...h.log.updateProject]) assert.ok(!("invoiceGstSelections" in stored), "the transient choice never reaches state or the local copy");
  assert.deepEqual(h.log.toasts, []);
});

test("persist: a save that raises nothing, or only raises an already-raised invoice, needs no choice and sends none", async () => {
  const { persistInvoiceProjectChange } = await load(ACTIONS);
  const h = harness();
  const p = projectWith([line("l1", "INV-1", "Raised")]);
  assert.equal(persistInvoiceProjectChange(h.args(p, projectWith([line("l1", "INV-1", "Paid")]))), true);
  await h.settle();
  assert.equal(h.log.sync[0][3], undefined);
  assert.deepEqual(h.log.toasts, []);
});

// ── what the service sends ──────────────────────────────────────────────────────────────────────

function stubFetch() {
  const calls = [];
  const original = globalThis.fetch;
  // the service writes the fresh server list through to the local mirror; give it an in-memory one
  const store = new Map();
  const hadStorage = "localStorage" in globalThis;
  const hadWindow = "window" in globalThis;
  if (!hadWindow) globalThis.window = { dispatchEvent() { return true; }, addEventListener() {}, removeEventListener() {} };
  if (!hadStorage) globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, String(v)), removeItem: (k) => void store.delete(k) };
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const data = call.method === "GET" ? { items: [] } : {};
    return { ok: true, status: 200, json: async () => ({ success: true, data }) };
  };
  return { calls, restore: () => { globalThis.fetch = original; if (!hadStorage) delete globalThis.localStorage; if (!hadWindow) delete globalThis.window; } };
}

test("service: the declaration goes only with a write of an invoice that has no snapshot; a single-line invoice also carries the GST amount shown", async () => {
  const { syncInvoiceLinesWithApi } = await load(SERVICE);
  const selection = { applicable: true, ratePercent: 18, taxType: "IGST", buyerStateKnown: true };
  const stub = stubFetch();
  try {
    // an existing Draft line raised: PATCH with the declaration
    const prevDraft = [{ id: "q1", description: "A", qty: 1, uom: "D", unitPrice: 1, totalPrice: 1, invoices: [line("l1", "INV-1", "Draft")] }];
    const nextRaised = [{ ...prevDraft[0], invoices: [line("l1", "INV-1", "Raised")] }];
    await syncInvoiceLinesWithApi("p1", prevDraft, nextRaised, { "INV-1": selection });
    const patch = stub.calls.find((c) => c.method === "PATCH");
    assert.deepEqual(patch.body.gst, { applicable: true, ratePercent: 18, taxType: "IGST", buyerStateKnown: true, expectedGstAmount: 16200 });

    // a frozen invoice (any line carries a snapshot): never a declaration, even if one is offered
    stub.calls.length = 0;
    const prevFrozen = [{ ...prevDraft[0], invoices: [line("l1", "INV-1", "Raised", 90000, { gstSnapshot: snapshot() })] }];
    const nextFrozen = [{ ...prevDraft[0], invoices: [line("l1", "INV-1", "Raised", 80000, { gstSnapshot: snapshot() })] }];
    await syncInvoiceLinesWithApi("p1", prevFrozen, nextFrozen, { "INV-1": { applicable: true, ratePercent: 5, taxType: "IGST", buyerStateKnown: true } });
    assert.ok(!("gst" in stub.calls.find((c) => c.method === "PATCH").body), "a frozen invoice is never given a new rate");

    // a multi-line new invoice: the declaration (no expected amount - the lines arrive one by one) on each new line's POST
    stub.calls.length = 0;
    const nextTwo = [{ ...prevDraft[0], invoices: [line("n1", "INV-9", "Raised", 40000), line("n2", "INV-9", "Raised", 50000)] }];
    await syncInvoiceLinesWithApi("p1", [{ ...prevDraft[0], invoices: [] }], nextTwo, { "INV-9": selection });
    const posts = stub.calls.filter((c) => c.method === "POST");
    assert.equal(posts.length, 2);
    for (const post of posts) assert.deepEqual(post.body.gst, { applicable: true, ratePercent: 18, taxType: "IGST", buyerStateKnown: true });

    // an explicit 'No GST' is sent as exactly that
    stub.calls.length = 0;
    await syncInvoiceLinesWithApi("p1", prevDraft, nextRaised, { "INV-1": { applicable: false } });
    assert.deepEqual(stub.calls.find((c) => c.method === "PATCH").body.gst, { applicable: false });

    // nothing chosen: nothing sent
    stub.calls.length = 0;
    await syncInvoiceLinesWithApi("p1", prevDraft, nextRaised);
    assert.ok(!("gst" in stub.calls.find((c) => c.method === "PATCH").body));
  } finally {
    stub.restore();
  }
});

// ── the screens ─────────────────────────────────────────────────────────────────────────────────

test("all four workspaces read GST through the shared function with the user's choice, block a raise that has none, and send the choice with the save", () => {
  for (const file of ["AmountBasedInvoiceWorkspaceModal", "InvoiceWorkspaceModal", "LumpSumInvoiceWorkspaceModal", "MlmpInvoiceWorkspaceModal"]) {
    const text = src(`pages/Projects/components/Invoice/${file}.tsx`);
    assert.match(text, /useInvoiceGstChoice\(project, invoiceNo, invoiceCurrency\)/, `${file}: the shared choice state`);
    assert.match(text, /getGstBreakdown\([^;]*gstChoice\.selection\)/, `${file}: the shared snapshot-aware function`);
    assert.match(text, /!gstChoice\.blockerFor\(invoiceStatus\)/, `${file}: Save is blocked until the GST choice is made for a raise`);
    assert.match(text, /\.\.\.gstChoice\.toProjectPatch\(savedInvoiceNo\)/, `${file}: the choice travels with the save`);
    assert.match(text, /<InvoiceGstSelector choice=\{gstChoice\} status=\{invoiceStatus\} \/>/, `${file}: the selector is shown`);
    assert.ok(!/gstRate \|\| 18|project\.gstRate/.test(text), `${file}: no hard-coded rate`);
  }
});

test("the Edit Invoice drawer and the History status control also ask for the GST choice before raising, and the rate is not hard-coded anywhere new", () => {
  const drawer = src("pages/Projects/components/Invoice/RaiseInvoiceDrawer.tsx");
  assert.match(drawer, /useInvoiceGstChoice\(project, existingLine\?\.invoiceNo \?\? effectiveInvoiceNo, lineCurrency\)/);
  assert.match(drawer, /!gstChoice\.blockerFor\(statusBeingSaved\)/);
  assert.match(drawer, /gstChoice\.toProjectPatch\(updatedLine\.invoiceNo\)/);
  const history = src("pages/Projects/components/Invoice/InvoiceHistory.tsx");
  assert.match(history, /isGstChoiceNeeded\(project, group\.invoiceNo/);
  assert.match(history, /<InvoiceGstChoiceDialog/);
  const hook = src("pages/Projects/components/Invoice/useInvoiceLineActions.ts");
  assert.match(hook, /updateInvoiceCycleStatus = \(invoiceNo: string, newStatus: InvoiceLineStatus, gstSelection\?: InvoiceGstSelection\)/);
  for (const file of ["invoiceGst.ts", "useInvoiceGstChoice.ts", "InvoiceGstSelector.tsx", "InvoiceGstChoiceDialog.tsx"]) {
    assert.ok(!/\|\| 18|=== 18|"18"/.test(src(`pages/Projects/components/Invoice/${file}`).replace(/\/\*[\s\S]*?\*\//g, "")), `${file}: no hard-coded 18%`);
  }
});

test("the selector never assumes a tax type or a state: no Tamil Nadu in the selector, a blank tax type until picked, frozen display once a snapshot exists", () => {
  const selector = src("pages/Projects/components/Invoice/InvoiceGstSelector.tsx");
  assert.ok(!/tamil/i.test(selector));
  assert.match(selector, /<option value="">Select tax type…<\/option>/);
  assert.match(selector, /<option value="">Select GST…<\/option>/);
  assert.match(selector, /<option value=\{NO_GST_CHOICE\}>No GST<\/option>/, "No GST is an explicit option");
  assert.match(selector, /isRate && \(/, "the tax type is only asked once a rate is chosen");
  assert.ok(!/gstApplicable|gstRate/.test(selector.replace(/\/\*[\s\S]*?\*\//g, "")), "the selector never reads the project's GST setting");
  assert.match(selector, /data-testid="gst-frozen"/);
  assert.match(selector, /data-testid="gst-legacy"/);
  assert.match(selector, /GST details not available \(legacy invoice\)/);
  const boxes = src("pages/Projects/components/Invoice/InvoiceTotalBoxes.tsx");
  assert.ok(!/outside Tamil Nadu/.test(boxes), "no preview hint that infers IGST from Tamil Nadu: the tax type is chosen, not inferred");
});

test("the Record Payment popup shows the saved GST read only: taxable, rate, type, GST amount and total incl. GST; legacy invoices say so; nothing to type", async () => {
  const m = await load(GST);
  assert.equal(m.gstTaxTypeLabel("IGST"), "IGST");
  assert.equal(m.gstTaxTypeLabel("CGST_SGST"), "CGST + SGST");
  assert.equal(m.gstTaxTypeLabel(null), "-");
  const modal = src("pages/Projects/components/Invoice/InvoicePaymentDetailsModal.tsx");
  assert.match(modal, /<InvoicePaymentGstPanel gst=\{invoice\.gst\} fmt=\{fmt\} \/>/);
  assert.match(modal, /Invoice amount \(incl\. GST\)/);
  // the settlement target is the server's GST-inclusive invoiceAmount - the popup never adds GST itself
  assert.match(modal, /invoiceAmount: invoice\.invoiceAmount/);
  assert.ok(!/gst\.(gstAmount|totalAmount)[^;\n]*\+|\+[^;\n]*gst\.(gstAmount|totalAmount)/.test(modal), "GST is never added a second time in the popup");
});

// ── the printed invoice follows the saved GST ───────────────────────────────────────────────────

test("print: an invoice with a snapshot prints exactly its snapshot (rate, tax type, or none) whatever the project says; one without prints as it always did", async () => {
  const { getInvoicePrintGst } = await load(CALC);
  const onProject = (invoices) => projectWith(invoices, { gstApplicable: true, gstRate: 18 });
  const offProject = (invoices) => projectWith(invoices, { gstApplicable: false, gstRate: 0 });
  const withSnap = (over) => [line("l1", "INV-1", "Raised", 90000, { gstSnapshot: snapshot(over) })];
  // a snapshot at 5% CGST+SGST prints 5% split, on a project whose own rate is 18% (or whose GST switch is off)
  for (const make of [onProject, offProject]) {
    const g = getInvoicePrintGst(make(withSnap({ ratePercent: "5", taxType: "CGST_SGST" })), "INV-1", "INR");
    assert.deepEqual(g, { isApplicable: true, ratePercent: 5, isInterState: false });
  }
  // a 'No GST' snapshot prints no GST even on a project whose switch is on
  assert.deepEqual(getInvoicePrintGst(onProject(withSnap({ gstStatus: "NOT_APPLICABLE", ratePercent: null, taxType: null })), "INV-1", "INR"), { isApplicable: false, ratePercent: 0, isInterState: null });
  // 0% is applicable at rate 0
  assert.deepEqual(getInvoicePrintGst(onProject(withSnap({ ratePercent: "0" })), "INV-1", "INR"), { isApplicable: true, ratePercent: 0, isInterState: true });
  // no snapshot: legacy / draft printing is unchanged (project setting, buyer state decides the tax type)
  assert.deepEqual(getInvoicePrintGst(onProject([line("l1", "INV-1", "Raised")]), "INV-1", "INR"), { isApplicable: true, ratePercent: 18, isInterState: null });
  assert.equal(getInvoicePrintGst(offProject([line("l1", "INV-1", "Raised")]), "INV-1", "INR").isApplicable, false);
  assert.equal(getInvoicePrintGst(onProject([line("l1", "INV-1", "Raised")]), "INV-1", "USD").isApplicable, false, "a foreign invoice never prints GST");
  // all four layouts use it
  const mapper = src("services/invoice/invoiceDocumentMapper.ts");
  assert.equal((mapper.match(/getInvoicePrintGst\(project, invoiceNo, printCurrency\.currency\)/g) ?? []).length, 5, "four layouts plus the per-line rate");
  assert.ok(!/project\.gstRate/.test(mapper), "the mappers no longer read the project's rate directly");
});

// ── a GST choice made on a Draft is kept: never asked twice ────────────────────────────────────

test("a Draft that already carries its GST choice is not asked again: still editable until raised, frozen afterwards", async () => {
  const { getGstBreakdown } = await load(CALC);
  const gst = await load(GST);
  const draftWith = projectWith([line("l1", "INV-1", "Draft", 90000, { gstSnapshot: snapshot() })]);
  // not asked again at Draft -> Raised, nor flagged by the central guard
  assert.equal(gst.isGstChoiceNeeded(draftWith, "INV-1", "INR"), false, "the choice exists already");
  assert.equal(gst.isGstChoiceEditable(draftWith, "INV-1", "INR"), true, "but it can still be changed while it is a Draft");
  assert.equal(gst.findInvoiceMissingGstChoice(draftWith, projectWith([line("l1", "INV-1", "Raised", 90000, { gstSnapshot: snapshot() })]), undefined), null);
  // the figures: the saved choice, replaced by whatever is being chosen right now
  const saved = getGstBreakdown(draftWith, 90000, "INR", "INV-1");
  assert.deepEqual([saved.source, saved.ratePercent, saved.gstAmount], ["snapshot", 18, 16200]);
  const changing = getGstBreakdown(draftWith, 90000, "INR", "INV-1", { applicable: true, ratePercent: 5, taxType: "IGST", buyerStateKnown: false });
  assert.deepEqual([changing.source, changing.ratePercent, changing.gstAmount], ["selection", 5, 4500]);
  // once raised it is frozen: a choice in flight is ignored and it is not editable
  const raised = projectWith([line("l1", "INV-1", "Raised", 90000, { gstSnapshot: snapshot() })]);
  assert.equal(gst.isGstChoiceEditable(raised, "INV-1", "INR"), false);
  assert.equal(getGstBreakdown(raised, 90000, "INR", "INV-1", { applicable: true, ratePercent: 5, taxType: "IGST", buyerStateKnown: false }).ratePercent, 18);
});

test("service: a Draft's saved choice is replaced by a new declaration, a raised invoice's frozen choice never is", async () => {
  const { syncInvoiceLinesWithApi } = await load(SERVICE);
  const stub = stubFetch();
  try {
    const draft = [{ id: "q1", description: "A", qty: 1, uom: "D", unitPrice: 1, totalPrice: 1, invoices: [line("l1", "INV-1", "Draft", 90000, { gstSnapshot: snapshot() })] }];
    const raising = [{ ...draft[0], invoices: [line("l1", "INV-1", "Raised", 90000, { gstSnapshot: snapshot() })] }];
    await syncInvoiceLinesWithApi("p1", draft, raising, { "INV-1": { applicable: true, ratePercent: 5, taxType: "IGST", buyerStateKnown: false } });
    assert.equal(stub.calls.find((c) => c.method === "PATCH").body.gst.ratePercent, 5, "while it is a Draft the new choice is sent");
    stub.calls.length = 0;
    const frozen = [{ ...draft[0], invoices: [line("l1", "INV-1", "Raised", 90000, { gstSnapshot: snapshot() })] }];
    const edited = [{ ...draft[0], invoices: [line("l1", "INV-1", "Raised", 80000, { gstSnapshot: snapshot() })] }];
    await syncInvoiceLinesWithApi("p1", frozen, edited, { "INV-1": { applicable: true, ratePercent: 5, taxType: "IGST", buyerStateKnown: false } });
    assert.ok(!("gst" in stub.calls.find((c) => c.method === "PATCH").body), "once raised nothing is sent");
  } finally {
    stub.restore();
  }
});
