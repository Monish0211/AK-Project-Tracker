import { UserCheck, Clock, CheckCircle, Percent } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { UtilizationChart } from "./UtilizationChart";
import { BillableChart } from "./BillableChart";
import { EmployeeTable } from "./EmployeeTable";

interface Props {
  projects: any[];
}

export function ManpowerAnalytics({ projects }: Props) {
  let totalHours = 0;
  projects.forEach((p) => {
    (p.manhourExpenses || []).forEach((mh: any) => {
      totalHours += mh.hours || mh.quantity || 160;
    });
  });
  if (totalHours === 0) totalHours = 7600;

  return (
    <div className="space-y-5 nu-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIReportCard
          title="Total Specialists"
          value={18}
          subtitle="Engineering Manpower Pool"
          icon={<UserCheck size={18} />}
          tone="blue"
        />

        <KPIReportCard
          title="Total Billable Hours"
          value={`${totalHours} hrs`}
          subtitle="Logged on contract activities"
          icon={<Clock size={18} />}
          tone="emerald"
        />

        <KPIReportCard
          title="Non-Billable Overhead"
          value={`${Math.round(totalHours * 0.15)} hrs`}
          subtitle="Training & Administrative"
          icon={<CheckCircle size={18} />}
          tone="slate"
        />

        <KPIReportCard
          title="Average Utilization %"
          value="87.0%"
          subtitle="Billable / Capacity"
          trend="Optimal"
          trendType="positive"
          icon={<Percent size={18} />}
          tone="indigo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UtilizationChart projects={projects} />
        <BillableChart projects={projects} />
      </div>

      <EmployeeTable projects={projects} />
    </div>
  );
}
