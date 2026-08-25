import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { signAccessToken } from "../../shared/utils/jwt.util.js";
import { updateUser } from "../users/services/user.service.js";

/**
 * Existing-JWT session invalidation fix — authenticate.ts now re-checks the
 * caller's CURRENT isActive/accountLocked state on every request (not just
 * at login/refresh time). This proves the exact before/after behavior the
 * fix targets: the SAME already-issued, cryptographically-valid,
 * not-yet-expired access token must keep working for an active/unlocked
 * user, then be immediately rejected the instant an Administrator/PMO
 * Manager deactivates or locks that user — without the caller needing to
 * wait for the token's natural expiry or make any other request first.
 *
 * Deliberately does NOT touch refresh-token revocation/rotation — that is
 * already covered by auth.sessionRevocation.http.test.ts and is untouched
 * by this fix.
 */

// Same stand-in convention as auth.sessionRevocation.http.test.ts: a
// non-existent id used only to satisfy updateUser()'s P0-01 self-role-
// change guard as a harmless no-op — never a real row, never touches the
// database itself.
const TAG = `jwt-invalidation-${Date.now()}`;
const SIMULATED_ADMIN_CALLER_ID = `${TAG}-simulated-admin-caller`;

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

test("authenticate: an already-issued access token is immediately rejected once the account is deactivated or locked", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];

  try {
    const engineerRole = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } });
    const passwordHash = await hashPassword("JwtInvalidationTest@123");

    const [user, unrelatedUser] = await Promise.all([
      prisma.portalUser.create({
        data: {
          fullName: "JWT Invalidation Test User",
          email: `${TAG}-user@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "JWT Invalidation Test Unrelated",
          email: `${TAG}-unrelated@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: false,
        },
      }),
    ]);
    createdUserIds.push(user.id, unrelatedUser.id);

    const token = tokenFor({ ...user, roleName: engineerRole.name });
    const unrelatedToken = tokenFor({ ...unrelatedUser, roleName: engineerRole.name });
    const callMe = (t: string) => fetch(`${url}/auth/me`, { headers: { Authorization: `Bearer ${t}` } });

    // ---- 1. Baseline: a valid access token for an active, unlocked user
    // works normally, before any account-state change. ----
    const baseline = await callMe(token);
    assert.equal(baseline.status, 200, "an active, unlocked user's token must work normally");

    // ---- 2. Deactivating the user rejects the SAME already-issued token
    // on the very next request — no re-login, no waiting for expiry. ----
    await updateUser(user.id, { isActive: false }, SIMULATED_ADMIN_CALLER_ID);
    const afterDeactivate = await callMe(token);
    assert.equal(afterDeactivate.status, 403, "a deactivated user's already-issued token must be rejected immediately");
    const afterDeactivateJson = (await afterDeactivate.json()) as { message: string };
    assert.match(afterDeactivateJson.message, /inactive/i);

    // ---- 3. Reactivating restores access with the SAME token — proves
    // this is a live, current-state check, not a one-time/sticky
    // invalidation of the token itself. ----
    await updateUser(user.id, { isActive: true }, SIMULATED_ADMIN_CALLER_ID);
    const afterReactivate = await callMe(token);
    assert.equal(afterReactivate.status, 200, "reactivating must restore access with the same still-valid token");

    // ---- 4. Locking the user rejects the SAME token immediately. ----
    await updateUser(user.id, { accountLocked: true }, SIMULATED_ADMIN_CALLER_ID);
    const afterLock = await callMe(token);
    assert.equal(afterLock.status, 403, "a locked user's already-issued token must be rejected immediately");
    const afterLockJson = (await afterLock.json()) as { message: string };
    assert.match(afterLockJson.message, /locked/i);

    // ---- 5. Unlocking restores access with the SAME token. ----
    await updateUser(user.id, { accountLocked: false }, SIMULATED_ADMIN_CALLER_ID);
    const afterUnlock = await callMe(token);
    assert.equal(afterUnlock.status, 200, "unlocking must restore access with the same still-valid token");

    // ---- 6. An unrelated user's token is never affected by another
    // user's deactivation/lock — the check is scoped to the token's own
    // subject only. ----
    const unrelatedRes = await callMe(unrelatedToken);
    assert.equal(unrelatedRes.status, 200, "an unrelated user's token must be completely unaffected");

    // ---- 7. Defense in depth: a still-cryptographically-valid token for a
    // user row that no longer exists at all (e.g. deleted) must be
    // rejected, not crash the request. ----
    const ghostToken = tokenFor({ id: `${TAG}-ghost-id`, email: "ghost@example.com", roleId: engineerRole.id, roleName: engineerRole.name });
    const ghostRes = await callMe(ghostToken);
    assert.equal(ghostRes.status, 403, "a token for a user row that no longer exists must be rejected, not crash");
  } finally {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
