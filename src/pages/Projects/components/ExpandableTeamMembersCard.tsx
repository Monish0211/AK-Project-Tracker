import React, { useState } from "react";
import { ChevronDown, ChevronRight, Calendar, Clock, CheckCircle } from "lucide-react";
import type { Project } from "../../../types/Project";
import {
  getEmployeeDailyEntries,
  getProjectMonths,
  getTimesheetSummary,
  hasTimesheetData,
} from "../../../services/timesheetSyncService";
import { formatDisplayDate, formatMonthDisplay } from "../../../services/timesheetService";

interface Props {
  project: Project;
}

const ExpandableTeamMembersCard = ({ project }: Props) => {
  const [expandedEmployeeNo, setExpandedEmployeeNo] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    project.latestTimesheetMonth || ""
  );

  const availableMonths = getProjectMonths(project);
  const summary = getTimesheetSummary(project);
  const hasSyncedData = hasTimesheetData(project);

  // Get employees for selected month
  const employees = project.resources || [];

  const handleExpandToggle = (employeeNo: string) => {
    setExpandedEmployeeNo(
      expandedEmployeeNo === employeeNo ? null : employeeNo
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Team Members</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {hasSyncedData
                ? "Automatically synced from imported Timesheets"
                : "No timesheet data imported yet"}
            </p>
          </div>

          {summary && (
            <div className="flex gap-4 text-sm">
              <div className="text-center">
                <div className="text-xs font-semibold text-slate-500 uppercase">
                  Employees
                </div>
                <div className="text-lg font-bold text-slate-800">
                  {summary.totalEmployees}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs font-semibold text-slate-500 uppercase">
                  Total Hours
                </div>
                <div className="text-lg font-bold text-slate-800">
                  {summary.totalHours.toLocaleString("en-IN", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Month Selector */}
        {availableMonths.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-4 border-t">
            {availableMonths.map((month) => (
              <button
                key={month}
                onClick={() => {
                  setSelectedMonth(month);
                  setExpandedEmployeeNo(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  selectedMonth === month
                    ? "bg-blue-100 text-blue-700 border border-blue-600"
                    : "bg-slate-100 text-slate-700 border border-gray-200 hover:bg-slate-200"
                }`}
              >
                {formatMonthDisplay(month)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Team Members Table */}
      {!hasSyncedData ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 shadow-sm text-center">
          <Calendar size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-800 mb-2">
            No Team Members Synced
          </h3>
          <p className="text-sm text-gray-500">
            Import a timesheet in the Timesheets module to automatically sync team members
            for this project.
          </p>
        </div>
      ) : employees.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-gray-100 shadow-sm text-center">
          <CheckCircle size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-800 mb-2">
            No Employees for {formatMonthDisplay(selectedMonth)}
          </h3>
          <p className="text-sm text-gray-500">
            Select a different month or import a new timesheet.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-slate-650 font-semibold uppercase text-xs tracking-wider border-b">
                <tr>
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3">Employee No</th>
                  <th className="px-4 py-3">Employee Name</th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3 w-32">Start Date</th>
                  <th className="px-4 py-3 w-32">End Date</th>
                  <th className="px-4 py-3 text-center w-24">Working Days</th>
                  <th className="px-4 py-3 text-right w-28">Total Hours</th>
                  <th className="px-4 py-3 text-center w-24">Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const isExpanded = expandedEmployeeNo === emp.employeeNo;
                  const dailyEntries = getEmployeeDailyEntries(
                    project,
                    emp.employeeNo,
                    selectedMonth
                  );

                  return (
                    <React.Fragment key={emp.id}>
                      {/* Main Row */}
                      <tr
                        className="border-b hover:bg-slate-50 transition cursor-pointer"
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
                        <td className="px-4 py-3 text-center">
                          {isExpanded ? (
                            <ChevronDown size={18} className="text-blue-600" />
                          ) : (
                            <ChevronRight size={18} className="text-gray-400" />
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {emp.employeeNo}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{emp.employeeName}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {emp.designation || "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {emp.department || "—"}
                        </td>
                        <td className="px-4 py-3">{emp.startDate || "—"}</td>
                        <td className="px-4 py-3">{emp.endDate || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          {emp.workingDays} days
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {(emp.totalHours || 0).toLocaleString("en-IN", {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 2,
                          })}{" "}
                          hrs
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                              emp.status === "Active"
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {emp.status}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded Row - Daily Entries */}
                      {isExpanded && dailyEntries.length > 0 && (
                        <tr className="bg-slate-50 border-b">
                          <td colSpan={10} className="p-0">
                            <div className="p-6 space-y-4">
                              {/* Project Context */}
                              <div className="bg-white rounded-xl p-4 border border-slate-200">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <div className="text-xs font-semibold text-slate-500 uppercase">
                                      Project Code
                                    </div>
                                    <div className="text-slate-900 font-medium mt-1">
                                      {dailyEntries[0].projectCode}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-xs font-semibold text-slate-500 uppercase">
                                      Project Name
                                    </div>
                                    <div className="text-slate-900 font-medium mt-1">
                                      {dailyEntries[0].projectName}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Daily Entries Table */}
                              <div>
                                <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                  <Clock size={16} className="text-blue-600" />
                                  Daily Timesheet Entries
                                </h4>

                                <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead className="bg-slate-50 border-b">
                                      <tr>
                                        <th className="px-4 py-2 text-left font-semibold text-slate-600">
                                          Date
                                        </th>
                                        <th className="px-4 py-2 text-left font-semibold text-slate-600">
                                          Task
                                        </th>
                                        <th className="px-4 py-2 text-right font-semibold text-slate-600 w-24">
                                          Hours
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dailyEntries.map((entry, idx) => (
                                        <tr
                                          key={idx}
                                          className="border-b last:border-0 hover:bg-slate-50"
                                        >
                                          <td className="px-4 py-2 font-medium text-slate-800">
                                            {formatDisplayDate(entry.date)}
                                          </td>
                                          <td className="px-4 py-2 text-slate-600">
                                            {entry.task || "—"}
                                          </td>
                                          <td className="px-4 py-2 text-right font-medium text-slate-800">
                                            {entry.hours.toLocaleString("en-IN", {
                                              minimumFractionDigits: 1,
                                              maximumFractionDigits: 2,
                                            })}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {/* Summary */}
                              <div className="bg-blue-50 rounded-lg border border-blue-200 p-4 grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <div className="text-xs font-semibold text-blue-600 uppercase">
                                    Working Days
                                  </div>
                                  <div className="text-blue-900 font-bold text-lg mt-1">
                                    {new Set(dailyEntries.map((e) => e.date)).size}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs font-semibold text-blue-600 uppercase">
                                    Total Hours
                                  </div>
                                  <div className="text-blue-900 font-bold text-lg mt-1">
                                    {dailyEntries
                                      .reduce((sum, e) => sum + e.hours, 0)
                                      .toLocaleString("en-IN", {
                                        minimumFractionDigits: 1,
                                        maximumFractionDigits: 2,
                                      })}
                                  </div>
                                </div>
                              </div>
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

      {/* Info Box */}
      {hasSyncedData && (
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-xs text-blue-700">
          <p className="font-medium mb-1">📋 Timesheet-Synced Team Members</p>
          <p>
            Team members are automatically synchronized from the Timesheets module. Click
            an employee row to view their daily timesheet entries for this project.
          </p>
        </div>
      )}
    </div>
  );
};

export default ExpandableTeamMembersCard;
