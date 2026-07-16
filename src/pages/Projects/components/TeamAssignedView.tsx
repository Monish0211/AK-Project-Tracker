import {
  Users,
  Clock,
  UserCheck,
  Building,
  IndianRupee,
  Table2,
} from "lucide-react";

import type { Project } from "../../../types/Project";
import { getEmployees } from "../../../services/employeeService";
import { Card, CardBody, CardHeader } from "../../../components/ui/Card";
import { StatTile } from "../../../components/ui/StatTile";
import { Badge } from "../../../components/ui/Badge";
import { EmptyState } from "../../../components/ui/EmptyState";

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

  const uniqueEmployeesCount = new Set(project.resources?.map(r => r.employeeNo.trim().toLowerCase()) || []).size;
  const totalHoursSum = project.resources?.reduce((sum, r) => sum + (r.totalHours || 0), 0) || 0;
  const totalManpowerBudget = project.resources?.reduce((sum, r) => {
    const emp = masterEmployees.find(e => e.employeeNo.trim().toLowerCase() === r.employeeNo.trim().toLowerCase());
    const rate = emp ? (emp.manhourExpenses || 0) : 0;
    return sum + (r.totalHours || 0) * rate;
  }, 0) || 0;

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

      {/* Team Members Table */}
      <Card padded={false}>
        <CardHeader icon={<Table2 size={16} />} title="Assigned Resources" subtitle="Manpower allocated to this project" />
        {!project.resources || project.resources.length === 0 ? (
          <CardBody>
            <EmptyState icon={<Users size={22} />} title="No Team Members Assigned" description="No manpower has been assigned to this project yet." />
          </CardBody>
        ) : (
          <div className="overflow-x-auto nu-scrollbar">
            <table className="w-full min-w-[1000px] border-collapse text-left text-[13px]">
              <thead className="bg-[var(--nu-surface-alt)] text-[var(--nu-text-muted)] font-semibold uppercase text-[11px] tracking-wide border-b border-[var(--nu-border)]">
                <tr>
                  <th className="px-4 py-2.5">Employee No</th>
                  <th className="px-4 py-2.5">Employee Name</th>
                  <th className="px-4 py-2.5">Designation</th>
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5">Reporting Manager</th>
                  <th className="px-4 py-2.5 w-32">Start Date</th>
                  <th className="px-4 py-2.5 w-32">End Date</th>
                  <th className="px-4 py-2.5 text-center w-28">Working Days</th>
                  <th className="px-4 py-2.5 text-right w-28">Total Hours</th>
                  <th className="px-4 py-2.5 text-right w-32">Man-hour Expenses</th>
                  <th className="px-4 py-2.5 text-right w-36">Employee Cost</th>
                  <th className="px-4 py-2.5 text-center w-28">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--nu-border)]">
                {project.resources.map((res) => {
                  const empMaster = masterEmployees.find(
                    (e) => e.employeeNo.trim().toLowerCase() === res.employeeNo.trim().toLowerCase()
                  );
                  const rate = empMaster ? (empMaster.manhourExpenses || 0) : 0;
                  const cost = (res.totalHours || 0) * rate;

                  return (
                    <tr key={res.id} className="hover:bg-[var(--nu-surface-alt)] transition-colors">
                      <td className="px-4 py-2.5 font-semibold text-[var(--nu-text)]">{res.employeeNo}</td>
                      <td className="px-4 py-2.5 text-[var(--nu-text-secondary)]">{res.employeeName}</td>
                      <td className="px-4 py-2.5 text-[var(--nu-text-secondary)]">{res.designation}</td>
                      <td className="px-4 py-2.5 text-[var(--nu-text-secondary)]">{res.department}</td>
                      <td className="px-4 py-2.5 text-[var(--nu-text-secondary)]">{res.reportingManager || "—"}</td>
                      <td className="px-4 py-2.5 text-[var(--nu-text-secondary)]">{res.startDate || "—"}</td>
                      <td className="px-4 py-2.5 text-[var(--nu-text-secondary)]">{res.endDate || "—"}</td>
                      <td className="px-4 py-2.5 text-center text-[var(--nu-text-secondary)]">{res.workingDays || 0} Days</td>
                      <td className="px-4 py-2.5 text-right font-medium text-[var(--nu-text)]">
                        {(res.totalHours || 0).toLocaleString("en-IN")} Hrs
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-[var(--nu-text)]">₹{rate.toLocaleString("en-IN")}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-[var(--nu-text)]">
                        ₹{cost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge tone={res.status === "Active" ? "success" : "neutral"}>{res.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
