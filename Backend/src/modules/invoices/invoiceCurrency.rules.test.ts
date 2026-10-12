import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../../shared/utils/AppError.js";
import { CURRENCY_OPTIONS } from "../pdfImport/validators/enumOptions.js";
import { formatInvoiceAmountForEmail } from "../../shared/email/templates/invoiceAmount.format.js";
import {
  CURRENCY_MINOR_UNITS,
  INVOICE_CURRENCIES,
  evaluateCurrencyLock,
  isCurrencyLockingStatus,
  normalizeCurrency,
  resolveCreateAmounts,
  resolveEffectiveLock,
  resolveUpdateAmounts,
} from "./invoiceCurrency.rules.js";

/** Invoice Currency feature (Oct 2026) — DB-free unit tests for invoiceCurrency.rules.ts. */

const FOREIGN = ["USD", "EUR", "AED", "MYR", "QAR", "OMR"] as const;
/** Realistic INR-per-unit rates, only used as test inputs. */
const SAMPLE_RATES: Record<(typeof FOREIGN)[number], number> = {
  USD: 83.25,
  EUR: 90.4,
  AED: 22.67,
  MYR: 18.95,
  QAR: 22.87,
  OMR: 216.35,
};

function assertAppError(fn: () => unknown, status: number, messagePart?: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof AppError, "expected an AppError");
    assert.equal(error.statusCode, status);
    if (messagePart) assert.match(error.message, new RegExp(messagePart));
    return true;
  });
}

test("supported invoice currencies are exactly Quantity Details' seven, in the same order", () => {
  assert.deepEqual([...INVOICE_CURRENCIES], [...CURRENCY_OPTIONS]);
  assert.deepEqual([...INVOICE_CURRENCIES], ["INR", "USD", "EUR", "AED", "MYR", "QAR", "OMR"]);
  assert.equal(CURRENCY_MINOR_UNITS.OMR, 3);
});

test("resolveCreateAmounts: a legacy caller (no currency fields) is INR, rate 1, original === INR amount", () => {
  assert.deepEqual(resolveCreateAmounts({ invoiceAmountINR: 10_000 }), {
    currency: "INR",
    exchangeRateToINR: 1,
    invoiceAmountOriginal: 10_000,
    invoiceAmountINR: 10_000,
  });
});

test("resolveCreateAmounts: explicit INR with consistent fields is accepted; inconsistent INR fields are rejected", () => {
  assert.deepEqual(
    resolveCreateAmounts({ currency: "INR", exchangeRateToINR: 1, invoiceAmountOriginal: 500, invoiceAmountINR: 500 }),
    { currency: "INR", exchangeRateToINR: 1, invoiceAmountOriginal: 500, invoiceAmountINR: 500 }
  );
  assertAppError(() => resolveCreateAmounts({ currency: "INR", exchangeRateToINR: 83, invoiceAmountINR: 500 }), 400, "rate of 1");
  assertAppError(() => resolveCreateAmounts({ currency: "INR", invoiceAmountOriginal: 6, invoiceAmountINR: 500 }), 400);
  assertAppError(() => resolveCreateAmounts({ currency: "INR" }), 400, "required");
});

test("resolveCreateAmounts: every foreign currency derives INR = round2(original x rate) server-side", () => {
  for (const currency of FOREIGN) {
    const rate = SAMPLE_RATES[currency];
    const original = currency === "OMR" ? 1234.567 : 1234.56;
    const result = resolveCreateAmounts({ currency, exchangeRateToINR: rate, invoiceAmountOriginal: original });
    assert.equal(result.currency, currency);
    assert.equal(result.exchangeRateToINR, rate);
    assert.equal(result.invoiceAmountOriginal, original);
    assert.equal(result.invoiceAmountINR, Math.round(original * rate * 100) / 100, `${currency} INR equivalent`);
  }
  // Exact known values.
  assert.equal(resolveCreateAmounts({ currency: "USD", exchangeRateToINR: 83.25, invoiceAmountOriginal: 1000.5 }).invoiceAmountINR, 83291.63);
  assert.equal(resolveCreateAmounts({ currency: "OMR", exchangeRateToINR: 216.35, invoiceAmountOriginal: 1.005 }).invoiceAmountINR, 217.43);
});

test("resolveCreateAmounts: minor units — OMR accepts 3 decimals; 2-decimal currencies reject a 3rd", () => {
  assert.equal(resolveCreateAmounts({ currency: "OMR", exchangeRateToINR: 216, invoiceAmountOriginal: 10.125 }).invoiceAmountOriginal, 10.125);
  assertAppError(() => resolveCreateAmounts({ currency: "OMR", exchangeRateToINR: 216, invoiceAmountOriginal: 10.1255 }), 400, "3 decimal");
  for (const currency of ["USD", "EUR", "AED", "MYR", "QAR"] as const) {
    assertAppError(
      () => resolveCreateAmounts({ currency, exchangeRateToINR: SAMPLE_RATES[currency], invoiceAmountOriginal: 10.125 }),
      400,
      "2 decimal"
    );
  }
});

test("resolveCreateAmounts: every foreign currency rejects a missing, zero, negative or non-finite rate", () => {
  for (const currency of FOREIGN) {
    for (const rate of [undefined, 0, -83, -0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assertAppError(() => resolveCreateAmounts({ currency, exchangeRateToINR: rate, invoiceAmountOriginal: 100 }), 400);
    }
  }
});

test("resolveCreateAmounts: no per-currency rate range — any positive finite rate Accounts enters is accepted", () => {
  for (const currency of FOREIGN) {
    for (const rate of [0.012, 0.5, 1, 3.64, 999.99, 1000.01, 8300, 25_000]) {
      const result = resolveCreateAmounts({ currency, exchangeRateToINR: rate, invoiceAmountOriginal: 100 });
      assert.equal(result.exchangeRateToINR, rate, `${currency} @ ${rate} kept as entered`);
      assert.equal(result.invoiceAmountINR, Math.round(100 * rate * 100) / 100, `${currency} @ ${rate}: INR = original x rate`);
    }
  }
  // A product that overflows is still never recorded.
  assertAppError(() => resolveCreateAmounts({ currency: "USD", exchangeRateToINR: 1e308, invoiceAmountOriginal: 1e10 }), 400, "too large");
});

test("resolveCreateAmounts: unsupported codes, missing original amount and a mismatched client INR figure are rejected", () => {
  for (const code of ["GBP", "usd", "", "XYZ"]) {
    assertAppError(() => resolveCreateAmounts({ currency: code, exchangeRateToINR: 100, invoiceAmountOriginal: 1 }), 400, "Unsupported");
  }
  assertAppError(() => resolveCreateAmounts({ currency: "EUR", exchangeRateToINR: 90, invoiceAmountINR: 9000 }), 400, "EUR invoice amount");
  assertAppError(
    () => resolveCreateAmounts({ currency: "AED", exchangeRateToINR: 22.67, invoiceAmountOriginal: 100, invoiceAmountINR: 100 }),
    400,
    "does not match"
  );
});

const inrLine = { currency: "INR", exchangeRateToINR: 1, invoiceAmountINR: 10_000, invoiceAmountOriginal: 10_000 };
const usdLine = { currency: "USD", exchangeRateToINR: 83, invoiceAmountINR: 83_000, invoiceAmountOriginal: 1_000 };
const omrLine = { currency: "OMR", exchangeRateToINR: 216, invoiceAmountINR: 216_000, invoiceAmountOriginal: 1_000 };

test("resolveUpdateAmounts: INR line — status-only/no-amount PATCH writes nothing; an amount edit keeps original in step", () => {
  assert.deepEqual(resolveUpdateAmounts(inrLine, {}), {});
  assert.deepEqual(resolveUpdateAmounts(inrLine, { currency: "INR", exchangeRateToINR: 1 }), {});
  assert.deepEqual(resolveUpdateAmounts(inrLine, { invoiceAmountINR: 12_000 }), {
    invoiceAmountINR: 12_000,
    invoiceAmountOriginal: 12_000,
  });
  // A legacy row whose original was never set (null) still edits cleanly.
  assert.deepEqual(resolveUpdateAmounts({ ...inrLine, invoiceAmountOriginal: null }, { invoiceAmountINR: 9_000 }), {
    invoiceAmountINR: 9_000,
    invoiceAmountOriginal: 9_000,
  });
});

test("resolveUpdateAmounts: currency and rate are frozen after creation, for every currency", () => {
  assertAppError(() => resolveUpdateAmounts(inrLine, { currency: "USD" }), 400, "currency cannot be changed");
  assertAppError(() => resolveUpdateAmounts(inrLine, { exchangeRateToINR: 83 }), 400, "exchange rate cannot be changed");
  assertAppError(() => resolveUpdateAmounts(usdLine, { exchangeRateToINR: 84 }), 400, "exchange rate cannot be changed");
  assertAppError(() => resolveUpdateAmounts(usdLine, { currency: "EUR" }), 400, "currency cannot be changed");
  assertAppError(() => resolveUpdateAmounts(omrLine, { currency: "INR" }), 400, "currency cannot be changed");
});

test("resolveUpdateAmounts: foreign line — edit via original amount (INR recomputed at the recorded rate); direct INR edit rejected", () => {
  // The frontend resends its full payload (incl. the unchanged INR figure) on a status-only change — must be a no-op.
  assert.deepEqual(resolveUpdateAmounts(usdLine, { invoiceAmountINR: 83_000, currency: "USD", exchangeRateToINR: 83 }), {});
  assert.deepEqual(resolveUpdateAmounts(usdLine, { invoiceAmountOriginal: 1_200 }), {
    invoiceAmountINR: 99_600,
    invoiceAmountOriginal: 1_200,
  });
  assert.deepEqual(resolveUpdateAmounts(omrLine, { invoiceAmountOriginal: 10.125 }), {
    invoiceAmountINR: 2187,
    invoiceAmountOriginal: 10.125,
  });
  assertAppError(() => resolveUpdateAmounts(usdLine, { invoiceAmountOriginal: 10.125 }), 400, "2 decimal");
  assertAppError(() => resolveUpdateAmounts(usdLine, { invoiceAmountINR: 90_000 }), 400, "edited in USD");
  assertAppError(() => resolveUpdateAmounts(omrLine, { invoiceAmountINR: 1 }), 400, "edited in OMR");
  assertAppError(() => resolveUpdateAmounts(usdLine, { invoiceAmountOriginal: 1_200, invoiceAmountINR: 1_200 }), 400, "does not match");
});

test("resolveEffectiveLock: persisted lock wins; otherwise inferred from pre-feature non-Draft lines; otherwise none", () => {
  assert.equal(resolveEffectiveLock("EUR", ["INR"]), "EUR");
  assert.equal(resolveEffectiveLock(null, ["INR"]), "INR");
  assert.equal(resolveEffectiveLock(null, ["QAR"]), "QAR");
  assert.equal(resolveEffectiveLock(null, []), null);
});

test("evaluateCurrencyLock: first genuine invoice persists the lock; Draft/Cancelled never do; any other currency is 409", () => {
  for (const currency of INVOICE_CURRENCIES) {
    for (const status of ["Raised", "PartiallyPaid", "Paid"]) {
      assert.deepEqual(evaluateCurrencyLock({ effectiveLock: null, persistedLock: null, lineCurrency: currency, targetStatus: status }), {
        persistLock: currency,
      });
    }
    for (const status of ["Draft", "Cancelled"]) {
      assert.deepEqual(evaluateCurrencyLock({ effectiveLock: null, persistedLock: null, lineCurrency: currency, targetStatus: status }), {
        persistLock: null,
      });
    }
  }
  // Inferred (legacy) lock gets persisted on the next genuine invoice.
  assert.deepEqual(evaluateCurrencyLock({ effectiveLock: "INR", persistedLock: null, lineCurrency: "INR", targetStatus: "Raised" }), {
    persistLock: "INR",
  });
  // Already persisted — nothing more to write.
  assert.deepEqual(evaluateCurrencyLock({ effectiveLock: "MYR", persistedLock: "MYR", lineCurrency: "MYR", targetStatus: "Paid" }), {
    persistLock: null,
  });
  // Any status, Draft included, in another currency is rejected once locked — including foreign-vs-foreign.
  for (const [lock, line] of [["INR", "USD"], ["USD", "EUR"], ["OMR", "QAR"], ["AED", "INR"]] as const) {
    for (const status of ["Draft", "Raised", "Cancelled"]) {
      assertAppError(
        () => evaluateCurrencyLock({ effectiveLock: lock, persistedLock: lock, lineCurrency: line, targetStatus: status }),
        409,
        `locked to ${lock}`
      );
    }
  }
});

test("normalizeCurrency / isCurrencyLockingStatus: unknown or legacy values are INR, never a foreign currency", () => {
  assert.equal(normalizeCurrency(undefined), "INR");
  assert.equal(normalizeCurrency(null), "INR");
  assert.equal(normalizeCurrency("usd"), "INR");
  assert.equal(normalizeCurrency("GBP"), "INR");
  for (const currency of INVOICE_CURRENCIES) assert.equal(normalizeCurrency(currency), currency);
  assert.equal(isCurrencyLockingStatus("Draft"), false);
  assert.equal(isCurrencyLockingStatus("Cancelled"), false);
  assert.equal(isCurrencyLockingStatus("PartiallyPaid"), true);
});

test("formatInvoiceAmountForEmail: INR output is unchanged; each foreign currency shows its own code and decimals", () => {
  assert.equal(formatInvoiceAmountForEmail({ invoiceAmountINR: 10_000 }), `₹${(10_000).toLocaleString("en-IN")}`);
  assert.equal(formatInvoiceAmountForEmail({ invoiceAmountINR: 10_000, invoiceCurrency: "INR", invoiceAmountOriginal: 10_000 }), `₹${(10_000).toLocaleString("en-IN")}`);
  assert.match(formatInvoiceAmountForEmail({ invoiceAmountINR: 2187, invoiceCurrency: "OMR", invoiceAmountOriginal: 10.125, exchangeRateToINR: 216 }), /^OMR 10\.125 \(INR equivalent ₹2,187 at 216\)$/);
  assert.match(formatInvoiceAmountForEmail({ invoiceAmountINR: 9040, invoiceCurrency: "EUR", invoiceAmountOriginal: 100, exchangeRateToINR: 90.4 }), /^EUR 100\.00 /);
});

test("exchange-rate validation: the frontend imposes no per-currency range either (same rule as the backend)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const frontend = readFileSync(
    path.join(here, "../../../../frontend/src/pages/Projects/components/Invoice/invoiceCurrency.ts"),
    "utf8"
  );
  assert.doesNotMatch(frontend, /EXCHANGE_RATE_POLICY|rateBounds|must be between/, "no range table or range message left in the frontend");
  assert.match(frontend, /rate <= 0/, "the frontend still rejects zero/negative rates");
  assert.match(frontend, /Number\.isFinite\(rate\)/, "the frontend still rejects non-finite rates");
});
