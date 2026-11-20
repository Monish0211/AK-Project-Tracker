import type { InvoiceCurrency } from "../invoices/invoiceCurrency.rules.js";
import { normalizeCurrency } from "../invoices/invoiceCurrency.rules.js";
import { decimalPlacesFor, decimalToMinor, floatToMinor } from "./money.rules.js";
import { convertMinor, minorToNumber, parseExchangeRate } from "../invoices/invoiceProjectCurrency.rules.js";
import { computeSettlement, isDeductionCategory } from "./paymentSettlement.rules.js";
import type { SettlementAdjustment, SettlementReceipt, SettlementResult } from "./paymentSettlement.rules.js";

/**
 * Invoice Payment workflow — pure rules that turn recorded payments into the figures the Dashboard, Reports and Edit
 * Project's Commercial Summary need, per invoice LINE (those screens all aggregate lines):
 *
 *   recordedCashINR — the ACTUAL bank cash recorded against the line (never a deduction), in INR. A foreign receipt is
 *                     converted at the invoice's OWN recorded rate — the same rate its INR invoice amount was derived with —
 *                     so no new conversion rate is introduced.
 *   settledINR      — what is settled on the line: bank cash plus every deduction (all categories count). This is what
 *                     reduces "Outstanding".
 *
 * The invoice-level figures are allocated to its lines in proportion to each line's INR amount. Lines of an invoice that has
 * no recorded payment are not in the result at all: consumers fall back to the long-standing status-based figures for them
 * (a legacy Paid line counts its full invoice amount, exactly as before).
 */

export interface PaymentLineFigures {
  recordedCashINR: number;
  settledINR: number;
  /**
   * Multi-country invoice currency (Phase 5): for a line on a NON-INR project the same two figures in the PROJECT currency (the invoice-currency payments
   * converted at the invoice's own saved rate). Absent for an INR / legacy project; recordedCashINR / settledINR are 0 for such a regional line.
   */
  recordedCashProject?: number;
  settledProject?: number;
}

export interface LineForFigures {
  id: string;
  status: string;
  invoiceAmountINR: number;
  invoiceAmountOriginal: number | null;
  currency: string;
  exchangeRateToINR: number;
  /** Phase 5: set only on a line of a non-INR project. A Prisma Decimal or a number both satisfy these shapes. */
  projectCurrency?: string | null | undefined;
  exchangeRateToProject?: { toString(): string } | null | undefined;
  invoiceAmountProject?: { toFixed(places: number): string } | null | undefined;
}

/** The recorded-payment data the settlement needs, in the shape Prisma returns it (Decimal columns exposed as `toFixed`). */
export interface RecordedPayment {
  receipts: Array<{ amountReceived: { toFixed(places: number): string } }>;
  adjustments: Array<{ category: string; amount: { toFixed(places: number): string } }>;
}

export interface CandidateRecords {
  receipts: SettlementReceipt[];
  adjustments: SettlementAdjustment[];
}

/**
 * THE settlement of an invoice from what is recorded (and optionally one more payment being validated). Used by the payment
 * service AND by the figures below, so they can never disagree. A row whose category is no longer part of the workflow (the
 * removed GST TDS) is ignored.
 */
export function settlementFromRecords(input: {
  currency: InvoiceCurrency;
  dueMinor: bigint;
  active: readonly RecordedPayment[];
  candidate?: CandidateRecords;
}): SettlementResult {
  const { currency, active, candidate } = input;
  const receipts: SettlementReceipt[] = active.flatMap((payment) => payment.receipts.map((receipt) => ({ amountMinor: decimalToMinor(receipt.amountReceived, currency) })));
  const adjustments: SettlementAdjustment[] = active.flatMap((payment) =>
    payment.adjustments.filter((entry) => isDeductionCategory(entry.category)).map((entry) => ({ category: entry.category as SettlementAdjustment["category"], amountMinor: decimalToMinor(entry.amount, currency) }))
  );
  if (candidate) {
    receipts.push(...candidate.receipts);
    adjustments.push(...candidate.adjustments);
  }
  return computeSettlement({ currency, dueMinor: input.dueMinor, receipts, adjustments });
}

/** Invoice amount in the invoice currency's minor units, from the invoice's non-cancelled lines. */
export function baseDueOf(lines: readonly LineForFigures[], currency: InvoiceCurrency): bigint {
  return lines.reduce((sum, line) => sum + floatToMinor(line.invoiceAmountOriginal ?? line.invoiceAmountINR, currency), 0n);
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Phase 5: per-line figures for ONE invoice of a non-INR project, in the PROJECT currency. The settlement itself is unchanged (invoice currency, exact minor
 * units). Its cash and settled amounts are converted at the invoice's own saved rate with one half-up rounding, a fully settled invoice settles exactly its
 * project-currency amount, and the result is shared between lines by their project amounts, the last line taking the remainder, all in integer minor units.
 */
function figuresForProjectCurrencyInvoice(lines: readonly LineForFigures[], active: readonly RecordedPayment[], gstMinor: bigint): Map<string, PaymentLineFigures> {
  const result = new Map<string, PaymentLineFigures>();
  const first = lines[0]!;
  const currency = normalizeCurrency(first.currency);
  const projectCurrency = normalizeCurrency(first.projectCurrency ?? "INR");
  const rate = parseExchangeRate(String(first.exchangeRateToProject ?? "1"));
  const toProject = (minor: bigint): bigint => (currency === projectCurrency ? minor : convertMinor(minor, currency, projectCurrency, rate));

  const baseMinor = baseDueOf(lines, currency);
  const settlement = settlementFromRecords({ currency, dueMinor: baseMinor + gstMinor, active });
  const lineProjectMinor = lines.map((line) => decimalToMinor(line.invoiceAmountProject ?? { toFixed: (places: number) => (0).toFixed(places) }, projectCurrency));
  const totalProjectMinor = lineProjectMinor.reduce((sum, value) => sum + value, 0n);

  // Measured against the GST-inclusive target and then expressed ex-GST, exactly like the INR path (gstMinor is 0 for every regional invoice today).
  let cashInvoiceMinor = settlement.cashMinor;
  let settledInvoiceMinor = settlement.settledMinor;
  let fullySettled = settlement.settled;
  if (gstMinor > 0n) {
    const outstandingExGst = settlement.outstandingMinor < baseMinor ? settlement.outstandingMinor : baseMinor;
    settledInvoiceMinor = baseMinor - outstandingExGst;
    cashInvoiceMinor = settlement.cashMinor < settledInvoiceMinor ? settlement.cashMinor : settledInvoiceMinor;
    fullySettled = settledInvoiceMinor === baseMinor;
  }
  const cashProject = toProject(cashInvoiceMinor);
  const rawSettledProject = fullySettled ? totalProjectMinor : toProject(settledInvoiceMinor);
  const settledProject = rawSettledProject > totalProjectMinor ? totalProjectMinor : rawSettledProject;

  let allocatedCash = 0n;
  let allocatedSettled = 0n;
  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1;
    const own = lineProjectMinor[index]!;
    const share = (value: bigint): bigint => (totalProjectMinor > 0n ? (value * own * 2n + totalProjectMinor) / (2n * totalProjectMinor) : value / BigInt(lines.length));
    const cash = isLast ? cashProject - allocatedCash : share(cashProject);
    const settled = isLast ? settledProject - allocatedSettled : share(settledProject);
    allocatedCash += cash;
    allocatedSettled += settled;
    result.set(line.id, {
      recordedCashINR: 0,
      settledINR: 0,
      recordedCashProject: minorToNumber(cash < 0n ? 0n : cash, projectCurrency),
      settledProject: minorToNumber(settled < 0n ? 0n : settled, projectCurrency),
    });
  });
  return result;
}

/** Per-line figures for ONE invoice that has at least one active payment. `lines` are its non-cancelled lines. */
export function figuresForInvoice(lines: readonly LineForFigures[], active: readonly RecordedPayment[], gstMinor: bigint = 0n): Map<string, PaymentLineFigures> {
  const result = new Map<string, PaymentLineFigures>();
  if (lines.length === 0 || active.length === 0) return result;
  // A line of a non-INR project is allocated in the PROJECT currency (exact integer maths); the INR path below is untouched.
  if (lines[0]!.projectCurrency && lines[0]!.projectCurrency !== "INR") return figuresForProjectCurrencyInvoice(lines, active, gstMinor);

  const currency = normalizeCurrency(lines[0]!.currency);
  // GST (Nov 2026): an invoice with a saved GST snapshot is settled against taxable + GST, but the dashboard / report definitions stay EX-GST
  // (confirmed decision). So the settlement is measured against the GST-inclusive target and then expressed ex-GST WITHOUT any proportional split:
  //   outstanding (ex-GST) = min(taxable, the invoice's real outstanding);  settled (ex-GST) = taxable - that;  cash (ex-GST) = min(cash, settled).
  // A fully settled invoice therefore reads fully settled, and a part-paid one never reads as fully settled just because the receipt exceeded its taxable
  // amount. gstMinor is 0 for every legacy / NOT_APPLICABLE / 0% invoice, which leaves the original arithmetic below untouched.
  const baseMinor = baseDueOf(lines, currency);
  const settlement = settlementFromRecords({ currency, dueMinor: baseMinor + gstMinor, active });

  const rate = lines[0]!.exchangeRateToINR || 1;
  const scale = 10 ** decimalPlacesFor(currency);
  const invoiceTotalInr = lines.reduce((sum, line) => sum + line.invoiceAmountINR, 0);
  let cashInr: number;
  let settledInr: number;
  if (gstMinor > 0n) {
    const outstandingExGstMinor = settlement.outstandingMinor < baseMinor ? settlement.outstandingMinor : baseMinor;
    const settledExGstMinor = baseMinor - outstandingExGstMinor;
    const cashExGstMinor = settlement.cashMinor < settledExGstMinor ? settlement.cashMinor : settledExGstMinor;
    cashInr = round2((Number(cashExGstMinor) / scale) * rate);
    settledInr = settledExGstMinor === baseMinor ? invoiceTotalInr : Math.min(invoiceTotalInr, round2((Number(settledExGstMinor) / scale) * rate));
  } else {
    cashInr = round2((Number(settlement.cashMinor) / scale) * rate);
    // A fully settled invoice settles its exact INR amount (no rounding drift between the two conversions); otherwise cash + deductions.
    settledInr = settlement.settled ? invoiceTotalInr : Math.min(invoiceTotalInr, round2((Number(settlement.settledMinor) / scale) * rate));
  }

  let allocatedCash = 0;
  let allocatedSettled = 0;
  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1;
    const share = invoiceTotalInr > 0 ? line.invoiceAmountINR / invoiceTotalInr : 1 / lines.length;
    const cash = isLast ? round2(cashInr - allocatedCash) : round2(cashInr * share);
    const settled = isLast ? round2(settledInr - allocatedSettled) : round2(settledInr * share);
    allocatedCash += cash;
    allocatedSettled += settled;
    result.set(line.id, { recordedCashINR: Math.max(0, cash), settledINR: Math.max(0, settled) });
  });
  return result;
}
