import assert from "node:assert/strict";
import { test } from "node:test";
import { changedInvoiceContentFields, type StoredInvoiceLineContent } from "./invoiceEditPermission.rules.js";

/** Invoice Edit/Delete approval rights (Oct 2026) — DB-free tests for the content-vs-status rule. */

const stored: StoredInvoiceLineContent = {
  invoiceNo: "TALLY/24-25/0001",
  invoiceDate: new Date("2026-03-01T00:00:00.000Z"),
  milestoneId: null,
  milestoneName: null,
  setIndex: null,
  description: "Basic Engineering",
  quantityBilled: 2,
  invoiceAmountINR: 1000.5,
  invoiceAmountOriginal: 1000.5,
  currency: "INR",
  exchangeRateToINR: 1,
  clientReference: null,
  remarks: "",
};

// Exactly what the frontend re-sends for an untouched line (toInvoiceLinePayload()).
const fullResend = {
  invoiceNo: "TALLY/24-25/0001",
  invoiceDate: new Date("2026-03-01"),
  milestoneId: null,
  milestoneName: null,
  setIndex: null,
  description: "Basic Engineering",
  quantityBilled: 2,
  invoiceAmountINR: 1000.5,
  clientReference: null,
  remarks: null,
};

test("an unchanged full re-send (e.g. a status-only update from Invoice History) is NOT a content edit", () => {
  assert.deepEqual(changedInvoiceContentFields(stored, fullResend), []);
  assert.deepEqual(changedInvoiceContentFields(stored, {}), [], "absent fields are never changes");
});

test("formatting-only differences are not edits: same calendar day, outer spaces, '' vs null, sub-paisa float noise", () => {
  assert.deepEqual(
    changedInvoiceContentFields(stored, {
      invoiceNo: "  TALLY/24-25/0001 ",
      invoiceDate: new Date("2026-03-01T15:30:00.000Z"),
      description: " Basic Engineering ",
      remarks: null,
      clientReference: "",
      invoiceAmountINR: 1000.5000000001,
    }),
    []
  );
});

test("every content field is detected when it genuinely changes", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["invoiceNo", { invoiceNo: "TALLY/24-25/0002" }],
    ["invoiceDate", { invoiceDate: new Date("2026-03-02") }],
    ["milestoneId", { milestoneId: "m-1" }],
    ["milestoneName", { milestoneName: "Advance" }],
    ["setIndex", { setIndex: 2 }],
    ["description", { description: "Detail Engineering" }],
    ["quantityBilled", { quantityBilled: 3 }],
    ["invoiceAmountINR", { invoiceAmountINR: 1000.51 }],
    ["invoiceAmountOriginal", { invoiceAmountOriginal: 999 }],
    ["currency", { currency: "USD" }],
    ["exchangeRateToINR", { exchangeRateToINR: 83 }],
    ["clientReference", { clientReference: "PO-77" }],
    ["remarks", { remarks: "changed" }],
  ];
  for (const [field, input] of cases) {
    assert.deepEqual(changedInvoiceContentFields(stored, { ...fullResend, ...input }), [field], field);
  }
});

test("status is never part of the content check", () => {
  assert.deepEqual(changedInvoiceContentFields(stored, { ...fullResend, status: "Cancelled" } as never), []);
});
