/**
 * Pure copies of the live Dashboard formulas in
 * frontend/src/services/dashboardService.ts, invoiceProgressService.ts,
 * expenseService.ts, quantityCalculations.ts, and DepartmentSummary.tsx.
 * No new KPI rules — keep this file in lockstep with those sources.
 */

import type { TimelineAlertPriority } from "./dto/dashboard.dto.js";

const RECEIVED_STATUSES = new Set(["Raised", "PartiallyPaid", "Paid"]);
const DAY_IN_MILLISECONDS = 1000 * 60 * 60 * 24;
const AT_RISK_WINDOW_DAYS = 14;

export const DEFAULT_DEPARTMENTS = [
  "Risk Management",
  "Design Engineering",
  "Mechanical",
  "Process",
  "Electrical",
  "Instrumentation",
] as const;

export function isReceivedInvoiceLineStatus(status: string): boolean {
  return RECEIVED_STATUSES.has(status);
}

/** Invoice Raised: every non-Cancelled line, including Draft. */
export function invoiceRaisedFromLines(lines: { status: string; invoiceAmountINR: number }[]): number {
  return lines
    .filter((line) => line.status !== "Cancelled")
    .reduce((sum, line) => sum + line.invoiceAmountINR, 0);
}

/** Payment Received: Raised / PartiallyPaid / Paid only. */
export function paymentReceivedFromLines(lines: { status: string; invoiceAmountINR: number }[]): number {
  return lines
    .filter((line) => isReceivedInvoiceLineStatus(line.status))
    .reduce((sum, line) => sum + line.invoiceAmountINR, 0);
}

/**
 * Per-project commercial figures used by getDashboardMetrics.
 * projectValueINR === SUM(QuantityItem.woValue) === invoice item totalPrice.
 */
export function projectCommercialTotals(
  woValueINR: number,
  lines: { status: string; invoiceAmountINR: number }[]
): { totalInvoiceRaised: number; totalPaymentReceived: number } {
  const projectValueINR = woValueINR;
  const totalInvoiceRaised = Math.min(invoiceRaisedFromLines(lines), projectValueINR);
  const totalPaymentReceived = Math.min(paymentReceivedFromLines(lines), totalInvoiceRaised);
  return { totalInvoiceRaised, totalPaymentReceived };
}

export function dashboardOutstanding(totalWOValue: number, totalPaymentReceived: number): number {
  return Math.max(0, totalWOValue - totalPaymentReceived);
}

export function grossProfit(revenue: number, totalCost: number): number {
  return revenue - totalCost;
}

export function profitPercentage(totalWOValue: number, totalProfit: number): number {
  return totalWOValue === 0 ? 0 : (totalProfit / totalWOValue) * 100;
}

export function toDateKey(value: Date | string): string {
  if (typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toISOString().slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function toLocalCalendarDate(value: string): Date | null {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (dateOnlyMatch) {
    const year = dateOnlyMatch[1];
    const month = dateOnlyMatch[2];
    const day = dateOnlyMatch[3];
    if (!year || !month || !day) return null;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function getLocalDayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_IN_MILLISECONDS;
}

/** Single source of truth from getProjectTimelineAlerts / calculateTimelineAlert. */
export function calculateTimelineAlert(
  projectEndDate: string,
  currentDate = new Date()
): {
  daysRemaining: number;
  daysDisplay: string;
  priority: TimelineAlertPriority;
  status: string;
  sortRank: number;
} | null {
  const endDate = toLocalCalendarDate(projectEndDate);
  if (!endDate) return null;

  const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  const daysRemaining = getLocalDayNumber(endDate) - getLocalDayNumber(today);

  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    return {
      daysRemaining,
      daysDisplay: `${overdueDays} Day${overdueDays === 1 ? "" : "s"} Overdue`,
      priority: "DarkRed",
      status: "Overdue",
      sortRank: 5,
    };
  }
  if (daysRemaining === 0) {
    return { daysRemaining, daysDisplay: "Due Today", priority: "Red", status: "Due Today", sortRank: 1 };
  }
  if (daysRemaining <= 7) {
    return {
      daysRemaining,
      daysDisplay: `${daysRemaining} Day${daysRemaining === 1 ? "" : "s"} Left`,
      priority: "Orange",
      status: "Due Soon",
      sortRank: 2,
    };
  }
  if (daysRemaining <= 14) {
    return {
      daysRemaining,
      daysDisplay: `${daysRemaining} Day${daysRemaining === 1 ? "" : "s"} Left`,
      priority: "Yellow",
      status: "Upcoming",
      sortRank: 3,
    };
  }
  return {
    daysRemaining,
    daysDisplay: `${daysRemaining} Day${daysRemaining === 1 ? "" : "s"} Left`,
    priority: "Green",
    status: "On Track",
    sortRank: 4,
  };
}

export function formatCurrencyCompact(amount: number): string {
  if (!amount || amount === 0) return "₹ 0";
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    return `₹ ${cr.toFixed(2)} Cr`;
  }
  if (amount >= 100000) {
    const lakh = amount / 100000;
    return `₹ ${lakh.toFixed(2)} L`;
  }
  return `₹ ${amount.toLocaleString("en-IN")}`;
}

export function formatHoursOverrun(overrun: number): string {
  return `+${overrun % 1 === 0 ? overrun.toFixed(0) : overrun.toFixed(2)} hrs`;
}

export function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

export function clampPercentage(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(100, value));
  return Math.round(clamped * 10) / 10;
}

/**
 * calculateProjectCompletionPercentage without invoiceMethod (not stored).
 * Same branch order as projectMetrics.ts when method is undefined:
 * quantity billing if woQty > 0, else lump-sum if milestones exist, else
 * amount-based Invoice Raised ÷ WO Value.
 */
export function calculateCompletionPercentage(input: {
  totalWOQty: number;
  totalInvoiceQty: number;
  milestonePercentages: { id: string; paymentPercentage: number }[];
  billedMilestoneIds: Set<string>;
  woValueINR: number;
  totalInvoiceRaised: number;
}): number {
  if (input.totalWOQty > 0) {
    const pct = (input.totalInvoiceQty / input.totalWOQty) * 100;
    return clampPercentage(pct);
  }

  if (input.milestonePercentages.length > 0) {
    const totalMilestonePct = input.milestonePercentages.reduce((sum, m) => sum + (m.paymentPercentage || 0), 0);
    let completedMilestonePct = 0;
    for (const m of input.milestonePercentages) {
      if (input.billedMilestoneIds.has(m.id)) {
        completedMilestonePct += m.paymentPercentage || 0;
      }
    }
    const targetTotal = totalMilestonePct > 0 ? totalMilestonePct : 100;
    const pct = (completedMilestonePct / targetTotal) * 100;
    if (completedMilestonePct > 0) {
      return clampPercentage(pct);
    }
  }

  if (input.woValueINR > 0) {
    const pct = (input.totalInvoiceRaised / input.woValueINR) * 100;
    return clampPercentage(pct);
  }

  return 0;
}

export function classifyHealth(input: {
  projectStatus: string;
  startDateKey: string;
  endDateKey: string;
  totalPendingQty: number;
  pendingInvoicePercentage: number;
  today?: Date;
}): "skip" | "onTrack" | "atRisk" | "delayed" | "notStarted" {
  if (input.projectStatus === "Completed" || input.projectStatus === "Cancelled") {
    return "skip";
  }

  const today = input.today ?? new Date();
  const start = input.startDateKey ? new Date(input.startDateKey) : null;
  const end = input.endDateKey ? new Date(input.endDateKey) : null;
  const hasPendingWork = input.totalPendingQty > 0 || input.pendingInvoicePercentage > 0;

  if (start && !Number.isNaN(start.getTime()) && start.getTime() > today.getTime()) {
    return "notStarted";
  }

  if (end && !Number.isNaN(end.getTime())) {
    const daysToEnd = (end.getTime() - today.getTime()) / DAY_IN_MILLISECONDS;
    if (daysToEnd < 0) return "delayed";
    if (daysToEnd <= AT_RISK_WINDOW_DAYS && hasPendingWork) return "atRisk";
  }

  return "onTrack";
}

export function pendingInvoicePercentage(totalPendingQty: number, totalWOQty: number): number {
  return totalWOQty === 0 ? 0 : (totalPendingQty / totalWOQty) * 100;
}

export function teamLeadStatus(activeProjectsCount: number): "High" | "Medium" | "Normal" {
  if (activeProjectsCount >= 10) return "High";
  if (activeProjectsCount >= 5) return "Medium";
  return "Normal";
}

export function departmentHealth(input: {
  completion: number;
  pendingInvoices: number;
  delayedProjects: number;
  onHoldProjects: number;
}): "Healthy" | "At Risk" | "Delayed" {
  if (input.completion < 35 || input.pendingInvoices > 4 || input.delayedProjects > 1) {
    return "Delayed";
  }
  if (input.completion < 65 || input.pendingInvoices > 2 || input.onHoldProjects > 0) {
    return "At Risk";
  }
  return "Healthy";
}

export function departmentWorkloadPercent(activeProjects: number, teamMembers: number, pendingInvoices: number): number {
  const rawWorkload = activeProjects * 14 + teamMembers * 4 + pendingInvoices * 6;
  return Math.min(98, Math.max(35, Math.round(rawWorkload || 50)));
}

export function isUsableManagerName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "—") return false;
  const lower = trimmed.toLowerCase();
  return lower !== "unassigned" && lower !== "null";
}

export function projectDisplayName(client: string, projectTitle: string): string {
  const title = projectTitle || "Untitled Project";
  return client ? `${client} – ${title}` : title;
}
