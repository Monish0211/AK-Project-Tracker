import { ExecutiveSummaryCards } from "./ExecutiveSummaryCards";
import { ExecutiveSummaryCharts } from "./ExecutiveSummaryCharts";
import { ExecutiveSummaryTable } from "./ExecutiveSummaryTable";

interface Props {
  projects: any[];
  analytics: any;
  onDrillDown?: (target: string) => void;
}

export function ExecutiveSummary({ projects, analytics, onDrillDown }: Props) {
  return (
    <div className="space-y-5 nu-fade-in">
      <ExecutiveSummaryCards analytics={analytics} onDrillDown={onDrillDown} />
      <ExecutiveSummaryCharts projects={projects} analytics={analytics} />
      <ExecutiveSummaryTable projects={projects} />
    </div>
  );
}
