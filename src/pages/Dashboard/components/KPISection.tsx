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

  const currency = (value: number) =>
    `₹ ${value.toLocaleString("en-IN")}`;

  return (
    <div className="grid grid-cols-4 gap-6">

      <KPICard
        title="Total Projects"
        value={metrics.totalProjects.toString()}
        icon={
          <FolderKanban
            size={30}
            className="text-blue-600"
          />
        }
      />

      <KPICard
        title="Work Order Value"
        value={currency(metrics.totalWOValue)}
        icon={
          <IndianRupee
            size={30}
            className="text-green-600"
          />
        }
      />

      <KPICard
        title="Invoice Raised"
        value={currency(metrics.totalInvoiceRaised)}
        icon={
          <FileText
            size={30}
            className="text-indigo-600"
          />
        }
      />

      <KPICard
        title="Payment Received"
        value={currency(metrics.totalPaymentReceived)}
        icon={
          <Landmark
            size={30}
            className="text-emerald-600"
          />
        }
      />

      <KPICard
        title="Outstanding"
        value={currency(metrics.totalOutstanding)}
        icon={
          <Wallet
            size={30}
            className="text-red-600"
          />
        }
      />

      <KPICard
        title="Expenses"
        value={currency(metrics.totalExpenses)}
        icon={
          <Receipt
            size={30}
            className="text-orange-600"
          />
        }
      />

      <KPICard
        title="Profit"
        value={currency(metrics.totalProfit)}
        icon={
          <TrendingUp
            size={30}
            className="text-green-700"
          />
        }
      />

      <KPICard
        title="Profit %"
        value={`${metrics.totalProfitPercentage.toFixed(2)} %`}
        icon={
          <Percent
            size={30}
            className="text-cyan-600"
          />
        }
      />

    </div>
  );
};

export default KPISection;