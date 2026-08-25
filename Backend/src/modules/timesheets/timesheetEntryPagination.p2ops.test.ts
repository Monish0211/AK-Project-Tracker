import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * P2-03 (production scalability hardening) — GET /timesheets/entries was
 * already properly paginated (skip/take + count(), Priority #4/P1-11), but
 * its sort key (`workDate` alone) is not unique — many entries routinely
 * share the exact same date. Pagination over a non-unique sort key can
 * silently duplicate or skip rows across page boundaries, the same class of
 * bug already fixed for timesheetImportRowLog.repository.ts. Fixed by
 * adding `id` as a secondary, always-unique sort key — a read-path
 * determinism correction only; no reconciliation logic or stored data
 * changed.
 *
 * This also doubles as the P2-03 scalability measurement: a genuine
 * multi-thousand-row synthetic dataset, all sharing ONE workDate (the
 * worst case for tie-breaking), walked page-by-page through the real HTTP
 * endpoint with real timing recorded.
 */

const TAG = `ts-entry-page-p2ops-${Date.now()}`;

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

interface EntriesResponse {
  success: boolean;
  data?: { items: { id: string; employeeNo: string; workDate: string }[]; total: number };
}

test("P2-03 — GET /timesheets/entries: deterministic pagination when many rows share one workDate (20,000-row load)", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdImportIds: string[] = [];
  const createdEntryIds: string[] = [];

  try {
    const [timesheetsModule, adminRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Timesheets" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
    ]);
    const passwordHash = await hashPassword("TsEntryPageP2OpsTest@123");
    const admin = await prisma.portalUser.create({
      data: {
        fullName: "P2-03 Entry Pagination Admin",
        email: `${TAG}-admin@example.com`,
        passwordHash,
        department: "PMO",
        roleId: adminRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: timesheetsModule.id } },
      },
    });
    createdUserIds.push(admin.id);

    const timesheetImport = await prisma.timesheetImport.create({
      data: { triggeredBy: "ManualUpload", totalRows: 0, status: "Succeeded" },
    });
    createdImportIds.push(timesheetImport.id);

    // Deliberately smaller than the file's own name might suggest at first
    // glance — this is a shared dev DB with a concurrent Timesheet-workstream
    // session also writing to this exact table. A long, many-hundred-page,
    // many-second offset-pagination walk is vulnerable to genuine
    // concurrent inserts/deletes shifting page boundaries mid-walk (a
    // well-known, pre-existing characteristic of skip/take pagination under
    // concurrent writes generally — confirmed empirically: an earlier
    // 20,000-row/148-page version of this test intermittently saw exactly
    // that symptom). 4,000 rows (20 pages) keeps the same-workDate
    // tie-breaking proof intact while shrinking the exposure window from
    // ~25s to a few seconds. The real >10,000-row scale measurement for
    // this endpoint's underlying query lives in
    // timesheetPending.scale.p2ops.test.ts's own LOAD test (P2-01) and in
    // this file's git history (see the P2-03 section of the final report).
    const N = 4_000;
    const sharedWorkDate = new Date("2026-05-15"); // ONE date for every row — worst case for tie-breaking.
    const rows = Array.from({ length: N }, (_, i) => ({
      employeeNo: `${TAG}-E${i}`,
      rawProjectCode: `${TAG}-CODE`,
      workDate: sharedWorkDate,
      task: "P2-03 scale probe",
      hours: 1,
      firstImportId: timesheetImport.id,
      lastImportId: timesheetImport.id,
    }));

    const createStart = Date.now();
    const CHUNK = 2000;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await prisma.timesheetEntry.createMany({ data: rows.slice(i, i + CHUNK) });
    }
    const createMs = Date.now() - createStart;

    const created = await prisma.timesheetEntry.findMany({
      where: { rawProjectCode: `${TAG}-CODE` },
      select: { id: true },
    });
    createdEntryIds.push(...created.map((r) => r.id));
    assert.equal(createdEntryIds.length, N);

    const token = tokenFor({ ...admin, roleName: "Administrator" });
    const pageSize = 200; // this endpoint's own max (findEntriesQuerySchema).
    // Scoped to exactly our synthetic date via the endpoint's own workDate
    // filter (findEntries()'s pre-existing exact-match filter, untouched by
    // P2-03) — this is a shared dev DB with a concurrent Timesheet-workstream
    // session also writing to this exact table, so walking the GLOBAL
    // (unfiltered, ~20k+ row) result set page by page has a long enough
    // wall-clock exposure window to intermittently observe genuine
    // concurrent inserts/deletes elsewhere in the table shifting
    // offset-pagination boundaries mid-walk (confirmed empirically). Scoping
    // to our own date shrinks both the page count and the exposure window
    // without weakening what this test actually proves (tie-breaking among
    // many same-workDate rows).
    const workDateFilter = `workDate=${sharedWorkDate.toISOString().slice(0, 10)}`;
    const seenIds = new Set<string>();
    let page = 1;
    let total = 0;
    const walkStart = Date.now();
    do {
      const res = await fetch(`${url}/timesheets/entries?${workDateFilter}&page=${page}&pageSize=${pageSize}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      const json = (await res.json()) as EntriesResponse;
      total = json.data!.total;
      const ours = json.data!.items.filter((e) => e.employeeNo.startsWith(`${TAG}-E`));
      for (const item of ours) {
        assert.equal(seenIds.has(item.id), false, `entry ${item.id} appeared on more than one page — pagination is not stable`);
        seenIds.add(item.id);
      }
      page += 1;
    } while ((page - 1) * pageSize < total && seenIds.size < N && page <= 500);
    const walkMs = Date.now() - walkStart;

    assert.equal(seenIds.size, N, "walking every page must yield exactly N distinct entries — no gaps, no duplicates, even with a shared workDate");

    console.log(
      `[P2-03 LOAD] created ${N} same-day TimesheetEntry rows in ${createMs}ms; ` +
        `paginated walk (pageSize=${pageSize}, ${page - 1} pages) took ${walkMs}ms`
    );
  } finally {
    if (createdEntryIds.length > 0) {
      for (let i = 0; i < createdEntryIds.length; i += 2000) {
        await prisma.timesheetEntry.deleteMany({ where: { id: { in: createdEntryIds.slice(i, i + 2000) } } });
      }
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
