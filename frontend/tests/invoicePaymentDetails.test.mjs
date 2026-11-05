// Record Payment - Invoice Settlement popup (Nov 2026) — the browser side of the payment workflow. These tests pin the pure logic (the
// live settlement summary and its worked examples, the nine deduction categories, currency-aware input rules, nothing mandatory,
// payload building, dirty detection, double-click guard), the service's wire contract and the wiring of both entry points. There is
// GST only as a read-only invoice component (never an input or a deduction). The settlement itself is the BACKEND's job and is tested there.
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

const src = (rel) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8");
const DETAILS = "/src/pages/Projects/components/Invoice/invoicePaymentDetails.ts";
const SERVICE = "/src/services/invoicePaymentService.ts";
const MODAL = "pages/Projects/components/Invoice/InvoicePaymentDetailsModal.tsx";

const ctx = (currency) => ({ currency, todayIso: "2026-11-04" });
/** A draft with the given bank amount and deduction amounts ({ TDS: "10000" }); an `extra` map patches a category's other fields. */
const draftWith = (m, { bank = "", date = "", deductions = {}, extra = {}, receipt = {} } = {}) => {
  const d = m.createInitialDraft();
  d.receipt = { ...d.receipt, amountReceived: bank, paymentDate: date, ...receipt };
  for (const [category, amount] of Object.entries(deductions)) d.adjustments.find((a) => a.category === category).amount = amount;
  for (const [category, patch] of Object.entries(extra)) Object.assign(d.adjustments.find((a) => a.category === category), patch);
  return d;
};
const summaryOf = (m, draft, { currency = "INR", invoice = "100000.00", prevBank = "0.00", prevDed = "0.00", prevBy = [] } = {}) =>
  m.computeLiveSummary({ currency, invoiceAmount: invoice, previousBank: prevBank, previousDeductions: prevDed, previousByCategory: prevBy, draft });

// ── Currency precision ────────────────────────────────────────────────────────────────────────────

test("INR, USD and AED take two decimals; OMR takes three; nothing is rounded or truncated", async () => {
  const m = await load(DETAILS);
  for (const [currency, places] of [["INR", 2], ["USD", 2], ["AED", 2], ["EUR", 2], ["OMR", 3]]) assert.equal(m.decimalPlacesFor(currency), places, currency);
  assert.equal(m.normalizeMoney("125.50", "USD"), "125.50");
  assert.equal(m.normalizeMoney("125.125", "OMR"), "125.125");
  assert.equal(m.normalizeMoney("1,25,000.5", "INR"), "125000.5", "thousands commas are allowed and removed");
  assert.equal(m.normalizeMoney("125.125", "INR"), null, "a third decimal is rejected for INR, never rounded");
  assert.equal(m.normalizeMoney("125.1255", "OMR"), null);
  assert.equal(m.normalizeMoney("-5", "INR"), null);
  assert.equal(m.normalizeMoney("1e3", "INR"), null);
  assert.equal(m.normalizeMoney("", "INR"), null);
});

// ── The nine deduction types, no GST ───────────────────────────────────────────────────────────────

test("the popup offers exactly the nine requested deduction types; Security Deposit and ISD are the only ones with dates; there is no GST type", async () => {
  const m = await load(DETAILS);
  assert.deepEqual(
    m.DEDUCTION_CATEGORIES.map((c) => c.label),
    ["TDS", "Security Deposit", "ISD", "Other Deduction", "LD Amount", "Bank Charges", "Withholding Taxes", "Foreign Exchange Loss", "Waive-off"]
  );
  assert.deepEqual(m.DEDUCTION_CATEGORIES.filter((c) => c.kind === "retained").map((c) => c.value), ["SECURITY_DEPOSIT", "ISD"]);
  assert.deepEqual(m.DEDUCTION_CATEGORIES.filter((c) => c.kind === "fx").map((c) => c.value), ["FX_LOSS"]);
  assert.ok(!m.DEDUCTION_CATEGORIES.some((c) => /gst/i.test(c.value) || /gst/i.test(c.label)));
  const draft = m.createInitialDraft();
  assert.equal(draft.adjustments.length, 9);
  assert.ok(!("gst" in draft), "the draft has no GST");
  assert.ok(!/gst/i.test(JSON.stringify(draft)));
});

// ── Live settlement summary: the worked examples ───────────────────────────────────────────────────

test("Example 1: invoice 1,00,000, bank 70,000 + TDS / Security Deposit / LD 10,000 each -> settled 1,00,000, outstanding 0, Paid", async () => {
  const m = await load(DETAILS);
  const s = summaryOf(m, draftWith(m, { bank: "70000", deductions: { TDS: "10000", SECURITY_DEPOSIT: "10000", LD_AMOUNT: "10000" } }));
  assert.equal(s.totalBank, "70000.00");
  assert.equal(s.currentDeductions, "30000.00");
  assert.equal(s.totalSettled, "100000.00");
  assert.equal(s.outstanding, "0.00");
  assert.equal(s.outcome, "SETTLED");
  assert.equal(s.resultingStatus, "Paid");
});

test("Example 2: bank 70,000 + a single deduction of 10,000 -> settled 80,000, outstanding 20,000, Partially Paid", async () => {
  const m = await load(DETAILS);
  const s = summaryOf(m, draftWith(m, { bank: "70000", deductions: { TDS: "10000" } }));
  assert.equal(s.totalSettled, "80000.00");
  assert.equal(s.outstanding, "20000.00");
  assert.equal(s.outcome, "PARTIAL");
  assert.equal(s.resultingStatus, "PartiallyPaid");
});

test("more than the invoice amount is INVALID, with a message naming the actual amounts and currency; nothing entered leaves the status alone", async () => {
  const m = await load(DETAILS);
  const over = summaryOf(m, draftWith(m, { bank: "90000", deductions: { TDS: "10000", WAIVE_OFF: "5000" } }));
  assert.equal(over.outcome, "INVALID");
  assert.equal(over.resultingStatus, null);
  assert.equal(over.outstanding, "0.00");
  assert.match(over.excessMessage, /Bank amount INR 90000\.00 \+ deductions INR 15000\.00 = INR 105000\.00, which exceeds the invoice amount of INR 100000\.00 by INR 5000\.00\./);
  const none = summaryOf(m, draftWith(m, {}));
  assert.equal(none.outcome, "NONE");
  assert.equal(none.resultingStatus, null);
  assert.equal(none.outstanding, "100000.00");
});

test("every one of the nine categories counts toward Total Settled and reduces the outstanding amount", async () => {
  const m = await load(DETAILS);
  for (const category of m.DEDUCTION_CATEGORIES) {
    const s = summaryOf(m, draftWith(m, { bank: "40000", deductions: { [category.value]: "10000" } }));
    assert.equal(s.totalSettled, "50000.00", category.value);
    assert.equal(s.outstanding, "50000.00", category.value);
    assert.deepEqual(s.deductionsByCategory, [{ category: category.value, amount: "10000.00" }], category.value);
  }
  const all = summaryOf(m, draftWith(m, { bank: "10000", deductions: Object.fromEntries(m.DEDUCTION_CATEGORIES.map((c) => [c.value, "10000"])) }), { invoice: "100000.00" });
  assert.equal(all.totalSettled, "100000.00");
  assert.equal(all.outcome, "SETTLED");
});

test("previous active payments are included once: previous + current, per category and in total, and a reversed payment is simply absent", async () => {
  const m = await load(DETAILS);
  const s = summaryOf(m, draftWith(m, { bank: "20000", deductions: { TDS: "5000" } }), {
    prevBank: "50000.00", prevDed: "10000.00", prevBy: [{ category: "TDS", amount: "4000.00" }, { category: "LD_AMOUNT", amount: "6000.00" }],
  });
  assert.equal(s.previousBank, "50000.00");
  assert.equal(s.totalBank, "70000.00");
  assert.equal(s.totalDeductions, "15000.00");
  assert.equal(s.totalSettled, "85000.00");
  assert.equal(s.outstanding, "15000.00");
  assert.deepEqual(s.deductionsByCategory, [{ category: "TDS", amount: "9000.00" }, { category: "LD_AMOUNT", amount: "6000.00" }]);
});

test("foreign currencies stay in the invoice currency and exact: USD / AED two decimals, OMR three, no float drift", async () => {
  const m = await load(DETAILS);
  const usd = summaryOf(m, draftWith(m, { bank: "5000.10", deductions: { TDS: "999.90" } }), { currency: "USD", invoice: "6000.00" });
  assert.equal(usd.totalSettled, "6000.00");
  assert.equal(usd.outcome, "SETTLED");
  const omr = summaryOf(m, draftWith(m, { bank: "900.125", deductions: { BANK_CHARGES: "100" } }), { currency: "OMR", invoice: "1000.125" });
  assert.equal(omr.totalSettled, "1000.125");
  assert.equal(omr.outcome, "SETTLED");
  assert.equal(omr.invoiceAmount, "1000.125");
  const aed = summaryOf(m, draftWith(m, { bank: "0.10", deductions: { TDS: "0.20" } }), { currency: "AED", invoice: "0.30" });
  assert.equal(aed.totalSettled, "0.30", "0.1 + 0.2 is exactly 0.3");
  assert.equal(aed.outcome, "SETTLED");
});

test("an invalid typed amount is ignored by the totals and flagged, never turned into a number", async () => {
  const m = await load(DETAILS);
  const s = summaryOf(m, draftWith(m, { bank: "12abc", deductions: { TDS: "10" } }));
  assert.equal(s.hasInputError, true);
  assert.equal(s.totalBank, "0.00");
  assert.equal(s.totalSettled, "10.00");
});

// ── Nothing is mandatory ───────────────────────────────────────────────────────────────────────────

test("nothing is mandatory: no date, reference, notes or deduction is required; only 'at least one amount' is", async () => {
  const m = await load(DETAILS);
  const bankOnly = m.validatePaymentDetails(draftWith(m, { bank: "100" }), ctx("INR"));
  assert.equal(bankOnly.hasErrors, false, "a bank amount alone is enough: no date, no reference");
  const deductionOnly = m.validatePaymentDetails(draftWith(m, { deductions: { TDS: "50" } }), ctx("INR"));
  assert.equal(deductionOnly.hasErrors, false, "a deduction alone is enough: no bank amount, no remark");
  const sd = m.validatePaymentDetails(draftWith(m, { deductions: { SECURITY_DEPOSIT: "50" } }), ctx("INR"));
  assert.equal(sd.hasErrors, false, "Security Deposit does not demand its dates");
  const none = m.validatePaymentDetails(draftWith(m, {}), ctx("INR"));
  assert.equal(none.hasErrors, true);
  assert.match(none.general[0], /Enter at least one amount/);
  assert.equal(m.validatePaymentDetails(draftWith(m, { bank: "0", deductions: { TDS: "0.00" } }), ctx("INR")).hasErrors, true, "zeros record nothing");
});

test("what IS typed is still checked: bad amounts, decimals for the currency, impossible dates, a future payment date, over-long text", async () => {
  const m = await load(DETAILS);
  const bad = m.validatePaymentDetails(draftWith(m, { bank: "1.234", date: "2026-02-31", deductions: { TDS: "x" } }), ctx("USD"));
  assert.match(bad.receipt.amountReceived, /at most 2 decimal places/);
  assert.match(bad.receipt.paymentDate, /valid payment date/);
  const tdsId = m.createInitialDraft().adjustments[0].id;
  assert.ok(bad.adjustments[tdsId].amount);
  assert.match(m.validatePaymentDetails(draftWith(m, { bank: "1", date: "2026-12-30" }), ctx("INR")).receipt.paymentDate, /future/);
  assert.equal(m.validatePaymentDetails(draftWith(m, { bank: "1", date: "2026-11-05" }), ctx("INR")).hasErrors, false, "tomorrow is allowed, like the backend");
  assert.match(m.validatePaymentDetails(draftWith(m, { bank: "1", receipt: { reference: "x".repeat(101) } }), ctx("INR")).receipt.reference, /at most 100/);
  const dates = m.validatePaymentDetails(draftWith(m, { deductions: { ISD: "5" }, extra: { ISD: { expectedReleaseDate: "2026-13-01", reminderDate: "nope" } } }), ctx("INR"));
  const isdId = m.createInitialDraft().adjustments.find((a) => a.category === "ISD").id;
  assert.ok(dates.adjustments[isdId].expectedReleaseDate && dates.adjustments[isdId].reminderDate);
  assert.equal(m.validatePaymentDetails(draftWith(m, { bank: "1", date: "12026-01-01" }), ctx("INR")).hasErrors, true, "a 5-digit year is rejected");
});

// ── Payload ─────────────────────────────────────────────────────────────────────────────────────────

const build = (m, draft, currency = "INR") => m.buildPaymentPayload(draft, { projectId: "p", invoiceNo: "INV-1", currency });

test("the payload carries the bank receipt and every deduction with an amount (all nine), plus only the dates that belong to Security Deposit / ISD", async () => {
  const m = await load(DETAILS);
  const d = draftWith(m, {
    bank: "70,000", date: "2026-10-30", receipt: { reference: " UTR-1 ", notes: "" },
    deductions: Object.fromEntries(m.DEDUCTION_CATEGORIES.map((c) => [c.value, "100"])),
    extra: {
      SECURITY_DEPOSIT: { expectedReleaseDate: "2027-01-10", reminderDate: "2027-01-03" },
      ISD: { expectedReleaseDate: "2027-02-10" },
      TDS: { expectedReleaseDate: "2027-05-05", reminderDate: "2027-05-01" },
    },
  });
  const { payload, adjustmentIds } = build(m, d);
  assert.deepEqual(payload.receipts, [{ paymentDate: "2026-10-30", amountReceived: "70000", reference: "UTR-1" }]);
  assert.equal(payload.adjustments.length, 9);
  assert.equal(adjustmentIds.length, 9);
  const by = (c) => payload.adjustments.find((a) => a.category === c);
  assert.deepEqual(by("SECURITY_DEPOSIT"), { category: "SECURITY_DEPOSIT", amount: "100", expectedReleaseDate: "2027-01-10", reminderDate: "2027-01-03" });
  assert.deepEqual(by("ISD"), { category: "ISD", amount: "100", expectedReleaseDate: "2027-02-10" });
  assert.deepEqual(by("TDS"), { category: "TDS", amount: "100" }, "dates typed on a non-retained category are not sent");
  const text = JSON.stringify(payload);
  assert.ok(!/gst/i.test(text), "no GST in the request");
  assert.ok(!text.includes("reason"), "no remark per deduction");
});

test("blank and zero entries record nothing: no receipt without an amount, no deduction without a positive amount", async () => {
  const m = await load(DETAILS);
  assert.deepEqual(build(m, draftWith(m, { deductions: { TDS: "50", LD_AMOUNT: "0", BANK_CHARGES: "" } })).payload, {
    projectId: "p", invoiceNo: "INV-1", currency: "INR", receipts: [], adjustments: [{ category: "TDS", amount: "50" }],
  });
  assert.deepEqual(build(m, draftWith(m, { bank: "0", date: "2026-10-01", deductions: { TDS: "50" } })).payload.receipts, []);
});

test("switching between tabs keeps every typed value: tab selection is not part of the draft, and a deduction on one tab survives edits on another", async () => {
  const m = await load(DETAILS);
  const d = draftWith(m, { deductions: { TDS: "10", ISD: "20" } });
  const before = JSON.stringify(d);
  // The popup keeps the selected tab in separate state; the draft is only changed by field edits.
  assert.equal(JSON.stringify(d), before);
  d.adjustments.find((a) => a.category === "LD_AMOUNT").amount = "30";
  assert.deepEqual(build(m, d).payload.adjustments.map((a) => [a.category, a.amount]), [["TDS", "10"], ["ISD", "20"], ["LD_AMOUNT", "30"]], "multiple categories in one payment, in tab order");
  const text = src(MODAL);
  assert.match(text, /const \[activeTab, setActiveTab\] = useState<DeductionCategory>/);
  assert.match(text, /onClick=\{\(\) => setActiveTab\(category\.value\)\}/);
  assert.match(text, /role="tablist"/);
  assert.match(text, /aria-selected=\{selected\}/);
  assert.match(text, /deduction-tab-amount-/, "the entered amount shows on its tab");
});

// ── Server errors, dirty detection, guards ──────────────────────────────────────────────────────────

test("server field errors map back onto the draft by index (receipts / adjustments), unmatched ones become general messages", async () => {
  const m = await load(DETAILS);
  const d = draftWith(m, { bank: "10", deductions: { TDS: "5", ISD: "6" } });
  const built = build(m, d);
  const errs = m.mapServerErrors(
    [{ path: "receipts.0.amountReceived", message: "bad bank" }, { path: "adjustments.1.amount", message: "bad isd" }, { path: "somewhere", message: "other" }],
    built
  );
  assert.equal(errs.receipt.amountReceived, "bad bank");
  assert.equal(errs.adjustments[built.adjustmentIds[1]].amount, "bad isd");
  assert.deepEqual(errs.general, ["other"]);
  assert.equal(errs.hasErrors, true);
});

test("a draft is dirty only when something differs from the start; whitespace does not count", async () => {
  const m = await load(DETAILS);
  const base = m.createInitialDraft();
  assert.equal(m.isDraftDirty(m.createInitialDraft(), base), false);
  assert.equal(m.isDraftDirty(draftWith(m, { receipt: { notes: "  " } }), base), false);
  assert.equal(m.isDraftDirty(draftWith(m, { bank: "1" }), base), true);
  assert.equal(m.isDraftDirty(draftWith(m, { deductions: { WAIVE_OFF: "1" } }), base), true);
});

test("the save guard lets one save run at a time, and every attempt gets its own idempotency key", async () => {
  const m = await load(DETAILS);
  const guard = m.createSaveGuard();
  assert.equal(guard.tryEnter(), true);
  assert.equal(guard.tryEnter(), false, "a second click while saving is refused");
  guard.leave();
  assert.equal(guard.tryEnter(), true);
  assert.notEqual(m.newIdempotencyKey(), m.newIdempotencyKey());
});

test("amounts are displayed with grouping in their own currency, exactly as strings", async () => {
  const m = await load(DETAILS);
  assert.equal(m.formatMoneyString("100000.00", "INR"), "₹1,00,000.00");
  assert.equal(m.formatMoneyString("6000.00", "USD"), "USD 6,000.00");
  assert.equal(m.formatMoneyString("1000.125", "OMR"), "OMR 1,000.125");
  assert.equal(m.formatReviewDate("2026-10-29"), "29 Oct 2026");
});

// ── Service wire contract ─────────────────────────────────────────────────────────────────────────

function stubFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const { status = 200, json } = handler(call);
    return { ok: status >= 200 && status < 300, status, json: async () => json };
  };
  return { calls, restore: () => (globalThis.fetch = original) };
}

test("the service talks to the payment endpoints with the idempotency key, and surfaces rejections with their message and status", async () => {
  const service = await load(SERVICE);
  const apiClient = await load("/src/services/apiClient.ts");
  const stub = stubFetch((call) => {
    if (call.url.includes("/invoice-payments/preview")) return { json: { success: true, data: { valid: true, canSave: true } } };
    if (call.method === "POST" && call.url.endsWith("/invoice-payments") && call.body.idempotencyKey === "bad") return { status: 422, json: { success: false, message: "The settlement exceeds the invoice amount." } };
    if (call.url.includes("/reverse")) return { json: { success: true, data: { newInvoiceStatus: "Raised" } } };
    if (call.method === "POST") return { status: 201, json: { success: true, data: { replayed: false } } };
    return { json: { success: true, data: { payments: [] } } };
  });
  try {
    const payload = { projectId: "p 1", invoiceNo: "A/B 1", currency: "USD", receipts: [], adjustments: [] };
    await service.getInvoicePaymentOverview("p 1", "A/B 1");
    assert.ok(stub.calls[0].url.endsWith("/invoice-payments?projectId=p%201&invoiceNo=A%2FB%201"), "ids with spaces and slashes are encoded");
    await service.previewInvoicePayment(payload);
    assert.ok(stub.calls[1].url.endsWith("/invoice-payments/preview"));
    assert.equal(stub.calls[1].method, "POST");
    await service.recordInvoicePayment(payload, "key-1");
    assert.deepEqual([stub.calls[2].method, stub.calls[2].body.idempotencyKey, stub.calls[2].body.currency], ["POST", "key-1", "USD"]);
    await service.reverseInvoicePayment("pay 1", "wrong amount");
    assert.ok(stub.calls[3].url.endsWith("/invoice-payments/pay%201/reverse"));
    assert.deepEqual(stub.calls[3].body, { reason: "wrong amount" });
    await assert.rejects(service.recordInvoicePayment(payload, "bad"), (error) => error instanceof apiClient.ApiError && error.status === 422 && error.message === "The settlement exceeds the invoice amount.");
  } finally {
    stub.restore();
  }
});

// ── Invoice context (read-only, from existing figures) ────────────────────────────────────────────

const line = (id, invoiceNo, status, amount, extra = {}) => ({ id, invoiceNo, invoiceDate: "2026-09-01", quantityBilled: 1, invoiceAmountINR: amount, status, createdBy: "x", ...extra });
const projectWith = (invoices, extra = {}) => ({
  id: "p1", prNo: "PR-1", client: "Client", projectTitle: "Title", gstApplicable: true, gstRate: 18, currency: "INR", invoiceCurrency: "INR",
  invoiceItems: [{ id: "q1", description: "A", qty: 1, uom: "DAY", unitPrice: 1, totalPrice: 1, invoices }],
  ...extra,
});

test("the invoice context sums the invoice's non-cancelled lines in INR and carries the foreign total and recorded rate; it has no GST", async () => {
  const m = await load(DETAILS);
  const ctxA = m.buildInvoicePaymentContext(projectWith([line("l1", "INV-1", "Raised", 30000), line("l2", "INV-1", "Raised", 20000), line("l3", "INV-1", "Cancelled", 999), line("l4", "INV-2", "Raised", 5)]), "INV-1");
  assert.equal(ctxA.lineCount, 2);
  assert.equal(ctxA.valueInr, 50000);
  assert.equal(ctxA.currentStatus, "Raised");
  assert.ok(!("gst" in ctxA) && !("valueExGstInr" in ctxA));
  const usd = m.buildInvoicePaymentContext(
    projectWith([line("l1", "INV-9", "Raised", 83000, { currency: "USD", exchangeRateToINR: 83, invoiceAmountOriginal: 1000 })], { currency: "USD", invoiceCurrency: "USD" }),
    "INV-9"
  );
  assert.equal(usd.currency, "USD");
  assert.deepEqual(usd.foreign, { total: 1000, rate: 83 });
});

// ── Wiring of the entry points and the modal ──────────────────────────────────────────────────────

test("Invoice History opens the popup for Paid and Partially Paid, never calls onUpdateInvoiceStatus for them, and reloads the invoice after a payment", () => {
  const text = src("pages/Projects/components/Invoice/InvoiceHistory.tsx");
  const branch = text.match(/const nextStatus = e\.target\.value as InvoiceLineStatus;[\s\S]*?onUpdateInvoiceStatus\(group\.invoiceNo, nextStatus\);/);
  assert.ok(branch, "status onChange handler not found");
  const paidIf = branch[0].indexOf('nextStatus === "Paid"');
  const open = branch[0].indexOf("setPaymentDetailsInvoiceNo(group.invoiceNo)");
  const ret = branch[0].indexOf("return;");
  const apply = branch[0].indexOf("onUpdateInvoiceStatus(group.invoiceNo, nextStatus)");
  assert.ok(paidIf >= 0 && paidIf < open && open < ret && ret < apply, "Paid must open the popup and return before the status is applied");
  assert.match(branch[0], /nextStatus === "Paid" \|\| nextStatus === "PartiallyPaid"/, "Partially Paid is only reachable through the popup too");
  assert.match(text, /<InvoicePaymentDetailsModal[\s\S]*projectId=\{project\.id\}[\s\S]*onPaymentChanged/);
  assert.match(src("pages/Projects/components/Invoice/InvoiceDashboard.tsx"), /onPaymentChanged=\{actions\.reloadInvoicesFromServer\}/);
});

test("the Edit Invoice drawer opens the popup for Paid and Partially Paid, leaves its status alone, follows the server status, and reloads after a payment", () => {
  const text = src("pages/Projects/components/Invoice/RaiseInvoiceDrawer.tsx");
  const branch = text.match(/const nextStatus = e\.target\.value as InvoiceLineStatus;[\s\S]*?setStatus\(nextStatus\);/);
  assert.ok(branch, "status onChange handler not found");
  const paidIf = branch[0].indexOf('nextStatus === "Paid"');
  const open = branch[0].indexOf("setIsPaymentDetailsOpen(true)");
  const ret = branch[0].indexOf("return;");
  const apply = branch[0].indexOf("setStatus(nextStatus)");
  assert.ok(paidIf >= 0 && paidIf < open && open < ret && ret < apply, "Paid must open the popup and return before the status is set");
  assert.match(branch[0], /nextStatus === "Paid" \|\| nextStatus === "PartiallyPaid"/, "Partially Paid is only reachable through the popup too");
  assert.match(text, /<InvoicePaymentDetailsModal[\s\S]*projectId=\{project\.id\}/);
  assert.match(text, /savedStatus[\s\S]*setStatus\(savedStatus\)/, "the drawer follows a status the server changed");
  assert.match(src("pages/Projects/components/Invoice/InvoiceActionDrawer.tsx"), /onPaymentChanged=\{actions\.reloadInvoicesFromServer\}/, "Invoice Tracker's drawer reloads too");
});

test("the popup never saves by closing: recording a payment is reachable only from the Save button's handler, and a dirty close asks first", () => {
  const text = src("pages/Projects/components/Invoice/InvoicePaymentDetailsModal.tsx");
  const uses = [...text.matchAll(/recordInvoicePayment\(/g)].length;
  assert.equal(uses, 1, "exactly one call site");
  const handleSave = text.slice(text.indexOf("const handleSave"), text.indexOf("const handleReverse"));
  assert.ok(handleSave.includes("recordInvoicePayment("), "the only call is inside handleSave");
  assert.match(handleSave, /saveGuardRef\.current\.tryEnter\(\)/, "double-click guard");
  assert.match(text, /const saveDisabled = [^;]*busy[^;]*overSettled[^;]*nothingEntered/, "Save is disabled while saving, when over-settled and when nothing is entered");
  assert.match(text, /type="submit"[\s\S]*disabled=\{saveDisabled\}/);
  const requestClose = text.slice(text.indexOf("const requestClose"), text.indexOf("const handleKeyDown"));
  assert.match(requestClose, /if \(dirty\)[\s\S]*setConfirmClose\(true\)/, "a dirty close opens the confirmation");
  assert.ok(!requestClose.includes("recordInvoicePayment"), "closing never saves");
  assert.match(text, /<ConfirmDialog[\s\S]*Discard unsaved payment details/);
  assert.match(text, /No click-outside close/);
  for (const forbidden of [/localStorage|sessionStorage|indexedDB/, /showToast\(\{ type: "success"[^}]*\}\);\s*\n\s*onClose/]) assert.ok(!forbidden.test(text), String(forbidden));
});

test("GST is shown read only in the popup and is never an input, a deduction, a draft field or part of the payment request", () => {
  // The payment form, its history, its drafts and its payload builder know nothing about GST.
  for (const file of ["pages/Projects/components/Invoice/PaymentHistoryPanel.tsx", "pages/Projects/components/Invoice/PaymentFormParts.tsx", "pages/Projects/components/Invoice/invoicePaymentDetails.ts"]) {
    const text = src(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(!/gst/i.test(text.replace(/resultingStatus/g, "")), file + " mentions GST");
  }
  // The service carries GST only as read-only response data; what the popup SENDS has no GST field.
  const service = src("services/invoicePaymentService.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const payload = service.slice(service.indexOf("export interface PaymentSubmissionPayload"), service.indexOf("export const getInvoicePaymentOverview"));
  assert.ok(payload.length > 50 && !/gst/i.test(payload), "the payment request has no GST");
  assert.match(service, /export interface InvoiceGstBreakdownDto/);
  // The popup renders it through the read-only panel only: no input / select / textarea of GST, no GST deduction tab.
  const modal = src(MODAL).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.match(modal, /<InvoicePaymentGstPanel gst=\{invoice\.gst\}/);
  assert.ok(!/<(Input|Select|Textarea|input|select|textarea)[^>]*gst/i.test(modal), "no GST field in the popup");
  const panel = src("pages/Projects/components/Invoice/InvoicePaymentGstPanel.tsx");
  assert.ok(!/<(Input|Select|Textarea|input|select|textarea|button|Button)\b/.test(panel), "the GST panel has no controls: it is display only");
  for (const label of ["Taxable value", "GST rate", "GST type", "GST amount", "Total incl. GST", "GST details not available (legacy invoice)"]) assert.ok(panel.includes(label), label);
});

test("the popup is one compact screen with the requested sections: invoice info, bank receipt, deduction tabs, a live settlement summary and Save / Cancel", () => {
  const text = src(MODAL);
  for (const needle of [
    "Record Payment &ndash; Invoice Settlement", 'aria-label="Invoice information"', "Payment Received from Bank", "Deductions &amp; Adjustments", 'role="tablist"',
    "Settlement Summary", "Invoice amount", "Previously received from bank", "Current bank receipt", "Total bank received", "Previous deductions", "Current deductions",
    "Total eligible deductions", "Total settled", "Outstanding", "Calculated status", "Save Payment", "Cancel",
  ]) assert.ok(text.includes(needle), needle);
  assert.match(text, /lg:sticky/, "the summary stays in view beside the form on desktop");
  assert.match(text, /grid-cols-1 gap-4 lg:grid-cols-\[minmax\(0,1fr\)_300px\]/, "and stacks below on small screens");
  assert.match(text, /computeLiveSummary\(/, "the summary updates immediately from the draft");
  assert.match(text, /previousBank: data\.summary\.bankReceived/, "previous figures come from the server's active payments");
  assert.ok(!/Step \d of \d|Back to Edit/.test(text), "no multi-step wizard");
  assert.ok(!/label="(Reason|Remark)/i.test(text) && !/entry\.reason|\.reason\b.*updateAdjustment/.test(text), "no remark per deduction");
});

test("Invoice Tracker labels the payment status events", () => {
  const text = src("pages/InvoiceTracker/trackerFormat.ts");
  assert.match(text, /invoice_payment: "Payment recorded"/);
  assert.match(text, /invoice_payment_reversal: "Payment reversed"/);
});

// ── INR reference figures (foreign-currency invoices): information only ──────────────────────────

test("the INR equivalent is exact: the USD 6,000 / 5,000 / 1,000 example at 1 USD = ₹90", async () => {
  const m = await load(DETAILS);
  assert.equal(m.inrEquivalent("6000.00", "USD", "90"), "540000.00");
  assert.equal(m.inrEquivalent("5000", "USD", "90"), "450000.00");
  assert.equal(m.inrEquivalent("1,000.00", "USD", "90"), "90000.00");
  assert.equal(m.formatMoneyString(m.inrEquivalent("6000.00", "USD", "90"), "INR"), "₹5,40,000.00", "Indian grouping, as in the requirement");
  assert.equal(m.formatMoneyString(m.inrEquivalent("5000.00", "USD", "90"), "INR"), "₹4,50,000.00");
  assert.equal(m.formatMoneyString(m.inrEquivalent("1000.00", "USD", "90"), "INR"), "₹90,000.00");
});

test("AED and OMR equivalents keep each currency's decimals going in and round the INR result half-up to 2 decimals", async () => {
  const m = await load(DETAILS);
  assert.equal(m.inrEquivalent("1234.56", "AED", "22.68"), "27999.82", "27999.8208 -> 27999.82");
  assert.equal(m.inrEquivalent("1000.125", "OMR", "220"), "220027.50", "OMR's third decimal is used");
  assert.equal(m.inrEquivalent("0.001", "OMR", "220"), "0.22");
  assert.equal(m.inrEquivalent("0.01", "USD", "0.5"), "0.01", "0.005 rounds half up");
  assert.equal(m.inrEquivalent("0.01", "USD", "0.49"), "0.00");
  assert.equal(m.inrEquivalent("10", "USD", "83.123456"), "831.23");
  assert.equal(m.inrEquivalent("999999999999.99", "USD", "90"), "89999999999999.10", "12 integer digits stay exact (no float)");
});

test("nothing is guessed: an invalid amount for the currency, a blank amount or an unusable rate shows no INR figure", async () => {
  const m = await load(DETAILS);
  assert.equal(m.inrEquivalent("1.234", "USD", "90"), null, "a third decimal is not valid for USD");
  assert.equal(m.inrEquivalent("1.2345", "OMR", "220"), null);
  assert.equal(m.inrEquivalent("", "USD", "90"), null);
  assert.equal(m.inrEquivalent("abc", "USD", "90"), null);
  assert.equal(m.inrEquivalent("-5", "USD", "90"), null);
  assert.equal(m.inrEquivalent("100", "USD", ""), null);
  assert.equal(m.inrEquivalent("100", "USD", "0"), null);
  assert.equal(m.inrEquivalent("100", "USD", "abc"), null);
});

test("the reference rate is the Applicable exchange rate when one is typed, otherwise the invoice's recorded rate; it updates with either", async () => {
  const m = await load(DETAILS);
  const draft = m.createInitialDraft("r");
  assert.deepEqual(m.referenceRate("90", draft), { rate: "90", source: "invoice" });
  const fx = draft.adjustments.find((a) => a.category === "FX_LOSS");
  fx.exchangeRate = "91.5";
  assert.deepEqual(m.referenceRate("90", draft), { rate: "91.5", source: "applicable" });
  assert.equal(m.inrEquivalent("5000", "USD", m.referenceRate("90", draft).rate), "457500.00", "changing the rate changes the figure");
  fx.exchangeRate = "oops";
  assert.deepEqual(m.referenceRate("90", draft), { rate: "90", source: "invoice" }, "an unusable typed rate falls back to the invoice's");
  fx.exchangeRate = "";
  assert.equal(m.referenceRate("", draft), null, "no usable rate at all -> no INR figures");
});

test("a rate typed alone on the Foreign Exchange Loss tab is not a deduction: it adds no mandatory field, no payload entry, and is still validated", async () => {
  const m = await load(DETAILS);
  const d = draftWith(m, { bank: "900", extra: { FX_LOSS: { exchangeRate: "91.5" } } });
  const fx = d.adjustments.find((a) => a.category === "FX_LOSS");
  assert.equal(m.isAdjustmentEmpty(fx), true);
  assert.equal(m.validatePaymentDetails(d, ctx("USD")).hasErrors, false, "typing only a rate does not demand an amount");
  assert.deepEqual(build(m, d, "USD").payload.adjustments, [], "nothing is saved for a rate-only tab");
  const bad = m.validatePaymentDetails(draftWith(m, { bank: "900", extra: { FX_LOSS: { exchangeRate: "0" } } }), ctx("USD"));
  assert.match(bad.adjustments[fx.id].exchangeRate, /greater than 0/);
  const real = draftWith(m, { deductions: { FX_LOSS: "10" }, extra: { FX_LOSS: { exchangeRate: "91.5" } } });
  assert.equal(m.isAdjustmentEmpty(real.adjustments.find((a) => a.category === "FX_LOSS")), false);
  assert.equal(build(m, real, "USD").payload.adjustments[0].exchangeRate, "91.5");
});

test("INR figures never reach the request: the payload carries only invoice-currency amounts, whatever rate is in play", async () => {
  const m = await load(DETAILS);
  const d = draftWith(m, { bank: "5000", deductions: { TDS: "1000" }, extra: { FX_LOSS: { exchangeRate: "90" } } });
  const { payload } = build(m, d, "USD");
  assert.equal(payload.currency, "USD");
  assert.equal(payload.receipts[0].amountReceived, "5000");
  assert.deepEqual(payload.adjustments, [{ category: "TDS", amount: "1000" }]);
  const text = JSON.stringify(payload);
  for (const forbidden of ["inr", "INR", "5,00,000", "450000", "90000", "exchangeRate"]) assert.ok(!text.includes(forbidden), "payload must not contain " + forbidden);
});

test("the popup shows INR figures only for foreign invoices, adds no input for them, and the reversed payments are not shown", () => {
  const text = src("pages/Projects/components/Invoice/InvoicePaymentDetailsModal.tsx");
  assert.match(text, /currency === "INR" \? null : referenceRate\(/, "an INR invoice gets no INR reference figures");
  assert.match(text, /<InrReference inr=\{inrOf\(draft\.receipt\.amountReceived\)\}/);
  assert.match(text, /<InrReference inr=\{inrOf\(activeEntry\.amount\)\}/);
  assert.match(text, /Settlement is in \{currency\}/);
  assert.ok(!/inrEquivalent[\s\S]{0,80}recordInvoicePayment|recordInvoicePayment[\s\S]{0,200}inrOf/.test(text), "no INR figure feeds the save");
  assert.ok(!/reversedPayments/.test(text), "the popup never renders reversed payments");
  const panel = src("pages/Projects/components/Invoice/PaymentHistoryPanel.tsx");
  assert.match(panel, /INR equivalent/);
  const parts = src("pages/Projects/components/Invoice/PaymentFormParts.tsx");
  assert.match(parts, /INR equivalent \(reference only\)/);
  assert.ok(!/<Input/.test(parts), "the reference figure is text, not an input");
});

// ── Reaching the reversal: an invoice with a recorded payment opens the payment popup instead of a refused status change ──

test("an invoice counts as having a recorded payment when the server marks its lines with recorded cash", async () => {
  const m = await load(DETAILS);
  const mk = (lines) => ({ invoiceItems: [{ id: "q", invoices: lines }] });
  const l = (id, no, status, extra = {}) => ({ id, invoiceNo: no, status, invoiceAmountINR: 100, ...extra });
  assert.equal(m.invoiceHasRecordedPayment(mk([l("1", "A", "Paid", { recordedCashINR: 90, settledINR: 100 })]), "A"), true);
  assert.equal(m.invoiceHasRecordedPayment(mk([l("1", "A", "Raised", { recordedCashINR: 20, settledINR: 20 })]), "A"), true, "a part-payment counts too");
  assert.equal(m.invoiceHasRecordedPayment(mk([l("1", "A", "Paid")]), "A"), false, "a legacy Paid invoice has no payment record: its status can still be changed as before");
  assert.equal(m.invoiceHasRecordedPayment(mk([l("1", "A", "Cancelled", { recordedCashINR: 5 })]), "A"), false);
  assert.equal(m.invoiceHasRecordedPayment(mk([l("1", "B", "Paid", { recordedCashINR: 5 })]), "A"), false, "another invoice's payment is not this invoice's");
  assert.equal(m.invoiceHasRecordedPayment({ invoiceItems: undefined }, "A"), false);
});

test("leaving Paid (or cancelling / sending to Draft) on an invoice with a recorded payment opens the payment popup, in History and in the Edit drawer; a Payments button is always there", () => {
  const history = src("pages/Projects/components/Invoice/InvoiceHistory.tsx");
  const redirect = history.slice(history.indexOf("invoiceHasRecordedPayment(project, group.invoiceNo)"));
  assert.match(redirect.slice(0, 400), /group\.status === "Paid" \|\| group\.status === "PartiallyPaid" \|\| nextStatus === "Cancelled" \|\| nextStatus === "Draft"/);
  assert.match(redirect.slice(0, 600), /setPaymentDetailsInvoiceNo\(group\.invoiceNo\);\s*return;/);
  assert.ok(redirect.indexOf("return;") < redirect.indexOf("onUpdateInvoiceStatus(group.invoiceNo, nextStatus)"), "the popup opens BEFORE any refused status change is sent");
  assert.match(history, />\s*Payments\s*<\/button>/, "a visible Payments button opens the popup for any raised invoice");
  assert.match(history, /group\.status !== "Draft" && group\.status !== "Cancelled"/);
  const drawer = src("pages/Projects/components/Invoice/RaiseInvoiceDrawer.tsx");
  assert.match(drawer, /invoiceHasRecordedPayment\(project, existingLine\.invoiceNo\)[\s\S]{0,200}existingLine\.status === "Paid"[\s\S]{0,200}setIsPaymentDetailsOpen\(true\)/);
  const modal = src("pages/Projects/components/Invoice/InvoicePaymentDetailsModal.tsx");
  assert.match(modal, /reverse the payment below first/, "the popup tells the user how to change the status");
});
