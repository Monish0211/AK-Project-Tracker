// Multi-country invoice currency (Nov 2026) - the browser side. A project's own currency is the default invoice currency and needs no rate; any other invoice
// currency needs the user's own rate, read as "1 unit of invoice currency = X units of PROJECT currency"; the converted amount is exact (one half-up rounding to
// the project currency's minor unit, the same formula the server uses); Indian GST is never offered outside India; India keeps its original behaviour.
// Every rate below is a synthetic test value, not an approved exchange rate.
import assert from "node:assert/strict";
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

const CUR = "/src/pages/Projects/components/Invoice/invoiceCurrency.ts";
const CALC = "/src/pages/Projects/components/Invoice/InvoiceCalculations.ts";
const SERVICE = "/src/services/invoiceService.ts";

const sel = (currency, rate, projectCurrency) => ({
  currency,
  exchangeRateToINR: currency === projectCurrency ? 1 : Number(rate),
  ...(projectCurrency !== "INR" && { projectCurrency, exchangeRateText: currency === projectCurrency ? "1" : rate }),
});
const project = (over = {}) => ({ id: "p1", regionalCurrency: undefined, currency: "USD", currentExchangeRate: 3.64, invoiceItems: [], ...over });

const EXAMPLES = [
  { country: "Oman", project: "OMR", invoice: "USD", rate: "0.385", amount: 600, expected: 231 },
  { country: "Malaysia", project: "MYR", invoice: "USD", rate: "4.20", amount: 1000, expected: 4200 },
  { country: "Abu Dhabi", project: "AED", invoice: "INR", rate: "0.012", amount: 100000, expected: 1200 },
  { country: "FZE", project: "AED", invoice: "USD", rate: "3.67", amount: 1000, expected: 3670 },
  { country: "Elixir Qatar", project: "QAR", invoice: "USD", rate: "3.64", amount: 1000, expected: 3640 },
  { country: "Qatar", project: "QAR", invoice: "EUR", rate: "3.95", amount: 1000, expected: 3950 },
];

test("the seven required conversions: original amount kept, project-currency equivalent exact, project currency carried on the line", async () => {
  const m = await load(CUR);
  for (const e of EXAMPLES) {
    const line = m.amountsFromOriginal(e.amount, sel(e.invoice, e.rate, e.project));
    assert.equal(line.invoiceAmountOriginal, e.amount, `${e.country}: the original amount is preserved`);
    assert.equal(line.invoiceAmountINR, e.expected, `${e.country}: in-memory project-currency amount (historic field name)`);
    assert.equal(line.currency, e.invoice);
    assert.equal(line.projectCurrency, e.project);
    assert.equal(line.exchangeRateToINR, Number(e.rate));
  }
  // India, unchanged: USD 600 at 1 USD = INR 95, no project currency on the line at all.
  const india = m.amountsFromOriginal(600, { currency: "USD", exchangeRateToINR: 95 });
  assert.deepEqual(india, { currency: "USD", exchangeRateToINR: 95, invoiceAmountOriginal: 600, invoiceAmountINR: 57000 });
  assert.equal("projectCurrency" in india, false);
});

test("the project's own currency needs no rate: rate 1, no conversion, whatever rate text is lying around", async () => {
  const m = await load(CUR);
  for (const [pc, amount] of [["OMR", 123.456], ["MYR", 99.5], ["AED", 10], ["QAR", 0.01]]) {
    const line = m.amountsFromOriginal(amount, { currency: pc, exchangeRateToINR: 1, projectCurrency: pc, exchangeRateText: "9.99" });
    assert.equal(line.exchangeRateToINR, 1);
    assert.equal(line.invoiceAmountINR, amount);
    assert.equal(line.invoiceAmountOriginal, amount);
    assert.equal(m.validateExchangeRate(pc, "", pc), null, "no rate is validated for the project's own currency");
    assert.equal(m.isForeignCurrency(pc, pc), false);
  }
  assert.equal(m.isForeignCurrency("INR", "AED"), true, "an INR invoice on an Abu Dhabi project IS a foreign-currency invoice");
  assert.equal(m.isForeignCurrency("INR"), false, "one-argument callers keep the India meaning");
});

test("conversion is exact: one half-up rounding to the project currency, OMR to 3 decimals, never a binary-float result", async () => {
  const m = await load(CUR);
  const conv = (amount, from, rate, to) => m.convertToProjectCurrency(amount, sel(from, rate, to));
  assert.equal(conv(0.01, "USD", "0.385", "OMR"), 0.004, "0.00385 rounds half-up to 0.004");
  assert.equal(conv(0.01, "USD", "0.375", "OMR"), 0.004, "0.00375 -> 0.004");
  assert.equal(conv(0.01, "USD", "0.374", "OMR"), 0.004);
  assert.equal(conv(1.15, "USD", "1", "MYR"), 1.15);
  assert.equal(conv(10.5, "USD", "0.123456789".slice(0, 10), "AED"), 1.3, "more rate digits than 8 are not used; 10.5 x 0.12345678 = 1.2962... -> 1.30");
  assert.equal(conv(1000, "USD", "3.67", "AED"), 3670);
  assert.equal(conv(3.33, "USD", "0.3", "OMR"), 0.999);
  assert.equal(conv(0.1, "EUR", "0.2", "AED"), 0.02, "0.1 x 0.2 = 0.02 exactly (a float gives 0.020000000000000004)");
});

test("an amount derived from a project-currency value is floored so its equivalent never exceeds that value", async () => {
  const m = await load(CUR);
  const s = sel("USD", "3.67", "AED");
  for (const value of [0.01, 1, 10.55, 3670, 12345.67, 99999.99]) {
    const line = m.amountsFromInr(value, s);
    assert.ok(line.invoiceAmountINR <= value + 1e-9, `${value}: equivalent ${line.invoiceAmountINR} must not exceed it`);
    assert.ok(value - line.invoiceAmountINR < 3.67 * 0.01 + 0.011, `${value}: and is within one minor unit of the original currency`);
  }
  const same = m.amountsFromInr(55.5, sel("AED", "1", "AED"));
  assert.equal(same.invoiceAmountOriginal, 55.5);
  assert.equal(same.invoiceAmountINR, 55.5);
  // India path untouched: floor of value / rate, INR equivalent round2(original x rate).
  const india = m.amountsFromInr(9500, { currency: "USD", exchangeRateToINR: 95 });
  assert.equal(india.invoiceAmountOriginal, 100);
  assert.equal(india.invoiceAmountINR, 9500);
});

test("totals add each line's own saved equivalent, in the project currency's own precision", async () => {
  const m = await load(CUR);
  const totals = m.sumAmountsFromInr([100.125, 200.25], sel("USD", "0.385", "OMR"));
  assert.equal(typeof totals.original, "number");
  assert.equal(totals.inr, Math.round((m.amountsFromInr(100.125, sel("USD", "0.385", "OMR")).invoiceAmountINR + m.amountsFromInr(200.25, sel("USD", "0.385", "OMR")).invoiceAmountINR) * 1000) / 1000);
  const india = m.sumAmountsFromInr([9500, 19000], { currency: "USD", exchangeRateToINR: 95 });
  assert.deepEqual(india, { original: 300, inr: 28500 });
});

test("rate validation: direction in the message, 8 decimals at most for a project in another country, India's wording unchanged", async () => {
  const m = await load(CUR);
  assert.equal(m.validateExchangeRate("USD", "", "OMR"), "Enter the exchange rate for this invoice: 1 USD = ? OMR.");
  assert.equal(m.validateExchangeRate("USD", "", "INR"), "Enter the USD to INR exchange rate.", "India's message is unchanged");
  assert.equal(m.validateExchangeRate("USD", "0", "AED"), "Exchange rate must be a number greater than 0.");
  assert.equal(m.validateExchangeRate("USD", "1e3", "AED"), "Exchange rate must be a number greater than 0.");
  assert.equal(m.validateExchangeRate("USD", "3.67", "AED"), null);
  assert.equal(m.validateExchangeRate("USD", "0.123456789", "AED"), "Exchange rate can have at most 8 decimal places.");
  assert.equal(m.validateExchangeRate("USD", "0.123456789", "INR"), null, "India keeps its original unlimited-decimals behaviour");
  assert.equal(m.exchangeRateLabel("USD", "OMR"), "Exchange Rate (1 USD = X OMR)");
  assert.equal(m.exchangeRateLabel("USD", "INR"), "Exchange Rate (1 USD = ₹)");
  assert.equal(m.exchangeRateLabel("USD"), "Exchange Rate (1 USD = ₹)");
});

test("the project's Work Order rate is never put into a regional invoice silently - only a labelled suggestion; India keeps its prefill", async () => {
  const m = await load(CUR);
  const qatar = project({ regionalCurrency: "QAR", currency: "USD", currentExchangeRate: 3.64 });
  assert.equal(m.getDefaultRateFor(qatar, "USD"), "", "no silent prefill");
  assert.equal(m.getDefaultRateFor(qatar, "QAR"), "", "own currency: no rate at all");
  const suggestion = m.getRateSuggestion(qatar, "USD");
  assert.equal(suggestion.rate, 3.64);
  assert.match(suggestion.basis, /Work Order rate: 1 USD = 3\.64 QAR/);
  assert.equal(m.getRateSuggestion(qatar, "EUR"), null, "a rate for another currency is never suggested");
  assert.equal(m.getRateSuggestion(qatar, "QAR"), null);
  const india = project({ currency: "USD", currentExchangeRate: 90.4 });
  assert.equal(m.getDefaultRateFor(india, "USD"), "90.4", "India: the existing prefill is unchanged");
  assert.equal(m.getRateSuggestion(india, "USD"), null, "India has no suggestion mechanism");
});

test("a new invoice starts in the project's own currency; a locked project or a saved invoice keeps its currency and rate", async () => {
  const m = await load(CUR);
  assert.deepEqual(m.getInitialCurrencySelection(project({ regionalCurrency: "OMR" }), "INV-1"), { currency: "OMR", rateInput: "" });
  assert.deepEqual(m.getInitialCurrencySelection(project({ regionalCurrency: "AED" }), "INV-1"), { currency: "AED", rateInput: "" });
  assert.deepEqual(m.getInitialCurrencySelection(project({}), "INV-1"), { currency: "INR", rateInput: "" }, "India / legacy: INR as before");
  assert.deepEqual(m.getInitialCurrencySelection(project({ regionalCurrency: "OMR", invoiceCurrency: "USD" }), "INV-1"), { currency: "USD", rateInput: "" }, "the lock wins");
  const saved = project({
    regionalCurrency: "OMR",
    invoiceCurrency: "USD",
    invoiceItems: [{ id: "i", invoices: [{ id: "l", invoiceNo: "INV-1", status: "Raised", currency: "USD", exchangeRateToINR: 0.385, projectCurrency: "OMR" }] }],
  });
  assert.deepEqual(m.getInitialCurrencySelection(saved, "INV-1"), { currency: "USD", rateInput: "0.385" });
  const sameCurrencySaved = project({
    regionalCurrency: "OMR",
    invoiceItems: [{ id: "i", invoices: [{ id: "l", invoiceNo: "INV-2", status: "Raised", currency: "OMR", exchangeRateToINR: 1, projectCurrency: "OMR" }] }],
  });
  assert.deepEqual(m.getInitialCurrencySelection(sameCurrencySaved, "INV-2"), { currency: "OMR", rateInput: "" }, "no rate shown for the project's own currency");
});

test("line helpers read the line's own project currency: foreign means different from it, equivalents are in it", async () => {
  const m = await load(CUR);
  const regional = { currency: "USD", projectCurrency: "OMR", invoiceAmountOriginal: 600, invoiceAmountINR: 231, exchangeRateToINR: 0.385 };
  assert.equal(m.isForeignLine(regional), true);
  assert.equal(m.getLineOriginalAmount(regional), 600);
  assert.equal(m.formatLineAmountWithEquivalent(regional), "USD 600.00 (OMR 231.000 @ 0.385)");
  const same = { currency: "OMR", projectCurrency: "OMR", invoiceAmountOriginal: 231, invoiceAmountINR: 231, exchangeRateToINR: 1 };
  assert.equal(m.isForeignLine(same), false);
  assert.equal(m.formatLineAmountWithEquivalent(same), "OMR 231.000");
  const abu = { currency: "INR", projectCurrency: "AED", invoiceAmountOriginal: 100000, invoiceAmountINR: 1200, exchangeRateToINR: 0.012 };
  assert.equal(m.isForeignLine(abu), true);
  assert.equal(m.formatLineAmountWithEquivalent(abu), "₹ 1,00,000.00 (AED 1,200.00 @ 0.012)");
  const usdIndia = { currency: "USD", invoiceAmountOriginal: 600, invoiceAmountINR: 57000, exchangeRateToINR: 95 };
  assert.equal(m.formatLineAmountWithEquivalent(usdIndia), "USD 600.00 (₹ 57,000.00 @ 95)");
  assert.equal(m.roundForProject(1.2346, "OMR"), 1.235);
  assert.equal(m.roundForProject(1.2346, "MYR"), 1.23);
  assert.equal(m.roundForProject(1.2346), 1.23);
});

test("Indian GST is never offered for a project whose own currency is not INR - even for an INR invoice", async () => {
  const c = await load(CALC);
  assert.equal(c.isGstSelectableForInvoice("INR"), true, "India, one argument: as before");
  assert.equal(c.isGstSelectableForInvoice("INR", "INR"), true);
  assert.equal(c.isGstSelectableForInvoice("INR", "AED"), false, "INR invoice on an Abu Dhabi project");
  assert.equal(c.isGstSelectableForInvoice("USD", "INR"), false);
  assert.equal(c.isGstSelectableForInvoice("OMR", "OMR"), false);
  assert.equal(c.isGstApplicableForInvoice({ gstApplicable: true, currency: "INR", regionalCurrency: "AED" }, "INR"), false);
  assert.equal(c.isGstApplicableForInvoice({ gstApplicable: true, currency: "INR" }, "INR"), true);
  const breakdown = c.getGstBreakdown({ gstApplicable: true, currency: "INR", regionalCurrency: "AED", invoiceItems: [] }, 1000, "INR", "INV-9", { applicable: true, ratePercent: 18, taxType: "IGST", buyerStateKnown: true });
  assert.equal(breakdown.isApplicable, false);
  assert.equal(breakdown.gstAmount, 0);
});

test("the wire format: a regional line sends its invoice currency, its own rate as text and the original amount - never an INR-named amount or rate; India is byte-identical", async () => {
  const s = await load(SERVICE);
  const base = { id: "l", invoiceNo: "INV-1", invoiceDate: "2026-11-10", quantityBilled: 0, status: "Raised", createdBy: "t" };
  const regional = s.toInvoiceLinePayload({ ...base, currency: "USD", exchangeRateToINR: 0.385, invoiceAmountOriginal: 600, invoiceAmountINR: 231, projectCurrency: "OMR" });
  assert.equal(regional.currency, "USD");
  assert.equal(regional.exchangeRateToProject, "0.385");
  assert.equal(regional.invoiceAmountOriginal, 600);
  assert.equal("invoiceAmountINR" in regional, false);
  assert.equal("exchangeRateToINR" in regional, false);
  const own = s.toInvoiceLinePayload({ ...base, currency: "OMR", exchangeRateToINR: 1, invoiceAmountOriginal: 231, invoiceAmountINR: 231, projectCurrency: "OMR" });
  assert.equal(own.currency, "OMR");
  assert.equal(own.exchangeRateToProject, "1");
  assert.equal(own.invoiceAmountOriginal, 231);
  const tiny = s.toInvoiceLinePayload({ ...base, currency: "USD", exchangeRateToINR: 0.0000001, invoiceAmountOriginal: 1, invoiceAmountINR: 0, projectCurrency: "AED" });
  assert.equal(tiny.exchangeRateToProject, "0.0000001", "an exponent form is written out in full");
  const india = s.toInvoiceLinePayload({ ...base, currency: "USD", exchangeRateToINR: 95, invoiceAmountOriginal: 600, invoiceAmountINR: 57000 });
  assert.deepEqual(india, {
    currency: "USD",
    exchangeRateToINR: 95,
    invoiceAmountOriginal: 600,
    invoiceNo: "INV-1",
    invoiceDate: "2026-11-10",
    milestoneId: null,
    milestoneName: null,
    setIndex: null,
    description: null,
    quantityBilled: 0,
    invoiceAmountINR: 57000,
    clientReference: null,
    remarks: null,
    status: "Raised",
    createdBy: "t",
  });
  const inr = s.toInvoiceLinePayload({ ...base, currency: "INR", exchangeRateToINR: 1, invoiceAmountOriginal: 1000, invoiceAmountINR: 1000 });
  assert.equal("currency" in inr, false, "an INR line is unchanged: no currency fields at all");
});

test("reading a server line: a regional line's project-currency amount, rate and cash come under the historic names, flagged with its project currency; India is unchanged", async () => {
  const s = await load(SERVICE);
  const dto = {
    id: "l1",
    quantityItemId: "q",
    invoiceNo: "INV-1",
    invoiceDate: "2026-11-10T00:00:00.000Z",
    milestoneId: null,
    milestoneName: null,
    setIndex: null,
    description: null,
    quantityBilled: 0,
    unitPriceINR: null,
    calculatedAmountINR: null,
    invoiceAmountINR: 0,
    commercialAdjustmentINR: null,
    currency: "USD",
    exchangeRateToINR: 1,
    invoiceAmountOriginal: 600,
    projectCurrency: "OMR",
    exchangeRateToProject: "0.385",
    invoiceAmountProject: 231,
    unitPriceProject: null,
    calculatedAmountProject: 231,
    commercialAdjustmentProject: 0,
    recordedCashProject: 115.5,
    settledProject: 115.5,
    clientReference: null,
    remarks: null,
    status: "PartiallyPaid",
    createdBy: "t",
    createdAt: "",
    updatedAt: "",
  };
  const line = s.toInvoiceLine(dto);
  assert.equal(line.projectCurrency, "OMR");
  assert.equal(line.invoiceAmountINR, 231);
  assert.equal(line.exchangeRateToINR, 0.385);
  assert.equal(line.invoiceAmountOriginal, 600);
  assert.equal(line.recordedCashINR, 115.5);
  assert.equal(line.settledINR, 115.5);
  assert.equal(line.calculatedAmountINR, 231);
  const indiaDto = { ...dto, invoiceAmountINR: 57000, exchangeRateToINR: 95, projectCurrency: null, exchangeRateToProject: null, invoiceAmountProject: null, recordedCashProject: undefined, settledProject: undefined, recordedCashINR: 1000, settledINR: 1000 };
  const india = s.toInvoiceLine(indiaDto);
  assert.equal("projectCurrency" in india, false);
  assert.equal(india.invoiceAmountINR, 57000);
  assert.equal(india.exchangeRateToINR, 95);
  assert.equal(india.recordedCashINR, 1000);
});
