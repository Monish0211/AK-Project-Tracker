import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Calendar,
  Clock,
  CheckCircle,
  RefreshCw,
  Users,
  IndianRupee,
  Briefcase,
  UserCog,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { Project } from "../../../types/Project";
import {
  getProcessedProjectMonths,
  hasProcessedTimesheetData,
  getProcessedTeamMembers,
} from "../../../services/timesheetProcessingService";
import {
  ensureTimesheetImportsFresh,
  formatDisplayDate,
  formatMonthDisplay,
  getAllTimesheetImports,
  refreshTimesheetImportsFromBackend,
} from "../../../services/timesheetService";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { StatTile } from "../../../components/ui/StatTile";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { EmptyState } from "../../../components/ui/EmptyState";

interface Props {
  project: Project;
}

import { formatBusinessINR } from "../../../utils/formatCurrency";

const fmtINR = (v: number) => formatBusinessINR(v || 0);
const fmtINR2 = (v: number) =>
  `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtHrs = (v: number) => `${v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} hrs`;

// Sentinel for the "All" month filter — not a real "YYYY-MM" key, so it can
// never collide with an actual imported month.
const ALL_MONTHS = "ALL";

const InfoField = ({ label, value, accent }: { label: string; value: string; accent?: boolean }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--nu-text-muted)]">{label}</p>
    <p
      className={`mt-0.5 text-[12.5px] font-semibold truncate ${accent ? "text-[var(--nu-accent)]" : "text-[var(--nu-text)]"}`}
      title={value}
    >
      {value}
    </p>
  </div>
);

// Team Assigned matches Project Code = PR Number live against the raw
// timesheet data — it never depends on the one-time push-sync snapshot
// stored on the project, so it can't go stale if the project's PR Number is
// created or edited after a timesheet was already imported. Manpower rate,
// grade, designation etc. are looked up fresh from the Employee Master on
// every render too, never duplicated onto the project.
const ExpandableTeamMembersCard = ({ project }: Props) => {
  const [allImports, setAllImports] = useState(() => getAllTimesheetImports());
  const [expandedEmployeeNo, setExpandedEmployeeNo] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  // "All" is the default view — a full project lifetime rollup across every
  // imported month — with each specific month still selectable to drill down.
  const [selectedMonth, setSelectedMonth] = useState<string>(ALL_MONTHS);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Priority #5C — surfaces a failed EXPLICIT (button-triggered) backend
  // refresh only. The passive on-mount sync below deliberately does not set
  // this (see its own comment) — it silently keeps whatever was already
  // cached, matching Timesheets.tsx's own "non-fatal on failure" precedent.
  const [syncError, setSyncError] = useState<string | null>(null);

  const availableMonths = getProcessedProjectMonths(project.prNo, allImports);
  const hasSyncedData = hasProcessedTimesheetData(project.prNo, allImports);

  // "All" is always a valid selection. Only fall back to it if a specific
  // month was selected and that month has since disappeared (e.g. deleted
  // from the Timesheets module).
  useEffect(() => {
    if (selectedMonth !== ALL_MONTHS && availableMonths.length > 0 && !availableMonths.includes(selectedMonth)) {
      setSelectedMonth(ALL_MONTHS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableMonths.join(",")]);

  // Priority #5C — Team Assigned previously only ever read whatever was
  // already sitting in localStorage, which could be arbitrarily stale (e.g.
  // still reflecting a TimesheetEntry the backend has since reconciled or a
  // duplicate that's since been cleaned up — see the 0533/PR12006/17.14h
  // case). On mount, ask the SAME backend-sync function Timesheets.tsx
  // already uses (ensureTimesheetImportsFresh() de-dupes/cools-down around
  // refreshTimesheetImportsFromBackend() — see timesheetService.ts) to bring
  // `timesheets_imports` up to date, then re-read it. `allImports` already
  // starts populated from cached localStorage (useState above), so the card
  // renders immediately with last-known data and simply re-renders with
  // fresh data once this resolves — never a blank screen, and a failed
  // refresh (network/API down) leaves the existing cached render exactly as
  // it was, per ensureTimesheetImportsFresh()'s own "never throws" contract.
  useEffect(() => {
    let cancelled = false;
    ensureTimesheetImportsFresh().then(() => {
      if (!cancelled) setAllImports(getAllTimesheetImports());
    });
    return () => {
      cancelled = true;
    };
    // Re-sync when the viewed project changes (e.g. navigating between two
    // projects' Team Assigned tabs) — not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.prNo]);

  // Keep in sync with the Timesheets module (and Manpower rate changes)
  // without requiring a manual refresh or a page reload. Unchanged by
  // Priority #5C — this only ever re-reads localStorage locally, it never
  // calls the backend, so it isn't the "aggressive polling" that fix was
  // told to avoid.
  useEffect(() => {
    const interval = setInterval(() => {
      setAllImports(getAllTimesheetImports());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Priority #5C — previously just re-read the same (possibly stale)
  // localStorage snapshot (`setAllImports(getAllTimesheetImports())`),
  // which is why clicking Refresh never actually fixed a stale display. Now
  // performs a real backend sync, same as Timesheets.tsx's own explicit
  // actions — an explicit user click always hits the backend (bypassing
  // ensureTimesheetImportsFresh()'s cool-down, which is only meant for
  // passive/automatic callers), and a failure is surfaced inline rather
  // than silently swallowed, matching Timesheets.tsx's actionError
  // convention for user-triggered actions.
  const handleRefresh = async () => {
    setIsRefreshing(true);
    setSyncError(null);
    try {
      await refreshTimesheetImportsFromBackend();
      setAllImports(getAllTimesheetImports());
    } catch (err) {
      setSyncError("Could not refresh from the server. Showing the last known data.");
      console.warn("Team Assigned: manual backend refresh failed.", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Consolidated per-employee summaries — Total Hours, Working Days (unique
  // dates only), Hourly Rate and Man-Hour Cost all come from the single
  // TimesheetProcessingService, which groups raw entries by Employee Number
  // + Project Number + Work Date. Each summary carries `.days`, one
  // consolidated row per date with the original raw rows for that day
  // preserved for drill-down/audit. Passing `undefined` (the "All" case)
  // makes the engine aggregate across every imported month instead of one.
  const monthFilter = selectedMonth === ALL_MONTHS ? undefined : selectedMonth;
  const employees = getProcessedTeamMembers(project.prNo, allImports, monthFilter);

  const resourceSummary = useMemo(() => {
    const totalEmployees = employees.length;
    const totalHours = employees.reduce((sum, e) => sum + (e.totalHours || 0), 0);
    const totalWorkingDays = employees.reduce((sum, e) => sum + (e.workingDays || 0), 0);
    const totalManHourCost = employees.reduce((sum, e) => sum + e.totalCost, 0);
    const avgHoursPerEmployee = totalEmployees > 0 ? totalHours / totalEmployees : 0;
    const avgHourlyRate =
      totalEmployees > 0 ? employees.reduce((sum, e) => sum + e.hourlyRate, 0) / totalEmployees : 0;

    return { totalEmployees, totalHours, totalWorkingDays, totalManHourCost, avgHoursPerEmployee, avgHourlyRate };
  }, [employees]);


  const handleExpandToggle = (employeeNo: string) => {
    setExpandedEmployeeNo(expandedEmployeeNo === employeeNo ? null : employeeNo);
    setExpandedDates(new Set());
  };

  const handleDateToggle = (employeeNo: string, date: string) => {
    const key = `${employeeNo}|${date}`;
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-3.5">
      {/* Header */}
      <Card padded={false}>
        <CardHeader
          icon={<Users size={15} />}
          title="Team Assigned"
          subtitle={
            hasSyncedData ? "Automatically synced from imported Timesheets" : "No timesheet data imported yet"
          }
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={13} className={isRefreshing ? "animate-spin" : ""} />}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              Refresh
            </Button>
          }
        />
        {syncError && (
          <CardBody>
            <p className="text-[12px] text-[var(--nu-danger)]">{syncError}</p>
          </CardBody>
        )}
        {availableMonths.length > 0 && (
          <CardBody>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedMonth(ALL_MONTHS);
                  setExpandedEmployeeNo(null);
                  setExpandedDates(new Set());
                }}
                className={`px-3 py-1.5 rounded-[var(--nu-radius-md)] text-[12px] font-medium transition ${
                  selectedMonth === ALL_MONTHS
                    ? "bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] border border-[var(--nu-accent)]"
                    : "bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] border border-[var(--nu-border)] hover:border-[var(--nu-border-strong)]"
                }`}
              >
                All
              </button>
              {availableMonths.map((month) => (
                <button
                  key={month}
                  type="button"
                  onClick={() => {
                    setSelectedMonth(month);
                    setExpandedEmployeeNo(null);
                    setExpandedDates(new Set());
                  }}
                  className={`px-3 py-1.5 rounded-[var(--nu-radius-md)] text-[12px] font-medium transition ${
                    selectedMonth === month
                      ? "bg-[var(--nu-accent-soft)] text-[var(--nu-accent)] border border-[var(--nu-accent)]"
                      : "bg-[var(--nu-surface-alt)] text-[var(--nu-text-secondary)] border border-[var(--nu-border)] hover:border-[var(--nu-border-strong)]"
                  }`}
                >
                  {formatMonthDisplay(month)}
                </button>
              ))}
            </div>
          </CardBody>
        )}
      </Card>

      {!hasSyncedData ? (
        <Card>
          <EmptyState
            icon={<Calendar size={18} />}
            title="No Team Members Synced"
            description={`Import a timesheet with a Project Code matching this project's PR Number (${project.prNo || "—"}) to automatically sync team members.`}
          />
        </Card>
      ) : employees.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle size={18} />}
            title={`No Employees for ${selectedMonth === ALL_MONTHS ? "Any Month" : formatMonthDisplay(selectedMonth)}`}
            description="Select a different month or import a new timesheet."
          />
        </Card>
      ) : (
        <>
          {/* Project Resource Summary Cards */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
            <StatTile
              icon={<Users size={14} />}
              label="Total Employees"
              value={String(resourceSummary.totalEmployees)}
              tint="accent"
            />
            <StatTile icon={<Clock size={14} />} label="Total Hours" value={fmtHrs(resourceSummary.totalHours)} tint="success" />
            <StatTile
              icon={<Calendar size={14} />}
              label="Total Working Days"
              value={`${resourceSummary.totalWorkingDays} days`}
              tint="info"
            />
            <StatTile
              icon={<IndianRupee size={14} />}
              label="Total Man-Hour Cost"
              value={fmtINR(resourceSummary.totalManHourCost)}
              tint="warning"
            />
            <StatTile
              icon={<TrendingUp size={14} />}
              label="Avg Hours / Employee"
              value={resourceSummary.avgHoursPerEmployee.toFixed(1)}
              tint="accent"
            />
            <StatTile icon={<Wallet size={14} />} label="Avg Hourly Rate" value={fmtINR(resourceSummary.avgHourlyRate)} tint="info" />
          </div>

          {/* Team Members Table */}
          <Card padded={false}>
            <div className="overflow-x-auto nu-scrollbar">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-[var(--nu-surface-alt)] text-[10.5px] uppercase tracking-wide text-[var(--nu-text-muted)] border-b border-[var(--nu-border)]">
                    <th className="px-4 py-2.5 w-8 sticky top-0 left-0 z-30 bg-[var(--nu-surface-alt)]"></th>
                    <th className="px-4 py-2.5 font-medium sticky top-0 left-8 z-30 bg-[var(--nu-surface-alt)]">Employee No</th>
                    <th className="px-4 py-2.5 font-medium sticky top-0 z-20 bg-[var(--nu-surface-alt)]">Employee Name</th>
                    <th className="px-4 py-2.5 font-medium sticky top-0 z-20 bg-[var(--nu-surface-alt)]">Designation</th>
                    <th className="px-4 py-2.5 font-medium sticky top-0 z-20 bg-[var(--nu-surface-alt)]">Department</th>
                    <th className="px-4 py-2.5 font-medium sticky top-0 z-20 bg-[var(--nu-surface-alt)]">Reporting Manager</th>
                    <th className="px-4 py-2.5 text-right font-medium w-28 sticky top-0 z-20 bg-[var(--nu-surface-alt)]">Hourly Rate</th>
                    <th className="px-4 py-2.5 text-center font-medium w-24 sticky top-0 z-20 bg-[var(--nu-surface-alt)]">Working Days</th>
                    <th className="px-4 py-2.5 text-right font-medium w-24 sticky top-0 z-20 bg-[var(--nu-surface-alt)]">Total Hours</th>
                    <th className="px-4 py-2.5 text-right font-medium w-32 sticky top-0 z-20 bg-[var(--nu-surface-alt)]">Man-Hour Cost</th>
                    <th className="px-4 py-2.5 text-center font-medium w-24 sticky top-0 z-20 bg-[var(--nu-surface-alt)]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp, index) => {
                    const isExpanded = expandedEmployeeNo === emp.employeeNo;

                    return (
                      <React.Fragment key={emp.employeeNo}>
                        <tr
                          className={`border-b border-[var(--nu-border)] last:border-none hover:bg-[var(--nu-accent-soft)] transition-colors cursor-pointer ${
                            index % 2 === 1 ? "bg-[var(--nu-surface-alt)]" : "bg-[var(--nu-surface)]"
                          }`}
                          onClick={() => handleExpandToggle(emp.employeeNo)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              handleExpandToggle(emp.employeeNo);
                              e.preventDefault();
                            }
                          }}
                        >
                          <td
                            className={`px-4 py-3 text-center sticky left-0 z-10 ${
                              index % 2 === 1 ? "bg-[var(--nu-surface-alt)]" : "bg-[var(--nu-surface)]"
                            }`}
                          >
                            {isExpanded ? (
                              <ChevronDown size={16} className="text-[var(--nu-accent)]" />
                            ) : (
                              <ChevronRight size={16} className="text-[var(--nu-text-muted)]" />
                            )}
                          </td>
                          <td
                            className={`px-4 py-3 text-[12.5px] font-semibold text-[var(--nu-text)] sticky left-8 z-10 ${
                              index % 2 === 1 ? "bg-[var(--nu-surface-alt)]" : "bg-[var(--nu-surface)]"
                            }`}
                          >
                            {emp.employeeNo}
                          </td>
                          <td className="px-4 py-3 text-[12.5px] text-[var(--nu-text)]">{emp.employeeName}</td>
                          <td className="px-4 py-3 text-[12px] text-[var(--nu-text-secondary)]">{emp.designation || "—"}</td>
                          <td className="px-4 py-3 text-[12px] text-[var(--nu-text-secondary)]">{emp.department || "—"}</td>
                          <td className="px-4 py-3 text-[12px] text-[var(--nu-text-secondary)]">{emp.reportingManager || "—"}</td>
                          <td className="px-4 py-3 text-right text-[12.5px] text-[var(--nu-text)]">{fmtINR(emp.hourlyRate)}</td>
                          <td className="px-4 py-3 text-center text-[12px] text-[var(--nu-text-secondary)]">{emp.workingDays} days</td>
                          <td className="px-4 py-3 text-right text-[12.5px] font-medium text-[var(--nu-text)]">
                            {fmtHrs(emp.totalHours)}
                          </td>
                          <td className="px-4 py-3 text-right text-[12.5px] font-semibold text-[var(--nu-text)]">
                            {fmtINR2(emp.totalCost)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge tone={emp.status === "Active" ? "success" : "neutral"}>{emp.status}</Badge>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-[var(--nu-surface-alt)] border-b border-[var(--nu-border)]">
                            <td colSpan={11} className="p-0">
                              <div className="p-5 space-y-4">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  {/* Employee Information */}
                                  <div className="bg-[var(--nu-surface)] rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] p-4">
                                    <h4 className="text-[12px] font-bold text-[var(--nu-text)] mb-3 flex items-center gap-2">
                                      <UserCog size={14} className="text-[var(--nu-accent)]" />
                                      Employee Information
                                    </h4>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                                      <InfoField label="Employee No" value={emp.employeeNo} />
                                      <InfoField label="Employee Name" value={emp.employeeName} />
                                      <InfoField label="Designation" value={emp.designation || "—"} />
                                      <InfoField label="Department" value={emp.department || "—"} />
                                      <InfoField label="Reporting Manager" value={emp.reportingManager || "—"} />
                                      <InfoField label="Grade" value={emp.grade || "—"} />
                                      <InfoField label="Hourly Rate" value={fmtINR(emp.hourlyRate)} />
                                    </div>
                                  </div>

                                  {/* Project Summary */}
                                  <div className="bg-[var(--nu-surface)] rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] p-4">
                                    <h4 className="text-[12px] font-bold text-[var(--nu-text)] mb-3 flex items-center gap-2">
                                      <Briefcase size={14} className="text-[var(--nu-accent)]" />
                                      Project Summary
                                    </h4>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                                      <InfoField label="Project Code" value={emp.projectCode || project.prNo} />
                                      <InfoField label="Project Name" value={emp.projectName || "—"} />
                                      <InfoField label="Start Date" value={formatDisplayDate(emp.startDate)} />
                                      <InfoField label="End Date" value={formatDisplayDate(emp.endDate)} />
                                      <InfoField label="Working Days" value={`${emp.workingDays} days`} />
                                      <InfoField label="Total Hours" value={fmtHrs(emp.totalHours)} />
                                      <InfoField label="Man-Hour Cost" value={fmtINR2(emp.totalCost)} accent />
                                    </div>
                                  </div>
                                </div>

                                {/* Daily Timesheet Entries — one consolidated row per work
                                    date (Employee + Project + Date), expandable to reveal
                                    every raw imported row summed into that day's total. */}
                                {emp.days.length > 0 && (
                                  <div>
                                    <h4 className="text-[12px] font-bold text-[var(--nu-text)] mb-2 flex items-center gap-2">
                                      <Clock size={14} className="text-[var(--nu-accent)]" />
                                      Daily Timesheet Entries
                                    </h4>
                                    <div className="bg-[var(--nu-surface)] rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] overflow-hidden">
                                      <table className="w-full text-[11.5px]">
                                        <thead className="bg-[var(--nu-surface-alt)] border-b border-[var(--nu-border)]">
                                          <tr>
                                            <th className="px-3 py-2 w-6"></th>
                                            <th className="px-3 py-2 text-left font-semibold text-[var(--nu-text-secondary)]">
                                              Date
                                            </th>
                                            <th className="px-3 py-2 text-right font-semibold text-[var(--nu-text-secondary)] w-28">
                                              Total Hours
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {emp.days.map((day) => {
                                            const dateKey = `${emp.employeeNo}|${day.date}`;
                                            const isDateExpanded = expandedDates.has(dateKey);
                                            const hasMultipleEntries = day.entries.length > 1;

                                            return (
                                              <React.Fragment key={dateKey}>
                                                <tr
                                                  className={`border-b border-[var(--nu-border)] last:border-0 hover:bg-[var(--nu-surface-alt)] ${
                                                    hasMultipleEntries ? "cursor-pointer" : ""
                                                  }`}
                                                  onClick={() => hasMultipleEntries && handleDateToggle(emp.employeeNo, day.date)}
                                                >
                                                  <td className="px-3 py-1.5 text-center">
                                                    {hasMultipleEntries &&
                                                      (isDateExpanded ? (
                                                        <ChevronDown size={13} className="text-[var(--nu-accent)]" />
                                                      ) : (
                                                        <ChevronRight size={13} className="text-[var(--nu-text-muted)]" />
                                                      ))}
                                                  </td>
                                                  <td className="px-3 py-1.5 font-medium text-[var(--nu-text)]">
                                                    {formatDisplayDate(day.date)}
                                                  </td>
                                                  <td className="px-3 py-1.5 text-right font-semibold text-[var(--nu-text)]">
                                                    {fmtHrs(day.dailyHours)}
                                                  </td>
                                                </tr>

                                                {isDateExpanded && (
                                                  <tr className="bg-[var(--nu-surface-alt)] border-b border-[var(--nu-border)]">
                                                    <td colSpan={3} className="px-3 pb-2 pt-0">
                                                      <div className="ml-6 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] overflow-hidden">
                                                        <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)] border-b border-[var(--nu-border)]">
                                                          Imported Entries
                                                        </div>
                                                        <table className="w-full text-[11.5px]">
                                                          <tbody>
                                                            {day.entries.map((entry) => (
                                                              <tr
                                                                key={entry.id}
                                                                className="border-b border-[var(--nu-border)] last:border-0"
                                                              >
                                                                <td className="px-3 py-1 text-[var(--nu-text-secondary)]">
                                                                  {entry.task || "—"}
                                                                </td>
                                                                <td className="px-3 py-1 text-right font-medium text-[var(--nu-text)] w-28">
                                                                  {entry.hours.toLocaleString("en-IN", {
                                                                    minimumFractionDigits: 1,
                                                                    maximumFractionDigits: 2,
                                                                  })}{" "}
                                                                  hrs
                                                                </td>
                                                              </tr>
                                                            ))}
                                                          </tbody>
                                                        </table>
                                                      </div>
                                                    </td>
                                                  </tr>
                                                )}
                                              </React.Fragment>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default ExpandableTeamMembersCard;
