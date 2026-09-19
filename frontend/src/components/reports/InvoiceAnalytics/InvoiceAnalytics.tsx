import { InvoiceStatusCards } from "./InvoiceStatusCards";
import { MonthlyBillingChart } from "./MonthlyBillingChart";
import { InvoiceAgeingChart } from "./InvoiceAgeingChart";
import { InvoiceLedger } from "./InvoiceLedger";
import type { ReportInvoiceLine } from "../../../services/invoiceService";

interface Props {
  projects: any[];
  analytics: any;
  // Reports drill-down fix (Sep 2026) — the same authoritative invoice
  // lines analytics is built from; see useReportsData.ts's own comment.
  invoiceLines: ReportInvoiceLine[];
}

export function InvoiceAnalytics({ projects, analytics, invoiceLines }: Props) {
  return (
    <div className="space-y-5 nu-fade-in">
      <InvoiceStatusCards analytics={analytics} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MonthlyBillingChart projects={projects} invoiceLines={invoiceLines} />
        <InvoiceAgeingChart ageing={analytics.ageing} />
      </div>

      <InvoiceLedger projects={projects} invoiceLines={invoiceLines} />
    </div>
  );
}
