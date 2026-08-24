import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

const TAG = `ms-pct-${Date.now()}`;

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

test("Payment Milestone percentage is bounded to 0-100 and to a 100% project total, server-side", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const engineerRole = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } });
    const projectsModule = await prisma.module.findUniqueOrThrow({ where: { name: "Projects" } });
    const passwordHash = await hashPassword("MsPctTest@123");

    const user = await prisma.portalUser.create({
      data: {
        fullName: "MS Pct Test User",
        email: `${TAG}-user@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(user.id);
    const token = tokenFor({ ...user, roleName: engineerRole.name });

    const projectA = await prisma.project.create({
      data: {
        poMonth: "2026-01",
        prCategory: "India",
        prNo: `${TAG}-A`,
        client: "Milestone Percentage Regression Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "Milestone percentage validation regression",
        workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"),
        projectEndDate: new Date("2026-12-31"),
        projectStatus: "Active",
        workOrderNumber: `${TAG}-A-WO`,
        workOrderDate: new Date("2026-01-01"),
        eicName: "EIC",
        contractType: "LUMP SUM",
        pmoCoordinator: "PMO",
        createdByUserId: null,
      },
    });
    const projectB = await prisma.project.create({
      data: {
        poMonth: "2026-01",
        prCategory: "India",
        prNo: `${TAG}-B`,
        client: "Milestone Percentage Regression Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "Milestone percentage validation regression — unrelated project",
        workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"),
        projectEndDate: new Date("2026-12-31"),
        projectStatus: "Active",
        workOrderNumber: `${TAG}-B-WO`,
        workOrderDate: new Date("2026-01-01"),
        eicName: "EIC",
        contractType: "LUMP SUM",
        pmoCoordinator: "PMO",
        createdByUserId: null,
      },
    });
    createdProjectIds.push(projectA.id, projectB.id);

    const create = (projectId: string, paymentPercentage: number, milestoneName = "Milestone") =>
      fetch(`${url}/projects/${projectId}/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ milestoneName, paymentPercentage }),
      });

    // 0 and negative are rejected (pre-existing .positive() rule, unchanged).
    assert.equal((await create(projectA.id, 0)).status, 400);
    assert.equal((await create(projectA.id, -10)).status, 400);

    // 100.01% is rejected by the new upper bound, even as a lone milestone.
    assert.equal((await create(projectA.id, 100.01)).status, 400);

    // A totally unrelated project's milestones never affect this project's
    // running total.
    const unrelated = await create(projectB.id, 90, "Unrelated Project Milestone");
    assert.equal(unrelated.status, 201);

    // 50% is valid as a first milestone.
    const first = await create(projectA.id, 50, "First Milestone");
    assert.equal(first.status, 201);
    const firstId = ((await first.json()) as { data: { id: string } }).data.id;

    // A second milestone that would push the project's total to 100% is
    // valid.
    const second = await create(projectA.id, 50, "Second Milestone");
    assert.equal(second.status, 201);

    // A third milestone that would push the total past 100% is rejected —
    // and nothing is written (the project's milestone count stays at 2).
    const third = await create(projectA.id, 0.01, "Third Milestone");
    assert.equal(third.status, 400);
    const countAfterRejected = await prisma.paymentMilestone.count({ where: { projectId: projectA.id } });
    assert.equal(countAfterRejected, 2);

    // Updating the first milestone back down to 40% correctly excludes its
    // OWN prior 50% from the total it's compared against (40 + 50 = 90, not
    // 40 + 50 + its old 50 = 140) — so this must succeed.
    const patchDown = await fetch(`${url}/milestones/${firstId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paymentPercentage: 40 }),
    });
    assert.equal(patchDown.status, 200);

    // But updating it to a value that would push the total over 100% (61 +
    // the other milestone's 50 = 111) is rejected.
    const patchOver = await fetch(`${url}/milestones/${firstId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paymentPercentage: 61 }),
    });
    assert.equal(patchOver.status, 400);
    const unchanged = await prisma.paymentMilestone.findUniqueOrThrow({ where: { id: firstId } });
    assert.equal(unchanged.paymentPercentage, 40);
  } finally {
    await prisma.paymentMilestone.deleteMany({ where: { projectId: { in: createdProjectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
