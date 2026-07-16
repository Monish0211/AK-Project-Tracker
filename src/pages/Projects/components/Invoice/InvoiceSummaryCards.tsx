import {
  Clock,
  FileText,
  IndianRupee,
  TrendingUp,
  Wallet,
} from "lucide-react";

import type { Project } from "../../../../types/Project";
import {
  getProjectCommercialSummary,
} from "../../../../services/invoiceProgressService";
import { formatIndianCurrency } from "../../../../utils/quantityCalculations";
import { StatTile } from "../../../../components/ui/StatTile";

interface Props {
  project: Project;
}

const InvoiceSummaryCards = ({ project }: Props) => {
  const summary = getProjectCommercialSummary(project);

  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatTile
        icon={<IndianRupee size={15} />}
        label="Total Project Value"
        value={formatIndianCurrency(summary.projectValueINR)}
        tint="accent"
      />

      <StatTile
        icon={<FileText size={15} />}
        label="Total Invoice Raised"
        value={formatIndianCurrency(summary.totalInvoiceRaised)}
        tint="info"
      />

      <StatTile
        icon={<Wallet size={15} />}
        label="Balance Remaining"
        value={formatIndianCurrency(summary.pendingDue)}
        tint="warning"
      />

      <StatTile
        icon={<TrendingUp size={15} />}
        label="Invoice Completion %"
        value={`${summary.invoiceCompletionPercent.toFixed(2)}%`}
        tint="success"
      />

      <StatTile icon={<FileText size={15} />} label="Invoices Raised" value={String(summary.invoicesRaisedCount)} tint="accent" />

      <StatTile
        icon={<Clock size={15} />}
        label="Outstanding Collection"
        value={formatIndianCurrency(summary.outstandingCollection)}
        tint="danger"
      />
    </div>
  );
};

export default InvoiceSummaryCards;
