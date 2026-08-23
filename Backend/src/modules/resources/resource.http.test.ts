import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

const TAG = `res-fix-${Date.now()}`;

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

function projectPayload(overrides: {
  prNo: string;
  createdByUserId: string | null;
}): Parameters<typeof prisma.project.create>[0]["data"] {
  return {
    poMonth: "2026-08",
    prCategory: "India",
    prNo: overrides.prNo,
    client: "Ownership Regression Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "Employee assignment ownership regression",
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectEndDate: new Date("2026-12-31"),
    projectStatus: "Active",
    workOrderNumber: `${overrides.prNo}-WO`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
    createdByUserId: overrides.createdByUserId,
  };
}

test("GET /employees/:employeeNo/assignments is ownership-scoped", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    // ---- fixtures ----
    const [projectsModule, adminRole, engineerRole] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("ResFixTest@123");

    const noModuleUser = await prisma.portalUser.create({
      data: {
        fullName: "Res Fix No Module",
        email: `${TAG}-nomodule@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(noModuleUser.id);

    const ownerA = await prisma.portalUser.create({
      data: {
        fullName: "Res Fix Owner A",
        email: `${TAG}-ownerA@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(ownerA.id);

    const ownerB = await prisma.portalUser.create({
      data: {
        fullName: "Res Fix Owner B",
        email: `${TAG}-ownerB@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(ownerB.id);

    const adminUser = await prisma.portalUser.create({
      data: {
        fullName: "Res Fix Admin",
        email: `${TAG}-admin@example.com`,
        passwordHash,
        department: "PMO",
        roleId: adminRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(adminUser.id);

    const projectA = await prisma.project.create({ data: projectPayload({ prNo: `${TAG}-A`, createdByUserId: ownerA.id }) });
    const projectB = await prisma.project.create({ data: projectPayload({ prNo: `${TAG}-B`, createdByUserId: ownerB.id }) });
    const projectUnclaimed = await prisma.project.create({ data: projectPayload({ prNo: `${TAG}-U`, createdByUserId: null }) });
    createdProjectIds.push(projectA.id, projectB.id, projectUnclaimed.id);

    const employeeSoloOnA = `${TAG}-EMP-A`;
    const employeeMixed = `${TAG}-EMP-MIXED`;
    const employeeWithNoAssignments = `${TAG}-EMP-NONE`;

    await prisma.projectResource.create({
      data: { projectId: projectA.id, employeeNo: employeeSoloOnA, hourlyRateSnapshot: 500, workingDays: 1, totalHours: 8, manhourCost: 4000 },
    });
    await prisma.projectResource.create({
      data: { projectId: projectA.id, employeeNo: employeeMixed, hourlyRateSnapshot: 500, workingDays: 1, totalHours: 8, manhourCost: 4000 },
    });
    await prisma.projectResource.create({
      data: { projectId: projectB.id, employeeNo: employeeMixed, hourlyRateSnapshot: 600, workingDays: 1, totalHours: 8, manhourCost: 4800 },
    });
    await prisma.projectResource.create({
      data: { projectId: projectUnclaimed.id, employeeNo: employeeMixed, hourlyRateSnapshot: 700, workingDays: 1, totalHours: 8, manhourCost: 5600 },
    });

    const tokens = {
      ownerA: tokenFor({ ...ownerA, roleName: engineerRole.name }),
      ownerB: tokenFor({ ...ownerB, roleName: engineerRole.name }),
      admin: tokenFor({ ...adminUser, roleName: adminRole.name }),
      noModule: tokenFor({ ...noModuleUser, roleName: engineerRole.name }),
    };

    type AssignmentsResponse = { success: boolean; data?: { items: { projectId: string }[] }; message?: string };
    const getAssignments = async (employeeNo: string, token?: string) => {
      const res = await fetch(`${url}/employees/${employeeNo}/assignments`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      return { status: res.status, json: (await res.json()) as AssignmentsResponse };
    };
    const projectIdsOf = (json: AssignmentsResponse) => (json.data?.items ?? []).map((r) => r.projectId).sort();

    // Test 5 — no authentication
    const unauth = await getAssignments(employeeSoloOnA);
    assert.equal(unauth.status, 401);
    assert.equal(unauth.json.message, "Authentication required.");

    // Test 6 — authenticated but no Projects module grant
    const noModuleRes = await getAssignments(employeeSoloOnA, tokens.noModule);
    assert.equal(noModuleRes.status, 403);

    // Test 2 — project owner sees their own employee's assignment
    const ownerARes = await getAssignments(employeeSoloOnA, tokens.ownerA);
    assert.equal(ownerARes.status, 200);
    assert.deepEqual(projectIdsOf(ownerARes.json), [projectA.id]);

    // Test 3 — non-owner requesting an employee whose only assignment belongs to another user's project
    const ownerBRes = await getAssignments(employeeSoloOnA, tokens.ownerB);
    assert.equal(ownerBRes.status, 200);
    assert.deepEqual(ownerBRes.json.data?.items, []);

    // Same boundary confirmed on the normal Projects endpoint, for comparison
    const directAccess = await fetch(`${url}/projects/${projectA.id}`, { headers: { Authorization: `Bearer ${tokens.ownerB}` } });
    assert.equal(directAccess.status, 403);

    // Test 4 — mixed ownership: own + unclaimed visible, other user's project filtered out
    const ownerAMixed = await getAssignments(employeeMixed, tokens.ownerA);
    assert.equal(ownerAMixed.status, 200);
    assert.deepEqual(projectIdsOf(ownerAMixed.json), [projectA.id, projectUnclaimed.id].sort());

    const ownerBMixed = await getAssignments(employeeMixed, tokens.ownerB);
    assert.equal(ownerBMixed.status, 200);
    assert.deepEqual(projectIdsOf(ownerBMixed.json), [projectB.id, projectUnclaimed.id].sort());

    // Test 1 — Administrator sees every assignment regardless of project owner
    const adminMixed = await getAssignments(employeeMixed, tokens.admin);
    assert.equal(adminMixed.status, 200);
    assert.deepEqual(projectIdsOf(adminMixed.json), [projectA.id, projectB.id, projectUnclaimed.id].sort());

    // Test 7 — employee with zero assignments anywhere
    const noneRes = await getAssignments(employeeWithNoAssignments, tokens.ownerA);
    assert.equal(noneRes.status, 200);
    assert.deepEqual(noneRes.json.data?.items, []);
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
