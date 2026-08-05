import { InvoiceStatusCards } from "./InvoiceStatusCards";
import { MonthlyBillingChart } from "./MonthlyBillingChart";
import { InvoiceAgeingChart } from "./InvoiceAgeingChart";
import { InvoiceLedger } from "./InvoiceLedger";

interface Props {
  projects: any[];
  analytics: any;
}

export function InvoiceAnalytics({ projects, analytics }: Props) {
  return (
    <div className="space-y-5 nu-fade-in">
      <InvoiceStatusCards analytics={analytics} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MonthlyBillingChart projects={projects} />
        <InvoiceAgeingChart ageing={analytics.ageing} />
      </div>

      <InvoiceLedger projects={projects} />
    </div>
  );
}
