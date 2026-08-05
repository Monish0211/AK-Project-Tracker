import { Wallet, Clock, AlertTriangle, Percent } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  analytics: any;
}

export function CollectionCards({ analytics }: Props) {
  const a = analytics;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <KPIReportCard
        title="Total Collection Received"
        value={`₹ ${formatBusinessINR(a.totalPaymentReceived)}`}
        subtitle="Realized bank collection"
        icon={<Wallet size={18} />}
        tone="emerald"
      />

      <KPIReportCard
        title="Pending Receivables"
        value={`₹ ${formatBusinessINR(a.totalOutstanding)}`}
        subtitle="Billed pending payment"
        icon={<Clock size={18} />}
        tone="amber"
      />

      <KPIReportCard
        title="Overdue (60+ Days)"
        value={`₹ ${formatBusinessINR(a.ageing["61-90 Days"] + a.ageing["90+ Days"])}`}
        subtitle="Delayed customer payments"
        trend={a.ageing["90+ Days"] > 0 ? "High Risk" : "Low Risk"}
        trendType={a.ageing["90+ Days"] > 0 ? "negative" : "positive"}
        icon={<AlertTriangle size={18} />}
        tone="rose"
      />

      <KPIReportCard
        title="Collection Rate"
        value={`${a.collectionPercent.toFixed(1)}%`}
        subtitle="Realized vs Raised Invoices"
        trend={a.collectionPercent >= 75 ? "Target Met" : "Below Target"}
        trendType={a.collectionPercent >= 75 ? "positive" : "negative"}
        icon={<Percent size={18} />}
        tone="indigo"
      />
    </div>
  );
}
