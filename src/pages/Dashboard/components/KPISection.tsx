import {
  IndianRupee,
  FileText,
  Wallet,
  Receipt,
  Percent,
  Landmark,
} from "lucide-react";

import { StatTile } from "../../../components/ui/StatTile";
import { getDashboardMetrics } from "../../../services/dashboardService";

import { formatBusinessINR } from "../../../utils/formatCurrency";

const KPISection = () => {
  const metrics = getDashboardMetrics();

  return (
    // auto-fit + minmax lets the browser decide column count purely from
    // available width (never fewer than ~170px per tile, never more columns
    // than the 6 tiles below), so it scales smoothly across 1366px laptops
    // through 4K monitors instead of jumping at fixed breakpoints.
    <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      <StatTile label="Work Order Value" value={formatBusinessINR(metrics.totalWOValue)} icon={<IndianRupee size={16} />} tint="success" />
      <StatTile label="Invoice Raised" value={formatBusinessINR(metrics.totalInvoiceRaised)} icon={<FileText size={16} />} tint="info" />
      <StatTile label="Outstanding" value={formatBusinessINR(metrics.totalOutstanding)} icon={<Wallet size={16} />} tint="danger" />
      <StatTile label="Payment Received" value={formatBusinessINR(metrics.totalPaymentReceived)} icon={<Landmark size={16} />} tint="accent" />
      <StatTile label="Expenses" value={formatBusinessINR(metrics.totalExpenses)} icon={<Receipt size={16} />} tint="warning" />
      <StatTile label="Profit %" value={`${metrics.totalProfitPercentage.toFixed(2)} %`} icon={<Percent size={16} />} tint="indigo" />
    </div>
  );
};

export default KPISection;
