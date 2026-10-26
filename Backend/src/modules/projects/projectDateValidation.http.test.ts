import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Project date validation + dashboard resilience (Oct 2026). Production
 * incident: a Project End Date typed as "20226-04-01" passed
 * z.coerce.date(), was stored by PostgreSQL, came back from the driver as an
 * Invalid Date, and toDateKey() threw — GET /dashboard/summary returned 500
 * for everyone who could see that project. Covers the API boundary (create,
 * update, PR Request draft, Excel import, milestones) and the dashboard
 * reading a malformed stored date. Isolated fixtures removed in `finally`.
 */

const TAG = `datefix-${Date.now()}`;
const BAD_YEAR = "20226-04-01";
const IMPOSSIBLE = "2026-02-30";

async function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

function projectBody(prNo: string, extra: Record<string, unknown> = {}) {
  return {
    poMonth: "2026-10", prCategory: "India", prNo, rfqNo: `RFQ-${prNo}`, client: "Date Client", department: "PMO",
    domesticForeign: "Domestic", projectTitle: `Date ${prNo}`, workOrderStatus: "Received",
    projectStartDate: "2026-03-02", projectEndDate: "2026-04-01", projectStatus: "Active", workOrderNumber: `WO-${prNo}`,
    workOrderDate: "2026-03-02", eicName: "EIC", contractType: "LUMP SUM", pmoCoordinator: "Typed Name", ...extra,
  };
}

const DATE_FIELDS: Array<[string, string]> = [
  ["projectStartDate", "Project Start Date"],
  ["projectEndDate", "Project End Date"],
  ["workOrderDate", "Work Order Date"],
  ["actualCompletionDate", "Actual Completion Date"],
  ["completedTimestamp", "Completed Timestamp"],
];

test("Project dates: strict validation at the API boundary; dashboard survives a malformed stored date", async (t) => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  let tsImportId = "";

  try {
    const mod = async (name: string) => (await prisma.module.findUniqueOrThrow({ where: { name } })).id;
    const [projects, approvals, dashboard, timesheets, addProject, prRequest] = await Promise.all([
      mod("Projects"), mod("Approvals"), mod("Dashboard"), mod("Timesheets"), mod("Add Project"), mod("PR Request"),
    ]);
    const passwordHash = await hashPassword("DateFixTest@123");
    async function makeUser(key: string, roleName: string, modules: string[]) {
      const r = await prisma.portalRole.findUniqueOrThrow({ where: { name: roleName } });
      const user = await prisma.portalUser.create({
        data: {
          fullName: `DateFix ${key}`, email: `${TAG}-${key}@example.com`, passwordHash, department: "PMO", roleId: r.id,
          forcePasswordChange: false, moduleAccess: { create: modules.map((moduleId) => ({ moduleId })) },
        },
      });
      createdUserIds.push(user.id);
      const token = signAccessToken({ sub: user.id, email: user.email, roleId: r.id, roleName: r.name });
      return { user, h: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } };
    }
    const pm = await makeUser("pm", "PMO Manager", [projects, addProject, approvals]);
    const requester = await makeUser("requester", "PR Request User", [approvals, prRequest]);
    const engineer = await makeUser("eng", "Engineer", [projects, dashboard, timesheets]);

    const api = async (method: string, path: string, h: Record<string, string>, body?: unknown) => {
      const res = await fetch(`${url}${path}`, { method, headers: h, ...(body !== undefined && { body: JSON.stringify(body) }) });
      const json = (await res.json()) as { data?: Record<string, any>; message?: string };
      return { status: res.status, data: json.data, message: json.message };
    };

    await t.test("3/5. create rejects a five-digit year in every date field, with a clear 400, creating nothing", async () => {
      for (const [field, label] of DATE_FIELDS) {
        const res = await api("POST", "/projects", pm.h, projectBody(`PR-${TAG}-C-${field}`, { [field]: BAD_YEAR }));
        assert.equal(res.status, 400, field);
        assert.equal(res.message, `${field}: ${label} must be a valid date (YYYY-MM-DD) with a year between 1900 and 2100.`);
      }
      assert.equal(await prisma.project.count({ where: { prNo: { startsWith: `PR-${TAG}-C-` } } }), 0);
    });

    await t.test("7. impossible calendar dates are rejected, not rolled over", async () => {
      for (const v of [IMPOSSIBLE, "2025-02-29", "2026-13-01", "01/04/2026"]) {
        const res = await api("POST", "/projects", pm.h, projectBody(`PR-${TAG}-IMP`, { projectEndDate: v }));
        assert.equal(res.status, 400, v);
      }
      assert.equal(await prisma.project.count({ where: { prNo: `PR-${TAG}-IMP` } }), 0);
    });

    let projectId = "";
    await t.test("10. existing legitimate formats still work, with unchanged results", async () => {
      const a = await api("POST", "/projects", pm.h, projectBody(`PR-${TAG}-OK1`));
      assert.equal(a.status, 201, a.message);
      projectId = a.data!.id;
      const row = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      assert.equal(row.projectEndDate!.toISOString(), "2026-04-01T00:00:00.000Z", "date-only = UTC midnight, as before");
      const b = await api("POST", "/projects", pm.h, projectBody(`PR-${TAG}-OK2`, {
        projectStartDate: "2026-01-01T00:00:00.000Z", projectEndDate: null, completedTimestamp: "2026-10-15T07:05:31.123Z", actualCompletionDate: "2024-02-29",
      }));
      assert.equal(b.status, 201, b.message);
      const row2 = await prisma.project.findUniqueOrThrow({ where: { id: b.data!.id } });
      assert.equal(row2.projectEndDate, null);
      assert.equal(row2.completedTimestamp!.toISOString(), "2026-10-15T07:05:31.123Z");
    });

    await t.test("4. update rejects an invalid date and changes nothing else in the same request", async () => {
      const before = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      for (const [field] of DATE_FIELDS) {
        for (const v of [BAD_YEAR, IMPOSSIBLE]) {
          const res = await api("PATCH", `/projects/${projectId}`, pm.h, { projectTitle: "SHOULD NOT SAVE", [field]: v });
          assert.equal(res.status, 400, `${field}=${v}`);
        }
      }
      const after = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      assert.deepEqual(after, before, "no partial update");
      const ok = await api("PATCH", `/projects/${projectId}`, pm.h, { projectEndDate: "2026-05-15" });
      assert.equal(ok.status, 200, ok.message);
      assert.equal((await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).projectEndDate!.toISOString(), "2026-05-15T00:00:00.000Z");
    });

    await t.test("6. PR Request drafts follow the same rules (project dates and milestone due dates)", async () => {
      const badEnd = await api("POST", "/pr-requests", requester.h, { projectData: projectBody(`PR-${TAG}-PR1`, { projectEndDate: BAD_YEAR }) });
      assert.equal(badEnd.status, 400);
      assert.match(badEnd.message!, /Project End Date must be a valid date/);
      const badDue = await api("POST", "/pr-requests", requester.h, {
        projectData: { ...projectBody(`PR-${TAG}-PR2`), paymentMilestones: [{ milestoneName: "M1", paymentPercentage: 100, dueDate: IMPOSSIBLE }] },
      });
      assert.equal(badDue.status, 400);
      assert.match(badDue.message!, /Due Date must be a valid date/);
      const good = await api("POST", "/pr-requests", requester.h, {
        projectData: { ...projectBody(`PR-${TAG}-PR3`), paymentMilestones: [{ milestoneName: "M1", paymentPercentage: 100, dueDate: "2026-06-30" }] },
      });
      assert.equal(good.status, 201, good.message);
    });

    await t.test("alternate write paths: Excel import and the milestones endpoint use the same rules", async () => {
      const imp = await api("POST", "/projects/import", pm.h, { projects: [projectBody(`PR-${TAG}-IM1`), projectBody(`PR-${TAG}-IM2`, { workOrderDate: BAD_YEAR })] });
      assert.equal(imp.status, 400);
      assert.match(imp.message!, /projects\.1\.workOrderDate: Work Order Date must be a valid date/);
      assert.equal(await prisma.project.count({ where: { prNo: { startsWith: `PR-${TAG}-IM` } } }), 0, "all-or-nothing");
      const ms = await api("POST", `/projects/${projectId}/milestones`, pm.h, { milestoneName: "Bad", paymentPercentage: 10, dueDate: BAD_YEAR });
      assert.equal(ms.status, 400);
      assert.equal(await prisma.paymentMilestone.count({ where: { projectId, milestoneName: "Bad" } }), 0);
    });

    await t.test("8/9. dashboard: 200 with normal data, and still 200 when a stored date is unreadable", async () => {
      const own = await prisma.project.create({
        data: { ...projectBody(`PR-${TAG}-DASH`), projectStartDate: new Date("2026-03-02"), projectEndDate: new Date("2026-04-01"), workOrderDate: new Date("2026-03-02"), createdByUserId: engineer.user.id } as never,
      });
      const qty = await prisma.quantityItem.create({
        data: { projectId: own.id, description: "WO", woQty: 1, uom: "LOT", currency: "INR", unitRate: 1000, exchangeRate: 1, unitRateINR: 1000, woValue: 1000 },
      });
      const line = await prisma.invoiceLine.create({
        data: { quantityItemId: qty.id, invoiceNo: `${TAG}-INV`, invoiceDate: new Date("2026-06-01"), quantityBilled: 1, invoiceAmountINR: 500, status: "Raised", createdBy: engineer.user.id },
      });

      const normal = await api("GET", "/dashboard/summary", engineer.h);
      assert.equal(normal.status, 200, "normal data");
      const before = normal.data!.health as { total: number; delayed: number; scheduleNotSet: number };
      // Active with an end date (2026-04-01) already in the past = "delayed".

      // Recreate the production state directly in the test DB (the API now refuses it).
      await prisma.$executeRawUnsafe(`UPDATE "Project" SET "projectEndDate" = '20226-04-01' WHERE id = $1`, own.id);
      await prisma.$executeRawUnsafe(`UPDATE "InvoiceLine" SET "invoiceDate" = '20226-06-01' WHERE id = $1`, line.id);
      // ...and a timesheet work date (the latest one feeds "Timesheet Pending").
      tsImportId = (await prisma.timesheetImport.create({ data: { triggeredBy: "ManualUpload", totalRows: 0, status: "Succeeded" } })).id;
      const entry = await prisma.timesheetEntry.create({
        data: { employeeNo: `${TAG}-EMP`, rawProjectCode: own.prNo, projectId: own.id, workDate: new Date("2026-03-05"), hours: 8, task: "t", firstImportId: tsImportId, lastImportId: tsImportId },
      });
      await prisma.$executeRawUnsafe(`UPDATE "TimesheetEntry" SET "workDate" = '20226-01-01' WHERE id = $1`, entry.id);
      const read = await prisma.project.findUniqueOrThrow({ where: { id: own.id } });
      assert.ok(Number.isNaN(read.projectEndDate!.getTime()), "precondition: the driver returns an Invalid Date");

      const res = await api("GET", "/dashboard/summary", engineer.h);
      assert.equal(res.status, 200, `dashboard must not fail: ${res.message}`);
      assert.equal(res.data!.health.total, before.total, "the project is still counted");
      assert.equal(res.data!.health.delayed, before.delayed - 1);
      assert.equal(res.data!.health.scheduleNotSet, before.scheduleNotSet + 1, "unreadable end date = schedule not set, never invented");
      for (const e of res.data!.activity.items as Array<{ timestamp: string }>) {
        assert.ok(e.timestamp && !Number.isNaN(new Date(e.timestamp).getTime()), "no empty/invalid activity timestamps");
      }
      assert.ok(!(res.data!.activity.items as Array<{ id: string }>).some((e) => e.id === `invoice-${line.id}`), "unreadable invoice date skipped");
      assert.equal((await api("GET", `/projects/${own.id}`, engineer.h)).status, 200, "the project itself still opens");
      const pending = await api("GET", "/timesheets/pending-projects", engineer.h);
      assert.equal(pending.status, 200, `timesheet pending must not fail: ${pending.message}`);
    });
  } finally {
    await close();
    const prs = await prisma.pRRequest.findMany({ where: { requestedByUserId: { in: createdUserIds } }, select: { id: true } });
    await prisma.pRRequest.deleteMany({ where: { id: { in: prs.map((p) => p.id) } } });
    const own = await prisma.project.findMany({ where: { prNo: { startsWith: `PR-${TAG}` } }, select: { id: true } });
    const ids = own.map((p) => p.id);
    await prisma.invoiceLine.deleteMany({ where: { quantityItem: { projectId: { in: ids } } } });
    await prisma.quantityItem.deleteMany({ where: { projectId: { in: ids } } });
    await prisma.paymentMilestone.deleteMany({ where: { projectId: { in: ids } } });
    await prisma.timesheetEntry.deleteMany({ where: { projectId: { in: ids } } });
    if (tsImportId) await prisma.timesheetImport.deleteMany({ where: { id: tsImportId } });
    await prisma.project.deleteMany({ where: { id: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
  }
});
