import { prCategoryLabel } from "../../utils/prCategoryLabel";
import type { Project } from "../../types/Project";
import type { PrCategoryCountryReference } from "../../services/projectCountryImportService";
import { isNonInrRegional, regionalCurrencyOf, regionalWorkOrderValue } from "../../utils/currencyDisplay";

/**
 * Country-aware Reports (Global Multi-Country Phase 3). Reports never add different currencies together: the projects in view are split into
 * country groups, each group has ONE currency, and the existing report calculations run once per group (reportAnalytics.ts, unchanged).
 *
 * A project's country is the one its stored PR Category maps to, read from the backend's PR Category -> country reference: never the PR Number
 * prefix, the creator or the selector. Its currency is its stored regional currency (a legacy project, with none stored, is INR).
 */

export const NO_COUNTRY_KEY = "none";

export interface ProjectCountry {
  /** The country's code (a stable key), or `category:<stored name>` / `none` when the reference has no country for it. */
  key: string;
  /** What the user reads: the country's display name (FZE, not the stored FZI), else the stored category name. */
  label: string;
}

export function countryOfProject(project: Pick<Project, "prCategory">, reference: PrCategoryCountryReference | null | undefined): ProjectCountry {
  const category = project.prCategory ?? "";
  const country = reference?.items.find((item) => item.prCategory === category)?.country;
  if (country) return { key: country.code ?? country.name, label: prCategoryLabel(country.displayName) };
  if (category) return { key: `category:${category}`, label: prCategoryLabel(category) };
  return { key: NO_COUNTRY_KEY, label: "No country" };
}

/** The Country / Region filter: "ALL" keeps everything, otherwise only the projects whose country (by stored PR Category) is the selected one. */
export function matchesCountryFilter(project: Pick<Project, "prCategory">, countryKey: string, reference: PrCategoryCountryReference | null | undefined): boolean {
  return countryKey === "ALL" || countryOfProject(project, reference).key === countryKey;
}

/**
 * The project as the report calculations read it. An INR or legacy project is returned untouched. For a project whose regional currency is not
 * INR the INR-named Work Order Value is 0 by design, so the report input carries its REGIONAL value instead (the group is then formatted in that
 * regional currency, never as rupees). Liquidated Damages follows the same rule (Phase 4 final): a regional LD, recorded in the project's own currency, is
 * carried in this group's currency and deducted from its profit; an explicit "No LD" stays "No"; a LEGACY rupee LD (recorded before regional LD existed) is left out
 * of the group rather than added to another currency (the LD review report lists it). This is an input adapter for the existing calculations, never stored and
 * never a second calculation.
 */
export function reportBasis(project: Project): Project {
  if (!isNonInrRegional(project)) return project;
  return {
    ...project,
    workOrderValueINR: regionalWorkOrderValue(project),
    ...regionalLdBasis(project),
    // Man-hour cost (Phase 4): the backend converts the INR cost (INR rate x hours) into the project's regional currency with the project's own manpower
    // rate. A non-INR group counts ONLY that converted amount. A row with no rate applied counts as 0 (never its INR figure added to this currency's
    // expenses), and the group reports how many projects are affected (manhourRateMissingProjects) so the page says so. Hours are kept.
    resources: (Array.isArray(project.resources) ? project.resources : []).map((r) => ({ ...r, manhourCost: convertedManhourCost(r) })),
  };
}

/** The LD fields of a non-INR project as the group's calculations read them (the INR-named field then holds the amount in the group's own currency). */
function regionalLdBasis(project: Project): Pick<Project, "ldApplicable" | "ldAmountINR"> {
  const currency = regionalCurrencyOf(project);
  if (project.ldApplicable === false) return { ldApplicable: false, ldAmountINR: null };
  if (project.ldApplicable === true && typeof project.ldAmountRegional === "number" && (project.ldCurrency ?? currency) === currency) {
    return { ldApplicable: true, ldAmountINR: project.ldAmountRegional };
  }
  return { ldApplicable: null, ldAmountINR: null };
}

/** A resource row's man-hour cost in the project's regional currency: its converted amount, or 0 when no rate was applied to it. */
function convertedManhourCost(resource: { costingStatus?: string | null; manhourCostRegional?: number | null }): number {
  return resource.costingStatus === "CONVERTED" && typeof resource.manhourCostRegional === "number" ? resource.manhourCostRegional : 0;
}

/** True when a non-INR project has man-hour cost (INR) that has no rate applied, so it is NOT in its report group's expenses or profit. */
export function hasManhourRateMissing(project: Project): boolean {
  return (
    isNonInrRegional(project) &&
    (Array.isArray(project.resources) ? project.resources : []).some((r) => (r.manhourCost || 0) > 0 && convertedManhourCost(r) === 0 && !(r.costingStatus === "CONVERTED"))
  );
}

export interface ReportGroup {
  /** `${country key}|${currency}`: a country that has both older INR-entered projects and newer regional-currency ones is two groups. */
  key: string;
  countryKey: string;
  countryLabel: string;
  /** "Oman · OMR" */
  label: string;
  currency: string;
  /** In report basis (see reportBasis). */
  projects: Project[];
  /** Projects in this non-INR group with man-hour cost that has no manpower conversion rate applied: that cost is not in the group's expenses or profit. */
  manhourRateMissingProjects: number;
  /** Projects in this group whose manpower recalculation after an employee-rate change is pending or failed: their man-hour figures may be out of date. */
  manhourRefreshProblemProjects: number;
}

/** Splits the projects in view into country + currency groups. Within a group every amount is in one currency, so every sum is like with like. */
export function groupReportProjects(projects: Project[], reference: PrCategoryCountryReference | null | undefined): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();
  for (const project of projects) {
    const country = countryOfProject(project, reference);
    const currency = regionalCurrencyOf(project);
    const key = `${country.key}|${currency}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, countryKey: country.key, countryLabel: country.label, label: `${country.label} · ${currency}`, currency, projects: [], manhourRateMissingProjects: 0, manhourRefreshProblemProjects: 0 };
      groups.set(key, group);
    }
    if (hasManhourRateMissing(project)) group.manhourRateMissingProjects += 1;
    if ((project.manhourRefreshStatus ?? "CURRENT") !== "CURRENT") group.manhourRefreshProblemProjects += 1;
    group.projects.push(reportBasis(project));
  }
  return [...groups.values()].sort((a, b) => a.countryLabel.localeCompare(b.countryLabel) || a.currency.localeCompare(b.currency));
}

/** The countries present in the projects the user may read (so never an unauthorized country), for the Country / Region filter. */
export function countryOptions(projects: Project[], reference: PrCategoryCountryReference | null | undefined): { value: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const project of projects) {
    const country = countryOfProject(project, reference);
    if (!seen.has(country.key)) seen.set(country.key, country.label);
  }
  return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

export interface ReportGroupInfo {
  /** The group's stored country key (PR Category), which decides the number convention of its amounts. Absent outside a group. */
  countryKey?: string;
  currency: string;
  countryLabel: string;
  label: string;
}

/** The export file name for a group: the report's own name plus the country, e.g. PMO_Executive_Summary_Report_Oman. Unchanged outside a group. */
export function exportFileBase(filename: string, group: ReportGroupInfo): string {
  const slug = group.countryLabel.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug ? `${filename}_${slug}` : filename;
}

/**
 * Export rows with the country and currency named on every row, so every monetary column in the file is unambiguous. Added in FRONT of the
 * existing columns (their names and order are unchanged). Outside a country group (no label) the rows are returned as they are.
 */
export function withGroupColumns<T extends Record<string, unknown>>(rows: T[], group: ReportGroupInfo): Record<string, unknown>[] {
  if (!group.countryLabel) return rows;
  return rows.map((row) => ({ Country: group.countryLabel, Currency: group.currency, ...row }));
}
