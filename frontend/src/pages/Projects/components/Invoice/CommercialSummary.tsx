import { Banknote, Receipt, AlertCircle, Wallet, PieChart, ListChecks } from "lucide-react";
import type { Project } from "../../../../types/Project";
import { calculateProjectKPIs } from "./InvoiceCalculations";
import { projectMoney } from "../../../../utils/currencyDisplay";
import { SummaryCards } from "./SummaryCards";

interface Props {
  project: Project;
}

/**
 * Section 1 — top-level KPI row for the whole Invoice tab. Every currency
 * figure comes from calculateProjectKPIs(project) — the Invoice Calculation
 * Service's alias for getProjectCommercialSummary, the single shared source
 * of truth also used by Dashboard/Reports/View Project — Payment
 * Received and Outstanding are derived live from invoice line statuses, so
 * marking a line Paid (or editing/deleting it) recalculates every KPI here
 * immediately, with no separate payment record to fall out of sync. Total
 * Activities is the one field read directly off the project, since it's a
 * simple count rather than a commercial figure.
 */
export function CommercialSummary({ project }: Props) {
  const summary = calculateProjectKPIs(project);
  const totalActivities = project.invoiceItems?.length ?? 0;
  // Every amount here is in the project's own currency (INR for India / legacy, AED, QAR, OMR, MYR... otherwise): label and abbreviate it as such.
  // For an India project this is exactly formatBusinessINR, so India is unchanged.
  const money = projectMoney(project);

  const tiles = [
    {
      key: "contract",
      label: "Work Order Value",
      value: money.compact(summary.projectValueINR),
      rawValue: summary.projectValueINR,
      currency: money.currency,
      icon: <Banknote size={16} />,
      tint: "accent" as const,
    },
    {
      key: "raised",
      label: "Invoice Raised",
      value: money.compact(summary.totalInvoiceRaised),
      rawValue: summary.totalInvoiceRaised,
      currency: money.currency,
      icon: <Receipt size={16} />,
      tint: "info" as const,
    },
    {
      key: "balance",
      label: "Balance to Invoice",
      value: money.compact(summary.pendingDue),
      rawValue: summary.pendingDue,
      currency: money.currency,
      icon: <PieChart size={16} />,
      tint: "danger" as const,
    },
    {
      key: "received",
      label: "Payment Received",
      value: money.compact(summary.totalPaymentReceived),
      rawValue: summary.totalPaymentReceived,
      currency: money.currency,
      icon: <Wallet size={16} />,
      tint: "success" as const,
    },
    {
      key: "outstanding",
      label: "Outstanding",
      value: money.compact(summary.outstandingCollection),
      rawValue: summary.outstandingCollection,
      currency: money.currency,
      icon: <AlertCircle size={16} />,
      tint: "warning" as const,
    },
    {
      key: "activities",
      label: "Total Activities",
      value: String(totalActivities),
      icon: <ListChecks size={16} />,
      tint: "purple" as const,
    },
  ];

  return <SummaryCards tiles={tiles} />;
}
