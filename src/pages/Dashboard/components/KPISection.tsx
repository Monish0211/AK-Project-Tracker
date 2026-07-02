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

import KPICard from "../../../components/Cards/KPICard";
import { getDashboardMetrics } from "../../../services/dashboardService";

const KPISection = () => {
  const metrics = getDashboardMetrics();

  const formatCurrency = (value: number) =>
    `₹ ${value.toLocaleString("en-IN")}`;

  return (
    <div className="grid grid-cols-4 gap-6">

      <KPICard
        title="Total Projects"
        value={metrics.totalProjects.toString()}
        icon={
          <FolderKanban
            size={32}
            className="text-blue-600"
          />
        }
      />

      <KPICard
        title="WO Value"
        value={formatCurrency(metrics.totalWOValue)}
        icon={
          <IndianRupee
            size={32}
            className="text-green-600"
          />
        }
      />

      <KPICard
        title="Invoice Raised"
        value={formatCurrency(metrics.totalInvoiceRaised)}
        icon={
          <FileText
            size={32}
            className="text-indigo-600"
          />
        }
      />

      <KPICard
        title="Payment Received"
        value={formatCurrency(metrics.totalPaymentReceived)}
        icon={
          <Landmark
            size={32}
            className="text-emerald-600"
          />
        }
      />

      <KPICard
        title="Outstanding"
        value={formatCurrency(metrics.totalOutstanding)}
        icon={
          <Wallet
            size={32}
            className="text-red-600"
          />
        }
      />

      <KPICard
        title="Expenses"
        value={formatCurrency(metrics.totalExpenses)}
        icon={
          <Receipt
            size={32}
            className="text-orange-600"
          />
        }
      />

      <KPICard
        title="Profit"
        value={formatCurrency(metrics.totalProfit)}
        icon={
          <TrendingUp
            size={32}
            className="text-green-700"
          />
        }
      />

      <KPICard
        title="Profit %"
        value={`${metrics.totalProfitPercentage.toFixed(2)} %`}
        icon={
          <Percent
            size={32}
            className="text-cyan-600"
          />
        }
      />

    </div>
  );
};

export default KPISection;