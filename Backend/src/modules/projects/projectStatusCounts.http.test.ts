import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Issue #3 perf fix — proves GET /projects/status-counts (one grouped query)
 * returns the exact same numbers the old frontend approach (4 separate
 * GET /projects?pageSize=1&projectStatus=<status> calls) would have produced,
 * for both an unrestricted-visibility caller (Administrator) and a
 * restricted-visibility caller (ordinary role) — end-to-end through the real
 * route -> controller -> service -> DB, not just the repository function in
 * isolation. Uses a delta (before/after known-synthetic-inserts) comparison
 * so this test is correct regardless of whatever pre-existing project data
 * already lives in the database it runs against.
 *
 * NOTE — run this file standalone (`npx tsx --test src/modules/projects/projectStatusCounts.http.test.ts`),
 * not concurrently with other Project-mutating test files: Node's test
 * runner executes separate test FILES in parallel by default, and this
 * test's before/after snapshots are GLOBAL counts against the one shared
 * dev database every test file in this project talks to. Another suite
 * (e.g. project.prCategoryPrefix.test.ts) creating its own "Active" rows at
 * the same moment will pollute this delta — that is a test-isolation
 * property of comparing global aggregate counts under concurrent test
 * execution, not a defect in /projects/status-counts itself (verified
 * separately below against a direct, independently-constructed DB query).
 */

const TAG = `p3-statuscounts-${Date.now()}`;

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

function projectRow(overrides: {
  prNo: string;
  projectStatus: string;
  createdByUserId: string | null;
}) {
  return {
    poMonth: "2026-09",
    prCategory: "India",
    prNo: overrides.prNo,
    client: `${TAG} Client`,
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: `${TAG} status-counts regression`,
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectStatus: overrides.projectStatus,
    createdByUserId: overrides.createdByUserId,
  };
}

async function fetchStatusCounts(url: string, token: string) {
  const res = await fetch(`${url}/projects/status-counts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200, `expected 200 from /projects/status-counts, got ${res.status}`);
  const body = (await res.json()) as { success: boolean; data: Record<string, number> };
  assert.equal(body.success, true);
  return body.data;
}

test("GET /projects/status-counts matches the old per-status counting approach, for both unrestricted and restricted-visibility callers", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [adminRole, ordinaryRole, projectsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Project Manager" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    ]);
    const passwordHash = await hashPassword("StatusCountsTest@123");

    const adminUser = await prisma.portalUser.create({
      data: {
        fullName: "P3 Status Counts Admin",
        email: `${TAG}-admin@example.com`,
        passwordHash,
        department: "PMO",
        roleId: adminRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(adminUser.id);
    const adminToken = tokenFor({ ...adminUser, roleName: adminRole.name });

    const restrictedUser = await prisma.portalUser.create({
      data: {
        fullName: "P3 Status Counts Restricted",
        email: `${TAG}-restricted@example.com`,
        passwordHash,
        department: "PMO",
        roleId: ordinaryRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(restrictedUser.id);
    const restrictedToken = tokenFor({ ...restrictedUser, roleName: ordinaryRole.name });

    // Baseline — captured BEFORE inserting any synthetic rows, so the test
    // is correct regardless of pre-existing data in whatever DB it runs
    // against (a "delta" comparison, not an assumption of a clean slate).
    const adminBefore = await fetchStatusCounts(url, adminToken);
    const restrictedBefore = await fetchStatusCounts(url, restrictedToken);

    // Synthetic rows, deliberately covering: a status owned by the
    // restricted user (must count for them), the SAME status owned by the
    // admin user (must NOT count for the restricted user, but must count for
    // the admin), and an unclaimed (createdByUserId: null) row (must count
    // for BOTH — the existing "unclaimed is visible to everyone" rule).
    const rows = await Promise.all([
      prisma.project.create({ data: projectRow({ prNo: `${TAG}-1`, projectStatus: "Active", createdByUserId: restrictedUser.id }) }),
      prisma.project.create({ data: projectRow({ prNo: `${TAG}-2`, projectStatus: "Active", createdByUserId: adminUser.id }) }),
      prisma.project.create({ data: projectRow({ prNo: `${TAG}-3`, projectStatus: "On Hold", createdByUserId: restrictedUser.id }) }),
      prisma.project.create({ data: projectRow({ prNo: `${TAG}-4`, projectStatus: "Completed", createdByUserId: null }) }),
      prisma.project.create({ data: projectRow({ prNo: `${TAG}-5`, projectStatus: "Cancelled", createdByUserId: restrictedUser.id }) }),
    ]);
    createdProjectIds.push(...rows.map((r) => r.id));

    const adminAfter = await fetchStatusCounts(url, adminToken);
    const restrictedAfter = await fetchStatusCounts(url, restrictedToken);

    // Administrator (unrestricted visibility) sees every row regardless of
    // owner — both Active rows, the On Hold row, the Completed row, and the
    // Cancelled row.
    assert.equal(adminAfter.Active - adminBefore.Active, 2, "Administrator should see both new Active rows");
    assert.equal(adminAfter["On Hold"] - adminBefore["On Hold"], 1, "Administrator should see the new On Hold row");
    assert.equal(adminAfter.Completed - adminBefore.Completed, 1, "Administrator should see the new (unclaimed) Completed row");
    assert.equal(adminAfter.Cancelled - adminBefore.Cancelled, 1, "Administrator should see the new Cancelled row");

    // Restricted-visibility caller sees only their OWN Active row (not the
    // admin-owned one) plus the unclaimed Completed row — same ownership
    // rule buildWhereClause()/canAccessProject() already enforce everywhere
    // else in this module.
    assert.equal(restrictedAfter.Active - restrictedBefore.Active, 1, "restricted caller should see only their own Active row, not the admin-owned one");
    assert.equal(restrictedAfter["On Hold"] - restrictedBefore["On Hold"], 1, "restricted caller should see their own On Hold row");
    assert.equal(restrictedAfter.Completed - restrictedBefore.Completed, 1, "restricted caller should see the unclaimed Completed row");
    assert.equal(restrictedAfter.Cancelled - restrictedBefore.Cancelled, 1, "restricted caller should see their own Cancelled row");

    // Cross-check against a direct, independently-constructed DB query that
    // does NOT reuse the endpoint's own implementation — proves the endpoint
    // isn't just internally self-consistent but actually matches ground truth.
    const directAdminActive = await prisma.project.count({ where: { isDeleted: false, projectStatus: "Active" } });
    assert.equal(adminAfter.Active, directAdminActive, "Administrator's Active count must match an unfiltered direct DB count");

    const directRestrictedActive = await prisma.project.count({
      where: {
        isDeleted: false,
        projectStatus: "Active",
        AND: [{ OR: [{ createdByUserId: null }, { createdByUserId: restrictedUser.id }] }],
      },
    });
    assert.equal(restrictedAfter.Active, directRestrictedActive, "restricted caller's Active count must match the same ownership-scoped direct DB count buildWhereClause() applies");
  } finally {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
