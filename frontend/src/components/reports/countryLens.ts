import type { ReportGroupData } from "./useReportsData";

/** What the Reports page shows when several countries are in view: the comparison overview, every country stacked (the long view), or one country's report (its group key). */
export type CountryLensView = "overview" | "all" | string;

/** A selection that no longer exists (a filter removed that country) falls back to the overview; one country in view never needs the bar. */
export function resolveLensView(view: CountryLensView, groups: Pick<ReportGroupData, "key">[]): CountryLensView {
  if (groups.length < 2) return "all";
  return view === "overview" || view === "all" || groups.some((g) => g.key === view) ? view : "overview";
}
