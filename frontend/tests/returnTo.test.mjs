// Sign-in keeps the page you came for (Nov 2026): a protected link opened while signed out (or after the session expired) comes back to the SAME page after sign-in,
// and only ever to a page inside this app. Nothing here grants access: the destination's own route guard and the server still decide.
//
// Run: node --test --test-concurrency=1 --test-timeout=240000 tests/returnTo.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
const store = new Map();
globalThis.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());
const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
const R = () => load("/src/auth/returnTo.ts");

test("valid in-app destinations are kept exactly (path, query and hash)", async () => {
  const { safeReturnPath } = await R();
  for (const ok of ["/pr-requests/abc-123", "/pr-requests/abc/edit", "/projects/42?tab=quantity#x", "/admin/pr-requests/9/review", "/", "/timesheets"]) assert.equal(safeReturnPath(ok), ok, ok);
});

test("open-redirect attempts are all refused", async () => {
  const { safeReturnPath } = await R();
  const evil = [
    "https://evil.com", "http://evil.com/x", "//evil.com", "//evil.com/pr-requests/1", "/\\evil.com", "\\\\evil.com", "\\/evil.com", "/%5Cevil.com", "/%2F%2Fevil.com",
    "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x", "evil.com", "pr-requests/1", " //evil.com", "/\t/evil.com", "/\n/evil.com", "/\r/evil.com",
    "/%09/evil.com", "/%0a/evil.com", "/%00", "///evil.com", "ftp://evil.com", "", "   ", null, undefined, 42, {}, [],
    "/" + "a".repeat(3000),
  ];
  for (const e of evil) assert.equal(safeReturnPath(e), null, JSON.stringify(e)?.slice(0, 60));
});

test("the login and password pages are never a return destination (no loop)", async () => {
  const { safeReturnPath } = await R();
  for (const bad of ["/login", "/login/", "/login?returnTo=%2Fx", "/auth", "/auth/change-password", "/auth/forgot-password"]) assert.equal(safeReturnPath(bad), null, bad);
});

test("loginPathWithReturn: protected page -> /login?returnTo=<encoded>; nothing to remember -> plain /login (the default is unchanged)", async () => {
  const { loginPathWithReturn, safeReturnPath, returnToFromSearch } = await R();
  assert.equal(loginPathWithReturn(null), "/login");
  assert.equal(loginPathWithReturn("/"), "/login", "the default landing page needs no return");
  assert.equal(loginPathWithReturn("https://evil.com"), "/login");
  assert.equal(loginPathWithReturn("//evil.com"), "/login");
  const url = loginPathWithReturn("/pr-requests/abc-123?x=1#y");
  assert.equal(url, `/login?returnTo=${encodeURIComponent("/pr-requests/abc-123?x=1#y")}`);
  assert.equal(returnToFromSearch(url.slice("/login".length)), "/pr-requests/abc-123?x=1#y", "round trip");
  assert.equal(safeReturnPath(returnToFromSearch("?returnTo=https%3A%2F%2Fevil.com")), null);
  assert.equal(returnToFromSearch(""), null);
  assert.equal(returnToFromSearch("?returnTo="), null);
  assert.equal(returnToFromSearch("?other=1"), null);
});

test("currentRouterPath strips the deployment base path (and works with none)", async () => {
  const { currentRouterPath } = await R();
  const loc = (pathname, search = "", hash = "") => ({ pathname, search, hash });
  assert.equal(currentRouterPath(loc("/pr-requests/1", "?a=b", "#c"), "/"), "/pr-requests/1?a=b#c");
  assert.equal(currentRouterPath(loc("/pmo/pr-requests/1"), "/pmo/"), "/pr-requests/1");
  assert.equal(currentRouterPath(loc("/pmo"), "/pmo/"), "/");
  assert.equal(currentRouterPath(loc("/pr-requests/1"), "/pmo/"), null, "not under the base path: nothing to remember");
});

test("explicit sign-out is remembered for this tab and cleared by the next visit to the login page", async () => {
  const { markExplicitSignOut, wasExplicitSignOut, clearExplicitSignOut } = await R();
  clearExplicitSignOut();
  assert.equal(wasExplicitSignOut(), false);
  markExplicitSignOut();
  assert.equal(wasExplicitSignOut(), true);
  clearExplicitSignOut();
  assert.equal(wasExplicitSignOut(), false);
});

test("wiring: signed-out visit, expired session, login, forced password change and logout all use the helper", () => {
  const guard = src("auth/ProtectedRoute.tsx");
  assert.match(guard, /loginPathWithReturn\(here\)/);
  assert.match(guard, /wasExplicitSignOut\(\)/);
  const service = src("auth/authService.ts");
  assert.match(service, /loginPathWithReturn\(here\)/);
  assert.match(service, /wasExplicitSignOut\(\)/);
  assert.match(service, /pathname !== "\/login"/, "the 401 handler still never redirects while on the login page");
  const login = src("pages/Login/Login.tsx");
  assert.match(login, /returnToFromSearch\(location\.search\)/);
  assert.match(login, /returnTo \?\? getPostLoginPath/);
  assert.match(login, /returnTo \?\? getPostLoginPathFromModules\(result\.modules\)/, "no returnTo -> the existing default landing page");
  assert.match(login, /clearExplicitSignOut\(\)/);
  assert.match(src("auth/authContext.tsx"), /markExplicitSignOut\(\)/);
  const pw = src("pages/ChangePassword/ChangePassword.tsx");
  assert.match(pw, /safeReturnPath\(/);
  assert.match(pw, /navigate\(returnTo \?\? "\/", \{ replace: true \}\)/);
});

test("the destination is never authorized by the return link: no token or role is read from it", () => {
  const helper = src("auth/returnTo.ts");
  assert.doesNotMatch(helper, /localStorage|pmo_access_token|getToken|jwt/i);
});
