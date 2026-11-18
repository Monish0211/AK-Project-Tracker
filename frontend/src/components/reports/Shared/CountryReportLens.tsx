import { ArrowRight, GitCompareArrows, Layers, LayoutGrid } from "lucide-react";
import { moneyFormatter } from "../../../utils/currencyDisplay";
import type { ReportGroupData } from "../useReportsData";
import type { CountryLensView } from "../countryLens";

const percent = (n: number): string => `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`;

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--nu-text-muted)] truncate">{label}</div>
      <div className={`text-[13px] font-extrabold tabular-nums truncate ${tone ?? "text-[var(--nu-text)]"}`} title={value}>{value}</div>
    </div>
  );
}

/**
 * Country switcher for the Reports page. With several countries in view it replaces one very long page (every country's report stacked under the next) with a bar of country
 * chips and a comparison overview; one chip shows that country's report only. Every figure is one the country's own report group already computes, in that country's currency:
 * nothing is converted or added across countries.
 */
export function CountryReportLens({
  groups,
  invoiceDataAvailable,
  value,
  onChange,
}: {
  groups: ReportGroupData[];
  invoiceDataAvailable: boolean;
  value: CountryLensView;
  onChange: (view: CountryLensView) => void;
}) {
  const chip = (active: boolean) =>
    `shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-bold cursor-pointer transition-colors ${
      active
        ? "border-[var(--nu-accent)] bg-[var(--nu-accent)] text-white shadow-sm"
        : "border-[var(--nu-border)] bg-[var(--nu-surface)] text-[var(--nu-text-secondary)] hover:border-[var(--nu-accent)]/60 hover:text-[var(--nu-text)]"
    }`;
  const none = "—";

  return (
    <div data-testid="country-lens" className="space-y-3">
      <div role="tablist" aria-label="Country" className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
        <button type="button" role="tab" aria-selected={value === "overview"} data-lens="overview" onClick={() => onChange("overview")} className={chip(value === "overview")}>
          <GitCompareArrows size={13} aria-hidden="true" /> Overview
        </button>
        <span className="h-5 w-px shrink-0 bg-[var(--nu-border)]" aria-hidden="true" />
        {groups.map((group) => {
          const active = value === group.key;
          return (
            <button key={group.key} type="button" role="tab" aria-selected={active} data-lens={group.key} onClick={() => onChange(group.key)} className={chip(active)} title={`${group.countryLabel} · ${group.currency}`}>
              <span>{group.countryLabel}</span>
              <span className={`rounded-md px-1 text-[9.5px] font-black ${active ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800"}`}>{group.currency}</span>
              <span className={`text-[10.5px] font-semibold ${active ? "text-white/80" : "text-[var(--nu-text-muted)]"}`}>{group.projects.length}</span>
            </button>
          );
        })}
        <span className="h-5 w-px shrink-0 bg-[var(--nu-border)]" aria-hidden="true" />
        <button type="button" role="tab" aria-selected={value === "all"} data-lens="all" onClick={() => onChange("all")} className={chip(value === "all")} title="Every country's report one after another">
          <Layers size={13} aria-hidden="true" /> All stacked
        </button>
      </div>

      {value === "overview" && (
        <section aria-label="Country comparison" data-testid="country-overview" className="space-y-2.5">
          <div className="flex items-start gap-2 text-[11px] text-[var(--nu-text-muted)]">
            <LayoutGrid size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              One card per country, each in its own currency; amounts in different currencies are never added together. Open a country to see its full report.
            </span>
          </div>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 min-[1500px]:grid-cols-4">
            {groups.map((group) => {
              const money = moneyFormatter(group.currency, group.countryKey);
              const a = group.analytics;
              const billed = a.totalWOValue > 0 ? Math.min(100, Math.max(0, (a.totalInvoiceRaised / a.totalWOValue) * 100)) : 0;
              const collected = Math.min(100, Math.max(0, a.collectionPercent));
              return (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => onChange(group.key)}
                  data-overview-card={group.key}
                  className="group text-left rounded-2xl border border-[var(--nu-border)] bg-[var(--nu-surface)] p-3.5 shadow-xs cursor-pointer transition-all hover:-translate-y-0.5 hover:border-[var(--nu-accent)]/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nu-accent)]/50"
                >
                  <span className="flex items-center gap-2">
                    <span className="inline-flex h-7 min-w-[2.75rem] items-center justify-center rounded-md bg-[var(--nu-accent)] px-1.5 text-[11px] font-black tracking-wide text-white">{group.currency}</span>
                    <span className="min-w-0 flex-1">
                      <span data-testid="overview-country" className="block truncate text-[13px] font-extrabold leading-tight text-[var(--nu-text)]">{group.countryLabel}</span>
                      <span className="block text-[10.5px] leading-tight text-[var(--nu-text-muted)]">
                        {group.projects.length} {group.projects.length === 1 ? "project" : "projects"}
                        {group.manhourRateMissingProjects > 0 && (
                          <span className="ml-1.5 font-semibold text-amber-700 dark:text-amber-300" title={`Man-hour cost of ${group.manhourRateMissingProjects} project${group.manhourRateMissingProjects === 1 ? "" : "s"} has no conversion rate yet and is not included in the cost figures.`}>
                            · rate not set
                          </span>
                        )}
                      </span>
                    </span>
                    <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-[var(--nu-text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--nu-accent)]" />
                  </span>

                  <span className="mt-3 block">
                    <span className="block text-[9.5px] font-bold uppercase tracking-wider text-[var(--nu-text-muted)]">Work Order Value</span>
                    <span className="block text-xl font-black tabular-nums leading-tight text-[var(--nu-text)]" title={money.full(a.totalWOValue)}>{money.compact(a.totalWOValue)}</span>
                  </span>

                  <span className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                    <Metric label="Invoice Raised" value={invoiceDataAvailable ? money.compact(a.totalInvoiceRaised) : none} />
                    <Metric label="Payment Received" value={invoiceDataAvailable ? money.compact(a.totalPaymentReceived) : none} />
                    <Metric label="Outstanding" value={invoiceDataAvailable ? money.compact(a.totalOutstanding) : none} tone="text-amber-700 dark:text-amber-300" />
                    <Metric label="Actual Project Cost" value={money.compact(a.totalActualProjectCost)} />
                  </span>

                  {invoiceDataAvailable && (
                    <span className="mt-3 grid grid-cols-2 gap-x-3" aria-hidden="true">
                      <span className="block">
                        <span className="flex justify-between text-[9.5px] font-semibold text-[var(--nu-text-muted)]"><span>Billed</span><span className="tabular-nums">{percent(billed)}</span></span>
                        <span className="mt-0.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><span className="block h-full rounded-full bg-indigo-500" style={{ width: `${billed}%` }} /></span>
                      </span>
                      <span className="block">
                        <span className="flex justify-between text-[9.5px] font-semibold text-[var(--nu-text-muted)]"><span>Collected</span><span className="tabular-nums">{percent(collected)}</span></span>
                        <span className="mt-0.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><span className="block h-full rounded-full bg-emerald-500" style={{ width: `${collected}%` }} /></span>
                      </span>
                    </span>
                  )}

                  <span className="mt-2.5 flex items-center justify-between border-t border-[var(--nu-border)] pt-2 text-[10.5px]">
                    <span className="text-[var(--nu-text-muted)]">Profit margin</span>
                    <span className={`font-black tabular-nums ${a.totalProfitPercentage < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>{percent(a.totalProfitPercentage)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
