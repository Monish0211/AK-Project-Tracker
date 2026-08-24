import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * P2-10 — DELETE /projects/:id (archive) and DELETE /projects/:id/permanent
 * are both gated by requireApprovalPermission("Archive Projects" /
 * "Delete Project Permanently") — a distinct, separately-grantable
 * permission, NOT a role check. Every existing test that exercises archive
 * (project.prNoUniqueness.http.test.ts) only ever does so as an
 * Administrator, who happens to hold every approval — the negative case
 * (module access present, but NOT this specific approval) was never
 * exercised anywhere. This proves the gate actually blocks without the
 * grant, and actually allows once the grant is added — so a regression that
 * silently disabled the check (or checked the wrong approval name) would be
 * caught either way.
 */

const TAG = `proj-approval-p210-${Date.now()}`;

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

function projectPayload(prNo: string, createdByUserId: string): Parameters<typeof prisma.project.create>[0]["data"] {
  return {
    poMonth: "2026-08",
    prCategory: "India",
    prNo,
    client: "P2-10 Approval Gate Client",
    department: "Process",
    domesticForeign: "Domestic",
    projectTitle: "P2-10 approval gate probe",
    workOrderStatus: "Received",
    projectStartDate: new Date("2026-01-01"),
    projectEndDate: new Date("2026-12-31"),
    projectStatus: "Active",
    workOrderNumber: `${prNo}-WO`,
    workOrderDate: new Date("2026-01-01"),
    eicName: "EIC",
    contractType: "LUMP SUM",
    pmoCoordinator: "PMO",
    createdByUserId,
  };
}

test("P2-10 — Project archive/permanent-delete: blocked without the specific approval, allowed once granted", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];
  const createdProjectIds: string[] = [];

  try {
    const [projectsModule, engineerRole, archiveApproval, permDeleteApproval] = await Promise.all([
      prisma.module.findUniqueOrThrow({ where: { name: "Projects" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.approvalType.findUniqueOrThrow({ where: { name: "Archive Projects" } }),
      prisma.approvalType.findUniqueOrThrow({ where: { name: "Delete Project Permanently" } }),
    ]);
    const passwordHash = await hashPassword("ProjApprovalP210Test@123");

    // Has the "Projects" module grant, but NEITHER approval type.
    const caller = await prisma.portalUser.create({
      data: {
        fullName: "P2-10 Approval Gate Caller",
        email: `${TAG}-caller@example.com`,
        passwordHash,
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
        moduleAccess: { create: { moduleId: projectsModule.id } },
      },
    });
    createdUserIds.push(caller.id);
    const callerToken = tokenFor({ ...caller, roleName: engineerRole.name });

    const projectA = await prisma.project.create({ data: projectPayload(`${TAG}-A`, caller.id) });
    const projectB = await prisma.project.create({ data: projectPayload(`${TAG}-B`, caller.id) });
    createdProjectIds.push(projectA.id, projectB.id);

    // ---- Without the approval: both destructive routes must 403. ----
    const archiveDenied = await fetch(`${url}/projects/${projectA.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${callerToken}` },
    });
    assert.equal(archiveDenied.status, 403);

    const permDeleteDenied = await fetch(`${url}/projects/${projectA.id}/permanent`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${callerToken}` },
    });
    assert.equal(permDeleteDenied.status, 403);

    const stillActive = await prisma.project.findUniqueOrThrow({ where: { id: projectA.id } });
    assert.equal(stillActive.isDeleted, false, "a denied archive attempt must not have soft-deleted the project");

    // ---- Grant ONLY "Archive Projects" — archive must now succeed, but
    // permanent-delete (a DIFFERENT approval) must still be denied. Proves
    // the gate checks the specific approval, not "holds any approval at all". ----
    await prisma.userApprovalPermission.create({ data: { userId: caller.id, approvalTypeId: archiveApproval.id } });

    const permDeleteStillDenied = await fetch(`${url}/projects/${projectA.id}/permanent`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${callerToken}` },
    });
    assert.equal(permDeleteStillDenied.status, 403, "holding Archive Projects must not also unlock Delete Project Permanently");

    const archiveAllowed = await fetch(`${url}/projects/${projectA.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${callerToken}` },
    });
    assert.equal(archiveAllowed.status, 200);
    const nowArchived = await prisma.project.findUniqueOrThrow({ where: { id: projectA.id } });
    assert.equal(nowArchived.isDeleted, true);

    // ---- Now grant "Delete Project Permanently" too — permanent-delete on
    // a DIFFERENT project must now succeed. ----
    await prisma.userApprovalPermission.create({ data: { userId: caller.id, approvalTypeId: permDeleteApproval.id } });

    const permDeleteAllowed = await fetch(`${url}/projects/${projectB.id}/permanent`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${callerToken}` },
    });
    assert.equal(permDeleteAllowed.status, 200);
    const goneForGood = await prisma.project.findUnique({ where: { id: projectB.id } });
    assert.equal(goneForGood, null);
    createdProjectIds.splice(createdProjectIds.indexOf(projectB.id), 1); // already gone
  } finally {
    if (createdProjectIds.length > 0) {
      await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.userApprovalPermission.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});
