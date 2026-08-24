import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Shield, Lock } from "lucide-react";
import { useAuth } from "../../../../auth/authContext";
import { ApiError } from "../../../../services/apiClient";
import {
  exportAuditLogsToCsv,
  fetchAuditKpiCounts,
  fetchAuthAuditLogs,
  type AuditKpiCounts,
  type AuthAuditLogEntry,
  type AuthAuditLogFilters,
} from "../../../../services/authAuditLogService";
import { AuditSummaryCards } from "./AuditSummaryCards";
import { AuditFilterBar, DEFAULT_AUDIT_FILTERS, type AuditFilterState } from "./AuditFilterBar";
import { AuditLogTable } from "./AuditLogTable";
import { AuditDetailDrawer } from "./AuditDetailDrawer";
import { usePmoToast } from "../../../../components/ui/usePmoToast";

const PAGE_SIZE = 20;

function dateRangeToFromTo(range: AuditFilterState["dateRange"]): { from?: Date } {
  if (range === "all") return {};
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (range === "7days") from.setDate(from.getDate() - 6);
  if (range === "30days") from.setDate(from.getDate() - 29);
  return { from };
}

function toApiFilters(filters: AuditFilterState): AuthAuditLogFilters {
  return {
    ...(filters.email && { email: filters.email }),
    ...(filters.ipAddress && { ipAddress: filters.ipAddress }),
    ...(filters.event && { event: filters.event }),
    ...(filters.eventCategory && { eventCategory: filters.eventCategory }),
    ...dateRangeToFromTo(filters.dateRange),
  };
}

/**
 * Real, backend-backed Security & Audit Logs — the ONLY data source is
 * GET /auth/audit-logs (AuthAuditLog). The previous version of this
 * component rendered a client-local fabricated "Enterprise Audit Trail"
 * (fake names/IPs/modules/sessions via auditLogService.ts) — that dataset
 * and every component that only existed to display it have been removed.
 * Nothing shown here is invented; every field comes from a real database
 * row.
 *
 * Administrator-only: the backend already enforces this (authenticate +
 * authorize("Administrator") on the route) and returns 403 to anyone else —
 * this component additionally never attempts the fetch for a non-admin, so
 * a normal user sees a plain access notice instead of a wall of 403s.
 */
export function SecurityAuditSection() {
  const { user } = useAuth();
  const { showToast } = usePmoToast();
  const isAdministrator = user?.role === "Administrator";

  const [filters, setFilters] = useState<AuditFilterState>(DEFAULT_AUDIT_FILTERS);
  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);

  const [items, setItems] = useState<AuthAuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kpiStats, setKpiStats] = useState<AuditKpiCounts | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);

  const [selectedLog, setSelectedLog] = useState<AuthAuditLogEntry | null>(null);

  const apiFilters = useMemo(() => toApiFilters(filters), [filters]);

  // Reset to page 1 whenever filters change (a new filter combination has its own result set).
  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    if (!isAdministrator) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      fetchAuthAuditLogs(page, PAGE_SIZE, apiFilters)
        .then((result) => {
          if (cancelled) return;
          setItems(result.items);
          setTotal(result.total);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err instanceof ApiError ? err.message : "Failed to load the authentication audit log.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAdministrator, page, apiFilters, refreshTick]);

  useEffect(() => {
    if (!isAdministrator) return;
    let cancelled = false;
    setKpiLoading(true);
    fetchAuditKpiCounts()
      .then((stats) => {
        if (!cancelled) setKpiStats(stats);
      })
      .catch(() => {
        // KPI cards are a convenience summary — a failure here shouldn't block the main table.
      })
      .finally(() => {
        if (!cancelled) setKpiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdministrator, refreshTick]);

  const handleRefresh = () => {
    setRefreshTick((t) => t + 1);
  };

  const handleExport = () => {
    if (items.length === 0) {
      showToast({ type: "info", message: "Nothing to export on the current page." });
      return;
    }
    exportAuditLogsToCsv(items);
    showToast({ type: "success", message: `Exported ${items.length} audit record(s) from the current page to CSV.` });
  };

  if (!isAdministrator) {
    return (
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-8 text-center space-y-2">
        <Lock size={32} className="mx-auto text-[var(--nu-text-muted)]" />
        <h3 className="text-base font-bold text-[var(--nu-text)]">Administrator Access Required</h3>
        <p className="text-[12.5px] text-[var(--nu-text-muted)] max-w-md mx-auto">
          Security & Audit Logs contains sensitive authentication history and is only visible to Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 nu-fade-in pb-8">
      <div className="bg-[var(--nu-surface)] border border-[var(--nu-border)] rounded-[var(--nu-radius-lg)] p-5 shadow-[var(--nu-shadow-sm)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-md shrink-0">
            <Shield size={24} />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-[var(--nu-text)] tracking-tight">
              Security & Audit Logs
            </h2>
            <p className="text-xs text-[var(--nu-text-muted)] mt-0.5">
              Real authentication history — logins, logouts, and password events recorded by the backend.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--nu-accent)] hover:opacity-90 text-white text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <Download size={14} />
            <span>Export Page</span>
          </button>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text)] text-xs font-bold hover:bg-[var(--nu-surface-alt)] transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <AuditSummaryCards stats={kpiStats} loading={kpiLoading} />

      <AuditFilterBar filters={filters} onChange={setFilters} onReset={() => setFilters(DEFAULT_AUDIT_FILTERS)} />

      <AuditLogTable
        items={items}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        loading={loading}
        error={error}
        onSelect={setSelectedLog}
        onPageChange={setPage}
      />

      <AuditDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
