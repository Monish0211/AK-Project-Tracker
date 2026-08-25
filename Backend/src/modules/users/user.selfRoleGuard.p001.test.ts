import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";

/**
 * P0-01 — self-role-change privilege escalation.
 *
 * PMO Manager and Administrator intentionally share every user-management
 * route (PATCH /users/:id is gated by authorize("Administrator","PMO
 * Manager")) — that sharing is a deliberate business decision and is NOT
 * what this file tests. What this file proves is narrower and provable from
 * the implementation, not from role naming: a PMO Manager must not be able
 * to use that shared route to change their OWN roleId to Administrator's (or
 * to any other role) and thereby grant themselves the real, role-NAME-gated
 * capabilities that live elsewhere in the codebase (company-wide project/
 * data ownership bypass, audit-log access, manual Timesheet Excel import,
 * Timesheet delete/clear, milestone/invoice ingest). Editing ANY OTHER
 * user's role — by a PMO Manager or an Administrator — must keep working
 * exactly as before; so must a PMO Manager editing their own non-role
 * fields.
 */

const TAG = `self-role-guard-p001-${Date.now()}`;

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

interface PatchUserResponse {
  success: boolean;
  data?: { id: string; role?: { id: string; name: string }; fullName?: string };
  message?: string;
}

test("P0-01 — a PMO Manager cannot change their own role, but every other update path is unaffected", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];

  try {
    const [administratorRole, pmoManagerRole, engineerRole] = await Promise.all([
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Administrator" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "PMO Manager" } }),
      prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } }),
    ]);
    const passwordHash = await hashPassword("SelfRoleGuardP001Test@123");

    const [pmoManager, administrator, otherUser] = await Promise.all([
      prisma.portalUser.create({
        data: {
          fullName: "P0-01 PMO Manager",
          email: `${TAG}-pmo-manager@example.com`,
          passwordHash,
          department: "PMO",
          roleId: pmoManagerRole.id,
          forcePasswordChange: false,
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "P0-01 Administrator",
          email: `${TAG}-administrator@example.com`,
          passwordHash,
          department: "PMO",
          roleId: administratorRole.id,
          forcePasswordChange: false,
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "P0-01 Other User",
          email: `${TAG}-other-user@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
        },
      }),
    ]);
    createdUserIds.push(pmoManager.id, administrator.id, otherUser.id);

    const pmoManagerToken = tokenFor({ ...pmoManager, roleName: pmoManagerRole.name });
    const administratorToken = tokenFor({ ...administrator, roleName: administratorRole.name });

    const patch = (userId: string, token: string, body: Record<string, unknown>) =>
      fetch(`${url}/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

    // ---- A. PMO Manager PATCHes their own user, roleId = Administrator ----
    const selfEscalateRes = await patch(pmoManager.id, pmoManagerToken, { roleId: administratorRole.id });
    assert.equal(selfEscalateRes.status, 400);
    const selfEscalateJson = (await selfEscalateRes.json()) as PatchUserResponse;
    assert.match(selfEscalateJson.message ?? "", /cannot change your own role/i);

    // ---- B. PMO Manager changes their own role to some OTHER role (not
    // just Administrator — any self-role-change is blocked). ----
    const selfChangeRes = await patch(pmoManager.id, pmoManagerToken, { roleId: engineerRole.id });
    assert.equal(selfChangeRes.status, 400);
    const selfChangeJson = (await selfChangeRes.json()) as PatchUserResponse;
    assert.match(selfChangeJson.message ?? "", /cannot change your own role/i);

    // ---- G. Combined payload (ordinary fields + roleId) on a self-edit
    // must be rejected ATOMICALLY — no partial application of the ordinary
    // fields when the roleId part is what triggers the rejection. ----
    const combinedRes = await patch(pmoManager.id, pmoManagerToken, {
      fullName: "Escalation Attempt Should Not Stick",
      roleId: administratorRole.id,
    });
    assert.equal(combinedRes.status, 400);
    const afterCombinedAttempt = await prisma.portalUser.findUniqueOrThrow({ where: { id: pmoManager.id } });
    assert.equal(
      afterCombinedAttempt.fullName,
      "P0-01 PMO Manager",
      "a rejected self-role-change must not apply even the ordinary fields in the same request"
    );

    // ---- F. Every rejected attempt above must have left the original role
    // completely unchanged in the database. ----
    assert.equal(afterCombinedAttempt.roleId, pmoManagerRole.id);

    // ---- C. PMO Manager updates their OWN ordinary profile fields, no
    // roleId in the request at all — must succeed normally. ----
    const selfProfileRes = await patch(pmoManager.id, pmoManagerToken, { fullName: "P0-01 PMO Manager (Renamed)" });
    assert.equal(selfProfileRes.status, 200);
    const selfProfileJson = (await selfProfileRes.json()) as PatchUserResponse;
    assert.equal(selfProfileJson.data?.fullName, "P0-01 PMO Manager (Renamed)");
    assert.equal(selfProfileJson.data?.role?.id, pmoManagerRole.id, "own role must be untouched by an ordinary-field self-update");

    // ---- D. PMO Manager changes ANOTHER user's role — existing behavior
    // must be completely unaffected by this guard. ----
    const pmoManagesOtherRes = await patch(otherUser.id, pmoManagerToken, { roleId: pmoManagerRole.id });
    assert.equal(pmoManagesOtherRes.status, 200);
    const pmoManagesOtherJson = (await pmoManagesOtherRes.json()) as PatchUserResponse;
    assert.equal(pmoManagesOtherJson.data?.role?.id, pmoManagerRole.id);

    // ---- E. Administrator changes another user's role — existing behavior
    // must be completely unaffected by this guard. ----
    const adminManagesOtherRes = await patch(otherUser.id, administratorToken, { roleId: engineerRole.id });
    assert.equal(adminManagesOtherRes.status, 200);
    const adminManagesOtherJson = (await adminManagesOtherRes.json()) as PatchUserResponse;
    assert.equal(adminManagesOtherJson.data?.role?.id, engineerRole.id);

    // ---- Sanity: the guard is ID-equality-based only (requestingUserId ===
    // targetUserId), exactly like the pre-existing self-delete guard it
    // mirrors — deleteUser() already blocks an Administrator from deleting
    // their OWN account with no role-name exception, so this guard
    // consistently blocks an Administrator from changing their OWN role too.
    // This is not a new restriction on Administrator behavior in general —
    // Case E above already proved an Administrator can freely change ANY
    // OTHER user's role. ----
    const adminSelfRes = await patch(administrator.id, administratorToken, { roleId: administratorRole.id });
    assert.equal(
      adminSelfRes.status,
      400,
      "the self-role-change guard checks IDs only, not role names — it must fire for an Administrator's own self-edit exactly as it does for deleteUser()'s self-delete guard"
    );
    const administratorAfterSelfAttempt = await prisma.portalUser.findUniqueOrThrow({ where: { id: administrator.id } });
    assert.equal(administratorAfterSelfAttempt.roleId, administratorRole.id, "Administrator's own role must remain unchanged (it already was this role — attempted no-op self-set is still rejected)");
  } finally {
    if (createdUserIds.length > 0) {
      await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userModuleAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userRegionAccess.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.userApprovalPermission.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
      await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await close();
  }
});
