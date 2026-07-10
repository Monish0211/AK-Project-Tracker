import {
  Users,
  Clock,
  User,
  UserCheck,
  Building,
  IndianRupee,
} from "lucide-react";

import type { Project } from "../../../types/Project";
import CostSummaryCard from "./ExpenseInformation/CostSummaryCard";
import ProfitAnalysisCard from "./ExpenseInformation/ProfitAnalysisCard";
import { getEmployees } from "../../../services/employeeService";
import NonManhourExpenseView from "./NonManhourExpenseView";

interface Props {
  project: Project;
}

export default function TeamAssignedView({ project }: Props) {
  const masterEmployees = getEmployees();

  // KPI calculations
  const uniqueEmployeesCount = new Set(project.resources?.map(r => r.employeeNo.trim().toLowerCase()) || []).size;
  const totalHoursSum = project.resources?.reduce((sum, r) => sum + (r.totalHours || 0), 0) || 0;
  const totalManpowerBudget = project.resources?.reduce((sum, r) => {
    const emp = masterEmployees.find(e => e.employeeNo.trim().toLowerCase() === r.employeeNo.trim().toLowerCase());
    const rate = emp ? (emp.manhourExpenses || 0) : 0;
    return sum + (r.totalHours || 0) * rate;
  }, 0) || 0;

  return (
    <div className="space-y-6">
      {/* ================= PROJECT LEADERSHIP ================= */}
      <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-md">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-5 flex items-center gap-2">
          <User size={16} className="text-blue-500" />
          Project Leadership
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {/* Primary Project Manager */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <UserCheck size={16} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Primary PM</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">
                {project.primaryProjectManager || "—"}
              </p>
            </div>
          </div>

          {/* Secondary Project Manager */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <UserCheck size={16} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Secondary PM</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">
                {project.secondaryProjectManager || "—"}
              </p>
            </div>
          </div>

          {/* Project Coordinator */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <UserCheck size={16} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Project Coordinator</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">
                {project.projectCoordinator || "—"}
              </p>
            </div>
          </div>

          {/* Project Engineer */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <UserCheck size={16} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Project Engineer</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">
                {project.projectEngineer || "—"}
              </p>
            </div>
          </div>

          {/* Client Coordinator */}
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Building size={16} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Client Coordinator</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800">
                {project.clientCoordinator || "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ================= SUMMARY CARDS ================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Team Members */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Users size={18} strokeWidth={2.25} />
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Team Members
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{uniqueEmployeesCount}</p>
        </div>

        {/* Total Hours Budget */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-50 text-green-600">
            <Clock size={18} strokeWidth={2.25} />
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Hours Budget
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            {totalHoursSum.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Hrs
          </p>
        </div>

        {/* Total Project Budget */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <IndianRupee size={18} strokeWidth={2.25} />
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Project Budget
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            ₹{(project.workOrderValueINR || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </p>
        </div>

        {/* Total Manpower Budget */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <IndianRupee size={18} strokeWidth={2.25} />
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            Total Manpower Budget
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-800">
            ₹{totalManpowerBudget.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* ================= TEAM MEMBERS TABLE ================= */}
      <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left text-sm text-slate-700">
            <thead className="bg-slate-100 text-slate-650 font-semibold uppercase text-xs tracking-wider border-b">
              <tr>
                <th className="px-6 py-4">Employee No</th>
                <th className="px-6 py-4">Employee Name</th>
                <th className="px-6 py-4">Designation</th>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4">Reporting Manager</th>
                <th className="px-6 py-4 w-32">Start Date</th>
                <th className="px-6 py-4 w-32">End Date</th>
                <th className="px-6 py-4 text-center w-28">Working Days</th>
                <th className="px-6 py-4 text-right w-28">Total Hours</th>
                <th className="px-6 py-4 text-right w-32">Man-hour Expenses</th>
                <th className="px-6 py-4 text-right w-36">Employee Cost</th>
                <th className="px-6 py-4 text-center w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {!project.resources || project.resources.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-gray-500 font-medium">
                    No Team Members Assigned.
                  </td>
                </tr>
              ) : (
                project.resources.map((res) => {
                  const empMaster = masterEmployees.find(
                    (e) => e.employeeNo.trim().toLowerCase() === res.employeeNo.trim().toLowerCase()
                  );
                  const rate = empMaster ? (empMaster.manhourExpenses || 0) : 0;
                  const cost = (res.totalHours || 0) * rate;

                  return (
                    <tr key={res.id} className="border-b last:border-0 hover:bg-slate-50 transition">
                      <td className="px-6 py-4 font-semibold text-slate-900">{res.employeeNo}</td>
                      <td className="px-6 py-4">{res.employeeName}</td>
                      <td className="px-6 py-4">{res.designation}</td>
                      <td className="px-6 py-4">{res.department}</td>
                      <td className="px-6 py-4">{res.reportingManager || "—"}</td>
                      <td className="px-6 py-4">{res.startDate || "—"}</td>
                      <td className="px-6 py-4">{res.endDate || "—"}</td>
                      <td className="px-6 py-4 text-center">{res.workingDays || 0} Days</td>
                      <td className="px-6 py-4 text-right font-medium">
                        {(res.totalHours || 0).toLocaleString("en-IN")} Hrs
                      </td>
                      <td className="px-6 py-4 text-right font-medium">
                        ₹{rate.toLocaleString("en-IN")}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-slate-800">
                        ₹{cost.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            res.status === "Active"
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {res.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ================= Other Project Expenses ================= */}
      <NonManhourExpenseView expenses={project.nonManhourExpenses} />

      {/* ================= Cost Summary & Profit Analysis ================= */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        <CostSummaryCard
          manpowerCost={totalManpowerBudget}
          nonManhourExpenses={project.nonManhourExpenses}
        />

        <ProfitAnalysisCard
          manpowerCost={totalManpowerBudget}
          nonManhourExpenses={project.nonManhourExpenses}
          revenue={project.workOrderValueINR}
        />
      </div>
    </div>
  );
}
