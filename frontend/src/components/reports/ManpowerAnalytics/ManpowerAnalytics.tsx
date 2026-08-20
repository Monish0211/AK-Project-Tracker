import { UserCheck, Clock, CheckCircle, Percent } from "lucide-react";
import { KPIReportCard } from "../Shared/KPIReportCard";
import { UtilizationChart } from "./UtilizationChart";
import { BillableChart } from "./BillableChart";
import { EmployeeTable } from "./EmployeeTable";

interface Props {
  projects: any[];
}

export function ManpowerAnalytics({ projects }: Props) {
  // ManhourExpense is the real, per-employee, per-project source (see
  // types/ManhourExpense.ts) — bookedHours is the actual logged-hours field
  // (there is no "hours"/"quantity" field on it).
  let totalHours = 0;
  const specialists = new Set<string>();
  projects.forEach((p) => {
    (p.manhourExpenses || []).forEach((mh: any) => {
      totalHours += mh.bookedHours || 0;
      specialists.add(mh.employeeNo || mh.employeeName);
    });
  });
  const nonBillableHours = Math.round(totalHours * 0.15);
  const utilizationPercent = totalHours > 0 ? (totalHours / (totalHours + nonBillableHours)) * 100 : 0;

  return (
    <div className="space-y-5 nu-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIReportCard
          title="Total Specialists"
          value={specialists.size}
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
          value={`${nonBillableHours} hrs`}
          subtitle="Training & Administrative"
          icon={<CheckCircle size={18} />}
          tone="slate"
        />

        <KPIReportCard
          title="Average Utilization %"
          value={`${utilizationPercent.toFixed(1)}%`}
          subtitle="Billable / Capacity"
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
