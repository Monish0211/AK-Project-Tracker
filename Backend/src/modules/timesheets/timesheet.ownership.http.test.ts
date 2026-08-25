import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

const TAG = `ts-own-${Date.now()}`;

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function tokenFor(user: { id: string; email: string; roleId: string; roleName: string }): string {
  return signAccessToken({ sub: user.id, email: user.email, roleId: user.roleId, roleName: user.roleName });
}

function projectPayload(prNo: string, createdByUserId: string | null) {
  return {
    poMonth: "2026-01",
    prCategory: "India",
    prNo,
    client: "Timesheet Ownership Regression Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "Timesheet entry ownership regression",
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectEndDate: new Date("2026-12-31"),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
    createdByUserId,
  };
}

test("PATCH /timesheets/entries/:id enforces the entry's own project ownership", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdImportIds: string[] = [];
  const createdEntryIds: string[] = [];

  try {
    const [timesheetsModule, engineerRole, adminRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Timesheets" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
    ]);
    const passwordHash = await hashPassword("TsOwnTest@123");

    const [ownerA, ownerB, adminUser] = await Promise.all([
      prisma.portalUser.create({
        data: {
          fullName: "TS Own Owner A",
          email: `${TAG}-ownerA@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: timesheetsModule.id } },
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "TS Own Owner B",
          email: `${TAG}-ownerB@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: timesheetsModule.id } },
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "TS Own Admin",
          email: `${TAG}-admin@example.com`,
          passwordHash,
          department: "PMO",
          roleId: adminRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: timesheetsModule.id } },
        },
      }),
    ]);
    createdUserIds.push(ownerA.id, ownerB.id, adminUser.id);

    const projectA = await prisma.project.create({ data: projectPayload(`${TAG}-A`, ownerA.id) });
    createdProjectIds.push(projectA.id);

    const importFixture = await prisma.timesheetImport.create({
      data: { triggeredBy: "ManualUpload", status: "Succeeded" },
    });
    createdImportIds.push(importFixture.id);

    const ownedEntry = await prisma.timesheetEntry.create({
      data: {
        employeeNo: `${TAG}-EMP`,
        projectId: projectA.id,
        rawProjectCode: `${TAG}-A`,
        workDate: new Date("2026-02-01"),
        hours: 4,
        firstImportId: importFixture.id,
        lastImportId: importFixture.id,
      },
    });
    const unassignedEntry = await prisma.timesheetEntry.create({
      data: {
        employeeNo: `${TAG}-EMP`,
        projectId: null,
        rawProjectCode: `${TAG}-UNRESOLVED`,
        workDate: new Date("2026-02-02"),
        hours: 3,
        firstImportId: importFixture.id,
        lastImportId: importFixture.id,
      },
    });
    createdEntryIds.push(ownedEntry.id, unassignedEntry.id);

    const patchHours = (entryId: string, hours: number, token: string) =>
      fetch(`${url}/timesheets/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hours }),
      });

    // Owner B (Timesheets access, but not this project's owner) — 403,
    // and the entry's hours are untouched.
    const forbidden = await patchHours(ownedEntry.id, 99, tokenFor({ ...ownerB, roleName: engineerRole.name }));
    assert.equal(forbidden.status, 403);
    const untouched = await prisma.timesheetEntry.findUniqueOrThrow({ where: { id: ownedEntry.id } });
    assert.equal(untouched.hours, 4);

    // Owner A (the project's actual owner) — succeeds.
    const allowed = await patchHours(ownedEntry.id, 6, tokenFor({ ...ownerA, roleName: engineerRole.name }));
    assert.equal(allowed.status, 200);
    const updated = await prisma.timesheetEntry.findUniqueOrThrow({ where: { id: ownedEntry.id } });
    assert.equal(updated.hours, 6);

    // Administrator — always allowed regardless of project ownership.
    const adminAllowed = await patchHours(ownedEntry.id, 7, tokenFor({ ...adminUser, roleName: adminRole.name }));
    assert.equal(adminAllowed.status, 200);

    // An Unassigned entry (projectId: null) has no owner to check against —
    // any Timesheets-access user may still correct it, matching
    // findEntries()'s own "always visible" rule for the same case.
    const unassignedAllowed = await patchHours(unassignedEntry.id, 5, tokenFor({ ...ownerB, roleName: engineerRole.name }));
    assert.equal(unassignedAllowed.status, 200);

    // A nonexistent entry still 404s, unaffected by this change.
    const missing = await patchHours("00000000-0000-0000-0000-000000000000", 1, tokenFor({ ...ownerA, roleName: engineerRole.name }));
    assert.equal(missing.status, 404);
  } finally {
    await prisma.timesheetEntry.deleteMany({ where: { id: { in: createdEntryIds } } });
    await prisma.timesheetImport.deleteMany({ where: { id: { in: createdImportIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});

/**
 * P5 — GET /timesheets/entries/:id/history previously did a plain
 * findUnique/findMany by id with NO ownership check at all — any
 * Timesheets-access user could read any other project's full entry +
 * import-history data just by knowing/guessing a valid TimesheetEntry id.
 * This proves the same project-ownership rule PATCH already enforced above
 * now also applies here.
 */
test("GET /timesheets/entries/:id/history enforces the entry's own project ownership (P5 IDOR fix)", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdImportIds: string[] = [];
  const createdEntryIds: string[] = [];

  try {
    const [timesheetsModule, engineerRole, adminRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Timesheets" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
    ]);
    const passwordHash = await hashPassword("TsHistTest@123");

    const [ownerA, ownerB, adminUser] = await Promise.all([
      prisma.portalUser.create({
        data: {
          fullName: "TS History Owner A",
          email: `${TAG}-hist-ownerA@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: timesheetsModule.id } },
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "TS History Owner B",
          email: `${TAG}-hist-ownerB@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: timesheetsModule.id } },
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "TS History Admin",
          email: `${TAG}-hist-admin@example.com`,
          passwordHash,
          department: "PMO",
          roleId: adminRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: timesheetsModule.id } },
        },
      }),
    ]);
    createdUserIds.push(ownerA.id, ownerB.id, adminUser.id);

    const projectA = await prisma.project.create({ data: projectPayload(`${TAG}-HIST-A`, ownerA.id) });
    createdProjectIds.push(projectA.id);

    const importFixture = await prisma.timesheetImport.create({
      data: { triggeredBy: "ManualUpload", status: "Succeeded" },
    });
    createdImportIds.push(importFixture.id);

    const ownedEntry = await prisma.timesheetEntry.create({
      data: {
        employeeNo: `${TAG}-HIST-EMP`,
        projectId: projectA.id,
        rawProjectCode: `${TAG}-HIST-A`,
        workDate: new Date("2026-02-01"),
        hours: 4,
        firstImportId: importFixture.id,
        lastImportId: importFixture.id,
      },
    });
    const unassignedEntry = await prisma.timesheetEntry.create({
      data: {
        employeeNo: `${TAG}-HIST-EMP`,
        projectId: null,
        rawProjectCode: `${TAG}-HIST-UNRESOLVED`,
        workDate: new Date("2026-02-02"),
        hours: 3,
        firstImportId: importFixture.id,
        lastImportId: importFixture.id,
      },
    });
    createdEntryIds.push(ownedEntry.id, unassignedEntry.id);

    const getHistory = (entryId: string, token: string) =>
      fetch(`${url}/timesheets/entries/${entryId}/history`, { headers: { Authorization: `Bearer ${token}` } });

    // Owner B (has Timesheets module access, but does NOT own projectA) —
    // must be rejected, and must NOT receive the entry/history data.
    const forbidden = await getHistory(ownedEntry.id, tokenFor({ ...ownerB, roleName: engineerRole.name }));
    assert.equal(forbidden.status, 403, "an unauthorized user must not retrieve another project's timesheet history");
    const forbiddenBody = (await forbidden.json()) as { data?: unknown };
    assert.equal(forbiddenBody.data, undefined, "a 403 must carry no entry/history data at all");

    // Owner A (the project's actual owner) — allowed, receives real data.
    const allowed = await getHistory(ownedEntry.id, tokenFor({ ...ownerA, roleName: engineerRole.name }));
    assert.equal(allowed.status, 200);
    const allowedBody = (await allowed.json()) as { data: { entry: { id: string }; history: unknown[] } };
    assert.equal(allowedBody.data.entry.id, ownedEntry.id);

    // Administrator — always allowed regardless of project ownership.
    const adminAllowed = await getHistory(ownedEntry.id, tokenFor({ ...adminUser, roleName: adminRole.name }));
    assert.equal(adminAllowed.status, 200);

    // An Unassigned entry (projectId: null) has no owner to check against —
    // any Timesheets-access user may still view its history, matching
    // findEntries()'s own "always visible" rule for the same case.
    const unassignedAllowed = await getHistory(unassignedEntry.id, tokenFor({ ...ownerB, roleName: engineerRole.name }));
    assert.equal(unassignedAllowed.status, 200);

    // A nonexistent id is now a clean 404, not a 200 with entry: null —
    // closes the exists/doesn't-exist oracle as a side effect.
    const missing = await getHistory("00000000-0000-0000-0000-000000000000", tokenFor({ ...ownerA, roleName: engineerRole.name }));
    assert.equal(missing.status, 404);
  } finally {
    await prisma.timesheetEntry.deleteMany({ where: { id: { in: createdEntryIds } } });
    await prisma.timesheetImport.deleteMany({ where: { id: { in: createdImportIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
