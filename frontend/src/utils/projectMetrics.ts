import type { Project } from "../types/Project";
import { getProjectCommercialSummary } from "../services/invoiceProgressService";
import { getProcessedTeamMembers } from "../services/timesheetProcessingService";
import { getAllTimesheetImports } from "../services/timesheetService";

/**
 * Calculates the dynamic Team Members KPI count for a project.
 * Counts assigned team resources from project.resources and processed timesheets.
 */
export function getProjectTeamCount(project: Project): number {
  if (!project) return 0;

  const directResourcesCount = Array.isArray(project.resources) ? project.resources.length : 0;

  let processedCount = 0;
  try {
    const allImports = getAllTimesheetImports();
    const processedMembers = getProcessedTeamMembers(project.prNo || "", allImports);
    processedCount = Array.isArray(processedMembers) ? processedMembers.length : 0;
  } catch {
    processedCount = 0;
  }

  return Math.max(directResourcesCount, processedCount);
}

/**
 * Calculates the dynamic Completion % for a project.
 *
 * 1. For Quantity Billing (invoiceMethod === "invoice_line_items" or Quantity Items present):
 *    Completion % = Completed Quantity ÷ Order Quantity × 100
 * 2. For Lump Sum (invoiceMethod === "lump_sum" or Payment Milestones present):
 *    Completion % = Completed Milestones % ÷ Total Milestone % × 100
 * 3. For MLMP (invoiceMethod === "mlmp"):
 *    Completion % = Completed Milestones % across all Sets ÷ Total Milestones % across all Sets × 100
 * 4. For Amount Based (fallback):
 *    Completion % = Invoice Raised ÷ Contract Value × 100
 */
export function calculateProjectCompletionPercentage(project: Project): number {
  if (!project) return 0;

  const method = project.invoiceMethod;

  // 1. QUANTITY BILLING
  if (
    method === "invoice_line_items" ||
    (project.totalWOQty > 0 && Array.isArray(project.quantityItems) && project.quantityItems.length > 0)
  ) {
    const totalWOQty = project.totalWOQty || (project.quantityItems || []).reduce((sum: number, q: any) => sum + (q.woQty || 0), 0);
    const totalInvoiceQty = project.totalInvoiceQty || (project.quantityItems || []).reduce((sum: number, q: any) => sum + (q.invoiceQty || 0), 0);

    if (totalWOQty > 0) {
      const pct = (totalInvoiceQty / totalWOQty) * 100;
      return clampPercentage(pct);
    }
  }

  // 2. LUMP SUM BILLING
  if (
    method === "lump_sum" ||
    (Array.isArray(project.paymentMilestones) && project.paymentMilestones.length > 0)
  ) {
    const milestones = project.paymentMilestones || [];
    const totalMilestonePct = milestones.reduce((sum: number, m: any) => sum + (m.paymentPercentage || 0), 0);

    const invoicedMilestoneIds = new Set<string>();
    (project.invoiceItems || []).forEach((item: any) => {
      (item.invoices || []).forEach((line: any) => {
        if (line.status !== "Cancelled" && line.milestoneId) {
          invoicedMilestoneIds.add(line.milestoneId);
        }
      });
    });

    let completedMilestonePct = 0;
    milestones.forEach((m: any) => {
      if (invoicedMilestoneIds.has(m.id)) {
        completedMilestonePct += m.paymentPercentage || 0;
      }
    });

    const targetTotal = totalMilestonePct > 0 ? totalMilestonePct : 100;
    const pct = (completedMilestonePct / targetTotal) * 100;
    if (completedMilestonePct > 0) {
      return clampPercentage(pct);
    }
  }

  // 3. MLMP (Multi-Level Milestone Progress)
  if (method === "mlmp") {
    const invoiceItems = project.invoiceItems || [];
    let totalMlmpPctSum = 0;
    let completedMlmpPctSum = 0;

    invoiceItems.forEach((item: any) => {
      const mlmpMs: any[] = item.mlmpMilestones || [];
      const itemTotalPct = mlmpMs.reduce((sum: number, m: any) => sum + (m.paymentPercentage || 0), 0);
      totalMlmpPctSum += itemTotalPct;

      const invoicedMsIds = new Set<string>();
      (item.invoices || []).forEach((line: any) => {
        if (line.status !== "Cancelled" && line.milestoneId) {
          invoicedMsIds.add(line.milestoneId);
        }
      });

      mlmpMs.forEach((m: any) => {
        if (invoicedMsIds.has(m.id)) {
          completedMlmpPctSum += m.paymentPercentage || 0;
        }
      });
    });

    if (totalMlmpPctSum > 0) {
      const pct = (completedMlmpPctSum / totalMlmpPctSum) * 100;
      return clampPercentage(pct);
    }
  }

  // 4. AMOUNT BASED FALLBACK (Invoice Raised ÷ Work Order Value × 100)
  const workOrderValue = project.workOrderValueINR || project.workOrderValue || 0;
  const commSummary = getProjectCommercialSummary(project);
  const totalInvoiceRaised = commSummary.totalInvoiceRaised || 0;

  if (workOrderValue > 0) {
    const pct = (totalInvoiceRaised / workOrderValue) * 100;
    return clampPercentage(pct);
  }

  return 0;
}

function clampPercentage(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped * 10) / 10;
}
