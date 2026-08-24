import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * P1-17 — proves POST /projects is protected against the prNo TOCTOU race
 * end-to-end (route -> controller -> service -> DB partial unique index),
 * not just that the index exists in isolation. Uses its own clearly-marked
 * synthetic PortalUser/Project rows, cleaned up by exact collected ID in a
 * finally block.
 */

const TAG = `p17-${Date.now()}`;

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

function projectBody(prNo: string) {
  return {
    poMonth: "2026-08",
    prCategory: "India",
    prNo,
    client: "P1-17 Concurrency Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "P1-17 prNo uniqueness regression",
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01").toISOString(),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01").toISOString(),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
  };
}

test("POST /projects rejects a concurrent duplicate prNo (TOCTOU race closed by the DB constraint)", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [adminRole, projectsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    ]);
    const passwordHash = await hashPassword("PrNoRaceTest@123");
    const user = await prisma.portalUser.create({
      data: {
        fullName: "P1-17 Race Admin",
        email: `${TAG}@example.com`,
        passwordHash,
        department: "PMO",
        roleId: adminRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(user.id);
    const token = tokenFor({ ...user, roleName: adminRole.name });

    const prNo = `${TAG}-PR`;

    const post = () =>
      fetch(`${url}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(projectBody(prNo)),
      });

    // Fire two genuinely concurrent create requests for the SAME prNo —
    // this is the exact race the application-level pre-check alone cannot
    // close (both requests can pass the check before either commits).
    const [r1, r2] = await Promise.all([post(), post()]);
    const statuses = [r1.status, r2.status].sort();

    // Exactly one must succeed (201) and the other must be cleanly rejected
    // as a business conflict (409) — never both succeeding (would mean the
    // race is still open) and never a raw 500 (would mean P2002 leaked
    // instead of being translated to a friendly error).
    assert.deepEqual(statuses, [201, 409], `expected exactly one 201 and one 409, got ${JSON.stringify(statuses)}`);

    const [b1, b2] = await Promise.all([r1.json(), r2.json()]);
    const successBody = r1.status === 201 ? b1 : b2;
    createdProjectIds.push(successBody.data.id);

    // Only ONE row with this prNo must actually exist — the definitive
    // check, independent of HTTP status codes.
    const rows = await prisma.project.findMany({ where: { prNo } });
    assert.equal(rows.length, 1, "exactly one Project row must exist for this prNo after the race");
    for (const row of rows) if (!createdProjectIds.includes(row.id)) createdProjectIds.push(row.id);
  } finally {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});

test("Archiving a project frees its prNo for reuse by a new active project", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [adminRole, projectsModule] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
    ]);
    const passwordHash = await hashPassword("PrNoReuseTest@123");
    const user = await prisma.portalUser.create({
      data: {
        fullName: "P1-17 Reuse Admin",
        email: `${TAG}-reuse@example.com`,
        passwordHash,
        department: "PMO",
        roleId: adminRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(user.id);
    const token = tokenFor({ ...user, roleName: adminRole.name });
    const prNo = `${TAG}-REUSE-PR`;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    // Create the first project.
    const create1 = await fetch(`${url}/projects`, { method: "POST", headers, body: JSON.stringify(projectBody(prNo)) });
    assert.equal(create1.status, 201);
    const first = (await create1.json()).data;
    createdProjectIds.push(first.id);

    // A second, immediate create with the same prNo must be rejected while
    // the first is still active (confirms the constraint is live, not a
    // no-op) — sequential this time, not the race case above.
    const createDupe = await fetch(`${url}/projects`, { method: "POST", headers, body: JSON.stringify(projectBody(prNo)) });
    assert.equal(createDupe.status, 409);

    // Archive the first project directly at the data layer — this test's
    // target is the prNo-reuse business rule + DB constraint interaction,
    // not the Archive endpoint's own approval-permission gate (covered by
    // its own tests elsewhere), so isDeleted is set directly rather than
    // routing through a second permission system this test would otherwise
    // need to configure.
    await prisma.project.update({ where: { id: first.id }, data: { isDeleted: true, deletedAt: new Date() } });

    // Now the SAME prNo must be creatable again — archived projects free their prNo.
    const create2 = await fetch(`${url}/projects`, { method: "POST", headers, body: JSON.stringify(projectBody(prNo)) });
    assert.equal(create2.status, 201, "creating a new project with an archived project's prNo must succeed");
    const second = (await create2.json()).data;
    createdProjectIds.push(second.id);

    const rows = await prisma.project.findMany({ where: { prNo } });
    assert.equal(rows.length, 2, "both the archived original and the new active project must exist");
    const activeRows = rows.filter((r) => !r.isDeleted);
    assert.equal(activeRows.length, 1, "exactly one ACTIVE row with this prNo");
  } finally {
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
