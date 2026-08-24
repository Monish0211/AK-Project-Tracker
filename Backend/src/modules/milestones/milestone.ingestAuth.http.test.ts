import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

const TAG = `ms-ingest-auth-${Date.now()}`;

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

function projectPayload(prNo: string) {
  return {
    poMonth: "2026-01",
    prCategory: "India",
    prNo,
    client: "Milestone Ingest Auth Regression Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "Milestone ingest authorization regression",
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectEndDate: new Date("2026-12-31"),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
    createdByUserId: null,
  };
}

test("POST /projects/:projectId/milestones/ingest is Administrator-only and still bounds a single milestone to 100%", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [adminRole, engineerRole] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const projectsModule = await prisma.module.findUniqueOrThrow({ where: { name: "Projects" } });
    const passwordHash = await hashPassword("MsIngestAuthTest@123");

    const [adminUser, ordinaryUser] = await Promise.all([
      prisma.portalUser.create({
        data: {
          fullName: "MS Ingest Auth Admin",
          email: `${TAG}-admin@example.com`,
          passwordHash,
          department: "PMO",
          roleId: adminRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: projectsModule.id } },
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "MS Ingest Auth Ordinary User",
          email: `${TAG}-ordinary@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
          moduleAccess: { create: { moduleId: projectsModule.id } },
        },
      }),
    ]);
    createdUserIds.push(adminUser.id, ordinaryUser.id);

    const project = await prisma.project.create({ data: projectPayload(`${TAG}-A`) });
    createdProjectIds.push(project.id);

    const ingest = (token: string | undefined, paymentPercentage: number, milestoneId = crypto.randomUUID()) =>
      fetch(`${url}/projects/${project.id}/milestones/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          milestones: [{ id: milestoneId, milestoneName: "Legacy Milestone", paymentPercentage }],
        }),
      });

    // Unauthenticated caller — 401, nothing written.
    const unauth = await ingest(undefined, 50);
    assert.equal(unauth.status, 401);

    // Ordinary Projects-module user (no Administrator role) — 403, and
    // this also proves they cannot smuggle a 500% milestone or push the
    // project's aggregate total past 100% through this path: they cannot
    // reach the business logic at all.
    const ordinaryToken = tokenFor({ ...ordinaryUser, roleName: engineerRole.name });
    const forbidden500 = await ingest(ordinaryToken, 500);
    assert.equal(forbidden500.status, 403);
    const forbiddenNormal = await ingest(ordinaryToken, 50);
    assert.equal(forbiddenNormal.status, 403);
    const countAfterForbidden = await prisma.paymentMilestone.count({ where: { projectId: project.id } });
    assert.equal(countAfterForbidden, 0);

    // Administrator — a single milestone at 500% is still rejected (the new
    // per-row .max(100) sanity bound applies even to Administrators; no
    // legitimate historical milestone can exceed 100% of the Work Order
    // Value regardless of who is migrating it).
    const adminToken = tokenFor({ ...adminUser, roleName: adminRole.name });
    const admin500 = await ingest(adminToken, 500);
    assert.equal(admin500.status, 400);
    const countAfterAdmin500 = await prisma.paymentMilestone.count({ where: { projectId: project.id } });
    assert.equal(countAfterAdmin500, 0);

    // Administrator — a normal, valid single migrated milestone is allowed
    // (the legacy-migration behavior itself is preserved).
    const adminValid = await ingest(adminToken, 60);
    assert.equal(adminValid.status, 201);
    const countAfterValid = await prisma.paymentMilestone.count({ where: { projectId: project.id } });
    assert.equal(countAfterValid, 1);
  } finally {
    await prisma.paymentMilestone.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
