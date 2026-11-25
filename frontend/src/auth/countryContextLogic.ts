import { prCategoryLabel } from "../utils/prCategoryLabel";
import { ALL_COUNTRIES } from "./countryTypes";
import type { CountryOption } from "./countryTypes";

/**
 * Pure rules for the active-country selector (no React, no browser APIs), so they can be tested directly.
 * The backend re-validates whatever the browser sends on every request; these rules only decide what to offer
 * and which choice to start with.
 */

export interface CountryChoice {
  /** The X-Active-Country value: a country code (or id when a country has no code yet), or ALL. */
  value: string;
  label: string;
}

/** Per-user storage key, so one person's last choice never applies to another account on the same browser. */
export function countryStorageKey(userId: string): string {
  return `pmo_active_country:${userId}`;
}

export const ALL_COUNTRIES_LABEL = "All Countries";

/**
 * Choices offered to the user. Only the countries the server says are selectable; All Countries only for a user who was
 * explicitly granted it (the server decides, via `allCountries`). A role name never adds a choice.
 */
export function buildCountryChoices(countries: CountryOption[], allCountries: boolean): CountryChoice[] {
  const individual = countries.map((c) => ({ value: c.code ?? c.id, label: prCategoryLabel(c.displayName) }));
  return allCountries ? [{ value: ALL_COUNTRIES, label: ALL_COUNTRIES_LABEL }, ...individual] : individual;
}

/**
 * The active choice: the remembered one when it is still offered; otherwise All Countries for a holder of that right,
 * otherwise the first offered country (a single-country user simply gets their country). null when nothing is offered
 * (access not configured).
 */
export function resolveActiveCountry(choices: CountryChoice[], stored: string | null): string | null {
  if (choices.length === 0) return null;
  if (stored !== null && choices.some((c) => c.value === stored)) return stored;
  return choices[0]!.value;
}

/** What to send in the X-Active-Country header, or null to send none. */
export function headerValueFor(active: string | null, enabled: boolean): string | null {
  return enabled && active !== null ? active : null;
}

/** The backend's refusal messages for a country the account may not use (see backend countryAccess.ts). */
export function isCountryContextRejection(status: number, message: string): boolean {
  return status === 403 && (message.startsWith("The selected country is not permitted") || message.startsWith("All Countries is not permitted"));
}

/**
 * A page-level lock on the country context (Project Create / Edit). While a project form is open, the selected country must not change under it: a switch remounts the
 * routed app, which would discard unsaved edits and, because the server authorises a project by the user's country grants and not by the selector, would leave the same
 * project on screen under a different country. `value` is the country the page belongs to (the saved project's), or null to keep whatever is selected now (a new project,
 * whose country comes from the PR Category the user picks).
 */
export interface CountryLock {
  value: string | null;
  reason: string;
}

/** What is actually in effect: the locked country when the page names one, otherwise the user's own choice. */
export function effectiveActiveCountry(active: string | null, lock: CountryLock | null): string | null {
  return lock !== null && lock.value !== null ? lock.value : active;
}

/**
 * The selector choice that corresponds to a project's country (from the backend PR Category -> country reference), or null when the user has no such choice.
 * Matches the code first (what the selector stores), then the display name, so a country without a code yet still resolves.
 */
export function choiceValueForCountry(country: { code: string | null; displayName: string } | null | undefined, choices: CountryChoice[]): string | null {
  if (!country) return null;
  const byCode = country.code ? choices.find((c) => c.value === country.code) : undefined;
  if (byCode) return byCode.value;
  return choices.find((c) => c.value !== ALL_COUNTRIES && c.label === prCategoryLabel(country.displayName))?.value ?? null;
}
