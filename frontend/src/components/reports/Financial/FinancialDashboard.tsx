import { FinancialCards } from "./FinancialCards";
import { RevenueTrendChart } from "./RevenueTrendChart";
import { OutstandingChart } from "./OutstandingChart";
import { ClientFinancialTable } from "./ClientFinancialTable";

interface Props {
  projects: any[];
  analytics: any;
}

export function FinancialDashboard({ projects, analytics }: Props) {
  return (
    <div className="space-y-5 nu-fade-in">
      <FinancialCards analytics={analytics} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RevenueTrendChart projects={projects} />
        <OutstandingChart customerList={analytics.customerList} />
      </div>

      <ClientFinancialTable customerList={analytics.customerList} />
    </div>
  );
}
