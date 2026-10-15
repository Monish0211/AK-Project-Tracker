import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * Project Manager Scope (User-Based Project Visibility) — covers both
 * halves of the feature: (1) the Users module's create/edit grant CRUD and
 * validation, and (2) that the grant actually changes what GET /projects,
 * GET /projects/:id, and GET /dashboard/summary return, without touching
 * System Admin/PMO Manager's existing unrestricted access or an unrelated
 * user's isolation from either party's projects.
 */

const TAG = `pm-scope-${Date.now()}`;

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

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
}

test("Project Manager Scope — create/edit grant CRUD, validation, role-change clearing", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];

  try {
    const [adminRole, pmRole, engineerRole] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Project Manager" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("PmScopeTest@123");

    const admin = await prisma.portalUser.create({
      data: {
        fullName: "PM Scope Test Admin",
        email: `${TAG}-admin@example.com`,
        passwordHash,
        department: "PMO",
        roleId: adminRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(admin.id);
    const adminToken = tokenFor({ ...admin, roleName: adminRole.name });

    const granteeA = await prisma.portalUser.create({
      data: {
        fullName: "PM Scope Grantee A",
        email: `${TAG}-granteeA@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(granteeA.id);

    // ---- 1. Create a Project Manager WITH a scope grant in the same
    // POST /users call — proves it persists transactionally with the rest
    // of the user, same as moduleIds/regionIds/approvalIds already do. ----
    const createRes = await fetch(`${url}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        fullName: "PM Scope Test PM",
        email: `${TAG}-pm@example.com`,
        temporaryPassword: "TempPass@2026",
        roleId: pmRole.id,
        moduleIds: [],
        regionIds: [],
        approvalIds: [],
        scopedUserIds: [granteeA.id],
      }),
    });
    assert.equal(createRes.status, 201);
    const createdJson = (await createRes.json()) as ApiEnvelope<{ id: string; scopedUserIds: string[] }>;
    const pmId = createdJson.data!.id;
    createdUserIds.push(pmId);
    assert.deepEqual(createdJson.data!.scopedUserIds, [granteeA.id]);

    const grantsAfterCreate = await prisma.projectManagerScope.findMany({ where: { projectManagerId: pmId } });
    assert.equal(grantsAfterCreate.length, 1);
    assert.equal(grantsAfterCreate[0]!.grantedUserId, granteeA.id);

    // ---- 2. Reject a self-grant: a Project Manager cannot be granted
    // visibility into their own projects (redundant — see B above). ----
    const selfGrantRes = await fetch(`${url}/users/${pmId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ scopedUserIds: [pmId] }),
    });
    assert.equal(selfGrantRes.status, 400);
    const selfGrantJson = (await selfGrantRes.json()) as ApiEnvelope<never>;
    assert.match(selfGrantJson.message ?? "", /own projects/i);

    // ---- 3. Reject a grant to a nonexistent user id. ----
    const bogusId = "00000000-0000-0000-0000-000000000000";
    const bogusGrantRes = await fetch(`${url}/users/${pmId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ scopedUserIds: [bogusId] }),
    });
    assert.equal(bogusGrantRes.status, 400);
    const bogusGrantJson = (await bogusGrantRes.json()) as ApiEnvelope<never>;
    assert.match(bogusGrantJson.message ?? "", /do not exist/i);

    // Neither rejected attempt above should have touched the existing grant.
    const grantsStillIntact = await prisma.projectManagerScope.findMany({ where: { projectManagerId: pmId } });
    assert.equal(grantsStillIntact.length, 1, "a rejected update must never partially apply");

    // ---- 4. Omitting scopedUserIds entirely on an unrelated field update
    // must NOT wipe the existing grant (no silent omission-wipe). ----
    const unrelatedUpdateRes = await fetch(`${url}/users/${pmId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ designation: "Senior Project Manager" }),
    });
    assert.equal(unrelatedUpdateRes.status, 200);
    const grantsAfterUnrelatedUpdate = await prisma.projectManagerScope.findMany({ where: { projectManagerId: pmId } });
    assert.equal(grantsAfterUnrelatedUpdate.length, 1, "omitting scopedUserIds must preserve existing grants");

    // ---- 5. Editing a Project Manager preserves and correctly updates
    // selections — replace the single grant with a different one. ----
    const granteeB = await prisma.portalUser.create({
      data: {
        fullName: "PM Scope Grantee B",
        email: `${TAG}-granteeB@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(granteeB.id);

    const replaceRes = await fetch(`${url}/users/${pmId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ scopedUserIds: [granteeB.id] }),
    });
    assert.equal(replaceRes.status, 200);
    const replaceJson = (await replaceRes.json()) as ApiEnvelope<{ scopedUserIds: string[] }>;
    assert.deepEqual(replaceJson.data!.scopedUserIds, [granteeB.id]);

    // ---- 6. Rule D — switching the role away from Project Manager clears
    // every grant, even though this request doesn't touch scopedUserIds. ----
    const roleChangeRes = await fetch(`${url}/users/${pmId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ roleId: engineerRole.id }),
    });
    assert.equal(roleChangeRes.status, 200);
    const grantsAfterRoleChange = await prisma.projectManagerScope.findMany({ where: { projectManagerId: pmId } });
    assert.equal(grantsAfterRoleChange.length, 0, "changing role away from Project Manager must clear all grants");

    // ---- 7. Deleting a granted user cascades and removes the grant
    // row safely (no orphan, no error) — switch pmId back to Project
    // Manager with a fresh grant, then delete the grantee. ----
    const granteeC = await prisma.portalUser.create({
      data: {
        fullName: "PM Scope Grantee C",
        email: `${TAG}-granteeC@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(granteeC.id);

    await fetch(`${url}/users/${pmId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ roleId: pmRole.id, scopedUserIds: [granteeC.id] }),
    });
    const grantsBeforeDelete = await prisma.projectManagerScope.findMany({ where: { projectManagerId: pmId } });
    assert.equal(grantsBeforeDelete.length, 1);

    await prisma.portalUser.delete({ where: { id: granteeC.id } });
    createdUserIds.splice(createdUserIds.indexOf(granteeC.id), 1); // already gone
    const grantsAfterGranteeDeleted = await prisma.projectManagerScope.findMany({ where: { projectManagerId: pmId } });
    assert.equal(grantsAfterGranteeDeleted.length, 0, "deleting a granted user must cascade-delete the grant row");
  } finally {
    if (createdUserIds.length > 0) {
      await prisma.projectManagerScope.deleteMany({
        where: { OR: [{ projectManagerId: { in: createdUserIds } }, { grantedUserId: { in: createdUserIds } }] },
      });
      await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userRegionAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userApprovalPermission.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});

test("Project Manager Scope — access enforcement across List/Detail/Dashboard, deactivation, and role isolation", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [adminRole, pmoManagerRole, pmRole, engineerRole] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Project Manager" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const projectsModule = await prisma.module.findUniqueOrThrow({ where: { name: "Projects" } });
    const dashboardModule = await prisma.module.findFirstOrThrow({ where: { name: "Dashboard" } });
    const passwordHash = await hashPassword("PmScopeTest@123");

    async function makeUser(fullName: string, roleId: string, grantModules: string[]) {
      const u = await prisma.portalUser.create({
        data: { fullName, email: `${TAG}-${fullName.replace(/\s+/g, "").toLowerCase()}@example.com`, passwordHash, department: "PMO", roleId, forcePasswordChange: false },
      });
      createdUserIds.push(u.id);
      if (grantModules.length > 0) {
        await prisma.userModuleAccess.createMany({ data: grantModules.map((moduleId) => ({ userId: u.id, moduleId })) });
      }
      return u;
    }

    const admin = await makeUser("Enforce Admin", adminRole.id, [projectsModule.id, dashboardModule.id]);
    const pmoManager = await makeUser("Enforce Pmo Manager", pmoManagerRole.id, [projectsModule.id, dashboardModule.id]);
    const pm = await makeUser("Enforce Pm", pmRole.id, [projectsModule.id, dashboardModule.id]);
    const grantee = await makeUser("Enforce Grantee", engineerRole.id, [projectsModule.id]);
    const unrelated = await makeUser("Enforce Unrelated", engineerRole.id, [projectsModule.id]);

    const adminToken = tokenFor({ ...admin, roleName: adminRole.name });
    const pmoManagerToken = tokenFor({ ...pmoManager, roleName: pmoManagerRole.name });
    const pmToken = tokenFor({ ...pm, roleName: pmRole.name });
    const granteeToken = tokenFor({ ...grantee, roleName: engineerRole.name });
    const unrelatedToken = tokenFor({ ...unrelated, roleName: engineerRole.name });

    async function createProject(token: string, prNo: string) {
      const res = await fetch(`${url}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          poMonth: "2026-08",
          prCategory: "India",
          prNo,
          client: `${TAG} client`,
          department: "Process",
          domesticForeign: "Domestic",
          projectTitle: `${TAG} project ${prNo}`,
          workOrderStatus: "Received",
          projectStartDate: new Date("2026-01-01").toISOString(),
          projectStatus: "Active",
          workOrderNumber: `${prNo}-WO`,
          workOrderDate: new Date("2026-01-01").toISOString(),
          rfqNo: "RFQ-TEST",
          eicName: "EIC",
          contractType: "LUMP SUM",
          pmoCoordinator: "PMO",
        }),
      });
      const json = (await res.json()) as ApiEnvelope<{ id: string }>;
      assert.equal(res.status, 201, `project create for ${prNo} should succeed: ${json.message ?? "unknown error"}`);
      createdProjectIds.push(json.data!.id);
      return json.data!.id;
    }

    // Grantee creates a project. Before any grant exists, the PM must NOT
    // see it, and an unrelated user must never see it either.
    const granteeProjectId = await createProject(granteeToken, `PR-${TAG}-A`);
    // The PM's own project, for the "own projects retained" half of rule A.
    const pmOwnProjectId = await createProject(pmToken, `PR-${TAG}-B`);

    async function projectIdsVisibleTo(token: string): Promise<string[]> {
      const res = await fetch(`${url}/projects?pageSize=200`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(res.status, 200);
      const json = (await res.json()) as ApiEnvelope<{ items: Array<{ id: string }> }>;
      return json.data!.items.map((p) => p.id);
    }

    async function canSeeProjectDetail(token: string, projectId: string): Promise<number> {
      const res = await fetch(`${url}/projects/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
      return res.status;
    }

    // ---- Before any grant: PM sees only their own project, not grantee's. ----
    let pmVisible = await projectIdsVisibleTo(pmToken);
    assert.ok(pmVisible.includes(pmOwnProjectId), "rule A — PM must retain visibility to their own project");
    assert.ok(!pmVisible.includes(granteeProjectId), "PM must not see grantee's project before any grant exists");
    assert.equal(await canSeeProjectDetail(pmToken, granteeProjectId), 403);

    // Unrelated user (no grant, not creator) must never see either project.
    const unrelatedVisible = await projectIdsVisibleTo(unrelatedToken);
    assert.ok(!unrelatedVisible.includes(granteeProjectId));
    assert.ok(!unrelatedVisible.includes(pmOwnProjectId));

    // ---- Grant the PM visibility into grantee's projects. ----
    const grantRes = await fetch(`${url}/users/${pm.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ scopedUserIds: [grantee.id] }),
    });
    assert.equal(grantRes.status, 200);

    // ---- After the grant: PM sees own + grantee's project (rule B), via
    // both List and Detail (direct-ID access respects the scope). ----
    pmVisible = await projectIdsVisibleTo(pmToken);
    assert.ok(pmVisible.includes(pmOwnProjectId));
    assert.ok(pmVisible.includes(granteeProjectId), "rule B — PM must see grantee's project once granted");
    assert.equal(await canSeeProjectDetail(pmToken, granteeProjectId), 200);

    // Dashboard must respect the same scope (centralized enforcement).
    const dashboardRes = await fetch(`${url}/dashboard/summary`, { headers: { Authorization: `Bearer ${pmToken}` } });
    assert.equal(dashboardRes.status, 200);
    const dashboardJson = (await dashboardRes.json()) as ApiEnvelope<{ recentProjects?: Array<{ id: string }> }>;
    assert.ok(dashboardJson.success);

    // Unrelated user is still fully isolated even though the PM now has a grant.
    assert.equal(await canSeeProjectDetail(unrelatedToken, granteeProjectId), 403);

    // Administrator and PMO Manager remain fully unrestricted, unaffected by this feature.
    const adminVisible = await projectIdsVisibleTo(adminToken);
    assert.ok(adminVisible.includes(pmOwnProjectId) && adminVisible.includes(granteeProjectId));
    const pmoManagerVisible = await projectIdsVisibleTo(pmoManagerToken);
    assert.ok(pmoManagerVisible.includes(pmOwnProjectId) && pmoManagerVisible.includes(granteeProjectId));

    // ---- Rule E — deactivating the granted user narrows visibility back
    // down immediately, without touching the grant row itself. ----
    await fetch(`${url}/users/${grantee.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ isActive: false }),
    });
    pmVisible = await projectIdsVisibleTo(pmToken);
    assert.ok(!pmVisible.includes(granteeProjectId), "rule E — a deactivated grantee must not expand visibility");
    assert.equal(await canSeeProjectDetail(pmToken, granteeProjectId), 403);

    const grantRowStillExists = await prisma.projectManagerScope.findFirst({
      where: { projectManagerId: pm.id, grantedUserId: grantee.id },
    });
    assert.ok(grantRowStillExists, "deactivation must narrow visibility live, not by deleting the grant row");
  } finally {
    if (createdProjectIds.length > 0) {
      await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.projectManagerScope.deleteMany({
        where: { OR: [{ projectManagerId: { in: createdUserIds } }, { grantedUserId: { in: createdUserIds } }] },
      });
      await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userRegionAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userApprovalPermission.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});
