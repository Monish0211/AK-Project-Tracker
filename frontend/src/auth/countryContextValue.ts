import { createContext, useContext } from "react";
import type { CountryChoice, CountryLock } from "./countryContextLogic";
import type { CountryAccessMode } from "./countryTypes";

/**
 * The active-country context object and its hook, kept apart from the provider component so the provider file exports
 * only a component (the repo's fast-refresh lint rule). See countryContext.tsx for the behaviour.
 */
export interface CountryContextValue {
  /** False when the feature is off for this deployment: nothing below applies. */
  enabled: boolean;
  mode: CountryAccessMode;
  choices: CountryChoice[];
  /** The selected value (a country code, or ALL), or null when none can be offered. */
  active: string | null;
  activeLabel: string | null;
  selectCountry: (value: string) => void;
  /** True while a page (Project Create / Edit) holds the country: the selector is disabled and `active` is the page's country. */
  locked: boolean;
  lockReason: string | null;
  /** Used by useCountryLock; pass null to release. */
  setLock: (lock: CountryLock | null) => void;
}

export const CountryContext = createContext<CountryContextValue | undefined>(undefined);

export function useCountry(): CountryContextValue {
  const context = useContext(CountryContext);
  if (context === undefined) {
    throw new Error("useCountry must be used within a CountryProvider");
  }
  return context;
}
