import { Eye, ChevronLeft, ChevronRight, Database, ShieldAlert, ShieldCheck } from "lucide-react";
import { describeAuditEvent, isFailureEvent, type AuthAuditLogEntry } from "../../../../services/authAuditLogService";

interface Props {
  items: AuthAuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  onSelect: (log: AuthAuditLogEntry) => void;
  onPageChange: (page: number) => void;
}

/**
 * Real AuthAuditLog rows only — Timestamp / Email/User / Event / IP Address
 * / User Agent / Details, exactly the fields the backend actually returns.
 * Pagination is real, server-side (page/pageSize/total come straight from
 * the API response) — this never fetches "everything" to slice locally.
 */
export function AuditLogTable({ items, total, page, pageSize, loading, error, onSelect, onPageChange }: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = (page - 1) * pageSize;

  return (
    <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] shadow-[var(--nu-shadow-sm)] overflow-hidden flex flex-col">
      <div className="px-5 py-3.5 border-b border-[var(--nu-border)] bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-[var(--nu-accent)]" />
          <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--nu-text)]">
            Authentication Audit Log
          </h4>
        </div>
        <span className="text-[11.5px] font-semibold text-[var(--nu-text-muted)]">
          {total === 0 ? "0 records" : `Showing ${startIndex + 1}–${Math.min(startIndex + items.length, total)} of ${total} records`}
        </span>
      </div>

      <div className="overflow-x-auto nu-scrollbar min-h-[320px]">
        {error ? (
          <div className="p-12 text-center space-y-2">
            <ShieldAlert size={32} className="mx-auto text-[var(--nu-danger)] opacity-70" />
            <h4 className="text-sm font-bold text-[var(--nu-text)]">Failed to load audit log</h4>
            <p className="text-xs text-[var(--nu-text-muted)] max-w-sm mx-auto">{error}</p>
          </div>
        ) : loading ? (
          <div className="p-12 text-center text-xs font-semibold text-[var(--nu-text-muted)]">Loading audit records…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Database size={32} className="mx-auto text-[var(--nu-text-muted)] opacity-50" />
            <h4 className="text-sm font-bold text-[var(--nu-text)]">No Matching Audit Records</h4>
            <p className="text-xs text-[var(--nu-text-muted)] max-w-sm mx-auto">
              Try adjusting your search, event type, outcome, or date range filters.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-[12px] text-left">
            <thead>
              <tr className="bg-slate-100/70 dark:bg-slate-800/60 border-b border-[var(--nu-border)] text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Email / User</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3 text-center">Outcome</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">User Agent</th>
                <th className="px-4 py-3 text-center">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--nu-border)] font-normal text-[var(--nu-text)]">
              {items.map((entry) => {
                const failed = isFailureEvent(entry.event);
                return (
                  <tr key={entry.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 font-mono text-[11.5px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {new Date(entry.occurredAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-bold text-[var(--nu-text)]">{entry.userFullName ?? "—"}</span>
                      <span className="block text-[10.5px] font-normal text-[var(--nu-text-muted)]">{entry.email}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-[var(--nu-text)] whitespace-nowrap">
                      {describeAuditEvent(entry.event)}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      {failed ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-[10.5px] font-bold uppercase tracking-wider">
                          <ShieldAlert size={11} />
                          <span>Failed</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10.5px] font-bold uppercase tracking-wider">
                          <ShieldCheck size={11} />
                          <span>Success</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {entry.ipAddress ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400 max-w-[220px] truncate" title={entry.userAgent ?? undefined}>
                      {entry.userAgent ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelect(entry)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                        title="View full audit record details"
                      >
                        <Eye size={13} className="text-blue-500" />
                        <span>Details</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !error && total > 0 && (
        <div className="px-5 py-3 border-t border-[var(--nu-border)] bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
          <p className="text-xs font-semibold text-[var(--nu-text-muted)]">
            Page {page} of {totalPages}
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page === 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <ChevronLeft size={14} />
              <span>Previous</span>
            </button>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
