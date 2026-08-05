import { ProfitCards } from "./ProfitCards";
import { MarginChart } from "./MarginChart";
import { ProfitByClient } from "./ProfitByClient";
import { ProfitTable } from "./ProfitTable";

interface Props {
  projects: any[];
  analytics: any;
}

export function ProfitabilityAnalytics({ projects, analytics }: Props) {
  return (
    <div className="space-y-5 nu-fade-in">
      <ProfitCards projects={projects} analytics={analytics} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MarginChart projects={projects} />
        <ProfitByClient customerList={analytics.customerList} />
      </div>

      <ProfitTable projects={projects} />
    </div>
  );
}
