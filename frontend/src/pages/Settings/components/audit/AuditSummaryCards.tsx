import { Shield, CheckCircle2, ShieldAlert, FolderGit2, Users } from "lucide-react";
import type { AuditKPIStats } from "../../../../types/AuditLog";

interface Props {
  stats: AuditKPIStats;
}

export function AuditSummaryCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
      {/* 1. Total Audit Events */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)] flex items-center justify-between hover:shadow-[var(--nu-shadow-md)] transition-all">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--nu-text-muted)] truncate">
            Total Audit Events
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-extrabold text-[var(--nu-text)] tracking-tight tabular-nums">
              {stats.totalEvents}
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

      {/* 2. Successful Logins Today */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)] flex items-center justify-between hover:shadow-[var(--nu-shadow-md)] transition-all">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--nu-text-muted)] truncate">
            Successful Logins Today
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-extrabold text-[var(--nu-text)] tracking-tight tabular-nums">
              {stats.successfulLoginsToday}
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

      {/* 3. Failed Login Attempts */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)] flex items-center justify-between hover:shadow-[var(--nu-shadow-md)] transition-all">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--nu-text-muted)] truncate">
            Failed Login Attempts
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight tabular-nums">
              {stats.failedLoginAttempts}
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

      {/* 4. Project Changes Today */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)] flex items-center justify-between hover:shadow-[var(--nu-shadow-md)] transition-all">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--nu-text-muted)] truncate">
            Project Changes Today
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-extrabold text-[var(--nu-text)] tracking-tight tabular-nums">
              {stats.projectChangesToday}
            </h3>
            <span className="px-1.5 py-0.5 text-[10px] font-extrabold rounded-md bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
              PM Audit
            </span>
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/50 shrink-0">
          <FolderGit2 size={20} />
        </div>
      </div>

      {/* 5. Active User Sessions */}
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)] flex items-center justify-between hover:shadow-[var(--nu-shadow-md)] transition-all">
        <div className="space-y-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--nu-text-muted)] truncate">
            Active User Sessions
          </p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-extrabold text-[var(--nu-text)] tracking-tight tabular-nums">
              {stats.activeSessions}
            </h3>
            <span className="px-1.5 py-0.5 text-[10px] font-extrabold rounded-md bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800">
              Active Now
            </span>
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-900/50 shrink-0">
          <Users size={20} />
        </div>
      </div>
    </div>
  );
}
