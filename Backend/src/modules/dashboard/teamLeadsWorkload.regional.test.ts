import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { PR_CATEGORY_PREFIX_MAP } from "../projects/project.constants.js";
import { formatCurrencyCompact } from "./dashboard.formulas.js";

/**
 * Team Leads Workload across the seven countries. The widget is "active projects and total work order value by assigned person": the value is the work order
 * value, and for a non-India project it is the REGIONAL work order value in that project's own currency (its INR-named value is 0 by design). Each person's value is
 * kept PER CURRENCY, so a person with Oman and Malaysia projects shows an OMR total and an MYR total (never added, never 0 for the currency that is not the headline
 * one), and an India-only person reads exactly as before. Values here are TEST FIXTURES.
 */

const TAG = `tlr-${Date.now()}`;
const PASSWORD = "TeamLeadRegional@123";
const CATEGORIES = ["India", "Malaysia", "Oman", "Abu Dhabi", "FZI", "Elixir Qatar", "Qatar"] as const;
const CURRENCY: Record<string, string> = { India: "INR", Malaysia: "MYR", Oman: "OMR", "Abu Dhabi": "AED", FZI: "AED", "Elixir Qatar": "QAR", Qatar: "QAR" };
// Work order value per country project (INR for India, the regional currency for the others).
const WO: Record<string, number> = { India: 1_000_000, Malaysia: 43_200, Oman: 3_696.5, "Abu Dhabi": 35_232, FZI: 20_000, "Elixir Qatar": 12_000, Qatar: 8_000 };
const PEOPLE = {
  // Mixed: India + Oman + Malaysia + Abu Dhabi.
  mixed: { name: `${TAG} Lead Mixed`, countries: ["India", "Oman", "Malaysia", "Abu Dhabi"] },
  // Two countries that share AED, and two that share QAR: totals add within a currency, never across.
  aed: { name: `${TAG} Lead AED`, countries: ["Abu Dhabi", "FZI"] },
  qar: { name: `${TAG} Lead QAR`, countries: ["Elixir Qatar", "Qatar"] },
  // Only non-India work, while India projects are in view: the case that used to read 0.
  elixirOnly: { name: `${TAG} Lead Elixir`, countries: ["Elixir Qatar"] },
  indiaOnly: { name: `${TAG} Lead India`, countries: ["India"] },
} as const;

let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[] };
const regionId = {} as Record<string, string>;
const projectOf = {} as Record<string, string>; // country -> project id
const setMode = (mode: "off" | "shadow" | "enforce") => {
  process.env["COUNTRY_ACCESS_MODE"] = mode;
};

async function listen(): Promise<void> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

async function makeUser(label: string, opts: { allCountries?: boolean; categories?: string[] }): Promise<string> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } });
  const mods = await prisma.module.findMany({ where: { name: { in: ["Dashboard", "Projects"] } } }); // Projects: the test also reads the project records the widget must agree with
  const user = await prisma.portalUser.create({
    data: {
      fullName: `TLR ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      allCountriesAccess: opts.allCountries === true,
      moduleAccess: { create: mods.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: (opts.categories ?? []).map((c) => ({ regionId: regionId[c]! })) },
    },
  });
  created.users.push(user.id);
  return signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: "Administrator" });
}

async function summary(token: string): Promise<any> {
  const res = await fetch(`${url}/dashboard/summary`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(res.status, 200);
  return ((await res.json()) as any).data;
}

const leadOf = (data: any, name: string) => (data.teamLeads.allAssigned as any[]).find((l) => l.reportingManager === name);
const entryOf = (lead: any, currency: string) => (lead.totalsByCurrency as any[]).find((t) => t.currency === currency);

let admin = "";
let omanOnly = "";
let indiaOnly = "";

before(async () => {
  setMode("off");
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId[r.name] = r.id;
  admin = await makeUser("admin", { allCountries: true });
  omanOnly = await makeUser("oman-only", { categories: ["Oman"] });
  indiaOnly = await makeUser("india-only", { categories: ["India"] });
  const creator = created.users[0]!;
  for (const category of CATEGORIES) {
    const region = await prisma.region.findUniqueOrThrow({ where: { id: regionId[category]! } });
    const currency = CURRENCY[category]!;
    const project = await prisma.project.create({
      data: {
        poMonth: "2026-11", prCategory: category, prNo: `${PR_CATEGORY_PREFIX_MAP[category as keyof typeof PR_CATEGORY_PREFIX_MAP]}${TAG}`, client: "TLR Client", department: "Process",
        domesticForeign: "Domestic", projectTitle: `TLR ${category}`, workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active",
        regionId: regionId[category]!, regionalCurrency: region.defaultCurrency, createdByUserId: creator,
      },
    });
    created.projects.push(project.id);
    projectOf[category] = project.id;
    const assignees = Object.values(PEOPLE).filter((p) => (p.countries as readonly string[]).includes(category));
    // The project's work order value is carried by ONE row (the first assignee's); every further assignee gets a zero-value row, so the project's value is WO[category]
    // however many people are assigned to it, and each person still counts the whole project once.
    for (const [index, person] of assignees.entries()) {
      const value = index === 0 ? WO[category]! : 0;
      await prisma.quantityItem.create({
        data: {
          projectId: project.id, description: `${person.name} activity`, woQty: 1, uom: "LOT", currency, unitRate: value, exchangeRate: 1,
          // INR-region projects hold INR in the INR-named columns; every other region holds 0 there and the value in the regional columns.
          unitRateINR: currency === "INR" ? value : 0, woValue: currency === "INR" ? value : 0,
          unitRateRegional: value, woValueRegional: value, assignedTo: person.name,
        },
      });
    }
  }
  await listen();
});

after(async () => {
  try {
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: created.projects } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    setMode("off");
    await closeServer();
  }
});

describe("Team Leads Workload: every person's work order value in each project's own currency", () => {
  test("a person with projects in four countries shows one total per currency, none added across currencies and none read as 0", async () => {
    const lead = leadOf(await summary(admin), PEOPLE.mixed.name);
    assert.ok(lead, "the person is listed");
    assert.equal(lead.activeProjectsCount, 4);
    const byCurrency = Object.fromEntries((lead.totalsByCurrency as any[]).map((t) => [t.currency, t]));
    assert.deepEqual(Object.keys(byCurrency).sort(), ["AED", "INR", "MYR", "OMR"]);
    assert.equal(byCurrency["INR"].totalWorkOrderValue, WO["India"]);
    assert.equal(byCurrency["OMR"].totalWorkOrderValue, WO["Oman"]);
    assert.equal(byCurrency["MYR"].totalWorkOrderValue, WO["Malaysia"]);
    assert.equal(byCurrency["AED"].totalWorkOrderValue, WO["Abu Dhabi"]);
    for (const code of ["OMR", "MYR", "AED"]) assert.ok(byCurrency[code].totalWorkOrderValue > 0, `${code} is not 0`);
    // Each entry is formatted with its own currency's convention; a non-India amount never carries a rupee sign or Lakh / Crore.
    assert.equal(byCurrency["OMR"].formattedWorkOrderValue, "OMR 3.7K");
    assert.equal(byCurrency["MYR"].formattedWorkOrderValue, "RM 43.2K");
    assert.equal(byCurrency["AED"].formattedWorkOrderValue, "AED 35.23K");
    for (const code of ["OMR", "MYR", "AED"]) assert.doesNotMatch(byCurrency[code].formattedWorkOrderValue, /₹|\bL\b|\bCr\b/);
    assert.equal(lead.totalsByCurrency[0].currency, "INR", "the headline currency comes first");
    assert.equal(lead.totalWorkOrderValue, WO["India"], "the headline total is unchanged: INR only");
    assert.equal(lead.formattedWorkOrderValue, formatCurrencyCompact(WO["India"], "INR"));
  });

  test("countries that share a currency add within it (Abu Dhabi + FZE in AED, Elixir Qatar + Qatar in QAR) and never across currencies", async () => {
    const data = await summary(admin);
    const aed = leadOf(data, PEOPLE.aed.name);
    assert.equal(aed.activeProjectsCount, 2);
    assert.equal(aed.totalsByCurrency.length, 1);
    assert.equal(entryOf(aed, "AED").totalWorkOrderValue, WO["Abu Dhabi"]! + WO["FZI"]!);
    assert.equal(entryOf(aed, "AED").projects, 2);
    const qar = leadOf(data, PEOPLE.qar.name);
    assert.equal(qar.totalsByCurrency.length, 1);
    assert.equal(entryOf(qar, "QAR").totalWorkOrderValue, WO["Elixir Qatar"]! + WO["Qatar"]!);
    assert.equal(entryOf(qar, "QAR").formattedWorkOrderValue, "QAR 20K");
  });

  test("a person whose projects are all outside the headline currency shows their own currency, not 0 (the case that used to read ₹ 0)", async () => {
    const data = await summary(admin);
    assert.equal(data.kpiCurrency, "INR", "India projects are in view, so INR is the headline");
    const lead = leadOf(data, PEOPLE.elixirOnly.name);
    assert.equal(lead.totalWorkOrderValue, 0, "the headline-currency total stays what it was");
    assert.equal(lead.totalsByCurrency.length, 1);
    assert.equal(lead.totalsByCurrency[0].currency, "QAR");
    assert.equal(lead.totalsByCurrency[0].totalWorkOrderValue, WO["Elixir Qatar"]);
    assert.equal(lead.totalsByCurrency[0].formattedWorkOrderValue, "QAR 12K");
  });

  test("India is unchanged: an India-only person has exactly one INR entry equal to the long-standing total and string", async () => {
    const lead = leadOf(await summary(admin), PEOPLE.indiaOnly.name);
    assert.equal(lead.totalsByCurrency.length, 1);
    assert.equal(lead.totalsByCurrency[0].currency, "INR");
    assert.equal(lead.totalsByCurrency[0].totalWorkOrderValue, lead.totalWorkOrderValue);
    assert.equal(lead.totalWorkOrderValue, WO["India"]);
    assert.equal(lead.formattedWorkOrderValue, "₹ 10.00 L");
    assert.equal(lead.totalsByCurrency[0].formattedWorkOrderValue, lead.formattedWorkOrderValue);
  });

  test("the values agree with the project records: every project's regional work order value, in its own currency, sums to the person's total", async () => {
    const data = await summary(admin);
    for (const person of Object.values(PEOPLE)) {
      const lead = leadOf(data, person.name);
      const expected = new Map<string, number>();
      for (const country of person.countries) {
        const res = await fetch(`${url}/projects/${projectOf[country]!}`, { headers: { Authorization: `Bearer ${admin}` } });
        const project = ((await res.json()) as any).data;
        const currency = project.regionalCurrency ?? "INR";
        assert.equal(currency, CURRENCY[country], `${country}: the project's own currency`);
        const value = currency === "INR" ? project.workOrderValueINR : project.workOrderValueRegional;
        expected.set(currency, (expected.get(currency) ?? 0) + value);
      }
      for (const [currency, total] of expected) assert.equal(entryOf(lead, currency).totalWorkOrderValue, total, `${person.name}: ${currency}`);
      assert.equal(lead.totalsByCurrency.length, expected.size);
    }
  });

  test("the headline-currency order is unchanged: active projects desc, then headline total desc, then name", async () => {
    const list = (await summary(admin)).teamLeads.allAssigned as any[];
    const mine = list.filter((l) => String(l.reportingManager).startsWith(TAG));
    const ordered = [...mine].sort((a, b) => b.activeProjectsCount - a.activeProjectsCount || b.totalWorkOrderValue - a.totalWorkOrderValue || a.reportingManager.localeCompare(b.reportingManager));
    assert.deepEqual(mine.map((l) => l.reportingManager), ordered.map((l) => l.reportingManager));
  });
});

describe("country access narrows what each user sees, and the headline follows the data in view", () => {
  test("an Oman-only user sees only Oman projects: the headline is OMR and their lead's total is the Oman value", async () => {
    setMode("enforce");
    try {
      const data = await summary(omanOnly);
      assert.equal(data.kpiCurrency, "OMR");
      const lead = leadOf(data, PEOPLE.mixed.name);
      assert.equal(lead.activeProjectsCount, 1, "only the Oman project is visible");
      assert.equal(lead.totalWorkOrderValue, WO["Oman"]);
      assert.equal(lead.totalsByCurrency.length, 1);
      assert.equal(lead.totalsByCurrency[0].currency, "OMR");
      assert.equal(lead.formattedWorkOrderValue, "OMR 3.7K");
      assert.equal(leadOf(data, PEOPLE.qar.name), undefined, "no Qatar person is visible");
    } finally {
      setMode("off");
    }
  });

  test("an India-only user sees exactly the India widget as before: INR everywhere, one entry per person", async () => {
    setMode("enforce");
    try {
      const data = await summary(indiaOnly);
      assert.equal(data.kpiCurrency, "INR");
      for (const lead of data.teamLeads.allAssigned as any[]) {
        if (!String(lead.reportingManager).startsWith(TAG)) continue;
        assert.ok(lead.totalsByCurrency.every((t: any) => t.currency === "INR"));
        assert.equal(lead.totalsByCurrency.length, 1);
        assert.equal(lead.totalsByCurrency[0].totalWorkOrderValue, lead.totalWorkOrderValue);
      }
      assert.equal(leadOf(data, PEOPLE.indiaOnly.name).formattedWorkOrderValue, "₹ 10.00 L");
    } finally {
      setMode("off");
    }
  });
});
