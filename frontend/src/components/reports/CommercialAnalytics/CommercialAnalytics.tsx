import { FileCheck, Receipt, DollarSign, Percent } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { MilestoneChart } from "./MilestoneChart";
import { ContractValueChart } from "./ContractValueChart";
import { CommercialTable } from "./CommercialTable";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  projects: any[];
  analytics: any;
}

export function CommercialAnalytics({ projects, analytics }: Props) {
  const a = analytics;

  return (
    <div className="space-y-5 nu-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIReportCard
          title="Total Contract Value"
          value={`₹ ${formatBusinessINR(a.totalWOValue)}`}
          subtitle="Signed Work Order Master Value"
          icon={<FileCheck size={18} />}
          tone="blue"
        />

        <KPIReportCard
          title="Invoiced Revenue"
          value={`₹ ${formatBusinessINR(a.totalInvoiceRaised)}`}
          subtitle="Realized commercial billing"
          icon={<Receipt size={18} />}
          tone="emerald"
        />

        <KPIReportCard
          title="Unbilled Commercial Balance"
          value={`₹ ${formatBusinessINR(a.balanceToInvoice)}`}
          subtitle="Remaining contract billing"
          icon={<DollarSign size={18} />}
          tone="amber"
        />

        <KPIReportCard
          title="Commercial Billed %"
          value={`${a.totalWOValue > 0 ? ((a.totalInvoiceRaised / a.totalWOValue) * 100).toFixed(1) : 0}%`}
          subtitle="Billed / Total Contract"
          trend="Commercial Run Rate"
          trendType="positive"
          icon={<Percent size={18} />}
          tone="indigo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MilestoneChart projects={projects} />
        <ContractValueChart projects={projects} />
      </div>

      <CommercialTable projects={projects} />
    </div>
  );
}
