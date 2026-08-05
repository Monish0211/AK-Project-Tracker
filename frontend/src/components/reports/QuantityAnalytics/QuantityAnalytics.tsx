import { Layers, CheckCircle2, Clock, Percent } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { QuantityProgress } from "./QuantityProgress";
import { RemainingQuantityChart } from "./RemainingQuantityChart";
import { QuantityTable } from "./QuantityTable";
import { formatIndianNumber } from "../../../utils/quantityCalculations";

interface Props {
  projects: any[];
  analytics: any;
}

export function QuantityAnalytics({ projects, analytics }: Props) {
  const a = analytics;

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
          value={formatIndianNumber(a.totalInvoicedQty)}
          subtitle="Billed deliverable units"
          icon={<CheckCircle2 size={18} />}
          tone="emerald"
        />

        <KPIReportCard
          title="Remaining Deliverables"
          value={formatIndianNumber(a.remainingQty)}
          subtitle="Unbilled scope units"
          icon={<Clock size={18} />}
          tone="amber"
        />

        <KPIReportCard
          title="Quantity Completion Rate"
          value={`${a.quantityCompletionPercent.toFixed(1)}%`}
          subtitle="Invoiced / Total Ordered"
          trend={a.quantityCompletionPercent >= 80 ? "On Track" : "In Progress"}
          trendType={a.quantityCompletionPercent >= 80 ? "positive" : "neutral"}
          icon={<Percent size={18} />}
          tone="indigo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <QuantityProgress projects={projects} />
        <RemainingQuantityChart analytics={analytics} />
      </div>

      <QuantityTable projects={projects} />
    </div>
  );
}
