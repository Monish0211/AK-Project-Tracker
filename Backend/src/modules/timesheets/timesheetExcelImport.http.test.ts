import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import * as XLSX from "xlsx";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { processTimesheetImport } from "./services/timesheet.service.js";

const TAG = `ts-excel-${Date.now()}`;

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

interface TestRow {
  employeeNo: string;
  employeeName: string;
  projectCode: string;
  date: string; // "YYYY-MM-DD"
  hours: number | string;
  task?: string;
}

/** Builds a real .xlsx buffer with the same KEKA-style headers excelParser.service.ts's COLUMN_SYNONYMS already recognizes — Employee Number / Employee Name / PR Number / Date / Task / Total Hours. */
function buildWorkbookBuffer(rows: TestRow[]): Buffer {
  const header = ["Employee Number", "Employee Name", "PR Number", "Date", "Task", "Total Hours"];
  const data = rows.map((r) => [r.employeeNo, r.employeeName, r.projectCode, r.date, r.task ?? "", r.hours]);
  const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function projectPayload(prNo: string) {
  return {
    poMonth: "2026-01",
    prCategory: "India",
    prNo,
    client: "Excel Import Regression Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "Excel timesheet import regression",
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectEndDate: new Date("2026-12-31"),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
    createdByUserId: null,
  };
}

test("Excel timesheet import: basic import, in-file duplicates, and cross-source duplicate protection (Keka <-> Excel)", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdImportIds: string[] = [];

  try {
    const [adminRole, timesheetsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Timesheets" } }),
    ]);
    const passwordHash = await hashPassword("ExcelImportTest@123");

    const adminUser = await prisma.portalUser.create({
      data: {
        fullName: "Excel Import Admin",
        email: `${TAG}-admin@example.com`,
        passwordHash,
        department: "PMO",
        roleId: adminRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: timesheetsModule.id } },
      },
    });
    createdUserIds.push(adminUser.id);
    const adminToken = tokenFor({ ...adminUser, roleName: adminRole.name });

    const project = await prisma.project.create({ data: projectPayload(`${TAG}-A`) });
    createdProjectIds.push(project.id);

    const employeeNo = `${TAG}-EMP1`;

    // ---- 1. Basic import: a genuinely new, valid row is created. ----
    const basicBuffer = buildWorkbookBuffer([
      { employeeNo, employeeName: "Test Employee One", projectCode: `${TAG}-A`, date: "2026-02-01", hours: 8, task: "Design" },
    ]);
    const basicForm = new FormData();
    basicForm.append("file", new Blob([basicBuffer]), "basic.xlsx");
    const basicRes = await fetch(`${url}/timesheets/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: basicForm,
    });
    assert.equal(basicRes.status, 201);
    const basicJson = (await basicRes.json()) as { data: { importId: string; createdCount: number; duplicateCount: number; totalRows: number } };
    createdImportIds.push(basicJson.data.importId);
    assert.equal(basicJson.data.createdCount, 1);
    assert.equal(basicJson.data.duplicateCount, 0);
    assert.equal(basicJson.data.totalRows, 1);

    const afterBasic = await prisma.timesheetEntry.findMany({ where: { employeeNo, projectId: project.id } });
    assert.equal(afterBasic.length, 1);
    assert.equal(afterBasic[0]!.hours, 8);

    // ---- 2. In-file duplicates: 3 identical rows in one Excel file -> 1
    // created (the first), the other 2 recognized as duplicates of it
    // within the SAME import run, no extra TimesheetEntry rows. ----
    const employeeNo2 = `${TAG}-EMP2`;
    const dupBuffer = buildWorkbookBuffer([
      { employeeNo: employeeNo2, employeeName: "Test Employee Two", projectCode: `${TAG}-A`, date: "2026-02-02", hours: 6, task: "Review" },
      { employeeNo: employeeNo2, employeeName: "Test Employee Two", projectCode: `${TAG}-A`, date: "2026-02-02", hours: 6, task: "Review" },
      { employeeNo: employeeNo2, employeeName: "Test Employee Two", projectCode: `${TAG}-A`, date: "2026-02-02", hours: 6, task: "Review" },
    ]);
    const dupForm = new FormData();
    dupForm.append("file", new Blob([dupBuffer]), "dup.xlsx");
    const dupRes = await fetch(`${url}/timesheets/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: dupForm,
    });
    assert.equal(dupRes.status, 201);
    const dupJson = (await dupRes.json()) as { data: { importId: string; createdCount: number; duplicateCount: number; totalRows: number } };
    createdImportIds.push(dupJson.data.importId);
    assert.equal(dupJson.data.totalRows, 3);
    assert.equal(dupJson.data.createdCount, 1);
    assert.equal(dupJson.data.duplicateCount, 2);

    const afterDup = await prisma.timesheetEntry.findMany({ where: { employeeNo: employeeNo2, projectId: project.id } });
    assert.equal(afterDup.length, 1);

    // ---- 3. Cross-source: Keka already has a record; the SAME record then
    // arrives via Excel -> recognized as a duplicate, no second row. ----
    const employeeNo3 = `${TAG}-EMP3`;
    const kekaFirst = await processTimesheetImport(
      [
        {
          employeeNo: employeeNo3,
          employeeName: "Test Employee Three",
          rawProjectCode: `${TAG}-A`,
          rawProjectName: "",
          workDate: new Date("2026-02-03T00:00:00.000Z"),
          task: "Testing",
          hours: 8,
          sourceStatus: "Active",
        },
      ],
      { triggeredBy: "EmailPoll", emailMessageId: `${TAG}-msg-1` }
    );
    createdImportIds.push(kekaFirst.importId);
    assert.equal(kekaFirst.createdCount, 1);

    const excelSameBuffer = buildWorkbookBuffer([
      { employeeNo: employeeNo3, employeeName: "Test Employee Three", projectCode: `${TAG}-A`, date: "2026-02-03", hours: 8, task: "Testing" },
    ]);
    const excelSameForm = new FormData();
    excelSameForm.append("file", new Blob([excelSameBuffer]), "same-as-keka.xlsx");
    const excelSameRes = await fetch(`${url}/timesheets/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: excelSameForm,
    });
    assert.equal(excelSameRes.status, 201);
    const excelSameJson = (await excelSameRes.json()) as { data: { importId: string; createdCount: number; duplicateCount: number } };
    createdImportIds.push(excelSameJson.data.importId);
    assert.equal(excelSameJson.data.createdCount, 0);
    assert.equal(excelSameJson.data.duplicateCount, 1);

    const afterCross1 = await prisma.timesheetEntry.findMany({ where: { employeeNo: employeeNo3, projectId: project.id } });
    assert.equal(afterCross1.length, 1);

    // ---- 4. Symmetric cross-source: Excel imports a record first; the SAME
    // record then arrives via Keka -> recognized as a duplicate, no second
    // row (Excel -> Keka, not just Keka -> Excel). ----
    const employeeNo4 = `${TAG}-EMP4`;
    const excelFirstBuffer = buildWorkbookBuffer([
      { employeeNo: employeeNo4, employeeName: "Test Employee Four", projectCode: `${TAG}-A`, date: "2026-02-04", hours: 5, task: "Planning" },
    ]);
    const excelFirstForm = new FormData();
    excelFirstForm.append("file", new Blob([excelFirstBuffer]), "excel-first.xlsx");
    const excelFirstRes = await fetch(`${url}/timesheets/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: excelFirstForm,
    });
    assert.equal(excelFirstRes.status, 201);
    const excelFirstJson = (await excelFirstRes.json()) as { data: { importId: string; createdCount: number } };
    createdImportIds.push(excelFirstJson.data.importId);
    assert.equal(excelFirstJson.data.createdCount, 1);

    const kekaSecond = await processTimesheetImport(
      [
        {
          employeeNo: employeeNo4,
          employeeName: "Test Employee Four",
          rawProjectCode: `${TAG}-A`,
          rawProjectName: "",
          workDate: new Date("2026-02-04T00:00:00.000Z"),
          task: "Planning",
          hours: 5,
          sourceStatus: "Active",
        },
      ],
      { triggeredBy: "EmailPoll", emailMessageId: `${TAG}-msg-2` }
    );
    createdImportIds.push(kekaSecond.importId);
    assert.equal(kekaSecond.createdCount, 0);
    assert.equal(kekaSecond.duplicateCount, 1);

    const afterCross2 = await prisma.timesheetEntry.findMany({ where: { employeeNo: employeeNo4, projectId: project.id } });
    assert.equal(afterCross2.length, 1);

    // ---- 5. Invalid rows are reported with a reason, not silently
    // discarded, and never become a TimesheetEntry. ----
    const invalidBuffer = buildWorkbookBuffer([
      { employeeNo: "", employeeName: "No Employee Number", projectCode: `${TAG}-A`, date: "2026-02-05", hours: 4 },
      { employeeNo: `${TAG}-EMP5`, employeeName: "Bad Hours", projectCode: `${TAG}-A`, date: "2026-02-05", hours: "not-a-number" },
    ]);
    const invalidForm = new FormData();
    invalidForm.append("file", new Blob([invalidBuffer]), "invalid.xlsx");
    const invalidRes = await fetch(`${url}/timesheets/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: invalidForm,
    });
    assert.equal(invalidRes.status, 201);
    const invalidJson = (await invalidRes.json()) as {
      data: { importId: string; totalRows: number; createdCount: number; invalidRows: { rowNumber: number; reason: string }[] };
    };
    createdImportIds.push(invalidJson.data.importId);
    assert.equal(invalidJson.data.totalRows, 0);
    assert.equal(invalidJson.data.createdCount, 0);
    assert.equal(invalidJson.data.invalidRows.length, 2);
    assert.match(invalidJson.data.invalidRows[0]!.reason, /Employee Number is missing/);
    assert.match(invalidJson.data.invalidRows[1]!.reason, /Total Hours/);

    // ---- 6. Non-Administrator caller is rejected (pre-existing gate,
    // re-confirmed unchanged by this feature). ----
    const engineerRole = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } });
    const ordinaryUser = await prisma.portalUser.create({
      data: {
        fullName: "Excel Import Ordinary User",
        email: `${TAG}-ordinary@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: timesheetsModule.id } },
      },
    });
    createdUserIds.push(ordinaryUser.id);
    const ordinaryForm = new FormData();
    ordinaryForm.append("file", new Blob([basicBuffer]), "basic2.xlsx");
    const ordinaryRes = await fetch(`${url}/timesheets/import`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenFor({ ...ordinaryUser, roleName: engineerRole.name })}` },
      body: ordinaryForm,
    });
    assert.equal(ordinaryRes.status, 403);
  } finally {
    await prisma.timesheetImportRowLog.deleteMany({ where: { importId: { in: createdImportIds } } });
    await prisma.timesheetEntry.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.timesheetImport.deleteMany({ where: { id: { in: createdImportIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
