import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { processTimesheetImport } from "./services/timesheet.service.js";
import { groupTimesheetHours } from "../dashboard/repository/dashboard.repository.js";
import type { ParsedTimesheetRow } from "./timesheet.types.js";

/**
 * Sept 2026 — Hours Overrun / Project Code fix. Reproduces the exact
 * production concern: a project code without a Job Number (e.g. "PR 12034")
 * must never be matched to a DIFFERENT project whose code carries a Job
 * Number (e.g. "PR-12034_01"), even though they share the same PR digits and
 * look like simple formatting variants of each other. This proves, against
 * the real reconciliation engine (processTimesheetImport) and the real
 * server-side aggregate (groupTimesheetHours) — never a client-side
 * recomputation — that:
 *
 *  1. The two codes resolve to two DIFFERENT TimesheetEntry.projectId values
 *     (never merged into one project's total).
 *  2. Every alternate spelling of the SAME Job-Numbered code ("PR-X_01",
 *     "PR X JOB NO 01") still resolves to that one project — proving the
 *     centralized normalizeProjectCode() is what's doing the matching, not
 *     an accidental one-off string comparison.
 *  3. groupTimesheetHours() — the exact aggregate buildHoursOverrun() uses
 *     for the Dashboard/Reports "Actual Hours" figure — reports each
 *     project's OWN total only, never the other project's hours added in.
 *  4. GET /dashboard/summary's hoursOverrun end-to-end for the Job-Numbered
 *     project reflects only its own actual hours against its own budget.
 */

const TAG = `pc-distinct-${Date.now()}`;
// Both project codes below share this same digit run, mirroring the
// production "PR 12034" vs "PR-12034_01" pair — only the presence of a Job
// Number differs.
const DIGITS = `9${Date.now()}`.slice(0, 10);

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

function row(overrides: Partial<ParsedTimesheetRow>): ParsedTimesheetRow {
  return {
    employeeNo: `${TAG}-EMP`,
    employeeName: "PC Distinctness Synthetic Employee",
    rawProjectCode: "",
    rawProjectName: "PC Distinctness Synthetic Project",
    workDate: new Date("2026-08-15T00:00:00.000Z"),
    task: "PC distinctness probe",
    hours: 1,
    sourceStatus: "Active",
    ...overrides,
  };
}

test("Timesheet import: a Job-Numbered project code never merges with the same PR digits' plain (no-Job-Number) code", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];
  const createdImportIds: string[] = [];

  try {
    const [engineerRole, dashboardModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Dashboard" } }),
    ]);
    const passwordHash = await hashPassword("PcDistinctTest@123");

    const owner = await prisma.portalUser.create({
      data: {
        fullName: "PC Distinctness Owner",
        email: `${TAG}-owner@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: dashboardModule.id } },
      },
    });
    createdUserIds.push(owner.id);

    async function makeProject(prNo: string, manhourBudgetHours: number | null) {
      const project = await prisma.project.create({
        data: {
          poMonth: "2026-08",
          prCategory: "India",
          prNo,
          client: "PC Distinctness Client",
          department: "Process",
          domesticForeign: "Domestic",
          projectTitle: `PC distinctness probe (${prNo})`,
          workOrderStatus: "Received",
          projectStartDate: new Date("2026-01-01"),
          projectEndDate: new Date("2026-12-31"),
          projectStatus: "Active",
          workOrderNumber: `${prNo}-WO`,
          workOrderDate: new Date("2026-01-01"),
          eicName: "EIC",
          contractType: "LUMP SUM",
          pmoCoordinator: "PMO",
          manhourBudgetHours,
          createdByUserId: owner.id,
        },
      });
      createdProjectIds.push(project.id);
      return project;
    }

    // Plain code, no Job Number — e.g. "PR 12034".
    const plainProject = await makeProject(`PR ${DIGITS}`, null);
    // Job-Numbered variant of the SAME digits — e.g. "PR-12034_01". Budget
    // set so its Hours Overrun figure can be checked end-to-end below.
    const jobProject = await makeProject(`PR-${DIGITS}_01`, 30);

    const rows: ParsedTimesheetRow[] = [
      // Plain project's own entries — must count ONLY toward plainProject.
      row({ rawProjectCode: `PR ${DIGITS}`, hours: 60, workDate: new Date("2026-08-01T00:00:00.000Z") }),
      row({ rawProjectCode: `PR ${DIGITS}`, hours: 40, workDate: new Date("2026-08-02T00:00:00.000Z") }),
      // Job-Numbered project's own entries, across two differently-spelled
      // but equivalent raw codes — both must count ONLY toward jobProject.
      row({ rawProjectCode: `PR-${DIGITS}_01`, hours: 20, workDate: new Date("2026-08-03T00:00:00.000Z") }),
      row({ rawProjectCode: `PR-${DIGITS}_01`, hours: 12.5, workDate: new Date("2026-08-04T00:00:00.000Z") }),
      row({ rawProjectCode: `PR ${DIGITS} JOB NO 01`, hours: 10, workDate: new Date("2026-08-05T00:00:00.000Z") }),
    ];

    const result = await processTimesheetImport(rows, { triggeredBy: "ManualUpload" });
    createdImportIds.push(result.importId);
    assert.equal(result.status, "Succeeded");
    assert.equal(result.createdCount, 5);

    // 1/2 — every row resolved to the CORRECT, DISTINCT project — never
    // Unassigned (a matching-rule failure) and never the other project (a
    // merge bug).
    const entries = await prisma.timesheetEntry.findMany({
      where: { firstImportId: result.importId },
      select: { rawProjectCode: true, projectId: true, hours: true },
    });
    assert.equal(entries.length, 5);
    for (const entry of entries) {
      if (entry.rawProjectCode === `PR ${DIGITS}`) {
        assert.equal(entry.projectId, plainProject.id, `"${entry.rawProjectCode}" must resolve to the plain project`);
      } else {
        assert.equal(entry.projectId, jobProject.id, `"${entry.rawProjectCode}" must resolve to the Job-Numbered project`);
      }
    }

    // 3 — groupTimesheetHours (the exact aggregate buildHoursOverrun() uses)
    // reports each project's own total only.
    const hoursByProject = await groupTimesheetHours([plainProject.id, jobProject.id]);
    assert.equal(hoursByProject.get(plainProject.id), 100, "plain project's actual hours must be its own 60+40=100, never 142.5");
    assert.equal(hoursByProject.get(jobProject.id), 42.5, "Job-Numbered project's actual hours must be its own 20+12.5+10=42.5, never 142.5");

    // 4 — end-to-end via GET /dashboard/summary: the Job-Numbered project's
    // Hours Overrun figure reflects only its own actual hours (42.5) against
    // its own budget (30) — never inflated by the plain project's 100 hours.
    const res = await fetch(`${url}/dashboard/summary`, {
      headers: { Authorization: `Bearer ${tokenFor({ ...owner, roleName: engineerRole.name })}` },
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      data: { hoursOverrun: { allMatching: { prNumber: string; budgetHours: number; actualHours: number; hoursOverrun: number }[] } };
    };
    const jobRow = json.data.hoursOverrun.allMatching.find((p) => p.prNumber === jobProject.prNo);
    assert.ok(jobRow, "Job-Numbered project must appear in Hours Overrun (42.5 actual > 30 budget)");
    assert.equal(jobRow!.budgetHours, 30);
    assert.equal(jobRow!.actualHours, 42.5);
    assert.equal(jobRow!.hoursOverrun, 12.5);

    // The plain project (no budget set) must never appear — proving its
    // hours were never folded into the Job-Numbered project's qualifying
    // total either (that would make plainProject's own absence irrelevant
    // but jobRow's actualHours wrong, already asserted above).
    assert.equal(
      json.data.hoursOverrun.allMatching.some((p) => p.prNumber === plainProject.prNo),
      false
    );
  } finally {
    if (createdProjectIds.length > 0) {
      const entries = await prisma.timesheetEntry.findMany({
        where: { projectId: { in: createdProjectIds } },
        select: { id: true },
      });
      const entryIds = entries.map((e) => e.id);
      if (entryIds.length > 0) {
        await prisma.timesheetImportRowLog.deleteMany({ where: { entryId: { in: entryIds } } });
        await prisma.timesheetEntry.deleteMany({ where: { id: { in: entryIds } } });
      }
      await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    }
    if (createdImportIds.length > 0) {
      await prisma.timesheetImportRowLog.deleteMany({ where: { importId: { in: createdImportIds } } });
      await prisma.timesheetImport.deleteMany({ where: { id: { in: createdImportIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});
