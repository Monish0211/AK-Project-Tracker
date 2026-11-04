import type { InvoiceCurrency } from "../invoices/invoiceCurrency.rules.js";
import { formatMoney } from "./money.rules.js";

/**
 * Invoice Payment workflow — the settlement engine. Pure: no Prisma, no I/O, integer minor-unit arithmetic only (see
 * money.rules.ts), so every rule is unit-testable and the backend is the single authority on how settled an invoice is.
 *
 * THE RULE (confirmed by the business, Nov 2026)
 *   Total Settled = Actual Bank Amount Received + Total Deductions        (all in the invoice currency)
 *   Outstanding   = Invoice Amount - Total Settled
 *   nothing recorded                 -> the invoice keeps its status (Raised / Submitted)
 *   0 < Total Settled < Invoice Amount -> Partially Paid
 *   Total Settled = Invoice Amount     -> Paid
 *   Total Settled > Invoice Amount     -> rejected (never saved)
 *
 * Every deduction category counts, with no approval step: TDS, Security Deposit, ISD, Other Deduction, LD Amount, Bank
 * Charges, Withholding Taxes, Foreign Exchange Loss and Waive-off. GST does not exist in this workflow: there is no GST
 * amount, no GST receipt, no GST TDS and no GST component — the invoice amount is the one figure everything is settled against.
 * Amounts are always in the invoice currency; an INR figure shown for a foreign invoice is display only and never reaches here.
 */

export const DEDUCTION_CATEGORIES = [
  "TDS",
  "SECURITY_DEPOSIT",
  "ISD",
  "OTHER_DEDUCTIONS",
  "LD_AMOUNT",
  "BANK_CHARGES",
  "WITHHOLDING_TAXES",
  "FX_LOSS",
  "WAIVE_OFF",
] as const;
export type DeductionCategory = (typeof DEDUCTION_CATEGORIES)[number];

export function isDeductionCategory(value: unknown): value is DeductionCategory {
  return typeof value === "string" && (DEDUCTION_CATEGORIES as readonly string[]).includes(value);
}

export interface SettlementReceipt {
  /** Bank receipt toward the invoice amount, in the invoice currency. */
  amountMinor: bigint;
}

export interface SettlementAdjustment {
  category: DeductionCategory;
  amountMinor: bigint;
}

export interface SettlementInput {
  currency: InvoiceCurrency;
  /** The invoice amount in the invoice currency (the existing invoice record's amount). */
  dueMinor: bigint;
  /** Every receipt of every ACTIVE (not reversed) payment of the invoice, including the one being validated. */
  receipts: readonly SettlementReceipt[];
  adjustments: readonly SettlementAdjustment[];
}

export type ViolationCode = "OVER_SETTLED";

export interface Violation {
  code: ViolationCode;
  message: string;
}

export interface CategoryTotal {
  category: DeductionCategory;
  amountMinor: bigint;
}

/** NONE = nothing recorded, PARTIAL = settled part of the invoice, SETTLED = exactly the invoice amount, INVALID = more than the invoice amount. */
export type SettlementOutcome = "NONE" | "PARTIAL" | "SETTLED" | "INVALID";

export interface SettlementResult {
  currency: InvoiceCurrency;
  dueMinor: bigint;
  /** Actual bank cash — always reported separately from deductions. */
  cashMinor: bigint;
  deductionsMinor: bigint;
  deductionsByCategory: CategoryTotal[];
  settledMinor: bigint;
  /** Invoice amount - total settled (0 when fully settled; 0 when over-settled, which is a violation). */
  outstandingMinor: bigint;
  outcome: SettlementOutcome;
  /** True only for an exact, valid, full settlement. */
  settled: boolean;
  /** Rules that make this combination invalid. A non-empty list means the payment must be refused. */
  violations: Violation[];
}

/** Computes the settlement of one invoice from everything recorded against it. Never throws for business reasons — it reports them. */
export function computeSettlement(input: SettlementInput): SettlementResult {
  const { currency, dueMinor } = input;
  const cashMinor = input.receipts.reduce((sum, receipt) => sum + receipt.amountMinor, 0n);

  const totals = new Map<DeductionCategory, bigint>();
  for (const entry of input.adjustments) totals.set(entry.category, (totals.get(entry.category) ?? 0n) + entry.amountMinor);
  const deductionsByCategory = DEDUCTION_CATEGORIES.filter((category) => totals.has(category)).map((category) => ({ category, amountMinor: totals.get(category)! }));
  const deductionsMinor = deductionsByCategory.reduce((sum, entry) => sum + entry.amountMinor, 0n);

  const settledMinor = cashMinor + deductionsMinor;
  const violations: Violation[] = [];
  if (settledMinor > dueMinor) {
    violations.push({
      code: "OVER_SETTLED",
      message:
        `Bank amount ${currency} ${formatMoney(cashMinor, currency)} + deductions ${currency} ${formatMoney(deductionsMinor, currency)} = ${currency} ${formatMoney(settledMinor, currency)}, ` +
        `which exceeds the invoice amount of ${currency} ${formatMoney(dueMinor, currency)} by ${currency} ${formatMoney(settledMinor - dueMinor, currency)}.`,
    });
  }

  const outcome: SettlementOutcome = violations.length > 0 ? "INVALID" : settledMinor === 0n ? "NONE" : settledMinor === dueMinor ? "SETTLED" : "PARTIAL";
  return {
    currency,
    dueMinor,
    cashMinor,
    deductionsMinor,
    deductionsByCategory,
    settledMinor,
    outstandingMinor: settledMinor >= dueMinor ? 0n : dueMinor - settledMinor,
    outcome,
    settled: outcome === "SETTLED" && dueMinor > 0n,
    violations,
  };
}

/**
 * The invoice status a settlement justifies: Paid for an exact full settlement, Partially Paid for a part settlement, and null
 * (leave the status as it is) when nothing is recorded or the entry is invalid.
 */
export function statusJustifiedBySettlement(result: SettlementResult): "Paid" | "PartiallyPaid" | null {
  if (result.settled) return "Paid";
  if (result.outcome === "PARTIAL") return "PartiallyPaid";
  return null;
}
