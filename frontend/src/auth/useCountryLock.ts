import { useContext, useEffect } from "react";
import { CountryContext } from "./countryContextValue";

/**
 * Holds the active country for as long as the calling page is mounted (Project Create / Edit). While held, the selector is disabled and the effective country is
 * `countryValue` (the saved project's country) or, when that is null/undefined, simply whatever is selected now. Released on unmount, when the user's own remembered
 * choice is back in effect. Engages on the first render of the page, so the selector cannot be switched while the project is still loading.
 *
 * It does nothing outside a CountryProvider or while the feature is off, so pages that use it still render in isolation and in deployments without country access.
 */
export function useCountryLock(reason: string, countryValue?: string | null): void {
  const context = useContext(CountryContext);
  const setLock = context?.setLock;
  const enabled = context?.enabled === true;
  useEffect(() => {
    if (!setLock || !enabled) return;
    setLock({ value: countryValue ?? null, reason });
    return () => setLock(null);
  }, [setLock, enabled, reason, countryValue]);
}
