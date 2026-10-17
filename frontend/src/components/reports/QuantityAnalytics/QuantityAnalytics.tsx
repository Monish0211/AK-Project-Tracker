import { Layers, CheckCircle2, Clock, Percent } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { QuantityProgress } from "./QuantityProgress";
import { RemainingQuantityChart } from "./RemainingQuantityChart";
import { QuantityTable } from "./QuantityTable";
import { formatIndianNumber } from "../../../utils/quantityCalculations";
import { INVOICE_NOT_AVAILABLE, NO_INVOICE_ACCESS_HINT, useInvoiceDataAvailable } from "../Shared/invoiceAccess";
import { InvoiceDataUnavailable } from "../Shared/InvoiceDataUnavailable";

interface Props {
  projects: any[];
  analytics: any;
}

export function QuantityAnalytics({ projects, analytics }: Props) {
  const a = analytics;
  const inv = useInvoiceDataAvailable();

  return (
    <div className="space-y-5 nu-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIReportCard
          title="Total Contracted Quantity"
          value={formatIndianNumber(a.totalOrderedQty)}
          subtitle="Contracted scope deliverables"
          icon={<Layers size={18} />}
          tone="blue"
        />

        <KPIReportCard
          title="Invoiced Quantity"
          value={inv ? formatIndianNumber(a.totalInvoicedQty) : INVOICE_NOT_AVAILABLE}
          subtitle={inv ? "Billed deliverable units" : NO_INVOICE_ACCESS_HINT}
          icon={<CheckCircle2 size={18} />}
          tone="emerald"
        />

        <KPIReportCard
          title="Remaining Deliverables"
          value={inv ? formatIndianNumber(a.remainingQty) : INVOICE_NOT_AVAILABLE}
          subtitle={inv ? "Unbilled scope units" : NO_INVOICE_ACCESS_HINT}
          icon={<Clock size={18} />}
          tone="amber"
        />

        <KPIReportCard
          title="Quantity Completion Rate"
          value={inv ? `${a.quantityCompletionPercent.toFixed(1)}%` : INVOICE_NOT_AVAILABLE}
          subtitle={inv ? "Invoiced / Total Ordered" : NO_INVOICE_ACCESS_HINT}
          trend={inv ? (a.quantityCompletionPercent >= 80 ? "On Track" : "In Progress") : undefined}
          trendType={a.quantityCompletionPercent >= 80 ? "positive" : "neutral"}
          icon={<Percent size={18} />}
          tone="indigo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {inv ? <QuantityProgress projects={projects} /> : <InvoiceDataUnavailable title="Quantity Invoicing Progress" />}
        {inv ? <RemainingQuantityChart analytics={analytics} /> : <InvoiceDataUnavailable title="Remaining Quantity" />}
      </div>

      <QuantityTable projects={projects} />
    </div>
  );
}
