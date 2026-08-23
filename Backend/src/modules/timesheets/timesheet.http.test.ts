import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

const TAG = `ts-p4-${Date.now()}`;

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
    client: "Timesheet Pagination Regression Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "Priority 4 pagination regression",
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

test("GET /timesheets/entries — pagination + date filtering preserve existing totals and authorization", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdImportIds: string[] = [];

  try {
    const [timesheetsModule, engineerRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Timesheets" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("TsP4Test@123");

    const noModuleUser = await prisma.portalUser.create({
      data: {
        fullName: "TS P4 No Module",
        email: `${TAG}-nomodule@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(noModuleUser.id);

    const owner = await prisma.portalUser.create({
      data: {
        fullName: "TS P4 Owner",
        email: `${TAG}-owner@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: timesheetsModule.id } },
      },
    });
    createdUserIds.push(owner.id);

    const outsider = await prisma.portalUser.create({
      data: {
        fullName: "TS P4 Outsider",
        email: `${TAG}-outsider@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: timesheetsModule.id } },
      },
    });
    createdUserIds.push(outsider.id);

    const ownerProject = await prisma.project.create({ data: projectPayload(`${TAG}-OWNER`, owner.id) });
    const outsiderProject = await prisma.project.create({ data: projectPayload(`${TAG}-OUTSIDER`, outsider.id) });
    createdProjectIds.push(ownerProject.id, outsiderProject.id);

    const importRow = await prisma.timesheetImport.create({ data: { triggeredBy: "ManualUpload" } });
    createdImportIds.push(importRow.id);

    const employeeNo = `${TAG}-EMP`;
    // 5 entries for the owner's project, spanning 3 calendar months —
    // mirrors the audit's Jan/Feb/Mar example (values chosen for easy
    // arithmetic, not the literal 100/120/80 illustration).
    const ownerEntries = [
      { workDate: new Date("2026-01-05"), hours: 10 },
      { workDate: new Date("2026-01-20"), hours: 15 },
      { workDate: new Date("2026-02-10"), hours: 20 },
      { workDate: new Date("2026-03-01"), hours: 8 },
      { workDate: new Date("2026-03-15"), hours: 12 },
    ];
    for (const e of ownerEntries) {
      await prisma.timesheetEntry.create({
        data: {
          employeeNo,
          rawEmployeeName: "Regression Employee",
          projectId: ownerProject.id,
          rawProjectCode: `${TAG}-OWNER`,
          rawProjectName: "Priority 4 pagination regression",
          workDate: e.workDate,
          task: "Regression",
          hours: e.hours,
          sourceStatus: "Active",
          firstImportId: importRow.id,
          lastImportId: importRow.id,
        },
      });
    }
    // One entry on the outsider's own project — must never appear in the
    // owner's results, and must appear in the outsider's own.
    await prisma.timesheetEntry.create({
      data: {
        employeeNo,
        rawEmployeeName: "Regression Employee",
        projectId: outsiderProject.id,
        rawProjectCode: `${TAG}-OUTSIDER`,
        rawProjectName: "Priority 4 pagination regression",
        workDate: new Date("2026-02-14"),
        task: "Regression",
        hours: 99,
        sourceStatus: "Active",
        firstImportId: importRow.id,
        lastImportId: importRow.id,
      },
    });

    const ownerToken = tokenFor({ ...owner, roleName: engineerRole.name });
    const outsiderToken = tokenFor({ ...outsider, roleName: engineerRole.name });
    const noModuleToken = tokenFor({ ...noModuleUser, roleName: engineerRole.name });

    type EntriesResponse = {
      success: boolean;
      data?: { items: { id: string; hours: number; projectId: string | null; workDate: string }[]; total: number; page: number; pageSize: number };
      message?: string;
    };
    const getEntries = async (query: string, token?: string) => {
      const res = await fetch(`${url}/timesheets/entries?${query}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return { status: res.status, json: (await res.json()) as EntriesResponse };
    };

    // Test 5 — no authentication
    const unauth = await getEntries(`employeeNo=${employeeNo}`);
    assert.equal(unauth.status, 401);

    // Test 6 — authenticated but no Timesheets module grant
    const noModuleRes = await getEntries(`employeeNo=${employeeNo}`, noModuleToken);
    assert.equal(noModuleRes.status, 403);

    // Pagination — page through all of the owner's entries with pageSize=2
    // and confirm the accumulated total matches a direct sum, exactly as
    // the "same data -> same result" regression requirement specifies.
    const expectedTotalHours = ownerEntries.reduce((sum, e) => sum + e.hours, 0);
    const collected: { hours: number }[] = [];
    let page = 1;
    let reportedTotal = -1;
    for (;;) {
      const res = await getEntries(`employeeNo=${employeeNo}&page=${page}&pageSize=2`, ownerToken);
      assert.equal(res.status, 200);
      const data = res.json.data!;
      reportedTotal = data.total;
      assert.equal(data.page, page);
      assert.equal(data.pageSize, 2);
      collected.push(...data.items);
      if (collected.length >= data.total || data.items.length === 0) break;
      page += 1;
      assert.ok(page <= 10, "pagination did not terminate as expected");
    }
    assert.equal(reportedTotal, 5, "total must count only the owner's own project's entries");
    assert.equal(collected.length, 5);
    assert.equal(
      collected.reduce((sum, e) => sum + e.hours, 0),
      expectedTotalHours,
      "paginated accumulation must sum to the exact same total as the underlying data"
    );
    // Confirm real pagination occurred (not one page silently returning everything).
    assert.equal(page, 3, "5 rows at pageSize=2 must span exactly 3 pages");

    // Date-window filtering — startDate/endDate scoped to February only.
    const febRes = await getEntries(`employeeNo=${employeeNo}&startDate=2026-02-01&endDate=2026-02-28&pageSize=50`, ownerToken);
    assert.equal(febRes.status, 200);
    const febItems = febRes.json.data!.items;
    assert.equal(febItems.length, 1);
    assert.equal(febItems[0].hours, 20);
    assert.equal(febRes.json.data!.total, 1);

    // Ownership — outsider must never see the owner's project's entries.
    const outsiderRes = await getEntries(`employeeNo=${employeeNo}&pageSize=50`, outsiderToken);
    assert.equal(outsiderRes.status, 200);
    assert.equal(outsiderRes.json.data!.total, 1, "outsider must only see their own project's entry, not the owner's 5");
    assert.equal(outsiderRes.json.data!.items[0].hours, 99);

    // Default page/pageSize apply when omitted (schema defaults), and the
    // exact-match `workDate` filter (pre-existing behavior) still works
    // unchanged alongside the new params.
    const exactDateRes = await getEntries(`employeeNo=${employeeNo}&workDate=2026-01-05`, ownerToken);
    assert.equal(exactDateRes.status, 200);
    assert.equal(exactDateRes.json.data!.total, 1);
    assert.equal(exactDateRes.json.data!.items[0].hours, 10);
  } finally {
    const employeeNo = `${TAG}-EMP`;
    await prisma.timesheetEntry.deleteMany({ where: { employeeNo } });
    if (createdImportIds.length > 0) {
      await prisma.timesheetImport.deleteMany({ where: { id: { in: createdImportIds } } });
    }
    if (createdProjectIds.length > 0) {
      await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});
