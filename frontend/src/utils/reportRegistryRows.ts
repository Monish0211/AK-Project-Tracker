/**
 * One row of Reports → "Project Commercial Registry & Financial Performance"
 * — the same row object the table renders and ReportExportButtons writes to
 * CSV/Excel (key names and order are the export column names and order).
 *
 * Reports data consistency fix (Oct 2026): built with the exact calculation
 * the Project Financial Report PDF uses (computeProjectFinancials), from the
 * live rows useReportsData() loads — Raised = every non-Cancelled line incl.
 * Draft; Received = Paid lines capped at Raised; Outstanding = max(0, WO −
 * Received), Executive Summary's contract-balance KPI (not the Invoice
 * module's own Outstanding); Expenses = non-man-hour + man-hour.
 *
 * null means "no value": Raised/Received/Outstanding when the viewer has no
 * invoice access (UI "Not available"), Profit % when Work Order Value is 0
 * (UI "—"). Both export as blank cells.
 */
import type { Project } from "../types/Project";
import { computeProjectFinancials, type FinancialInvoiceLine } from "./projectFinancials";

export interface RegistryRow {
  id: string;
  prNo: string;
  client: string;
  projectTitle: string;
  department: string;
  status: string;
  woValue: number;
  raised: number | null;
  received: number | null;
  outstanding: number | null;
  expenses: number;
  profit: number;
  profitPct: number | null;
}

type RegistryProject = Pick<Project, "id" | "prNo" | "client" | "projectTitle" | "department" | "projectStatus" | "workOrderValueINR"> &
  Partial<Pick<Project, "workOrderValue" | "resources" | "nonManhourExpenses" | "invoiceItems">>;

export function buildRegistryRow(p: RegistryProject, invoiceDataAvailable: boolean): RegistryRow {
  const items = Array.isArray(p.invoiceItems) ? p.invoiceItems : [];
  const lines: FinancialInvoiceLine[] = items.flatMap((item) => (Array.isArray(item.invoices) ? item.invoices : []));
  const f = computeProjectFinancials({
    workOrderValueINR: p.workOrderValueINR ?? p.workOrderValue ?? 0,
    manhourCosts: (Array.isArray(p.resources) ? p.resources : []).map((r) => r.manhourCost ?? 0),
    nonManhourRows: Array.isArray(p.nonManhourExpenses) ? p.nonManhourExpenses : [],
    invoiceLines: invoiceDataAvailable ? lines : null,
  });

  return {
    id: p.id,
    prNo: p.prNo || "-",
    client: p.client || "-",
    projectTitle: p.projectTitle || "-",
    department: p.department || "-",
    status: p.projectStatus || "Active",
    woValue: f.workOrderValue,
    raised: f.invoice ? f.invoice.raised : null,
    received: f.invoice ? f.invoice.received : null,
    outstanding: f.invoice ? f.invoice.outstanding : null,
    expenses: f.expenses,
    profit: f.profit,
    profitPct: f.profitPercent,
  };
}
