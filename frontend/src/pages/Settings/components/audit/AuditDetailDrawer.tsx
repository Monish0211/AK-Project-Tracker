import { useEffect } from "react";
import {
  X, CheckCircle2, ShieldAlert, AlertTriangle, User,
  Monitor, Clock, FileText, Server, MapPin
} from "lucide-react";
import type { AuditLogItem } from "../../../../types/AuditLog";

interface Props {
  log: AuditLogItem | null;
  onClose: () => void;
}

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

  const getStatusBadge = () => {
    if (log.status === "Success") {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold uppercase tracking-wider">
          <CheckCircle2 size={13} />
          <span>Success</span>
        </span>
      );
    }
    if (log.status === "Warning") {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold uppercase tracking-wider">
          <AlertTriangle size={13} />
          <span>Warning</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-xs font-bold uppercase tracking-wider">
        <ShieldAlert size={13} />
        <span>Failed</span>
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity duration-200"
      />

      {/* Drawer Panel */}
      <aside className="relative z-50 flex flex-col w-full max-w-xl bg-[var(--nu-surface)] h-full shadow-2xl border-l border-[var(--nu-border)] overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-[var(--nu-border)] px-6 py-4 bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50 shrink-0">
              <Server size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-[var(--nu-text)] tracking-tight truncate">
                  Audit Event Details
                </h3>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-[var(--nu-text-muted)] truncate font-mono mt-0.5">
                {log.id} • {log.timestamp}
              </p>
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

        {/* Drawer Body (Independent Scroll) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 nu-scrollbar">
          {/* Failure Banner if any */}
          {log.failureReason && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/70 dark:bg-red-950/30 p-4 space-y-1">
              <div className="flex items-center gap-2 text-red-800 dark:text-red-300 font-extrabold text-xs">
                <ShieldAlert size={15} />
                <span>Audit Log Error / Failure Cause:</span>
              </div>
              <p className="text-xs text-red-700 dark:text-red-300/90 leading-relaxed font-mono">
                {log.failureReason}
              </p>
            </div>
          )}

          {/* User Information */}
          <div className="rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
              <User size={14} className="text-blue-500" />
              <span>User & Credentials</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[var(--nu-text-muted)]">Employee Name:</span>
                <p className="font-bold text-[var(--nu-text)] mt-0.5">{log.employeeName}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Employee ID:</span>
                <p className="font-bold text-[var(--nu-text)] font-mono mt-0.5">{log.employeeId}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Company Email:</span>
                <p className="font-bold text-[var(--nu-text)] mt-0.5 truncate">{log.companyEmail}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Department / Role:</span>
                <p className="font-bold text-[var(--nu-text)] mt-0.5">
                  {log.department} ({log.role})
                </p>
              </div>
            </div>
          </div>

          {/* Action & Resource Info */}
          <div className="rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
              <FileText size={14} className="text-purple-500" />
              <span>Action & Module Metadata</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[var(--nu-text-muted)]">Target Module:</span>
                <p className="font-bold text-[var(--nu-text)] mt-0.5">{log.module}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Action Performed:</span>
                <p className="font-bold text-[var(--nu-text)] mt-0.5">{log.action}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Reference Number:</span>
                <p className="font-bold text-cyan-600 dark:text-cyan-400 font-mono mt-0.5">
                  {log.referenceNo || "-"}
                </p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Affected Resource:</span>
                <p className="font-bold text-[var(--nu-text)] mt-0.5">{log.affectedRecord || "-"}</p>
              </div>
            </div>
            <div className="pt-2 border-t border-[var(--nu-border)]">
              <span className="text-[var(--nu-text-muted)] text-[11px]">Audit Description:</span>
              <p className="text-xs text-[var(--nu-text)] leading-relaxed mt-1 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-[var(--nu-border)]">
                {log.description}
              </p>
            </div>
          </div>

          {/* Environment & Network */}
          <div className="rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
              <Monitor size={14} className="text-cyan-500" />
              <span>Environment & Telemetry</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[var(--nu-text-muted)]">IP Address:</span>
                <p className="font-bold text-[var(--nu-text)] font-mono mt-0.5">{log.ipAddress}</p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Location (Mock):</span>
                <p className="font-bold text-[var(--nu-text)] mt-0.5 flex items-center gap-1">
                  <MapPin size={12} className="text-red-500" />
                  <span>{log.location}</span>
                </p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Device & OS:</span>
                <p className="font-bold text-[var(--nu-text)] mt-0.5">
                  {log.device} • {log.operatingSystem}
                </p>
              </div>
              <div>
                <span className="text-[var(--nu-text-muted)]">Browser Engine:</span>
                <p className="font-bold text-[var(--nu-text)] mt-0.5">{log.browser}</p>
              </div>
              <div className="col-span-2">
                <span className="text-[var(--nu-text-muted)]">Session Token ID:</span>
                <p className="font-bold text-slate-600 dark:text-slate-400 font-mono text-[11px] mt-0.5">
                  {log.sessionId}
                </p>
              </div>
            </div>
          </div>

          {/* Activity Execution Timeline */}
          <div className="rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
              <Clock size={14} className="text-emerald-500" />
              <span>Execution Timeline</span>
            </div>
            <div className="relative pl-4 space-y-4 border-l-2 border-slate-200 dark:border-slate-800 ml-2 pt-1">
              {log.timeline.map((step, idx) => (
                <div key={idx} className="relative">
                  <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[var(--nu-accent)] border-2 border-white dark:border-slate-900" />
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-[var(--nu-text)]">{step.title}</p>
                    <span className="text-[10.5px] font-mono text-[var(--nu-text-muted)]">
                      {step.time}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-[var(--nu-text-muted)] leading-normal mt-0.5">
                    {step.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
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
