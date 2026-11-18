import { DollarSign, Receipt, Wallet, AlertCircle, TrendingUp, Percent, Gavel, BadgeIndianRupee, Banknote } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { useReportMoney } from "../reportCurrencyContext";

interface Props {
  analytics: any;
  onDrillDown?: (target: string) => void;
  /** false = the viewer has no Invoices module access: invoice KPIs read "Not available", never ₹0. */
  invoiceDataAvailable?: boolean;
}

const NOT_AVAILABLE = "Not available";

export function ExecutiveSummaryCards({ analytics, onDrillDown, invoiceDataAvailable = true }: Props) {
  const money = useReportMoney();
  const a = analytics;
  const inv = invoiceDataAvailable;

  return (
    <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
      <KPIReportCard
        title="Work Order Value"
        value={money.compact(a.totalWOValue)}
        subtitle={`${a.projectCounts.total} total contracts`}
        icon={<DollarSign size={16} />}
        tone="blue"
        onClick={() => onDrillDown?.("wo")}
      />

      <KPIReportCard
        title="Invoice Raised"
        value={inv ? money.compact(a.totalInvoiceRaised) : NOT_AVAILABLE}
        subtitle={inv ? `${a.invoiceCounts.raised + a.invoiceCounts.paid} cycle lines` : "No invoice access"}
        icon={<Receipt size={16} />}
        tone="indigo"
        onClick={() => onDrillDown?.("raised")}
      />

      <KPIReportCard
        title="Payment Received"
        value={inv ? money.compact(a.totalPaymentReceived) : NOT_AVAILABLE}
        subtitle={inv ? `${a.collectionPercent.toFixed(1)}% collected` : "No invoice access"}
        trend={inv ? `${a.collectionPercent.toFixed(0)}% Rate` : undefined}
        trendType="positive"
        icon={<Wallet size={16} />}
        tone="emerald"
        onClick={() => onDrillDown?.("received")}
      />

      <KPIReportCard
        title="Contract Outstanding"
        value={inv ? money.compact(a.totalOutstanding) : NOT_AVAILABLE}
        subtitle={inv ? "Uncollected contract balance" : "No invoice access"}
        trend={inv ? (a.totalOutstanding > 0 ? "Contract Balance" : "Clear") : undefined}
        trendType={a.totalOutstanding > 0 ? "negative" : "positive"}
        icon={<AlertCircle size={16} />}
        tone="amber"
        onClick={() => onDrillDown?.("outstanding")}
      />

      <KPIReportCard
        title="Total Expenses"
        value={money.compact(a.totalExpenses)}
        subtitle="Manhour + Non-Manhour"
        icon={<TrendingUp size={16} />}
        tone="rose"
        onClick={() => onDrillDown?.("expenses")}
      />

      <KPIReportCard
        title="Gross Profit %"
        value={`${a.profitMarginPercent.toFixed(1)}%`}
        subtitle={`${money.compact(a.grossProfit)} before LD`}
        trend={a.profitMarginPercent >= 20 ? "Healthy" : "Watch"}
        trendType={a.profitMarginPercent >= 20 ? "positive" : "negative"}
        icon={<Percent size={16} />}
        tone="cyan"
        onClick={() => onDrillDown?.("profit")}
      />

      <KPIReportCard
        title="LD Deductions"
        value={money.compact(a.totalLdDeduction)}
        subtitle={`${a.ldCounts.applied} with LD · ${a.ldCounts.notApplied} without · ${a.ldCounts.notRecorded} not recorded`}
        icon={<Gavel size={16} />}
        tone="amber"
      />

      <KPIReportCard
        title="Final Profit (after LD)"
        value={money.compact(a.totalFinalProfit)}
        subtitle={`${a.finalProfitPercentage.toFixed(1)}% of Work Order Value`}
        trendType={a.totalFinalProfit >= 0 ? "positive" : "negative"}
        icon={money.currency === "INR" ? <BadgeIndianRupee size={16} /> : <Banknote size={16} />}
        tone="emerald"
      />
    </div>
  );
}
