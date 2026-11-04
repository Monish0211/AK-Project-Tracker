/**
 * Invoice Payment workflow (Nov 2026) — the one frontend rule for "how much cash" and "how much is settled" on an invoice
 * line. Must stay in lockstep with Backend dashboard.formulas.ts's lineCashINR() / lineSettledINR().
 *
 *  - A line whose invoice has a RECORDED payment carries `recordedCashINR` (actual bank cash excluding GST, never a deduction)
 *    and `settledINR` (cash plus the deductions the business counts, e.g. TDS). Cash is real even when the invoice is only
 *    part-settled; Outstanding is built from settled, so a TDS deducted at source is not left "unpaid".
 *  - Every other line (legacy / imported, no payment record) keeps the long-standing status rule: Paid counts its full invoice
 *    amount, anything else counts nothing.
 */
export interface CashLine {
  status: string;
  invoiceAmountINR: number;
  recordedCashINR?: number | null | undefined;
  settledINR?: number | null | undefined;
}

export function lineCashINR(line: CashLine): number {
  if (line.status === "Cancelled") return 0;
  if (typeof line.recordedCashINR === "number") return line.recordedCashINR;
  return line.status === "Paid" ? line.invoiceAmountINR || 0 : 0;
}

export function lineSettledINR(line: CashLine): number {
  if (line.status === "Cancelled") return 0;
  if (typeof line.settledINR === "number") return line.settledINR;
  return line.status === "Paid" ? line.invoiceAmountINR || 0 : 0;
}
