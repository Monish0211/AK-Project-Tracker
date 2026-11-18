import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { prisma } from "../../shared/utils/prismaClient.js";
import { loadAccountAndCountryGrants, loadCountryGrants } from "../../shared/utils/countryAccess.js";
import { findUserAccountStatusById } from "../auth/repository/auth.repository.js";

/**
 * authenticate() reads the account state and the country grants on every request. They are now read in ONE statement (loadAccountAndCountryGrants) instead of the
 * account lookup followed by loadCountryGrants(); this pins that the two are identical for every kind of account, so no authorization decision can have changed.
 */
const TAG = `snap-${Date.now()}`;
const created = { users: [] as string[], regions: [] as string[] };
const regionByName = new Map<string, string>();

async function makeUser(label: string, opts: { regionNames?: string[]; extraRegionIds?: string[]; allCountries?: boolean; isActive?: boolean; accountLocked?: boolean } = {}): Promise<string> {
  const role = await prisma.portalRole.findFirstOrThrow({ where: { name: "Engineer" } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `Snap ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: "x",
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      allCountriesAccess: opts.allCountries ?? false,
      isActive: opts.isActive ?? true,
      accountLocked: opts.accountLocked ?? false,
      regionAccess: { create: [...(opts.regionNames ?? []).map((n) => ({ regionId: regionByName.get(n)! })), ...(opts.extraRegionIds ?? []).map((regionId) => ({ regionId }))] },
    },
  });
  created.users.push(user.id);
  return user.id;
}

before(async () => {
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionByName.set(r.name, r.id);
});

after(async () => {
  await prisma.userRegionAccess.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  await prisma.region.deleteMany({ where: { id: { in: created.regions } } });
});

async function oldWay(userId: string) {
  return { account: await findUserAccountStatusById(userId), grants: await loadCountryGrants(userId) };
}

describe("account state + country grants in one statement equal the two reads they replaced", () => {
  const cases: { label: string; make: () => Promise<string> }[] = [
    { label: "India only", make: () => makeUser("india", { regionNames: ["India"] }) },
    { label: "India + Oman", make: () => makeUser("two", { regionNames: ["India", "Oman"] }) },
    { label: "all seven assigned", make: () => makeUser("seven", { regionNames: ["India", "Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"] }) },
    { label: "explicit All Countries", make: () => makeUser("all", { allCountries: true }) },
    { label: "All Countries and assigned countries", make: () => makeUser("allplus", { allCountries: true, regionNames: ["Qatar"] }) },
    { label: "no country at all", make: () => makeUser("none") },
    { label: "a locked account", make: () => makeUser("locked", { regionNames: ["Oman"], accountLocked: true }) },
    { label: "a deactivated account", make: () => makeUser("inactive", { regionNames: ["Oman"], isActive: false }) },
  ];
  for (const c of cases) {
    test(c.label, async () => {
      const id = await c.make();
      const before2 = await oldWay(id);
      const now = await loadAccountAndCountryGrants(id);
      assert.deepEqual(now.account, before2.account);
      assert.deepEqual(now.grants, before2.grants);
    });
  }

  test("an assigned country that is no longer active is not a grant, in both", async () => {
    const dead = await prisma.region.create({ data: { name: `${TAG}-gone`, isActive: false } });
    created.regions.push(dead.id);
    const id = await makeUser("deadregion", { regionNames: ["Oman"], extraRegionIds: [dead.id] });
    const now = await loadAccountAndCountryGrants(id);
    const old = await oldWay(id);
    assert.deepEqual(now.grants, old.grants);
    assert.deepEqual(now.grants.assigned.map((r) => r.id), [regionByName.get("Oman")!], "only the active country is a grant");
  });

  test("an unknown account id: no account, no countries, and no All Countries", async () => {
    const id = randomUUID();
    const now = await loadAccountAndCountryGrants(id);
    assert.equal(now.account, null);
    assert.deepEqual(now.grants, (await oldWay(id)).grants);
    assert.equal(now.grants.allCountries, false);
    assert.deepEqual(now.grants.selectable, []);
  });

  test("the grants carry the display fields the country selector needs (code, display name, default currency)", async () => {
    const id = await makeUser("fields", { regionNames: ["Oman"] });
    const [only] = (await loadAccountAndCountryGrants(id)).grants.assigned;
    assert.equal(only!.name, "Oman");
    assert.ok(typeof only!.displayName === "string" && only!.displayName.length > 0);
  });
});
