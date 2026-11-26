// SAR (Saudi Riyal, Nov 2026): offered as a Quantity / invoice currency, shown with its code, 2 decimals, written in words with its halalas, recognised in PDF import.
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

test("SAR is in the shared list the Quantity and Invoice dropdowns read, after the existing seven (KWD follows), with 2 decimals", async () => {
  const c = await load("/src/constants/currencies.ts");
  assert.deepEqual([...c.SUPPORTED_CURRENCIES], ["INR", "USD", "EUR", "AED", "MYR", "QAR", "OMR", "SAR", "KWD"]);
  assert.equal(c.CURRENCY_NAMES.SAR, "Saudi Riyal");
  assert.equal(c.CURRENCY_MINOR_UNITS.SAR, 2);
  assert.ok(c.isSupportedCurrency("SAR"));
  assert.match(src("pages/Projects/components/QuantityCard.tsx"), /const CURRENCY_OPTIONS = SUPPORTED_CURRENCIES;/, "the Quantity dropdown is that list");
});

test("amounts show the SAR code with two decimals, whatever the project's country", async () => {
  const d = await load("/src/utils/currencyDisplay.ts");
  assert.equal(d.currencySymbol("SAR"), "SAR");
  assert.equal(d.formatMoney(1234.5, "SAR"), "SAR 1,234.50");
  assert.equal(d.formatMoney(0, "SAR"), "SAR 0.00");
  assert.equal(d.formatMoneyCompact(1_250_000, "SAR"), "SAR 1.25M");
});

test("a SAR line in an AED project is priced at the entered rate; the rate is entered 1 SAR = ? AED", async () => {
  const q = await load("/src/utils/quantityCalculations.ts");
  const d = await load("/src/utils/currencyDisplay.ts");
  const item = { id: "q", description: "Study", woQty: 3, invoiceQty: 0, uom: "DAY", unitRate: 1000, currency: "SAR", exchangeRate: 1.0204 };
  const priced = q.recalcQuantityItem(item, "SAR", 1.0204, "AED");
  assert.equal(priced.currency, "SAR");
  assert.equal(Math.round(priced.woValueRegional * 100) / 100, 3061.2);
  assert.equal(d.rateDirectionLabel("SAR", "AED", 0), "1 SAR = ? AED");
  const totals = q.calculateQuantity([priced], "SAR", 1.0204, false, "AED");
  assert.equal(Math.round(totals.workOrderValueRegional * 100) / 100, 3061.2);
});

test("amount in words: ISO code first, halalas as the minor unit", async () => {
  const { amountToCurrencyWords: words } = await load("/src/services/invoice/currencyWords.ts");
  assert.equal(words(1234.56, "SAR"), "SAR One Thousand Two Hundred Thirty Four and Fifty Six Halalas Only");
  assert.equal(words(10.01, "SAR"), "SAR Ten and One Halala Only");
  assert.equal(words(500, "SAR"), "SAR Five Hundred Only");
});

test("PDF import and the Excel template know SAR", () => {
  const config = src("services/pdfExtraction/ruleEngine/fieldMappingConfig.ts");
  assert.match(config, /enumOptions: \[[^\]]*"SAR"[^\]]*\]/);
  assert.match(config, /SAR: \/SAR\\s\?\[\\d,\]\//);
  const norm = src("services/pdfExtraction/ruleEngine/normalizer.ts");
  assert.match(norm, /"EUR", "SAR"(, "KWD")?\]\.includes\(trimmed\)/);
  assert.match(norm, /\\bSAR\\b\|SAUDI/);
  assert.match(src("services/projectWorkbookService.ts"), /const CURRENCIES = \[[^\]]*"SAR"[^\]]*\]/);
});
