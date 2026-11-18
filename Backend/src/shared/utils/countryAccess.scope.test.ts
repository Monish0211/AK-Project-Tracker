import assert from "node:assert/strict";
import { test } from "node:test";
import { AppError } from "../utils/AppError.js";
import { projectOwnershipWhereOr } from "./projectAccess.js";
import {
  countryAllowsProject,
  getCountryAccessMode,
  grantsAllowRegion,
  projectCountryWhere,
  resolveCountryScope,
  runWithCountryContext,
} from "./countryAccess.js";
import type { CountryContext, CountryRegionInfo } from "../types/auth.types.js";

/**
 * Global Multi-Country Phase 1 — the pure scope rules, with no HTTP and no seeded data. The mode is switched through the same
 * environment variable production uses and always restored.
 */

const region = (code: string, name = code): CountryRegionInfo => ({ id: `id-${code}`, code, name, displayName: name, defaultCurrency: null });
const INDIA = region("india", "India");
const OMAN = region("oman", "Oman");
const QATAR = region("qatar", "Qatar");

function ctx(over: Partial<CountryContext> & { assigned?: CountryRegionInfo[] }): CountryContext {
  const assigned = over.assigned ?? [];
  const allCountries = over.allCountries ?? false;
  return { mode: "enforce", allCountries, assigned, selectable: over.selectable ?? (allCountries ? [INDIA, OMAN, QATAR] : assigned), requested: null, ...over };
}

function withMode<T>(mode: string | undefined, fn: () => T): T {
  const previous = process.env["COUNTRY_ACCESS_MODE"];
  if (mode === undefined) delete process.env["COUNTRY_ACCESS_MODE"];
  else process.env["COUNTRY_ACCESS_MODE"] = mode;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env["COUNTRY_ACCESS_MODE"];
    else process.env["COUNTRY_ACCESS_MODE"] = previous;
  }
}

test("mode defaults to off; a typo can never switch the feature on or off by accident", () => {
  assert.equal(withMode(undefined, getCountryAccessMode), "off");
  assert.equal(withMode("", getCountryAccessMode), "off");
  assert.equal(withMode("shadow", getCountryAccessMode), "shadow");
  assert.equal(withMode("ENFORCE", getCountryAccessMode), "enforce");
  assert.equal(withMode("enforced", getCountryAccessMode), "off", "an unknown value is not treated as enforce (startup validation rejects it in a real deployment)");
});

test("no requested country: an assigned-only user sees the union of their countries; an All Countries holder sees everything", () => {
  const union = resolveCountryScope(ctx({ assigned: [INDIA, OMAN] }));
  assert.equal(union.unrestricted, false);
  assert.deepEqual(union.regionIds.sort(), ["id-india", "id-oman"]);
  assert.equal(resolveCountryScope(ctx({ allCountries: true })).unrestricted, true);
  assert.deepEqual(resolveCountryScope(ctx({ assigned: [] })).regionIds, [], "no country: an empty scope, never a default country");
  assert.equal(resolveCountryScope(ctx({ assigned: [] })).unrestricted, false, "no country is never unrestricted");
});

test("a requested country narrows within the grants and is refused outside them", () => {
  const two = ctx({ assigned: [INDIA, OMAN], requested: "oman" });
  assert.deepEqual(resolveCountryScope(two).regionIds, ["id-oman"]);
  assert.deepEqual(resolveCountryScope({ ...two, requested: "OMAN" }).regionIds, ["id-oman"], "codes are case-insensitive");
  assert.deepEqual(resolveCountryScope({ ...two, requested: "id-india" }).regionIds, ["id-india"], "the id is accepted too");
  assert.throws(() => resolveCountryScope({ ...two, requested: "qatar" }), (e: unknown) => e instanceof AppError && e.statusCode === 403);
  assert.throws(() => resolveCountryScope({ ...two, requested: "nowhere" }), (e: unknown) => e instanceof AppError && e.statusCode === 403, "an unknown country is refused, not ignored");
});

test("ALL is valid only for the explicit All Countries right; an All Countries holder can still narrow to one country", () => {
  assert.throws(() => resolveCountryScope(ctx({ assigned: [INDIA], requested: "ALL" })), (e: unknown) => e instanceof AppError && e.statusCode === 403, "a role or a multi-country grant does not imply ALL");
  assert.equal(resolveCountryScope(ctx({ allCountries: true, requested: "ALL" })).unrestricted, true);
  assert.equal(resolveCountryScope(ctx({ allCountries: true, requested: "all" })).unrestricted, true);
  const drill = resolveCountryScope(ctx({ allCountries: true, requested: "qatar" }));
  assert.deepEqual(drill.regionIds, ["id-qatar"]);
  assert.equal(drill.unrestricted, false);
});

test("single-record check: off and shadow never deny; enforce denies another country, an unclassified project, and everything for an account with no country", () => {
  const user = (c: CountryContext) => ({ sub: "u1", country: c });
  const india = ctx({ assigned: [INDIA] });
  assert.equal(countryAllowsProject(user({ ...india, mode: "off" }), "id-oman"), true);
  assert.equal(countryAllowsProject(user({ ...india, mode: "shadow" }), "id-oman"), true, "shadow only logs");
  assert.equal(countryAllowsProject(user(india), "id-india"), true);
  assert.equal(countryAllowsProject(user(india), "id-oman"), false);
  assert.equal(countryAllowsProject(user(india), null), false, "an unclassified project is not reachable without All Countries");
  assert.equal(countryAllowsProject(user(ctx({ assigned: [] })), "id-india"), false, "no country, no data");
  assert.equal(countryAllowsProject(user(ctx({ allCountries: true })), "id-oman"), true);
  assert.equal(countryAllowsProject(user(ctx({ allCountries: true })), null), true);
  assert.equal(countryAllowsProject({ sub: "u1" }, "id-oman"), true, "no context (a background job or a direct service call) is unchanged behaviour");
});

test("a refused requested country throws in enforce, and only logs in shadow", () => {
  const bad = ctx({ assigned: [INDIA], requested: "qatar" });
  assert.throws(() => countryAllowsProject({ sub: "u1", country: bad }, "id-india"), (e: unknown) => e instanceof AppError && e.statusCode === 403);
  assert.equal(countryAllowsProject({ sub: "u1", country: { ...bad, mode: "shadow" } }, "id-india"), true);
  assert.throws(() => runWithCountryContext(bad, () => projectCountryWhere()), (e: unknown) => e instanceof AppError && e.statusCode === 403);
});

test("the list fragment is a country restriction only in enforce, only when restricted, and absent without a request context", () => {
  assert.equal(projectCountryWhere(), undefined, "no request context: unchanged");
  assert.deepEqual(runWithCountryContext(ctx({ assigned: [INDIA, OMAN], requested: "india" }), () => projectCountryWhere()), { regionId: { in: ["id-india"] } });
  assert.equal(runWithCountryContext(ctx({ allCountries: true }), () => projectCountryWhere()), undefined, "All Countries removes the country filter only");
  assert.equal(runWithCountryContext(ctx({ assigned: [INDIA], mode: "shadow" }), () => projectCountryWhere()), undefined);
  assert.equal(runWithCountryContext(ctx({ assigned: [INDIA], mode: "off" }), () => projectCountryWhere()), undefined);
  assert.deepEqual(runWithCountryContext(ctx({ assigned: [] }), () => projectCountryWhere()), { regionId: { in: [] } }, "no country matches nothing");
});

test("projectOwnershipWhereOr: unchanged without a scope; with a scope every ownership branch is ANDed with the country, so it can only narrow", async () => {
  const caller = "00000000-0000-4000-8000-000000000001";
  const plain = await projectOwnershipWhereOr(caller);
  assert.ok(plain && plain.length >= 3);
  assert.ok(plain.some((b) => "createdByUserId" in b && b.createdByUserId === null), "unclaimed branch present");

  const scoped = await runWithCountryContext(ctx({ assigned: [INDIA], requested: "india" }), () => projectOwnershipWhereOr(caller));
  assert.equal(scoped?.length, plain.length, "same branches");
  for (const branch of scoped ?? []) {
    assert.ok("AND" in branch, "every branch carries the country condition");
    assert.deepEqual((branch.AND as unknown[])[1], { regionId: { in: ["id-india"] } });
  }
  // An unrestricted-visibility caller (undefined) with a country scope still gets the country restriction.
  const unrestricted = await runWithCountryContext(ctx({ assigned: [INDIA] }), () => projectOwnershipWhereOr(undefined));
  assert.deepEqual(unrestricted, [{ regionId: { in: ["id-india"] } }]);
  // ...and with no scope, nothing at all, exactly as before.
  assert.equal(await projectOwnershipWhereOr(undefined), undefined);
  // An All Countries holder gets no country restriction.
  assert.equal(await runWithCountryContext(ctx({ allCountries: true }), () => projectOwnershipWhereOr(undefined)), undefined);
});

test("Phase 2: a single project is decided by the user's GRANTS, not by the active-country selector; the selector is still validated", () => {
  const user = (c: CountryContext) => ({ sub: "u1", country: c });
  const both = ctx({ assigned: [INDIA, OMAN], requested: "india" });
  assert.equal(countryAllowsProject(user(both), "id-oman"), true, "Oman is held, so it is reachable while India is selected");
  assert.equal(countryAllowsProject(user(both), "id-india"), true);
  assert.equal(countryAllowsProject(user(both), "id-qatar"), false, "a country not held is unreachable whatever the selector says");
  assert.equal(countryAllowsProject(user({ ...both, requested: null }), "id-qatar"), false);
  assert.throws(() => countryAllowsProject(user({ ...both, requested: "qatar" }), "id-india"), (e: unknown) => e instanceof AppError && e.statusCode === 403, "a selector value outside the grants is still refused, never ignored");
  assert.equal(countryAllowsProject(user(ctx({ allCountries: true, requested: "india" })), "id-qatar"), true, "All Countries holder: grants cover everything");
});

test("grantsAllowRegion: assigned countries only; an unclassified project needs the explicit All Countries right; nothing for no country", () => {
  assert.equal(grantsAllowRegion({ allCountries: false, assigned: [INDIA] }, "id-india"), true);
  assert.equal(grantsAllowRegion({ allCountries: false, assigned: [INDIA] }, "id-oman"), false);
  assert.equal(grantsAllowRegion({ allCountries: false, assigned: [INDIA] }, null), false);
  assert.equal(grantsAllowRegion({ allCountries: false, assigned: [INDIA] }, undefined), false);
  assert.equal(grantsAllowRegion({ allCountries: false, assigned: [] }, "id-india"), false);
  assert.equal(grantsAllowRegion({ allCountries: true, assigned: [] }, null), true);
});
