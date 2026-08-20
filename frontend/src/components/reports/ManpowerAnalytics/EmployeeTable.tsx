import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { formatBusinessINR } from "../../../utils/formatCurrency";
import { ReportExportButtons } from "../Shared/ReportExportButtons";
import { EmptyState } from "../Shared/EmptyState";

interface Props {
  projects: any[];
}

export function EmployeeTable({ projects }: Props) {
  const [search, setSearch] = useState("");

  const employeeRows = useMemo(() => {
    const empMap: Record<string, { empName: string; role: string; dept: string; billableHrs: number; costINR: number }> = {};

    // ManhourExpense's real fields are employeeName/department/bookedHours/
    // totalCost (types/ManhourExpense.ts) — no role/designation field exists.
    projects.forEach((p) => {
      const mhList = Array.isArray(p.manhourExpenses) ? p.manhourExpenses : [];
      mhList.forEach((mh: any) => {
        const empName = mh.employeeName || "Unnamed Employee";
        const role = "-";
        const dept = mh.department || p.department || "Engineering";
        const hrs = mh.bookedHours || 0;
        const cost = mh.totalCost || 0;

        if (!empMap[empName]) {
          empMap[empName] = { empName, role, dept, billableHrs: 0, costINR: 0 };
        }
        empMap[empName].billableHrs += hrs;
        empMap[empName].costINR += cost;
      });
    });

    return Object.values(empMap);
  }, [projects]);

  const filtered = useMemo(() => {
    if (!search.trim()) return employeeRows;
    const term = search.toLowerCase();
    return employeeRows.filter(
      (r) =>
        r.empName.toLowerCase().includes(term) ||
        r.role.toLowerCase().includes(term) ||
        r.dept.toLowerCase().includes(term)
    );
  }, [employeeRows, search]);

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-2xl space-y-3 p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--nu-border)] pb-3">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Employee Resource Utilization & Timesheet Cost Ledger
          </h3>
          <p className="text-[11px] text-[var(--nu-text-muted)] mt-0.5">
            Individual engineering specialist hours logged, billable utilization, and project manhour costs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-56">
            <Search size={14} className="absolute left-3 top-2.5 text-[var(--nu-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Employee, Role..."
              className="w-full pl-8 pr-3 py-1.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-xl text-xs text-[var(--nu-text)] focus:outline-none focus:ring-2 focus:ring-[var(--nu-accent)]"
            />
          </div>

          <ReportExportButtons data={filtered} filename="Employee_Resource_Utilization_Ledger" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No Employee Records" description="No specialist records match your filter." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--nu-border)] bg-[var(--nu-surface-alt)] font-extrabold text-[var(--nu-text-muted)] uppercase tracking-wider">
                <th className="p-2.5">Employee Specialist</th>
                <th className="p-2.5">Engineering Role</th>
                <th className="p-2.5">Department</th>
                <th className="p-2.5 text-center">Billable Hours Logged</th>
                <th className="p-2.5 text-right">Total Manhour Cost</th>
                <th className="p-2.5 text-right">Utilization %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)]">
              {filtered.map((row) => {
                const utilPct = Math.min(100, Math.round((row.billableHrs / 480) * 100));

                return (
                  <tr key={row.empName} className="hover:bg-[var(--nu-surface-alt)]/50 transition">
                    <td className="p-2.5 font-extrabold text-[var(--nu-text)]">{row.empName}</td>
                    <td className="p-2.5 font-semibold text-[var(--nu-text-muted)]">{row.role}</td>
                    <td className="p-2.5 text-[var(--nu-text-muted)]">{row.dept}</td>
                    <td className="p-2.5 text-center font-mono font-bold">{row.billableHrs} hrs</td>
                    <td className="p-2.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      ₹{formatBusinessINR(row.costINR)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-extrabold">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] ${
                          utilPct >= 85
                            ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
                            : "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                        }`}
                      >
                        {utilPct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
