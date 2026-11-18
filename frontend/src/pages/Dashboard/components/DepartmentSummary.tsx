import React, { useMemo, useState } from "react";
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
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  CalendarCheck,
  Flame,
  Table as TableIcon,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader } from "../../../components/ui/Card";
import { moneyFormatter } from "../../../utils/currencyDisplay";
import { useDashboardSummary } from "../DashboardSummaryContext";
import { departmentSections, sectionTitle } from "../../../utils/dashboardCountrySections";

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

const DepartmentSummary: React.FC = () => {
  const navigate = useNavigate();
  const summary = useDashboardSummary();
  const { departments, kpiCurrency = "INR" } = summary;
  // Work order values are shown per country, each in its own currency (Phase 4 final): a single-country view is one section and reads exactly as before;
  // All Countries shows a titled section per country. Counts and percentages below stay overall, because they carry no currency.
  const sections = useMemo(() => departmentSections(summary), [summary]);
  const titled = sections.length > 1;
  // All Countries: each country is a collapsible section. With one or two countries they start open; with more they start collapsed, because the country header already
  // carries the summary (departments, projects, team, average completion and that country's top Work Order Value department). Presentation state only.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const defaultOpen = sections.length <= 2;
  const isOpen = (key: string): boolean => !titled || (overrides[key] ?? defaultOpen);
  const setAllOpen = (open: boolean): void => setOverrides(Object.fromEntries(sections.map((section) => [section.key, open])));
  const openCount = sections.filter((section) => isOpen(section.key)).length;
  const money = moneyFormatter(sections.length === 1 ? sections[0]!.currency : kpiCurrency);
  const isShown = (dept: (typeof departments.list)[number]) =>
    dept.activeProjects > 0 ||
    dept.completedProjects > 0 ||
    dept.onHoldProjects > 0 ||
    dept.delayedProjects > 0 ||
    dept.teamMembers > 0 ||
    dept.workOrderValue > 0;
  // The table: one block per country (its own currency), or the single list as before.
  const tableGroups = useMemo(
    () =>
      sections.map((s) => ({
        key: s.key,
        label: titled ? sectionTitle(s) : null,
        money: moneyFormatter(s.currency),
        totals: s.data.totals,
        list: s.data.list.filter(isShown),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, titled]
  );
  // Highest work order value: compared only WITHIN a country, so each country names its own leader in its own currency.
  const highestWoBySection = useMemo(
    () =>
      sections
        .map((s) => {
          const top = [...s.data.list].filter(isShown).sort((a, b) => b.workOrderValue - a.workOrderValue)[0];
          return top ? { key: s.key, title: sectionTitle(s), department: top.department, value: moneyFormatter(s.currency).compact(top.workOrderValue) } : null;
        })
        .filter((x): x is { key: string; title: string; department: string; value: string } => x !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections]
  );
  const deptList = useMemo(
    () =>
      departments.list.filter(
        (dept) =>
          dept.activeProjects > 0 ||
          dept.completedProjects > 0 ||
          dept.onHoldProjects > 0 ||
          dept.delayedProjects > 0 ||
          dept.teamMembers > 0 ||
          dept.workOrderValue > 0
      ),
    [departments.list]
  );

  const totals = {
    ...departments.totals,
    departments: deptList.length,
  };

  // Quick Insights calculated dynamically from active department data
  const highestWorkloadDept = useMemo(() => {
    if (deptList.length === 0) return null;
    return [...deptList].sort((a, b) => b.workloadPercent - a.workloadPercent)[0];
  }, [deptList]);

  const mostDelayedDept = useMemo(() => {
    if (deptList.length === 0) return null;
    return [...deptList].sort((a, b) => b.delayedProjects - a.delayedProjects)[0];
  }, [deptList]);

  const lowestCompletionDept = useMemo(() => {
    if (deptList.length === 0) return null;
    return [...deptList].sort((a, b) => a.completion - b.completion)[0];
  }, [deptList]);

  const highestWODept = useMemo(() => {
    if (deptList.length === 0) return null;
    return [...deptList].sort((a, b) => b.workOrderValue - a.workOrderValue)[0];
  }, [deptList]);

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
                {deptList.length} Departments with projects
              </span>
            </div>

            {/* Department Operation Cards Scrollable Container */}
            <div className="max-h-[230px] overflow-y-auto custom-scrollbar space-y-2 pr-1">
              {deptList.length === 0 ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 px-1 py-6 text-center">
                  No departments with authorized projects. Empty baseline names are not shown.
                </p>
              ) : (
                deptList.map((dept) => {
                  const DeptIcon = getDeptIcon(dept.department);

                  return (
                    <div
                      key={dept.department}
                      className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-2.5 px-3 shadow-xs hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 group"
                    >
                      {/* Card Header: Icon & Name (No composite health/status badge) */}
                      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100 dark:border-slate-800/60">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/70 border border-blue-200/60 dark:border-blue-800/60 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform shrink-0">
                            <DeptIcon size={14} />
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {dept.department}
                          </h4>
                        </div>
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
                })
              )}
            </div>
          </div>

          {/* Section 2: Department Performance Summary Table */}
          <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-xl overflow-hidden shadow-xs">
            <div className="p-2.5 px-3.5 bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <TableIcon size={14} className="text-blue-600 dark:text-blue-400" />
                <h4 className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Department Performance Summary
                </h4>
              </div>
              <div className="flex items-center gap-2">
                {titled && (
                  <>
                    <span data-testid="department-open-count" className="hidden sm:inline text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                      {openCount} of {sections.length} countries open
                    </span>
                    <button
                      type="button"
                      onClick={() => setAllOpen(true)}
                      disabled={openCount === sections.length}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                    >
                      <ChevronsUpDown size={11} aria-hidden="true" /> Expand all
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllOpen(false)}
                      disabled={openCount === 0}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                    >
                      <ChevronsDownUp size={11} aria-hidden="true" /> Collapse all
                    </button>
                  </>
                )}
                <span className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400">
                  {deptList.length} Departments
                </span>
              </div>
            </div>

            <div className={`flex-1 overflow-y-auto overflow-x-auto custom-scrollbar min-h-0 flex flex-col ${titled ? "max-h-[440px]" : ""}`}>
              <table className="w-full text-left text-xs border-collapse flex-1">
                <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-[10px] uppercase font-extrabold text-slate-600 dark:text-slate-400 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-1.5 pl-3 pr-2">Department</th>
                    <th className="px-2 py-1.5 text-center">Active</th>
                    <th className="px-2 py-1.5 text-center">Completed</th>
                    <th className="px-2 py-1.5 text-center">On Hold</th>
                    <th className="px-2 py-1.5 text-center">Delayed</th>
                    <th className="px-2 py-1.5 text-center">Team</th>
                    <th className="px-2 py-1.5 text-center">Completion %</th>
                    <th className="px-2 py-1.5 text-right">WO Value</th>
                    <th className="px-2 py-1.5 pr-3 text-center">Pending Inv</th>
                  </tr>
                </thead>
                {tableGroups.map((group) => {
                  const open = isOpen(group.key);
                  const panelId = `dept-panel-${group.key.replace(/[^A-Za-z0-9_-]/g, "_")}`;
                  const topWo = highestWoBySection.find((row) => row.key === group.key);
                  return (
                    <React.Fragment key={group.key}>
                      {group.label && (
                        <tbody>
                          <tr data-testid="department-section" className="bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200/70 dark:border-slate-700/60">
                            <td colSpan={9} className="p-0">
                              <button
                                type="button"
                                onClick={() => setOverrides((prev) => ({ ...prev, [group.key]: !open }))}
                                aria-expanded={open}
                                aria-controls={panelId}
                                className="w-full flex items-center gap-x-2.5 gap-y-0.5 flex-wrap px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                              >
                                <ChevronRight size={13} aria-hidden="true" className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-90" : ""}`} />
                                <span data-testid="department-section-title" className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                  {group.label}
                                </span>
                                <span data-testid="department-section-summary" className="text-[10.5px] font-semibold text-slate-500 dark:text-slate-400">
                                  {group.list.length} {group.list.length === 1 ? "department" : "departments"} · {group.totals?.totalProjects ?? 0} projects · {group.totals?.teamMembers ?? 0} team · avg {group.totals?.averageCompletion ?? 0}%
                                </span>
                                {topWo && (
                                  <span className="ml-auto text-[10.5px] font-semibold text-slate-500 dark:text-slate-400 truncate max-w-full">
                                    Top WO · {topWo.department} · <span className="font-black font-mono text-emerald-600 dark:text-emerald-400">{topWo.value}</span>
                                  </span>
                                )}
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      )}
                      <tbody
                        id={group.label ? panelId : undefined}
                        hidden={group.label ? !open : false}
                        className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium text-slate-700 dark:text-slate-300 text-[11.5px]"
                      >
                        {group.list.map((dept) => (
                          <tr key={`${group.key}|${dept.department}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-1.5 pl-3 pr-2 font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 truncate max-w-[130px]">
                              <Building2 size={12} className="text-blue-500 shrink-0" />
                              <span className="truncate">{dept.department}</span>
                            </td>
                            <td className="px-2 py-1.5 text-center font-bold text-slate-800 dark:text-slate-200">{dept.activeProjects}</td>
                            <td className="px-2 py-1.5 text-center font-bold text-emerald-600 dark:text-emerald-400">{dept.completedProjects}</td>
                            <td className="px-2 py-1.5 text-center font-bold text-amber-600 dark:text-amber-400">{dept.onHoldProjects}</td>
                            <td className="px-2 py-1.5 text-center font-bold text-rose-600 dark:text-rose-400">{dept.delayedProjects}</td>
                            <td className="px-2 py-1.5 text-center font-bold">{dept.teamMembers}</td>
                            <td className="px-2 py-1.5 text-center">
                              <span className="inline-flex items-center gap-1 font-black text-blue-600 dark:text-blue-400">
                                {dept.completion}%
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {group.money.compact(dept.workOrderValue)}
                            </td>
                            <td className="px-2 py-1.5 pr-3 text-center font-bold text-slate-800 dark:text-slate-200">
                              {dept.pendingInvoices}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </React.Fragment>
                  );
                })}
              </table>
            </div>
          </div>

        </div>

        {/* RIGHT PANEL: Department Analytics (Span 5 cols on lg, flex column stretching to exact height) */}
        <div className="lg:col-span-5 flex flex-col justify-start gap-3.5 self-start w-full">
          <div className="flex items-center gap-2 px-1 shrink-0">
            <TrendingUp size={15} className="text-blue-600 dark:text-blue-400" />
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Department Analytics
            </h3>
          </div>

          {/* CARD 1: Department Quick Insights (4 Dynamic Operational Highlights) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-3.5 shadow-xs space-y-2.5 shrink-0">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Department Quick Insights
              </h4>
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 font-mono">
                Key Operations
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {/* Insight 1: Highest Workload */}
              <div className="p-2 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Highest Workload
                </span>
                <div className="mt-1">
                  <p className="font-bold text-slate-900 dark:text-slate-100 truncate text-[11.5px]" title={highestWorkloadDept?.department || "—"}>
                    {highestWorkloadDept?.department || "—"}
                  </p>
                  <p className="text-sm font-black text-blue-600 dark:text-blue-400 mt-0.5">
                    {highestWorkloadDept ? `${highestWorkloadDept.workloadPercent}%` : "—"}
                  </p>
                </div>
              </div>

              {/* Insight 2: Most Delayed Projects */}
              <div className="p-2 rounded-lg bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                  Most Delayed Projects
                </span>
                <div className="mt-1">
                  <p className="font-bold text-slate-900 dark:text-slate-100 truncate text-[11.5px]" title={mostDelayedDept?.department || "—"}>
                    {mostDelayedDept?.department || "—"}
                  </p>
                  <p className="text-sm font-black text-rose-600 dark:text-rose-400 mt-0.5">
                    {mostDelayedDept ? `${mostDelayedDept.delayedProjects} project${mostDelayedDept.delayedProjects === 1 ? "" : "s"}` : "—"}
                  </p>
                </div>
              </div>

              {/* Insight 3: Lowest Completion */}
              <div className="p-2 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Lowest Completion
                </span>
                <div className="mt-1">
                  <p className="font-bold text-slate-900 dark:text-slate-100 truncate text-[11.5px]" title={lowestCompletionDept?.department || "—"}>
                    {lowestCompletionDept?.department || "—"}
                  </p>
                  <p className="text-sm font-black text-amber-600 dark:text-amber-400 mt-0.5">
                    {lowestCompletionDept ? `${lowestCompletionDept.completion}%` : "—"}
                  </p>
                </div>
              </div>

              {/* Insight 4: Highest WO Value */}
              <div className="p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 flex flex-col justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Highest WO Value
                </span>
                {titled ? (
                  <div className="mt-1 max-h-[64px] overflow-y-auto custom-scrollbar space-y-0.5" data-testid="highest-wo-by-country">
                    {highestWoBySection.map((row) => (
                      <p key={row.key} className="text-[10.5px] leading-tight text-slate-700 dark:text-slate-300 truncate" title={`${row.title}: ${row.department} ${row.value}`}>
                        <span className="font-bold">{row.title}</span> · {row.department} · <span className="font-black font-mono text-emerald-600 dark:text-emerald-400">{row.value}</span>
                      </p>
                    ))}
                  </div>
                ) : (
                <div className="mt-1">
                  <p className="font-bold text-slate-900 dark:text-slate-100 truncate text-[11.5px]" title={highestWODept?.department || "—"}>
                    {highestWODept?.department || "—"}
                  </p>
                  <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono">
                    {highestWODept ? money.compact(highestWODept.workOrderValue) : "—"}
                  </p>
                </div>
                )}
              </div>
            </div>
          </div>

          {/* CARD 2: Department Workload Ranking (Horizontal Ranking Bars) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-3 shadow-xs space-y-2 shrink-0">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2 shrink-0">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Top Department Workload
              </h4>
              <span className="text-[10.5px] font-semibold text-slate-400 dark:text-slate-500">Utilization %</span>
            </div>

            <div className="space-y-1.5">
              {deptList.slice(0, 5).map((dept) => (
                <div key={dept.department} className="space-y-0.5">
                  <div className="flex justify-between items-center text-[11.5px]">
                    <span className="font-bold text-slate-700 dark:text-slate-300 truncate max-w-[170px]">
                      {dept.department}
                    </span>
                    <span className="font-black text-slate-900 dark:text-slate-100">{dept.workloadPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500"
                      style={{ width: `${dept.workloadPercent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CARD 3: Upcoming Department Actions — counts are not in GET /dashboard/summary
              (no agreed data model). Do not display the old frontend heuristic numbers. */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800/90 rounded-xl p-3.5 shadow-xs space-y-2.5 shrink-0">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Upcoming Department Actions
              </h4>
              <Flame size={14} className="text-amber-500" />
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/60">
                <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 mx-auto mb-1" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Due Today</p>
                <p className="text-base font-black text-slate-400 dark:text-slate-500 mt-0.5">—</p>
                <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">Not configured</p>
              </div>

              <div className="p-2 rounded-xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60">
                <CalendarCheck size={15} className="text-amber-600 dark:text-amber-400 mx-auto mb-1" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">This Week</p>
                <p className="text-base font-black text-slate-400 dark:text-slate-500 mt-0.5">—</p>
                <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">Not configured</p>
              </div>

              <div className="p-2 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60">
                <AlertTriangle size={15} className="text-rose-600 dark:text-rose-400 mx-auto mb-1" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">Overdue</p>
                <p className="text-base font-black text-slate-400 dark:text-slate-500 mt-0.5">—</p>
                <p className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5">Not configured</p>
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
