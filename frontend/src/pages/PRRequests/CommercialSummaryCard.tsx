import { formatMoney, rateDirectionLabel } from "../../utils/currencyDisplay";
import type { PRCommercialSummary as Summary, TransactionGroup } from "./prCommercialSummary";

/**
 * The Commercial Summary block of the PR detail page: the Work Order Value the approver is approving. One value when everything is priced in the region's
 * own currency; the regional value, the transaction value and the applied exchange rate when it is not. Presentation only: the figures come from
 * buildPRCommercialSummary (prCommercialSummary.ts), which reuses the portal's existing pricing and aggregation.
 */

const LABEL = "text-[10.5px] font-bold uppercase tracking-wide text-[var(--nu-text-muted)]";
const VALUE = "font-semibold text-[var(--nu-text)] mt-0.5";

function Row({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <p className={VALUE} data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

function rateProblemText(group: TransactionGroup, regionalCurrency: string): string | null {
  if (group.ratesVary) return `The ${group.currency} lines carry different exchange rates. Check them on the full review page.`;
  if (group.rateProblem === "missing") return `No exchange rate (1 ${group.currency} = ? ${regionalCurrency}) is saved for the ${group.currency} lines. Enter it on the full review page before approving.`;
  if (group.rateProblem === "one") return `A rate of exactly 1 between ${group.currency} and ${regionalCurrency} cannot be approved. Correct it on the full review page.`;
  return null;
}

export function CommercialSummaryCard({ summary }: { summary: Summary }) {
  const regional = summary.regionalCurrency;
  const several = summary.kind === "different" && summary.groups.length > 1;

  return (
    <div className="pt-3 border-t border-[var(--nu-border)]" data-testid="pr-commercial-summary">
      <p className={`${LABEL} mb-2`}>Commercial Summary</p>

      {summary.kind === "empty" && (
        <p className="text-[12px] text-[var(--nu-text-muted)]" data-testid="pr-wo-empty">
          No priced quantity lines yet, so there is no Work Order Value to show.
        </p>
      )}

      {summary.kind === "same" && (
        <div className="grid grid-cols-1 gap-3 text-[12px]">
          <Row label="Total Work Order Value" value={formatMoney(summary.total, regional)} testId="pr-wo-total" />
        </div>
      )}

      {summary.kind === "different" && (
        <div className="space-y-3 text-[12px]">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Row label="Regional Work Order Value" value={summary.regionalTotal === null ? "—" : formatMoney(summary.regionalTotal, regional)} testId="pr-wo-regional" />
            {summary.groups.map((group) => (
              <Row
                key={`t-${group.currency}`}
                label={several ? `Transaction Work Order Value (${group.currency})` : "Transaction Work Order Value"}
                value={formatMoney(group.transactionTotal, group.currency)}
                testId={`pr-wo-transaction-${group.currency}`}
              />
            ))}
            {summary.groups.map((group) => (
              <Row
                key={`r-${group.currency}`}
                label={several ? `Exchange Rate (${group.currency})` : "Exchange Rate"}
                value={group.ratesVary ? "Rates vary by line" : rateDirectionLabel(group.currency, regional, group.exchangeRate ?? undefined)}
                testId={`pr-wo-rate-${group.currency}`}
              />
            ))}
          </div>
          {summary.nativeTotal !== null && (
            <p className="text-[var(--nu-text-secondary)]" data-testid="pr-wo-native">
              Includes {formatMoney(summary.nativeTotal, regional)} of lines priced directly in {regional}.
            </p>
          )}
          {summary.groups.map((group) => {
            const problem = rateProblemText(group, regional);
            return problem ? (
              <p key={`p-${group.currency}`} className="text-[var(--nu-warning)] font-semibold" role="alert" data-testid={`pr-wo-warning-${group.currency}`}>
                {problem}
              </p>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}
