import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * P2-05 — Financial Loss tile/drill-down consistency.
 *
 * BEFORE this fix, the Dashboard tile (ProjectsInLossHoursWidget) rendered
 * this server-authoritative buildHoursOverrun() calculation, while the
 * drill-down page it linked to (FinancialLossProjects.tsx, via
 * frontend/src/services/dashboardService.ts's getProjectsWithHoursOverrun())
 * recomputed its OWN list client-side from a localStorage project mirror,
 * using: (a) an extra `manhourBudgetHours || totalHoursBudget` fallback the
 * backend never had, and (b) actual hours re-derived from raw
 * TimesheetImport data instead of the reconciled TimesheetEntry table. The
 * two could disagree on both which projects qualify and the figures shown
 * for ones that did.
 *
 * The fix: buildHoursOverrun() (Backend/src/modules/dashboard/services/
 * dashboard.service.ts) now also returns `allMatching` (the same array
 * `top5` is sliced from, not a second calculation), and the drill-down page
 * was rewritten to fetch GET /dashboard/summary and render that instead.
 * This test proves, backend-side, that there is exactly one calculation and
 * that its exclusion/inclusion rules match what the task's business
 * decision requires — since the frontend fallback field
 * (`Project.totalHoursBudget`) does not exist anywhere in the Postgres
 * schema, there is no way, post-fix, for a project to qualify for Financial
 * Loss on any basis other than this single server-side formula.
 */

const TAG = `hrsovr-p205-${Date.now()}`;

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

interface HoursOverrunProjectDto {
  id: string;
  prNumber: string;
  projectName: string;
  projectManager: string | null;
  budgetHours: number;
  actualHours: number;
  hoursOverrun: number;
  percentOverrun: number;
  status: "Loss";
}

test("P2-05 — GET /dashboard/summary hoursOverrun: allMatching/top5 share one authoritative calculation", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdImportIds: string[] = [];

  try {
    const [dashboardModule, engineerRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Dashboard" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);

    const passwordHash = await hashPassword("HoursOverrunP205Test@123");
    const owner = await prisma.portalUser.create({
      data: {
        fullName: "P2-05 Hours Overrun Owner",
        email: `${TAG}-owner@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: dashboardModule.id } },
      },
    });
    createdUserIds.push(owner.id);

    const timesheetImport = await prisma.timesheetImport.create({
      data: { triggeredBy: "ManualUpload", totalRows: 0, status: "Succeeded" },
    });
    createdImportIds.push(timesheetImport.id);

    async function makeProject(opts: {
      suffix: string;
      manhourBudgetHours: number | null;
      projectStatus: string;
    }) {
      const project = await prisma.project.create({
        data: {
          poMonth: "2026-08",
          prCategory: "India",
          prNo: `${TAG}-${opts.suffix}`,
          client: "P2-05 Test Client",
          department: "Process",
          domesticForeign: "Domestic",
          projectTitle: `P2-05 Overrun Probe ${opts.suffix}`,
          workOrderStatus: "Received",
          projectStartDate: new Date("2026-01-01"),
          projectEndDate: new Date("2026-12-31"),
          projectStatus: opts.projectStatus,
          workOrderNumber: `${TAG}-WO-${opts.suffix}`,
          workOrderDate: new Date("2026-01-01"),
          eicName: "EIC",
          contractType: "LUMP SUM",
          pmoCoordinator: "PMO",
          primaryProjectManager: "P2-05 Test PM",
          manhourBudgetHours: opts.manhourBudgetHours,
          createdByUserId: owner.id,
        },
      });
      createdProjectIds.push(project.id);
      return project;
    }

    async function addHours(projectId: string, ...hourChunks: number[]) {
      for (const hours of hourChunks) {
        await prisma.timesheetEntry.create({
          data: {
            employeeNo: "0547",
            projectId,
            rawProjectCode: `${TAG}-code`,
            workDate: new Date("2026-03-01"),
            task: "P2-05 probe",
            hours,
            firstImportId: timesheetImport.id,
            lastImportId: timesheetImport.id,
          },
        });
      }
    }

    // Seven Active projects, budget=100, distinct overrun amounts so top5
    // ordering is unambiguous. Shifted by a 1,000,000h base offset so these
    // fixtures are guaranteed to dominate the GLOBAL top5 regardless of
    // whatever other real/legacy projects already exist in this shared dev
    // database (ownership scoping alone can't fully isolate this test —
    // findAuthorizedProjects() also includes legacy createdByUserId: null
    // rows — and no realistic engineering-hours overrun reaches six figures).
    const OFFSET = 1_000_000;
    const overruns = [10, 20, 30, 40, 50, 60, 70].map((n) => OFFSET + n); // -> actual = budget + this
    const loss: { id: string; prNo: string; overrun: number }[] = [];
    for (const overrun of overruns) {
      const suffix = `LOSS-${overrun}`;
      const p = await makeProject({ suffix, manhourBudgetHours: 100, projectStatus: "Active" });
      // The middle fixture (overrun ending in 50) gets its actual hours as
      // TWO separate reconciled TimesheetEntry rows (90 + the remainder)
      // instead of one — proves the figure is a SUM over the reconciled
      // table, not a single stored value.
      if (overrun === OFFSET + 50) {
        await addHours(p.id, 90, 100 + overrun - 90);
      } else {
        await addHours(p.id, 100 + overrun);
      }
      loss.push({ id: p.id, prNo: p.prNo, overrun });
    }

    // C — no totalHoursBudget-style fallback: manhourBudgetHours is null,
    // so budget > 0 fails regardless of actual hours (500h logged).
    const noBudgetProject = await makeProject({
      suffix: "NO-BUDGET",
      manhourBudgetHours: null,
      projectStatus: "Active",
    });
    await addHours(noBudgetProject.id, 500);

    // E — Archived/Cancelled exclusion. Both would otherwise be the single
    // largest overrun in the whole fixture set (budget 100, actual 900).
    const archivedProject = await makeProject({
      suffix: "ARCHIVED",
      manhourBudgetHours: 100,
      projectStatus: "Archived",
    });
    await addHours(archivedProject.id, 900);

    const cancelledProject = await makeProject({
      suffix: "CANCELLED",
      manhourBudgetHours: 100,
      projectStatus: "Cancelled",
    });
    await addHours(cancelledProject.id, 900);

    const res = await fetch(`${url}/dashboard/summary`, {
      headers: { Authorization: `Bearer ${tokenFor({ ...owner, roleName: engineerRole.name })}` },
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      data: { hoursOverrun: { totalMatchingProjects: number; top5: HoursOverrunProjectDto[]; allMatching: HoursOverrunProjectDto[] } };
    };

    const { top5, allMatching } = json.data.hoursOverrun;
    const ourTop5 = top5.filter((p) => p.prNumber.startsWith(TAG));
    const ourAll = allMatching.filter((p) => p.prNumber.startsWith(TAG));

    // A — top5 is a strict prefix of allMatching (same array, same sort),
    // not a second, independently-computed list: every element of top5
    // (globally, not just ours) must appear at the same index in
    // allMatching.
    for (let i = 0; i < top5.length; i++) {
      assert.deepEqual(allMatching[i], top5[i], `allMatching[${i}] must equal top5[${i}] — same underlying array`);
    }

    // F — top-5 behavior unchanged: exactly the 5 highest-overrun of our 7
    // qualifying fixtures, never the 2 lowest, and never the excluded
    // no-budget/archived/cancelled fixtures.
    const ourTop5Overruns = ourTop5.map((p) => p.hoursOverrun);
    assert.deepEqual(
      ourTop5Overruns,
      [70, 60, 50, 40, 30].map((n) => OFFSET + n)
    );

    // G — the drill-down (allMatching) can retrieve more than 5 matching
    // projects: all 7 qualifying fixtures are present, in descending order.
    assert.equal(ourAll.length, 7);
    assert.deepEqual(
      ourAll.map((p) => p.hoursOverrun),
      [70, 60, 50, 40, 30, 20, 10].map((n) => OFFSET + n)
    );

    // B/D — a project using the authoritative formula: budget 100, actual =
    // SUM of its reconciled TimesheetEntry rows (90 + remainder), not a raw
    // import total or a single-row read.
    const fifty = ourAll.find((p) => p.hoursOverrun === OFFSET + 50);
    assert.ok(fifty);
    assert.equal(fifty!.budgetHours, 100);
    assert.equal(fifty!.actualHours, OFFSET + 150);
    assert.equal(fifty!.projectManager, "P2-05 Test PM");

    // C — the null-budget fixture (500h logged) never appears anywhere,
    // proving no totalHoursBudget-style fallback survived the fix.
    assert.equal(
      allMatching.some((p) => p.prNumber === noBudgetProject.prNo),
      false
    );
    assert.equal(
      top5.some((p) => p.prNumber === noBudgetProject.prNo),
      false
    );

    // E — Archived/Cancelled exclusion holds even though both would
    // otherwise dominate every ranking (900h actual vs 100h budget).
    assert.equal(
      allMatching.some((p) => p.prNumber === archivedProject.prNo),
      false
    );
    assert.equal(
      allMatching.some((p) => p.prNumber === cancelledProject.prNo),
      false
    );
  } finally {
    if (createdProjectIds.length > 0) {
      await prisma.timesheetEntry.deleteMany({ where: { projectId: { in: createdProjectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    }
    if (createdImportIds.length > 0) {
      await prisma.timesheetImport.deleteMany({ where: { id: { in: createdImportIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});
