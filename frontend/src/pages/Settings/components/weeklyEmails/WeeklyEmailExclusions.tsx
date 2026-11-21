import { RotateCcw } from "lucide-react";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import type { WeeklyReportExclusion } from "../../../../services/weeklyEmailService";
import { formatWhen } from "./weeklyEmailNotifications";

/**
 * Weekly email report exclusions (Nov 2026): the confirmation texts and the Excluded History table, shared by the
 * Preview Report and Excluded History pages. Presentational only - who may use them is decided by the pages and
 * enforced by the backend (Administrators only).
 */

const th = "px-3 py-2 whitespace-nowrap";
const td = "px-3 py-2 align-top";

export function ExcludedHistoryTable({ rows, onRestore, busy }: { rows: WeeklyReportExclusion[]; onRestore?: (row: WeeklyReportExclusion) => void; busy?: boolean }) {
  return (
    <table className="w-full border-collapse text-left text-[12px]" data-table="weekly-excluded-history">
      <thead className="sticky top-0 bg-[var(--nu-surface-alt)] text-[11px] uppercase text-[var(--nu-text-muted)]">
        <tr>
          <th className={th}>Project</th>
          <th className={th}>PR Number</th>
          <th className={th}>Client</th>
          <th className={th}>Excluded From</th>
          <th className={th}>Excluded By</th>
          <th className={th}>Excluded At</th>
          <th className={th}>Status</th>
          <th className={`${th} text-right`}>Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-[var(--nu-border)]" data-exclusion-status={r.status}>
            <td className={`${td} min-w-[13rem]`}>{r.projectTitle}</td>
            <td className={`${td} whitespace-nowrap font-semibold`}>{r.prNo}</td>
            <td className={`${td} min-w-[10rem]`}>{r.client}</td>
            <td className={td}>{r.reportName}</td>
            <td className={td}>{r.excludedBy}</td>
            <td className={`${td} whitespace-nowrap`}>{formatWhen(r.excludedAt)}</td>
            <td className={td}>
              <Badge tone={r.status === "Active" ? "warning" : "neutral"}>{r.status}</Badge>
              {r.status === "Restored" && (
                <span className="block text-[11px] text-[var(--nu-text-muted)] mt-0.5">
                  by {r.restoredBy} · {formatWhen(r.restoredAt)}
                </span>
              )}
            </td>
            <td className={`${td} text-right`}>
              {r.status === "Active" && onRestore ? (
                <Button variant="outline" size="sm" icon={<RotateCcw size={12} />} onClick={() => onRestore(r)} disabled={busy} data-action="restore">
                  Include Again
                </Button>
              ) : (
                <span className="text-[var(--nu-text-muted)]">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
