import {
  FolderKanban,
  IndianRupee,
  FileText,
  Wallet,
  Receipt,
  TrendingUp,
  Percent,
  Landmark,
} from "lucide-react";

import { StatTile } from "../../../components/ui/StatTile";
import { getDashboardMetrics } from "../../../services/dashboardService";

const currency = (value: number) => `₹ ${value.toLocaleString("en-IN")}`;

const KPISection = () => {
  const metrics = getDashboardMetrics();

  return (
    <div className="space-y-2.5">
      {/* Primary — commercial pulse of the business */}
      <div className="grid grid-cols-1 sm:grid-cols-2 min-[1440px]:grid-cols-4 gap-3">
        <StatTile emphasis="primary" label="Work Order Value" value={currency(metrics.totalWOValue)} icon={<IndianRupee size={17} />} tint="success" />
        <StatTile emphasis="primary" label="Invoice Raised" value={currency(metrics.totalInvoiceRaised)} icon={<FileText size={17} />} tint="info" />
        <StatTile emphasis="primary" label="Outstanding" value={currency(metrics.totalOutstanding)} icon={<Wallet size={17} />} tint="danger" />
        <StatTile emphasis="primary" label="Payment Received" value={currency(metrics.totalPaymentReceived)} icon={<Landmark size={17} />} tint="success" />
      </div>

      {/* Secondary — supporting operational metrics */}
      <div className="grid grid-cols-2 min-[1440px]:grid-cols-4 gap-3">
        <StatTile emphasis="secondary" label="Total Projects" value={metrics.totalProjects.toString()} icon={<FolderKanban size={14} />} tint="accent" />
        <StatTile emphasis="secondary" label="Expenses" value={currency(metrics.totalExpenses)} icon={<Receipt size={14} />} tint="warning" />
        <StatTile emphasis="secondary" label="Profit" value={currency(metrics.totalProfit)} icon={<TrendingUp size={14} />} tint="success" />
        <StatTile emphasis="secondary" label="Profit %" value={`${metrics.totalProfitPercentage.toFixed(2)} %`} icon={<Percent size={14} />} tint="info" />
      </div>
    </div>
  );
};

export default KPISection;
