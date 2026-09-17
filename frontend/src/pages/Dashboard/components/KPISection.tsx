import {
  IndianRupee,
  FileText,
  Wallet,
  Receipt,
  Percent,
  Landmark,
} from "lucide-react";

import { StatTile } from "../../../components/ui/StatTile";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { useDashboardSummary } from "../DashboardSummaryContext";

const KPISection = () => {
  const { kpis } = useDashboardSummary();

  // Unbilled — portion of Work Order Value not yet invoiced. Reuses the same
  // two dashboard-summary KPI values the Work Order Value and Invoice Raised
  // tiles already render (kpis.totalWOValue / kpis.totalInvoiceRaised); no
  // second invoice calculation system, no backend change. This is a distinct
  // figure from the existing "Outstanding" KPI (totalWOValue -
  // totalPaymentReceived, i.e. amount not yet collected), which conflates
  // unbilled work with billed-but-unpaid invoices. The formula here matches
  // the app's existing "Balance to Invoice" / pendingDueINR definition used
  // elsewhere (project.service.ts's computeCommercialTotalsByProjectId()).
  const totalUnbilled = Math.max(kpis.totalWOValue - kpis.totalInvoiceRaised, 0);

  // Billed In % — how much of Work Order Value has been invoiced so far.
  // Same reused values as Unbilled; clamped to 0–100% since it represents a
  // share of Work Order Value (unlike Profit %, which is intentionally
  // allowed to go negative for a loss-making portfolio).
  const billedInPercent =
    kpis.totalWOValue === 0
      ? 0
      : Math.min(100, Math.max(0, (kpis.totalInvoiceRaised / kpis.totalWOValue) * 100));

  return (
    // auto-fit + minmax lets the browser decide column count purely from
    // available width (never fewer than ~170px per tile, never more columns
    // than the 6 tiles below), so it scales smoothly across 1366px laptops
    // through 4K monitors instead of jumping at fixed breakpoints.
    <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      <StatTile label="Work Order Value" value={formatBusinessINR(kpis.totalWOValue)} rawValue={kpis.totalWOValue} icon={<IndianRupee size={16} />} tint="success" footnote="From Dashboard summary" />
      <StatTile label="Unbilled" value={formatBusinessINR(totalUnbilled)} rawValue={totalUnbilled} icon={<Wallet size={16} />} tint="danger" footnote="Work Order Value − Invoice Raised" />
      <StatTile label="Invoice Raised" value={formatBusinessINR(kpis.totalInvoiceRaised)} rawValue={kpis.totalInvoiceRaised} icon={<FileText size={16} />} tint="info" footnote="From Dashboard summary" />
      <StatTile label="Payment Received" value={formatBusinessINR(kpis.totalPaymentReceived)} rawValue={kpis.totalPaymentReceived} icon={<Landmark size={16} />} tint="accent" footnote="From Dashboard summary" />
      <StatTile label="Actual Project Cost" value={formatBusinessINR(kpis.totalActualProjectCost)} rawValue={kpis.totalActualProjectCost} icon={<Receipt size={16} />} tint="warning" footnote="Manhour + Other Expenses" />
      <StatTile label="Billed In %" value={`${billedInPercent.toFixed(2)} %`} icon={<Percent size={16} />} tint="indigo" footnote="Invoice Raised ÷ Work Order Value" />
    </div>
  );
};

export default KPISection;
