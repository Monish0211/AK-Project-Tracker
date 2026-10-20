import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { History, Loader2, Play, RefreshCw } from "lucide-react";
import { useAuth } from "../../../auth/authContext";
import AccessDenied from "../../AccessDenied/AccessDenied";
import { Button } from "../../../components/ui/Button";
import { Card, CardHeader } from "../../../components/ui/Card";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { usePmoToast } from "../../../components/ui/usePmoToast";
import { ApiError } from "../../../services/apiClient";
import { RUN_STATUS_FILTERS, RUN_TRIGGER_FILTERS, SKIP_REASON_LABELS, type WeeklyEmailRun } from "../../../services/weeklyEmailService";
import { canManageWeeklyEmails, findWeeklyEmailNotification, type WeeklyEmailNotification } from "../components/weeklyEmails/weeklyEmailNotifications";
import { RunsTable } from "../components/weeklyEmails/WeeklyEmailTables";
import { PaginationBar, StateMessage, WeeklyEmailPageShell } from "../components/weeklyEmails/WeeklyEmailPaging";
import { usePagedRequest, usePageParams } from "../components/weeklyEmails/useWeeklyEmailPaging";
import "../settings-theme.css";

const selectClass = "h-8 px-2 rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface-alt)] text-[12px] text-[var(--nu-text)]";
const FILTER_KEYS = ["status", "trigger"] as const;

/** Settings → Weekly Emails → View All Runs (Oct 2026): server-paged run history, newest first. */
export default function WeeklyEmailRunsPage() {
  const { notification } = useParams();
  const config = findWeeklyEmailNotification(notification);
  const { user } = useAuth();
  if (!canManageWeeklyEmails(user?.role)) return <AccessDenied moduleName="Weekly Emails" />;
  if (!config) {
    return (
      <WeeklyEmailPageShell eyebrow="Weekly Emails" title="Notification not found">
        <Card padded={false} elevated>
          <StateMessage kind="error" title="There is no weekly notification at this address." />
        </Card>
      </WeeklyEmailPageShell>
    );
  }
  return <RunsContent key={config.slug} config={config} />;
}

function RunsContent({ config }: { config: WeeklyEmailNotification }) {
  const { showToast } = usePmoToast();
  const { page, pageSize, filters, update } = usePageParams(FILTER_KEYS);
  const status = filters.status ?? "";
  const trigger = filters.trigger ?? "";
  const fetchPage = useCallback(() => config.api.runs(page, pageSize, { status, trigger }), [config, page, pageSize, status, trigger]);
  const state = usePagedRequest(fetchPage, `${config.slug}:${page}:${pageSize}:${status}:${trigger}`);
  const [confirm, setConfirm] = useState<WeeklyEmailRun | null>(null);
  const [retrying, setRetrying] = useState(false);
  const data = state.data;

  useEffect(() => {
    if (data && data.items.length === 0 && data.total > 0 && page > data.totalPages) update({ page: data.totalPages });
  }, [data, page, update]);

  const handleRetry = async () => {
    setConfirm(null);
    setRetrying(true);
    try {
      // The backend re-checks everything: a week that was sent, is in progress or has unknown delivery is skipped, never re-sent.
      const r = await config.api.run("retry-weekly");
      const message =
        r.outcome === "skipped"
          ? `Nothing sent — ${SKIP_REASON_LABELS[r.reason] ?? r.reason}.`
          : r.outcome === "sent"
            ? `Email sent — ${r.missingCount} of ${r.eligibleCount} ${config.itemNoun} listed.`
            : r.outcome === "no_missing"
              ? `Nothing to report (${r.eligibleCount} ${config.itemNoun} checked) — no email sent.`
              : r.outcome === "disabled"
                ? "Checked — email delivery is disabled on this server, nothing was sent."
                : `Email delivery failed: ${r.error ?? "unknown error"}`;
      showToast({ type: r.outcome === "failed" ? "error" : "success", message });
      state.retry();
    } catch (err) {
      showToast({ type: "error", message: err instanceof ApiError ? err.message : "The retry could not be started." });
    } finally {
      setRetrying(false);
    }
  };

  const filtered = Boolean(status || trigger);

  return (
    <WeeklyEmailPageShell
      eyebrow="Run History"
      title={config.title}
      description="Every weekly and manual check, newest first. A failed weekly run can be retried safely; a run whose delivery is unknown is never re-sent automatically, because the email may already have arrived."
      actions={
        <Button variant="secondary" size="sm" icon={state.loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} onClick={state.retry} disabled={state.loading}>
          Refresh
        </Button>
      }
    >
      <Card padded={false} elevated>
        <CardHeader icon={<History size={15} />} title="Runs" subtitle={data ? `${data.total.toLocaleString("en-IN")} run(s)${filtered ? " match the filters" : ""}.` : "Loading…"} />
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[var(--nu-border)] text-[12px]">
          <label className="flex items-center gap-1.5 text-[var(--nu-text-secondary)]">
            Status
            <select className={selectClass} value={status} onChange={(e) => update({ filters: { status: e.target.value } })} aria-label="Filter by status">
              {RUN_STATUS_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[var(--nu-text-secondary)]">
            Run type
            <select className={selectClass} value={trigger} onChange={(e) => update({ filters: { trigger: e.target.value } })} aria-label="Filter by run type">
              {RUN_TRIGGER_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => update({ filters: { status: "", trigger: "" } })}>
              Clear filters
            </Button>
          )}
        </div>

        {state.error && !data ? (
          <StateMessage kind="error" title="Couldn't load the run history" detail={state.error} onRetry={state.retry} />
        ) : !data ? (
          <StateMessage kind="loading" title="Loading run history…" />
        ) : (
          <>
            {state.error && (
              <div className="px-4 py-2 text-[11.5px] text-[var(--nu-danger)] border-b border-[var(--nu-border)] flex items-center gap-2" data-state="page-error">
                Couldn't load that page: {state.error}
                <button type="button" className="underline font-semibold" onClick={state.retry}>
                  Try again
                </button>
              </div>
            )}
            {data.total === 0 ? (
              <StateMessage kind="empty" title={filtered ? "No runs match these filters." : "No runs yet."} detail={filtered ? undefined : "The first weekly check will appear here."} />
            ) : (
              <div className={`overflow-auto nu-scrollbar max-h-[65vh] transition-opacity ${state.loading ? "opacity-50" : ""}`} aria-busy={state.loading}>
                <RunsTable runs={data.items} matchLabel={config.matchLabel} onRetry={setConfirm} retrying={retrying} />
              </div>
            )}
            <PaginationBar info={data} disabled={state.loading} noun="runs" onPage={(p) => update({ page: p })} onPageSize={(s) => update({ pageSize: s })} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        title="Retry this week's run?"
        message={`This week's scheduled run did not send. If any ${config.matchPhrase}, one email is sent now to the saved recipients. A week that was already sent is never sent again.`}
        confirmLabel="Retry now"
        icon={<Play size={18} />}
        onConfirm={handleRetry}
        onCancel={() => setConfirm(null)}
      />
    </WeeklyEmailPageShell>
  );
}
