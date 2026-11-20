// "Amount Chargeable (in words)" on an invoice, in the invoice's own currency. INR keeps its Lakh / Crore wording byte for byte; every other currency is written in
// the international scale, led by its ISO code, with its own minor unit (OMR: 3 digits of Baisa) in the right number (one Cent, two Cents).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let words;
let indian;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  words = (await vite.ssrLoadModule("/src/services/invoice/currencyWords.ts")).amountToCurrencyWords;
  indian = (await vite.ssrLoadModule("/src/services/invoice/numberToWords.ts")).numberToIndianWords;
});
after(() => vite?.close());

test("INR is exactly the existing Indian wording for any amount", () => {
  for (const amount of [0, 0.5, 1, 1234.5, 99999.99, 100000, 1234567.89, 12345678.9]) {
    assert.equal(words(amount, "INR"), indian(amount), `INR ${amount}`);
  }
  assert.match(words(100000, "INR"), /Lakh/);
});

test("the six regional invoice examples read in their own currency", () => {
  assert.equal(words(231, "OMR"), "OMR Two Hundred Thirty One Only");
  assert.equal(words(4200, "MYR"), "MYR Four Thousand Two Hundred Only");
  assert.equal(words(1200, "AED"), "AED One Thousand Two Hundred Only");
  assert.equal(words(3670, "AED"), "AED Three Thousand Six Hundred Seventy Only");
  assert.equal(words(3640, "QAR"), "QAR Three Thousand Six Hundred Forty Only");
  assert.equal(words(3950, "EUR"), "EUR Three Thousand Nine Hundred Fifty Only");
  assert.equal(words(1000, "USD"), "USD One Thousand Only");
});

test("OMR carries three digits of Baisa; the other currencies two", () => {
  assert.equal(words(123.456, "OMR"), "OMR One Hundred Twenty Three and Four Hundred Fifty Six Baisa Only");
  assert.equal(words(0.005, "OMR"), "OMR Zero and Five Baisa Only");
  assert.equal(words(0.015, "OMR"), "OMR Zero and Fifteen Baisa Only");
  assert.equal(words(1.1, "OMR"), "OMR One and One Hundred Baisa Only");
  assert.equal(words(1234.34, "USD"), "USD One Thousand Two Hundred Thirty Four and Thirty Four Cents Only");
  assert.equal(words(10.5, "MYR"), "MYR Ten and Fifty Sen Only");
  assert.equal(words(1200.25, "AED"), "AED One Thousand Two Hundred and Twenty Five Fils Only");
});

test("exactly one minor unit is singular; Fils, Sen and Baisa do not change", () => {
  assert.equal(words(1.01, "USD"), "USD One and One Cent Only");
  assert.equal(words(1.01, "EUR"), "EUR One and One Cent Only");
  assert.equal(words(1.01, "QAR"), "QAR One and One Dirham Only");
  assert.equal(words(1.02, "QAR"), "QAR One and Two Dirhams Only");
  assert.equal(words(1.01, "AED"), "AED One and One Fils Only");
  assert.equal(words(1.01, "MYR"), "MYR One and One Sen Only");
  assert.equal(words(1.001, "OMR"), "OMR One and One Baisa Only");
});

test("QAR and AED stay distinguishable: both are led by their ISO code, so a Qatari amount can never read as a UAE one", () => {
  const qar = words(1000.5, "QAR");
  const aed = words(1000.5, "AED");
  assert.ok(qar.startsWith("QAR "));
  assert.ok(aed.startsWith("AED "));
  assert.notEqual(qar, aed);
  assert.match(qar, /Dirhams Only$/);
  assert.match(aed, /Fils Only$/);
});

test("large and zero amounts, no float surprises", () => {
  assert.equal(words(0, "OMR"), "OMR Zero Only");
  assert.equal(words(1000000, "AED"), "AED One Million Only");
  assert.equal(words(1234567.89, "QAR"), "QAR One Million Two Hundred Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Dirhams Only");
  assert.equal(words(1.005, "USD"), "USD One and One Cent Only", "1.005 x 100 is 100.49999999999999 in a float: it must still be read as one cent, never as zero");
  assert.equal(words(Number.NaN, "OMR"), "OMR Zero Only");
});
