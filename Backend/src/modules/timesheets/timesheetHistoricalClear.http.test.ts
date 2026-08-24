import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

const TAG = `ts-hist-${Date.now()}`;

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

function projectPayload(prNo: string) {
  return {
    poMonth: "2026-01",
    prCategory: "India",
    prNo,
    client: "Historical Clear Regression Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "Historical timesheet clear regression",
    workOrderStatus: "Received",
    projectStartDate: new Date("2020-01-01"),
    projectEndDate: new Date("2030-12-31"),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
    createdByUserId: null,
  };
}

test("DELETE /timesheets/entries/historical is date-scoped, Administrator-only, and leaves unrelated data untouched", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdImportIds: string[] = [];
  const createdEntryIds: string[] = [];

  try {
    const [adminRole, engineerRole, timesheetsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Timesheets" } }),
    ]);
    const passwordHash = await hashPassword("HistClearTest@123");

    const [adminUser, ordinaryUser] = await Promise.all([
      prisma.portalUser.create({
        data: {
          fullName: "Hist Clear Admin",
          email: `${TAG}-admin@example.com`,
          passwordHash,
          department: "PMO",
          roleId: adminRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: timesheetsModule.id } },
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "Hist Clear Ordinary User",
          email: `${TAG}-ordinary@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: timesheetsModule.id } },
        },
      }),
    ]);
    createdUserIds.push(adminUser.id, ordinaryUser.id);
    const adminToken = tokenFor({ ...adminUser, roleName: adminRole.name });

    const project = await prisma.project.create({ data: projectPayload(`${TAG}-A`) });
    createdProjectIds.push(project.id);

    const importFixture = await prisma.timesheetImport.create({ data: { triggeredBy: "ManualUpload", status: "Succeeded" } });
    createdImportIds.push(importFixture.id);

    // The endpoint's date-range delete is DELIBERATELY unscoped by
    // employee/project/TAG — that is the real, intended production
    // behavior ("clear everything in this historical window"). That means
    // it is NOT safe to test against real "today"/"yesterday" dates in
    // 2026, because every other test file in this suite (which all run
    // concurrently in the same shared dev database — confirmed by
    // observing cross-file pollution when this test used 2026 dates)
    // creates its own TimesheetEntry fixtures dated in 2026 too, and a
    // broad real-dated range here would delete THEIR rows as collateral
    // damage. Anchoring the actual delete-scope boundary test to a
    // deliberately far-past, unused era (2015) makes it collision-proof
    // against every other concurrently-running test — those boundary
    // dates trivially satisfy the endpoint's own "endDate must be before
    // the real current day" rule regardless of when this suite runs. The
    // SEPARATE "reject endDate = the real current day" check further below
    // still exercises that rule against the genuine live date, without
    // ever creating a row that could collide with anything.
    const syntheticDayBeforeStart = new Date("2015-02-28T00:00:00.000Z");
    const syntheticStart = new Date("2015-03-01T00:00:00.000Z");
    const syntheticEnd = new Date("2015-03-10T00:00:00.000Z");
    const syntheticAfterEnd = new Date("2015-03-11T00:00:00.000Z");

    const makeEntry = (workDate: Date, employeeNo: string) =>
      prisma.timesheetEntry.create({
        data: {
          employeeNo,
          projectId: project.id,
          rawProjectCode: `${TAG}-A`,
          workDate,
          hours: 4,
          firstImportId: importFixture.id,
          lastImportId: importFixture.id,
        },
      });

    const entryBeforeStart = await makeEntry(syntheticDayBeforeStart, `${TAG}-EMP-BEFORE`);
    const entryAtStart = await makeEntry(syntheticStart, `${TAG}-EMP-START`);
    const entryAtEnd = await makeEntry(syntheticEnd, `${TAG}-EMP-END`);
    const entryAfterEnd = await makeEntry(syntheticAfterEnd, `${TAG}-EMP-AFTER-END`);
    createdEntryIds.push(entryBeforeStart.id, entryAtStart.id, entryAtEnd.id, entryAfterEnd.id);

    const dateParam = (d: Date) => d.toISOString().slice(0, 10);

    const clear = (token: string | undefined, start: string, end: string) =>
      fetch(`${url}/timesheets/entries/historical?startDate=${start}&endDate=${end}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

    // ---- Unauthenticated caller — 401. ----
    const unauth = await clear(undefined, dateParam(syntheticStart), dateParam(syntheticEnd));
    assert.equal(unauth.status, 401);

    // ---- Non-Administrator (Timesheets access, but not Administrator) —
    // 403, nothing deleted. ----
    const forbidden = await clear(tokenFor({ ...ordinaryUser, roleName: engineerRole.name }), dateParam(syntheticStart), dateParam(syntheticEnd));
    assert.equal(forbidden.status, 403);
    assert.equal(await prisma.timesheetEntry.count({ where: { id: { in: createdEntryIds } } }), 4);

    // ---- endDate = the REAL current day is rejected (historical-only
    // rule) — a pure validation check against the live date, no entries
    // created/touched, so it can never collide with anything else. ----
    const realToday = new Date();
    const todayRejected = await clear(adminToken, dateParam(syntheticStart), dateParam(realToday));
    assert.equal(todayRejected.status, 400);
    assert.equal(await prisma.timesheetEntry.count({ where: { id: { in: createdEntryIds } } }), 4);

    // ---- Administrator, valid range [syntheticStart, syntheticEnd] —
    // deletes exactly the two entries inside the range (entryAtStart,
    // entryAtEnd), leaves entryBeforeStart (day before start) and
    // entryAfterEnd (day after end) untouched. ----
    const clearRes = await clear(adminToken, dateParam(syntheticStart), dateParam(syntheticEnd));
    assert.equal(clearRes.status, 200);
    const clearJson = (await clearRes.json()) as { data: { deletedCount: number } };
    assert.equal(clearJson.data.deletedCount, 2);

    const remaining = await prisma.timesheetEntry.findMany({ where: { id: { in: createdEntryIds } } });
    const remainingIds = remaining.map((e) => e.id).sort();
    assert.deepEqual(remainingIds, [entryBeforeStart.id, entryAfterEnd.id].sort());

    // ---- Unrelated data is untouched: the Project, its ProjectResource
    // (if any), the TimesheetImport header, and the other user account all
    // still exist exactly as before. ----
    const projectStillExists = await prisma.project.findUnique({ where: { id: project.id } });
    assert.ok(projectStillExists);
    const importStillExists = await prisma.timesheetImport.findUnique({ where: { id: importFixture.id } });
    assert.ok(importStillExists);
    const usersStillExist = await prisma.portalUser.count({ where: { id: { in: createdUserIds } } });
    assert.equal(usersStillExist, 2);
  } finally {
    await prisma.timesheetImportRowLog.deleteMany({ where: { importId: { in: createdImportIds } } });
    await prisma.timesheetEntry.deleteMany({ where: { id: { in: createdEntryIds } } });
    await prisma.timesheetImport.deleteMany({ where: { id: { in: createdImportIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
