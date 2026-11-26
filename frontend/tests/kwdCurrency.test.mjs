// KWD (Kuwaiti Dinar, Nov 2026): offered as a Quantity / invoice currency with THREE decimals (fils), shown with its code, written in words with fils, recognised in PDF import.
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
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error", optimizeDeps: { noDiscovery: true, include: [] } });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());
const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");

test("KWD is the last of nine currencies in the shared list, named, with 3 decimals; the others keep theirs", async () => {
  const c = await load("/src/constants/currencies.ts");
  assert.equal(c.SUPPORTED_CURRENCIES.length, 9);
  assert.equal(c.SUPPORTED_CURRENCIES.at(-1), "KWD");
  assert.equal(c.CURRENCY_NAMES.KWD, "Kuwaiti Dinar");
  assert.deepEqual(["KWD", "OMR", "SAR", "USD", "INR"].map((k) => c.CURRENCY_MINOR_UNITS[k]), [3, 3, 2, 2, 2]);
  assert.ok(c.isSupportedCurrency("KWD"));
});

test("amounts show the KWD code with three decimals, whatever the project's country", async () => {
  const d = await load("/src/utils/currencyDisplay.ts");
  assert.equal(d.currencySymbol("KWD"), "KWD");
  assert.equal(d.formatMoney(1234.5, "KWD"), "KWD 1,234.500");
  assert.equal(d.formatMoney(0, "KWD"), "KWD 0.000");
  assert.equal(d.formatMoney(1234.5, "SAR"), "SAR 1,234.50", "SAR is unchanged");
  assert.equal(d.formatMoney(1234.5, "OMR"), "OMR 1,234.500", "OMR is unchanged");
});

test("invoice amounts round to fils, not to 2 decimals", async () => {
  const i = await load("/src/pages/Projects/components/Invoice/invoiceCurrency.ts");
  assert.equal(i.roundToMinorUnit(10.1256, "KWD"), 10.126);
  assert.equal(i.roundToMinorUnit(10.1256, "SAR"), 10.13);
  assert.equal(i.formatInvoiceMoney(12.345, "KWD"), "KWD 12.345");
});

test("a KWD line in an AED project is priced at the entered rate, entered 1 KWD = ? AED", async () => {
  const q = await load("/src/utils/quantityCalculations.ts");
  const d = await load("/src/utils/currencyDisplay.ts");
  const item = { id: "q", description: "Study", woQty: 3, invoiceQty: 0, uom: "DAY", unitRate: 1000, currency: "KWD", exchangeRate: 11.95 };
  const priced = q.recalcQuantityItem(item, "KWD", 11.95, "AED");
  assert.equal(priced.currency, "KWD");
  assert.equal(Math.round(priced.woValueRegional * 100) / 100, 35850);
  assert.equal(d.rateDirectionLabel("KWD", "AED", 0), "1 KWD = ? AED");
});

test("amount in words: ISO code first, three digits of fils", async () => {
  const { amountToCurrencyWords: words } = await load("/src/services/invoice/currencyWords.ts");
  assert.equal(words(123.456, "KWD"), "KWD One Hundred Twenty Three and Four Hundred Fifty Six Fils Only");
  assert.equal(words(500, "KWD"), "KWD Five Hundred Only");
  assert.equal(words(1234.56, "SAR"), "SAR One Thousand Two Hundred Thirty Four and Fifty Six Halalas Only", "SAR is unchanged");
});

test("the Quantity dropdown, PDF import and the Excel template know KWD; the tracker note uses the shared decimals", () => {
  assert.match(src("pages/Projects/components/QuantityCard.tsx"), /const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES;/);
  const config = src("services/pdfExtraction/ruleEngine/fieldMappingConfig.ts");
  assert.match(config, /enumOptions: \[[^\]]*"KWD"[^\]]*\]/);
  assert.match(config, /KWD: \/KWD\\s\?\[\\d,\]\//);
  const norm = src("services/pdfExtraction/ruleEngine/normalizer.ts");
  assert.match(norm, /"SAR", "KWD"\]\.includes\(trimmed\)/);
  assert.match(norm, /\\bKWD\\b\|KUWAIT/);
  assert.match(src("services/projectWorkbookService.ts"), /const CURRENCIES = \[[^\]]*"KWD"\]/);
  assert.match(src("pages/InvoiceTracker/InvoiceChain.tsx"), /CURRENCY_MINOR_UNITS\[inv\.currency\]/);
  assert.doesNotMatch(src("pages/InvoiceTracker/InvoiceChain.tsx"), /inv\.currency === "OMR"/);
});
