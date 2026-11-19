import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PR_CATEGORY_PREFIX_MAP } from "../projects/project.constants.js";
import { resolveProjectEventRecipients } from "../notifications/notification.service.js";
import { resolveCoordinatorAssignment } from "../pmoCoordinators/services/pmoCoordinator.service.js";
import { sendPmoCoordinatorAllocationEmail, setAllocationEmailFlagForTests, setAllocationEmailSenderForTests } from "../pmoCoordinators/services/pmoCoordinatorAllocationEmail.service.js";

/**
 * Three audit findings, fixed and pinned (enforce mode; with country access off everything is exactly as before):
 *  E. project archive / restore / delete notifications reach only users who hold the project's country;
 *  F. timesheet import list, detail and rows show a country-limited user only their countries' rows;
 *  G. a PMO Coordinator account is assigned to, and emailed about, only projects of a country it holds.
 */
const TAG = `ntc-${Date.now()}`;
let url = "";
let closeServer: () => Promise<void> = async () => undefined;
const region = new Map<string, string>();
const tokens = new Map<string, string>();
const userId = new Map<string, string>();
const created = { users: [] as string[], projects: [] as string[], imports: [] as string[], coordinators: [] as string[] };
const setMode = (m: "off" | "enforce") => (process.env["COUNTRY_ACCESS_MODE"] = m);

async function makeUser(label: string, opts: { countries?: string[]; allCountries?: boolean; modules?: string[] }) {
  const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } });
  const modules = await prisma.module.findMany({ where: { name: { in: opts.modules ?? ["Projects", "Timesheets"] } } });
  const user = await prisma.portalUser.create({
    data: {
      fullName: `NTC ${label}`, email: `${TAG}-${label}@example.com`, passwordHash: await hashPassword("Country@123"), department: "PMO", roleId: role.id, forcePasswordChange: false,
      allCountriesAccess: opts.allCountries === true,
      moduleAccess: { create: modules.map((m) => ({ moduleId: m.id })) },
      regionAccess: { create: (opts.countries ?? []).map((c) => ({ regionId: region.get(c)! })) },
    },
  });
  created.users.push(user.id);
  userId.set(label, user.id);
  tokens.set(label, signAccessToken({ sub: user.id, email: user.email, roleId: role.id, roleName: "Administrator" }));
  return user;
}

let seq = 0;
async function makeProject(country: "India" | "Oman") {
  seq += 1;
  const p = await prisma.project.create({
    data: {
      poMonth: "2026-11", prCategory: country, prNo: `${PR_CATEGORY_PREFIX_MAP[country]}${TAG}-${seq}`, client: "NTC", department: "Process", domesticForeign: "Foreign", projectTitle: `NTC ${country}`,
      workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active", contractType: "LUMP SUM", createdByUserId: null, regionId: region.get(country)!,
    },
  });
  created.projects.push(p.id);
  return p;
}

const get = async (who: string, path: string) => {
  const res = await fetch(`${url}${path}`, { headers: { Authorization: `Bearer ${tokens.get(who)!}` } });
  return { status: res.status, data: ((await res.json().catch(() => ({}))) as { data?: any }).data };
};

let IN: Awaited<ReturnType<typeof makeProject>>;
let OM: Awaited<ReturnType<typeof makeProject>>;

before(async () => {
  setMode("off");
  for (const r of await prisma.region.findMany({ select: { id: true, name: true } })) region.set(r.name, r.id);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  closeServer = () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  IN = await makeProject("India");
  OM = await makeProject("Oman");
  await makeUser("india", { countries: ["India"] });
  await makeUser("oman", { countries: ["Oman"] });
  await makeUser("all", { allCountries: true });
  await makeUser("none", {});
});

after(async () => {
  try {
    setAllocationEmailFlagForTests(null);
    setAllocationEmailSenderForTests(null);
    await prisma.timesheetImportRowLog.deleteMany({ where: { importId: { in: created.imports } } });
    await prisma.timesheetEntry.deleteMany({ where: { firstImportId: { in: created.imports } } });
    await prisma.timesheetImport.deleteMany({ where: { id: { in: created.imports } } });
    await prisma.pmoCoordinator.deleteMany({ where: { id: { in: created.coordinators } } });
    await prisma.project.deleteMany({ where: { id: { in: created.projects } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.userRegionAccess.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: created.users } } });
  } finally {
    setMode("off");
    await closeServer();
  }
});

describe("E. project event notifications reach only users who hold the project's country", () => {
  test("an ownerless Oman project's event goes to Oman and All Countries users, never to India-only users; unclassified needs All Countries", async () => {
    setMode("enforce");
    const oman = await resolveProjectEventRecipients(null, "Projects", region.get("Oman")!);
    assert.ok(oman.includes(userId.get("oman")!) && oman.includes(userId.get("all")!));
    assert.ok(!oman.includes(userId.get("india")!) && !oman.includes(userId.get("none")!));
    const unclassified = await resolveProjectEventRecipients(null, "Projects", null);
    assert.ok(unclassified.includes(userId.get("all")!) && !unclassified.includes(userId.get("oman")!));
    assert.deepEqual(await resolveProjectEventRecipients(userId.get("india")!, "Projects", region.get("Oman")!), [], "even the creator is skipped once they no longer hold the country");
  });

  test("with country access off the recipients are exactly as before; the invoice call site (no country) is unchanged", async () => {
    setMode("off");
    assert.ok((await resolveProjectEventRecipients(null, "Projects", region.get("Oman")!)).includes(userId.get("india")!));
    setMode("enforce");
    assert.ok((await resolveProjectEventRecipients(null, "Projects")).includes(userId.get("india")!), "no country given = previous behaviour (invoice events, out of this release)");
    const src = readFileSync(fileURLToPath(new URL("../projects/services/project.service.ts", import.meta.url)), "utf8");
    assert.equal((src.match(/resolveProjectEventRecipients\(existing\.createdByUserId, "Projects", existing\.regionId \?\? null\)/g) ?? []).length, 3, "archive, restore and delete pass the country");
  });
});

describe("F. timesheet import logs are limited to the caller's countries", () => {
  let mixed = "";
  let omanOnly = "";

  before(async () => {
    const mk = async () => {
      const imp = await prisma.timesheetImport.create({ data: { status: "PartiallySucceeded", triggeredBy: "Test", totalRows: 4, createdCount: 2, updatedCount: 1, failedCount: 1, errorSummary: `${OM.prNo} failed` } });
      created.imports.push(imp.id);
      return imp.id;
    };
    mixed = await mk();
    omanOnly = await mk();
    const entry = (importId: string, p: { id: string; prNo: string }, emp: string) =>
      prisma.timesheetEntry.create({ data: { employeeNo: emp, projectId: p.id, rawProjectCode: p.prNo, workDate: new Date("2026-11-02"), hours: 8, firstImportId: importId, lastImportId: importId } });
    const e1 = await entry(mixed, IN, "E-IN-1");
    const e2 = await entry(mixed, IN, "E-IN-2");
    const e3 = await entry(mixed, OM, "E-OM-1");
    const e4 = await entry(omanOnly, OM, "E-OM-2");
    const row = (importId: string, entryId: string | null, code: string, emp: string, outcome: string) =>
      ({ importId, entryId, rawEmployeeNo: emp, rawProjectCode: code, workDate: new Date("2026-11-02"), task: "Design", newHours: 8, outcome });
    await prisma.timesheetImportRowLog.createMany({
      data: [row(mixed, e1.id, IN.prNo, "E-IN-1", "Created"), row(mixed, e2.id, IN.prNo, "E-IN-2", "Created"), row(mixed, e3.id, OM.prNo, "E-OM-1", "Updated"), row(mixed, null, "UNKNOWN", "E-X", "Failed"), row(omanOnly, e4.id, OM.prNo, "E-OM-2", "Created")],
    });
  });

  test("India sees the mixed import with ITS counts and no error summary, never the Oman-only one; its rows are India's only", async () => {
    setMode("enforce");
    const list = await get("india", "/timesheets/imports?page=1&pageSize=100");
    assert.equal(list.status, 200);
    const mine = (list.data.items as any[]).filter((i) => i.id === mixed || i.id === omanOnly);
    assert.deepEqual(mine.map((i) => i.id), [mixed]);
    assert.deepEqual([mine[0].totalRows, mine[0].createdCount, mine[0].updatedCount, mine[0].failedCount, mine[0].errorSummary], [2, 2, 0, 0, null]);
    const detail = await get("india", `/timesheets/imports/${mixed}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.errorSummary, null);
    const rows = await get("india", `/timesheets/imports/${mixed}/rows?page=1&pageSize=100`);
    assert.equal(rows.status, 200);
    assert.deepEqual((rows.data.items as any[]).map((r) => r.rawProjectCode).sort(), [IN.prNo, IN.prNo]);
    assert.equal(rows.data.total, 2);
    assert.equal((await get("india", `/timesheets/imports/${omanOnly}`)).status, 404);
    assert.equal((await get("india", `/timesheets/imports/${omanOnly}/rows?page=1&pageSize=10`)).status, 404);
    assert.equal((await get("none", `/timesheets/imports/${mixed}/rows?page=1&pageSize=10`)).status, 404, "no country: nothing");
  });

  test("All Countries and country access off see the imports exactly as recorded (every row, including the unmatched one)", async () => {
    setMode("enforce");
    const all = await get("all", `/timesheets/imports/${mixed}/rows?page=1&pageSize=100`);
    assert.equal(all.data.total, 4);
    assert.equal((await get("all", `/timesheets/imports/${mixed}`)).data.errorSummary, `${OM.prNo} failed`);
    setMode("off");
    assert.equal((await get("india", `/timesheets/imports/${mixed}/rows?page=1&pageSize=100`)).data.total, 4);
    setMode("enforce");
  });
});

describe("G. PMO Coordinator assignment and email respect the project's country", () => {
  test("an India-only coordinator account cannot be newly assigned to an Oman project, can to an India one; country access off = as before", async () => {
    const coordinatorUser = await makeUser("coordinator", { countries: ["India"], modules: ["Projects"] });
    const entry = await prisma.pmoCoordinator.create({ data: { displayName: "NTC Coordinator", email: coordinatorUser.email, emailNormalized: coordinatorUser.email.toLowerCase() } });
    created.coordinators.push(entry.id);
    setMode("enforce");
    await assert.rejects(prisma.$transaction((tx) => resolveCoordinatorAssignment(tx, entry.id, null, region.get("Oman")!)), /do not have access to this project's country/);
    const ok = await prisma.$transaction((tx) => resolveCoordinatorAssignment(tx, entry.id, null, region.get("India")!));
    assert.equal(ok.accountId, coordinatorUser.id);
    setMode("off");
    assert.equal((await prisma.$transaction((tx) => resolveCoordinatorAssignment(tx, entry.id, null, region.get("Oman")!))).accountId, coordinatorUser.id);
  });

  test("the allocation email naming an Oman project is never sent to a coordinator without Oman", async () => {
    const sent: string[] = [];
    setAllocationEmailFlagForTests("true");
    setAllocationEmailSenderForTests((async (o: { subject: string }) => {
      sent.push(o.subject);
      return { success: true };
    }) as never);
    setMode("enforce");
    const coordinatorId = userId.get("coordinator")!;
    assert.equal(await sendPmoCoordinatorAllocationEmail({ projectId: OM.id, coordinatorUserId: coordinatorId }), "no_recipient");
    assert.equal(sent.length, 0);
    assert.equal(await sendPmoCoordinatorAllocationEmail({ projectId: IN.id, coordinatorUserId: coordinatorId }), "sent");
    assert.equal(sent.length, 1);
  });
});
