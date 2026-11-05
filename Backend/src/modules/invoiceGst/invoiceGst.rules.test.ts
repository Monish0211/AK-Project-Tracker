import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertDeclaredGstMatches,
  computeGstTaxLikeScreen,
  computeSnapshotAmounts,
  isGstEligible,
  isRaisedStatus,
  normalizeRate,
  roundLikeScreen,
  settingsForNewSnapshot,
} from "./invoiceGst.rules.js";
import type { GstSettings } from "./invoiceGst.rules.js";

/**
 * Invoice-level GST snapshot - pure rules. The rounding contract (confirmed decision): the saved GST must equal what the invoice screen and
 * printout show, so the server uses the screen's own floating-point arithmetic ONCE and works in exact integer paise from then on.
 */

const money = (minor: bigint) => (Number(minor) / 100).toFixed(2);
const applicable = (ratePercent: number, taxType: "IGST" | "CGST_SGST"): GstSettings => ({ status: "APPLICABLE", ratePercent: normalizeRate(ratePercent), taxType, buyerStateKnown: true });

test("the mandatory example: taxable 90,000 at 18% is GST 16,200 and total 1,06,200 - as IGST and as CGST + SGST", () => {
  const igst = computeSnapshotAmounts(9000000n, applicable(18, "IGST"));
  assert.deepEqual([money(igst.taxableMinor), money(igst.igstMinor), money(igst.cgstMinor), money(igst.sgstMinor), money(igst.gstMinor), money(igst.totalMinor)], ["90000.00", "16200.00", "0.00", "0.00", "16200.00", "106200.00"]);
  const split = computeSnapshotAmounts(9000000n, applicable(18, "CGST_SGST"));
  assert.deepEqual([money(split.cgstMinor), money(split.sgstMinor), money(split.igstMinor), money(split.gstMinor), money(split.totalMinor)], ["8100.00", "8100.00", "0.00", "16200.00", "106200.00"]);
});

test("variable rates: 0, 5, 12, 18, 28 and a fractional 12.5 all follow the selected rate (nothing is hardcoded to 18)", () => {
  const expected: Array<[number, string, string]> = [[0, "0.00", "90000.00"], [5, "4500.00", "94500.00"], [12, "10800.00", "100800.00"], [18, "16200.00", "106200.00"], [28, "25200.00", "115200.00"], [12.5, "11250.00", "101250.00"]];
  for (const [rate, gst, total] of expected) {
    const a = computeSnapshotAmounts(9000000n, applicable(rate, "IGST"));
    assert.deepEqual([money(a.gstMinor), money(a.totalMinor)], [gst, total], `rate ${rate}`);
  }
});

test("NOT_APPLICABLE carries no tax at all, and an APPLICABLE snapshot at 0% is a different, explicit state", () => {
  const none = computeSnapshotAmounts(12345600n, { status: "NOT_APPLICABLE", ratePercent: null, taxType: null, buyerStateKnown: false });
  assert.deepEqual([none.gstMinor, none.cgstMinor, none.sgstMinor, none.igstMinor, none.totalMinor], [0n, 0n, 0n, 0n, 12345600n]);
  const zeroRated = computeSnapshotAmounts(12345600n, applicable(0, "IGST"));
  assert.deepEqual([zeroRated.gstMinor, zeroRated.totalMinor], [0n, 12345600n]);
  // the two are told apart by their settings, never by their amounts
  assert.equal(normalizeRate(0), "0.0000");
  assert.notDeepEqual({ status: "NOT_APPLICABLE", rate: null }, { status: "APPLICABLE", rate: normalizeRate(0) });
});

test("rounding edge cases reproduce the SCREEN exactly, half-paisa values included (parity, not exact decimal half-up)", () => {
  const screen = (taxable: number, rate: number, igst: boolean) => computeGstTaxLikeScreen(taxable, rate, igst);
  // Verified against the browser formula: these differ from exact decimal half-up on purpose - the saved GST must match the printed GST.
  assert.equal(screen(0.7, 5, true).igst, 0.03, "0.7 x 5% = 0.035 -> the doubles give 3.4999..., so the screen shows 0.03");
  assert.equal(screen(2.9, 5, true).igst, 0.14);
  assert.equal(screen(42.3, 5, true).igst, 2.11);
  // true half-paisa ties that the doubles round up, exactly as the screen does
  assert.equal(screen(0.25, 18, true).igst, 0.05, "0.045 -> 0.05");
  assert.equal(screen(100.25, 18, true).igst, 18.04);
  // CGST + SGST rounds each half separately (the screen does), so it can differ by a paisa from IGST for the same invoice
  const split = screen(0.25, 18, false);
  assert.deepEqual([split.cgst, split.sgst, split.totalTax], [0.02, 0.02, 0.04]);
  assert.equal(screen(0.25, 18, true).totalTax, 0.05);
  // and the server applies exactly these figures, converted to exact paise
  const a = computeSnapshotAmounts(7n, applicable(5, "IGST")); // 0.07 x 5%
  assert.equal(a.gstMinor, BigInt(Math.round(roundLikeScreen(0.07 * (5 / 100)) * 100)));
  const b = computeSnapshotAmounts(70n, applicable(5, "IGST"));
  assert.equal(money(b.gstMinor), "0.03");
  assert.equal(money(b.totalMinor), "0.73");
});

test("parity over thousands of amounts: the server amounts equal the screen formula for every taxable / rate / tax type", () => {
  let state = 12345;
  const next = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 4000; i += 1) {
    const minor = BigInt(Math.floor(next() * 5_000_000_00) + 1);
    const rate = [0, 5, 12, 18, 28, 12.5, 0.25, 3][Math.floor(next() * 8)]!;
    const igst = next() < 0.5;
    const a = computeSnapshotAmounts(minor, applicable(rate, igst ? "IGST" : "CGST_SGST"));
    const screen = computeGstTaxLikeScreen(Number(minor) / 100, rate, igst);
    assert.equal(Number(a.gstMinor), Math.round(screen.totalTax * 100), `taxable ${minor} rate ${rate} igst ${igst}`);
    assert.equal(a.gstMinor, a.cgstMinor + a.sgstMinor + a.igstMinor, "components always add up exactly");
    assert.equal(a.totalMinor, a.taxableMinor + a.gstMinor, "total is exactly taxable + GST");
  }
});

test("the screen arithmetic this module mirrors has not been changed (source scan of the frontend)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "../../../../frontend/src/pages/Projects/components/Invoice/InvoiceCalculations.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.ok(source.includes("export const round = (value: number): number => Math.round(value * 100) / 100;"), "the screen's round() is the one this module copies");
  assert.ok(source.includes("const igst = round(subtotal * (ratePercent / 100));"));
  assert.ok(source.includes("const cgst = round(subtotal * (ratePercent / 200));"));
  assert.ok(source.includes("const sgst = round(subtotal * (ratePercent / 200));"));
  assert.ok(source.includes("return { cgst, sgst, igst: 0, totalTax: round(cgst + sgst) };"));
});

test("eligibility depends on the INVOICE currency only: INR yes, any foreign currency no - the project's Quantity-section GST switch is not consulted", () => {
  assert.equal(isGstEligible({ invoiceCurrency: "INR" }), true);
  for (const currency of ["USD", "EUR", "AED", "OMR"]) assert.equal(isGstEligible({ invoiceCurrency: currency }), false, currency);
});

test("new snapshot settings: the server decides currency eligibility; 'GST applies' needs an explicit rate and tax type (nothing assumed); 'no GST' and no declaration both record NO GST", () => {
  // not eligible -> NOT_APPLICABLE, with or without a declaration saying so; a claim that GST applies is refused
  assert.equal(settingsForNewSnapshot({ eligible: false, declaration: undefined }).status, "NOT_APPLICABLE");
  assert.equal(settingsForNewSnapshot({ eligible: false, declaration: { applicable: false } }).status, "NOT_APPLICABLE");
  assert.throws(() => settingsForNewSnapshot({ eligible: false, declaration: { applicable: true, ratePercent: 18, taxType: "IGST" } }), /cannot be applied/);
  // eligible: an explicit "no GST" (or no declaration at all) is NOT_APPLICABLE
  assert.equal(settingsForNewSnapshot({ eligible: true, declaration: undefined }).status, "NOT_APPLICABLE");
  assert.deepEqual(settingsForNewSnapshot({ eligible: true, declaration: { applicable: false } }), { status: "NOT_APPLICABLE", ratePercent: null, taxType: null, buyerStateKnown: false });
  assert.throws(() => settingsForNewSnapshot({ eligible: true, declaration: { applicable: true, ratePercent: 18 } }), /tax type/, "no tax type is silently assumed");
  assert.throws(() => settingsForNewSnapshot({ eligible: true, declaration: { applicable: true, taxType: "IGST" } }), /number/, "no rate is silently assumed");
  const ok = settingsForNewSnapshot({ eligible: true, declaration: { applicable: true, ratePercent: 0, taxType: "CGST_SGST", buyerStateKnown: false } });
  assert.deepEqual(ok, { status: "APPLICABLE", ratePercent: "0.0000", taxType: "CGST_SGST", buyerStateKnown: false });
});

test("rate validation: 0..100 with at most 4 decimals", () => {
  assert.equal(normalizeRate(18), "18.0000");
  assert.equal(normalizeRate(12.5), "12.5000");
  assert.equal(normalizeRate(0.0001), "0.0001");
  for (const bad of [-1, 100.01, 101, Number.NaN, Number.POSITIVE_INFINITY, 12.34567, "18" as unknown as number, null as unknown as number]) assert.throws(() => normalizeRate(bad), /GST rate/, String(bad));
});

test("a displayed GST amount that disagrees with the server's calculation is refused; one that agrees (or is not sent) is accepted", () => {
  const amounts = computeSnapshotAmounts(9000000n, applicable(18, "IGST"));
  assert.doesNotThrow(() => assertDeclaredGstMatches({ applicable: true, expectedGstAmount: 16200 }, amounts));
  assert.doesNotThrow(() => assertDeclaredGstMatches({ applicable: true }, amounts));
  assert.doesNotThrow(() => assertDeclaredGstMatches(undefined, amounts));
  assert.throws(() => assertDeclaredGstMatches({ applicable: true, expectedGstAmount: 16000 }, amounts), /does not match/);
});

test("only Raised, Partially Paid and Paid count as raised (a Draft and a Cancelled line do not)", () => {
  for (const s of ["Raised", "PartiallyPaid", "Paid"]) assert.equal(isRaisedStatus(s), true, s);
  for (const s of ["Draft", "Cancelled", "", "raised"]) assert.equal(isRaisedStatus(s), false, s);
});
