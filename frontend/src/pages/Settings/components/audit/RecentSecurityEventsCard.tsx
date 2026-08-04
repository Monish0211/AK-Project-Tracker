import { ShieldCheck, UserCheck, Key, ShieldAlert, UserCog } from "lucide-react";
import type { AuditLogItem } from "../../../../types/AuditLog";

interface Props {
  logs: AuditLogItem[];
  onSelectLog: (log: AuditLogItem) => void;
}

export function RecentSecurityEventsCard({ logs, onSelectLog }: Props) {
  // Filter security-focused actions
  const securityLogs = logs
    .filter((l) => {
      const act = l.action.toLowerCase();
      return (
        act.includes("login") ||
        act.includes("logout") ||
        act.includes("password") ||
        act.includes("permission") ||
        act.includes("role")
      );
    })
    .slice(0, 5);

  const getEventIcon = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes("login") && !act.includes("failed")) return <UserCheck size={14} className="text-emerald-500" />;
    if (act.includes("password")) return <Key size={14} className="text-amber-500" />;
    if (act.includes("role") || act.includes("permission")) return <UserCog size={14} className="text-purple-500" />;
    return <ShieldAlert size={14} className="text-red-500" />;
  };

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-4 shadow-[var(--nu-shadow-sm)] space-y-3">
      <div className="flex items-center justify-between border-b border-[var(--nu-border)] pb-2.5">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-emerald-500" />
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Recent Security & Auth Events
          </h4>
        </div>
        <span className="text-[11px] font-bold text-slate-500">Live Log</span>
      </div>

      <div className="space-y-2.5">
        {securityLogs.map((log) => (
          <div
            key={log.id}
            onClick={() => onSelectLog(log)}
            className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] hover:bg-slate-100 dark:hover:bg-slate-800/80 transition cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-[var(--nu-border)] shrink-0">
                {getEventIcon(log.action)}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--nu-text)] truncate">{log.action}</p>
                <p className="text-[11px] text-[var(--nu-text-muted)] truncate">
                  {log.employeeName} ({log.companyEmail})
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10.5px] font-mono text-[var(--nu-text-muted)] block">
                {log.timestamp.split(",")[1] || log.timestamp}
              </span>
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider ${
                  log.status === "Success"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : log.status === "Warning"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {log.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
