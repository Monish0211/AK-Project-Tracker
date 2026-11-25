import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../../shared/utils/AppError.js";
import { CURRENCY_MINOR_UNITS, INVOICE_CURRENCIES, isSupportedInvoiceCurrency } from "../invoices/invoiceCurrency.rules.js";
import { CURRENCY_OPTIONS } from "../pdfImport/validators/enumOptions.js";
import { QUANTITY_CURRENCIES, assertQuantityCurrency, computeQuantityAmounts } from "./quantityCurrency.rules.js";

/** SAR (Saudi Riyal, Nov 2026): a Quantity / invoice currency like the others, 2 decimals, priced against the project's regional currency by a manual rate. */

const refused = (fn: () => void, part: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof AppError && e.statusCode === 400 && part.test(e.message));

test("SAR is supported everywhere the currency lists are shared, with 2 decimals", () => {
  assert.ok(isSupportedInvoiceCurrency("SAR"));
  assert.ok((QUANTITY_CURRENCIES as readonly string[]).includes("SAR"));
  assert.deepEqual([...CURRENCY_OPTIONS], [...INVOICE_CURRENCIES], "PDF import offers the same list");
  assert.equal(CURRENCY_MINOR_UNITS.SAR, 2);
  assert.ok(!isSupportedInvoiceCurrency("sar"), "codes are exact");
});

test("a SAR line needs an exchange rate to the regional currency, and 1 is refused, in every country", () => {
  for (const regional of ["INR", "AED", "OMR", "QAR", "MYR"]) {
    assert.doesNotThrow(() => assertQuantityCurrency("SAR", 1.02, regional), regional);
    refused(() => assertQuantityCurrency("SAR", 1, regional), /rate of exactly 1 is not accepted for SAR/);
    refused(() => assertQuantityCurrency("SAR", 0, regional), /Enter the exchange rate: 1 SAR = \? /);
  }
  assert.doesNotThrow(() => assertQuantityCurrency("SAR", 1, "SAR"), "a project already in SAR needs no rate");
  assert.doesNotThrow(() => assertQuantityCurrency("SAR", 1, null), "a legacy project is not validated more strictly than before");
});

test("pricing: SAR is converted into the regional currency at the entered rate; INR projects keep their rupee columns", () => {
  const line = { woQty: 3, uom: "DAY", currency: "SAR", unitRate: 1000, exchangeRate: 1.0204 };
  const aed = computeQuantityAmounts(line, "AED");
  assert.deepEqual([aed.exchangeRate, aed.unitRateRegional, aed.woValueRegional, aed.woValue], [1.0204, 1020.4, 3061.2, 0]);
  const lump = computeQuantityAmounts({ ...line, uom: "LUMP SUM" }, "AED");
  assert.equal(lump.woValueRegional, 1020.4, "a lump sum is not multiplied by the quantity");
  const inr = computeQuantityAmounts({ ...line, exchangeRate: 22.2 }, "INR");
  assert.deepEqual([inr.unitRateINR, inr.woValue, inr.woValueRegional], [22200, 66600, 66600]);
  const sar = computeQuantityAmounts({ ...line, exchangeRate: 7 }, "SAR");
  assert.deepEqual([sar.exchangeRate, sar.woValueRegional], [1, 3000], "in the regional currency itself the rate is always 1");
});
