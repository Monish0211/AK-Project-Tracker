import { FileCheck, Receipt, DollarSign, Percent } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { MilestoneChart } from "./MilestoneChart";
import { ContractValueChart } from "./ContractValueChart";
import { CommercialTable } from "./CommercialTable";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { INVOICE_NOT_AVAILABLE, NO_INVOICE_ACCESS_HINT, useInvoiceDataAvailable } from "../Shared/invoiceAccess";
import { InvoiceDataUnavailable } from "../Shared/InvoiceDataUnavailable";

interface Props {
  projects: any[];
  analytics: any;
}

export function CommercialAnalytics({ projects, analytics }: Props) {
  const a = analytics;
  const inv = useInvoiceDataAvailable();

  return (
    <div className="space-y-5 nu-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIReportCard
          title="Total Contract Value"
          value={formatBusinessINR(a.totalWOValue)}
          subtitle="Signed Work Order Master Value"
          icon={<FileCheck size={18} />}
          tone="blue"
        />

        <KPIReportCard
          title="Invoiced Revenue"
          value={inv ? formatBusinessINR(a.totalInvoiceRaised) : INVOICE_NOT_AVAILABLE}
          subtitle={inv ? "Realized commercial billing" : NO_INVOICE_ACCESS_HINT}
          icon={<Receipt size={18} />}
          tone="emerald"
        />

        <KPIReportCard
          title="Unbilled Commercial Balance"
          value={inv ? formatBusinessINR(a.balanceToInvoice) : INVOICE_NOT_AVAILABLE}
          subtitle={inv ? "Remaining contract billing" : NO_INVOICE_ACCESS_HINT}
          icon={<DollarSign size={18} />}
          tone="amber"
        />

        <KPIReportCard
          title="Commercial Billed %"
          value={inv ? `${a.totalWOValue > 0 ? ((a.totalInvoiceRaised / a.totalWOValue) * 100).toFixed(1) : 0}%` : INVOICE_NOT_AVAILABLE}
          subtitle={inv ? "Billed / Total Contract" : NO_INVOICE_ACCESS_HINT}
          trend={inv ? "Commercial Run Rate" : undefined}
          trendType="positive"
          icon={<Percent size={18} />}
          tone="indigo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {inv ? <MilestoneChart projects={projects} /> : <InvoiceDataUnavailable title="Milestone Billing" />}
        <ContractValueChart projects={projects} />
      </div>

      <CommercialTable projects={projects} />
    </div>
  );
}
