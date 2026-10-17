import { FinancialCards } from "./FinancialCards";
import { RevenueTrendChart } from "./RevenueTrendChart";
import { OutstandingChart } from "./OutstandingChart";
import { ClientFinancialTable } from "./ClientFinancialTable";
import { useInvoiceDataAvailable } from "../Shared/invoiceAccess";
import { InvoiceDataUnavailable } from "../Shared/InvoiceDataUnavailable";

interface Props {
  projects: any[];
  analytics: any;
}

export function FinancialDashboard({ projects, analytics }: Props) {
  const invoiceDataAvailable = useInvoiceDataAvailable();
  return (
    <div className="space-y-5 nu-fade-in">
      <FinancialCards analytics={analytics} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {invoiceDataAvailable ? <RevenueTrendChart projects={projects} /> : <InvoiceDataUnavailable title="Revenue Trend" />}
        {invoiceDataAvailable ? <OutstandingChart customerList={analytics.customerList} /> : <InvoiceDataUnavailable title="Outstanding by Client" />}
      </div>

      <ClientFinancialTable customerList={analytics.customerList} />
    </div>
  );
}
