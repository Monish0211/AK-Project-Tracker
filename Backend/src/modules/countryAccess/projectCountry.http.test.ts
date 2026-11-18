import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { grantedProjectCountryWhere } from "../../shared/utils/countryAccess.js";
import { createProject } from "../projects/services/project.service.js";
import { findActiveProjectsByNormalizedPrNos } from "../expenses/import/expenseImport.repository.js";
import { PR_CATEGORY_PREFIX_MAP, PR_CATEGORY_VALUES } from "../projects/project.constants.js";
import { listPrCategoryCountries, resolveCountryForPrCategory } from "../projects/prCategoryCountry.js";

/**
 * Global Multi-Country Phase 2 — project country integration and mixed-country bulk import, end to end.
 *
 * Uses the EXISTING PR Category regions (India, Oman, FZI/FZE, Elixir Qatar, Qatar, Abu Dhabi, Malaysia): the mapping under test is the
 * real one, so no category or country is invented. Users and projects are tagged and removed by exact id in `after`. The only shared data
 * touched is a temporary isActive flip of one region inside one test, restored in a finally block.
 */

const TAG = `cc2-${Date.now()}`;
const PASSWORD = "CountryPhase2@123";
const CATEGORIES = PR_CATEGORY_VALUES;

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[] };
const regionId = {} as Record<string, string>; // by stored category name

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
  token: string;
}

async function makeUser(label: string, roleName: string, opts: { categories?: string[]; allCountries?: boolean; addProject?: boolean } = {}): Promise<Actor> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const modules = await prisma.module.findMany({ where: { name: { in: opts.addProject === false ? ["Projects"] : ["Projects", "Add Project"] } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `CC2 ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      allCountriesAccess: opts.allCountries === true,
      moduleAccess: { create: modules.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: (opts.categories ?? []).map((c) => ({ regionId: regionId[c]! })) },
    },
  });
  created.users.push(user.id);
  return { id: user.id, token: signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName }) };
}

async function call(actor: Actor, path: string, opts: { method?: string; body?: unknown; country?: string } = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${url}${path}`, {
    method: opts.method ?? "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${actor.token}`, ...(opts.country ? { "X-Active-Country": opts.country } : {}) },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let seq = 0;
/** A PR Number that satisfies the category's own prefix rule and is unique to this run. */
function prNoFor(category: string, label = ""): string {
  seq += 1;
  return `${PR_CATEGORY_PREFIX_MAP[category as keyof typeof PR_CATEGORY_PREFIX_MAP]}${TAG}-${seq}${label}`;
}

function projectBody(category: string, prNo = prNoFor(category), extra: Record<string, unknown> = {}) {
  return {
    poMonth: "2026-11",
    prCategory: category,
    prNo,
    client: "CC2 Client",
    department: "Process",
    domesticForeign: "Foreign",
    projectTitle: `CC2 project ${TAG}`,
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01").toISOString(),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01").toISOString(),
    rfqNo: "RFQ-CC2",
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
    ...extra,
  };
}

async function createVia(actor: Actor, category: string, opts: { country?: string } = {}) {
  const prNo = prNoFor(category);
  const res = await call(actor, "/projects", { method: "POST", body: projectBody(category, prNo), ...(opts.country ? { country: opts.country } : {}) });
  if (res.status === 201) created.projects.push(res.body.data.id);
  return { ...res, prNo };
}

async function insertProject(category: string, createdByUserId: string | null): Promise<string> {
  const prNo = prNoFor(category, "-seed");
  const project = await prisma.project.create({
    data: {
      poMonth: "2026-11",
      prCategory: category,
      prNo,
      client: "CC2 Seed",
      department: "Process",
      domesticForeign: "Domestic",
      projectTitle: `CC2 seed ${TAG}`,
      workOrderStatus: "Received",
      projectStartDate: new Date("2026-01-01"),
      projectStatus: "Active",
      regionId: regionId[category]!,
      createdByUserId,
    },
  });
  created.projects.push(project.id);
  return project.id;
}

const regionOf = async (projectId: string) => (await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { regionId: true } })).regionId;
const countByTag = () => prisma.project.count({ where: { prNo: { contains: TAG }, isDeleted: false } });

const u = {} as Record<string, Actor>;

before(async () => {
  await listen();
  const regions = await prisma.region.findMany({ where: { name: { in: [...CATEGORIES] } } });
  for (const r of regions) regionId[r.name] = r.id;
  for (const c of CATEGORIES) assert.ok(regionId[c], `fixture: a Region named "${c}" must exist (the scratch DB seed)`);

  u["all7"] = await makeUser("all7", "PMO Manager", { categories: [...CATEGORIES] });
  u["india"] = await makeUser("india", "PMO Manager", { categories: ["India"] });
  u["indiaOman"] = await makeUser("indiaOman", "PMO Manager", { categories: ["India", "Oman"] });
  u["omanOnly"] = await makeUser("omanOnly", "PMO Manager", { categories: ["Oman"] });
  u["fzeEq"] = await makeUser("fzeEq", "PMO Manager", { categories: ["FZI", "Elixir Qatar"] });
  u["none"] = await makeUser("none", "PMO Manager");
  u["allCountries"] = await makeUser("allCountries", "PMO Manager", { allCountries: true });
  u["noAddProject"] = await makeUser("noAddProject", "PMO Manager", { categories: ["India"], addProject: false });
});

after(async () => {
  setMode("off");
  delete process.env["COUNTRY_ACCESS_MODE"];
  await prisma.project.deleteMany({ where: { prNo: { contains: TAG } } });
  await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
  await prisma.authAuditLog.deleteMany({ where: { email: { contains: TAG } } });
  await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  await closeServer();
});

// ---- the central PR Category -> country mapping ------------------------------------------------------------------------------
describe("PR Category to country mapping (one backend source)", () => {
  before(() => setMode("enforce"));
  after(() => setMode("off"));

  test("every existing PR Category maps to exactly one active country; nothing is invented, nothing is left unmapped", async () => {
    const { items } = await listPrCategoryCountries(u["all7"]!.id);
    assert.deepEqual(items.map((i) => i.prCategory), [...CATEGORIES], "exactly the existing categories, in their existing order");
    for (const item of items) {
      assert.ok(item.country, `${item.prCategory} must have a country`);
      assert.equal(item.country.name, item.prCategory, "the country is the Region whose stored name equals the category");
      assert.equal(item.prNoPrefix, PR_CATEGORY_PREFIX_MAP[item.prCategory]);
    }
    assert.equal(new Set(items.map((i) => i.country?.name)).size, CATEGORIES.length, "no two categories share a country");
  });

  test("Oman (EE) and Elixir Qatar (EE-Q-) are two separate countries even though the prefixes overlap", async () => {
    const oman = await resolveCountryForPrCategory("Oman");
    const eq = await resolveCountryForPrCategory("Elixir Qatar");
    assert.ok(oman.kind === "mapped" && eq.kind === "mapped");
    assert.notEqual(oman.country.regionId, eq.country.regionId);
  });

  test("blank, unrecognised and unconfigured categories are reported as such, never guessed", async () => {
    assert.equal((await resolveCountryForPrCategory("")).kind, "blank_category");
    assert.equal((await resolveCountryForPrCategory("   ")).kind, "blank_category");
    assert.equal((await resolveCountryForPrCategory(undefined)).kind, "blank_category");
    assert.equal((await resolveCountryForPrCategory("Atlantis")).kind, "unknown_category");
    assert.equal((await resolveCountryForPrCategory("india")).kind, "unknown_category", "the stored name is matched exactly");
    await prisma.region.update({ where: { id: regionId["Elixir Qatar"]! }, data: { isActive: false } });
    try {
      assert.equal((await resolveCountryForPrCategory("Elixir Qatar")).kind, "no_country", "a known category with no active country is reported, not defaulted");
    } finally {
      await prisma.region.update({ where: { id: regionId["Elixir Qatar"]! }, data: { isActive: true } });
    }
  });

  test("GET /projects/pr-category-countries reports the caller's own authorization per country", async () => {
    const india = await call(u["india"]!, "/projects/pr-category-countries");
    assert.equal(india.status, 200);
    assert.equal(india.body.data.enforced, true);
    const by = Object.fromEntries((india.body.data.items as { prCategory: string; authorized: boolean }[]).map((i) => [i.prCategory, i.authorized]));
    assert.equal(by["India"], true);
    assert.equal(by["Oman"], false);
    const none = await call(u["none"]!, "/projects/pr-category-countries");
    assert.ok((none.body.data.items as { authorized: boolean }[]).every((i) => !i.authorized), "no country, no authorization");
    const all = await call(u["allCountries"]!, "/projects/pr-category-countries");
    assert.ok((all.body.data.items as { authorized: boolean }[]).every((i) => i.authorized));
  });

  test("when country access is not enforced the endpoint says so and nothing is marked unauthorized", async () => {
    setMode("off");
    const res = await call(u["none"]!, "/projects/pr-category-countries");
    assert.equal(res.body.data.enforced, false);
    assert.ok((res.body.data.items as { authorized: boolean }[]).every((i) => i.authorized));
    setMode("enforce");
  });
});

// ---- project creation --------------------------------------------------------------------------------------------------------
describe("project creation (enforce)", () => {
  before(() => setMode("enforce"));
  after(() => setMode("off"));

  test("a user holding every country can create a project in each of the seven, and each takes the country of its own PR Category", async () => {
    for (const category of CATEGORIES) {
      const res = await createVia(u["all7"]!, category);
      assert.equal(res.status, 201, `${category}: ${JSON.stringify(res.body)}`);
      assert.equal(await regionOf(res.body.data.id), regionId[category], `${category} project is stored in the ${category} country`);
    }
  });

  test("FZE and Elixir Qatar creation works for a user who holds only those two (the creator's own country is irrelevant)", async () => {
    const fze = await createVia(u["fzeEq"]!, "FZI");
    const eq = await createVia(u["fzeEq"]!, "Elixir Qatar");
    assert.equal(fze.status, 201);
    assert.equal(eq.status, 201);
    assert.equal(await regionOf(fze.body.data.id), regionId["FZI"]);
    assert.equal(await regionOf(eq.body.data.id), regionId["Elixir Qatar"]);
  });

  test("an India user without Oman access cannot create an Oman project; nothing is written", async () => {
    const before = await countByTag();
    const res = await createVia(u["india"]!, "Oman");
    assert.equal(res.status, 403);
    assert.match(res.body.message, /do not have access to create projects for Oman/);
    assert.equal(await countByTag(), before);
  });

  test("the same India user, once granted Oman, can create an Oman project; India still works", async () => {
    const oman = await createVia(u["indiaOman"]!, "Oman");
    const india = await createVia(u["indiaOman"]!, "India");
    assert.equal(oman.status, 201);
    assert.equal(india.status, 201);
    assert.equal(await regionOf(oman.body.data.id), regionId["Oman"]);
  });

  test("an Oman-only user can create Oman but not India (project country decides, not whichever country the user is 'from')", async () => {
    assert.equal((await createVia(u["omanOnly"]!, "Oman")).status, 201);
    assert.equal((await createVia(u["omanOnly"]!, "India")).status, 403);
  });

  test("the active-country selector never overrides the project's own country: creating Oman while India is selected stays Oman", async () => {
    const res = await createVia(u["indiaOman"]!, "Oman", { country: "india" });
    assert.equal(res.status, 201);
    assert.equal(await regionOf(res.body.data.id), regionId["Oman"]);
    // ...and the selector cannot be used to reach a country the user does not hold.
    const denied = await createVia(u["india"]!, "Oman", { country: "oman" });
    assert.equal(denied.status, 403);
  });

  test("a user with no country cannot create anything; only the explicit All Countries right creates in every country", async () => {
    assert.equal((await createVia(u["none"]!, "India")).status, 403);
    assert.equal((await createVia(u["allCountries"]!, "Qatar")).status, 201);
  });

  test("an invalid category is refused and the PR prefix rule is unchanged", async () => {
    const before = await countByTag();
    const bad = await call(u["all7"]!, "/projects", { method: "POST", body: projectBody("Atlantis", `PR-${TAG}-bad`) });
    assert.equal(bad.status, 400);
    const mismatch = await call(u["all7"]!, "/projects", { method: "POST", body: projectBody("Oman", `PR-${TAG}-mismatch`) });
    assert.equal(mismatch.status, 400, "the existing Category/prefix rule still applies");
    assert.equal(await countByTag(), before);
  });

  test("a category with no active country cannot create a project, and is never defaulted to another country", async () => {
    await prisma.region.update({ where: { id: regionId["Qatar"]! }, data: { isActive: false } });
    try {
      const before = await countByTag();
      const res = await createVia(u["allCountries"]!, "Qatar");
      assert.equal(res.status, 400);
      assert.match(res.body.message, /not linked to a country/);
      assert.equal(await countByTag(), before);
    } finally {
      await prisma.region.update({ where: { id: regionId["Qatar"]! }, data: { isActive: true } });
    }
  });

  test("module access is unchanged: without Add Project the route is still refused, whatever the countries", async () => {
    assert.equal((await createVia(u["noAddProject"]!, "India")).status, 403);
  });

  test("the service itself enforces the same rule (this is the path PR Request approval uses, with the approver as creator)", async () => {
    await assert.rejects(
      () => createProject(projectBody("Oman") as never, u["india"]!.id),
      (e: unknown) => (e as { statusCode?: number }).statusCode === 403
    );
    const ok = await createProject(projectBody("India") as never, u["india"]!.id);
    created.projects.push(ok.id);
    assert.equal(await regionOf(ok.id), regionId["India"]);
  });
});

describe("project creation in the other modes", () => {
  test("off: exactly today's behaviour, an India-only user can still create in Oman and it is classified by category", async () => {
    setMode("off");
    const res = await createVia(u["india"]!, "Oman");
    assert.equal(res.status, 201);
    assert.equal(await regionOf(res.body.data.id), regionId["Oman"]);
  });

  test("shadow: nothing is refused, the would-be refusal is only logged", async () => {
    setMode("shadow");
    const res = await createVia(u["india"]!, "Abu Dhabi");
    assert.equal(res.status, 201);
    setMode("off");
  });
});

// ---- editing and single-record access ----------------------------------------------------------------------------------------
describe("editing (enforce)", () => {
  before(() => setMode("enforce"));
  after(() => setMode("off"));

  test("saving with the unchanged PR Category (the form re-sends every field) never touches the country", async () => {
    const id = await insertProject("India", u["india"]!.id);
    const existing = await prisma.project.findUniqueOrThrow({ where: { id } });
    const res = await call(u["india"]!, `/projects/${id}`, { method: "PATCH", body: { prCategory: "India", prNo: existing.prNo, remarks: "cc2 edit" } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(await regionOf(id), regionId["India"]);
  });

  test("changing the PR Category to another country's is refused, the project keeps its country and its category", async () => {
    const id = await insertProject("India", u["indiaOman"]!.id);
    const res = await call(u["indiaOman"]!, `/projects/${id}`, { method: "PATCH", body: { prCategory: "Oman", prNo: prNoFor("Oman") } });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /different country/);
    const row = await prisma.project.findUniqueOrThrow({ where: { id } });
    assert.equal(row.regionId, regionId["India"]);
    assert.equal(row.prCategory, "India");
  });

  test("a project's country does not change when other fields change, and a user outside its country cannot edit it", async () => {
    const id = await insertProject("Oman", u["omanOnly"]!.id);
    assert.equal((await call(u["omanOnly"]!, `/projects/${id}`, { method: "PATCH", body: { projectTitle: "cc2 renamed" } })).status, 200);
    assert.equal(await regionOf(id), regionId["Oman"]);
    assert.equal((await call(u["india"]!, `/projects/${id}`, { method: "PATCH", body: { projectTitle: "hijack" } })).status, 403);
  });

  test("a user holding two countries opens and edits either project whichever country the selector shows; a list is still narrowed by it", async () => {
    const india = await insertProject("India", u["indiaOman"]!.id);
    const oman = await insertProject("Oman", u["indiaOman"]!.id);
    assert.equal((await call(u["indiaOman"]!, `/projects/${india}`, { country: "oman" })).status, 200, "a direct link to the India project works while Oman is selected");
    assert.equal((await call(u["indiaOman"]!, `/projects/${oman}`, { country: "india" })).status, 200);
    const list = await call(u["indiaOman"]!, `/projects?search=${TAG}&pageSize=100`, { country: "oman" });
    const ids = ((list.body.data.items ?? []) as { id: string }[]).map((i) => i.id);
    assert.ok(ids.includes(oman) && !ids.includes(india), "the selector still narrows lists");
    assert.equal((await call(u["india"]!, `/projects/${oman}`)).status, 403, "a country the user does not hold is unreachable by id");
  });

  test("off: editing the PR Category still re-classifies, exactly as in Phase 1", async () => {
    setMode("off");
    const id = await insertProject("India", u["india"]!.id);
    const res = await call(u["india"]!, `/projects/${id}`, { method: "PATCH", body: { prCategory: "Oman", prNo: prNoFor("Oman") } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(await regionOf(id), regionId["Oman"]);
    setMode("enforce");
  });
});

// ---- bulk import --------------------------------------------------------------------------------------------------------------
function importRow(category: string, prNo = prNoFor(category), extra: Record<string, unknown> = {}) {
  return projectBody(category, prNo, extra);
}

describe("bulk import: per-row country, authorization and the approved reject-the-whole-file policy (enforce)", () => {
  before(() => setMode("enforce"));
  after(() => setMode("off"));

  test("preview: each row's country comes from its own PR Category, with row number, authorization and duplicate status; nothing is written", async () => {
    const existingId = await insertProject("India", u["indiaOman"]!.id);
    const existing = await prisma.project.findUniqueOrThrow({ where: { id: existingId } });
    const dupInFile = prNoFor("India", "-dup");
    const before = await countByTag();
    const res = await call(u["indiaOman"]!, "/projects/import/preview", {
      method: "POST",
      body: {
        rows: [
          { rowNumber: 2, prNo: prNoFor("India"), prCategory: "India" },
          { rowNumber: 3, prNo: prNoFor("Oman"), prCategory: "Oman" },
          { rowNumber: 4, prNo: prNoFor("FZI"), prCategory: "FZI" },
          { rowNumber: 5, prNo: prNoFor("India", "-blank"), prCategory: "" },
          { rowNumber: 6, prNo: prNoFor("India", "-unk"), prCategory: "Atlantis" },
          { rowNumber: 7, prNo: dupInFile, prCategory: "India" },
          { rowNumber: 8, prNo: dupInFile, prCategory: "India" },
          { rowNumber: 9, prNo: existing.prNo, prCategory: "India" },
        ],
      },
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const rows = res.body.data.rows as { rowNumber: number; countryStatus: string; country: { displayName: string } | null; duplicate: string; errors: string[] }[];
    assert.equal(res.body.data.enforced, true);
    assert.deepEqual(rows.map((r) => [r.rowNumber, r.countryStatus]), [[2, "ok"], [3, "ok"], [4, "not_authorized"], [5, "blank_category"], [6, "unknown_category"], [7, "ok"], [8, "ok"], [9, "ok"]]);
    assert.equal(rows[0]!.country?.displayName, "India");
    assert.equal(rows[1]!.country?.displayName, "Oman");
    assert.ok(rows[2]!.country, "an unauthorized row still shows which country it belongs to");
    assert.equal(rows[3]!.country, null, "a blank category is not defaulted to a country");
    assert.deepEqual(rows.slice(5).map((r) => r.duplicate), ["in_file", "in_file", "existing"]);
    assert.ok(rows[3]!.errors[0]!.includes("never guessed"));
    assert.equal(res.body.data.summary.notAuthorized, 1);
    assert.equal(res.body.data.summary.blankCategory, 1);
    assert.equal(await countByTag(), before, "a preview writes nothing");
  });

  test("a mixed-country file imports in one request, each row in the country of its own category, whatever the row order", async () => {
    const categories = ["Oman", "India", "Oman", "India", "India", "Oman"];
    for (const order of [categories, [...categories].reverse()]) {
      const rows = order.map((c) => importRow(c));
      const res = await call(u["indiaOman"]!, "/projects/import", { method: "POST", body: { projects: rows } });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      const items = res.body.data.items as { id: string; prNo: string }[];
      for (const item of items) created.projects.push(item.id);
      assert.equal(items.length, rows.length);
      for (const [i, row] of rows.entries()) {
        const item = items.find((x) => x.prNo === row.prNo)!;
        assert.equal(await regionOf(item.id), regionId[order[i]!], `row ${i + 1} (${order[i]}) took its own category's country`);
      }
    }
  });

  test("the importing user's own country does not decide: an Oman-only user's India row is refused, an India-only user's Oman row is refused", async () => {
    const before = await countByTag();
    assert.equal((await call(u["omanOnly"]!, "/projects/import", { method: "POST", body: { projects: [importRow("Oman"), importRow("India")] } })).status, 403);
    assert.equal((await call(u["india"]!, "/projects/import", { method: "POST", body: { projects: [importRow("India"), importRow("Oman")] } })).status, 403);
    assert.equal(await countByTag(), before);
  });

  test("one unauthorized row rejects the WHOLE file: nothing is created, and the report names the row, PR Number, category, country and reason", async () => {
    const before = await countByTag();
    const rows = [importRow("India"), importRow("Oman"), importRow("FZI"), importRow("India")];
    const res = await call(u["indiaOman"]!, "/projects/import", { method: "POST", body: { projects: rows } });
    assert.equal(res.status, 403);
    assert.match(res.body.message, /No projects were created/);
    const rejected = res.body.details.rejectedRows as { rowNumber: number; prNo: string; prCategory: string; country: string; status: string; errors: string[] }[];
    assert.equal(rejected.length, 1);
    assert.deepEqual({ ...rejected[0]!, errors: undefined }, { rowNumber: 3, prNo: rows[2]!.prNo, prCategory: "FZI", country: rejected[0]!.country, status: "not_authorized", errors: undefined });
    assert.equal(res.body.details.totalRejectedRows, 1);
    assert.equal(await countByTag(), before, "the authorized rows were not partially imported");
  });

  test("an unrecognised category rejects the whole file with 400 and the row report", async () => {
    const before = await countByTag();
    const rows = [importRow("India"), importRow("India", `PR-${TAG}-x`, { prCategory: "Atlantis" })];
    const res = await call(u["all7"]!, "/projects/import", { method: "POST", body: { projects: rows } });
    assert.equal(res.status, 400);
    assert.equal(res.body.details.rejectedRows[0].status, "unknown_category");
    assert.equal(await countByTag(), before);
  });

  test("a blank PR Category is refused by the import itself (never defaulted to India or guessed from the prefix)", async () => {
    const before = await countByTag();
    const res = await call(u["all7"]!, "/projects/import", { method: "POST", body: { projects: [importRow("India"), importRow("India", `PR-${TAG}-blank`, { prCategory: "" })] } });
    assert.equal(res.status, 400);
    assert.equal(await countByTag(), before);
  });

  test("duplicate PR Numbers are still refused with 409 (in the file, and against an existing project); batch behaviour is unchanged", async () => {
    const same = prNoFor("India", "-same");
    const inFile = await call(u["all7"]!, "/projects/import", { method: "POST", body: { projects: [importRow("India", same), importRow("India", same)] } });
    assert.equal(inFile.status, 409);
    const existingId = await insertProject("India", u["all7"]!.id);
    const existing = await prisma.project.findUniqueOrThrow({ where: { id: existingId } });
    const against = await call(u["all7"]!, "/projects/import", { method: "POST", body: { projects: [importRow("India", existing.prNo)] } });
    assert.equal(against.status, 409);
  });

  test("a user with no country, or without Add Project, cannot import or preview; module rules are unchanged", async () => {
    assert.equal((await call(u["none"]!, "/projects/import", { method: "POST", body: { projects: [importRow("India")] } })).status, 403);
    assert.equal((await call(u["noAddProject"]!, "/projects/import/preview", { method: "POST", body: { rows: [{ prNo: "PR-1", prCategory: "India" }] } })).status, 403);
    assert.equal((await call(u["noAddProject"]!, "/projects/import", { method: "POST", body: { projects: [importRow("India")] } })).status, 403);
  });

  test("the explicit All Countries right imports a file spanning every country", async () => {
    const rows = CATEGORIES.map((c) => importRow(c));
    const res = await call(u["allCountries"]!, "/projects/import", { method: "POST", body: { projects: rows } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    for (const item of res.body.data.items as { id: string }[]) created.projects.push(item.id);
    assert.equal(res.body.data.items.length, CATEGORIES.length);
  });

  test("large files: a 1,500-row preview is checked in one request, and a 250-row mixed import commits in one request", async () => {
    const big = Array.from({ length: 1500 }, (_, i) => ({ rowNumber: i + 2, prNo: prNoFor(i % 2 ? "India" : "Oman", `-big${i}`), prCategory: i % 2 ? "India" : "Oman" }));
    const preview = await call(u["indiaOman"]!, "/projects/import/preview", { method: "POST", body: { rows: big } });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.summary.total, 1500);
    assert.equal(preview.body.data.summary.ok, 1500);

    const rows = Array.from({ length: 250 }, (_, i) => importRow(i % 2 ? "India" : "Oman"));
    const res = await call(u["indiaOman"]!, "/projects/import", { method: "POST", body: { projects: rows } });
    assert.equal(res.status, 201, JSON.stringify(res.body).slice(0, 300));
    const items = res.body.data.items as { id: string }[];
    for (const item of items) created.projects.push(item.id);
    assert.equal(items.length, 250);
  });

  test("a rejected file with a very large number of bad rows reports at most 500 of them and says it was truncated", async () => {
    const rows = Array.from({ length: 520 }, () => importRow("Qatar"));
    const res = await call(u["india"]!, "/projects/import", { method: "POST", body: { projects: rows } });
    assert.equal(res.status, 403);
    assert.equal(res.body.details.totalRejectedRows, 520);
    assert.equal(res.body.details.rejectedRows.length, 500);
    assert.equal(res.body.details.truncated, true);
  });
});

describe("bulk import in the other modes", () => {
  test("off: unchanged, an unauthorized or unmapped row is not refused (today's behaviour), and the rows are still classified by category", async () => {
    setMode("off");
    const rows = [importRow("Oman"), importRow("India", `PR-${TAG}-unk`, { prCategory: "Atlantis" })];
    const res = await call(u["india"]!, "/projects/import", { method: "POST", body: { projects: rows } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    for (const item of res.body.data.items as { id: string }[]) created.projects.push(item.id);
    assert.equal(await regionOf(res.body.data.items[0].id), regionId["Oman"]);
    assert.equal(await regionOf(res.body.data.items[1].id), null, "an unrecognised category stays unclassified, as before");
    const preview = await call(u["india"]!, "/projects/import/preview", { method: "POST", body: { rows: [{ prNo: prNoFor("Oman"), prCategory: "Oman" }] } });
    assert.equal(preview.body.data.enforced, false);
    assert.equal(preview.body.data.rows[0].countryStatus, "not_authorized", "the preview still says what enforcement would do");
  });
});

// ---- the expense import match set -------------------------------------------------------------------------------------------
describe("Other Project Expenses import: country boundary on the project match set", () => {
  test("enforce: only projects in the importer's countries can be matched; All Countries and mode off match everything", async () => {
    const indiaProject = await insertProject("India", null);
    const omanProject = await insertProject("Oman", null);
    setMode("enforce");
    try {
      const forIndia = await findActiveProjectsByNormalizedPrNos(await grantedProjectCountryWhere(u["india"]!.id));
      const ids = forIndia.map((p) => p.id);
      assert.ok(ids.includes(indiaProject) && !ids.includes(omanProject));
      const forNone = await findActiveProjectsByNormalizedPrNos(await grantedProjectCountryWhere(u["none"]!.id));
      assert.ok(!forNone.map((p) => p.id).some((id) => id === indiaProject || id === omanProject), "no country, nothing matches");
      assert.equal(await grantedProjectCountryWhere(u["allCountries"]!.id), undefined);
      const withSelectorIgnored = await findActiveProjectsByNormalizedPrNos(await grantedProjectCountryWhere(u["indiaOman"]!.id));
      assert.ok([indiaProject, omanProject].every((id) => withSelectorIgnored.map((p) => p.id).includes(id)), "both of a two-country user's countries match");
    } finally {
      setMode("off");
    }
    assert.equal(await grantedProjectCountryWhere(u["india"]!.id), undefined, "off: no restriction");
  });
});
