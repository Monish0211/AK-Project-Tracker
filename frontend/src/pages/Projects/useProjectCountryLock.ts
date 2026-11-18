import { useContext, useMemo } from "react";
import { CountryContext } from "../../auth/countryContextValue";
import { choiceValueForCountry } from "../../auth/countryContextLogic";
import { useCountryLock } from "../../auth/useCountryLock";
import { usePrCategoryCountries } from "./usePrCategoryCountries";

/**
 * Edit and View Project: locks the global country selector to the project's OWN country, taken from its SAVED PR Category through the backend's PR Category -> country
 * reference (the frontend keeps no table of its own). The selector therefore always agrees with the project on screen, and cannot be changed while it is open.
 * `savedPrCategory` is undefined until the project has loaded; until then the selector is already frozen at the current country. It is the category as saved, never
 * the form's live value, so editing the field cannot move the project to another country.
 */
export function useProjectCountryLock(savedPrCategory: string | undefined, mode: "edit" | "view" = "edit"): void {
  const context = useContext(CountryContext);
  const enabled = context?.enabled === true;
  const reference = usePrCategoryCountries(enabled);
  const choices = context?.choices;
  const value = useMemo(() => {
    if (!savedPrCategory || !reference || !choices) return null;
    const country = reference.items.find((item) => item.prCategory === savedPrCategory)?.country ?? null;
    return choiceValueForCountry(country, choices);
  }, [savedPrCategory, reference, choices]);
  useCountryLock(
    mode === "edit"
      ? "Locked while you edit this project: it stays in its own country (set by its PR Category)."
      : "Locked while you view this project: it belongs to its own country (set by its PR Category). Go back to the list to change country.",
    value
  );
}
