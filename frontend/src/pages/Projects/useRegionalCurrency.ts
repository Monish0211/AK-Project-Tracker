import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Project } from "../../types/Project";
import type { PrCategoryCountryReference } from "../../services/projectCountryImportService";
import { isRegionalCurrencyReady, regionalCurrencyUpdate } from "../../utils/regionalCurrencySync";

/**
 * Applies the category's regional currency to the form as soon as it can be known, and says whether the form is ready to be priced, saved or
 * approved. Disabled (always ready) for Edit Project, whose saved regional currency comes with the project.
 */
export function useRegionalCurrency(project: Project, setProject: Dispatch<SetStateAction<Project>>, reference: PrCategoryCountryReference | null, enabled: boolean): boolean {
  const [openedCategory] = useState(() => project.prCategory);
  useEffect(() => {
    if (!enabled || !regionalCurrencyUpdate(project, reference, openedCategory)) return;
    setProject((prev) => {
      const update = regionalCurrencyUpdate(prev, reference, openedCategory);
      return update ? { ...prev, ...update } : prev;
    });
  }, [enabled, project, reference, openedCategory, setProject]);
  return !enabled || isRegionalCurrencyReady(project, reference);
}
