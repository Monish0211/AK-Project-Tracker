import { DollarSign, Receipt, Wallet, AlertCircle, TrendingUp, Percent } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  analytics: any;
  onDrillDown?: (target: string) => void;
}

export function ExecutiveSummaryCards({ analytics, onDrillDown }: Props) {
  const a = analytics;

  return (
    <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
      <KPIReportCard
        title="Work Order Value"
        value={formatBusinessINR(a.totalWOValue)}
        subtitle={`${a.projectCounts.total} total contracts`}
        icon={<DollarSign size={16} />}
        tone="blue"
        onClick={() => onDrillDown?.("wo")}
      />

      <KPIReportCard
        title="Invoice Raised"
        value={formatBusinessINR(a.totalInvoiceRaised)}
        subtitle={`${a.invoiceCounts.raised + a.invoiceCounts.paid} cycle lines`}
        icon={<Receipt size={16} />}
        tone="indigo"
        onClick={() => onDrillDown?.("raised")}
      />

      <KPIReportCard
        title="Payment Received"
        value={formatBusinessINR(a.totalPaymentReceived)}
        subtitle={`${a.collectionPercent.toFixed(1)}% collected`}
        trend={`${a.collectionPercent.toFixed(0)}% Rate`}
        trendType="positive"
        icon={<Wallet size={16} />}
        tone="emerald"
        onClick={() => onDrillDown?.("received")}
      />

      <KPIReportCard
        title="Contract Outstanding"
        value={formatBusinessINR(a.totalOutstanding)}
        subtitle="Uncollected contract balance"
        trend={a.totalOutstanding > 0 ? "Contract Balance" : "Clear"}
        trendType={a.totalOutstanding > 0 ? "negative" : "positive"}
        icon={<AlertCircle size={16} />}
        tone="amber"
        onClick={() => onDrillDown?.("outstanding")}
      />

      <KPIReportCard
        title="Total Expenses"
        value={formatBusinessINR(a.totalExpenses)}
        subtitle="Manhour + Non-Manhour"
        icon={<TrendingUp size={16} />}
        tone="rose"
        onClick={() => onDrillDown?.("expenses")}
      />

      <KPIReportCard
        title="Gross Profit %"
        value={`${a.profitMarginPercent.toFixed(1)}%`}
        subtitle={`${formatBusinessINR(a.grossProfit)} net`}
        trend={a.profitMarginPercent >= 20 ? "Healthy" : "Watch"}
        trendType={a.profitMarginPercent >= 20 ? "positive" : "negative"}
        icon={<Percent size={16} />}
        tone="cyan"
        onClick={() => onDrillDown?.("profit")}
      />
    </div>
  );
}
