import type { Project } from "../types/Project";
import type { PrCategoryCountryReference } from "../services/projectCountryImportService";
import { applyRegionalCurrencyToProject, recalculateProjectQuantities } from "./quantityCalculations";

/**
 * Add Project and PR Request: keeping a form's regional currency in step with its PR Category, whenever the backend's category list arrives
 * (it can be late) and for a saved request that is opened again (the regional currency is not stored with it).
 */

const regionalOf = (reference: PrCategoryCountryReference, category: string): string | null =>
  reference.items.find((item) => item.prCategory === category)?.country?.defaultCurrency ?? null;

/** True once the list is loaded and the form shows its category's currency: only then may quantities be entered, saved or approved. */
export function isRegionalCurrencyReady(project: Project, reference: PrCategoryCountryReference | null): boolean {
  if (!reference) return false;
  return !project.prCategory || regionalOf(reference, project.prCategory) === (project.regionalCurrency ?? null);
}

/**
 * The fields to change so the form shows its category's currency, or null when nothing has to change. `openedCategory` is the category the form
 * was opened with ("" for a new form): a saved currency and rate belong to THAT category, so they are read in its currency first and only then
 * moved, by the same rule as any other category change (see applyRegionalCurrencyToProject).
 */
export function regionalCurrencyUpdate(project: Project, reference: PrCategoryCountryReference | null, openedCategory: string): Partial<Project> | null {
  if (!reference || !project.prCategory || isRegionalCurrencyReady(project, reference)) return null;
  const expected = regionalOf(reference, project.prCategory);
  const priced = project.quantityItems.some((item) => item.unitRate > 0);
  if (!project.regionalCurrency && priced) {
    const savedRegional = regionalOf(reference, openedCategory || project.prCategory);
    if (savedRegional) {
      const saved: Project = { ...project, regionalCurrency: savedRegional, ...recalculateProjectQuantities(project, savedRegional) };
      return savedRegional === expected ? saved : { ...saved, ...applyRegionalCurrencyToProject(saved, expected) };
    }
  }
  return applyRegionalCurrencyToProject(project, expected);
}

/** The message to show instead of saving when a foreign currency has no exchange rate yet (e.g. after a PR Category change), else null. */
export function missingExchangeRateMessage(project: Project): string | null {
  const regional = project.regionalCurrency;
  if (!regional || !project.currency || project.currency === regional || project.currentExchangeRate > 0) return null;
  return `Enter the exchange rate on the Quantity tab: 1 ${project.currency} = ? ${regional}.`;
}
