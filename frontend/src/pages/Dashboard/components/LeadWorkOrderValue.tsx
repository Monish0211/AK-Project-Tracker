import type { TeamLeadWorkload } from "../../../services/dashboardSummaryService";

/**
 * A team lead's work order value. The backend returns it PER CURRENCY (each project's value in its own regional currency, already in its country's number
 * format), so a person with projects in several countries shows one amount per currency on its own line, never one added figure, and a person whose projects are
 * all outside the headline currency shows their own currency instead of 0. A single-currency person (every India-only person) reads exactly as before.
 */
export function LeadWorkOrderValue({ lead }: { lead: Pick<TeamLeadWorkload, "totalsByCurrency" | "formattedWorkOrderValue"> }) {
  const entries = lead.totalsByCurrency ?? [];
  if (entries.length === 0) return <>{lead.formattedWorkOrderValue}</>;
  if (entries.length === 1) return <span data-testid="lead-value">{entries[0]!.formattedWorkOrderValue}</span>;
  return (
    <span className="inline-flex flex-col" data-testid="lead-value">
      {entries.map((entry) => (
        <span key={entry.currency} data-testid={`lead-value-${entry.currency}`}>
          {entry.formattedWorkOrderValue}
        </span>
      ))}
    </span>
  );
}
