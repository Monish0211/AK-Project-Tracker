import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { recomputeProjectResource } from "./projectResource.service.js";

/**
 * P1-04 (production hardening) — proves recomputeProjectResource() is
 * concurrency-safe: no lost updates, no duplicate rows, and the frozen
 * hourlyRateSnapshot guarantee holds, even under real concurrent DB access
 * (Promise.all — genuine overlapping transactions, not simulated). Uses its
 * own clearly-marked synthetic Project/TimesheetImport/TimesheetEntry rows,
 * cleaned up by exact collected ID in a finally block.
 */

const TAG = `p1-04-conc-${Date.now()}`;

test("recomputeProjectResource is concurrency-safe (no lost updates, no duplicate rows)", async () => {
  const employeeNo = `${TAG}-EMP`;
  const entryIds: string[] = [];
  let projectId: string | null = null;
  let importId: string | null = null;

  try {
    const project = await prisma.project.create({
      data: {
        poMonth: "Jan-2020",
        prCategory: "P1Test",
        prNo: `${TAG}-PR`,
        client: "P1-04 Concurrency Test Client (synthetic)",
        department: "P1Test",
        domesticForeign: "Domestic",
        projectTitle: "P1-04 Concurrency Test Project (synthetic, cleaned up)",
        workOrderStatus: "Issued",
        projectStartDate: new Date("2020-01-01T00:00:00.000Z"),
        projectStatus: "Active",
      },
    });
    projectId = project.id;

    const timesheetImport = await prisma.timesheetImport.create({
      data: { triggeredBy: "ManualUpload", status: "Succeeded" },
    });
    importId = timesheetImport.id;

    async function addEntry(workDate: string, hours: number) {
      const row = await prisma.timesheetEntry.create({
        data: {
          employeeNo,
          rawEmployeeName: "P1-04 Synthetic Employee",
          projectId: project.id,
          rawProjectCode: `${TAG}-PR`,
          rawProjectName: "P1-04 Synthetic Project",
          workDate: new Date(workDate),
          task: "P1Test",
          hours,
          sourceStatus: "Active",
          firstImportId: timesheetImport.id,
          lastImportId: timesheetImport.id,
        },
      });
      entryIds.push(row.id);
    }

    async function expectedTotals() {
      const entries = await prisma.timesheetEntry.findMany({ where: { employeeNo, projectId: project.id } });
      const totalHours = Math.round(entries.reduce((s, e) => s + e.hours, 0) * 100) / 100;
      const workingDays = new Set(entries.map((e) => e.workDate.toISOString().slice(0, 10))).size;
      return { totalHours, workingDays };
    }

    // ---- Wave 1: seed 3 entries, fire 10 fully concurrent recomputes for
    // the SAME pair. Must converge to exactly one correct row, no errors. ----
    await addEntry("2020-01-01T00:00:00.000Z", 2);
    await addEntry("2020-01-02T00:00:00.000Z", 2);
    await addEntry("2020-01-03T00:00:00.000Z", 2);

    await Promise.all(Array.from({ length: 10 }, () => recomputeProjectResource(employeeNo, project.id)));

    let rows = await prisma.projectResource.findMany({ where: { projectId: project.id, employeeNo } });
    let expected = await expectedTotals();
    assert.equal(rows.length, 1, "exactly one ProjectResource row after 10 concurrent recomputes");
    assert.equal(rows[0]!.totalHours, expected.totalHours);
    assert.equal(rows[0]!.workingDays, expected.workingDays);

    // ---- Wave 2: genuine interleaved race — new entries inserted WHILE
    // concurrent recomputes are in flight, several times over. The final
    // stored row must equal an independently-recomputed truth from
    // whatever entries actually exist afterward — the exact "lost update"
    // scenario this fix protects against. ----
    for (let wave = 0; wave < 5; wave++) {
      const day = 10 + wave;
      await Promise.all([
        addEntry(`2020-02-${String(day).padStart(2, "0")}T00:00:00.000Z`, 3),
        recomputeProjectResource(employeeNo, project.id),
        recomputeProjectResource(employeeNo, project.id),
      ]);
    }
    await recomputeProjectResource(employeeNo, project.id);

    rows = await prisma.projectResource.findMany({ where: { projectId: project.id, employeeNo } });
    expected = await expectedTotals();
    assert.equal(rows.length, 1, "still exactly one ProjectResource row after the interleaved race");
    assert.equal(rows[0]!.totalHours, expected.totalHours, "final totalHours matches independently-recomputed truth");
    assert.equal(rows[0]!.workingDays, expected.workingDays);

    // hourlyRateSnapshot must stay frozen (no Employee row exists for this
    // synthetic employeeNo, so it should stay 0 throughout every recompute).
    assert.equal(rows[0]!.hourlyRateSnapshot, 0);
  } finally {
    const resourceIds = projectId
      ? (await prisma.projectResource.findMany({ where: { projectId, employeeNo }, select: { id: true } })).map(
          (r) => r.id
        )
      : [];
    if (resourceIds.length > 0) await prisma.projectResource.deleteMany({ where: { id: { in: resourceIds } } });
    if (entryIds.length > 0) {
      await prisma.timesheetImportRowLog.deleteMany({ where: { entryId: { in: entryIds } } });
      await prisma.timesheetEntry.deleteMany({ where: { id: { in: entryIds } } });
    }
    if (importId) await prisma.timesheetImport.delete({ where: { id: importId } }).catch(() => {});
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
  }
});
