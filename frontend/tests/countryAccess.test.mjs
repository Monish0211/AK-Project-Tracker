// Global Multi-Country Phase 1 (frontend): the active-country rules, the selector, the access-not-configured page and the User Management
// changes. The backend is the security boundary; these tests prove only what the UI offers and sends.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

let vite;
let load;
let React;
let renderToStaticMarkup;
globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 };

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  load = (p) => vite.ssrLoadModule(p);
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});
after(() => vite?.close());

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
const country = (code, displayName, name = displayName) => ({ id: `id-${code}`, code, name, displayName, defaultCurrency: null });
const INDIA = country("india", "India");
const OMAN = country("oman", "Oman");
const QATAR = country("qatar", "Qatar");
const FZE = country("fze", "FZE", "FZI");

test("choices come only from the countries the server offers; All Countries only for the explicit right, never by role", async () => {
  const { buildCountryChoices } = await load("/src/auth/countryContextLogic.ts");
  assert.deepEqual(buildCountryChoices([INDIA], false).map((c) => c.value), ["india"], "India-only user: India only");
  assert.deepEqual(buildCountryChoices([OMAN], false).map((c) => c.value), ["oman"], "Oman-only user: Oman only");
  assert.deepEqual(buildCountryChoices([INDIA, OMAN], false).map((c) => c.label), ["India", "Oman"], "multi-country user: both, no All Countries");
  const all = buildCountryChoices([INDIA, OMAN, QATAR], true);
  assert.equal(all[0].value, "ALL");
  assert.equal(all[0].label, "All Countries");
  assert.deepEqual(all.slice(1).map((c) => c.value), ["india", "oman", "qatar"]);
  assert.deepEqual(buildCountryChoices([], false), [], "no countries: nothing to choose");
  // The builder takes no role at all, so a role name cannot add a choice.
  assert.equal(buildCountryChoices.length, 2);
});

test("FZE is shown by its display name while its stored key stays FZI until the controlled rename", async () => {
  const { buildCountryChoices } = await load("/src/auth/countryContextLogic.ts");
  const [choice] = buildCountryChoices([FZE], false);
  assert.equal(choice.label, "FZE");
  assert.equal(choice.value, "fze", "the code, not the old name, is what is sent");
});

test("the active country is the remembered one only while it is still offered; otherwise a safe first choice; none when nothing is offered", async () => {
  const { buildCountryChoices, resolveActiveCountry } = await load("/src/auth/countryContextLogic.ts");
  const two = buildCountryChoices([INDIA, OMAN], false);
  assert.equal(resolveActiveCountry(two, "oman"), "oman");
  assert.equal(resolveActiveCountry(two, "qatar"), "india", "a country no longer offered is dropped (grant removed)");
  assert.equal(resolveActiveCountry(two, null), "india");
  assert.equal(resolveActiveCountry(buildCountryChoices([INDIA, OMAN], true), "ALL"), "ALL");
  assert.equal(resolveActiveCountry(two, "ALL"), "india", "ALL is not honoured for an account without the right");
  assert.equal(resolveActiveCountry([], "india"), null);
});

test("the header is sent only while the feature is on and a country is active", async () => {
  const { headerValueFor, countryStorageKey, isCountryContextRejection } = await load("/src/auth/countryContextLogic.ts");
  assert.equal(headerValueFor("india", true), "india");
  assert.equal(headerValueFor("ALL", true), "ALL");
  assert.equal(headerValueFor("india", false), null, "feature off: no header");
  assert.equal(headerValueFor(null, true), null);
  assert.notEqual(countryStorageKey("u1"), countryStorageKey("u2"), "one user's choice never applies to another");
  assert.equal(isCountryContextRejection(403, "The selected country is not permitted for your account."), true);
  assert.equal(isCountryContextRejection(403, "All Countries is not permitted for your account."), true);
  assert.equal(isCountryContextRejection(403, "You do not have access to this project."), false, "an ordinary access denial must not reset the country");
  assert.equal(isCountryContextRejection(500, "The selected country is not permitted"), false);
});

async function renderSelector(value) {
  const { CountrySelector } = await load("/src/components/Navbar/CountrySelector.tsx");
  const { CountryContext } = await load("/src/auth/countryContextValue.ts");
  return renderToStaticMarkup(React.createElement(CountryContext.Provider, { value }, React.createElement(CountrySelector)));
}
const ctx = (over) => ({ enabled: true, mode: "enforce", choices: [], active: null, activeLabel: null, selectCountry() {}, ...over });

test("the selector: nothing while off or with no countries, a label for one country, a dropdown for several, All Countries only when offered", async () => {
  assert.equal(await renderSelector(ctx({ enabled: false, mode: "off", choices: [{ value: "india", label: "India" }], active: "india" })), "", "feature off renders nothing");
  assert.equal(await renderSelector(ctx({ choices: [] })), "", "no country renders nothing (the access-not-configured page handles it)");

  const single = await renderSelector(ctx({ choices: [{ value: "india", label: "India" }], active: "india", activeLabel: "India" }));
  assert.match(single, /data-testid="country-label"/);
  assert.ok(!single.includes("<select"), "a single-country user gets no dropdown");

  const multi = await renderSelector(ctx({ choices: [{ value: "india", label: "India" }, { value: "oman", label: "Oman" }], active: "oman" }));
  assert.match(multi, /data-testid="country-selector"/);
  assert.match(multi, /<option value="oman" selected="">Oman<\/option>|<option value="oman"[^>]*>Oman<\/option>/);
  assert.ok(!multi.includes("All Countries"), "no All Countries without the explicit right");

  const holder = await renderSelector(ctx({ choices: [{ value: "ALL", label: "All Countries" }, { value: "india", label: "India" }], active: "ALL" }));
  assert.ok(holder.includes("All Countries"));
});

test("the access-not-configured page explains the state and offers no data, no default country and a way out", async () => {
  const { default: AccessNotConfigured } = await load("/src/pages/AccessNotConfigured/AccessNotConfigured.tsx");
  // The page reads the signed-in user from the auth context (private to authContext.tsx), so its wording and behaviour are checked from source.
  const code = src("pages/AccessNotConfigured/AccessNotConfigured.tsx");
  assert.ok(typeof AccessNotConfigured === "function");
  assert.match(code, /data-testid="access-not-configured"/);
  assert.match(code, /Country access not configured/);
  assert.match(code, /Check again/);
  assert.match(code, /Log out/);
  assert.ok(!/fetch\(|apiClient|localStorage|India/.test(code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), "no data requests and never a default country");
});

test("the route guard blocks only while enforcing and only for an account with no country", () => {
  const code = src("auth/ProtectedRoute.tsx");
  assert.match(code, /user\.countryAccessMode === "enforce" && !user\.countryAccessConfigured/);
  assert.match(code, /<AccessNotConfigured \/>/);
  // The password-change redirect still comes first, so a forced password change is never trapped behind this page.
  assert.ok(code.indexOf("forcePasswordChange") < code.indexOf("countryAccessMode"));
});

test("the session reads country access from /auth/me and treats an older backend as off", () => {
  const code = src("auth/authService.ts");
  assert.match(code, /countries: profile\.countries \?\? \[\]/);
  assert.match(code, /allCountries: profile\.allCountries === true/);
  assert.match(code, /countryAccessMode: profile\.countryAccessMode \?\? "off"/);
  assert.match(code, /countryAccessConfigured: profile\.countryAccessConfigured \?\? true/);
});

test("the API client sends the active country on every request kind and recovers from a refused country", () => {
  const code = src("services/apiClient.ts");
  assert.equal((code.match(/headers\["X-Active-Country"\] = activeCountry/g) ?? []).length, 3, "JSON, multipart and blob requests");
  assert.match(code, /isCountryContextRejection\(response\.status, body\?\.message \?\? ""\)/);
  assert.match(code, /export function setActiveCountry/);
});

test("a country switch clears project-scoped browser mirrors but never the session or company-wide data", () => {
  const code = src("auth/authService.ts");
  const fn = code.slice(code.indexOf("export function clearCachedProjectDataForCountrySwitch"), code.indexOf("function persistToken"));
  for (const key of ['"projects"', '"pmo_notifications"', '"pmo_reminders"', '"timesheets_imports"']) assert.ok(fn.includes(key), key);
  assert.ok(!fn.includes("employees_v6"), "the employee master is company-wide and kept");
  assert.ok(!fn.includes("tokenStorageKey") && !fn.includes("persistToken("), "the session is not touched");
  const provider = src("auth/countryContext.tsx");
  assert.match(provider, /clearCachedProjectDataForCountrySwitch\(\);\s*setActiveCountry\(value\)/, "mirror cleared before the new header is set");
  assert.match(provider, /<Fragment key=\{version\}>/, "the routed app remounts so every screen refetches");
});

test("no role template pre-selects any country (no default India, no default All Countries)", async () => {
  const { ROLE_REGION_DEFAULTS } = await load("/src/utils/roleDefaults.ts");
  const { SYSTEM_ROLES } = await load("/src/types/UserModel.ts");
  assert.ok(SYSTEM_ROLES.length >= 10);
  for (const role of SYSTEM_ROLES) {
    const selected = Object.entries(ROLE_REGION_DEFAULTS[role]).filter(([, on]) => on);
    assert.deepEqual(selected, [], `${role} must not pre-select a country`);
  }
});

test("User Management: country toggles are Administrator-only, nobody edits their own, All Countries is an Administrator-only switch, FZE shows by display name", () => {
  const code = src("pages/Settings/components/userManagement/UserDrawer.tsx");
  assert.match(code, /const canEditCountryAccess = signedInUser\?\.role === "Administrator" && !\(mode === "edit" && user\?\.id === signedInUser\.id\)/);
  assert.match(code, /disabled=\{!canEditCountryAccess\}/);
  assert.match(code, /if \(!canEditCountryAccess\) return;/);
  assert.match(code, /\{canEditCountryAccess && \(\s*<div data-testid="all-countries-block"/);
  assert.match(code, /\.\.\.\(canEditCountryAccess \? \{ regionIds, allCountriesAccess \} : \{\}\)/, "update sends country access only from an allowed editor");
  assert.match(code, /\.\.\.\(canEditCountryAccess \? \{ allCountriesAccess \} : \{\}\)/, "create too");
  assert.match(code, /regionDisplayLabel\(label\)/);
  // Grants still match on the STORED name, so a display rename can never drop a grant.
  assert.match(code, /lookups\.regions,\s*REGION_FIELDS\.filter\(\(f\) => projectRegionAccess\[f\.key\]\)\.map\(\(f\) => f\.label\)/);
  assert.match(src("utils/accessFields.ts"), /\{ key: "fzi", label: "FZI" \}/, "the stored key is unchanged until the audited rename");
});
