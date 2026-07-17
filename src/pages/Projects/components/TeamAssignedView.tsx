import {
  Users,
  Clock,
  UserCheck,
  Building,
  IndianRupee,
} from "lucide-react";

import type { Project } from "../../../types/Project";
import { getEmployees } from "../../../services/employeeService";
import { getAllTimesheetImports } from "../../../services/timesheetService";
import { getLiveProjectMonths, getLiveTeamMembers } from "../../../services/timesheetSyncService";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { StatTile } from "../../../components/ui/StatTile";
import ExpandableTeamMembersCard from "./ExpandableTeamMembersCard";

interface Props {
  project: Project;
}

const LEADERSHIP_FIELDS: Array<{ label: string; icon: typeof UserCheck; key: keyof Project }> = [
  { label: "Primary PM", icon: UserCheck, key: "primaryProjectManager" },
  { label: "Secondary PM", icon: UserCheck, key: "secondaryProjectManager" },
  { label: "Project Coordinator", icon: UserCheck, key: "projectCoordinator" },
  { label: "Project Engineer", icon: UserCheck, key: "projectEngineer" },
  { label: "Client Coordinator", icon: Building, key: "clientCoordinator" },
];

export default function TeamAssignedView({ project }: Props) {
  const masterEmployees = getEmployees();

  // Employee Summary reads the same live, PR-Number-matched data that the
  // expandable Team Members card below renders — never the project's cached
  // resources snapshot, so the two sections can't disagree.
  const allImports = getAllTimesheetImports();
  const latestMonth = getLiveProjectMonths(project.prNo, allImports)[0];
  const liveResources = getLiveTeamMembers(project.prNo, allImports, latestMonth);

  const uniqueEmployeesCount = liveResources.length;
  const totalHoursSum = liveResources.reduce((sum, r) => sum + (r.totalHours || 0), 0);
  const totalManpowerBudget = liveResources.reduce((sum, r) => {
    const emp = masterEmployees.find((e) => e.employeeNo.trim().toLowerCase() === r.employeeNo.trim().toLowerCase());
    const rate = emp ? (emp.manhourExpenses || 0) : 0;
    return sum + (r.totalHours || 0) * rate;
  }, 0);

  return (
    <div className="space-y-3.5">
      {/* Project Leadership */}
      <Card padded={false}>
        <CardHeader icon={<UserCheck size={16} />} title="Project Leadership" subtitle="Key personnel assigned to this project" />
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {LEADERSHIP_FIELDS.map(({ label, icon: Icon, key }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-3"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--nu-radius-md)] bg-[var(--nu-accent-soft)] text-[var(--nu-accent)]">
                  <Icon size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--nu-text-muted)]">{label}</p>
                  <p className="mt-0.5 text-[13px] font-semibold text-[var(--nu-text)] truncate" title={String(project[key] ?? "")}>
                    {(project[key] as string) || "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatTile icon={<Users size={15} />} label="Team Members" value={String(uniqueEmployeesCount)} tint="accent" />
        <StatTile
          icon={<Clock size={15} />}
          label="Total Hours Budget"
          value={`${totalHoursSum.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Hrs`}
          tint="success"
        />
        <StatTile
          icon={<IndianRupee size={15} />}
          label="Total Project Budget"
          value={`₹${(project.workOrderValueINR || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
          tint="info"
        />
        <StatTile
          icon={<IndianRupee size={15} />}
          label="Total Manpower Budget"
          value={`₹${totalManpowerBudget.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
          tint="warning"
        />
      </div>

      {/* Team Members — read-only, live-synced, with expandable daily entries */}
      <ExpandableTeamMembersCard project={project} />
    </div>
  );
}
