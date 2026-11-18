import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Reports are country-aware: the Reports page labels each country section from the PR Category -> country reference
 * (GET /projects/pr-category-countries). The route was gated by Projects / Approvals / PR Request only, so a user holding just "Reports"
 * got 403 and saw the stored category name (FZI) instead of the country's display name (FZE). The gate now includes "Reports".
 *
 * What this proves: Reports alone is enough to read the reference; a user with none of the four modules still gets 403; the reference
 * reports the CALLER's own country authorization (it grants nothing); and the country-scoped project list is still the enforcement point
 * (a Reports-only user with one country never receives another country's projects).
 */

const TAG = `rcr-${Date.now()}`;
const PASSWORD = "ReportsRef@123";
let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const created = { users: [] as string[], projects: [] as string[] };
const regionId = {} as Record<string, string>;

async function listen(): Promise<void> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

interface Actor {
  id: string;
  token: string;
}

async function makeUser(label: string, modules: string[], categories: string[]): Promise<Actor> {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Read Only" } });
  const mods = await prisma.module.findMany({ where: { name: { in: modules } } });
  assert.equal(mods.length, modules.length, `modules exist: ${modules.join(", ")}`);
  const user = await prisma.portalUser.create({
    data: {
      fullName: `RCR ${label}`,
      email: `${TAG}-${label}@example.com`,
      passwordHash: await hashPassword(PASSWORD),
      department: "PMO",
      roleId: role.id,
      forcePasswordChange: false,
      allCountriesAccess: false,
      moduleAccess: { create: mods.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: categories.map((c) => ({ regionId: regionId[c]! })) },
    },
  });
  created.users.push(user.id);
  return { id: user.id, token: signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: "Read Only" }) };
}

async function call(actor: Actor, path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${url}${path}`, { headers: { Authorization: `Bearer ${actor.token}` } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const u = {} as Record<string, Actor>;

before(async () => {
  process.env["COUNTRY_ACCESS_MODE"] = "enforce";
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) regionId[r.name] = r.id;
  for (const name of ["India", "Oman"]) {
    assert.ok(regionId[name], `${name} region exists`);
    const project = await prisma.project.create({
      data: {
        poMonth: "2026-11",
        prCategory: name,
        prNo: `${TAG}-${name}`,
        client: "RCR Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: `RCR ${name} ${TAG}`,
        workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"),
        projectStatus: "Active",
        regionId: regionId[name]!,
      },
    });
    created.projects.push(project.id);
  }
  u["reportsOnly"] = await makeUser("reports-only", ["Reports"], ["India"]);
  u["noneOfFour"] = await makeUser("dashboard-only", ["Dashboard"], ["India"]);
  u["projectsOnly"] = await makeUser("projects-only", ["Projects"], ["India"]);
  await listen();
});

after(async () => {
  try {
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    process.env["COUNTRY_ACCESS_MODE"] = "off";
    await closeServer();
  }
});

describe("PR Category -> country reference route gate", () => {
  test("a Reports-only user can read the reference, and sees only their own authorization", async () => {
    const res = await call(u["reportsOnly"]!, "/projects/pr-category-countries");
    assert.equal(res.status, 200);
    const items = res.body.data.items as { prCategory: string; country: { displayName: string } | null; authorized: boolean }[];
    const by = Object.fromEntries(items.map((i) => [i.prCategory, i]));
    assert.equal(by["India"]?.authorized, true);
    assert.equal(by["Oman"]?.authorized, false, "reading the reference grants nothing");
    assert.equal(by["FZI"]?.country?.displayName, "FZE", "the stored FZI reads as FZE");
  });

  test("a user with none of Projects / Approvals / PR Request / Reports is still refused", async () => {
    const res = await call(u["noneOfFour"]!, "/projects/pr-category-countries");
    assert.equal(res.status, 403);
  });

  test("the existing Projects access still works", async () => {
    const res = await call(u["projectsOnly"]!, "/projects/pr-category-countries");
    assert.equal(res.status, 200);
  });

  test("a Reports-only user's project list is still limited to their countries (the reference opens no data)", async () => {
    const res = await call(u["reportsOnly"]!, "/projects");
    // Reports alone does not grant the Projects list at all; either way Oman's project must never be returned.
    const rows = (res.body?.data ?? []) as { prNo: string }[];
    assert.ok(Array.isArray(rows));
    assert.ok(!rows.some((p) => p.prNo === `${TAG}-Oman`), "no other country's project");
  });
});
