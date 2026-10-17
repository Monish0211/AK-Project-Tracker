import { Users, UserCheck, DollarSign, AlertCircle } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { CustomerRevenueChart } from "./CustomerRevenueChart";
import { CustomerOutstanding } from "./CustomerOutstanding";
import { CustomerTable } from "./CustomerTable";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { INVOICE_NOT_AVAILABLE, NO_INVOICE_ACCESS_HINT, useInvoiceDataAvailable } from "../Shared/invoiceAccess";
import { InvoiceDataUnavailable } from "../Shared/InvoiceDataUnavailable";

interface Props {
  analytics: any;
}

export function CustomerAnalytics({ analytics }: Props) {
  const a = analytics;
  const inv = useInvoiceDataAvailable();

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
          value={a.customerList.filter((c: any) => (c.activeProjectCount || 0) > 0).length}
          subtitle="Clients with active contracts"
          icon={<UserCheck size={18} />}
          tone="emerald"
        />

        <KPIReportCard
          title="Total Client Revenue"
          value={inv ? formatBusinessINR(a.totalInvoiceRaised) : INVOICE_NOT_AVAILABLE}
          subtitle={inv ? "Total invoiced across clients" : NO_INVOICE_ACCESS_HINT}
          icon={<DollarSign size={18} />}
          tone="indigo"
        />

        <KPIReportCard
          title="Client Contract Outstanding"
          value={inv ? formatBusinessINR(a.totalOutstanding) : INVOICE_NOT_AVAILABLE}
          subtitle={inv ? "Uncollected client contract balances" : NO_INVOICE_ACCESS_HINT}
          icon={<AlertCircle size={18} />}
          tone="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {inv ? <CustomerRevenueChart customerList={a.customerList} /> : <InvoiceDataUnavailable title="Client Revenue" />}
        {inv ? <CustomerOutstanding customerList={a.customerList} /> : <InvoiceDataUnavailable title="Client Outstanding" />}
      </div>

      <CustomerTable customerList={a.customerList} />
    </div>
  );
}
