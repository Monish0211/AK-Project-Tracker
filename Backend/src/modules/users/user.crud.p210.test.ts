import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { DEFAULT_TEMP_PASSWORD } from "../../shared/constants/password.constants.js";

/**
 * P2-10 — the Users module (POST/PATCH/DELETE /users, admin reset-password)
 * had zero test coverage of any kind. This file proves: the create-user
 * transaction actually persists module/region/approval grants (not just the
 * profile row), the self-delete guard really blocks deleting your own
 * account, a normal delete really removes the target, and admin
 * reset-password really resets to the documented default and forces a
 * password change on next login.
 */

const TAG = `users-crud-p210-${Date.now()}`;

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

interface CreateUserResponse {
  success: boolean;
  data?: { id: string };
  message?: string;
}

test("P2-10 — Users module: create grants transaction, self-delete guard, delete, admin password reset", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];

  try {
    const [adminRole, engineerRole, oneModule, oneRegion, oneApprovalType] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
      prisma.module.findFirstOrThrow({ where: { isActive: true } }),
      prisma.region.findFirstOrThrow({ where: { isActive: true } }),
      prisma.approvalType.findFirstOrThrow({ where: { isActive: true } }),
    ]);
    const passwordHash = await hashPassword("UsersCrudP210Test@123");

    const admin = await prisma.portalUser.create({
      data: {
        fullName: "P2-10 Users CRUD Admin",
        email: `${TAG}-admin@example.com`,
        passwordHash,
        department: "PMO",
        roleId: adminRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(admin.id);
    const adminToken = tokenFor({ ...admin, roleName: adminRole.name });

    // ---- 1. POST /users: the create transaction must persist ALL grant
    // rows, not just the profile — this is the exact "failed insert leaves
    // a user with no permissions" scenario the transaction guards against. ----
    const createRes = await fetch(`${url}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        fullName: "P2-10 Created User",
        email: `${TAG}-created@example.com`,
        temporaryPassword: "TempPass@2026",
        roleId: engineerRole.id,
        moduleIds: [oneModule.id],
        regionIds: [oneRegion.id],
        approvalIds: [oneApprovalType.id],
      }),
    });
    assert.equal(createRes.status, 201);
    const createdJson = (await createRes.json()) as CreateUserResponse;
    const createdUserId = createdJson.data!.id;
    createdUserIds.push(createdUserId);

    const [moduleGrants, regionGrants, approvalGrants] = await Promise.all([
      prisma.userModuleAccess.findMany({ where: { userId: createdUserId } }),
      prisma.userRegionAccess.findMany({ where: { userId: createdUserId } }),
      prisma.userApprovalPermission.findMany({ where: { userId: createdUserId } }),
    ]);
    assert.equal(moduleGrants.length, 1);
    assert.equal(moduleGrants[0]!.moduleId, oneModule.id);
    assert.equal(regionGrants.length, 1);
    assert.equal(regionGrants[0]!.regionId, oneRegion.id);
    assert.equal(approvalGrants.length, 1);
    assert.equal(approvalGrants[0]!.approvalTypeId, oneApprovalType.id);

    // ---- 2. Self-delete guard: an Administrator may not delete their own
    // account via this endpoint. ----
    const selfDeleteRes = await fetch(`${url}/users/${admin.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(selfDeleteRes.status, 400);
    const selfDeleteJson = (await selfDeleteRes.json()) as { message?: string };
    assert.match(selfDeleteJson.message ?? "", /cannot delete your own account/i);

    const adminStillExists = await prisma.portalUser.findUnique({ where: { id: admin.id } });
    assert.ok(adminStillExists, "the guard must be enforced BEFORE any delete happens, not just return an error after the fact");

    // ---- 3. Deleting a DIFFERENT user succeeds and actually removes it. ----
    const deleteOtherRes = await fetch(`${url}/users/${createdUserId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(deleteOtherRes.status, 200);
    const deletedUser = await prisma.portalUser.findUnique({ where: { id: createdUserId } });
    assert.equal(deletedUser, null);
    createdUserIds.splice(createdUserIds.indexOf(createdUserId), 1); // already gone — nothing left to clean up

    // ---- 4. Admin reset-password: resets to the documented default,
    // forces a password change, and the new password actually works. ----
    const targetForReset = await prisma.portalUser.create({
      data: {
        fullName: "P2-10 Reset Target",
        email: `${TAG}-reset@example.com`,
        passwordHash: await hashPassword("SomeOldPassword@123"),
        department: "PMO",
        roleId: engineerRole.id,
        forcePasswordChange: false,
      },
    });
    createdUserIds.push(targetForReset.id);

    const resetRes = await fetch(`${url}/users/${targetForReset.id}/reset-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(resetRes.status, 200);

    const afterReset = await prisma.portalUser.findUniqueOrThrow({ where: { id: targetForReset.id } });
    assert.equal(afterReset.forcePasswordChange, true);
    assert.equal(afterReset.accountLocked, false);

    const loginWithDefaultRes = await fetch(`${url}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetForReset.email, password: DEFAULT_TEMP_PASSWORD }),
    });
    assert.equal(loginWithDefaultRes.status, 200);
    const loginJson = (await loginWithDefaultRes.json()) as { data?: { requiresPasswordChange: boolean } };
    assert.equal(loginJson.data?.requiresPasswordChange, true);

    const loginWithOldRes = await fetch(`${url}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: targetForReset.email, password: "SomeOldPassword@123" }),
    });
    assert.equal(loginWithOldRes.status, 401, "the pre-reset password must no longer work");
  } finally {
    if (createdUserIds.length > 0) {
      await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userRegionAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userApprovalPermission.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});
