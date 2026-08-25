import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../../../shared/utils/prismaClient.js";
import { getTimesheetPendingProjects, assertActiveProjectCountWithinCap } from "./timesheetPending.service.js";
import { TIMESHEET_PENDING_PROJECT_FETCH_CAP } from "../repository/timesheetPending.repository.js";

/**
 * P2-01 (production scalability hardening) — findActiveProjectsForPendingCheck()
 * (backing both GET /timesheets/pending-projects and Dashboard's own
 * timesheetPending section) had no `take` at all. Fixed the same way
 * dashboard.repository.ts's DASHBOARD_PROJECT_FETCH_CAP already was (P1-05):
 * a generous CAP+1 fetch bound, throwing loudly instead of ever silently
 * computing Pending status from an incomplete active-project set.
 */

const TAG = `pending-scale-p2ops-${Date.now()}`;

function projectPayload(prNo: string, createdByUserId: string | null): Parameters<typeof prisma.project.create>[0]["data"] {
  return {
    poMonth: "2026-08",
    prCategory: "India",
    prNo,
    client: "P2-01 Scale Probe",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "P2-01 active-project scale probe",
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

test("P2-01 — assertActiveProjectCountWithinCap: exact cap is fine, cap+1 throws loudly", () => {
  assert.doesNotThrow(() => assertActiveProjectCountWithinCap(5, 5));
  assert.doesNotThrow(() => assertActiveProjectCountWithinCap(0, 5));
  assert.throws(
    () => assertActiveProjectCountWithinCap(6, 5),
    (err: unknown) => err instanceof Error && /more than 5 active authorized projects exist/.test(err.message)
  );
});

test("P2-01 — getTimesheetPendingProjects: correctness with ownership scoping, deleted-exclusion, non-Active exclusion", async () => {
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [engineerRole] = await Promise.all([prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } })]);
    const owner = await prisma.portalUser.create({
      data: {
        fullName: "P2-01 Scale Owner",
        email: `${TAG}-owner@example.com`,
        passwordHash: "x",
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(owner.id);

    const stranger = await prisma.portalUser.create({
      data: {
        fullName: "P2-01 Scale Stranger",
        email: `${TAG}-stranger@example.com`,
        passwordHash: "x",
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(stranger.id);

    // Old enough to be PENDING (>7 days since tracking would start "today").
    const pendingProject = await prisma.project.create({ data: projectPayload(`${TAG}-PENDING`, owner.id) });
    createdProjectIds.push(pendingProject.id);
    // Backdate its tracking-start so it's unambiguously PENDING without
    // waiting or needing a real TimesheetEntry.
    await prisma.project.update({
      where: { id: pendingProject.id },
      data: { timesheetPendingTrackingStartedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });

    // A different owner's project must never appear for `owner`.
    const strangersProject = await prisma.project.create({ data: projectPayload(`${TAG}-STRANGER`, stranger.id) });
    createdProjectIds.push(strangersProject.id);
    await prisma.project.update({
      where: { id: strangersProject.id },
      data: { timesheetPendingTrackingStartedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });

    // A soft-deleted project must never appear even though it's "Active".
    const deletedProject = await prisma.project.create({ data: projectPayload(`${TAG}-DELETED`, owner.id) });
    createdProjectIds.push(deletedProject.id);
    await prisma.project.update({
      where: { id: deletedProject.id },
      data: { isDeleted: true, timesheetPendingTrackingStartedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    });

    // A Completed project must never appear even though it's not deleted.
    const completedProject = await prisma.project.create({
      data: { ...projectPayload(`${TAG}-COMPLETED`, owner.id), projectStatus: "Completed" },
    });
    createdProjectIds.push(completedProject.id);

    const results = await getTimesheetPendingProjects(owner.id);
    const prNos = results.map((r) => r.prNo);

    assert.ok(prNos.includes(`${TAG}-PENDING`), "owner's own pending project must appear");
    assert.ok(!prNos.includes(`${TAG}-STRANGER`), "another user's project must never appear");
    assert.ok(!prNos.includes(`${TAG}-DELETED`), "a soft-deleted project must never appear");
    assert.ok(!prNos.includes(`${TAG}-COMPLETED`), "a non-Active project must never appear");
  } finally {
    if (createdProjectIds.length > 0) {
      await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  }
});

test("P2-01 — LOAD: 12,000 synthetic active projects are returned completely and correctly, with measured timing", async () => {
  const N = 12_000;
  const createdProjectIds: string[] = [];

  try {
    const batch = Array.from({ length: N }, (_, i) => projectPayload(`${TAG}-LOAD-${i}`, null));
    const createStart = Date.now();
    // createMany in chunks — a single 12k-row INSERT is fine for Postgres,
    // but chunking keeps this robust against any statement-size caution.
    const CHUNK = 2000;
    for (let i = 0; i < batch.length; i += CHUNK) {
      await prisma.project.createMany({ data: batch.slice(i, i + CHUNK) });
    }
    const createMs = Date.now() - createStart;

    const created = await prisma.project.findMany({
      where: { prNo: { startsWith: `${TAG}-LOAD-` } },
      select: { id: true },
    });
    createdProjectIds.push(...created.map((p) => p.id));
    assert.equal(createdProjectIds.length, N, "fixture setup must have created exactly N rows");

    // Force every synthetic project to be genuinely PENDING (not just
    // "recently created" -> CURRENT under the 7-day rule), so the
    // production business-rule filter doesn't remove them from the count
    // this assertion cares about — a realistic "everything is overdue"
    // worst-case scenario, not an artifact of fixture freshness.
    const overdueDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (let i = 0; i < createdProjectIds.length; i += 2000) {
      await prisma.project.updateMany({
        where: { id: { in: createdProjectIds.slice(i, i + 2000) } },
        data: { timesheetPendingTrackingStartedAt: overdueDate },
      });
    }

    // Administrator-equivalent (callerUserId undefined) — no ownership
    // filter — measures the true worst-case query the real endpoint runs.
    const queryStart = Date.now();
    const results = await getTimesheetPendingProjects(undefined);
    const queryMs = Date.now() - queryStart;

    const ours = results.filter((r) => r.prNo.startsWith(`${TAG}-LOAD-`));
    assert.equal(ours.length, N, "all 12,000 synthetic active projects must be present — no silent truncation");
    assert.ok(N <= TIMESHEET_PENDING_PROJECT_FETCH_CAP, "sanity: this load size must stay under the safety cap");

    console.log(
      `[P2-01 LOAD] created ${N} projects in ${createMs}ms; getTimesheetPendingProjects() over ${N}+ active projects took ${queryMs}ms`
    );
  } finally {
    if (createdProjectIds.length > 0) {
      for (let i = 0; i < createdProjectIds.length; i += 2000) {
        await prisma.project.deleteMany({ where: { id: { in: createdProjectIds.slice(i, i + 2000) } } });
      }
    }
  }
});
