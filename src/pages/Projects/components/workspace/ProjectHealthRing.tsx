import type { HealthStatus } from "./getProjectHealthStatus";

const STATUS_COLOR: Record<HealthStatus, string> = {
  Healthy: "var(--nu-success)",
  Warning: "var(--nu-warning)",
  Critical: "var(--nu-danger)",
};

const STATUS_SOFT: Record<HealthStatus, string> = {
  Healthy: "var(--nu-success-soft)",
  Warning: "var(--nu-warning-soft)",
  Critical: "var(--nu-danger-soft)",
};

interface RingProps {
  status: HealthStatus;
  percentage: number;
}

const ProjectHealthRing = ({ status, percentage }: RingProps) => {
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  const color = STATUS_COLOR[status];

  return (
    <div className="flex items-center gap-2.5 shrink-0">
      <div className="relative w-14 h-14 shrink-0">
        <svg viewBox="0 0 52 52" className="w-14 h-14 -rotate-90">
          <circle cx="26" cy="26" r={radius} fill="none" stroke="var(--nu-border)" strokeWidth="5" />
          <circle
            cx="26"
            cy="26"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.4s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] font-bold text-[var(--nu-text)]">{Math.round(clamped)}%</span>
        </div>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wide text-[var(--nu-text-muted)] font-medium">Project Health</p>
        <span
          className="inline-flex items-center gap-1 text-[12px] font-semibold px-2 py-0.5 rounded-full mt-0.5"
          style={{ color, background: STATUS_SOFT[status] }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current" />
          {status}
        </span>
      </div>
    </div>
  );
};

export default ProjectHealthRing;
