import type { DashboardSummary } from "../services/dashboardSummaryService";

/**
 * The Dashboard's financial summary per currency group (All Countries). The server already totals every currency separately (`kpis` for the headline currency,
 * `otherCurrencies` for the rest); this only shapes those figures for display. Nothing is converted, summed or compared across currencies.
 * Unbilled and Billed In % are the same two formulas the six headline cards use.
 */
export interface CurrencyGroup {
  currency: string;
  /** Countries covered, from the per-country sections ("Abu Dhabi", "FZE"); empty on an older backend that sends none. */
  countries: string[];
  /** Projects in THIS currency (every project is in exactly one group). */
  projects: number;
  workOrderValue: number;
  unbilled: number;
  invoiceRaised: number;
  paymentReceived: number;
  actualProjectCost: number;
  billedInPercent: number;
  /** Projects in this group whose man-hour cost is incomplete (no conversion rate applied yet): that cost is NOT in Actual Project Cost. */
  rateNotSetProjects: number;
}

const unbilledOf = (workOrderValue: number, invoiceRaised: number): number => Math.max(workOrderValue - invoiceRaised, 0);
const billedPercentOf = (workOrderValue: number, invoiceRaised: number): number =>
  workOrderValue === 0 ? 0 : Math.min(100, Math.max(0, (invoiceRaised / workOrderValue) * 100));

export function currencyGroups(summary: Pick<DashboardSummary, "kpis" | "kpiCurrency" | "otherCurrencies" | "departmentsByCountry">): CurrencyGroup[] {
  const headlineCurrency = summary.kpiCurrency ?? "INR";
  const others = summary.otherCurrencies ?? [];
  const countriesOf = (currency: string): string[] => {
    const names: string[] = [];
    for (const section of summary.departmentsByCountry ?? []) {
      if (section.currency === currency && !names.includes(section.country)) names.push(section.country);
    }
    return names;
  };
  // `kpis.totalProjects` is the count of ALL accessible projects; the headline currency's own count is what is left after the other currencies' projects.
  const headlineProjects = Math.max(0, summary.kpis.totalProjects - others.reduce((sum, o) => sum + o.totalProjects, 0));
  const make = (currency: string, k: { totalWOValue: number; totalInvoiceRaised: number; totalPaymentReceived: number; totalActualProjectCost: number; manhourIncompleteProjects?: number | undefined }, projects: number): CurrencyGroup => ({
    currency,
    countries: countriesOf(currency),
    projects,
    workOrderValue: k.totalWOValue,
    unbilled: unbilledOf(k.totalWOValue, k.totalInvoiceRaised),
    invoiceRaised: k.totalInvoiceRaised,
    paymentReceived: k.totalPaymentReceived,
    actualProjectCost: k.totalActualProjectCost,
    billedInPercent: billedPercentOf(k.totalWOValue, k.totalInvoiceRaised),
    rateNotSetProjects: k.manhourIncompleteProjects ?? 0,
  });
  return [make(headlineCurrency, summary.kpis, headlineProjects), ...others.map((o) => make(o.currency, o, o.totalProjects))];
}
