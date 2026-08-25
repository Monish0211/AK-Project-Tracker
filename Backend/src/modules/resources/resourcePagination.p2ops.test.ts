import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * P2-02 (production scalability hardening) — GET /projects/resources'
 * previous design (fetch-everything, hard-capped at RESOURCE_FETCH_CAP)
 * still exists for full backward compatibility (an unparameterized call
 * behaves identically to before), but the endpoint now also supports real
 * page/pageSize pagination — the resource-cost-attribution caller in
 * projectService.ts's fetchAllProjectsFromApi() now uses it instead of
 * relying on the safety-net cap alone.
 */

const TAG = `res-page-p2ops-${Date.now()}`;

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

interface ResourceListResponse {
  success: boolean;
  data?: { items: { id: string; employeeNo: string; projectId: string }[]; total?: number; page?: number; pageSize?: number };
  message?: string;
}

test("P2-02 — GET /projects/resources: backward-compatible unparameterized call is unchanged", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [projectsModule, engineerRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("ResPageP2OpsTest@123");
    const owner = await prisma.portalUser.create({
      data: {
        fullName: "P2-02 Pagination Owner",
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
        client: "P2-02 Pagination Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "P2-02 pagination probe",
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

    await prisma.projectResource.create({
      data: { projectId: project.id, employeeNo: `${TAG}-E1`, assignmentStatus: "Active", hourlyRateSnapshot: 500, workingDays: 1, totalHours: 8, manhourCost: 4000 },
    });

    const token = tokenFor({ ...owner, roleName: engineerRole.name });
    const res = await fetch(`${url}/projects/resources`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.status, 200);
    const json = (await res.json()) as ResourceListResponse;
    assert.equal(json.data!.total, undefined, "unparameterized call must not carry pagination metadata (unchanged shape)");
    assert.equal(json.data!.page, undefined);
    assert.ok(json.data!.items.some((r) => r.employeeNo === `${TAG}-E1`));
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

test("P2-02 — GET /projects/resources: paginated mode has deterministic ordering, no gaps/duplicates, correct total, authorization intact", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [projectsModule, engineerRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("ResPageP2OpsTest@123");

    const owner = await prisma.portalUser.create({
      data: {
        fullName: "P2-02 Pagination Owner2",
        email: `${TAG}-owner2@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(owner.id);

    const noModuleUser = await prisma.portalUser.create({
      data: {
        fullName: "P2-02 No Module",
        email: `${TAG}-nomodule@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(noModuleUser.id);

    const project = await prisma.project.create({
      data: {
        poMonth: "2026-08",
        prCategory: "India",
        prNo: `${TAG}-BULK`,
        client: "P2-02 Pagination Bulk Client",
        department: "Process",
        domesticForeign: "Domestic",
        projectTitle: "P2-02 pagination bulk probe",
        workOrderStatus: "Received",
        projectStartDate: new Date("2026-01-01"),
        projectEndDate: new Date("2026-12-31"),
        projectStatus: "Active",
        workOrderNumber: `${TAG}-BULK-WO`,
        workOrderDate: new Date("2026-01-01"),
        eicName: "EIC",
        contractType: "LUMP SUM",
        pmoCoordinator: "PMO",
        createdByUserId: owner.id,
      },
    });
    createdProjectIds.push(project.id);

    // Authorization: no module grant -> 403, never reaching the query.
    const forbiddenRes = await fetch(`${url}/projects/resources?page=1&pageSize=10`, {
      headers: { Authorization: `Bearer ${tokenFor({ ...noModuleUser, roleName: engineerRole.name })}` },
    });
    assert.equal(forbiddenRes.status, 403);

    // Malformed pageSize -> clean 400, not a 500/DB error.
    const token = tokenFor({ ...owner, roleName: engineerRole.name });
    const badRes = await fetch(`${url}/projects/resources?page=1&pageSize=999999`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(badRes.status, 400);

    // 0 resources for OUR fixture project specifically — asserted via
    // exact-ID absence rather than a global total of 0, since this is a
    // shared dev DB where other authorized (e.g. legacy null-owned)
    // resources may legitimately already exist (see P2-13's own note on
    // this exact class of shared-DB pollution).
    const emptyRes = await fetch(`${url}/projects/resources?page=1&pageSize=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(emptyRes.status, 200);
    const emptyJson = (await emptyRes.json()) as ResourceListResponse;
    assert.equal(typeof emptyJson.data!.total, "number");
    assert.equal(
      emptyJson.data!.items.some((r) => r.projectId === project.id),
      false,
      "the fixture project has no resources yet"
    );

    // Bulk-create 1200 resources for this one project (distinct employeeNo
    // per row — @@unique([projectId, employeeNo])), across enough pages at
    // pageSize=500 to exercise a genuine multi-page walk (3 pages: 500/500/200).
    const N = 1200;
    const rows = Array.from({ length: N }, (_, i) => ({
      projectId: project.id,
      employeeNo: `${TAG}-BULK-E${i}`,
      assignmentStatus: "Active",
      hourlyRateSnapshot: 100,
      workingDays: 1,
      totalHours: 1,
      manhourCost: 100,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await prisma.projectResource.createMany({ data: rows.slice(i, i + 500) });
    }

    // `total` is the GLOBAL authorized-resource count (shared dev DB — may
    // legitimately include other, unrelated resources), so the walk keeps
    // going until either the global set is exhausted or every one of our N
    // fixture rows has been seen — whichever comes first — rather than
    // assuming `total` equals N.
    const pageSize = 500;
    const seenIds = new Set<string>();
    let page = 1;
    let total = 0;
    do {
      const pageRes = await fetch(`${url}/projects/resources?page=${page}&pageSize=${pageSize}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(pageRes.status, 200);
      const pageJson = (await pageRes.json()) as ResourceListResponse;
      assert.equal(pageJson.data!.page, page);
      assert.equal(pageJson.data!.pageSize, pageSize);
      total = pageJson.data!.total!;
      const items = pageJson.data!.items.filter((r) => r.projectId === project.id);
      for (const item of items) {
        assert.equal(seenIds.has(item.id), false, `row ${item.id} appeared on more than one page — pagination is not stable`);
        seenIds.add(item.id);
      }
      page += 1;
    } while ((page - 1) * pageSize < total && seenIds.size < N && page <= 50);

    assert.ok(total >= N, "the global authorized-resource total must be at least our fixture's N rows");
    assert.equal(seenIds.size, N, "walking pages must yield exactly N distinct fixture rows — no gaps, no duplicates");
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
