import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { useAuth } from "../../../auth/authContext";
import AccessDenied from "../../AccessDenied/AccessDenied";
import { Card, CardHeader } from "../../../components/ui/Card";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { usePmoToast } from "../../../components/ui/usePmoToast";
import { ApiError } from "../../../services/apiClient";
import { weeklyReportExclusionApi, type ExclusionStatusFilter, type WeeklyReportExclusion } from "../../../services/weeklyEmailService";
import {
  canManageReportExclusions,
  findWeeklyEmailNotification,
  WEEKLY_EMAIL_NOTIFICATIONS,
  weeklyEmailPreviewPath,
  type WeeklyEmailNotification,
} from "../components/weeklyEmails/weeklyEmailNotifications";
import { PaginationBar, StateMessage, WeeklyEmailPageShell } from "../components/weeklyEmails/WeeklyEmailPaging";
import { ExcludedHistoryTable } from "../components/weeklyEmails/WeeklyEmailExclusions";
import { restoreConfirmMessage } from "../components/weeklyEmails/weeklyEmailExclusionText";
import { usePagedRequest, usePageParams } from "../components/weeklyEmails/useWeeklyEmailPaging";
import "../settings-theme.css";

/**
 * Settings → Weekly Emails → Excluded History (Nov 2026). ADMINISTRATORS ONLY (the backend refuses everyone else).
 * One tab per weekly report; every exclusion stays listed after it is restored (who excluded / restored, and when).
 */

const FILTER_KEYS = ["report", "status"] as const;
const STATUS_OPTIONS: { value: ExclusionStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "restored", label: "Restored" },
];
const selectClass = "h-8 px-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12px] text-[var(--nu-text)]";

export default function WeeklyEmailExcludedHistoryPage() {
  const { user } = useAuth();
  if (!canManageReportExclusions(user?.role)) return <AccessDenied moduleName="Excluded History" />;
  return <ExcludedHistoryContent />;
}

function ExcludedHistoryContent() {
  const { showToast } = usePmoToast();
  const { page, pageSize, filters, update } = usePageParams(FILTER_KEYS);
  const config: WeeklyEmailNotification = findWeeklyEmailNotification(filters.report) ?? WEEKLY_EMAIL_NOTIFICATIONS[0]!;
  const status: ExclusionStatusFilter = STATUS_OPTIONS.some((o) => o.value === filters.status) ? (filters.status as ExclusionStatusFilter) : "all";
  const fetchPage = useCallback(() => weeklyReportExclusionApi.list(config.reportType, status, page, pageSize), [config, status, page, pageSize]);
  const state = usePagedRequest(fetchPage, `${config.reportType}:${status}:${page}:${pageSize}`);
  const data = state.data;
  const [confirm, setConfirm] = useState<WeeklyReportExclusion | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && data.items.length === 0 && data.total > 0 && page > data.totalPages) update({ page: data.totalPages });
  }, [data, page, update]);

  const handleRestore = async () => {
    if (!confirm || saving) return;
    setSaving(true);
    try {
      await weeklyReportExclusionApi.restore(confirm.id);
      showToast({ type: "success", message: `${confirm.prNo} is included again in "${confirm.reportName}".` });
    } catch (err) {
      showToast({ type: "error", message: err instanceof ApiError ? err.message : "The project could not be included again." });
    } finally {
      setConfirm(null);
      setSaving(false);
      state.retry();
    }
  };

  return (
    <WeeklyEmailPageShell
      eyebrow="Weekly Emails — Administrators only"
      title="Excluded History"
      description="Projects an Administrator took out of a weekly email report. An excluded project is left out of that report's preview and weekly email until it is included again. Nothing about the project, its invoices, expenses or payments is changed."
      actions={
        <Link
          to={weeklyEmailPreviewPath(config.slug)}
          className="inline-flex items-center gap-1.5 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)]"
          data-link="preview"
        >
          <Eye size={13} />
          Preview Report
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Weekly report">
        {WEEKLY_EMAIL_NOTIFICATIONS.map((n) => {
          const active = n.slug === config.slug;
          const count = data?.counts?.[n.reportType]?.active;
          return (
            <button
              key={n.slug}
              type="button"
              role="tab"
              aria-selected={active}
              data-tab={n.slug}
              onClick={() => update({ filters: { report: n.slug } })}
              className={`rounded-[var(--nu-radius-md)] border px-3 py-1.5 text-[12px] font-semibold ${
                active ? "border-[var(--nu-accent)] bg-[var(--nu-accent)] text-white" : "border-[var(--nu-border)] text-[var(--nu-text)] hover:bg-[var(--nu-surface-alt)]"
              }`}
            >
              {n.title}
              {count !== undefined ? ` (${count} active)` : ""}
            </button>
          );
        })}
        <span className="flex-1" />
        <label className="flex items-center gap-1.5 text-[12px] text-[var(--nu-text-secondary)]">
          Status
          <select className={selectClass} value={status} onChange={(e) => update({ filters: { status: e.target.value === "all" ? "" : e.target.value } })} data-filter="status">
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Card padded={false} elevated>
        <CardHeader icon={<EyeOff size={15} />} title={config.title} subtitle="Active exclusions first, then restored ones. Restored entries are kept permanently." />
        {state.error && !data ? (
          <StateMessage kind="error" title="Couldn't load the Excluded History" detail={state.error} onRetry={state.retry} />
        ) : !data ? (
          <StateMessage kind="loading" title="Loading the Excluded History…" />
        ) : (
          <>
            {data.total === 0 ? (
              <StateMessage kind="empty" title={status === "all" ? "No project has been excluded from this report." : `No ${status} exclusions for this report.`} />
            ) : (
              <div className={`overflow-auto nu-scrollbar max-h-[65vh] transition-opacity ${state.loading ? "opacity-50" : ""}`} aria-busy={state.loading}>
                <ExcludedHistoryTable rows={data.items} onRestore={setConfirm} busy={saving || state.loading} />
              </div>
            )}
            <PaginationBar info={data} disabled={state.loading} noun="exclusion(s)" onPage={(p) => update({ page: p })} onPageSize={(s) => update({ pageSize: s })} />
          </>
        )}
      </Card>
      <ConfirmDialog
        open={confirm !== null}
        title="Include this project again?"
        message={confirm ? restoreConfirmMessage(confirm) : ""}
        confirmLabel={saving ? "Including…" : "Include Again"}
        confirmDisabled={saving}
        icon={<RotateCcw size={18} />}
        onConfirm={() => void handleRestore()}
        onCancel={() => (saving ? undefined : setConfirm(null))}
      />
    </WeeklyEmailPageShell>
  );
}
