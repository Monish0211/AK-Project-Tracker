import type { ReactNode } from "react";
import { Play } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import {
  deliveryOutcome,
  RUN_STATUS_LABELS,
  runStatusTone,
  type MissingExpensePreviewRow,
  type UnpaidInvoicePreviewRow,
  type UnpaidInvoiceSummary,
  type WeeklyEmailPreviewPage as PreviewPageData,
  type WeeklyEmailRun,
} from "../../../../services/weeklyEmailService";
import { formatInvoiceDate, formatWhen, runTypeLabel, type WeeklyEmailNotification } from "./weeklyEmailNotifications";

/**
 * Presentational tables of the Weekly Emails Preview Report and View All Runs
 * pages (Oct 2026). They render exactly the rows they are given — one server
 * page — and nothing else.
 */

const th = "px-3 py-2 whitespace-nowrap";
const td = "px-3 py-2 align-top";
const inr = (v: number) => `₹ ${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const NotRecorded = () => <span className="text-[var(--nu-text-muted)]">Not recorded</span>;

function PrLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-[var(--nu-accent)] hover:underline font-semibold">
      {children}
    </a>
  );
}

export function MissingExpensePreviewTable({ rows }: { rows: MissingExpensePreviewRow[] }) {
  return (
    <table className="w-full border-collapse text-left text-[12px]" data-table="weekly-email-preview">
      <thead className="sticky top-0 bg-[var(--nu-surface-alt)] text-[11px] uppercase text-[var(--nu-text-muted)]">
        <tr>
          <th className={th}>PR No.</th>
          <th className={th}>Client</th>
          <th className={th}>Project Title</th>
          <th className={th}>Project Manager</th>
          <th className={th}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((x) => (
          <tr key={x.id} className="border-t border-[var(--nu-border)]">
            <td className={`${td} whitespace-nowrap`}>
              <PrLink href={x.projectUrl}>{x.prNo}</PrLink>
            </td>
            <td className={td}>{x.client}</td>
            <td className={td}>{x.projectTitle}</td>
            <td className={td}>{x.projectManager || "—"}</td>
            <td className={td}>{x.projectStatus || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function UnpaidInvoicePreviewTable({ rows }: { rows: UnpaidInvoicePreviewRow[] }) {
  return (
    <table className="w-full border-collapse text-left text-[12px]" data-table="weekly-unpaid-invoices-preview">
      <thead className="sticky top-0 bg-[var(--nu-surface-alt)] text-[11px] uppercase text-[var(--nu-text-muted)]">
        <tr>
          <th className={th}>PR No.</th>
          <th className={th}>Client</th>
          <th className={th}>Project Title</th>
          <th className={th}>Invoice No.</th>
          <th className={th}>Invoice Date</th>
          <th className={`${th} text-right`}>Days</th>
          <th className={`${th} text-right`}>Invoice Amount</th>
          <th className={`${th} text-right`}>Amount Paid</th>
          <th className={`${th} text-right`}>Outstanding</th>
          <th className={th}>Status</th>
          <th className={th}>Project Manager</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((x) => (
          <tr key={`${x.projectId}-${x.invoiceNo}`} className="border-t border-[var(--nu-border)]">
            <td className={`${td} whitespace-nowrap`}>
              <PrLink href={x.projectUrl}>{x.prNo}</PrLink>
            </td>
            <td className={`${td} min-w-[11rem]`}>{x.client}</td>
            <td className={`${td} min-w-[13rem]`}>{x.projectTitle}</td>
            <td className={`${td} whitespace-nowrap`}>{x.invoiceNo}</td>
            <td className={`${td} whitespace-nowrap`}>{formatInvoiceDate(x.invoiceDate)}</td>
            <td className={`${td} text-right font-semibold`}>{x.daysSinceRaised}</td>
            <td className={`${td} text-right whitespace-nowrap`}>
              {inr(x.invoiceAmountINR)}
              {x.originalAmountNote && <span className="block text-[11px] text-[var(--nu-text-muted)]">{x.originalAmountNote}</span>}
            </td>
            <td className={`${td} text-right whitespace-nowrap`}>{x.amountPaidINR === null ? <NotRecorded /> : inr(x.amountPaidINR)}</td>
            <td className={`${td} text-right whitespace-nowrap font-semibold`}>{x.outstandingINR === null ? <NotRecorded /> : inr(x.outstandingINR)}</td>
            <td className={`${td} whitespace-nowrap ${x.status === "Partially Paid" ? "text-[var(--nu-warning)]" : "text-[var(--nu-danger)]"}`}>{x.status}</td>
            <td className={td}>{x.projectManager || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "danger" | "warning" }) {
  const color = tone === "danger" ? "text-[var(--nu-danger)]" : tone === "warning" ? "text-[var(--nu-warning)]" : "text-[var(--nu-text)]";
  return (
    <div className="rounded-[var(--nu-radius-md)] border border-[var(--nu-border)] bg-[var(--nu-surface)] px-3 py-2 min-w-0">
      <p className="text-[10.5px] font-bold uppercase tracking-wide leading-tight text-[var(--nu-text-muted)]">
        {label}
      </p>
      <p className={`text-[15px] font-bold ${color}`}>{value}</p>
    </div>
  );
}

/** Whole-report figures — the same on every page. */
export function PreviewSummary({ config, data }: { config: WeeklyEmailNotification; data: PreviewPageData<unknown, unknown> }) {
  const fmt = (n: number) => n.toLocaleString("en-IN");
  const summary = config.slug === "unpaid-invoices" ? (data.summary as UnpaidInvoiceSummary) : null;
  return (
    <div className="space-y-2" data-summary>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Stat label="Generated" value={<span className="text-[12.5px]">{data.generatedAtLabel}</span>} />
        <Stat label={config.eligibleLabel} value={fmt(data.eligibleCount)} />
        <Stat label={config.matchLabel} value={fmt(data.matchCount)} tone={data.matchCount > 0 ? "danger" : undefined} />
        {summary && <Stat label="Outstanding on fully unpaid (Raised / Submitted)" value={inr(summary.knownOutstandingINR)} />}
        {summary && summary.partiallyPaidCount > 0 && <Stat label="Partially Paid (outstanding not recorded)" value={fmt(summary.partiallyPaidCount)} tone="warning" />}
      </div>
      <p className="text-[11.5px] text-[var(--nu-text-muted)]" data-send-line>
        Opening this preview never sends an email.{" "}
        {data.wouldSend
          ? `The weekly run would email ${data.recipients.to}${data.recipients.cc.length ? ` + ${data.recipients.cc.length} CC` : ""}.`
          : data.matchCount === 0
            ? "Nothing to report, so the weekly run would not send an email."
            : "Email delivery is off on this server, so the weekly run would not send an email."}
      </p>
    </div>
  );
}

export function RunsTable({ runs, matchLabel, onRetry, retrying }: { runs: WeeklyEmailRun[]; matchLabel: string; onRetry?: (run: WeeklyEmailRun) => void; retrying?: boolean }) {
  return (
    <table className="w-full border-collapse text-left text-[12px]" data-table="weekly-email-runs-history">
      <thead className="sticky top-0 bg-[var(--nu-surface-alt)] text-[11px] uppercase text-[var(--nu-text-muted)]">
        <tr>
          <th className={th}>Started</th>
          <th className={th}>Run type</th>
          <th className={th}>Status</th>
          <th className={`${th} text-right`}>Checked</th>
          <th className={`${th} text-right`}>{matchLabel}</th>
          <th className={th}>Delivery</th>
          <th className={th}>Details</th>
          <th className={th}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id} className="border-t border-[var(--nu-border)]" data-run-status={r.status}>
            <td className={`${td} whitespace-nowrap`}>
              {formatWhen(r.startedAt)}
              {r.finishedAt && <span className="block text-[11px] text-[var(--nu-text-muted)]">Finished {formatWhen(r.finishedAt)}</span>}
            </td>
            <td className={`${td} whitespace-nowrap`}>{runTypeLabel(r)}</td>
            <td className={td}>
              <Badge tone={runStatusTone(r.status)}>{RUN_STATUS_LABELS[r.status] ?? r.status}</Badge>
            </td>
            <td className={`${td} text-right`}>{r.eligibleCount ?? "—"}</td>
            <td className={`${td} text-right`}>{r.missingCount ?? "—"}</td>
            <td className={td}>{deliveryOutcome(r)}</td>
            <td className={`${td} text-[11px] text-[var(--nu-text-muted)] max-w-[22rem]`}>
              {r.error}
              {r.attempts > 1 && <span className="block">{r.attempts} attempts</span>}
            </td>
            <td className={`${td} text-right`}>
              {r.retryable && onRetry && (
                <Button variant="outline" size="sm" icon={<Play size={12} />} onClick={() => onRetry(r)} disabled={retrying} data-action="retry">
                  Retry
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
