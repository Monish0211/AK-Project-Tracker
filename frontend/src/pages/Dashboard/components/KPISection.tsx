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

  return (
    // auto-fit + minmax lets the browser decide column count purely from
    // available width (never fewer than ~170px per tile, never more columns
    // than the 6 tiles below), so it scales smoothly across 1366px laptops
    // through 4K monitors instead of jumping at fixed breakpoints.
    <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      <StatTile label="Work Order Value" value={formatBusinessINR(kpis.totalWOValue)} rawValue={kpis.totalWOValue} icon={<IndianRupee size={16} />} tint="success" footnote="From Dashboard summary" />
      <StatTile label="Invoice Raised" value={formatBusinessINR(kpis.totalInvoiceRaised)} rawValue={kpis.totalInvoiceRaised} icon={<FileText size={16} />} tint="info" footnote="From Dashboard summary" />
      <StatTile label="Outstanding" value={formatBusinessINR(kpis.totalOutstanding)} rawValue={kpis.totalOutstanding} icon={<Wallet size={16} />} tint="danger" footnote="From Dashboard summary" />
      <StatTile label="Payment Received" value={formatBusinessINR(kpis.totalPaymentReceived)} rawValue={kpis.totalPaymentReceived} icon={<Landmark size={16} />} tint="accent" footnote="From Dashboard summary" />
      <StatTile label="Expenses" value={formatBusinessINR(kpis.totalExpenses)} rawValue={kpis.totalExpenses} icon={<Receipt size={16} />} tint="warning" footnote="From Dashboard summary" />
      <StatTile label="Profit %" value={`${kpis.totalProfitPercentage.toFixed(2)} %`} icon={<Percent size={16} />} tint="indigo" footnote="From Dashboard summary" />
    </div>
  );
};

export default KPISection;
