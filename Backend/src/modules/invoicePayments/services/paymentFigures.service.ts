import { figuresForInvoice } from "../paymentCash.rules.js";
import type { LineForFigures, PaymentLineFigures } from "../paymentCash.rules.js";
import { findActivePaymentsForProjects } from "../repository/invoicePayment.repository.js";

/**
 * Invoice Payment workflow (Nov 2026) — the per-line recorded cash / settled figures for a set of invoice lines, read once
 * (ONE query for all payments of all the lines' projects). Lines whose invoice has no active payment are simply absent from the
 * result: every consumer then keeps the long-standing status-based figure for them, so nothing changes for legacy invoices.
 * See paymentCash.rules.ts for what the two figures mean.
 */
export type LineWithInvoice = LineForFigures & { projectId: string; invoiceNo: string };

const keyOf = (projectId: string, invoiceNo: string) => `${projectId}\u0000${invoiceNo.trim().toUpperCase()}`;

export async function loadPaymentFigures(lines: readonly LineWithInvoice[]): Promise<Map<string, PaymentLineFigures>> {
  const result = new Map<string, PaymentLineFigures>();
  const projectIds = [...new Set(lines.map((line) => line.projectId))];
  if (projectIds.length === 0) return result;

  const payments = await findActivePaymentsForProjects(projectIds);
  if (payments.length === 0) return result;

  const paymentsByInvoice = new Map<string, typeof payments>();
  for (const payment of payments) {
    const key = keyOf(payment.projectId, payment.invoiceNo);
    const bucket = paymentsByInvoice.get(key);
    if (bucket) bucket.push(payment);
    else paymentsByInvoice.set(key, [payment]);
  }

  const linesByInvoice = new Map<string, LineWithInvoice[]>();
  for (const line of lines) {
    if (line.status === "Cancelled") continue;
    const key = keyOf(line.projectId, line.invoiceNo);
    if (!paymentsByInvoice.has(key)) continue;
    const bucket = linesByInvoice.get(key);
    if (bucket) bucket.push(line);
    else linesByInvoice.set(key, [line]);
  }

  for (const [key, invoiceLines] of linesByInvoice) {
    for (const [lineId, figures] of figuresForInvoice(invoiceLines, paymentsByInvoice.get(key)!)) result.set(lineId, figures);
  }
  return result;
}

/** The same lines with their recorded-cash / settled figures attached where their invoice has a recorded payment (unchanged otherwise). */
export async function withPaymentFigures<T extends LineWithInvoice>(lines: readonly T[]): Promise<Array<T & Partial<PaymentLineFigures>>> {
  const figures = await loadPaymentFigures(lines);
  if (figures.size === 0) return [...lines];
  return lines.map((line) => {
    const f = figures.get(line.id);
    return f ? { ...line, recordedCashINR: f.recordedCashINR, settledINR: f.settledINR } : line;
  });
}
