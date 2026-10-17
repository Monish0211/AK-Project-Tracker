/**
 * Pure per-project financial figures for the Project Financial Report PDF
 * (Oct 2026). No I/O, no cache reads — the caller passes already-fetched,
 * live backend data (see projectReportDataService.ts).
 *
 * Definitions deliberately mirror useReportsData.ts's per-project analytics
 * so the PDF and the Reports KPIs agree for the same data:
 *  - Invoice Raised  = every non-Cancelled invoice line, INCLUDING Draft.
 *  - Payment Received = Paid lines only, capped at Invoice Raised.
 *  - Outstanding     = max(0, Work Order Value − Payment Received).
 *  - Expenses        = non-man-hour cost (same row rule as
 *                      getTotalNonManhourCost) + Σ resource manhourCost.
 *  - Profit          = Work Order Value − Expenses.
 *  - Profit %        = Profit / Work Order Value × 100 — null (shown as "—")
 *                      when Work Order Value is 0, never a misleading 0%.
 *
 * Invoice figures are null when the caller has no invoice access — the PDF
 * must say "Not available", never print ₹0 for data it could not read.
 */
import { getTotalNonManhourCost } from "../services/expenseService";
import type { NonManhourExpense } from "../types/NonManhourExpense";

export const INVOICE_STATUS_ORDER = ["Draft", "Raised", "PartiallyPaid", "Paid", "Cancelled"] as const;

export interface FinancialInvoiceLine {
  status: string;
  invoiceAmountINR: number;
}

export interface FinancialNonManhourRow {
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface ProjectFinancialInputs {
  workOrderValueINR: number;
  manhourCosts: number[];
  nonManhourRows: FinancialNonManhourRow[];
  /** null = the caller has no invoice access (403 on invoice data). */
  invoiceLines: FinancialInvoiceLine[] | null;
}

export interface InvoiceStatusTotal {
  status: string;
  count: number;
  amount: number;
}

export interface ProjectInvoiceFinancials {
  raised: number;
  received: number;
  outstanding: number;
  draftCount: number;
  draftAmount: number;
  cancelledCount: number;
  cancelledAmount: number;
  /** One entry per status present, in INVOICE_STATUS_ORDER, unknown statuses last. */
  byStatus: InvoiceStatusTotal[];
}

export interface ProjectFinancials {
  workOrderValue: number;
  manhourTotal: number;
  nonManhourTotal: number;
  expenses: number;
  profit: number;
  profitPercent: number | null;
  invoice: ProjectInvoiceFinancials | null;
}

function amount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function computeInvoiceFinancials(lines: FinancialInvoiceLine[], workOrderValue: number): ProjectInvoiceFinancials {
  let raised = 0;
  let paidRaw = 0;
  const totals = new Map<string, InvoiceStatusTotal>();

  for (const line of lines) {
    const status = String(line.status || "");
    const amt = amount(line.invoiceAmountINR);
    const entry = totals.get(status) ?? { status, count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += amt;
    totals.set(status, entry);

    if (status === "Cancelled") continue;
    raised += amt;
    if (status === "Paid") paidRaw += amt;
  }

  const received = Math.min(paidRaw, raised);
  const known = INVOICE_STATUS_ORDER as readonly string[];
  const byStatus = [
    ...known.flatMap((s) => (totals.has(s) ? [totals.get(s)!] : [])),
    ...[...totals.values()].filter((t) => !known.includes(t.status)),
  ];

  return {
    raised,
    received,
    outstanding: Math.max(0, workOrderValue - received),
    draftCount: totals.get("Draft")?.count ?? 0,
    draftAmount: totals.get("Draft")?.amount ?? 0,
    cancelledCount: totals.get("Cancelled")?.count ?? 0,
    cancelledAmount: totals.get("Cancelled")?.amount ?? 0,
    byStatus,
  };
}

export function computeProjectFinancials(input: ProjectFinancialInputs): ProjectFinancials {
  const workOrderValue = amount(input.workOrderValueINR);
  const manhourTotal = input.manhourCosts.reduce((sum, c) => sum + amount(c), 0);
  const nonManhourTotal = getTotalNonManhourCost(input.nonManhourRows as NonManhourExpense[]);
  const expenses = nonManhourTotal + manhourTotal;
  const profit = workOrderValue - expenses;

  return {
    workOrderValue,
    manhourTotal,
    nonManhourTotal,
    expenses,
    profit,
    profitPercent: workOrderValue === 0 ? null : (profit / workOrderValue) * 100,
    invoice: input.invoiceLines === null ? null : computeInvoiceFinancials(input.invoiceLines, workOrderValue),
  };
}
