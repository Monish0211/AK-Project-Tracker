import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Global Multi-Country Phase 1 — country access end to end (route -> authenticate -> service -> repository -> database).
 * Uses clearly tagged synthetic regions, users and projects, removed by exact id in `after`. Projects are inserted directly so
 * the test controls each project's country and creator independently (project creation rules are Phase 2).
 *
 * COUNTRY_ACCESS_MODE is flipped in-process through the same variable a deployment sets, and always restored.
 */

const TAG = `cc1-${Date.now()}`;
const PASSWORD = "CountryAccess@123";

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[], regions: [] as string[] };

async function listen(): Promise<void> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

function setMode(mode: "off" | "shadow" | "enforce"): void {
  process.env["COUNTRY_ACCESS_MODE"] = mode;
}

interface Actor {
  id: string;
  email: string;
  token: string;
}

async function makeUser(label: string, roleName: string, opts: { regionIds?: string[]; allCountries?: boolean } = {}): Promise<Actor> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const projects = await prisma.module.findUniqueOrThrow({ where: { name: "Projects" } });
  const dashboard = await prisma.module.findUniqueOrThrow({ where: { name: "Dashboard" } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `CC1 ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      allCountriesAccess: opts.allCountries === true,
      moduleAccess: { create: [{ moduleId: projects.id }, { moduleId: dashboard.id }] },
      regionAccess: { create: (opts.regionIds ?? []).map((regionId) => ({ regionId })) },
    },
  });
  created.users.push(user.id);
  return { id: user.id, email: user.email, token: signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName }) };
}

let seq = 0;
async function makeProject(label: string, regionId: string | null, createdByUserId: string | null): Promise<string> {
  seq += 1;
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-11",
      prCategory: "India",
      prNo: `PR-${TAG}-${seq}-${label}`,
      client: `CC1 Client ${label}`,
      department: "Process",
      domesticForeign: "Domestic",
      projectTitle: `CC1 ${label} ${TAG}`,
      workOrderStatus: "Received",
      projectStartDate: new Date("2026-01-01"),
      projectStatus: "Active",
      regionId,
      createdByUserId,
    },
  });
  created.projects.push(project.id);
  return project.id;
}

async function call(actor: Actor, path: string, opts: { method?: string; body?: unknown; country?: string } = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${url}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${actor.token}`,
      ...(opts.country ? { "X-Active-Country": opts.country } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// ---- fixtures -------------------------------------------------------------------------------------------------------------
let A: { id: string; code: string; name: string };
let B: { id: string; code: string; name: string };
const u = {} as Record<string, Actor>;
const p = {} as Record<string, string>;

before(async () => {
  await listen();
  const prevMode = process.env["COUNTRY_ACCESS_MODE"];
  void prevMode;
  for (const [key, name] of [["A", "A"], ["B", "B"]] as const) {
    const region = await prisma.region.create({ data: { name: `CC1 ${name} ${TAG}`, code: `cc1-${name.toLowerCase()}-${TAG}`, displayName: `CC1 ${name}`, defaultCurrency: "INR" } });
    created.regions.push(region.id);
    const info = { id: region.id, code: region.code as string, name: region.name };
    if (key === "A") A = info;
    else B = info;
  }

  u["other"] = await makeUser("other", "Engineer");
  u["engA"] = await makeUser("engA", "Engineer", { regionIds: [A.id] });
  u["engB"] = await makeUser("engB", "Engineer", { regionIds: [B.id] });
  u["engAB"] = await makeUser("engAB", "Engineer", { regionIds: [A.id, B.id] });
  u["engAll"] = await makeUser("engAll", "Engineer", { allCountries: true });
  u["engNone"] = await makeUser("engNone", "Engineer");
  u["adminA"] = await makeUser("adminA", "Administrator", { regionIds: [A.id] });
  u["adminNone"] = await makeUser("adminNone", "Administrator");
  u["adminAll"] = await makeUser("adminAll", "Administrator", { allCountries: true });
  u["pmoA"] = await makeUser("pmoA", "PMO Manager", { regionIds: [A.id] });
  u["pmoNone"] = await makeUser("pmoNone", "PMO Manager");
  u["viewerA"] = await makeUser("viewerA", "Management Viewer", { regionIds: [A.id] });

  p["A_open"] = await makeProject("A-open", A.id, null);
  p["B_open"] = await makeProject("B-open", B.id, null);
  p["A_ownedEngA"] = await makeProject("A-ownedEngA", A.id, u["engA"]!.id);
  p["B_ownedEngA"] = await makeProject("B-ownedEngA", B.id, u["engA"]!.id);
  p["A_other"] = await makeProject("A-other", A.id, u["other"]!.id);
  p["none_open"] = await makeProject("unmapped", null, null);
});

after(async () => {
  setMode("off");
  delete process.env["COUNTRY_ACCESS_MODE"];
  await prisma.authAuditLog.deleteMany({ where: { email: { contains: TAG } } });
  await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
  await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  await prisma.region.deleteMany({ where: { id: { in: created.regions } } });
  await closeServer();
});

const listIds = async (actor: Actor, country?: string) => {
  const r = await call(actor, `/projects?search=${TAG}&pageSize=100`, country ? { country } : {});
  return { status: r.status, ids: ((r.body?.data?.items ?? []) as { id: string }[]).map((i) => i.id).sort(), body: r.body };
};
const want = (...keys: string[]) => keys.map((k) => p[k]!).sort();

// ---- off: today's behaviour, byte for byte ---------------------------------------------------------------------------------
describe("mode off (the default): nothing changes", () => {
  before(() => setMode("off"));

  test("a restricted user sees exactly what the ownership rules gave them before: own, plus unclaimed, in every country", async () => {
    assert.deepEqual((await listIds(u["engA"]!)).ids, want("A_open", "B_open", "A_ownedEngA", "B_ownedEngA", "none_open"));
  });

  test("a user with no country still sees data, the header is ignored, and no extra grants query is needed", async () => {
    assert.deepEqual((await listIds(u["engNone"]!)).ids, want("A_open", "B_open", "none_open"));
    assert.equal((await listIds(u["engA"]!, "not-a-country")).status, 200, "an unknown header is ignored while off");
  });

  test("an Administrator still sees every project", async () => {
    assert.deepEqual((await listIds(u["adminNone"]!)).ids, want("A_open", "B_open", "A_ownedEngA", "B_ownedEngA", "A_other", "none_open"));
  });

  test("a single project outside the user's grants is reachable, exactly as before", async () => {
    assert.equal((await call(u["engA"]!, `/projects/${p["B_open"]}`)).status, 200);
  });

  test("/auth/me still works and reports the mode and the account's grants", async () => {
    const me = await call(u["engAB"]!, "/auth/me");
    assert.equal(me.status, 200);
    assert.equal(me.body.data.countryAccessMode, "off");
    assert.deepEqual(me.body.data.countries.map((c: { code: string }) => c.code).sort(), [A.code, B.code].sort());
    assert.equal(me.body.data.allCountries, false);
    assert.ok(Array.isArray(me.body.data.regions), "the existing regions array is unchanged");
  });
});

// ---- shadow: decisions logged, never applied ------------------------------------------------------------------------------
describe("mode shadow: nothing is hidden", () => {
  before(() => setMode("shadow"));
  after(() => setMode("off"));

  test("lists and single projects are identical to off, even for an account with no country and for a bad header", async () => {
    assert.deepEqual((await listIds(u["engA"]!)).ids, want("A_open", "B_open", "A_ownedEngA", "B_ownedEngA", "none_open"));
    assert.deepEqual((await listIds(u["engNone"]!)).ids, want("A_open", "B_open", "none_open"));
    assert.equal((await listIds(u["engA"]!, "qatar-nowhere")).status, 200);
    assert.equal((await call(u["engA"]!, `/projects/${p["B_open"]}`)).status, 200);
  });
});

// ---- enforce: the boundary -------------------------------------------------------------------------------------------------
describe("mode enforce: country access is an additional boundary", () => {
  before(() => setMode("enforce"));
  after(() => setMode("off"));

  test("India-style single-country user: only their country's projects, and the ownership rules still apply inside it", async () => {
    // A_other is in A but owned by someone else: country access alone does not reveal it.
    assert.deepEqual((await listIds(u["engA"]!)).ids, want("A_open", "A_ownedEngA"));
    assert.deepEqual((await listIds(u["engB"]!)).ids, want("B_open"));
  });

  test("a project the user CREATED in another country is still hidden (project country, not creator, decides)", async () => {
    const { ids } = await listIds(u["engA"]!);
    assert.ok(!ids.includes(p["B_ownedEngA"]!));
    assert.equal((await call(u["engA"]!, `/projects/${p["B_ownedEngA"]}`)).status, 403);
  });

  test("multi-country user: the union without a header, one country with it, refused for a country they do not hold", async () => {
    // engAB created none of the fixtures, so ownership still limits them to the unclaimed projects of their countries.
    assert.deepEqual((await listIds(u["engAB"]!)).ids, want("A_open", "B_open"));
    assert.deepEqual((await listIds(u["engAB"]!, A.code)).ids, want("A_open"));
    assert.deepEqual((await listIds(u["engAB"]!, B.code)).ids, want("B_open"));
    const refused = await call(u["engAB"]!, `/projects?search=${TAG}`, { country: "qatar" });
    assert.equal(refused.status, 403);
    assert.match(refused.body.message, /selected country is not permitted/);
  });

  test("switching the active country never changes what the user is allowed to do: a write is checked against the PROJECT's country", async () => {
    const before = await prisma.project.findUniqueOrThrow({ where: { id: p["B_ownedEngA"]! } });
    // engA holds only A, so even with the A header the B project cannot be edited.
    const denied = await call(u["engA"]!, `/projects/${p["B_ownedEngA"]}`, { method: "PATCH", body: { projectTitle: "hijacked" }, country: A.code });
    assert.equal(denied.status, 403);
    assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: p["B_ownedEngA"]! } })).projectTitle, before.projectTitle, "nothing was written");
    // The same user may edit a project in their own country.
    const ok = await call(u["engA"]!, `/projects/${p["A_ownedEngA"]}`, { method: "PATCH", body: { remarks: "cc1 edit" } });
    assert.equal(ok.status, 200);
  });

  test("explicit All Countries: everything the ownership rules allow, narrowable to one country; ALL is refused for everyone else", async () => {
    const all = want("A_open", "B_open", "none_open", "A_ownedEngA", "B_ownedEngA");
    assert.deepEqual((await listIds(u["engAll"]!)).ids, all.filter((id) => id !== p["A_ownedEngA"] && id !== p["B_ownedEngA"]), "no header: unrestricted by country, ownership still applies");
    assert.deepEqual((await listIds(u["engAll"]!, "ALL")).ids, (await listIds(u["engAll"]!)).ids);
    assert.deepEqual((await listIds(u["engAll"]!, A.code)).ids, want("A_open"));
    const refused = await call(u["engAB"]!, `/projects?search=${TAG}`, { country: "ALL" });
    assert.equal(refused.status, 403);
    assert.match(refused.body.message, /All Countries is not permitted/);
  });

  test("no country configured: no projects, no single project, and no default India or All Countries", async () => {
    assert.deepEqual((await listIds(u["engNone"]!)).ids, []);
    assert.equal((await call(u["engNone"]!, `/projects/${p["A_open"]}`)).status, 403);
    const me = await call(u["engNone"]!, "/auth/me");
    assert.equal(me.body.data.countryAccessConfigured, false);
    assert.deepEqual(me.body.data.countries, []);
    assert.equal(me.body.data.allCountries, false);
  });

  test("an Administrator or PMO Manager without All Countries sees only their countries (the role bypass does not override the boundary)", async () => {
    assert.deepEqual((await listIds(u["adminA"]!)).ids, want("A_open", "A_ownedEngA", "A_other"));
    assert.deepEqual((await listIds(u["pmoA"]!)).ids, want("A_open", "A_ownedEngA", "A_other"));
    assert.deepEqual((await listIds(u["adminNone"]!)).ids, []);
    assert.deepEqual((await listIds(u["pmoNone"]!)).ids, []);
    assert.equal((await call(u["adminA"]!, `/projects/${p["B_open"]}`)).status, 403);
    // A management-style account (there is no CEO role) is not one of the roles that bypass ownership, so country access gives it
    // nothing beyond what its existing rules allow: the unclaimed project of its country only.
    assert.deepEqual((await listIds(u["viewerA"]!)).ids, want("A_open"));
  });

  test("an Administrator WITH All Countries sees every project, including unclassified ones", async () => {
    assert.deepEqual((await listIds(u["adminAll"]!)).ids, want("A_open", "B_open", "A_ownedEngA", "B_ownedEngA", "A_other", "none_open"));
  });

  test("an unclassified project is reachable only with All Countries", async () => {
    assert.equal((await call(u["engA"]!, `/projects/${p["none_open"]}`)).status, 403);
    assert.equal((await call(u["engAll"]!, `/projects/${p["none_open"]}`)).status, 200);
  });

  test("the sidebar status counts follow the same scope", async () => {
    const count = async (actor: Actor) => (await call(actor, "/projects/status-counts")).body?.data?.Active as number;
    // The counts are across the whole database, so compare relative to what this fixture adds: engA's scope loses B and unclaimed rows.
    setMode("off");
    const offCount = await count(u["engA"]!);
    setMode("enforce");
    const enforceCount = await count(u["engA"]!);
    assert.ok(enforceCount < offCount, "an enforced scope can only narrow the count");
  });

  test("the dashboard totals follow the same scope: narrower for a country-limited user, unchanged for an All Countries holder", async () => {
    const total = async (actor: Actor, country?: string) => (await call(actor, "/dashboard/summary", country ? { country } : {})).body?.data?.kpis?.totalProjects as number;
    setMode("off");
    const engOff = await total(u["engA"]!);
    const allOff = await total(u["adminAll"]!);
    setMode("enforce");
    const engOn = await total(u["engA"]!);
    // At least the three fixtures engA stops seeing (B_open, B_ownedEngA, the unclassified project); any other unclaimed row in the
    // database (an earlier test can leave one behind) is unclassified too, so it disappears as well.
    assert.ok(engOff - engOn >= 3, `engA's dashboard must narrow by at least 3 (off ${engOff}, enforce ${engOn})`);
    assert.equal(await total(u["adminAll"]!), allOff, "an explicit All Countries holder sees the same dashboard as before");
    assert.equal(await total(u["adminA"]!), 3, "an Administrator limited to country A counts only A's three projects");
    assert.equal((await call(u["engA"]!, "/dashboard/summary", { country: "nowhere" })).status, 403);
  });

  test("/auth/me lists what the account may select; an All Countries holder may select every country", async () => {
    const ab = (await call(u["engAB"]!, "/auth/me")).body.data;
    assert.equal(ab.countryAccessMode, "enforce");
    assert.equal(ab.countryAccessConfigured, true);
    assert.deepEqual(ab.countries.map((c: { code: string }) => c.code).sort(), [A.code, B.code].sort());
    assert.equal(ab.countries[0].displayName.startsWith("CC1"), true);
    const all = (await call(u["engAll"]!, "/auth/me")).body.data;
    assert.equal(all.allCountries, true);
    const codes = all.countries.map((c: { code: string | null }) => c.code);
    assert.ok(codes.includes(A.code) && codes.includes(B.code));
  });

  test("a stale or forbidden header never blocks /auth/me (the client can recover)", async () => {
    const me = await call(u["engA"]!, "/auth/me", { country: "no-longer-mine" });
    assert.equal(me.status, 200);
  });
});

// ---- who may change country access ------------------------------------------------------------------------------------------
describe("country access administration (always on, independent of the mode)", () => {
  before(() => setMode("off"));

  const auditFor = (actor: Actor, event: string) => prisma.authAuditLog.findMany({ where: { email: actor.email, event }, orderBy: { createdAt: "desc" } });

  test("a PMO Manager cannot grant themselves a country, All Countries, or anyone else a country; each refusal is audited", async () => {
    const own = await call(u["pmoNone"]!, `/users/${u["pmoNone"]!.id}`, { method: "PATCH", body: { regionIds: [A.id] } });
    assert.equal(own.status, 403);
    assert.match(own.body.message, /Only an Administrator can change country access/);
    const allSelf = await call(u["pmoNone"]!, `/users/${u["pmoNone"]!.id}`, { method: "PATCH", body: { allCountriesAccess: true } });
    assert.equal(allSelf.status, 403);
    const other = await call(u["pmoNone"]!, `/users/${u["engNone"]!.id}`, { method: "PATCH", body: { regionIds: [A.id] } });
    assert.equal(other.status, 403);
    assert.equal((await prisma.userRegionAccess.count({ where: { userId: { in: [u["pmoNone"]!.id, u["engNone"]!.id] } } })), 0, "nothing was granted");
    assert.equal((await prisma.portalUser.findUniqueOrThrow({ where: { id: u["pmoNone"]!.id } })).allCountriesAccess, false);
    const denied = await auditFor(u["pmoNone"]!, "COUNTRY_ACCESS_CHANGE_DENIED");
    assert.equal(denied.length, 3);
    assert.equal((denied[0]!.details as { reason: string }).reason, "NOT_ADMINISTRATOR");
  });

  test("a PMO Manager can still edit a user when the countries they send are unchanged (the form re-sends them on every save)", async () => {
    const ok = await call(u["pmoA"]!, `/users/${u["engA"]!.id}`, { method: "PATCH", body: { phoneNumber: "9999900000", regionIds: [A.id] } });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.data.regions.length, 1);
  });

  test("an Administrator can assign countries to another user; the change is audited with before and after", async () => {
    const res = await call(u["adminAll"]!, `/users/${u["engNone"]!.id}`, { method: "PATCH", body: { regionIds: [A.id, B.id] } });
    assert.equal(res.status, 200);
    assert.equal(await prisma.userRegionAccess.count({ where: { userId: u["engNone"]!.id } }), 2);
    const [row] = await auditFor(u["adminAll"]!, "COUNTRY_ACCESS_CHANGED");
    const details = row!.details as { targetUserId: string; before: { regionIds: string[] }; after: { regionIds: string[]; regions: string[] } };
    assert.equal(details.targetUserId, u["engNone"]!.id);
    assert.deepEqual(details.before.regionIds, []);
    assert.deepEqual([...details.after.regionIds].sort(), [A.id, B.id].sort());
    assert.ok(details.after.regions.every((name) => name.startsWith("CC1")));
    // restore
    await prisma.userRegionAccess.deleteMany({ where: { userId: u["engNone"]!.id } });
  });

  test("only an Administrator grants or revokes All Countries; both are audited as their own events", async () => {
    const grant = await call(u["adminAll"]!, `/users/${u["engNone"]!.id}`, { method: "PATCH", body: { allCountriesAccess: true } });
    assert.equal(grant.status, 200);
    assert.equal((await prisma.portalUser.findUniqueOrThrow({ where: { id: u["engNone"]!.id } })).allCountriesAccess, true);
    assert.equal((await auditFor(u["adminAll"]!, "ALL_COUNTRIES_GRANTED")).length, 1);
    const revoke = await call(u["adminAll"]!, `/users/${u["engNone"]!.id}`, { method: "PATCH", body: { allCountriesAccess: false } });
    assert.equal(revoke.status, 200);
    assert.equal((await prisma.portalUser.findUniqueOrThrow({ where: { id: u["engNone"]!.id } })).allCountriesAccess, false);
    assert.equal((await auditFor(u["adminAll"]!, "ALL_COUNTRIES_REVOKED")).length, 1);
  });

  test("nobody changes their own country access, an Administrator included; the refusal is audited", async () => {
    const regions = await call(u["adminAll"]!, `/users/${u["adminAll"]!.id}`, { method: "PATCH", body: { regionIds: [A.id] } });
    assert.equal(regions.status, 403);
    assert.match(regions.body.message, /cannot change your own country access/);
    const flag = await call(u["adminA"]!, `/users/${u["adminA"]!.id}`, { method: "PATCH", body: { allCountriesAccess: true } });
    assert.equal(flag.status, 403);
    assert.equal((await prisma.portalUser.findUniqueOrThrow({ where: { id: u["adminA"]!.id } })).allCountriesAccess, false);
    const [row] = await auditFor(u["adminAll"]!, "COUNTRY_ACCESS_CHANGE_DENIED");
    assert.equal((row!.details as { reason: string }).reason, "SELF_EDIT");
    // An Administrator editing themselves without touching country access is unaffected.
    const fine = await call(u["adminAll"]!, `/users/${u["adminAll"]!.id}`, { method: "PATCH", body: { phoneNumber: "9999900001", regionIds: [] } });
    assert.equal(fine.status, 200, "an unchanged (empty) country list is not an attempt");
  });

  test("creating a user with a country or All Countries is Administrator-only; creating one with none is not restricted", async () => {
    const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } });
    const body = (label: string, extra: object) => ({
      fullName: `CC1 new ${label}`,
      email: `${TAG}-new-${label}@example.com`,
      temporaryPassword: "TempPass@12345",
      roleId: role.id,
      moduleIds: [],
      regionIds: [],
      approvalIds: [],
      scopedUserIds: [],
      ...extra,
    });
    const refused = await call(u["pmoA"]!, "/users", { method: "POST", body: body("pmo-with-region", { regionIds: [A.id] }) });
    assert.equal(refused.status, 403);
    const refusedAll = await call(u["pmoA"]!, "/users", { method: "POST", body: body("pmo-all", { allCountriesAccess: true }) });
    assert.equal(refusedAll.status, 403);
    const none = await call(u["pmoA"]!, "/users", { method: "POST", body: body("pmo-none", {}) });
    assert.equal(none.status, 201, "no country requested: not a country access change");
    created.users.push(none.body.data.id);
    const granted = await call(u["adminAll"]!, "/users", { method: "POST", body: body("admin-with-region", { regionIds: [B.id] }) });
    assert.equal(granted.status, 201);
    created.users.push(granted.body.data.id);
    assert.equal(await prisma.userRegionAccess.count({ where: { userId: granted.body.data.id } }), 1);
    const row = (await auditFor(u["adminAll"]!, "COUNTRY_ACCESS_CHANGED")).find((r) => (r.details as { targetUserId: string }).targetUserId === granted.body.data.id);
    assert.ok(row, "creation with a country is audited");
  });

  test("the lookups the User Management form uses carry display names, codes and default currency, with the stored name unchanged", async () => {
    const res = await call(u["adminAll"]!, "/users/lookups");
    assert.equal(res.status, 200);
    const a = res.body.data.regions.find((r: { id: string }) => r.id === A.id);
    assert.equal(a.name, `CC1 A ${TAG}`);
    assert.equal(a.displayName, "CC1 A");
    assert.equal(a.code, A.code);
    assert.equal(a.defaultCurrency, "INR");
  });
});
