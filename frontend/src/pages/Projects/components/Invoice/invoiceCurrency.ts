import type { Project } from "../../../../types/Project";
import type { InvoiceCurrency, InvoiceLine } from "../../../../types/InvoiceItem";
import { formatIndianCurrency } from "../../../../utils/formatCurrency";
import { CURRENCY_MINOR_UNITS, SUPPORTED_CURRENCIES, isSupportedCurrency } from "../../../../constants/currencies";
import { formatMoney, regionalCurrencyOf, type RegionalCurrencyHolder } from "../../../../utils/currencyDisplay";
import { round } from "./InvoiceCalculations";

/**
 * Invoice Currency feature (Oct 2026) — frontend helpers. Mirrors
 * Backend/src/modules/invoices/invoiceCurrency.rules.ts; the backend is the
 * authority (it re-derives every INR equivalent and enforces the lock), so
 * everything here is UX only: defaults, display, and early validation.
 *
 * exchangeRateToINR = INR per ONE unit of the invoice currency (1 for INR).
 * invoiceAmountINR stays the INR-equivalent figure every existing total,
 * chart and KPI reads — nothing in this file changes what those sum.
 *
 * Multi-country (Nov 2026): a project whose own currency is not INR (Oman OMR, Malaysia MYR, UAE AED, Qatar QAR) invoices in ITS currency by default, needs no
 * rate for that, and needs the user's own rate for any other currency, always read as "1 unit of invoice currency = X units of PROJECT currency". For such a
 * project the invoice-currency / project-currency pair replaces INR in every rule below: "foreign" means "differs from the project currency", the converted
 * amount is in the project currency, and the in-memory fields invoiceAmountINR / exchangeRateToINR hold the project-currency amount and rate (see
 * InvoiceLine.projectCurrency). Every function takes the project currency as an OPTIONAL last argument that defaults to INR, so India is unchanged.
 */

/** Same seven codes, same order, as Quantity Details (constants/currencies.ts). */
export const INVOICE_CURRENCY_OPTIONS: readonly InvoiceCurrency[] = SUPPORTED_CURRENCIES;

/** "Foreign" = differs from the PROJECT's own currency (INR for India and every legacy project, so one-argument callers keep their meaning). */
export function isForeignCurrency(currency: InvoiceCurrency, projectCurrency: InvoiceCurrency = "INR"): boolean {
  return currency !== projectCurrency;
}

/** The currency a project's money is kept in: its stored regional currency, INR for India and legacy projects. */
export function projectCurrencyOf(project: RegionalCurrencyHolder | null | undefined): InvoiceCurrency {
  return normalizeInvoiceCurrency(regionalCurrencyOf(project));
}

/** The project currency a saved line belongs to (INR when the line carries none: India and legacy). */
export function getLineProjectCurrency(line: Pick<InvoiceLine, "projectCurrency">): InvoiceCurrency {
  return normalizeInvoiceCurrency(line.projectCurrency);
}

/** True when the line's invoice currency differs from its project's own currency. */
export function isForeignLine(line: Pick<InvoiceLine, "currency" | "projectCurrency">): boolean {
  return isForeignCurrency(normalizeInvoiceCurrency(line.currency), getLineProjectCurrency(line));
}

/** Legacy lines (no currency field) and any unexpected value are INR — never reinterpreted as a foreign currency. */
export function normalizeInvoiceCurrency(value: unknown): InvoiceCurrency {
  return isSupportedCurrency(value) ? value : "INR";
}

export function getLineCurrency(line: Pick<InvoiceLine, "currency">): InvoiceCurrency {
  return normalizeInvoiceCurrency(line.currency);
}

/** The amount in the line's own invoice currency — the INR amount for every INR/legacy line. */
export function getLineOriginalAmount(line: Pick<InvoiceLine, "currency" | "invoiceAmountOriginal" | "invoiceAmountINR" | "projectCurrency">): number {
  if (isForeignLine(line) && typeof line.invoiceAmountOriginal === "number") {
    return line.invoiceAmountOriginal;
  }
  return line.invoiceAmountINR;
}

/** Round an original amount to its currency's minor unit (3 dp for OMR, 2 for the rest). */
export function roundToMinorUnit(value: number, currency: InvoiceCurrency): number {
  const factor = 10 ** CURRENCY_MINOR_UNITS[currency];
  return Math.round(value * factor) / factor;
}

/** Money in the PROJECT currency rounded to that currency's minor unit: the long-standing 2-decimal round() for INR (India, unchanged), OMR to 3, the rest to 2. */
export function roundForProject(value: number, projectCurrency: InvoiceCurrency = "INR"): number {
  return projectCurrency === "INR" ? round(value) : roundToMinorUnit(value, projectCurrency);
}

/** e.g. "EUR 1,234.50", "OMR 12.345" — code first, so currencies are never confused with each other or with ₹. INR keeps the existing ₹ format. */
export function formatInvoiceMoney(value: number, currency: InvoiceCurrency): string {
  if (currency === "INR") return formatIndianCurrency(value);
  const digits = CURRENCY_MINOR_UNITS[currency];
  return `${currency} ${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** e.g. "EUR 1,000.00 (₹ 90,400.00 @ 90.4)" for a foreign line, plain "₹ 90,400.00" for INR. */
export function formatLineAmountWithEquivalent(line: InvoiceLine): string {
  const currency = getLineCurrency(line);
  const projectCurrency = getLineProjectCurrency(line);
  if (!isForeignLine(line)) return formatMoney(line.invoiceAmountINR, projectCurrency);
  // The equivalent is in the project currency (rupees for India, exactly as before), never a figure under another currency's symbol.
  return `${formatInvoiceMoney(getLineOriginalAmount(line), currency)} (${formatMoney(line.invoiceAmountINR, projectCurrency)} @ ${line.exchangeRateToINR ?? "-"})`;
}

/**
 * Whether the backend this frontend is talking to supports invoice currency
 * at all. A backend without the feature omits ProjectDto.invoiceCurrency
 * entirely (undefined), and would silently strip the currency fields and
 * store the line as INR — so foreign currencies are only ever offered once
 * the field is present (null or a value). Guards the deployment window
 * where this frontend is live before its backend.
 */
export function isInvoiceCurrencySupported(project: Pick<Project, "invoiceCurrency">): boolean {
  return project.invoiceCurrency !== undefined;
}

/** Same as the backend's resolveEffectiveLock(): persisted lock, else the currency of any line that ever left Draft (Cancelled included), else none. */
export function getProjectInvoiceCurrencyLock(project: Project): InvoiceCurrency | null {
  if (isSupportedCurrency(project.invoiceCurrency)) return project.invoiceCurrency;
  for (const item of project.invoiceItems ?? []) {
    for (const line of item.invoices ?? []) {
      if (line.status !== "Draft") return getLineCurrency(line);
    }
  }
  return null;
}

/** The currency/rate an existing invoice (invoiceNo) was raised in — every line of one invoice shares them. Null for a brand-new invoice. */
export function getInvoiceCycleCurrency(project: Project, invoiceNo: string): { currency: InvoiceCurrency; exchangeRateToINR: number } | null {
  for (const item of project.invoiceItems ?? []) {
    const line = (item.invoices ?? []).find((l) => l.invoiceNo === invoiceNo);
    if (line) return { currency: getLineCurrency(line), exchangeRateToINR: line.exchangeRateToINR ?? 1 };
  }
  return null;
}

/**
 * Rate prefill for a new invoice in `currency`. Only ever the project's own
 * current exchange rate, and only when the project's Quantity Details
 * currency IS that same currency — a USD project's rate is never reused for
 * EUR/AED/etc. Otherwise blank, so Accounts must enter one. Never fetched
 * or invented.
 */
export function getDefaultRateFor(project: Project, currency: InvoiceCurrency): string {
  const projectCurrency = projectCurrencyOf(project);
  if (!isForeignCurrency(currency, projectCurrency)) return "";
  // A project in another country never has its commercial Work Order rate dropped silently into an invoice: the invoice's rate is its own, typed by the user
  // (getRateSuggestion() offers the Work Order rate as a clearly labelled, optional suggestion instead).
  if (projectCurrency !== "INR") return "";
  if (project.currency === currency && Number.isFinite(project.currentExchangeRate) && project.currentExchangeRate > 0) {
    return String(project.currentExchangeRate);
  }
  return "";
}

/**
 * A suggestion only, for a project in another country: its commercial Work Order rate, when the Work Order currency is the invoice currency
 * ("1 USD = 3.64 QAR"). The form shows it as a labelled hint with a button; it is never applied by itself, and never exists for India (which keeps its own prefill).
 */
export function getRateSuggestion(project: Project, currency: InvoiceCurrency): { rate: number; basis: string } | null {
  const projectCurrency = projectCurrencyOf(project);
  if (projectCurrency === "INR" || !isForeignCurrency(currency, projectCurrency)) return null;
  if (project.currency !== currency || !Number.isFinite(project.currentExchangeRate) || project.currentExchangeRate <= 0) return null;
  return { rate: project.currentExchangeRate, basis: `Work Order rate: 1 ${currency} = ${project.currentExchangeRate} ${projectCurrency}` };
}

/** "Exchange Rate (1 USD = X OMR)" for a project in another country, the long-standing "(1 USD = ₹)" for India and legacy projects. */
export function exchangeRateLabel(currency: InvoiceCurrency, projectCurrency: InvoiceCurrency = "INR"): string {
  return projectCurrency === "INR" ? `Exchange Rate (1 ${currency} = ₹)` : `Exchange Rate (1 ${currency} = X ${projectCurrency})`;
}

/** A plain decimal number as typed (e.g. "83", "83.25", ".5") — rejects "1e3", "0x10", "83,25" and other forms Number() would quietly reinterpret. */
const RATE_PATTERN = /^(\d+(\.\d*)?|\.\d+)$/;
/** Same scale as the backend's invoiceProjectCurrency.rules.ts RATE_SCALE. */
const RATE_DECIMALS = 8;

/**
 * The currency + rate an invoice form STARTS with each time it is opened
 * (the form remounts per open, so nothing carries over from a previous one):
 * - an invoice that already has saved lines: their currency and rate;
 * - otherwise: the project's current lock (or INR when unlocked — e.g. after
 *   the invoice that established a lock was deleted and the backend
 *   released it), with a rate prefilled only per getDefaultRateFor().
 */
export function getInitialCurrencySelection(project: Project, invoiceNo: string): { currency: InvoiceCurrency; rateInput: string } {
  const existing = getInvoiceCycleCurrency(project, invoiceNo);
  if (existing) {
    return {
      currency: existing.currency,
      rateInput: isForeignCurrency(existing.currency, projectCurrencyOf(project)) ? String(existing.exchangeRateToINR) : "",
    };
  }
  // A new invoice starts in the project's own currency (INR for India and legacy projects) unless the project is already locked to another.
  const currency = getProjectInvoiceCurrencyLock(project) ?? projectCurrencyOf(project);
  return { currency, rateInput: getDefaultRateFor(project, currency) };
}

/**
 * Null when valid; otherwise a user-facing message. INR never needs a rate
 * (always 1). Accounts enters the rate; no per-currency range is imposed
 * (confirmed Oct 2026) — same rule as the backend's assertValidForeignRate():
 * only blank, non-numeric, zero, negative and non-finite rates are rejected.
 */
export function validateExchangeRate(currency: InvoiceCurrency, rateInput: string, projectCurrency: InvoiceCurrency = "INR"): string | null {
  if (!isForeignCurrency(currency, projectCurrency)) return null;
  const trimmed = rateInput.trim();
  if (trimmed === "") return projectCurrency === "INR" ? `Enter the ${currency} to INR exchange rate.` : `Enter the exchange rate for this invoice: 1 ${currency} = ? ${projectCurrency}.`;
  const rate = Number(trimmed);
  if (!RATE_PATTERN.test(trimmed) || !Number.isFinite(rate) || rate <= 0) return "Exchange rate must be a number greater than 0.";
  // The server keeps a rate of another country's project to 8 decimals, exactly: it refuses more rather than round, so the form says so up front.
  if (projectCurrency !== "INR" && (trimmed.split(".")[1] ?? "").length > RATE_DECIMALS) return `Exchange rate can have at most ${RATE_DECIMALS} decimal places.`;
  return null;
}

export interface InvoiceCurrencySelection {
  currency: InvoiceCurrency;
  /**
   * Only meaningful for a foreign currency once validateExchangeRate() passed; 1 for the project's own currency. The rate to the PROJECT currency: INR per unit
   * for India and legacy projects (the name's original meaning), project-currency per unit for a project in another country.
   */
  exchangeRateToINR: number;
  /** The project's own currency; absent means INR (India and legacy projects). */
  projectCurrency?: InvoiceCurrency;
  /** The rate exactly as typed, for the exact decimal conversion of a project in another country. Absent: derived from the number. */
  exchangeRateText?: string;
}

type LineCurrencyFields = Pick<InvoiceLine, "currency" | "exchangeRateToINR" | "invoiceAmountOriginal" | "invoiceAmountINR"> & Pick<Partial<InvoiceLine>, "projectCurrency">;

function selectionProjectCurrency(selection: InvoiceCurrencySelection): InvoiceCurrency {
  return selection.projectCurrency ?? "INR";
}

/** A number written without an exponent, with exactly `places` decimals - the string form the exact decimal maths below reads. */
function plainFixed(value: number, places: number): string {
  return (Number.isFinite(value) ? value : 0).toFixed(places);
}

function decimalToScaled(text: string, places: number): bigint {
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const scaled = BigInt(whole || "0") * 10n ** BigInt(places) + BigInt((fraction + "0".repeat(places)).slice(0, places) || "0");
  return negative ? -scaled : scaled;
}

function scaledToNumber(value: bigint, places: number): number {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(places + 1, "0");
  const text = places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
  return Number(negative ? `-${text}` : text);
}

/**
 * Original (invoice-currency) amount -> project-currency amount, for a project in another country: exact integer maths with ONE half-up rounding to the project
 * currency's minor unit - the same formula as the backend's convertMinor(), so what the form shows is what the server saves. The rate is read from its typed text
 * (never from a binary float), which the form limits to 8 decimals.
 */
export function convertToProjectCurrency(original: number, selection: InvoiceCurrencySelection): number {
  const projectCurrency = selectionProjectCurrency(selection);
  if (selection.currency === projectCurrency) return roundToMinorUnit(original, projectCurrency);
  const fromDecimals = CURRENCY_MINOR_UNITS[selection.currency];
  const toDecimals = CURRENCY_MINOR_UNITS[projectCurrency];
  const rateText = selection.exchangeRateText && RATE_PATTERN.test(selection.exchangeRateText.trim()) ? selection.exchangeRateText.trim() : plainFixed(selection.exchangeRateToINR, RATE_DECIMALS);
  const fromMinor = decimalToScaled(plainFixed(roundToMinorUnit(original, selection.currency), fromDecimals), fromDecimals);
  const rate = decimalToScaled(rateText, RATE_DECIMALS);
  const denominator = 10n ** BigInt(fromDecimals + RATE_DECIMALS);
  const numerator = fromMinor * rate * 10n ** BigInt(toDecimals);
  const half = denominator / 2n;
  const toMinor = numerator >= 0n ? (numerator + half) / denominator : -((-numerator + half) / denominator);
  return scaledToNumber(toMinor, toDecimals);
}

/** An amount ENTERED in the invoice currency: INR equivalent = round2(original x rate) — the exact formula the backend re-derives and checks. */
export function amountsFromOriginal(original: number, selection: InvoiceCurrencySelection): LineCurrencyFields {
  const projectCurrency = selectionProjectCurrency(selection);
  if (projectCurrency !== "INR") {
    // A project in another country: the amount converts to ITS currency at the invoice's own rate; the project-currency figure is carried under the historic
    // invoiceAmountINR name (see InvoiceLine.projectCurrency) and nothing is ever expressed in rupees.
    const amount = roundToMinorUnit(original, selection.currency);
    const same = selection.currency === projectCurrency;
    return {
      currency: selection.currency,
      exchangeRateToINR: same ? 1 : selection.exchangeRateToINR,
      invoiceAmountOriginal: amount,
      invoiceAmountINR: convertToProjectCurrency(amount, selection),
      projectCurrency,
    };
  }
  if (!isForeignCurrency(selection.currency)) {
    return { currency: "INR", exchangeRateToINR: 1, invoiceAmountOriginal: original, invoiceAmountINR: original };
  }
  const amount = roundToMinorUnit(original, selection.currency);
  return {
    currency: selection.currency,
    exchangeRateToINR: selection.exchangeRateToINR,
    invoiceAmountOriginal: amount,
    invoiceAmountINR: round(amount * selection.exchangeRateToINR),
  };
}

/**
 * Totals for a set of lines each derived via amountsFromInr() — exactly what
 * those lines will be saved with: `original` in the invoice currency (to its
 * own precision — OMR keeps 3 decimals) and `inr`, the saved INR equivalent
 * (sum of each line's own INR, never the total re-converted).
 */
export function sumAmountsFromInr(inrValues: number[], selection: InvoiceCurrencySelection): { original: number; inr: number } {
  let original = 0;
  let inr = 0;
  for (const value of inrValues) {
    const line = amountsFromInr(value, selection);
    original += line.invoiceAmountOriginal ?? 0;
    inr += line.invoiceAmountINR ?? 0;
  }
  const projectCurrency = selectionProjectCurrency(selection);
  return { original: roundToMinorUnit(original, selection.currency), inr: projectCurrency === "INR" ? round(inr) : roundToMinorUnit(inr, projectCurrency) };
}

/**
 * An amount DERIVED from an INR value the workspace computed (qty x rate,
 * or a milestone % of contract value). The original amount is floored to
 * its currency's minor unit so its INR equivalent never exceeds the INR
 * value it came from — otherwise billing an activity's full remaining
 * balance could round a few paise over its Work Order Value and be
 * rejected by the backend's ceiling check.
 */
export function amountsFromInr(inrValue: number, selection: InvoiceCurrencySelection): LineCurrencyFields {
  const projectCurrency = selectionProjectCurrency(selection);
  if (projectCurrency !== "INR") {
    // inrValue is already in the PROJECT currency (a quantity x rate or a milestone share of the contract value).
    if (selection.currency === projectCurrency) return amountsFromOriginal(inrValue, selection);
    const factor = 10 ** CURRENCY_MINOR_UNITS[selection.currency];
    let original = Math.floor((inrValue / selection.exchangeRateToINR) * factor + 1e-9) / factor;
    // never let the converted equivalent exceed the project-currency value it came from, whatever the float division said
    const step = 1 / factor;
    for (let guard = 0; guard < 3 && convertToProjectCurrency(original, selection) > inrValue + 1e-9 && original > 0; guard += 1) original = roundToMinorUnit(original - step, selection.currency);
    return amountsFromOriginal(original, selection);
  }
  if (!isForeignCurrency(selection.currency)) {
    return { currency: "INR", exchangeRateToINR: 1, invoiceAmountOriginal: inrValue, invoiceAmountINR: inrValue };
  }
  const factor = 10 ** CURRENCY_MINOR_UNITS[selection.currency];
  const original = Math.floor((inrValue / selection.exchangeRateToINR) * factor + 1e-9) / factor;
  return amountsFromOriginal(original, selection);
}
