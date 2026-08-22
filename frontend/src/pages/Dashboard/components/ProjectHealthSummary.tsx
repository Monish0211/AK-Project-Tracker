import React from "react";
import { HeartPulse, ArrowRight, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { useDashboardSummary } from "../DashboardSummaryContext";

const ProjectHealthSummary: React.FC = () => {
  const navigate = useNavigate();
  const health = useDashboardSummary().health;

  const rows = [
    { emoji: "🟢", label: "On Track", count: health.onTrack, barColor: "bg-emerald-500" },
    { emoji: "🟡", label: "At Risk", count: health.atRisk, barColor: "bg-amber-500" },
    { emoji: "🔴", label: "Delayed", count: health.delayed, barColor: "bg-red-500" },
    { emoji: "⚪", label: "Not Started", count: health.notStarted, barColor: "bg-slate-400" },
    { emoji: "⏳", label: "Schedule Not Set", count: health.scheduleNotSet ?? 0, barColor: "bg-purple-500" },
  ];
  const max = Math.max(
    health.onTrack,
    health.atRisk,
    health.delayed,
    health.notStarted,
    health.scheduleNotSet ?? 0,
    1
  );

  return (
    <Card padded={false} elevated className="h-[325px] flex flex-col justify-between transition-all duration-200">
      {/* Header */}
      <CardHeader
        icon={<HeartPulse size={14} className="text-emerald-500 dark:text-emerald-400" />}
        title="PROJECT HEALTH SUMMARY"
        subtitle="Based on schedule dates & pending work"
        action={
          <button
            type="button"
            onClick={() => navigate("/projects")}
            className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors flex items-center gap-1 hover:underline cursor-pointer shrink-0"
          >
            <span>View All</span>
            <ArrowRight size={12} />
          </button>
        }
      />

      {/* Content Area */}
      <CardBody className="flex-1 px-3.5 py-2.5 flex flex-col justify-between overflow-y-auto custom-scrollbar min-h-0">
        {health.total === 0 ? (
          <EmptyState
            icon={<HeartPulse size={18} />}
            title="No active projects to assess"
            description="Health status appears here once projects are in progress."
          />
        ) : (
          <div className="flex-1 flex flex-col justify-between py-1">
            <div className="space-y-3">
              {rows.map((row) => {
                const pct = health.total > 0 ? ((row.count / health.total) * 100).toFixed(1) : "0.0";
                return (
                  <div key={row.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11.5px] font-bold text-slate-755 dark:text-slate-300 flex items-center gap-1.5">
                        <span>{row.emoji}</span>
                        {row.label}
                      </span>
                      <span className="text-[11.5px] font-extrabold text-slate-850 dark:text-slate-100">
                        {row.count} <span className="text-slate-400 dark:text-slate-500 font-medium">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-750 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${row.barColor}`} style={{ width: `${(row.count / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-450 dark:text-slate-500 leading-snug mt-1.5">
              Excludes Completed and Cancelled projects. Based on {health.total} in-progress project
              {health.total === 1 ? "" : "s"}.
            </p>
          </div>
        )}
      </CardBody>

      {/* Bottom Summary Strip (Fixed) */}
      <div className="shrink-0 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-200/60 dark:border-slate-800/60 p-2 px-3 sm:px-4 rounded-b-[var(--nu-radius-lg)] flex items-center justify-between flex-wrap gap-1.5 text-[11px] font-semibold text-slate-650 dark:text-slate-400">
        <div className="flex items-center gap-1.5 truncate">
          <Info size={13} className="text-slate-450 shrink-0" />
          <span className="truncate">Active project portfolio health assessment.</span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/projects")}
          className="text-blue-600 dark:text-blue-400 hover:underline transition-colors flex items-center gap-1 font-bold cursor-pointer ml-auto sm:ml-0"
        >
          <span>View All Projects</span>
          <ArrowRight size={12} />
        </button>
      </div>
    </Card>
  );
};

export default ProjectHealthSummary;
