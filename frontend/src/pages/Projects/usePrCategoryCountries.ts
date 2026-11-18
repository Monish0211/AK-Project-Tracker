import { useEffect, useState } from "react";
import { getPrCategoryCountries } from "../../services/projectCountryImportService";
import type { PrCategoryCountryReference } from "../../services/projectCountryImportService";

/**
 * The backend's PR Category -> country reference, with the caller's own authorization per country. Fetched fresh each time a form opens
 * (a user's countries can change between sessions); `null` while loading or if it cannot be read, in which case the form simply offers
 * every category as before and the server remains the enforcement point.
 */
export function usePrCategoryCountries(enabled: boolean): PrCategoryCountryReference | null {
  const [reference, setReference] = useState<PrCategoryCountryReference | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getPrCategoryCountries()
      .then((data) => {
        if (!cancelled) setReference(data);
      })
      .catch(() => {
        if (!cancelled) setReference(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return reference;
}
