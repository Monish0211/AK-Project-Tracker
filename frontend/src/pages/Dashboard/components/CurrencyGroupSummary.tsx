import { useState, type ReactNode } from "react";
import { ChevronDown, Layers } from "lucide-react";
import { moneyFormatter } from "../../../utils/currencyDisplay";
import { currencyGroups, type CurrencyGroup } from "../../../utils/dashboardCurrencyGroups";
import { useDashboardSummary } from "../DashboardSummaryContext";

const countriesText = (group: CurrencyGroup): string => (group.countries.length > 0 ? group.countries.join(" + ") : group.currency);

// One grid definition for the header and every row, so the columns line up exactly: the currency (wider), then the six figures.
const WIDE_COLUMNS = "@min-[820px]:grid-cols-[minmax(10.5rem,1.5fr)_repeat(6,minmax(0,1fr))]";
// Below ~820px of available width a row stacks: the currency on its own line, then the six figures two per line, each with its label.
const ROW = `grid grid-cols-2 gap-x-4 gap-y-2.5 items-center px-3 py-2.5 ${WIDE_COLUMNS} @min-[820px]:gap-x-3`;
const LABEL = "text-[9.5px] font-bold uppercase tracking-wider text-[var(--nu-text-muted)]";

function Figure({ label, value, title, children }: { label: string; value: string; title?: string | undefined; children?: ReactNode }) {
  return (
    <div className="min-w-0 @min-[820px]:text-right">
      <div className={`${LABEL} @min-[820px]:hidden truncate`}>{label}</div>
      <div className="text-[13px] font-extrabold tabular-nums text-[var(--nu-text)] whitespace-nowrap overflow-hidden text-ellipsis" title={title}>
        {value}
      </div>
      {children}
    </div>
  );
}

/**
 * Financial summary per currency (shown only when more than one currency is in view, i.e. All Countries or a user with several currencies): one aligned row per currency with the
 * same six figures as the headline cards. Each currency is calculated on its own and never added to another. Presentation only: every figure comes from the dashboard summary.
 */
export function CurrencyGroupSummary() {
  const summary = useDashboardSummary();
  const groups = currencyGroups(summary);
  const [open, setOpen] = useState(true);
  if (groups.length < 2) return null;
  const totalProjects = summary.kpis.totalProjects;

  return (
    <section aria-label="Financial summary by currency" data-testid="currency-groups" className="@container mt-3 rounded-xl border border-[var(--nu-border)] bg-[var(--nu-surface)] shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="currency-groups-body"
        className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left cursor-pointer hover:bg-[var(--nu-surface-alt)] transition-colors"
      >
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-indigo-50 dark:bg-indigo-950/40">
          <Layers size={13} className="text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-extrabold uppercase tracking-wider text-[var(--nu-text)]">Financial summary by currency</span>
          <span className="block text-[11px] leading-snug text-[var(--nu-text-muted)]" data-testid="currency-groups-note">
            {totalProjects} accessible projects in {groups.length} currencies. Each currency is calculated on its own and never added to another; the cards above cover {groups[0]!.currency} projects only ({groups[0]!.projects}).
          </span>
        </span>
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[10.5px] font-bold text-[var(--nu-text-secondary)]">
          {open ? "Hide" : "Show"}
          <ChevronDown size={13} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      <div id="currency-groups-body" hidden={!open} className="border-t border-[var(--nu-border)]">
        {/* Column headings (wide layout only; a stacked row labels its own figures). */}
        <div className={`hidden bg-[var(--nu-surface-alt)] px-3 py-1.5 @min-[820px]:grid ${WIDE_COLUMNS} gap-x-3 ${LABEL}`} aria-hidden="true">
          <span>Currency</span>
          <span className="text-right">Work Order Value</span>
          <span className="text-right">Unbilled</span>
          <span className="text-right">Invoice Raised</span>
          <span className="text-right">Payment Received</span>
          <span className="text-right">Actual Project Cost</span>
          <span className="text-right">Billed In %</span>
        </div>

        <div className="divide-y divide-[var(--nu-border)]">
          {groups.map((group) => {
            const money = moneyFormatter(group.currency);
            return (
              <div key={group.currency} data-currency-group={group.currency} className={`${ROW} hover:bg-[var(--nu-surface-alt)]/60 transition-colors`}>
                <div className="col-span-2 @min-[820px]:col-span-1 min-w-0 flex items-center gap-2.5">
                  <span data-testid="currency-group-code" className="inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded-md bg-slate-100 dark:bg-slate-800 px-1.5 text-[11.5px] font-black tracking-wide text-[var(--nu-text)]">
                    {group.currency}
                  </span>
                  <span className="min-w-0">
                    <span data-testid="currency-group-countries" className="block truncate text-[12px] font-bold leading-tight text-[var(--nu-text)]" title={countriesText(group)}>
                      {countriesText(group)}
                    </span>
                    <span data-testid="currency-group-projects" className="block text-[10.5px] leading-tight text-[var(--nu-text-muted)]">
                      {group.projects} {group.projects === 1 ? "project" : "projects"}
                    </span>
                  </span>
                </div>
                <Figure label="Work Order Value" value={money.compact(group.workOrderValue)} title={money.full(group.workOrderValue)} />
                <Figure label="Unbilled" value={money.compact(group.unbilled)} title={money.full(group.unbilled)} />
                <Figure label="Invoice Raised" value={money.compact(group.invoiceRaised)} title={money.full(group.invoiceRaised)} />
                <Figure label="Payment Received" value={money.compact(group.paymentReceived)} title={money.full(group.paymentReceived)} />
                <Figure label="Actual Project Cost" value={money.compact(group.actualProjectCost)} title={money.full(group.actualProjectCost)}>
                  {group.rateNotSetProjects > 0 && (
                    <div
                      data-testid="currency-group-rate-not-set"
                      className="mt-0.5 text-[10px] font-semibold leading-tight text-amber-700 dark:text-amber-300"
                      title={`Man-hour cost of ${group.rateNotSetProjects} project${group.rateNotSetProjects === 1 ? "" : "s"} has no conversion rate yet and is not included.`}
                    >
                      Rate not set · {group.rateNotSetProjects} project{group.rateNotSetProjects === 1 ? "" : "s"}
                    </div>
                  )}
                </Figure>
                <Figure label="Billed In %" value={`${group.billedInPercent.toFixed(2)} %`}>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, Math.max(0, group.billedInPercent))}%` }} />
                  </div>
                </Figure>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
