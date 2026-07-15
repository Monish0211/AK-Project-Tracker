import { HeartPulse } from "lucide-react";
import { Card, CardHeader, CardBody } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { getProjectHealthSummary } from "../../../services/dashboardService";

const ProjectHealthSummary = () => {
  const health = getProjectHealthSummary();

  const rows = [
    { emoji: "🟢", label: "On Track", count: health.onTrack, barColor: "bg-emerald-500" },
    { emoji: "🟡", label: "At Risk", count: health.atRisk, barColor: "bg-amber-500" },
    { emoji: "🔴", label: "Delayed", count: health.delayed, barColor: "bg-red-500" },
    { emoji: "⚪", label: "Not Started", count: health.notStarted, barColor: "bg-slate-400" },
  ];
  const max = Math.max(health.onTrack, health.atRisk, health.delayed, health.notStarted, 1);

  return (
    <Card padded={false} elevated className="h-full flex flex-col">
      <CardHeader icon={<HeartPulse size={15} />} title="Project Health Summary" subtitle="Based on schedule dates &amp; pending work" />
      <CardBody className="flex-1">
        {health.total === 0 ? (
          <EmptyState
            icon={<HeartPulse size={18} />}
            title="No active projects to assess"
            description="Health status appears here once projects are in progress."
          />
        ) : (
          <>
            <div className="space-y-3">
              {rows.map((row) => (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12.5px] font-medium text-[var(--nu-text-secondary)] flex items-center gap-1.5">
                      <span>{row.emoji}</span>
                      {row.label}
                    </span>
                    <span className="text-[12.5px] font-semibold text-[var(--nu-text)]">{row.count}</span>
                  </div>
                  <div className="w-full h-1.5 bg-[var(--nu-surface-alt)] border border-[var(--nu-border)] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${row.barColor}`} style={{ width: `${(row.count / max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10.5px] text-[var(--nu-text-muted)] mt-3.5 leading-snug">
              Excludes Completed and Cancelled projects. Based on {health.total} in-progress project
              {health.total === 1 ? "" : "s"}.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
};

export default ProjectHealthSummary;
