import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "../../shared/utils/prismaClient.js";
import { findNotesForProjects } from "./repository/dashboard.repository.js";

/**
 * P0 correctness fix (Sept 2026 perf/correctness audit) — findNotesForProjects()
 * used to be a single global `take: 40` ordered by createdAt desc, which could
 * starve a project's notes out entirely if 40+ OTHER projects had strictly
 * newer notes (confirmed on production data: 27 projects had notes, only 22
 * were represented, 5 got zero). This proves the per-project window-function
 * replacement is fair regardless of relative recency across projects.
 */

const TAG = `notes-p0-${Date.now()}`;

function projectPayload(prNo: string) {
  return {
    poMonth: "2026-01",
    prCategory: "India",
    prNo,
    client: "Notes Per Project Test Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "Notes per project regression",
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectEndDate: new Date("2026-12-31"),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
  };
}

test("findNotesForProjects() gives every project a fair per-project share, not a global top-N cut", async () => {
  const createdProjectIds: string[] = [];

  try {
    const [starvedProject, crowdingProject] = await Promise.all([
      prisma.project.create({ data: projectPayload(`${TAG}-starved`) }),
      prisma.project.create({ data: projectPayload(`${TAG}-crowding`) }),
    ]);
    createdProjectIds.push(starvedProject.id, crowdingProject.id);

    // starvedProject: exactly 1 note, old (2020) — would rank far outside a
    // global top-40 once crowded out below.
    const starvedNote = await prisma.projectNote.create({
      data: {
        projectId: starvedProject.id,
        message: "Only note on the starved project",
        createdBy: "Test Harness",
        createdAt: new Date("2020-01-01T00:00:00Z"),
      },
    });

    // crowdingProject: 45 notes, all strictly newer than starvedNote — under
    // the old `take: 40` global cut, ALL 40 of the returned rows would come
    // from this one project and starvedNote would never appear.
    const crowdingNotes = await Promise.all(
      Array.from({ length: 45 }, (_, i) =>
        prisma.projectNote.create({
          data: {
            projectId: crowdingProject.id,
            message: `Crowding note ${i}`,
            createdBy: "Test Harness",
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
          },
        })
      )
    );

    const result = await findNotesForProjects([starvedProject.id, crowdingProject.id]);

    // 1. The starved project must be represented — this is the actual bug fix.
    assert.ok(
      result.some((n) => n.id === starvedNote.id),
      "starved project's only note must still be returned despite 45 newer notes on another project"
    );

    // 2. Per-project cap: crowdingProject has 45 notes but only its newest 10
    // should come back (matches buildActivity()'s own final top-10 slice —
    // see dashboard.repository.ts's comment on findNotesForProjects()).
    const crowdingReturned = result.filter((n) => n.projectId === crowdingProject.id);
    assert.equal(crowdingReturned.length, 10, "crowding project must be capped at 10 notes, not all 45");
    const newestTenIds = new Set(
      [...crowdingNotes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 10).map((n) => n.id)
    );
    for (const row of crowdingReturned) {
      assert.ok(newestTenIds.has(row.id), "returned crowding-project notes must be its actual newest 10, not an arbitrary 10");
    }

    // 3. Overall ordering is still newest-first, as the previous implementation
    // guaranteed (buildActivity() re-sorts anyway, but no caller should regress).
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i - 1].createdAt.getTime() >= result[i].createdAt.getTime(), "result must remain ordered newest-first");
    }

    // 4. Total row count: 1 (starved) + 10 (crowding, capped) = 11 — proves no
    // N+1 blow-up (45 rows did NOT all come back) and no silent truncation
    // of the starved project either.
    assert.equal(result.length, 11);
  } finally {
    await prisma.projectNote.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
  }
});
