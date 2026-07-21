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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
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
