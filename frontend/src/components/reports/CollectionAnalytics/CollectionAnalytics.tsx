import { CollectionCards } from "./CollectionCards";
import { CollectionTrend } from "./CollectionTrend";
import { OverdueTable } from "./OverdueTable";
import type { ReportInvoiceLine } from "../../../services/invoiceService";

interface Props {
  projects: any[];
  analytics: any;
  // Reports drill-down fix (Sep 2026) — see InvoiceAnalytics.tsx's own
  // identical comment; same authoritative source, same reason.
  invoiceLines: ReportInvoiceLine[];
}

export function CollectionAnalytics({ projects, analytics, invoiceLines }: Props) {
  return (
    <div className="space-y-5 nu-fade-in">
      <CollectionCards analytics={analytics} />
      <CollectionTrend projects={projects} invoiceLines={invoiceLines} />
      <OverdueTable projects={projects} invoiceLines={invoiceLines} />
    </div>
  );
}
