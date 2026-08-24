import assert from "node:assert/strict";
import { test } from "node:test";
import { computeInvoiceProgress } from "./quantityProgress.js";

/**
 * P2-10 — computeInvoiceProgress() is the single source of truth for
 * invoiceQty/pendingQty, feeding both the Dashboard's completion-percentage
 * calculation and the Quantity module's own pending-amount display. It has
 * one deliberate special case (LUMP SUM's pending ceiling is always 1, never
 * the item's woQty) that had zero test coverage anywhere before this file —
 * a regression here would silently misstate completion % / pending value
 * for every LUMP SUM line item in the system.
 */

test("P2-10 — computeInvoiceProgress: normal (non-LUMP SUM) quantity items", () => {
  // Partial billing.
  assert.deepEqual(computeInvoiceProgress(100, "NOS", 40), { invoiceQty: 40, pendingQty: 60 });

  // Fully billed — pendingQty hits exactly 0.
  assert.deepEqual(computeInvoiceProgress(100, "NOS", 100), { invoiceQty: 100, pendingQty: 0 });

  // Nothing billed yet.
  assert.deepEqual(computeInvoiceProgress(100, "NOS", 0), { invoiceQty: 0, pendingQty: 100 });

  // Over-billed (e.g. a rate/quantity correction after the fact) — pendingQty
  // clamps at 0, never goes negative.
  assert.deepEqual(computeInvoiceProgress(100, "NOS", 130), { invoiceQty: 130, pendingQty: 0 });

  // Zero-woQty edge case.
  assert.deepEqual(computeInvoiceProgress(0, "NOS", 0), { invoiceQty: 0, pendingQty: 0 });
});

test("P2-10 — computeInvoiceProgress: LUMP SUM ceiling is always 1, never woQty", () => {
  // Not yet billed at all — pending is 1 (fully pending), regardless of woQty.
  assert.deepEqual(computeInvoiceProgress(500, "LUMP SUM", 0), { invoiceQty: 0, pendingQty: 1 });

  // Partially billed (e.g. 0.5 of the lump sum invoiced) — pending is the
  // remainder toward 1, NOT toward woQty (500).
  assert.deepEqual(computeInvoiceProgress(500, "LUMP SUM", 0.5), { invoiceQty: 0.5, pendingQty: 0.5 });

  // Fully billed — pending is exactly 0.
  assert.deepEqual(computeInvoiceProgress(500, "LUMP SUM", 1), { invoiceQty: 1, pendingQty: 0 });

  // Billed value can exceed 1 in raw quantityBilled terms in principle —
  // pending must still clamp at 0, not go negative.
  assert.deepEqual(computeInvoiceProgress(500, "LUMP SUM", 1.2), { invoiceQty: 1.2, pendingQty: 0 });

  // UOM matching is case/whitespace-insensitive, matching the source's own
  // .trim().toUpperCase() comparison.
  assert.deepEqual(computeInvoiceProgress(500, "lump sum", 0), { invoiceQty: 0, pendingQty: 1 });
  assert.deepEqual(computeInvoiceProgress(500, "  Lump Sum  ", 0), { invoiceQty: 0, pendingQty: 1 });

  // Proves the LUMP SUM branch is genuinely distinct from the normal branch:
  // the SAME (woQty, billedQty) pair produces a completely different
  // pendingQty depending on UOM alone.
  const normal = computeInvoiceProgress(500, "NOS", 0);
  const lumpSum = computeInvoiceProgress(500, "LUMP SUM", 0);
  assert.equal(normal.pendingQty, 500);
  assert.equal(lumpSum.pendingQty, 1);
});
