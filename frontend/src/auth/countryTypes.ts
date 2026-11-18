/**
 * Country access (Global Multi-Country Phase 1) — shapes shared by the session, the country context and the selector.
 *
 * `mode` mirrors the backend's COUNTRY_ACCESS_MODE:
 *   off     - the feature is dormant: no selector, no header, no access-not-configured page; behaviour is exactly as before.
 *   shadow  - the backend only logs what it would deny; the selector is shown, nothing is hidden.
 *   enforce - the backend applies the country boundary.
 * The backend is the security boundary. Nothing in the frontend decides what data a user may receive.
 */
export type CountryAccessMode = "off" | "shadow" | "enforce";

/** One country (operating unit) the user may select. `code` is what is sent in X-Active-Country. */
export interface CountryOption {
  id: string;
  code: string | null;
  /** The stored region name (still "FZI" for FZE until the controlled rename). */
  name: string;
  /** What the UI shows. Falls back to `name` on the server. */
  displayName: string;
  defaultCurrency: string | null;
}

/** The header value that selects the consolidated All Countries context. */
export const ALL_COUNTRIES = "ALL";
