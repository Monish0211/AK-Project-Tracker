import type { Project } from "../../../../types/Project";
import type { InvoiceCurrency, InvoiceLineStatus } from "../../../../types/InvoiceItem";
import { CURRENCY_MINOR_UNITS, isSupportedCurrency } from "../../../../constants/currencies";
import type { FieldErrorDto, PaymentSubmissionPayload } from "../../../../services/invoicePaymentService";
import { getInvoiceCycleStatus } from "./InvoiceCalculations";
import { getInvoiceCycleCurrency, getLineOriginalAmount, isForeignCurrency } from "./invoiceCurrency";

/**
 * Invoice Payment popup — pure logic: types, deduction categories, currency-aware input rules, the live settlement summary,
 * payload building, dirty detection and the read-only invoice context. No React, no network.
 *
 * THE RULE (the backend enforces it and is the authority on save; this file mirrors it only to keep the summary live):
 *   Total Settled = bank amount received + all deductions, in the invoice currency;  Outstanding = invoice amount - Total Settled
 *   nothing -> status unchanged | part -> Partially Paid | exact -> Paid | more -> refused.
 * Every deduction category counts, with no approval. There is no GST in this workflow.
 * Nothing is mandatory: a blank field is "not entered", an entry without an amount records nothing, and only what is typed is
 * checked. INR figures for a foreign invoice are display only and are never added to anything.
 */

export type DeductionCategory =
  | "TDS"
  | "SECURITY_DEPOSIT"
  | "ISD"
  | "OTHER_DEDUCTIONS"
  | "LD_AMOUNT"
  | "BANK_CHARGES"
  | "WITHHOLDING_TAXES"
  | "FX_LOSS"
  | "WAIVE_OFF";

/** plain = amount only, retained = amount + expected release date + reminder date (Security Deposit / ISD), fx = amount (+ optional INR reference rate). */
export type DeductionKind = "plain" | "retained" | "fx";

export interface DeductionCategoryConfig {
  value: DeductionCategory;
  /** Short label for the tab and the quick-view chip. */
  label: string;
  kind: DeductionKind;
  /** Label of the amount input inside the tab. */
  amountLabel: string;
}

/** The nine deduction types, in the order of the tabs. All of them count toward Total Settled. */
export const DEDUCTION_CATEGORIES: readonly DeductionCategoryConfig[] = [
  { value: "TDS", label: "TDS", kind: "plain", amountLabel: "TDS Amount" },
  { value: "SECURITY_DEPOSIT", label: "Security Deposit", kind: "retained", amountLabel: "Security Deposit Amount" },
  { value: "ISD", label: "ISD", kind: "retained", amountLabel: "ISD Amount" },
  { value: "OTHER_DEDUCTIONS", label: "Other Deduction", kind: "plain", amountLabel: "Other Deduction Amount" },
  { value: "LD_AMOUNT", label: "LD Amount", kind: "plain", amountLabel: "LD Amount" },
  { value: "BANK_CHARGES", label: "Bank Charges", kind: "plain", amountLabel: "Bank Charges Amount" },
  { value: "WITHHOLDING_TAXES", label: "Withholding Taxes", kind: "plain", amountLabel: "Withholding Taxes Amount" },
  { value: "FX_LOSS", label: "Foreign Exchange Loss", kind: "fx", amountLabel: "Foreign Exchange Loss Amount" },
  { value: "WAIVE_OFF", label: "Waive-off", kind: "plain", amountLabel: "Waive-off Amount" },
];

export function getDeductionCategory(value: DeductionCategory | string): DeductionCategoryConfig {
  return DEDUCTION_CATEGORIES.find((category) => category.value === value) ?? DEDUCTION_CATEGORIES[0]!;
}

/** The bank receipt, as typed. Every field is the raw input string so validation can report exactly what was entered. */
export interface ReceiptDraft {
  paymentDate: string;
  amountReceived: string;
  reference: string;
  notes: string;
}

/** One deduction, as typed. Fields that do not apply to the category stay empty and are ignored. */
export interface AdjustmentDraft {
  id: string;
  category: DeductionCategory;
  amount: string;
  expectedReleaseDate: string;
  reminderDate: string;
  /** Foreign Exchange Loss only: the optional Applicable exchange rate (INR per unit) used for the INR reference figures. */
  exchangeRate: string;
}

export interface PaymentDetailsDraft {
  receipt: ReceiptDraft;
  adjustments: AdjustmentDraft[];
}

export type ReceiptField = keyof ReceiptDraft;
export type AdjustmentField = "amount" | "expectedReleaseDate" | "reminderDate" | "exchangeRate";

export interface PaymentDetailsErrors {
  receipt: Partial<Record<ReceiptField, string>>;
  adjustments: Record<string, Partial<Record<AdjustmentField, string>>>;
  /** Messages that belong to no single field. */
  general: string[];
  hasErrors: boolean;
}

export const NO_ERRORS: PaymentDetailsErrors = { receipt: {}, adjustments: {}, general: [], hasErrors: false };

export const MAX_REFERENCE_LENGTH = 100;
export const MAX_TEXT_LENGTH = 500;
export const MIN_PAYMENT_YEAR = 2000;

export function createEmptyAdjustment(id: string, category: DeductionCategory): AdjustmentDraft {
  return { id, category, amount: "", expectedReleaseDate: "", reminderDate: "", exchangeRate: "" };
}

export function createInitialDraft(): PaymentDetailsDraft {
  return {
    receipt: { paymentDate: "", amountReceived: "", reference: "", notes: "" },
    adjustments: DEDUCTION_CATEGORIES.map((category, index) => createEmptyAdjustment(`adjustment-${index + 1}`, category.value)),
  };
}

/**
 * Checks whether a deduction has nothing typed. A Foreign Exchange Loss card holding ONLY an applicable exchange rate is also
 * "empty" as a deduction: that rate is then just the reference rate for the INR figures (see referenceRate()), not a deduction
 * to save — so typing it never forces an amount.
 */
export function isAdjustmentEmpty(entry: AdjustmentDraft): boolean {
  if (entry.category === "FX_LOSS" && entry.exchangeRate.trim() !== "" && entry.amount.trim() === "") return true;
  return entry.amount.trim() === "" && entry.expectedReleaseDate.trim() === "" && entry.reminderDate.trim() === "" && entry.exchangeRate.trim() === "";
}

// ---------------------------------------------------------------------------------------------------------------------
// Currency-aware input rules — the same as the backend's money.rules.ts
// ---------------------------------------------------------------------------------------------------------------------

/** INR/USD/EUR/AED/MYR/QAR = 2 decimals, OMR = 3. Anything unknown is treated as 2 (never wider than the backend allows). */
export function decimalPlacesFor(currency: string): number {
  return isSupportedCurrency(currency) ? CURRENCY_MINOR_UNITS[currency] : 2;
}

const RATE_PATTERN = /^\d{1,6}(\.\d{1,6})?$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A money amount as typed -> the normalized plain string the backend validates ("45,000.50" -> "45000.50"), or null when it
 * is not valid for this currency: digits only (thousands commas allowed), at most 12 integer digits and the currency's
 * decimals, no sign, no exponent. Nothing is rounded or truncated. Never converted to a number.
 */
export function normalizeMoney(input: string, currency: string): string | null {
  const cleaned = input.trim().replace(/,/g, "");
  const places = decimalPlacesFor(currency);
  return new RegExp(`^\\d{1,12}(\\.\\d{1,${places}})?$`).test(cleaned) ? cleaned : null;
}

export function isZeroMoney(normalized: string): boolean {
  return /^0+(\.0+)?$/.test(normalized);
}

export function moneyFormatHint(currency: string): string {
  return `at most ${decimalPlacesFor(currency)} decimal places`;
}

/** A normalized money string -> minor units (BigInt), exact. */
function toMinor(normalized: string, currency: string): bigint {
  const places = decimalPlacesFor(currency);
  const [whole = "0", fraction = ""] = normalized.split(".");
  return BigInt(whole + fraction.padEnd(places, "0"));
}

function fromMinor(minor: bigint, currency: string): string {
  const places = decimalPlacesFor(currency);
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString().padStart(places + 1, "0");
  const whole = digits.slice(0, digits.length - places);
  const fraction = digits.slice(digits.length - places);
  return `${negative ? "-" : ""}${whole}${places > 0 ? `.${fraction}` : ""}`;
}

/** A real calendar date in strict YYYY-MM-DD form with a 4-digit year (rejects 5-digit years and 31 Feb). */
export function isValidIsoDate(input: string): boolean {
  const match = ISO_DATE_PATTERN.exec(input.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < MIN_PAYMENT_YEAR) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export interface ValidationContext {
  currency: string;
  /** Today as YYYY-MM-DD (injected so the rule is testable). A payment date later than tomorrow is rejected, like the backend. */
  todayIso: string;
}

function addDaysIso(iso: string, days: number): string {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** True when the entry carries a positive, valid amount (the only kind that is saved). */
function hasPositiveAmount(entry: AdjustmentDraft, currency: string): boolean {
  const amount = normalizeMoney(entry.amount, currency);
  return amount !== null && !isZeroMoney(amount);
}

/**
 * Field-level validation with the backend's rules for the invoice currency. NOTHING is mandatory: only what is typed is checked.
 * The one thing that cannot be left out is every amount at once (no bank amount and no deduction records nothing); that is
 * reported through `general`. The backend validates again and is the authority.
 */
export function validatePaymentDetails(draft: PaymentDetailsDraft, ctx: ValidationContext): PaymentDetailsErrors {
  const errors: PaymentDetailsErrors = { receipt: {}, adjustments: {}, general: [], hasErrors: false };
  const amountMessage = (label: string) => `${label} must be a number with ${moneyFormatHint(ctx.currency)}.`;
  const failReceipt = (field: ReceiptField, message: string) => {
    errors.receipt[field] = message;
    errors.hasErrors = true;
  };
  const failAdjustment = (id: string, field: AdjustmentField, message: string) => {
    errors.adjustments[id] = { ...errors.adjustments[id], [field]: message };
    errors.hasErrors = true;
  };

  let hasAnAmount = false;
  const { receipt } = draft;
  const date = receipt.paymentDate.trim();
  if (date !== "") {
    if (!isValidIsoDate(date)) failReceipt("paymentDate", "Enter a valid payment date.");
    else if (date > addDaysIso(ctx.todayIso, 1)) failReceipt("paymentDate", "Payment date cannot be in the future.");
  }
  if (receipt.amountReceived.trim() !== "") {
    const cash = normalizeMoney(receipt.amountReceived, ctx.currency);
    if (cash === null) failReceipt("amountReceived", amountMessage("Amount received"));
    else if (!isZeroMoney(cash)) hasAnAmount = true;
  }
  if (receipt.reference.trim().length > MAX_REFERENCE_LENGTH) failReceipt("reference", `Reference can be at most ${MAX_REFERENCE_LENGTH} characters.`);
  if (receipt.notes.trim().length > MAX_TEXT_LENGTH) failReceipt("notes", `Notes can be at most ${MAX_TEXT_LENGTH} characters.`);

  for (const entry of draft.adjustments) {
    const config = getDeductionCategory(entry.category);
    const rate = entry.exchangeRate.trim();
    if (config.kind === "fx" && rate !== "" && (!RATE_PATTERN.test(rate) || Number(rate) <= 0)) {
      failAdjustment(entry.id, "exchangeRate", "Exchange rate must be a number greater than 0.");
    }
    if (entry.amount.trim() !== "") {
      if (normalizeMoney(entry.amount, ctx.currency) === null) failAdjustment(entry.id, "amount", amountMessage(config.amountLabel));
      else if (hasPositiveAmount(entry, ctx.currency)) hasAnAmount = true;
    }
    if (config.kind === "retained") {
      if (entry.expectedReleaseDate.trim() !== "" && !isValidIsoDate(entry.expectedReleaseDate)) failAdjustment(entry.id, "expectedReleaseDate", "Enter a valid date.");
      if (entry.reminderDate.trim() !== "" && !isValidIsoDate(entry.reminderDate)) failAdjustment(entry.id, "reminderDate", "Enter a valid date.");
    }
  }

  if (!hasAnAmount && !errors.hasErrors) {
    errors.general.push("Enter at least one amount (a bank amount received or a deduction) to record a payment.");
    errors.hasErrors = true;
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------------------------------
// Live settlement summary — the display the popup keeps current while typing. The backend recalculates on save.
// ---------------------------------------------------------------------------------------------------------------------

export type LiveOutcome = "NONE" | "PARTIAL" | "SETTLED" | "INVALID";

export interface LiveSummary {
  currency: string;
  invoiceAmount: string;
  previousBank: string;
  currentBank: string;
  totalBank: string;
  previousDeductions: string;
  currentDeductions: string;
  totalDeductions: string;
  /** Per category, previous + current (only categories with an amount). */
  deductionsByCategory: Array<{ category: DeductionCategory; amount: string }>;
  totalSettled: string;
  outstanding: string;
  outcome: LiveOutcome;
  /** "Paid" | "PartiallyPaid" | null (status unchanged). */
  resultingStatus: "Paid" | "PartiallyPaid" | null;
  /** Set when the outcome is INVALID: names the actual amounts and the currency. */
  excessMessage: string | null;
  /** True when something typed is not a valid amount for the currency (those amounts are ignored in the totals). */
  hasInputError: boolean;
}

/**
 * Total Settled = bank amount + deductions, exactly (BigInt minor units), in the invoice currency. `previous*` come from the
 * server (active payments only). An invalid typed amount counts as 0 here and is reported by validatePaymentDetails().
 */
export function computeLiveSummary(input: {
  currency: string;
  invoiceAmount: string;
  previousBank: string;
  previousDeductions: string;
  previousByCategory: ReadonlyArray<{ category: string; amount: string }>;
  draft: PaymentDetailsDraft;
}): LiveSummary {
  const { currency, draft } = input;
  const minor = (value: string): bigint => {
    const normalized = normalizeMoney(value, currency);
    return normalized === null ? 0n : toMinor(normalized, currency);
  };
  let hasInputError = false;
  const typed = (value: string): bigint => {
    if (value.trim() === "") return 0n;
    const normalized = normalizeMoney(value, currency);
    if (normalized === null) {
      hasInputError = true;
      return 0n;
    }
    return toMinor(normalized, currency);
  };

  const due = minor(input.invoiceAmount);
  const previousBank = minor(input.previousBank);
  const previousDeductions = minor(input.previousDeductions);
  const currentBank = typed(draft.receipt.amountReceived);

  const byCategory = new Map<DeductionCategory, bigint>();
  for (const entry of input.previousByCategory) byCategory.set(entry.category as DeductionCategory, (byCategory.get(entry.category as DeductionCategory) ?? 0n) + minor(entry.amount));
  let currentDeductions = 0n;
  for (const entry of draft.adjustments) {
    const amount = typed(entry.amount);
    if (amount > 0n) {
      currentDeductions += amount;
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0n) + amount);
    }
  }

  const totalBank = previousBank + currentBank;
  const totalDeductions = previousDeductions + currentDeductions;
  const settled = totalBank + totalDeductions;
  const outcome: LiveOutcome = settled > due ? "INVALID" : settled === 0n ? "NONE" : settled === due && due > 0n ? "SETTLED" : "PARTIAL";
  return {
    currency,
    invoiceAmount: fromMinor(due, currency),
    previousBank: fromMinor(previousBank, currency),
    currentBank: fromMinor(currentBank, currency),
    totalBank: fromMinor(totalBank, currency),
    previousDeductions: fromMinor(previousDeductions, currency),
    currentDeductions: fromMinor(currentDeductions, currency),
    totalDeductions: fromMinor(totalDeductions, currency),
    deductionsByCategory: DEDUCTION_CATEGORIES.filter((c) => (byCategory.get(c.value) ?? 0n) > 0n).map((c) => ({ category: c.value, amount: fromMinor(byCategory.get(c.value)!, currency) })),
    totalSettled: fromMinor(settled, currency),
    outstanding: fromMinor(settled >= due ? 0n : due - settled, currency),
    outcome,
    resultingStatus: outcome === "SETTLED" ? "Paid" : outcome === "PARTIAL" ? "PartiallyPaid" : null,
    excessMessage:
      outcome === "INVALID"
        ? `Bank amount ${currency} ${fromMinor(totalBank, currency)} + deductions ${currency} ${fromMinor(totalDeductions, currency)} = ${currency} ${fromMinor(settled, currency)}, which exceeds the invoice amount of ${currency} ${fromMinor(due, currency)} by ${currency} ${fromMinor(settled - due, currency)}.`
        : null,
    hasInputError,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// INR reference figures for foreign-currency invoices — INFORMATION ONLY
// ---------------------------------------------------------------------------------------------------------------------

/**
 * The rate used for the INR reference figures of a foreign-currency invoice (INR per ONE unit of the invoice currency): the
 * Applicable exchange rate typed on the Foreign Exchange Loss tab when it is a valid number, otherwise the rate recorded on the
 * invoice itself. No new input exists for it. It feeds DISPLAY only — settlement is always in the invoice currency.
 */
export function referenceRate(invoiceRate: string, draft: PaymentDetailsDraft): { rate: string; source: "applicable" | "invoice" } | null {
  const typed = draft.adjustments.find((a) => a.category === "FX_LOSS")?.exchangeRate.trim() ?? "";
  if (typed !== "" && RATE_PATTERN.test(typed) && Number(typed) > 0) return { rate: typed, source: "applicable" };
  const recorded = invoiceRate.trim();
  return /^\d+(\.\d+)?$/.test(recorded) && Number(recorded) > 0 ? { rate: recorded, source: "invoice" } : null;
}

/**
 * amount (a money string in `currency`) x rate (INR per unit) -> an INR string with 2 decimals, rounded half up. Exact: BigInt
 * arithmetic on the decimal strings, never a float. Null when the amount is blank / invalid for the currency or the rate is
 * unusable — nothing is guessed. Display only.
 */
export function inrEquivalent(amount: string, currency: string, rate: string): string | null {
  const normalized = normalizeMoney(amount, currency);
  const rateText = rate.trim();
  if (normalized === null || !/^\d+(\.\d+)?$/.test(rateText)) return null;
  const places = decimalPlacesFor(currency);
  const amountMinor = toMinor(normalized, currency);
  const [rateWhole = "0", rateFraction = ""] = rateText.split(".");
  const rateScaled = BigInt(rateWhole + rateFraction);
  if (rateScaled === 0n) return null;
  const divisor = 10n ** BigInt(places) * 10n ** BigInt(rateFraction.length);
  const numerator = amountMinor * rateScaled * 100n;
  const paise = (numerator * 2n + divisor) / (divisor * 2n);
  const text = paise.toString().padStart(3, "0");
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Payload and server errors
// ---------------------------------------------------------------------------------------------------------------------

export interface BuiltPayload {
  payload: PaymentSubmissionPayload;
  /** The draft id of each deduction that is sent, in payload order — the backend reports errors by index. */
  adjustmentIds: string[];
}

function clean(value: string): string {
  return value.trim();
}

/**
 * The exact request the backend validates: the bank receipt only when it carries an amount, and only deductions that carry a
 * positive amount (an entry without an amount records nothing). Amounts are normalized plain strings in the invoice currency.
 */
export function buildPaymentPayload(draft: PaymentDetailsDraft, input: { projectId: string; invoiceNo: string; currency: string }): BuiltPayload {
  const { currency } = input;
  const money = (value: string): string => normalizeMoney(value, currency) ?? clean(value);
  const { receipt } = draft;
  const bank = normalizeMoney(receipt.amountReceived, currency);
  const filled = draft.adjustments.filter((entry) => hasPositiveAmount(entry, currency));
  return {
    payload: {
      projectId: input.projectId,
      invoiceNo: input.invoiceNo,
      currency,
      receipts:
        bank !== null && !isZeroMoney(bank)
          ? [
              {
                ...(clean(receipt.paymentDate) !== "" && { paymentDate: clean(receipt.paymentDate) }),
                amountReceived: bank,
                ...(clean(receipt.reference) !== "" && { reference: clean(receipt.reference) }),
                ...(clean(receipt.notes) !== "" && { notes: clean(receipt.notes) }),
              },
            ]
          : [],
      adjustments: filled.map((entry) => {
        const kind = getDeductionCategory(entry.category).kind;
        return {
          category: entry.category,
          amount: money(entry.amount),
          ...(kind === "retained" && clean(entry.expectedReleaseDate) !== "" && { expectedReleaseDate: clean(entry.expectedReleaseDate) }),
          ...(kind === "retained" && clean(entry.reminderDate) !== "" && { reminderDate: clean(entry.reminderDate) }),
          ...(kind === "fx" && clean(entry.exchangeRate) !== "" && { exchangeRate: clean(entry.exchangeRate) }),
        };
      }),
    },
    adjustmentIds: filled.map((entry) => entry.id),
  };
}

/** Maps the backend's path-based field errors ("receipts.0.amountReceived", "adjustments.2.amount") onto the draft's fields. */
export function mapServerErrors(serverErrors: readonly FieldErrorDto[], built: Pick<BuiltPayload, "adjustmentIds">): PaymentDetailsErrors {
  const result: PaymentDetailsErrors = { receipt: {}, adjustments: {}, general: [], hasErrors: serverErrors.length > 0 };
  for (const error of serverErrors) {
    const parts = error.path.split(".");
    if (parts[0] === "receipts" && parts.length === 3) result.receipt[parts[2] as ReceiptField] = error.message;
    else if (parts[0] === "adjustments" && parts.length === 3) {
      const id = built.adjustmentIds[Number(parts[1])];
      if (id) result.adjustments[id] = { ...result.adjustments[id], [parts[2] as AdjustmentField]: error.message };
      else result.general.push(error.message);
    } else result.general.push(error.message);
  }
  return result;
}

export function countErrors(errors: PaymentDetailsErrors): number {
  return Object.keys(errors.receipt).length + Object.values(errors.adjustments).reduce((sum, fields) => sum + Object.keys(fields).length, 0) + errors.general.length;
}

// ---------------------------------------------------------------------------------------------------------------------
// Unsaved changes, double-click protection, idempotency
// ---------------------------------------------------------------------------------------------------------------------

/** True when anything differs from the starting draft — closing then asks for confirmation instead of silently discarding. */
export function isDraftDirty(current: PaymentDetailsDraft, baseline: PaymentDetailsDraft): boolean {
  const norm = (d: PaymentDetailsDraft) =>
    JSON.stringify({
      receipt: Object.fromEntries(Object.entries(d.receipt).map(([k, v]) => [k, String(v).trim()])),
      adjustments: d.adjustments.map((a) => Object.fromEntries(Object.entries(a).filter(([k]) => k !== "id").map(([k, v]) => [k, String(v).trim()]))),
    });
  return norm(current) !== norm(baseline);
}

/** Lets exactly one save run at a time; a second click while one is in flight is refused. */
export function createSaveGuard() {
  let busy = false;
  return {
    tryEnter(): boolean {
      if (busy) return false;
      busy = true;
      return true;
    },
    leave(): void {
      busy = false;
    },
    isBusy: () => busy,
  };
}

/** One identifier per Save attempt: the backend returns the stored payment for a repeat of the same one. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------------------------------------------------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-29" -> "29 Oct 2026". Returns the input unchanged when it is not a valid ISO date (never throws). */
export function formatReviewDate(iso: string): string {
  const trimmed = iso.trim();
  if (!isValidIsoDate(trimmed)) return trimmed;
  const [year, month, day] = trimmed.split("-");
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`;
}

function groupInteger(digits: string, indian: boolean): string {
  if (!indian || digits.length <= 3) return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${rest},${last3}`;
}

/**
 * An exact decimal STRING ("45000.00", "125.125") -> display text in the invoice's own currency, grouped:
 * "₹45,000.00", "USD 1,000.00", "OMR 125.125". Pure string work — never passes through a float, never converted.
 */
export function formatMoneyString(value: string, currency: string): string {
  const trimmed = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return trimmed;
  const [, sign = "", whole = "0", fraction] = match;
  const grouped = groupInteger(whole, currency === "INR");
  const body = `${sign}${grouped}${fraction !== undefined ? `.${fraction}` : ""}`;
  return currency === "INR" ? `₹${body}` : `${currency} ${body}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Invoice context (read-only, from the figures the existing screens already show)
// ---------------------------------------------------------------------------------------------------------------------

export interface InvoicePaymentContext {
  invoiceNo: string;
  invoiceDates: string[];
  prNo: string;
  client: string;
  projectTitle: string;
  /** The invoice's current status as the portal already shows it. */
  currentStatus: InvoiceLineStatus;
  lineCount: number;
  /** Sum of the non-Cancelled lines' invoice amounts, in INR — the figure Invoice Summary already shows. Display only. */
  valueInr: number;
  currency: InvoiceCurrency;
  /** Only for a foreign-currency invoice: billed total in that currency and the rate recorded on the invoice. */
  foreign: { total: number; rate: number | null } | null;
}

/** Collects the invoice figures the popup shows immediately (before the server's own figures arrive). */
export function buildInvoicePaymentContext(project: Project, invoiceNo: string): InvoicePaymentContext {
  const lines = (project.invoiceItems ?? []).flatMap((item) => (item.invoices ?? []).filter((line) => line.invoiceNo === invoiceNo && line.status !== "Cancelled"));
  const valueInr = lines.reduce((sum, line) => sum + line.invoiceAmountINR, 0);
  const cycleCurrency = getInvoiceCycleCurrency(project, invoiceNo);
  const currency: InvoiceCurrency = cycleCurrency?.currency ?? "INR";
  const firstLine = lines[0];
  const foreign =
    firstLine && isForeignCurrency(currency)
      ? { total: lines.reduce((sum, line) => sum + getLineOriginalAmount(line), 0), rate: cycleCurrency?.exchangeRateToINR ?? null }
      : null;
  const dates = Array.from(new Set(lines.map((line) => line.invoiceDate).filter((date) => Boolean(date)))).sort();
  return {
    invoiceNo,
    invoiceDates: dates,
    prNo: project.prNo,
    client: project.client,
    projectTitle: project.projectTitle,
    currentStatus: getInvoiceCycleStatus(project, invoiceNo),
    lineCount: lines.length,
    valueInr,
    currency,
    foreign,
  };
}

/**
 * True when the invoice has a RECORDED payment (the server marks every line of such an invoice with its recorded cash). Such an
 * invoice cannot leave Paid / Partially Paid, be cancelled or go back to Draft until the payment is reversed in the popup.
 */
export function invoiceHasRecordedPayment(project: Project, invoiceNo: string): boolean {
  return (project.invoiceItems ?? []).some((item) =>
    (item.invoices ?? []).some((line) => line.invoiceNo === invoiceNo && line.status !== "Cancelled" && typeof line.recordedCashINR === "number")
  );
}
