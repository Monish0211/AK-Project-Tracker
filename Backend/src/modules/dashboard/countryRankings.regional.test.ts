import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { PR_CATEGORY_PREFIX_MAP } from "../projects/project.constants.js";

/**
 * Dashboard Top Clients and Department panels, country by country (Phase 4 final). Each country is ranked on its own, in its own currency, from the same per-project
 * work order value the KPIs use (the regional value for a non-India project, whose INR-named value is 0 by design). Nothing is converted or added across countries or
 * currencies, a customer or department that exists in several countries appears in each country's section with that country's value, and country access narrows what is
 * returned on the server. Values are TEST FIXTURES.
 */
const TAG = `crk-${Date.now()}`;
const CATEGORIES = ["India", "Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"] as const;
type Category = (typeof CATEGORIES)[number];
const CURRENCY: Record<Category, string> = { India: "INR", Malaysia: "MYR", Oman: "OMR", "Abu Dhabi": "AED", FZI: "AED", "Elixir Qatar": "QAR", Qatar: "QAR" };
const DISPLAY: Record<Category, string> = { India: "India", Malaysia: "Malaysia", Oman: "Oman", "Abu Dhabi": "Abu Dhabi", FZI: "FZE", "Elixir Qatar": "Elixir Qatar", Qatar: "Qatar" };

const ALPHA = `${TAG} Alpha`;
const BETA = `${TAG} Beta`;
const GLOBAL = `${TAG} Global`; // the same customer in every country
const PROCESS = `${TAG} Process`;
const MECH = `${TAG} Mechanical`;
// [customer, department, work order value] per country: the ranking differs country by country on purpose.
const DATA: Record<Category, Array<[string, string, number]>> = {
  // India's values sit above anything other tests leave behind in a shared database, so these three are always the top of the India ranking.
  India: [[ALPHA, PROCESS, 90_000_000], [BETA, MECH, 40_000_000], [GLOBAL, PROCESS, 10_000_000]],
  Malaysia: [[ALPHA, PROCESS, 5_000], [BETA, MECH, 20_000], [GLOBAL, PROCESS, 43_200]],
  Oman: [[ALPHA, PROCESS, 1_000.125], [BETA, MECH, 3_696.5], [GLOBAL, PROCESS, 500]],
  "Abu Dhabi": [[ALPHA, PROCESS, 35_232], [BETA, MECH, 1_000], [GLOBAL, PROCESS, 2_000]],
  FZI: [[ALPHA, PROCESS, 100], [BETA, MECH, 20_000], [GLOBAL, PROCESS, 1]],
  "Elixir Qatar": [[ALPHA, PROCESS, 12_000], [BETA, MECH, 12_001], [GLOBAL, PROCESS, 7]],
  Qatar: [[ALPHA, PROCESS, 8_000], [BETA, MECH, 90], [GLOBAL, PROCESS, 8_001]],
};

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[] };
const regionId = {} as Record<string, string>;
const setMode = (mode: "off" | "shadow" | "enforce") => {
  process.env["COUNTRY_ACCESS_MODE"] = mode;
};

async function makeUser(label: string, opts: { allCountries?: boolean; categories?: string[]; role?: string }): Promise<string> {
  const roleName = opts.role ?? "Administrator";
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
  const mods = await prisma.module.findMany({ where: { name: { in: ["Dashboard", "Projects"] } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `CRK ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword("CountryRank@123"),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      allCountriesAccess: opts.allCountries === true,
      moduleAccess: { create: mods.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: (opts.categories ?? []).map((c) => ({ regionId: regionId[c]! })) },
    },
  });
  created.users.push(user.id);
  return signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName });
}

async function summary(token: string, activeCountry?: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`${url}/dashboard/summary`, { headers: { Authorization: `Bearer ${token}`, ...(activeCountry ? { "x-active-country": activeCountry } : {}) } });
  return { status: res.status, data: ((await res.json().catch(() => ({}))) as any).data };
}

/** The tagged part of a section's ranking, in order. */
const mineClients = (section: any) => (section.clients as any[]).filter((c) => String(c.client).startsWith(TAG));
const sectionOf = (data: any, key: string, list = "topClientsByCountry") => (data[list] as any[]).find((s) => s.countryKey === key);

let admin = "";
let omanOnly = "";
let indiaOnly = "";
let omanMalaysia = "";
let readOnlyOman = "";
let nobody = "";

before(async () => {
  setMode("off");
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId[r.name] = r.id;
  admin = await makeUser("admin", { allCountries: true });
  omanOnly = await makeUser("oman-only", { categories: ["Oman"] });
  indiaOnly = await makeUser("india-only", { categories: ["India"] });
  omanMalaysia = await makeUser("oman-malaysia", { categories: ["Oman", "Malaysia"] });
  readOnlyOman = await makeUser("readonly-oman", { categories: ["Oman"], role: "Read Only" });
  nobody = await makeUser("nobody", {});
  const creator = created.users[0]!;
  for (const category of CATEGORIES) {
    const region = await prisma.region.findUniqueOrThrow({ where: { id: regionId[category]! } });
    const currency = CURRENCY[category];
    for (const [index, [client, department, value]] of DATA[category].entries()) {
      const project = await prisma.project.create({
        data: {
          poMonth: "2026-11", prCategory: category, prNo: `${PR_CATEGORY_PREFIX_MAP[category]}${TAG}-${index}`, client, department, domesticForeign: "Domestic",
          projectTitle: `CRK ${category} ${index}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active",
          regionId: regionId[category]!, regionalCurrency: region.defaultCurrency, createdByUserId: creator,
        },
      });
      created.projects.push(project.id);
      await prisma.quantityItem.create({
        data: {
          projectId: project.id, description: "activity", woQty: 1, uom: "LOT", currency, unitRate: value, exchangeRate: 1,
          unitRateINR: currency === "INR" ? value : 0, woValue: currency === "INR" ? value : 0, unitRateRegional: value, woValueRegional: value,
        },
      });
    }
  }
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

after(async () => {
  try {
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.userRegionAccess.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.userModuleAccess.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    setMode("off");
    await closeServer();
  }
});

describe("Top Clients: one ranking per country, in that country's own currency", () => {
  test("All Countries: a section per country with its own currency, each ranked independently from that country's own values", async () => {
    const { data } = await summary(admin);
    const sections = (data.topClientsByCountry as any[]).filter((s) => mineClients(s).length > 0);
    assert.deepEqual(sections.map((s) => s.countryKey), [...CATEGORIES], "every country appears once, in the fixed order");
    for (const category of CATEGORIES) {
      const section = sectionOf(data, category);
      assert.equal(section.currency, CURRENCY[category], category);
      assert.equal(section.country, DISPLAY[category], `${category} is labelled with its display name`);
      const expected = [...DATA[category]].sort((a, b) => b[2] - a[2]).map(([client, , value]) => ({ client, workOrderValue: value }));
      assert.deepEqual(mineClients(section), expected, `${category}: ranking and values are this country's own`);
    }
  });

  test("no ₹ 0: every customer of a non-India country carries its real value in its own currency", async () => {
    const { data } = await summary(admin);
    for (const category of CATEGORIES.filter((c) => c !== "India")) {
      for (const client of mineClients(sectionOf(data, category))) assert.ok(client.workOrderValue > 0, `${category} / ${client.client}`);
    }
  });

  test("the same customer in several countries appears in each section with that country's value; nothing is added across currencies or countries", async () => {
    const { data } = await summary(admin);
    for (const category of CATEGORIES) {
      const global = mineClients(sectionOf(data, category)).find((c) => c.client === GLOBAL);
      assert.equal(global.workOrderValue, DATA[category].find(([client]) => client === GLOBAL)![2], category);
    }
    // Abu Dhabi and FZE both use AED but are separate countries, so they stay separate sections.
    assert.notDeepEqual(mineClients(sectionOf(data, "Abu Dhabi")), mineClients(sectionOf(data, "FZI")));
    assert.equal((data.topClientsByCountry as any[]).filter((s) => s.currency === "AED").length >= 2, true);
  });

  test("India is unchanged: its section is exactly the long-standing INR ranking (the legacy topClients field is kept)", async () => {
    const { data } = await summary(admin);
    assert.equal(data.kpiCurrency, "INR");
    const legacy = (data.topClients as any[]).filter((c) => String(c.client).startsWith(TAG));
    assert.deepEqual(legacy, mineClients(sectionOf(data, "India")), "topClients (INR headline) equals the India section");
    assert.ok(legacy.every((c) => c.workOrderValue > 0));
  });

  test("each section is at most the top five and ordered by value, descending", async () => {
    const { data } = await summary(admin);
    for (const section of data.topClientsByCountry as any[]) {
      assert.ok(section.clients.length <= 5);
      const values = (section.clients as any[]).map((c) => c.workOrderValue);
      assert.deepEqual(values, [...values].sort((a, b) => b - a));
    }
  });
});

describe("Department panel: one set of departments per country, in that country's own currency", () => {
  test("All Countries: each country's departments are computed from that country's projects only, with the value in its own currency", async () => {
    const { data } = await summary(admin);
    for (const category of CATEGORIES) {
      const section = sectionOf(data, category, "departmentsByCountry");
      assert.equal(section.currency, CURRENCY[category]);
      assert.equal(section.country, DISPLAY[category]);
      const process = (section.departments.list as any[]).find((d) => d.department === PROCESS);
      const mech = (section.departments.list as any[]).find((d) => d.department === MECH);
      const expectedProcess = DATA[category].filter(([, d]) => d === PROCESS).reduce((s, [, , v]) => s + v, 0);
      const expectedMech = DATA[category].filter(([, d]) => d === MECH).reduce((s, [, , v]) => s + v, 0);
      assert.equal(process.workOrderValue, expectedProcess, `${category} ${PROCESS}`);
      assert.equal(mech.workOrderValue, expectedMech, `${category} ${MECH}`);
      assert.equal(process.activeProjects, 2, `${category}: the department's project count is this country's`);
      assert.equal(mech.activeProjects, 1);
      if (category !== "India") assert.ok(process.workOrderValue > 0, `${category}: not 0`);
    }
  });

  test("India's department values equal the long-standing INR headline panel, and the overall panel is kept", async () => {
    const { data } = await summary(admin);
    const india = sectionOf(data, "India", "departmentsByCountry");
    const overall = (data.departments.list as any[]).find((d) => d.department === PROCESS);
    const indiaProcess = (india.departments.list as any[]).find((d) => d.department === PROCESS);
    assert.equal(overall.workOrderValue, indiaProcess.workOrderValue, "the headline (INR) overall panel carries only India's value, as before");
    assert.equal(overall.activeProjects, 14, "the overall counts still cover every country in view (2 projects x 7 countries)");
  });
});

describe("country access narrows the sections on the server", () => {
  test("an Oman-only user gets only the Oman sections (OMR) and no other country's customers or departments", async () => {
    setMode("enforce");
    try {
      const { status, data } = await summary(omanOnly);
      assert.equal(status, 200);
      assert.equal(data.kpiCurrency, "OMR");
      const mine = (data.topClientsByCountry as any[]).filter((s) => mineClients(s).length > 0);
      assert.deepEqual(mine.map((s) => s.countryKey), ["Oman"]);
      assert.equal(mine[0].currency, "OMR");
      assert.deepEqual(mineClients(mine[0]).map((c) => c.workOrderValue), [3_696.5, 1_000.125, 500]);
      assert.deepEqual((data.departmentsByCountry as any[]).map((s) => s.countryKey), ["Oman"]);
      assert.equal(JSON.stringify(data).includes("India"), false, "nothing of another country leaks into the payload");
    } finally {
      setMode("off");
    }
  });

  test("an India-only user gets the India section only, equal to the legacy field", async () => {
    setMode("enforce");
    try {
      const { data } = await summary(indiaOnly);
      assert.deepEqual((data.topClientsByCountry as any[]).map((s) => s.countryKey), ["India"]);
      assert.deepEqual(mineClients(data.topClientsByCountry[0]), (data.topClients as any[]).filter((c) => String(c.client).startsWith(TAG)));
      assert.deepEqual((data.departmentsByCountry as any[]).map((s) => s.countryKey), ["India"]);
    } finally {
      setMode("off");
    }
  });

  test("a multi-country user sees exactly their countries, each in its own currency, never added together", async () => {
    setMode("enforce");
    try {
      const { data } = await summary(omanMalaysia);
      const mine = (data.topClientsByCountry as any[]).filter((s) => mineClients(s).length > 0);
      assert.deepEqual(mine.map((s) => [s.countryKey, s.currency]), [["Malaysia", "MYR"], ["Oman", "OMR"]]);
      assert.deepEqual(mineClients(mine[0]).map((c) => c.workOrderValue), [43_200, 20_000, 5_000]);
      assert.deepEqual(mineClients(mine[1]).map((c) => c.workOrderValue), [3_696.5, 1_000.125, 500]);
    } finally {
      setMode("off");
    }
  });

  test("the active-country selector narrows an All Countries user to that one country's section", async () => {
    setMode("enforce");
    try {
      const code = (await prisma.region.findUniqueOrThrow({ where: { name: "Oman" } })).code;
      assert.ok(code, "Oman has a selector code");
      const { status, data } = await summary(admin, code!);
      assert.equal(status, 200);
      const mine = (data.topClientsByCountry as any[]).filter((s) => mineClients(s).length > 0);
      assert.deepEqual(mine.map((s) => s.countryKey), ["Oman"]);
    } finally {
      setMode("off");
    }
  });

  test("a Read Only user gets no more than their own country (and, as for every project list, only projects they may see)", async () => {
    setMode("enforce");
    try {
      const { status, data } = await summary(readOnlyOman);
      assert.equal(status, 200);
      const countries = (data.topClientsByCountry as any[]).map((s) => s.countryKey);
      assert.ok(countries.every((c) => c === "Oman"), `only Oman, got ${countries.join(",")}`);
      assert.ok((data.departmentsByCountry as any[]).every((s) => s.countryKey === "Oman"));
    } finally {
      setMode("off");
    }
  });

  test("a user with no country access gets no project data at all", async () => {
    setMode("enforce");
    try {
      const { status, data } = await summary(nobody);
      if (status === 200) {
        assert.deepEqual(data.topClientsByCountry, []);
        assert.deepEqual(data.departmentsByCountry, []);
      } else {
        assert.ok(status === 403, `status ${status}`);
      }
    } finally {
      setMode("off");
    }
  });
});
