import { ExecutiveSummaryCards } from "./ExecutiveSummaryCards";
import { ExecutiveSummaryCharts } from "./ExecutiveSummaryCharts";
import { ExecutiveSummaryTable } from "./ExecutiveSummaryTable";

interface Props {
  projects: any[];
  analytics: any;
  onDrillDown?: (target: string) => void;
  /** Reports PR No. filter, passed through to the registry table's Export PDF button. */
  selectedPrNo?: string;
  /** false = the viewer has no Invoices module access (invoice figures shown as "Not available"). */
  invoiceDataAvailable?: boolean;
}

export function ExecutiveSummary({ projects, analytics, onDrillDown, selectedPrNo, invoiceDataAvailable = true }: Props) {
  return (
    <div className="space-y-5 nu-fade-in">
      <ExecutiveSummaryCards analytics={analytics} onDrillDown={onDrillDown} invoiceDataAvailable={invoiceDataAvailable} />
      <ExecutiveSummaryCharts projects={projects} analytics={analytics} />
      <ExecutiveSummaryTable projects={projects} selectedPrNo={selectedPrNo} invoiceDataAvailable={invoiceDataAvailable} />
    </div>
  );
}
