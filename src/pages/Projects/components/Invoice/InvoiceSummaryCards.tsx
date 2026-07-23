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
import { formatBusinessINR } from "../../../../utils/formatCurrency";
import { StatTile } from "../../../../components/ui/StatTile";

interface Props {
  project: Project;
}

const InvoiceSummaryCards = ({ project }: Props) => {
  const summary = getProjectCommercialSummary(project);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3.5">
      <StatTile
        icon={<IndianRupee size={15} />}
        label="Total Project Value"
        value={formatBusinessINR(summary.projectValueINR)}
        tint="accent"
      />

      <StatTile
        icon={<FileText size={15} />}
        label="Total Invoice Raised"
        value={formatBusinessINR(summary.totalInvoiceRaised)}
        tint="info"
      />

      <StatTile
        icon={<Wallet size={15} />}
        label="Balance Remaining"
        value={formatBusinessINR(summary.pendingDue)}
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
        value={formatBusinessINR(summary.outstandingCollection)}
        tint="danger"
      />
    </div>
  );
};

export default InvoiceSummaryCards;
