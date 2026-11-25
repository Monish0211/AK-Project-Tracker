import { useEffect, useState } from "react";
import { getPrCategoryCountries } from "../../services/projectCountryImportService";
import type { PrCategoryCountryReference } from "../../services/projectCountryImportService";

/**
 * The backend's PR Category -> country reference, with the caller's own authorization per country. Fetched fresh each time a form opens
 * (a user's countries can change between sessions); `null` while loading or if it cannot be read, in which case the form simply offers
 * every category as before and the server remains the enforcement point.
 */
export function usePrCategoryCountries(enabled: boolean): PrCategoryCountryReference | null {
  return usePrCategoryCountriesStatus(enabled).reference;
}

/** The same reference, with whether it failed to load and a way to try again (forms that must know the currency before saving). */
export function usePrCategoryCountriesStatus(enabled: boolean): { reference: PrCategoryCountryReference | null; failed: boolean; retry: () => void } {
  const [reference, setReference] = useState<PrCategoryCountryReference | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getPrCategoryCountries()
      .then((data) => {
        if (!cancelled) setReference(data);
      })
      .catch(() => {
        if (cancelled) return;
        setReference(null);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);
  const retry = () => {
    setFailed(false);
    setAttempt((n) => n + 1);
  };
  return { reference, failed, retry };
}
