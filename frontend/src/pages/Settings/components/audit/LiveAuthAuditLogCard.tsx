import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, KeyRound, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "../../../../auth/authContext";
import { Card, CardBody, CardHeader } from "../../../../components/ui/Card";
import { ApiError } from "../../../../services/apiClient";
import {
  describeAuditEvent,
  fetchAuthAuditLogs,
  isFailureEvent,
  type AuthAuditLogEntry,
} from "../../../../services/authAuditLogService";

const PAGE_SIZE = 20;

/**
 * Administrator-only view of the REAL, backend-persisted AuthAuditLog table
 * (login/logout/password events — see Backend/src/modules/auth/services/auth.service.ts).
 * Deliberately a separate card from the rest of this tab's existing
 * "Security & Audit Logs" components (AuditSummaryCards/AuditLogTable/etc.),
 * which run on a client-local demo dataset (auditLogService.ts) — this card
 * never touches that mock data or those components, and only ever shows
 * genuine authentication events.
 */
export function LiveAuthAuditLogCard() {
  const { user } = useAuth();
  const isAdministrator = user?.role === "Administrator";

  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);
  const [items, setItems] = useState<AuthAuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdministrator) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAuthAuditLogs(page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Failed to load authentication audit log.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdministrator, page, refreshTick]);

  if (!isAdministrator) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card padded={false} className="mb-5">
      <CardHeader
        icon={<KeyRound size={16} />}
        title="Live Authentication Audit"
        subtitle="Real login / logout / password events recorded by the backend — Administrator only"
        action={
          <button
            type="button"
            onClick={() => setRefreshTick((t) => t + 1)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--nu-border)] text-xs font-bold text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)] transition cursor-pointer disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        }
      />
      <CardBody>
        {error && (
          <div className="mb-3 rounded-lg border border-[var(--nu-danger)] bg-[var(--nu-danger-soft)] px-3 py-2 text-xs font-semibold text-[var(--nu-danger)]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-xs font-semibold text-[var(--nu-text-muted)]">Loading audit log…</div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-xs font-semibold text-[var(--nu-text-muted)]">
            No authentication events recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto nu-scrollbar">
            <table className="w-full border-collapse text-[12px] text-left">
              <thead>
                <tr className="border-b border-[var(--nu-border)] text-[11px] font-extrabold uppercase tracking-wider text-[var(--nu-text-muted)]">
                  <th className="px-3 py-2">Timestamp</th>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Event</th>
                  <th className="px-3 py-2 text-center">Result</th>
                  <th className="px-3 py-2">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--nu-border)]">
                {items.map((entry) => {
                  const failed = isFailureEvent(entry.event);
                  return (
                    <tr key={entry.id}>
                      <td className="px-3 py-2 font-mono text-[11px] text-[var(--nu-text-muted)] whitespace-nowrap">
                        {new Date(entry.occurredAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-semibold text-[var(--nu-text)]">{entry.userFullName ?? "—"}</span>
                        <span className="block text-[10.5px] text-[var(--nu-text-muted)]">{entry.email}</span>
                      </td>
                      <td className="px-3 py-2 text-[var(--nu-text)]">{describeAuditEvent(entry.event)}</td>
                      <td className="px-3 py-2 text-center">
                        {failed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 text-[10px] font-bold uppercase">
                            <ShieldAlert size={10} /> Failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold uppercase">
                            <ShieldCheck size={10} /> OK
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[11px] text-[var(--nu-text-muted)] whitespace-nowrap">
                        {entry.ipAddress ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && total > 0 && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-[var(--nu-text-muted)]">
              Page {page} of {totalPages} · {total} total events
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--nu-border)] text-xs font-bold text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                <ChevronLeft size={13} /> Prev
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--nu-border)] text-xs font-bold text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)] disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
