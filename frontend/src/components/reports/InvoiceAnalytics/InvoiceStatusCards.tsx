import { FileText, Send, CheckCircle2, Clock, XCircle } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { useReportMoney } from "../reportCurrencyContext";

interface Props {
  analytics: any;
}

export function InvoiceStatusCards({ analytics }: Props) {
  const money = useReportMoney();
  const vals = analytics.invoiceStatusValues;
  const counts = analytics.invoiceCounts;

  return (
    <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
      <KPIReportCard
        title="Draft Invoices"
        value={money.compact(vals.draft)}
        subtitle={`${counts.draft} unsubmitted cycles`}
        icon={<FileText size={16} />}
        tone="slate"
      />

      <KPIReportCard
        title="Raised / Submitted"
        value={money.compact(vals.raised)}
        subtitle={`${counts.raised} pending payment (incl. partial)`}
        trend="Submitted"
        trendType="neutral"
        icon={<Send size={16} />}
        tone="indigo"
      />

      <KPIReportCard
        title="Paid Invoices"
        value={money.compact(vals.paid)}
        subtitle={`${counts.paid} settled invoices`}
        trend="Collected"
        trendType="positive"
        icon={<CheckCircle2 size={16} />}
        tone="emerald"
      />

      <KPIReportCard
        title="90+ Days Ageing"
        value={money.compact(analytics.ageing["90+ Days"])}
        subtitle="Overdue receivables"
        trend={analytics.ageing["90+ Days"] > 0 ? "Critical" : "Clear"}
        trendType={analytics.ageing["90+ Days"] > 0 ? "negative" : "positive"}
        icon={<Clock size={16} />}
        tone="amber"
      />

      <KPIReportCard
        title="Cancelled Invoices"
        value={money.compact(vals.cancelled)}
        subtitle="Voided invoice cycles"
        icon={<XCircle size={16} />}
        tone="rose"
      />
    </div>
  );
}
