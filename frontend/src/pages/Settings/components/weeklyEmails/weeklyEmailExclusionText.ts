import type { WeeklyReportExclusion } from "../../../../services/weeklyEmailService";
import type { WeeklyEmailNotification } from "./weeklyEmailNotifications";

/** Weekly email report exclusions (Nov 2026): confirmation texts for Exclude (Preview Report) and Include Again (Excluded History). */

/** The project an Administrator is about to exclude (from either report). */
export interface ExcludeTarget {
  projectId: string;
  prNo: string;
  projectTitle: string;
  client: string;
}

/** Confirmation text: the project, its PR No. and the report it leaves (Report 2: all of its invoices). */
export function excludeConfirmMessage(config: WeeklyEmailNotification, target: ExcludeTarget): string {
  const what =
    config.slug === "unpaid-invoices"
      ? "All of this project's invoices will be left out of this report's preview and of every future weekly email until an Administrator includes it again."
      : "The project will be left out of this report's preview and of every future weekly email until an Administrator includes it again.";
  return `Project: ${target.projectTitle}\nPR Number: ${target.prNo}\nReport: ${config.title}\n\n${what}\n\nNothing about the project itself changes (no project, invoice, expense or payment data). It stays in the other weekly report.`;
}

export function restoreConfirmMessage(row: WeeklyReportExclusion): string {
  return `Project: ${row.projectTitle}\nPR Number: ${row.prNo}\nReport: ${row.reportName}\n\nThe project will appear in this report's preview and weekly emails again whenever it meets the report's rules. The exclusion stays in this history.`;
}
