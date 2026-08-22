import { UserCheck, Clock, CheckCircle, Percent } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { UtilizationChart } from "./UtilizationChart";
import { BillableChart } from "./BillableChart";
import { EmployeeTable } from "./EmployeeTable";
import { formatBusinessINR } from "../../../utils/formatCurrency";

interface Props {
  projects: any[];
}

export function ManpowerAnalytics({ projects }: Props) {
  let totalHours = 0;
  let totalManhourCost = 0;
  const specialists = new Set<string>();

  projects.forEach((p) => {
    (Array.isArray(p.resources) ? p.resources : []).forEach((r: any) => {
      const hrs = r.totalHours || 0;
      totalHours += hrs;
      totalManhourCost += r.manhourCost || 0;
      if (r.employeeNo || r.employeeName) {
        specialists.add(r.employeeNo || r.employeeName);
      }
    });
  });

  const avgHours = specialists.size > 0 ? (totalHours / specialists.size).toFixed(1) : "0.0";

  return (
    <div className="space-y-5 nu-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIReportCard
          title="Total Specialists"
          value={specialists.size}
          subtitle="Assigned Engineering Resources"
          icon={<UserCheck size={18} />}
          tone="blue"
        />

        <KPIReportCard
          title="Total Logged Hours"
          value={`${totalHours.toLocaleString("en-IN")} hrs`}
          subtitle="Logged on contract activities"
          icon={<Clock size={18} />}
          tone="emerald"
        />

        <KPIReportCard
          title="Total Manhour Cost"
          value={formatBusinessINR(totalManhourCost)}
          subtitle="Timesheet-backed engineering cost"
          icon={<CheckCircle size={18} />}
          tone="slate"
        />

        <KPIReportCard
          title="Avg Hours / Specialist"
          value={`${avgHours} hrs`}
          subtitle="Average hours per resource"
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
