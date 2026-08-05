import { CollectionCards } from "./CollectionCards";
import { CollectionTrend } from "./CollectionTrend";
import { OverdueTable } from "./OverdueTable";

interface Props {
  projects: any[];
  analytics: any;
}

export function CollectionAnalytics({ projects, analytics }: Props) {
  return (
    <div className="space-y-5 nu-fade-in">
      <CollectionCards analytics={analytics} />
      <CollectionTrend projects={projects} />
      <OverdueTable projects={projects} />
    </div>
  );
}
