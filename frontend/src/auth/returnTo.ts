/**
 * Return-to-destination after sign-in (Nov 2026). A protected link (an approval email, a notification, a pasted URL) must survive the login screen:
 * the guard that sends a signed-out visitor to /login records the page they asked for in a `returnTo` query parameter, and Login sends them back to it.
 *
 * The value is user-controlled input (anyone can craft /login?returnTo=...), so it is only ever used after safeReturnPath() has proved it is a plain
 * path INSIDE this application: never an external address, never a protocol-relative "//host", never a script/data scheme, never an auth page. Anything
 * else is ignored and the existing default destination applies. A returnTo never grants anything: the destination page and the backend still check the
 * session, the module and the record permission exactly as if the user had typed the address.
 */

export const RETURN_TO_PARAM = "returnTo";

const MAX_LENGTH = 2048;
/** A stand-in origin to resolve against: a destination is accepted only if it still resolves to this origin (i.e. it was a relative, same-site path). */
const INTERNAL_ORIGIN = "http://app.internal.invalid";
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

/** Pages that must never be a destination: the sign-in screen itself and the auth flows (a loop, or a forced password change, would result). */
function isAuthPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  return p === "/login" || p === "/login/" || p === "/auth" || p.startsWith("/auth/");
}

/**
 * The normalised internal path (path + query + hash) when `raw` is a safe in-app destination, otherwise null.
 * Accepts only strings that begin with exactly one "/" and resolve, as a relative reference, to this same origin.
 */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_LENGTH) return null;
  if (CONTROL_OR_BACKSLASH.test(value)) return null; // browsers strip tabs/newlines and treat "\" like "/": "/\t/evil.com" would become "//evil.com"
  if (!value.startsWith("/") || value.startsWith("//")) return null; // relative to the site root only; "//host" is protocol-relative

  // A percent-encoded sequence must not decode into something the checks above would have refused ("/%5Cevil.com", "/%09/evil.com").
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (CONTROL_OR_BACKSLASH.test(decoded) || decoded.startsWith("//")) return null;

  let url: URL;
  try {
    url = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== INTERNAL_ORIGIN) return null;
  if (isAuthPath(url.pathname)) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

/** The sign-in address that remembers where the visitor was going. `destination` is the router-relative path (the router adds the app's base path). */
export function loginPathWithReturn(destination: string | null | undefined): string {
  const safe = safeReturnPath(destination);
  // "/" is the default landing page: nothing to remember, so the login address stays exactly as it was before this feature.
  if (!safe || safe === "/") return "/login";
  return `/login?${RETURN_TO_PARAM}=${encodeURIComponent(safe)}`;
}

/** The returnTo carried by a query string (React Router's `location.search`), already validated; null when absent or unsafe. */
export function returnToFromSearch(search: string): string | null {
  return safeReturnPath(new URLSearchParams(search).get(RETURN_TO_PARAM));
}

/**
 * The page the browser is on, as a router-relative path, for code that runs outside React Router (the 401 handler). `basePath` is the app's
 * base path ("/" in production); it is removed because the router, and this module's other functions, work without it.
 */
export function currentRouterPath(location: { pathname: string; search: string; hash: string }, basePath: string): string | null {
  const base = basePath.replace(/\/+$/, "");
  let path = location.pathname;
  if (base) {
    if (path !== base && !path.startsWith(`${base}/`)) return null;
    path = path.slice(base.length) || "/";
  }
  return safeReturnPath(`${path}${location.search}${location.hash}`);
}

// ---- explicit sign-out ------------------------------------------------------------------------------------------------------------------------
// Signing out on purpose must NOT remember the page: the next person to sign in on this browser would be sent to the previous user's last page.
// (A session that simply EXPIRED does remember it.) A sessionStorage flag, because the guard that redirects to /login reads it during render.
const SIGNED_OUT_KEY = "pmo_explicit_sign_out";

export function markExplicitSignOut(): void {
  try {
    sessionStorage.setItem(SIGNED_OUT_KEY, "1");
  } catch {
    /* storage unavailable: the page is then simply remembered, which is harmless */
  }
}

export function wasExplicitSignOut(): boolean {
  try {
    return sessionStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearExplicitSignOut(): void {
  try {
    sessionStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    /* ignore */
  }
}
