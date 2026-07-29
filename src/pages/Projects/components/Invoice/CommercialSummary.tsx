import { Banknote, Receipt, AlertCircle, Wallet, PieChart, ListChecks } from "lucide-react";
import type { Project } from "../../../../types/Project";
import { getProjectCommercialSummary } from "../../../../services/invoiceProgressService";
import { formatBusinessINR } from "../../../../utils/formatCurrency";
import { SummaryCards } from "./SummaryCards";

interface Props {
  project: Project;
}

/**
 * Section 1 — top-level KPI row for the whole Invoice tab. Every currency
 * figure comes from getProjectCommercialSummary(project), the single shared
 * source of truth also used by Dashboard/Reports/View Project — Payment
 * Received and Outstanding are derived live from invoice line statuses, so
 * marking a line Paid (or editing/deleting it) recalculates every KPI here
 * immediately, with no separate payment record to fall out of sync. Total
 * Activities is the one field read directly off the project, since it's a
 * simple count rather than a commercial figure.
 */
export function CommercialSummary({ project }: Props) {
  const summary = getProjectCommercialSummary(project);
  const totalActivities = project.invoiceItems?.length ?? 0;

  const tiles = [
    {
      key: "contract",
      label: "Contract Value",
      value: formatBusinessINR(summary.projectValueINR),
      icon: <Banknote size={16} />,
      tint: "accent" as const,
    },
    {
      key: "raised",
      label: "Invoice Raised",
      value: formatBusinessINR(summary.totalInvoiceRaised),
      icon: <Receipt size={16} />,
      tint: "info" as const,
    },
    {
      key: "outstanding",
      label: "Outstanding",
      value: formatBusinessINR(summary.outstandingCollection),
      icon: <AlertCircle size={16} />,
      tint: "warning" as const,
    },
    {
      key: "received",
      label: "Payment Received",
      value: formatBusinessINR(summary.totalPaymentReceived),
      icon: <Wallet size={16} />,
      tint: "success" as const,
    },
    {
      key: "balance",
      label: "Balance to Invoice",
      value: formatBusinessINR(summary.pendingDue),
      icon: <PieChart size={16} />,
      tint: "danger" as const,
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
