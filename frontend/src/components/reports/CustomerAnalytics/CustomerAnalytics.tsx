import { Users, UserCheck, DollarSign, AlertCircle } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { CustomerRevenueChart } from "./CustomerRevenueChart";
import { CustomerOutstanding } from "./CustomerOutstanding";
import { CustomerTable } from "./CustomerTable";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  analytics: any;
}

export function CustomerAnalytics({ analytics }: Props) {
  const a = analytics;

  return (
    <div className="space-y-5 nu-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIReportCard
          title="Total Clients"
          value={a.customerList.length}
          subtitle="Registered customer accounts"
          icon={<Users size={18} />}
          tone="blue"
        />

        <KPIReportCard
          title="Active Accounts"
          value={a.customerList.filter((c: any) => c.projectCount > 0).length}
          subtitle="Clients with active contracts"
          icon={<UserCheck size={18} />}
          tone="emerald"
        />

        <KPIReportCard
          title="Total Client Revenue"
          value={formatBusinessINR(a.totalInvoiceRaised)}
          subtitle="Total invoiced across clients"
          icon={<DollarSign size={18} />}
          tone="indigo"
        />

        <KPIReportCard
          title="Client Outstanding Exposure"
          value={formatBusinessINR(a.totalOutstanding)}
          subtitle="Uncollected client balances"
          icon={<AlertCircle size={18} />}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CustomerRevenueChart customerList={a.customerList} />
        <CustomerOutstanding customerList={a.customerList} />
      </div>

      <CustomerTable customerList={a.customerList} />
    </div>
  );
}
