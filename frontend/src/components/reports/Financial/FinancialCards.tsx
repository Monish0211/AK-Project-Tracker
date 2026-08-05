import { DollarSign, Receipt, Wallet, AlertCircle, FileSpreadsheet } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  analytics: any;
}

export function FinancialCards({ analytics }: Props) {
  const a = analytics;

  return (
    <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
      <KPIReportCard
        title="Total Work Order"
        value={`₹ ${formatBusinessINR(a.totalWOValue)}`}
        subtitle="Contracted project value"
        icon={<DollarSign size={16} />}
        tone="blue"
      />

      <KPIReportCard
        title="Invoice Raised"
        value={`₹ ${formatBusinessINR(a.totalInvoiceRaised)}`}
        subtitle={`${((a.totalInvoiceRaised / (a.totalWOValue || 1)) * 100).toFixed(1)}% of total WO`}
        icon={<Receipt size={16} />}
        tone="indigo"
      />

      <KPIReportCard
        title="Payment Received"
        value={`₹ ${formatBusinessINR(a.totalPaymentReceived)}`}
        subtitle={`${a.collectionPercent.toFixed(1)}% collection rate`}
        trend={`${a.collectionPercent.toFixed(0)}% Collected`}
        trendType="positive"
        icon={<Wallet size={16} />}
        tone="emerald"
      />

      <KPIReportCard
        title="Outstanding Receivables"
        value={`₹ ${formatBusinessINR(a.totalOutstanding)}`}
        subtitle="Billed pending payment"
        trend={a.totalOutstanding > 0 ? "Pending" : "Cleared"}
        trendType={a.totalOutstanding > 0 ? "negative" : "positive"}
        icon={<AlertCircle size={16} />}
        tone="amber"
      />

      <KPIReportCard
        title="Balance to Invoice"
        value={`₹ ${formatBusinessINR(a.balanceToInvoice)}`}
        subtitle="Unbilled contract work"
        icon={<FileSpreadsheet size={16} />}
        tone="cyan"
      />
    </div>
  );
}
