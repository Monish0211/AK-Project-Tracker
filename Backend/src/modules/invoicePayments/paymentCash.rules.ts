import type { InvoiceCurrency } from "../invoices/invoiceCurrency.rules.js";
import { normalizeCurrency } from "../invoices/invoiceCurrency.rules.js";
import { decimalPlacesFor, decimalToMinor, floatToMinor } from "./money.rules.js";
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
}

export interface LineForFigures {
  id: string;
  status: string;
  invoiceAmountINR: number;
  invoiceAmountOriginal: number | null;
  currency: string;
  exchangeRateToINR: number;
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

/** Per-line figures for ONE invoice that has at least one active payment. `lines` are its non-cancelled lines. */
export function figuresForInvoice(lines: readonly LineForFigures[], active: readonly RecordedPayment[], gstMinor: bigint = 0n): Map<string, PaymentLineFigures> {
  const result = new Map<string, PaymentLineFigures>();
  if (lines.length === 0 || active.length === 0) return result;

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
