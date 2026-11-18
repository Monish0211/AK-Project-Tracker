// Country selector on Project Create / Edit (bug fix): while a project form is open the selected country is LOCKED. A switch used to remount the app and refetch the same project by id
// (the server authorises a project by the user's country grants, not by the selector), leaving an Elixir Qatar project on screen under an FZE selector and discarding unsaved
// edits. These tests pin the lock rules, how the selector looks while locked, and how the pages are wired. The live provider and effect behaviour is covered in the browser QA.
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
const CHOICES = [
  { value: "elixir-qatar", label: "Elixir Qatar" },
  { value: "fze", label: "FZE" },
];

test("the effective country: the locked page's own country wins; a lock with no country keeps the user's choice; no lock changes nothing", async () => {
  const { effectiveActiveCountry } = await load("/src/auth/countryContextLogic.ts");
  assert.equal(effectiveActiveCountry("fze", { value: "elixir-qatar", reason: "x" }), "elixir-qatar", "an Elixir Qatar project holds Elixir Qatar while the user's choice is FZE");
  assert.equal(effectiveActiveCountry("fze", { value: null, reason: "x" }), "fze", "Add Project: freeze at whatever is selected");
  assert.equal(effectiveActiveCountry("fze", null), "fze");
  assert.equal(effectiveActiveCountry(null, null), null);
  assert.equal(effectiveActiveCountry("ALL", { value: "oman", reason: "x" }), "oman", "an All Countries user editing an Oman project sees Oman, not ALL");
});

test("a project's country resolves to the selector choice by code, then by display name; ALL is never matched by a name; a country the user lacks resolves to nothing", async () => {
  const { choiceValueForCountry, ALL_COUNTRIES_LABEL } = await load("/src/auth/countryContextLogic.ts");
  assert.equal(choiceValueForCountry({ code: "elixir-qatar", displayName: "Elixir Qatar" }, CHOICES), "elixir-qatar");
  assert.equal(choiceValueForCountry({ code: "fze", displayName: "FZE" }, CHOICES), "fze");
  assert.equal(choiceValueForCountry({ code: null, displayName: "FZE" }, CHOICES), "fze", "a country without a code yet still resolves by its display name");
  assert.equal(choiceValueForCountry({ code: "oman", displayName: "Oman" }, CHOICES), null, "not one of this user's countries");
  assert.equal(choiceValueForCountry(null, CHOICES), null);
  assert.equal(choiceValueForCountry(undefined, CHOICES), null);
  const withAll = [{ value: "ALL", label: ALL_COUNTRIES_LABEL }, ...CHOICES];
  assert.equal(choiceValueForCountry({ code: null, displayName: ALL_COUNTRIES_LABEL }, withAll), null, "a country can never resolve to the All Countries choice");
  assert.equal(choiceValueForCountry({ code: "fze", displayName: "FZE" }, withAll), "fze");
});

async function renderSelector(over) {
  const { CountryContext } = await load("/src/auth/countryContextValue.ts");
  const { CountrySelector } = await load("/src/components/Navbar/CountrySelector.tsx");
  const value = { enabled: true, mode: "enforce", choices: CHOICES, active: "elixir-qatar", activeLabel: "Elixir Qatar", selectCountry: () => undefined, locked: false, lockReason: null, setLock: () => undefined, ...over };
  return renderToStaticMarkup(React.createElement(CountryContext.Provider, { value }, React.createElement(CountrySelector)));
}

test("the selector: free when not locked; disabled, marked and explained while locked, still showing the page's country", async () => {
  const free = await renderSelector({});
  assert.doesNotMatch(free, /disabled/);
  assert.doesNotMatch(free, /data-locked/);
  assert.match(free, /title="Active country"/);
  assert.match(free, /<option value="elixir-qatar" selected="">Elixir Qatar<\/option>/);

  const reason = "Locked while you edit this project: it stays in its own country (set by its PR Category).";
  const locked = await renderSelector({ locked: true, lockReason: reason, active: "elixir-qatar", activeLabel: "Elixir Qatar" });
  assert.match(locked, /disabled=""/);
  assert.match(locked, /data-locked="true"/);
  assert.ok(locked.includes(`title="${reason}"`), "the tooltip says why");
  assert.match(locked, /<option value="elixir-qatar" selected="">Elixir Qatar<\/option>/, "the selector shows the project's country");
  assert.match(locked, /cursor-not-allowed/);

  // A single-country user has no dropdown at all, locked or not.
  const single = await renderSelector({ choices: [CHOICES[0]], locked: true, lockReason: reason });
  assert.match(single, /data-testid="country-label"/);
  assert.doesNotMatch(single, /<select/);
  // The feature off: nothing is rendered.
  assert.equal(await renderSelector({ enabled: false }), "");
});

test("the provider: a switch is refused while locked, the user's own choice is never overwritten, and the header follows the effective country (source check)", () => {
  const provider = src("auth/countryContext.tsx");
  assert.match(provider, /const \[lock, setLockState\] = useState<CountryLock \| null>\(null\)/);
  assert.match(provider, /const active = effectiveActiveCountry\(chosen, lock\)/, "the effective country is the page's when locked");
  assert.match(provider, /if \(locked\) return;/, "selectCountry refuses while locked");
  assert.match(provider, /setActiveCountry\(headerValueFor\(active, enabled\)\)/, "requests carry the effective country");
  const select = provider.slice(provider.indexOf("const selectCountry"), provider.indexOf("// The server refused"));
  assert.ok(select.indexOf("if (locked) return;") < select.indexOf("writeStored("), "the lock is checked before anything is stored or remounted");
  assert.match(provider, /lockReason: lock\?\.reason \?\? null/);
});

test("the pages: Add Project freezes the selector; Edit and View Project lock it to the SAVED PR Category's country; Edit refreshes the breadcrumb once loaded (source check)", () => {
  const view = src("pages/Projects/ViewProject.tsx");
  assert.match(view, /useProjectCountryLock\(project && project\.id === id \? project\.prCategory : undefined, "view"\)/, "View Project follows the project on screen");
  const add = src("pages/Projects/AddProject.tsx");
  assert.match(add, /useCountryLock\(ADD_LOCK_REASON\)/);
  const edit = src("pages/Projects/EditProject.tsx");
  assert.match(edit, /useProjectCountryLock\(savedFor && savedFor\.id === id \? savedFor\.prCategory : undefined\)/);
  assert.match(edit, /setSavedFor\(\{ id, prCategory: fetched\.prCategory \}\)/, "the category as saved, not the form's live value");
  assert.match(edit, /window\.dispatchEvent\(new Event\("pmo-project-view-state-change"\)\)/, "the breadcrumb is told the project has loaded");
  const lock = src("pages/Projects/useProjectCountryLock.ts");
  assert.match(lock, /choiceValueForCountry\(country, choices\)/);
  assert.match(lock, /usePrCategoryCountries\(enabled\)/, "the country comes from the backend reference, not a table in the frontend");
  assert.doesNotMatch(lock, /Oman|Malaysia|Qatar|Abu Dhabi|FZE|FZI/, "no country list in the frontend");
  const hook = src("auth/useCountryLock.ts");
  assert.match(hook, /return \(\) => setLock\(null\)/, "released on unmount");
  assert.match(hook, /if \(!setLock \|\| !enabled\) return;/, "a no-op without a provider or while the feature is off");
});

test("unrelated screens are untouched: the lock lives only on Add, Edit and View Project", () => {
  const hits = ["pages/Projects/Projects.tsx", "pages/Projects/CompletedProjects.tsx", "pages/Dashboard/Dashboard.tsx", "pages/ReportsPage.tsx"].filter((f) => {
    try {
      return /useCountryLock|useProjectCountryLock/.test(src(f));
    } catch {
      return false;
    }
  });
  assert.deepEqual(hits, []);
});
