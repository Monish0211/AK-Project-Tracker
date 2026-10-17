import { DollarSign, Receipt, Wallet, AlertCircle, FileSpreadsheet } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { INVOICE_NOT_AVAILABLE, NO_INVOICE_ACCESS_HINT, useInvoiceDataAvailable } from "../Shared/invoiceAccess";

interface Props {
  analytics: any;
}

export function FinancialCards({ analytics }: Props) {
  const a = analytics;
  const inv = useInvoiceDataAvailable();

  return (
    <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
      <KPIReportCard
        title="Total Work Order"
        value={formatBusinessINR(a.totalWOValue)}
        subtitle="Contracted project value"
        icon={<DollarSign size={16} />}
        tone="blue"
      />

      <KPIReportCard
        title="Invoice Raised"
        value={inv ? formatBusinessINR(a.totalInvoiceRaised) : INVOICE_NOT_AVAILABLE}
        subtitle={inv ? `${((a.totalInvoiceRaised / (a.totalWOValue || 1)) * 100).toFixed(1)}% of total WO` : NO_INVOICE_ACCESS_HINT}
        icon={<Receipt size={16} />}
        tone="indigo"
      />

      <KPIReportCard
        title="Payment Received"
        value={inv ? formatBusinessINR(a.totalPaymentReceived) : INVOICE_NOT_AVAILABLE}
        subtitle={inv ? `${a.collectionPercent.toFixed(1)}% collection rate` : NO_INVOICE_ACCESS_HINT}
        trend={inv ? `${a.collectionPercent.toFixed(0)}% Collected` : undefined}
        trendType="positive"
        icon={<Wallet size={16} />}
        tone="emerald"
      />

      <KPIReportCard
        title="Contract Outstanding"
        value={inv ? formatBusinessINR(a.totalOutstanding) : INVOICE_NOT_AVAILABLE}
        subtitle={inv ? "Contract balance uncollected" : NO_INVOICE_ACCESS_HINT}
        trend={inv ? (a.totalOutstanding > 0 ? "Pending" : "Cleared") : undefined}
        trendType={a.totalOutstanding > 0 ? "negative" : "positive"}
        icon={<AlertCircle size={16} />}
        tone="amber"
      />

      <KPIReportCard
        title="Balance to Invoice"
        value={inv ? formatBusinessINR(a.balanceToInvoice) : INVOICE_NOT_AVAILABLE}
        subtitle={inv ? "Unbilled contract work" : NO_INVOICE_ACCESS_HINT}
        icon={<FileSpreadsheet size={16} />}
        tone="cyan"
      />
    </div>
  );
}
