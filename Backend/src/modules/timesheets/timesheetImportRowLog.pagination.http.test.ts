import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { createRowLogs } from "./repository/timesheetImportRowLog.repository.js";
import type { RowLogEntry } from "./timesheet.types.js";

/**
 * Final-audit finding — findRowLogsByImportId() paginated with
 * `orderBy: { createdAt: "asc" }` alone, which is not deterministic when
 * many rows share one createdAt. This is the REAL, not contrived, failure
 * mode: createRowLogs() bulk-inserts a whole import's row logs in one
 * createMany() call inside a shared transaction, and Postgres's now() is
 * frozen at transaction start — so every row-log entry from one import
 * genuinely gets the identical createdAt. This test reproduces that exact
 * mechanism (a real transaction + the real createRowLogs() function, not a
 * hand-set timestamp) with a small (10-row) fixture, then proves pagination
 * through the real HTTP endpoint is stable. Clearly-marked synthetic data,
 * cleaned up by exact collected ID in a finally block.
 */

const TAG = `rowlog-page-${Date.now()}`;

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

test("GET /timesheets/imports/:id/rows paginates deterministically even when every row shares one createdAt", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  let importId: string | null = null;

  try {
    const [adminRole, timesheetsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Timesheets" } }),
    ]);
    const passwordHash = await hashPassword("RowLogPageTest@123");
    const user = await prisma.portalUser.create({
      data: {
        fullName: "RowLog Pagination Admin",
        email: `${TAG}@example.com`,
        passwordHash,
        department: "PMO",
        roleId: adminRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: timesheetsModule.id } },
      },
    });
    createdUserIds.push(user.id);
    const token = tokenFor({ ...user, roleName: adminRole.name });

    const timesheetImport = await prisma.timesheetImport.create({
      data: { triggeredBy: "ManualUpload", status: "Succeeded" },
    });
    importId = timesheetImport.id;

    // 10 distinct row-log entries (distinguishable by rawEmployeeNo), all
    // created via the REAL production function inside one shared
    // transaction — this is what actually produces the identical-createdAt
    // condition in real imports, not a hand-set timestamp.
    const rows: RowLogEntry[] = Array.from({ length: 10 }, (_, i) => ({
      entryId: null,
      rawEmployeeNo: `${TAG}-EMP-${i}`,
      rawProjectCode: `${TAG}-PR`,
      workDate: new Date("2020-01-01T00:00:00.000Z"),
      task: "PaginationFixture",
      previousHours: null,
      newHours: 1,
      outcome: "Unchanged",
      failureReason: null,
    }));
    await prisma.$transaction(async (tx) => {
      await createRowLogs(tx, timesheetImport.id, rows);
    });

    // Sanity-check the premise: every row in this fixture really does share
    // one createdAt — if this ever stops being true (e.g. a future Postgres
    // or Prisma behavior change), the test should say so plainly rather
    // than silently passing for the wrong reason.
    const distinctTimestamps = await prisma.timesheetImportRowLog.groupBy({
      by: ["createdAt"],
      where: { importId: timesheetImport.id },
    });
    assert.equal(
      distinctTimestamps.length,
      1,
      "test premise failed: fixture rows do not share one createdAt — this test would not be exercising the real bug condition"
    );

    const headers = { Authorization: `Bearer ${token}` };
    const get = (page: number, pageSize: number) =>
      fetch(`${url}/timesheets/imports/${timesheetImport.id}/rows?page=${page}&pageSize=${pageSize}`, { headers });

    // ---- Fetch all 4 pages of pageSize=3 (10 rows -> pages of 3,3,3,1). ----
    const pageSize = 3;
    const responses = await Promise.all([get(1, pageSize), get(2, pageSize), get(3, pageSize), get(4, pageSize)]);
    for (const r of responses) assert.equal(r.status, 200);
    const bodies = await Promise.all(responses.map((r) => r.json()));

    const allIds: string[] = [];
    for (const [i, body] of bodies.entries()) {
      assert.equal(body.data.total, 10, `page ${i + 1} reports the correct total`);
      assert.equal(body.data.page, i + 1);
      assert.equal(body.data.pageSize, pageSize);
      for (const item of body.data.items) allIds.push(item.id);
    }
    assert.equal(bodies[0].data.items.length, 3);
    assert.equal(bodies[1].data.items.length, 3);
    assert.equal(bodies[2].data.items.length, 3);
    assert.equal(bodies[3].data.items.length, 1);

    // 1. No duplicate IDs across pages.
    const uniqueIds = new Set(allIds);
    assert.equal(uniqueIds.size, allIds.length, `expected no duplicate ids across pages, got ${JSON.stringify(allIds)}`);

    // 2. Combining every page reproduces exactly the fixture's own rows —
    // nothing duplicated, nothing missing.
    const fixtureRows = await prisma.timesheetImportRowLog.findMany({ where: { importId: timesheetImport.id } });
    const fixtureIds = new Set(fixtureRows.map((r) => r.id));
    assert.deepEqual(uniqueIds, fixtureIds, "combined pages must equal exactly the fixture's own row set");

    // 3. Deterministic ordering — repeating the exact same page request
    // must return the exact same ids in the exact same order every time.
    const [repeat1, repeat2, repeat3] = await Promise.all([get(1, pageSize), get(1, pageSize), get(1, pageSize)]);
    const [b1, b2, b3] = await Promise.all([repeat1.json(), repeat2.json(), repeat3.json()]);
    const idsOf = (b: any) => b.data.items.map((i: any) => i.id);
    assert.deepEqual(idsOf(b1), idsOf(b2), "repeated identical page requests must return identical ordering");
    assert.deepEqual(idsOf(b2), idsOf(b3), "repeated identical page requests must return identical ordering");
  } finally {
    if (importId) {
      await prisma.timesheetImportRowLog.deleteMany({ where: { importId } });
      await prisma.timesheetImport.delete({ where: { id: importId } });
    }
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
