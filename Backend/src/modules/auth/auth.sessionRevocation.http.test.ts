import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";
import { generateOpaqueToken, hashToken } from "../../shared/utils/token.util.js";
import { updateUser } from "../users/services/user.service.js";

const TAG = `session-revoke-${Date.now()}`;

// This test calls updateUser() directly as a stand-in for "an Administrator
// acting via the API" (see the existing comment below) — it never edits a
// user's OWN account, so any id that's guaranteed not to equal the target
// user's id satisfies updateUser()'s P0-01 self-role-change guard as a
// harmless no-op. Not a real user row; never touches the database itself.
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

async function issueRefreshToken(userId: string, expiresInMs = 30 * 24 * 60 * 60 * 1000): Promise<string> {
  const plaintext = generateOpaqueToken();
  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(plaintext), expiresAt: new Date(Date.now() + expiresInMs) },
  });
  return plaintext;
}

test("Deactivating/locking a user revokes refresh tokens and blocks refresh — active users and other users unaffected", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];

  try {
    const engineerRole = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } });
    const passwordHash = await hashPassword("SessionRevokeTest@123");

    const [userToDeactivate, userToLock, unrelatedUser] = await Promise.all([
      prisma.portalUser.create({
        data: { fullName: "Revoke Test Deactivate", email: `${TAG}-deactivate@example.com`, passwordHash, department: "PMO", roleId: engineerRole.id, forcePasswordChange: false },
      }),
      prisma.portalUser.create({
        data: { fullName: "Revoke Test Lock", email: `${TAG}-lock@example.com`, passwordHash, department: "PMO", roleId: engineerRole.id, forcePasswordChange: false },
      }),
      prisma.portalUser.create({
        data: { fullName: "Revoke Test Unrelated", email: `${TAG}-unrelated@example.com`, passwordHash, department: "PMO", roleId: engineerRole.id, forcePasswordChange: false },
      }),
    ]);
    createdUserIds.push(userToDeactivate.id, userToLock.id, unrelatedUser.id);

    const refreshBody = (plaintext: string) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: plaintext }) });

    // ---- Baseline: an active, unlocked user's refresh token works ----
    const deactivateUserToken = await issueRefreshToken(userToDeactivate.id);
    const baseline = await fetch(`${url}/auth/refresh-token`, refreshBody(deactivateUserToken));
    assert.equal(baseline.status, 200);
    const baselineJson = (await baseline.json()) as { data: { token: string; refreshToken: string } };
    const rotatedDeactivateUserToken = baselineJson.data.refreshToken;

    // ---- Deactivating revokes it: the rotated token (still unexpired,
    // never explicitly revoked by anything else) must stop working the
    // instant the account is deactivated. ----
    await updateUser(userToDeactivate.id, { isActive: false }, SIMULATED_ADMIN_CALLER_ID);

    const afterDeactivate = await fetch(`${url}/auth/refresh-token`, refreshBody(rotatedDeactivateUserToken));
    assert.equal(afterDeactivate.status, 401);
    const afterDeactivateJson = (await afterDeactivate.json()) as { message: string };
    assert.match(afterDeactivateJson.message, /invalid or expired refresh token/i);

    // ---- Defense in depth: even a freshly-issued, never-revoked refresh
    // token must stop working once the account is locked — locking revokes
    // it (same as deactivation above), so this is rejected as a revoked
    // token (401), not reaching the accountLocked check at all. ----
    const lockUserTokenBeforeLock = await issueRefreshToken(userToLock.id);
    await updateUser(userToLock.id, { accountLocked: true }, SIMULATED_ADMIN_CALLER_ID);

    const afterLock = await fetch(`${url}/auth/refresh-token`, refreshBody(lockUserTokenBeforeLock));
    assert.equal(afterLock.status, 401);

    // Defense in depth: a brand new refresh token issued AFTER the lock
    // (one revocation could never have touched, since it didn't exist yet
    // — e.g. a race, or a direct DB insert bypassing the normal issuance
    // path) must STILL be rejected — this proves refreshAccessToken()
    // itself checks accountLocked, independent of revocation.
    const lockUserTokenAfterLock = await issueRefreshToken(userToLock.id);
    const afterLock2 = await fetch(`${url}/auth/refresh-token`, refreshBody(lockUserTokenAfterLock));
    assert.equal(afterLock2.status, 403);
    const afterLock2Json = (await afterLock2.json()) as { message: string };
    assert.match(afterLock2Json.message, /account is locked/i);

    // ---- Unrelated user's session is never touched by another user's
    // deactivation/lock. ----
    const unrelatedToken = await issueRefreshToken(unrelatedUser.id);
    const unrelatedRes = await fetch(`${url}/auth/refresh-token`, refreshBody(unrelatedToken));
    assert.equal(unrelatedRes.status, 200);

    // ---- Administrator (proxy: the service itself) can still manage
    // users normally — an unrelated field update on a different user
    // succeeds without being affected by this change. ----
    const renamed = await updateUser(unrelatedUser.id, { fullName: "Revoke Test Unrelated (Renamed)" }, SIMULATED_ADMIN_CALLER_ID);
    assert.equal(renamed.fullName, "Revoke Test Unrelated (Renamed)");

    // ---- Re-activating/unlocking must NOT revoke tokens (matches the
    // existing "unlock behaves like any other unlock" comment in
    // user.service.ts) — issue a fresh token, unlock, confirm it still
    // works. ----
    const relockThenUnlockToken = await issueRefreshToken(userToLock.id);
    await updateUser(userToLock.id, { accountLocked: false }, SIMULATED_ADMIN_CALLER_ID);
    const afterUnlock = await fetch(`${url}/auth/refresh-token`, refreshBody(relockThenUnlockToken));
    assert.equal(afterUnlock.status, 200);
  } finally {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
