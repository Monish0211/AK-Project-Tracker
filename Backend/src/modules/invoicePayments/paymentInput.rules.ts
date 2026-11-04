import { isDeductionCategory } from "./paymentSettlement.rules.js";
import type { DeductionCategory } from "./paymentSettlement.rules.js";
import { decimalPlacesFor, parseMoney } from "./money.rules.js";
import type { InvoiceCurrency } from "../invoices/invoiceCurrency.rules.js";

/**
 * Invoice Payment workflow — pure, DB-free validation of a payment submission. Turns the raw request into typed, exact
 * (minor-unit) values or a list of field errors. Currency-aware: INR/USD/AED/... allow 2 decimals, OMR 3; a value with more
 * decimals than the currency allows is an error, never rounded.
 *
 * NO FIELD IS MANDATORY: a blank payment date, reference, note, reason or amount is simply "not entered", and a deduction
 * entry without an amount records nothing and is not stored. Only what IS typed is checked. The one thing that cannot be left
 * out is every amount at once — a payment with no bank amount and no deduction records nothing.
 *
 * There is no GST anywhere in this workflow (no GST amount, GST received or GST TDS): any `gst` in a request is ignored.
 */

export const MAX_REFERENCE_LENGTH = 100;
export const MAX_TEXT_LENGTH = 500;
export const MAX_RECEIPTS = 10;
export const MAX_ADJUSTMENTS = 30;
export const MIN_PAYMENT_YEAR = 2000;

export interface FieldError {
  path: string;
  message: string;
}

export interface ParsedReceipt {
  /** Optional — null when the user left the payment date blank. */
  paymentDate: string | null;
  amountMinor: bigint;
  reference: string;
  notes: string | null;
}

export interface ParsedAdjustment {
  category: DeductionCategory;
  amountMinor: bigint;
  reason: string | null;
  expectedReleaseDate: string | null;
  reminderDate: string | null;
  exchangeRate: string | null;
  convertedAmount: string | null;
}

export interface ParsedPaymentInput {
  receipts: ParsedReceipt[];
  adjustments: ParsedAdjustment[];
}

export interface RawPaymentInput {
  currency?: unknown;
  receipts?: unknown;
  adjustments?: unknown;
}

const RATE_PATTERN = /^\d{1,6}(\.\d{1,6})?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date in strict YYYY-MM-DD form. */
export function isRealIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function amountMessage(label: string, currency: InvoiceCurrency): string {
  const places = decimalPlacesFor(currency);
  return `${label} must be a number with at most ${places} decimal place${places === 1 ? "" : "s"}.`;
}

export interface ParseContext {
  /** The invoice's own currency — the only currency a receipt may be in. */
  currency: InvoiceCurrency;
  /** Today in UTC as YYYY-MM-DD; a payment date later than tomorrow (time-zone allowance) is rejected. */
  todayIso: string;
}

function addDaysIso(iso: string, days: number): string {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Validates and converts a payment submission. Never throws: every problem becomes a field error. */
export function parsePaymentInput(raw: RawPaymentInput, ctx: ParseContext): { value: ParsedPaymentInput | null; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const { currency } = ctx;

  // Receipt currency must be the invoice currency.
  if (!isBlank(raw.currency) && text(raw.currency).toUpperCase() !== currency) {
    err("currency", `The receipt currency (${text(raw.currency).toUpperCase()}) must match the invoice currency (${currency}). Amounts are never converted.`);
  }

  // ── Receipts ─────────────────────────────────────────────────────────────────────────────────
  const receipts: ParsedReceipt[] = [];
  const receiptList = Array.isArray(raw.receipts) ? (raw.receipts as Record<string, unknown>[]) : null;
  if (receiptList === null && raw.receipts !== undefined && raw.receipts !== null) {
    err("receipts", "Receipts must be a list.");
  } else if (receiptList && receiptList.length > MAX_RECEIPTS) {
    err("receipts", `At most ${MAX_RECEIPTS} receipts can be recorded in one payment.`);
  } else {
    const latestDate = addDaysIso(ctx.todayIso, 1);
    (receiptList ?? []).forEach((entry, index) => {
      const at = (field: string) => `receipts.${index}.${field}`;
      const row = entry ?? {};

      const date = text(row.paymentDate);
      if (date !== "") {
        if (!isRealIsoDate(date) || Number(date.slice(0, 4)) < MIN_PAYMENT_YEAR) err(at("paymentDate"), "Enter a valid payment date.");
        else if (date > latestDate) err(at("paymentDate"), "Payment date cannot be in the future.");
      }

      let amountMinor = 0n;
      if (!isBlank(row.amountReceived)) {
        const parsed = parseMoney(row.amountReceived, currency);
        if (parsed === null) err(at("amountReceived"), amountMessage("Amount received", currency));
        else amountMinor = parsed;
      }

      const reference = text(row.reference);
      if (reference.length > MAX_REFERENCE_LENGTH) err(at("reference"), `Reference can be at most ${MAX_REFERENCE_LENGTH} characters.`);
      const notes = text(row.notes);
      if (notes.length > MAX_TEXT_LENGTH) err(at("notes"), `Notes can be at most ${MAX_TEXT_LENGTH} characters.`);

      // A receipt with no amount records nothing, so it is not stored.
      if (amountMinor > 0n) receipts.push({ paymentDate: date === "" ? null : date, amountMinor, reference, notes: notes === "" ? null : notes });
    });
  }

  // ── Deductions ───────────────────────────────────────────────────────────────────────────────
  const adjustments: ParsedAdjustment[] = [];
  const adjustmentList = raw.adjustments === undefined || raw.adjustments === null ? [] : Array.isArray(raw.adjustments) ? (raw.adjustments as Record<string, unknown>[]) : null;
  if (adjustmentList === null) {
    err("adjustments", "Deductions must be a list.");
  } else if (adjustmentList.length > MAX_ADJUSTMENTS) {
    err("adjustments", `At most ${MAX_ADJUSTMENTS} deduction entries can be recorded in one payment.`);
  } else {
    adjustmentList.forEach((entry, index) => {
      const at = (field: string) => `adjustments.${index}.${field}`;
      const row = entry ?? {};
      if (!isDeductionCategory(row.category)) {
        err(at("category"), "Unknown deduction category.");
        return;
      }
      const category = row.category;

      // An entry without an amount (blank or 0) records nothing and is not stored.
      let amountMinor = 0n;
      if (!isBlank(row.amount)) {
        const parsed = parseMoney(row.amount, currency);
        if (parsed === null) err(at("amount"), amountMessage("Amount", currency));
        else amountMinor = parsed;
      }

      const reason = text(row.reason);
      if (reason.length > MAX_TEXT_LENGTH) err(at("reason"), `Text can be at most ${MAX_TEXT_LENGTH} characters.`);

      // Expected Release Date / Reminder Date belong to Security Deposit and ISD only.
      const retained = category === "SECURITY_DEPOSIT" || category === "ISD";
      let expectedReleaseDate: string | null = null;
      let reminderDate: string | null = null;
      for (const [field, assign] of [
        ["expectedReleaseDate", (v: string) => (expectedReleaseDate = v)],
        ["reminderDate", (v: string) => (reminderDate = v)],
      ] as const) {
        const value = text(row[field]);
        if (value === "") continue;
        if (!retained) err(at(field), "This date applies to Security Deposit and ISD only.");
        else if (!isRealIsoDate(value) || Number(value.slice(0, 4)) < MIN_PAYMENT_YEAR) err(at(field), "Enter a valid date.");
        else assign(value);
      }

      // The optional Applicable exchange rate of a Foreign Exchange Loss (the INR reference rate); never part of settlement.
      let exchangeRate: string | null = null;
      if (!isBlank(row.exchangeRate)) {
        const rate = text(row.exchangeRate);
        if (category !== "FX_LOSS") err(at("exchangeRate"), "The exchange rate applies to Foreign Exchange Loss only.");
        else if (!RATE_PATTERN.test(rate) || Number(rate) <= 0) err(at("exchangeRate"), "Exchange rate must be a number greater than 0.");
        else exchangeRate = rate;
      }

      if (amountMinor > 0n) {
        adjustments.push({ category, amountMinor, reason: reason === "" ? null : reason, expectedReleaseDate, reminderDate, exchangeRate, convertedAmount: null });
      }
    });
  }

  // The one thing that cannot be left out: a payment with no amount at all (no bank amount, no deduction) records nothing.
  if (errors.length === 0 && receipts.length === 0 && adjustments.length === 0) {
    err("receipts", "Enter at least one amount (a bank amount received or a deduction) to record a payment.");
  }

  if (errors.length > 0) return { value: null, errors };
  return { value: { receipts, adjustments }, errors };
}
