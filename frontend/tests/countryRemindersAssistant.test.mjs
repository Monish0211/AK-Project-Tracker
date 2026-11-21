// Country-wise reminders and the country-specific PMO Assistant (frontend). The backend is the security boundary (its own tests prove isolation); these tests prove
// that the browser never shows a previous user's or country's cached data, that reminders are grouped per country (never merged), and the UI wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => void store.set(k, String(v)),
  removeItem: (k) => void store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

globalThis.sessionStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0 };

let vite;
let load;
before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  load = (p) => vite.ssrLoadModule(p);
});
after(() => vite?.close());
beforeEach(() => store.clear());

const src = (rel) => readFileSync(new URL(`../src/${rel}`, import.meta.url), "utf8");
const fillCaches = () => {
  store.set("projects", JSON.stringify([{ id: "p-india" }]));
  store.set("pmo_reminders", JSON.stringify([{ id: "r-india" }]));
  store.set("pmo_notifications", "[]");
};

test("caches are bound to ONE user and ONE country: a different country or a different user clears them before any screen reads them", async () => {
  const { bindCachesToCountry, CACHE_OWNER_KEY } = await load("/src/auth/authService.ts");
  fillCaches();
  bindCachesToCountry("u1", "india");
  assert.equal(store.get("projects"), undefined, "an unowned cache (stale or from an older build) is never trusted");
  assert.equal(store.get(CACHE_OWNER_KEY), "u1|india");

  fillCaches();
  bindCachesToCountry("u1", "india");
  assert.ok(store.get("projects"), "same user, same country: the cache stays (no needless reloads)");

  bindCachesToCountry("u1", "oman");
  assert.equal(store.get("projects"), undefined, "India's projects are gone when Oman is selected");
  assert.equal(store.get("pmo_reminders"), undefined, "and India's reminders");

  fillCaches();
  bindCachesToCountry("u2", "oman");
  assert.equal(store.get("projects"), undefined, "another user on the same browser never sees the previous user's cache");
  assert.equal(store.get(CACHE_OWNER_KEY), "u2|oman");
});

test("the owner marker is cleared at logout and bound synchronously when the country is resolved (before children render)", () => {
  const auth = src("auth/authService.ts");
  assert.match(auth, /"pmo_cache_owner", \/\/ bindCachesToCountry/);
  const ctx = src("auth/countryContext.tsx");
  const set = ctx.indexOf("setActiveCountry(headerValueFor(active, enabled));");
  const bind = ctx.indexOf("bindCachesToCountry(user?.id ?? null, enabled ? active : null);");
  assert.ok(set > 0 && bind > set && bind - set < 300, "binding happens in the same render step as the active-country header");
});

test("important reminders are grouped per country, each on its own and never merged; sorted by country, then date and time", async () => {
  const { groupRemindersByCountry } = await load("/src/services/countryReminderService.ts");
  const r = (id, regionId, country, reminderDate, reminderTime = null) => ({ id, regionId, country, reminderDate, reminderTime, title: id, priority: "Normal" });
  const groups = groupRemindersByCountry([
    r("o1", "R-OM", "Oman", "2026-11-25"),
    r("i2", "R-IN", "India", "2026-11-26", "10:00"),
    r("i1", "R-IN", "India", "2026-11-26", "09:00"),
    r("q1", "R-QA", "Qatar", "2026-11-20"),
  ]);
  assert.deepEqual(groups.map((g) => g.country), ["India", "Oman", "Qatar"]);
  assert.deepEqual(groups[0].items.map((x) => x.id), ["i1", "i2"]);
  assert.ok(groups.every((g) => g.items.every((x) => x.regionId === g.regionId)), "no item is placed under another country");
  assert.deepEqual(groupRemindersByCountry([]), []);
});

test("PMO Assistant: shows the active country, limits people and clients to that country's projects, and lists country reminders per country", () => {
  const a = src("components/PmoAssistant/PmoAssistant.tsx");
  assert.match(a, /Country: \$\{country\.activeLabel \?\? "none available"\}/);
  assert.match(a, /\(!countryScoped \|\| countryEmployeeNos\.has\(emp\.employeeNo\)\)/);
  assert.match(a, /\(!countryScoped \|\| countryClients\.has\(/);
  assert.match(a, /countryReminderService\s*\.listReminders\(\)/);
  assert.match(a, /countryReminderGroups\.map\(\(group\) =>/);
  assert.doesNotMatch(a, /anthropic|openai|fetch\("https?:/i, "no external AI provider was added");
});

test("PMO Assistant: Project Workspace reminders are shown in one section per project country (never merged); a single country keeps the plain list", async () => {
  const { sectionRemindersByCountry, NO_COUNTRY_LABEL } = await load("/src/components/PmoAssistant/reminderCountrySections.ts");
  const row = (id, regionId, country) => ({ id, reminder: { regionId, country } });
  const sections = sectionRemindersByCountry([row("m1", "R-MY", "Malaysia"), row("i1", "R-IN", "India"), row("m2", "R-MY", "Malaysia"), row("x", null, null)]);
  assert.deepEqual(sections.map((s) => s.country), ["India", "Malaysia", NO_COUNTRY_LABEL]);
  assert.deepEqual(sections[1].rows.map((r) => r.id), ["m1", "m2"], "the due-time order inside a country is kept");
  assert.ok(sections.every((s) => s.rows.every((r) => (r.reminder.regionId ?? null) === (s.key === "none" ? null : s.key))), "no reminder under another country");
  assert.equal(sectionRemindersByCountry([row("i1", "R-IN", "India")]).length, 1);
  const a = src("components/PmoAssistant/PmoAssistant.tsx");
  assert.match(a, /reminderSections\.length > 1 &&/, "the country heading appears only when more than one country is listed");
  assert.match(a, /const REMINDERS_SHOWN_PER_SECTION = 20;/, "large lists: the 20 most urgent per country are drawn first");
  assert.match(a, /section\.rows\.slice\(0, REMINDERS_SHOWN_PER_SECTION\)/);
  assert.match(a, /Show all \{section\.rows\.length\} reminders/, "nothing is hidden for good");
  assert.match(a, /dueMs: reminderDueInstant\(r\)\.getTime\(\)/, "the due instant is computed once per reminder for the sort");
  const svc = src("services/reminders/ReminderService.ts");
  assert.match(svc, /dto\.country !== undefined && \{ country: dto\.country \}/, "the project's country from the API is kept on each reminder");
});

test("Settings: the Country Reminders tab holds the project reminder alerts switch, change history and important reminders; no weekly-email configuration", () => {
  const s = src("pages/Settings/Settings.tsx");
  assert.match(s, /activeTab === "countryReminders" && canManageCoordinators && <CountryRemindersSection \/>/);
  // Same tab, same role gate; Nov 2026 only adds the Administrator-only Excluded History link.
  assert.match(s, /activeTab === "weeklyEmails" && canManageCoordinators && <WeeklyEmailsSection showExcludedHistory=\{canManageReportExclusions\(user\?\.role\)\} \/>/, "the global Weekly Emails tab is unchanged");
  const c = src("pages/Settings/components/countryReminders/CountryRemindersSection.tsx");
  for (const call of ["updateSetting", "audit", "createReminder", "deleteReminder"]) assert.ok(c.includes(`countryReminderService.${call}`) || c.includes(`.${call}(`), call);
  for (const gone of ["Recipients", "Run history", "Weekday", "Local time", "Time zone"]) assert.ok(!c.includes(gone), `no per-country ${gone}`);
  assert.match(c, /You do not hold any country/);
  const svc = src("services/countryReminderService.ts");
  assert.doesNotMatch(svc, /WEEKLY_MISSING_EXPENSE|recipients|\/runs/, "no per-country weekly email in the client either");
});
