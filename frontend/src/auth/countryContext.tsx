import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./authContext";
import { clearCachedProjectDataForCountrySwitch } from "./authService";
import { setActiveCountry, setCountryContextRejectedHandler } from "../services/apiClient";
import { buildCountryChoices, countryStorageKey, effectiveActiveCountry, headerValueFor, resolveActiveCountry } from "./countryContextLogic";
import type { CountryLock } from "./countryContextLogic";
import { CountryContext } from "./countryContextValue";
import type { CountryContextValue } from "./countryContextValue";
import type { CountryAccessMode } from "./countryTypes";

/**
 * Active-country context (Global Multi-Country Phase 1).
 *
 * The active country is a VIEW choice: it narrows what lists show, within the countries the server says this user may
 * use. Switching never edits a project, a financial value or a permission. The server validates the choice on every
 * request (the X-Active-Country header) and is the only security boundary.
 *
 * When COUNTRY_ACCESS_MODE is "off" (the default) none of this is active: no header is sent and no selector is shown.
 */

function readStored(userId: string): string | null {
  try {
    return localStorage.getItem(countryStorageKey(userId));
  } catch {
    return null;
  }
}

function writeStored(userId: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(countryStorageKey(userId));
    else localStorage.setItem(countryStorageKey(userId), value);
  } catch {
    // Storage can be unavailable (private window); the choice then simply lasts for this page load.
  }
}

export const CountryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, refreshUser } = useAuth();
  const enabled = !!user && user.countryAccessMode !== "off";
  const mode: CountryAccessMode = user?.countryAccessMode ?? "off";

  const choices = useMemo(() => (user && enabled ? buildCountryChoices(user.countries, user.allCountries) : []), [user, enabled]);

  const [picked, setPicked] = useState<{ userId: string; value: string } | null>(null);
  // Bumped on every switch so the routed app below remounts and every screen refetches for the new country.
  const [version, setVersion] = useState(0);

  // A page-level lock (Project Create / Edit): while it is held the country cannot change under the open form, and the effective country is the page's own.
  const [lock, setLockState] = useState<CountryLock | null>(null);
  const setLock = useCallback((next: CountryLock | null) => setLockState(next), []);

  const remembered = picked && user && picked.userId === user.id ? picked.value : user ? readStored(user.id) : null;
  const chosen = resolveActiveCountry(choices, remembered);
  // The user's own choice (`chosen`) is never changed by a lock, so it is back in effect the moment the lock is released.
  const locked = lock !== null;
  const active = effectiveActiveCountry(chosen, lock);

  // Set synchronously during render, not in an effect: child effects run before a parent's, and the first requests of
  // a freshly mounted screen must already carry the header.
  setActiveCountry(headerValueFor(active, enabled));

  const selectCountry = useCallback(
    (value: string) => {
      if (locked) return; // belt and braces: the selector is disabled while locked, and a direct call cannot get through either
      if (!user || !choices.some((c) => c.value === value) || value === active) return;
      writeStored(user.id, value);
      // Screens read a browser-side mirror of projects and project data. Clear it so the previous country's rows can
      // never show under the new one, then refetch everything via the remount below.
      clearCachedProjectDataForCountrySwitch();
      setActiveCountry(value);
      setPicked({ userId: user.id, value });
      setVersion((v) => v + 1);
    },
    [user, choices, active, locked]
  );

  // The server refused the active country (grant removed, country deactivated, header stale): forget the remembered
  // choice, re-read the account's current grants, and start again from a valid choice. Throttled so it can never loop.
  const lastRejection = useRef(0);
  useEffect(() => {
    setCountryContextRejectedHandler(() => {
      const now = Date.now();
      if (now - lastRejection.current < 5000) return;
      lastRejection.current = now;
      if (user) writeStored(user.id, null);
      setPicked(null);
      clearCachedProjectDataForCountrySwitch();
      void refreshUser().finally(() => setVersion((v) => v + 1));
    });
    return () => setCountryContextRejectedHandler(null);
  }, [user, refreshUser]);

  const activeLabel = choices.find((c) => c.value === active)?.label ?? null;
  const value = useMemo<CountryContextValue>(
    () => ({ enabled, mode, choices, active, activeLabel, selectCountry, locked, lockReason: lock?.reason ?? null, setLock }),
    [enabled, mode, choices, active, activeLabel, selectCountry, locked, lock, setLock]
  );

  return (
    <CountryContext.Provider value={value}>
      <Fragment key={version}>{children}</Fragment>
    </CountryContext.Provider>
  );
};
