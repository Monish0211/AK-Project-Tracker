import { FileText, Send, CheckCircle2, Clock, XCircle } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  analytics: any;
}

export function InvoiceStatusCards({ analytics }: Props) {
  const vals = analytics.invoiceStatusValues;
  const counts = analytics.invoiceCounts;

  return (
    <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
      <KPIReportCard
        title="Draft Invoices"
        value={`₹ ${formatBusinessINR(vals.draft)}`}
        subtitle={`${counts.draft} unsubmitted cycles`}
        icon={<FileText size={16} />}
        tone="slate"
      />

      <KPIReportCard
        title="Raised / Submitted"
        value={`₹ ${formatBusinessINR(vals.raised)}`}
        subtitle={`${counts.raised} pending payment`}
        trend="Submitted"
        trendType="neutral"
        icon={<Send size={16} />}
        tone="indigo"
      />

      <KPIReportCard
        title="Paid Invoices"
        value={`₹ ${formatBusinessINR(vals.paid)}`}
        subtitle={`${counts.paid} settled invoices`}
        trend="Collected"
        trendType="positive"
        icon={<CheckCircle2 size={16} />}
        tone="emerald"
      />

      <KPIReportCard
        title="90+ Days Ageing"
        value={`₹ ${formatBusinessINR(analytics.ageing["90+ Days"])}`}
        subtitle="Overdue receivables"
        trend={analytics.ageing["90+ Days"] > 0 ? "Critical" : "Clear"}
        trendType={analytics.ageing["90+ Days"] > 0 ? "negative" : "positive"}
        icon={<Clock size={16} />}
        tone="amber"
      />

      <KPIReportCard
        title="Cancelled Invoices"
        value={`₹ ${formatBusinessINR(vals.cancelled)}`}
        subtitle="Voided invoice cycles"
        icon={<XCircle size={16} />}
        tone="rose"
      />
    </div>
  );
}
