import React from "react";
import { Building2, ArrowRight, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { getDepartmentSummary } from "../../../services/dashboardService";

const BAR_COLORS = ["#2563eb", "#10b981", "#7c3aed", "#f59e0b", "#ef4444", "#06b6d4"];

const DepartmentSummary: React.FC = () => {
  const navigate = useNavigate();
  const departments = getDepartmentSummary().slice(0, 5); // Limit to top 5 for neatness
  const maxCount = Math.max(...departments.map((d) => d.count), 1);

  return (
    <Card padded={false} elevated className="h-[325px] flex flex-col justify-between transition-all duration-200">
      {/* Header */}
      <CardHeader
        icon={<Building2 size={14} className="text-blue-600 dark:text-blue-400" />}
        title="DEPARTMENT SUMMARY"
        subtitle="Projects by department"
        action={
          <button
            type="button"
            onClick={() => navigate("/projects")}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer shrink-0"
          >
            <span>View All</span>
            <ArrowRight size={12} />
          </button>
        }
      />

      {/* Content Area */}
      <CardBody className="flex-1 overflow-y-auto custom-scrollbar my-1 pr-0.5 min-h-0">
        {departments.length === 0 ? (
          <EmptyState
            icon={<Building2 size={18} />}
            title="No department data available"
            description="Import projects to begin generating department analytics."
          />
        ) : (
          <div className="space-y-3.5">
            {departments.map((dept, index) => (
              <div key={dept.department}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11.5px] font-bold text-slate-700 dark:text-slate-350">{dept.department}</span>
                  <span className="text-[11.5px] font-extrabold text-slate-900 dark:text-white">{dept.count}</span>
                </div>
                {/* Thicker progress bar: h-3 (12px) */}
                <div className="w-full h-3 bg-slate-50 dark:bg-slate-800 border border-slate-250/30 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(dept.count / maxCount) * 100}%`, background: BAR_COLORS[index % BAR_COLORS.length] }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>

      {/* Bottom Summary Strip (Fixed) */}
      <div className="shrink-0 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-200/60 dark:border-slate-800/60 p-2 px-3 sm:px-4 rounded-b-[var(--nu-radius-lg)] flex items-center justify-between flex-wrap gap-1.5 text-[11px] font-semibold text-slate-650 dark:text-slate-400">
        <div className="flex items-center gap-1.5 truncate">
          <Info size={13} className="text-slate-450 shrink-0" />
          <span className="truncate">Active projects department distribution.</span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/projects")}
          className="text-blue-600 dark:text-blue-400 hover:underline transition-colors flex items-center gap-1 font-bold cursor-pointer ml-auto sm:ml-0"
        >
          <span>View All Departments</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </Card>
  );
};

export default DepartmentSummary;
