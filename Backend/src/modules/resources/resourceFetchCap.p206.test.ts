import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { assertResourceCountWithinCap } from "./services/resource.service.js";

/**
 * P2-06 — GET /projects/resources (getAllResourcesForAuthorizedProjects) had
 * no `take` at all, unlike every other bulk-fetch path in this app. The fix
 * adds a defensive RESOURCE_FETCH_CAP (+1 fetch) and a loud AppError if the
 * real row count ever exceeds it, instead of ever silently truncating data
 * that feeds Reports' per-project resource-cost attribution.
 *
 * Seeding RESOURCE_FETCH_CAP+1 (50,001) real rows to exercise the overflow
 * branch end-to-end is impractical, so this file covers it two ways:
 *  1. An HTTP-level test proving the NORMAL case (well under the cap) is
 *     completely unaffected — same response shape, same rows.
 *  2. A pure unit test of the extracted threshold check
 *     (assertResourceCountWithinCap), parametrized on a small cap, proving
 *     the exact off-by-one boundary (cap rows OK, cap+1 rows throws) that
 *     the real 50,000 cap relies on.
 */

const TAG = `res-cap-p206-${Date.now()}`;

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

test("P2-06 — GET /projects/resources: normal case (well under the cap) is unaffected", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [projectsModule, engineerRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("ResCapP206Test@123");

    const owner = await prisma.portalUser.create({
      data: {
        fullName: "P2-06 Resource Cap Owner",
        email: `${TAG}-owner@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(owner.id);

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-08",
        prCategory: "India",
        prNo: `${TAG}-P`,
        client: "P2-06 Resource Cap Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "P2-06 resource cap probe",
        workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"),
        projectEndDate: new Date("2026-12-31"),
        projectStatus: "Active",
        workOrderNumber: `${TAG}-WO`,
        workOrderDate: new Date("2026-01-01"),
        eicName: "EIC",
        contractType: "LUMP SUM",
        pmoCoordinator: "PMO",
        createdByUserId: owner.id,
      },
    });
    createdProjectIds.push(project.id);

    const employeeNos = [`${TAG}-E1`, `${TAG}-E2`, `${TAG}-E3`];
    for (const employeeNo of employeeNos) {
      await prisma.projectResource.create({
        data: { projectId: project.id, employeeNo, hourlyRateSnapshot: 500, workingDays: 1, totalHours: 8, manhourCost: 4000 },
      });
    }

    const res = await fetch(`${url}/projects/resources`, {
      headers: { Authorization: `Bearer ${tokenFor({ ...owner, roleName: engineerRole.name })}` },
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as { success: boolean; data: { items: { projectId: string; employeeNo: string }[] } };
    assert.equal(json.success, true);

    const ours = json.data.items.filter((r) => r.projectId === project.id);
    assert.deepEqual(
      ours.map((r) => r.employeeNo).sort(),
      [...employeeNos].sort()
    );
  } finally {
    if (createdProjectIds.length > 0) {
      await prisma.projectResource.deleteMany({ where: { projectId: { in: createdProjectIds } } });
      await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});

test("P2-06 — assertResourceCountWithinCap: exact cap is fine, cap+1 throws loudly", () => {
  // At the cap — must NOT throw (this is the "exactly CAP rows happen to
  // exist" case, which is legitimate and must not be mistaken for overflow).
  assert.doesNotThrow(() => assertResourceCountWithinCap(5, 5));
  assert.doesNotThrow(() => assertResourceCountWithinCap(0, 5));

  // One over the cap — must throw a clear, loud error, never silently
  // truncate.
  assert.throws(
    () => assertResourceCountWithinCap(6, 5),
    (err: unknown) => err instanceof Error && /more than 5 authorized resource rows exist/.test(err.message)
  );
});
