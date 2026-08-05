import { Briefcase, CheckCircle2, PauseCircle, XCircle } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { ProjectStatusChart } from "./ProjectStatusChart";
import { DelayAnalysis } from "./DelayAnalysis";
import { ProjectPerformanceTable } from "./ProjectPerformanceTable";

interface Props {
  projects: any[];
  analytics: any;
}

export function ProjectPerformance({ projects, analytics }: Props) {
  const c = analytics.projectCounts;

  return (
    <div className="space-y-5 nu-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIReportCard
          title="Active Projects"
          value={c.active}
          subtitle="In Progress & Live"
          icon={<Briefcase size={18} />}
          tone="emerald"
        />

        <KPIReportCard
          title="Completed Contracts"
          value={c.completed}
          subtitle="Finished & Delivered"
          icon={<CheckCircle2 size={18} />}
          tone="blue"
        />

        <KPIReportCard
          title="On Hold / Deferred"
          value={c.hold}
          subtitle="Pending Client Clearance"
          icon={<PauseCircle size={18} />}
          tone="amber"
        />

        <KPIReportCard
          title="Cancelled Projects"
          value={c.cancelled}
          subtitle="Terminated"
          icon={<XCircle size={18} />}
          tone="rose"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProjectStatusChart analytics={analytics} />
        <DelayAnalysis projects={projects} />
      </div>

      <ProjectPerformanceTable projects={projects} />
    </div>
  );
}
