import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "./password.util.js";
import { prisma } from "./prismaClient.js";
import { signAccessToken } from "./jwt.util.js";

/**
 * Strict date validation — remaining modules (Oct 2026): invoices,
 * reminders, resource assignments, employees and timesheet filters all use
 * dateInput() now (see dateInput.ts for the production incident). Every
 * invalid value is a 400 that changes nothing; valid values, optional/null
 * fields and timesheet range semantics behave exactly as before. No emails
 * (SMTP is blank in test runs) and no notification rows are produced.
 * Isolated fixtures are removed in `finally`.
 */

const TAG = `dcov-${Date.now()}`;
const BAD = ["20226-04-01", "2026-02-30", "not-a-date"];

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

test("Strict dates across invoices, reminders, resources, employees and timesheet filters", async (t) => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  let projectId = "";
  let importId = "";

  try {
    const role = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } });
    const modules = await prisma.module.findMany({ where: { name: { in: ["Projects", "Invoices", "Manpower", "Timesheets"] } } });
    const raise = await prisma.approvalType.findUniqueOrThrow({ where: { name: "Raise Invoice" } });
    const admin = await prisma.portalUser.create({
      data: {
        fullName: "DateCov Admin", email: `${TAG}-admin@example.com`, passwordHash: await hashPassword("DateCov@123"),
        department: "PMO", roleId: role.id, forcePasswordChange: false,
        moduleAccess: { create: modules.map((m) => ({ moduleId: m.id })) },
        approvalPermissions: { create: [{ approvalTypeId: raise.id }] },
      },
    });
    createdUserIds.push(admin.id);
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${signAccessToken({ sub: admin.id, email: admin.email, roleId: role.id, roleName: role.name })}` };
    const api = async (method: string, path: string, body?: unknown) => {
      const res = await fetch(`${url}${path}`, { method, headers: h, ...(body !== undefined && { body: JSON.stringify(body) }) });
      const json = (await res.json()) as { data?: any; message?: string };
      return { status: res.status, data: json.data, message: json.message };
    };

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-01", prCategory: "India", prNo: `PR-${TAG}`, client: "DateCov", department: "PMO", domesticForeign: "Domestic",
        projectTitle: "DateCov", workOrderStatus: "Received", projectStartDate: new Date("2026-01-01"), projectStatus: "Active",
        workOrderNumber: "WO", workOrderDate: new Date("2026-01-01"), eicName: "EIC", pmoCoordinator: "PMO", createdByUserId: admin.id,
      },
    });
    projectId = project.id;
    const qty = await prisma.quantityItem.create({
      data: { projectId, description: "WO", woQty: 10, uom: "LOT", currency: "INR", unitRate: 100, exchangeRate: 1, unitRateINR: 100, woValue: 1000 },
    });
    const employeeNo = `${TAG}-E1`;
    await prisma.employee.create({ data: { employeeNo, employeeName: "DateCov Emp", department: "PMO", designation: "Engineer", grade: "G1", location: "Chennai" } });

    await t.test("A. invoices: bad Invoice Date rejected on create, update and ingest; record and status unchanged", async () => {
      for (const v of BAD) {
        const res = await api("POST", `/quantity/${qty.id}/invoice-lines`, { invoiceNo: `${TAG}-BAD`, invoiceDate: v, quantityBilled: 0, status: "Draft" });
        assert.equal(res.status, 400, v);
        assert.match(res.message!, /Invoice Date must be a valid date/);
      }
      assert.equal(await prisma.invoiceLine.count({ where: { quantityItemId: qty.id } }), 0);

      const ok = await api("POST", `/quantity/${qty.id}/invoice-lines`, { invoiceNo: `${TAG}-OK`, invoiceDate: "2026-03-01", quantityBilled: 1, invoiceAmountINR: 100, status: "Draft" });
      assert.equal(ok.status, 201, ok.message);
      const before = await prisma.invoiceLine.findUniqueOrThrow({ where: { id: ok.data.id } });
      assert.equal(before.invoiceDate.toISOString(), "2026-03-01T00:00:00.000Z");
      for (const v of BAD) {
        const res = await api("PATCH", `/invoice-lines/${before.id}`, { invoiceDate: v, status: "Raised", remarks: "SHOULD NOT SAVE" });
        assert.equal(res.status, 400, v);
        assert.match(res.message!, /must be a valid date/);
      }
      assert.deepEqual(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: before.id } }), before, "no partial update, status unchanged");

      const ingest = await api("POST", `/projects/${projectId}/invoice-items/ingest`, {
        lines: [{ id: randomUUID(), quantityItemId: qty.id, invoiceNo: `${TAG}-ING`, invoiceDate: "20226-04-01", quantityBilled: 0, invoiceAmountINR: 0 }],
      });
      assert.equal(ingest.status, 400);
      assert.match(ingest.message!, /lines\.0\.invoiceDate: Invoice Date must be a valid date/, "rejected for the date, not another field");
      assert.equal(await prisma.invoiceLine.count({ where: { invoiceNo: `${TAG}-ING` } }), 0);
    });

    await t.test("B. reminders: bad dates rejected; valid date, timestamp and null keep their contracts", async () => {
      const body = { projectCode: `PR-${TAG}`, title: "DateCov reminder", reminderType: "Follow-up", priority: "Medium", reminderTime: "10:00", notifyOffset: "0" };
      for (const v of BAD) {
        const res = await api("POST", `/projects/${projectId}/reminders`, { ...body, reminderDate: v });
        assert.equal(res.status, 400, v);
        assert.match(res.message!, /Reminder Date must be a valid date/);
      }
      assert.equal(await prisma.projectReminder.count({ where: { projectId } }), 0, "nothing scheduled");
      const ok = await api("POST", `/projects/${projectId}/reminders`, { ...body, reminderDate: "2026-11-05" });
      assert.equal(ok.status, 201, ok.message);
      const before = await prisma.projectReminder.findUniqueOrThrow({ where: { id: ok.data.id } });
      for (const [field, v] of [["reminderDate", "20226-04-01"], ["completedDate", "2026-02-30"], ["triggeredAt", "2026-13-01T10:00:00Z"]] as const) {
        const res = await api("PATCH", `/reminders/${before.id}`, { title: "SHOULD NOT SAVE", [field]: v });
        assert.equal(res.status, 400, field);
        assert.match(res.message!, /must be a valid date/);
      }
      assert.deepEqual(await prisma.projectReminder.findUniqueOrThrow({ where: { id: before.id } }), before, "no partial update");
      const ts = await api("PATCH", `/reminders/${before.id}`, { triggeredAt: "2026-11-05T04:30:00.000Z", completedDate: null });
      assert.equal(ts.status, 200, ts.message);
      const after = await prisma.projectReminder.findUniqueOrThrow({ where: { id: before.id } });
      assert.equal(after.triggeredAt!.toISOString(), "2026-11-05T04:30:00.000Z", "full timestamps keep their exact instant");
      assert.equal(after.completedDate, null);
    });

    await t.test("C. resource assignments: bad start/end dates rejected without partial updates; null still clears", async () => {
      for (const v of BAD) {
        const res = await api("POST", `/projects/${projectId}/resources`, { employeeNo, assignmentStartDate: v });
        assert.equal(res.status, 400, v);
        assert.match(res.message!, /must be a valid date/);
      }
      assert.equal(await prisma.projectResource.count({ where: { projectId } }), 0);
      const ok = await api("POST", `/projects/${projectId}/resources`, { employeeNo, assignmentStartDate: "2026-01-05", assignmentEndDate: "2026-06-30" });
      assert.equal(ok.status, 201, ok.message);
      const before = await prisma.projectResource.findUniqueOrThrow({ where: { id: ok.data.id } });
      for (const field of ["assignmentStartDate", "assignmentEndDate"]) {
        const res = await api("PATCH", `/resources/${before.id}`, { workingDays: 99, [field]: "2026-02-30" });
        assert.equal(res.status, 400, field);
        assert.match(res.message!, /must be a valid date/);
      }
      assert.deepEqual(await prisma.projectResource.findUniqueOrThrow({ where: { id: before.id } }), before, "no partial update");
      const clear = await api("PATCH", `/resources/${before.id}`, { assignmentEndDate: null });
      assert.equal(clear.status, 200, clear.message);
      assert.equal((await prisma.projectResource.findUniqueOrThrow({ where: { id: before.id } })).assignmentEndDate, null);
    });

    await t.test("D. employees: bad joining dates rejected on create and update; valid and null accepted", async () => {
      const body = { employeeNo: `${TAG}-E2`, employeeName: "DateCov Two", department: "PMO", designation: "Engineer", grade: "G1", location: "Chennai" };
      for (const v of BAD) {
        const res = await api("POST", "/employees", { ...body, dateOfJoining: v });
        assert.equal(res.status, 400, v);
        assert.match(res.message!, /Date of Joining must be a valid date/);
      }
      assert.equal(await prisma.employee.count({ where: { employeeNo: `${TAG}-E2` } }), 0);
      const ok = await api("POST", "/employees", { ...body, dateOfJoining: "2019-07-15" });
      assert.equal(ok.status, 201, ok.message);
      const before = await prisma.employee.findUniqueOrThrow({ where: { employeeNo: `${TAG}-E2` } });
      assert.equal(before.dateOfJoining!.toISOString(), "2019-07-15T00:00:00.000Z");
      const bad = await api("PATCH", `/employees/${before.id}`, { designation: "SHOULD NOT SAVE", dateOfJoining: "20226-04-01" });
      assert.equal(bad.status, 400);
      assert.match(bad.message!, /must be a valid date/);
      assert.deepEqual(await prisma.employee.findUniqueOrThrow({ where: { id: before.id } }), before, "no partial update");
      assert.equal((await api("PATCH", `/employees/${before.id}`, { dateOfJoining: null })).status, 200);
    });

    await t.test("E. timesheet filters: invalid dates are a 400; valid ranges filter exactly as before", async () => {
      importId = (await prisma.timesheetImport.create({ data: { triggeredBy: "ManualUpload", totalRows: 0, status: "Succeeded" } })).id;
      for (const day of ["2026-01-10", "2026-01-15", "2026-01-20"]) {
        await prisma.timesheetEntry.create({
          data: { employeeNo, rawProjectCode: `PR-${TAG}`, projectId, workDate: new Date(day), hours: 8, task: `t-${day}`, firstImportId: importId, lastImportId: importId },
        });
      }
      for (const q of ["workDate=20226-04-01", "startDate=2026-02-30", "endDate=not-a-date", "startDate=2026-01-01&endDate=21000-01-01"]) {
        const res = await api("GET", `/timesheets/entries?projectId=${projectId}&${q}`);
        assert.equal(res.status, 400, q);
        assert.match(res.message!, /must be a valid date/, q);
      }
      const range = await api("GET", `/timesheets/entries?projectId=${projectId}&startDate=2026-01-12&endDate=2026-01-20`);
      assert.equal(range.status, 200);
      assert.deepEqual(range.data.items.map((e: { task: string }) => e.task).sort(), ["t-2026-01-15", "t-2026-01-20"], "inclusive range unchanged");
      const one = await api("GET", `/timesheets/entries?projectId=${projectId}&workDate=2026-01-15`);
      assert.deepEqual(one.data.items.map((e: { task: string }) => e.task), ["t-2026-01-15"], "exact-day filter unchanged");
      const paged = await api("GET", `/timesheets/entries?projectId=${projectId}&startDate=2026-01-01&endDate=2026-01-31&page=2&pageSize=2`);
      assert.equal(paged.data.total, 3);
      assert.equal(paged.data.items.length, 1, "pagination unchanged");

      const clear = await api("DELETE", "/timesheets/entries/historical?startDate=20226-01-01&endDate=2026-01-31");
      assert.equal(clear.status, 400);
      assert.match(clear.message!, /must be a valid date/);
      const clear2 = await api("DELETE", "/timesheets/entries/historical?startDate=2026-01-01&endDate=2026-02-30");
      assert.equal(clear2.status, 400);
      assert.match(clear2.message!, /must be a valid date/);
      assert.equal(await prisma.timesheetEntry.count({ where: { projectId } }), 3, "nothing deleted by a rejected clear");

      const entry = await prisma.timesheetEntry.findFirstOrThrow({ where: { projectId, task: "t-2026-01-10" } });
      const edit = await api("PATCH", `/timesheets/entries/${entry.id}`, { hours: 3, workDate: "2026-02-30" });
      assert.equal(edit.status, 400);
      assert.match(edit.message!, /must be a valid date/);
      assert.deepEqual(await prisma.timesheetEntry.findUniqueOrThrow({ where: { id: entry.id } }), entry, "no partial update");
    });

    await t.test("12. no notification rows were produced for the test users", async () => {
      assert.equal(await prisma.notification.count({ where: { userId: { in: createdUserIds } } }), 0);
    });
  } finally {
    await close();
    if (projectId) {
      await prisma.timesheetEntry.deleteMany({ where: { projectId } }).catch(() => undefined);
      await prisma.projectReminder.deleteMany({ where: { projectId } }).catch(() => undefined);
      await prisma.projectResource.deleteMany({ where: { projectId } }).catch(() => undefined);
      await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId } } }).catch(() => undefined);
      await prisma.quantityItem.deleteMany({ where: { projectId } }).catch(() => undefined);
      await prisma.project.deleteMany({ where: { id: projectId } }).catch(() => undefined);
    }
    if (importId) await prisma.timesheetImport.deleteMany({ where: { id: importId } }).catch(() => undefined);
    await prisma.employee.deleteMany({ where: { employeeNo: { startsWith: TAG } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userApprovalPermission.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
