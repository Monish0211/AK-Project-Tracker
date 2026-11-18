import type { DashboardSummary, Departments, TopClient } from "../services/dashboardSummaryService";

/**
 * Country-wise sections of the Dashboard's Top Clients and Department panels (Phase 4 final). The server already ranks every country on its own, in its own
 * currency; these helpers only shape that for display. Nothing is converted, summed or compared across countries here.
 *
 * A summary from an older backend has no per-country field: the single headline list is then shown exactly as it always was (one section, no country label).
 */
export interface CountrySection<T> {
  /** Stable React key: country + currency. */
  key: string;
  /** What to show as the section's title ("FZE", "Oman"); null for the unlabelled headline list of an older backend. */
  country: string | null;
  /** The currency every amount in this section is in. */
  currency: string;
  data: T;
}

export function topClientSections(summary: Pick<DashboardSummary, "topClients" | "topClientsByCountry" | "kpiCurrency">): CountrySection<TopClient[]>[] {
  if (summary.topClientsByCountry) {
    return summary.topClientsByCountry.map((s) => ({ key: `${s.countryKey}|${s.currency}`, country: s.country, currency: s.currency, data: s.clients }));
  }
  return [{ key: "headline", country: null, currency: summary.kpiCurrency ?? "INR", data: summary.topClients }];
}

export function departmentSections(summary: Pick<DashboardSummary, "departments" | "departmentsByCountry" | "kpiCurrency">): CountrySection<Departments>[] {
  if (summary.departmentsByCountry) {
    return summary.departmentsByCountry.map((s) => ({ key: `${s.countryKey}|${s.currency}`, country: s.country, currency: s.currency, data: s.departments }));
  }
  return [{ key: "headline", country: null, currency: summary.kpiCurrency ?? "INR", data: summary.departments }];
}

/** "India – INR" for a section header. */
export function sectionTitle(section: Pick<CountrySection<unknown>, "country" | "currency">): string {
  return section.country ? `${section.country} – ${section.currency}` : section.currency;
}
