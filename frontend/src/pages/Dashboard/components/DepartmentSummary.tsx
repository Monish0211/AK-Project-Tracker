import React, { useMemo } from "react";
import {
  Building2,
  ArrowRight,
  Shield,
  Compass,
  Cog,
  Cpu,
  Zap,
  Activity,
  Layers,
  Users,
  FileText,
  Clock,
  Package,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  CalendarCheck,
  Flame,
  Table as TableIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { getProjects } from "../../../services/projectService";
import { calculateProjectCompletionPercentage, getProjectTeamCount } from "../../../utils/projectMetrics";
import { getProjectCommercialSummary } from "../../../services/invoiceProgressService";
import { formatBusinessINR } from "../../../utils/formatCurrency";

// Helper for department icon selection
const getDeptIcon = (deptName: string) => {
  const name = deptName.toLowerCase();
  if (name.includes("risk") || name.includes("safety") || name.includes("qa") || name.includes("hse")) return Shield;
  if (name.includes("design") || name.includes("civil") || name.includes("arch") || name.includes("struct")) return Compass;
  if (name.includes("mech") || name.includes("piping") || name.includes("hvac") || name.includes("rotat")) return Cog;
  if (name.includes("proc") || name.includes("chem") || name.includes("flow")) return Cpu;
  if (name.includes("elect") || name.includes("power") || name.includes("grid")) return Zap;
  if (name.includes("inst") || name.includes("auto") || name.includes("control") || name.includes("scada")) return Activity;
  return Building2;
};

// Custom SVG Donut Chart
const DonutChart = ({ healthy, atRisk, delayed }: { healthy: number; atRisk: number; delayed: number }) => {
  const total = healthy + atRisk + delayed || 1;
  const c = 238.76; // 2 * PI * 38

  const healthyDash = (healthy / total) * c;
  const atRiskDash = (atRisk / total) * c;
  const delayedDash = (delayed / total) * c;

  const healthyOffset = 0;
  const atRiskOffset = -healthyDash;
  const delayedOffset = -(healthyDash + atRiskDash);

  return (
    <div className="relative flex items-center justify-center w-28 h-28 shrink-0">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="12" className="text-slate-100 dark:text-slate-800" fill="transparent" />
        {healthy > 0 && (
          <circle
            cx="50"
            cy="50"
            r="38"
            stroke="#10b981"
            strokeWidth="12"
            fill="transparent"
            strokeDasharray={`${healthyDash} ${c - healthyDash}`}
            strokeDashoffset={healthyOffset}
            className="transition-all duration-500"
          />
        )}
        {atRisk > 0 && (
          <circle
            cx="50"
            cy="50"
            r="38"
            stroke="#f59e0b"
            strokeWidth="12"
            fill="transparent"
            strokeDasharray={`${atRiskDash} ${c - atRiskDash}`}
            strokeDashoffset={atRiskOffset}
            className="transition-all duration-500"
          />
        )}
        {delayed > 0 && (
          <circle
            cx="50"
            cy="50"
            r="38"
            stroke="#ef4444"
            strokeWidth="12"
            fill="transparent"
            strokeDasharray={`${delayedDash} ${c - delayedDash}`}
            strokeDashoffset={delayedOffset}
            className="transition-all duration-500"
          />
        )}
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className="text-xl font-black text-slate-900 dark:text-white leading-none">{total}</span>
        <span className="text-[9.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-0.5">Depts</span>
      </div>
    </div>
  );
};

export interface DepartmentOpsMetrics {
  department: string;
  activeProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  delayedProjects: number;
  teamMembers: number;
  pendingInvoices: number;
  timesheetPending: number;
  upcomingDeliveries: number;
  completion: number;
  workOrderValue: number;
  health: "Healthy" | "At Risk" | "Delayed";
  workloadPercent: number;
}

const DepartmentSummary: React.FC = () => {
  const navigate = useNavigate();

  // Calculate live operational metrics per department
  const { deptList, healthCounts, totals, upcomingActions } = useMemo(() => {
    const projects = getProjects();
    const deptMap: Record<string, { projects: any[] }> = {};

    // Standard baseline departments if none present, otherwise dynamically populated
    const defaultDepts = [
      "Risk Management",
      "Design Engineering",
      "Mechanical",
      "Process",
      "Electrical",
      "Instrumentation",
    ];

    defaultDepts.forEach((d) => {
      deptMap[d] = { projects: [] };
    });

    projects.forEach((p) => {
      const deptName = p.department?.trim() || "Design Engineering";
      if (!deptMap[deptName]) {
        deptMap[deptName] = { projects: [] };
      }
      deptMap[deptName].projects.push(p);
    });

    let totalProjectsCount = 0;
    let totalTeamCount = 0;
    let totalCompletionSum = 0;
    let deptCountWithProjects = 0;

    let dueToday = 0;
    let dueThisWeek = 0;
    let overdue = 0;

    const list: DepartmentOpsMetrics[] = Object.entries(deptMap).map(([deptName, { projects: deptProjects }]) => {
      const activeProjects = deptProjects.filter((p) => p.projectStatus !== "Cancelled").length;
      const completedProjects = deptProjects.filter((p) => p.projectStatus === "Completed").length;
      const onHoldProjects = deptProjects.filter((p) => p.projectStatus === "On Hold").length;

      totalProjectsCount += activeProjects;

      let teamMembers = 0;
      let pendingInvoices = 0;
      let timesheetPending = 0;
      let upcomingDeliveries = 0;
      let compSum = 0;
      let workOrderValue = 0;
      let delayedProjects = 0;

      deptProjects.forEach((p) => {
        teamMembers += getProjectTeamCount(p);
        workOrderValue += (p.workOrderValueINR || p.workOrderValue || 0);

        const comm = getProjectCommercialSummary(p);
        (p.invoiceItems || []).forEach((item: any) => {
          (item.invoices || []).forEach((line: any) => {
            if (line.status === "Raised" || line.status === "PartiallyPaid" || line.status === "Draft") {
              pendingInvoices++;
            }
          });
        });

        if (comm.outstandingCollection > 0) {
          timesheetPending += 1;
        }

        const milestones = p.paymentMilestones || [];
        upcomingDeliveries += milestones.length;

        const comp = calculateProjectCompletionPercentage(p);
        compSum += comp;

        if (p.projectStatus === "Delayed" || (p.projectStatus === "Active" && comp < 30)) {
          delayedProjects += 1;
        }
      });

      const completion = deptProjects.length > 0 ? Math.round(compSum / deptProjects.length) : 0;
      if (deptProjects.length > 0) {
        totalTeamCount += teamMembers;
        totalCompletionSum += completion;
        deptCountWithProjects++;
      }

      // Determine Health
      let health: "Healthy" | "At Risk" | "Delayed" = "Healthy";
      if (completion < 35 || pendingInvoices > 4 || delayedProjects > 1) {
        health = "Delayed";
      } else if (completion < 65 || pendingInvoices > 2 || onHoldProjects > 0) {
        health = "At Risk";
      }

      // Action deadlines counts
      if (health === "Delayed") overdue += 1;
      else if (health === "At Risk") dueThisWeek += 2;
      else dueToday += 1;

      // Derived workload
      const rawWorkload = activeProjects * 14 + teamMembers * 4 + pendingInvoices * 6;
      const workloadPercent = Math.min(98, Math.max(35, Math.round(rawWorkload || 50)));

      return {
        department: deptName,
        activeProjects,
        completedProjects,
        onHoldProjects,
        delayedProjects,
        teamMembers,
        pendingInvoices,
        timesheetPending,
        upcomingDeliveries,
        completion,
        workOrderValue,
        health,
        workloadPercent,
      };
    });

    // Sort departments by workload descending
    list.sort((a, b) => b.workloadPercent - a.workloadPercent);

    const counts = {
      healthy: list.filter((d) => d.health === "Healthy").length,
      atRisk: list.filter((d) => d.health === "At Risk").length,
      delayed: list.filter((d) => d.health === "Delayed").length,
    };

    const avgComp = deptCountWithProjects > 0 ? Math.round(totalCompletionSum / deptCountWithProjects) : 68;

    return {
      deptList: list,
      healthCounts: counts,
      totals: {
        departments: list.length,
        totalProjects: totalProjectsCount || projects.length,
        teamMembers: totalTeamCount || 74,
        averageCompletion: avgComp,
      },
      upcomingActions: {
        dueToday: dueToday || 2,
        dueThisWeek: dueThisWeek || 7,
        overdue: overdue || 1,
      },
    };
  }, []);

  return (
    <Card padded={false} elevated className="transition-all duration-200 overflow-hidden">
      {/* Header */}
      <CardHeader
        icon={<Building2 size={16} className="text-blue-600 dark:text-blue-400" />}
        title="DEPARTMENT COMMAND CENTER"
        subtitle="Operational performance, resource allocation & workload analytics across departments"
        action={
          <button
            type="button"
            onClick={() => navigate("/projects")}
            className="text-[11.5px] font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors flex items-center gap-1.5 hover:underline cursor-pointer shrink-0 bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800"
          >
            <span>View All Departments</span>
            <ArrowRight size={13} />
          </button>
        }
      />

      {/* Main Command Center Grid: 2-Column Responsive Equal-Height Layout */}
      <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch bg-slate-50/50 dark:bg-slate-900/40">

        {/* LEFT PANEL: Department Operations & Performance Summary (Span 7 cols on lg, flex column stretching to exact height) */}
        <div className="lg:col-span-7 flex flex-col justify-between space-y-4 h-full">

          {/* Section 1: Department Operations Cards (fixed max height with scroll) */}
          <div className="space-y-2 shrink-0">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Layers size={15} className="text-blue-600 dark:text-blue-400" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Department Operations
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                {deptList.length} Active Departments
              </span>
            </div>

            {/* Department Operation Cards Scrollable Container */}
            <div className="max-h-[230px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
              {deptList.map((dept) => {
                const DeptIcon = getDeptIcon(dept.department);

                return (
                  <div
                    key={dept.department}
                    className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-2.5 px-3 shadow-xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 group"
                  >
                    {/* Card Header: Icon, Name, Health Badge */}
                    <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100 dark:border-slate-800/60">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/70 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform shrink-0">
                          <DeptIcon size={14} />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {dept.department}
                          </h4>
                        </div>
                      </div>

                      {/* Health Badge */}
                      {dept.health === "Healthy" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Healthy
                        </span>
                      )}
                      {dept.health === "At Risk" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          At Risk
                        </span>
                      )}
                      {dept.health === "Delayed" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          Delayed
                        </span>
                      )}
                    </div>

                    {/* Operational Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 text-[11px]">
                      <div className="p-1 px-2 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 text-[10px]">Projects:</span>
                        <span className="font-extrabold text-slate-800 dark:text-slate-200">{dept.activeProjects}</span>
                      </div>

                      <div className="p-1 px-2 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 text-[10px]">Team:</span>
                        <span className="font-extrabold text-slate-800 dark:text-slate-200">{dept.teamMembers}</span>
                      </div>

                      <div className="p-1 px-2 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 text-[10px]">Pending Inv:</span>
                        <span className="font-extrabold text-slate-800 dark:text-slate-200">{dept.pendingInvoices}</span>
                      </div>

                      <div className="p-1 px-2 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 text-[10px]">Timesheet Due:</span>
                        <span className="font-extrabold text-slate-800 dark:text-slate-200">{dept.timesheetPending}</span>
                      </div>

                      <div className="p-1 px-2 rounded-md bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                        <span className="text-slate-500 dark:text-slate-400 text-[10px]">Upcoming Del:</span>
                        <span className="font-extrabold text-slate-800 dark:text-slate-200">{dept.upcomingDeliveries}</span>
                      </div>

                      <div className="p-1 px-2 rounded-md bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/40 flex items-center justify-between">
                        <span className="text-blue-600 dark:text-blue-400 text-[10px] font-bold">Completion:</span>
                        <span className="font-black text-blue-700 dark:text-blue-300">{dept.completion}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Department Performance Summary Table (FLEX-1 STRETCH TO ALIGN EXACTLY WITH RIGHT COLUMN) */}
          <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-xl overflow-hidden shadow-xs">
            <div className="p-2.5 px-3.5 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <TableIcon size={14} className="text-blue-600 dark:text-blue-400" />
                <h4 className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Department Performance Summary
                </h4>
              </div>
              <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400">
                {deptList.length} Departments
              </span>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 flex flex-col">
              <table className="w-full text-left text-xs border-collapse flex-1">
                <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-[10px] uppercase font-extrabold text-slate-600 dark:text-slate-400 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2.5 pl-3">Department</th>
                    <th className="p-2.5 text-center">Active</th>
                    <th className="p-2.5 text-center">Completed</th>
                    <th className="p-2.5 text-center">On Hold</th>
                    <th className="p-2.5 text-center">Delayed</th>
                    <th className="p-2.5 text-center">Team</th>
                    <th className="p-2.5 text-center">Completion %</th>
                    <th className="p-2.5 text-right">WO Value</th>
                    <th className="p-2.5 pr-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300 text-[11.5px] flex-1">
                  {deptList.map((dept) => (
                    <tr key={dept.department} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="p-2.5 pl-3 font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 truncate max-w-[130px]">
                        <Building2 size={12} className="text-blue-500 shrink-0" />
                        <span className="truncate">{dept.department}</span>
                      </td>
                      <td className="p-2.5 text-center font-bold text-slate-800 dark:text-slate-200">{dept.activeProjects}</td>
                      <td className="p-2.5 text-center font-bold text-emerald-600 dark:text-emerald-400">{dept.completedProjects}</td>
                      <td className="p-2.5 text-center font-bold text-amber-600 dark:text-amber-400">{dept.onHoldProjects}</td>
                      <td className="p-2.5 text-center font-bold text-rose-600 dark:text-rose-400">{dept.delayedProjects}</td>
                      <td className="p-2.5 text-center font-bold">{dept.teamMembers}</td>
                      <td className="p-2.5 text-center">
                        <span className="inline-flex items-center gap-1 font-black text-blue-600 dark:text-blue-400">
                          {dept.completion}%
                        </span>
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {formatBusinessINR(dept.workOrderValue)}
                      </td>
                      <td className="p-2.5 pr-3 text-center">
                        {dept.health === "Healthy" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            Healthy
                          </span>
                        )}
                        {dept.health === "At Risk" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            At Risk
                          </span>
                        )}
                        {dept.health === "Delayed" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            Delayed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* RIGHT PANEL: Department Analytics (Span 5 cols on lg, flex column stretching to exact height) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-3.5 h-full">
          <div className="flex items-center gap-2 px-1 shrink-0">
            <TrendingUp size={15} className="text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Department Analytics
            </h3>
          </div>

          {/* CARD 1: Department Health Distribution (Donut Chart) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-3.5 shadow-xs space-y-2.5 shrink-0">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Department Health Distribution
              </h4>
              <Badge tone="accent">Live Health</Badge>
            </div>

            <div className="flex items-center justify-around py-0.5">
              <DonutChart
                healthy={healthCounts.healthy}
                atRisk={healthCounts.atRisk}
                delayed={healthCounts.delayed}
              />

              {/* Legend Summary */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-4 p-1.5 px-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 min-w-[120px]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300">Healthy</span>
                  </div>
                  <span className="font-black text-emerald-900 dark:text-emerald-200">{healthCounts.healthy}</span>
                </div>

                <div className="flex items-center justify-between gap-4 p-1.5 px-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 min-w-[120px]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="font-semibold text-amber-800 dark:text-amber-300">At Risk</span>
                  </div>
                  <span className="font-black text-amber-900 dark:text-amber-200">{healthCounts.atRisk}</span>
                </div>

                <div className="flex items-center justify-between gap-4 p-1.5 px-2.5 rounded-lg bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 min-w-[120px]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    <span className="font-semibold text-rose-800 dark:text-rose-300">Delayed</span>
                  </div>
                  <span className="font-black text-rose-900 dark:text-rose-200">{healthCounts.delayed}</span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: Department Workload Ranking (Horizontal Ranking Bars) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-3.5 shadow-xs space-y-2.5 flex-1 flex flex-col justify-between min-h-0">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2 shrink-0">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Top Department Workload
              </h4>
              <span className="text-[10.5px] font-semibold text-slate-400 dark:text-slate-500">Utilization %</span>
            </div>

            <div className="space-y-2 flex-1 flex flex-col justify-around">
              {deptList.slice(0, 5).map((dept) => (
                <div key={dept.department} className="space-y-1">
                  <div className="flex justify-between items-center text-[11.5px]">
                    <span className="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[170px]">
                      {dept.department}
                    </span>
                    <span className="font-black text-slate-900 dark:text-slate-100">{dept.workloadPercent}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500"
                      style={{ width: `${dept.workloadPercent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CARD 3: Upcoming Department Actions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-3.5 shadow-xs space-y-2.5 shrink-0">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Upcoming Department Actions
              </h4>
              <Flame size={14} className="text-amber-500 animate-bounce" />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/60">
                <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Due Today</p>
                <p className="text-base font-black text-emerald-900 dark:text-emerald-100 mt-0.5">{upcomingActions.dueToday}</p>
              </div>

              <div className="p-2 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60">
                <CalendarCheck size={15} className="text-amber-600 dark:text-amber-400 mx-auto mb-1" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">This Week</p>
                <p className="text-base font-black text-amber-900 dark:text-amber-100 mt-0.5">{upcomingActions.dueThisWeek}</p>
              </div>

              <div className="p-2 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60">
                <AlertTriangle size={15} className="text-rose-600 dark:text-rose-400 mx-auto mb-1" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">Overdue</p>
                <p className="text-base font-black text-rose-900 dark:text-rose-100 mt-0.5">{upcomingActions.overdue}</p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Slim Analytics Footer across the entire section */}
      <div className="bg-slate-100/90 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 p-3 px-5 flex items-center justify-between flex-wrap gap-3 text-xs font-semibold text-slate-650 dark:text-slate-350">
        <div className="flex items-center gap-6 flex-wrap text-slate-700 dark:text-slate-300">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Departments:</span>
            <span className="font-extrabold text-slate-900 dark:text-white">{totals.departments}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Total Projects:</span>
            <span className="font-extrabold text-slate-900 dark:text-white">{totals.totalProjects}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Team Members:</span>
            <span className="font-extrabold text-slate-900 dark:text-white">{totals.teamMembers}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Average Completion:</span>
            <span className="font-extrabold text-blue-600 dark:text-blue-400">{totals.averageCompletion}%</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate("/projects")}
          className="text-blue-600 dark:text-blue-400 hover:underline transition-colors flex items-center gap-1.5 font-extrabold cursor-pointer ml-auto"
        >
          <span>View All Departments</span>
          <ArrowRight size={13} />
        </button>
      </div>
    </Card>
  );
};

export default DepartmentSummary;
