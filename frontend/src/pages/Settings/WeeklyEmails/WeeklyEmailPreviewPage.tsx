import { useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Eye } from "lucide-react";
import { useAuth } from "../../../auth/authContext";
import { hasModuleAccess } from "../../../auth/permissions";
import AccessDenied from "../../AccessDenied/AccessDenied";
import { Card, CardHeader } from "../../../components/ui/Card";
import type { MissingExpensePreviewRow, UnpaidInvoicePreviewRow, WeeklyEmailPreviewPage as PreviewPageData } from "../../../services/weeklyEmailService";
import { canManageWeeklyEmails, findWeeklyEmailNotification, type WeeklyEmailNotification } from "../components/weeklyEmails/weeklyEmailNotifications";
import { MissingExpensePreviewTable, PreviewSummary, UnpaidInvoicePreviewTable } from "../components/weeklyEmails/WeeklyEmailTables";
import { PaginationBar, StateMessage, WeeklyEmailPageShell } from "../components/weeklyEmails/WeeklyEmailPaging";
import { usePagedRequest, usePageParams } from "../components/weeklyEmails/useWeeklyEmailPaging";
import "../settings-theme.css";

/** Settings → Weekly Emails → Preview Report (Oct 2026): one server-side page of the report at a time. */
export default function WeeklyEmailPreviewPage() {
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
  if (config.previewModule && !hasModuleAccess(user, config.previewModule)) {
    return (
      <WeeklyEmailPageShell eyebrow="Preview Report" title={config.title}>
        <Card padded={false} elevated>
          <StateMessage kind="denied" title={`This preview lists ${config.previewModule.toLowerCase()} details`} detail={`It needs ${config.previewModule} module access, which your account does not have.`} />
        </Card>
      </WeeklyEmailPageShell>
    );
  }
  return <PreviewContent key={config.slug} config={config} />;
}

function PreviewContent({ config }: { config: WeeklyEmailNotification }) {
  const { page, pageSize, update } = usePageParams();
  const fetchPage = useCallback(() => config.api.previewPage(page, pageSize) as Promise<PreviewPageData<unknown, unknown>>, [config, page, pageSize]);
  const state = usePagedRequest(fetchPage, `${config.slug}:${page}:${pageSize}`);
  const data = state.data;

  // The report shrank since the link was made: step back to its last page.
  useEffect(() => {
    if (data && data.items.length === 0 && data.total > 0 && page > data.totalPages) update({ page: data.totalPages });
  }, [data, page, update]);

  return (
    <WeeklyEmailPageShell
      eyebrow="Preview Report — not sent"
      title={config.title}
      description={config.subtitle}
    >
      {data && <PreviewSummary config={config} data={data} />}
      <Card padded={false} elevated>
        <CardHeader icon={<Eye size={15} />} title="Matching records" subtitle={data ? `Report generated ${data.generatedAtLabel}. Sorted as in the email.` : "Building this week's report…"} />
        {state.error && !data ? (
          <StateMessage kind="error" title="Couldn't build the preview" detail={state.error} onRetry={state.retry} />
        ) : !data ? (
          <StateMessage kind="loading" title="Building this week's report…" />
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
              <StateMessage kind="empty" title={`Nothing to report — no ${config.itemNoun} match.`} detail="The weekly run would not send an email." />
            ) : (
              <div className={`overflow-auto nu-scrollbar max-h-[65vh] transition-opacity ${state.loading ? "opacity-50" : ""}`} aria-busy={state.loading}>
                {config.slug === "unpaid-invoices" ? (
                  <UnpaidInvoicePreviewTable rows={data.items as UnpaidInvoicePreviewRow[]} />
                ) : (
                  <MissingExpensePreviewTable rows={data.items as MissingExpensePreviewRow[]} />
                )}
              </div>
            )}
            <PaginationBar
              info={data}
              disabled={state.loading}
              noun={config.itemNoun}
              onPage={(p) => update({ page: p })}
              onPageSize={(s) => update({ pageSize: s })}
            />
          </>
        )}
      </Card>
    </WeeklyEmailPageShell>
  );
}
