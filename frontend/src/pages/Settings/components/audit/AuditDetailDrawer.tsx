import { useEffect } from "react";
import { X, CheckCircle2, ShieldAlert, User, Monitor, Clock } from "lucide-react";
import { describeAuditEvent, isFailureEvent, type AuthAuditLogEntry } from "../../../../services/authAuditLogService";

interface Props {
  log: AuthAuditLogEntry | null;
  onClose: () => void;
}

/**
 * Shows only fields AuthAuditLog actually has: event, email, user id, IP
 * address, user agent, timestamp. No invented employee ID, project, module,
 * location, device, or browser-version breakdown — the raw userAgent string
 * is displayed as-is rather than parsed, per the explicit instruction that
 * parsing it would add unnecessary complexity for no real benefit here.
 */
export function AuditDetailDrawer({ log, onClose }: Props) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (log) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [log, onClose]);

  if (!log) return null;

  const failed = isFailureEvent(log.event);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      <div onClick={onClose} className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-200" />

      <aside className="relative z-50 flex flex-col w-full max-w-lg bg-[var(--nu-surface)] h-full shadow-2xl border-l border-[var(--nu-border)] overflow-hidden animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between border-b border-[var(--nu-border)] px-6 py-4 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 shrink-0">
              {failed ? <ShieldAlert size={20} /> : <CheckCircle2 size={20} />}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-[var(--nu-text)] tracking-tight truncate">
                Audit Record Details
              </h3>
              <p className="text-xs text-[var(--nu-text-muted)] truncate font-mono mt-0.5">{log.id}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-[var(--nu-text-muted)] hover:bg-[var(--nu-surface-alt)] hover:text-[var(--nu-text)] transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 nu-scrollbar">
          <div className="rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
              <User size={14} className="text-blue-500" />
              <span>User</span>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs">
              <div>
                <span className="text-[var(--nu-text-muted)]">Name:</span>
                <p className="font-bold text-[var(--nu-text)] mt-0.5">{log.userFullName ?? "—"}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Email:</span>
                <p className="font-bold text-[var(--nu-text)] mt-0.5 truncate">{log.email}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">User ID:</span>
                <p className="font-bold text-[var(--nu-text)] font-mono mt-0.5 break-all">{log.userId ?? "—"}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
              <Clock size={14} className="text-emerald-500" />
              <span>Event</span>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs">
              <div>
                <span className="text-[var(--nu-text-muted)]">Event:</span>
                <p className="font-bold text-[var(--nu-text)] mt-0.5">{describeAuditEvent(log.event)}</p>
                <p className="font-mono text-[10.5px] text-[var(--nu-text-muted)] mt-0.5">{log.event}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Timestamp:</span>
                <p className="font-bold text-[var(--nu-text)] font-mono mt-0.5">{new Date(log.occurredAt).toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
              <Monitor size={14} className="text-cyan-500" />
              <span>Network</span>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs">
              <div>
                <span className="text-[var(--nu-text-muted)]">IP Address:</span>
                <p className="font-bold text-[var(--nu-text)] font-mono mt-0.5">{log.ipAddress ?? "—"}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">User Agent:</span>
                <p className="font-mono text-[11px] text-[var(--nu-text)] mt-0.5 break-all bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-[var(--nu-border)]">
                  {log.userAgent ?? "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--nu-border)] px-6 py-3.5 bg-white dark:bg-slate-900 shrink-0 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            Close Details
          </button>
        </div>
      </aside>
    </div>
  );
}
