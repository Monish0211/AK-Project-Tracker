import { Shield, CheckCircle2, ShieldAlert } from "lucide-react";
import type { AuditKpiCounts } from "../../../../services/authAuditLogService";

interface Props {
  stats: AuditKpiCounts | null;
  loading: boolean;
}

/**
 * Real, backend-derived counts only — see authAuditLogService.fetchAuditKpiCounts().
 * The old 5-card version also showed "Project Changes Today" and "Active
 * User Sessions", neither of which AuthAuditLog can support (no project or
 * session tracking on this table) — those two cards were removed rather
 * than backed by fake numbers.
 */
export function AuditSummaryCards({ stats, loading }: Props) {
  const display = (value: number | undefined) => (loading || value === undefined ? "—" : value);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)] flex items-center justify-between hover:shadow-[var(--nu-shadow-md)] transition-all">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--nu-text-muted)] truncate">
            Total Audit Events
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-extrabold text-[var(--nu-text)] tracking-tight tabular-nums">
              {display(stats?.totalEvents)}
            </h3>
            <span className="px-1.5 py-0.5 text-[10px] font-extrabold rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
              Live Log
            </span>
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 shrink-0">
          <Shield size={20} />
        </div>
      </div>

      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)] flex items-center justify-between hover:shadow-[var(--nu-shadow-md)] transition-all">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--nu-text-muted)] truncate">
            Successful Logins Today
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-extrabold text-[var(--nu-text)] tracking-tight tabular-nums">
              {display(stats?.successfulLoginsToday)}
            </h3>
            <span className="px-1.5 py-0.5 text-[10px] font-extrabold rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Verified
            </span>
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50 shrink-0">
          <CheckCircle2 size={20} />
        </div>
      </div>

      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)] flex items-center justify-between hover:shadow-[var(--nu-shadow-md)] transition-all">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--nu-text-muted)] truncate">
            Failed Attempts Today
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight tabular-nums">
              {display(stats?.failedAttemptsToday)}
            </h3>
            <span className="px-1.5 py-0.5 text-[10px] font-extrabold rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              Alerts
            </span>
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50 shrink-0">
          <ShieldAlert size={20} />
        </div>
      </div>
    </div>
  );
}
