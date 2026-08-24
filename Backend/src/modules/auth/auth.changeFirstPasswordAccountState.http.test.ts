import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import app from "../../app.js";
import { hashPassword } from "../../shared/utils/password.util.js";
import { prisma } from "../../shared/utils/prismaClient.js";

const TAG = `first-pw-acct-${Date.now()}`;
const CURRENT_PASSWORD = "FirstPwAcctTest@123";
const NEW_PASSWORD = "NewFirstPass1";

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

test("POST /auth/change-first-password rejects locked/deactivated accounts and never issues a session for them", async () => {
  const { url, close } = await listen();
  const createdUserIds: string[] = [];

  try {
    const engineerRole = await prisma.portalRole.findUniqueOrThrow({ where: { name: "Engineer" } });
    const passwordHash = await hashPassword(CURRENT_PASSWORD);

    const [activeUser, lockedUser, deactivatedUser] = await Promise.all([
      prisma.portalUser.create({
        data: {
          fullName: "First PW Acct Active",
          email: `${TAG}-active@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: true,
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "First PW Acct Locked",
          email: `${TAG}-locked@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: true,
          accountLocked: true,
        },
      }),
      prisma.portalUser.create({
        data: {
          fullName: "First PW Acct Deactivated",
          email: `${TAG}-deactivated@example.com`,
          passwordHash,
          department: "PMO",
          roleId: engineerRole.id,
          forcePasswordChange: true,
          isActive: false,
        },
      }),
    ]);
    createdUserIds.push(activeUser.id, lockedUser.id, deactivatedUser.id);

    const changeFirstPassword = (email: string, newPassword = NEW_PASSWORD) =>
      fetch(`${url}/auth/change-first-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          currentPassword: CURRENT_PASSWORD,
          newPassword,
          confirmPassword: newPassword,
        }),
      });

    // ---- Locked account: rejected, no session issued, password unchanged,
    // no refresh token created. ----
    const refreshCountBeforeLocked = await prisma.refreshToken.count({ where: { userId: lockedUser.id } });
    const lockedRes = await changeFirstPassword(lockedUser.email);
    assert.equal(lockedRes.status, 403);
    const lockedJson = (await lockedRes.json()) as { message: string; data?: { token?: string } };
    assert.match(lockedJson.message, /account is locked/i);
    assert.equal(lockedJson.data, undefined);
    const refreshCountAfterLocked = await prisma.refreshToken.count({ where: { userId: lockedUser.id } });
    assert.equal(refreshCountAfterLocked, refreshCountBeforeLocked);
    const lockedUserAfter = await prisma.portalUser.findUniqueOrThrow({ where: { id: lockedUser.id } });
    assert.equal(lockedUserAfter.passwordHash, passwordHash); // password never changed
    assert.equal(lockedUserAfter.forcePasswordChange, true); // never cleared

    // ---- Deactivated account: same shape of rejection. ----
    const refreshCountBeforeDeactivated = await prisma.refreshToken.count({ where: { userId: deactivatedUser.id } });
    const deactivatedRes = await changeFirstPassword(deactivatedUser.email);
    assert.equal(deactivatedRes.status, 403);
    const deactivatedJson = (await deactivatedRes.json()) as { message: string };
    assert.match(deactivatedJson.message, /account is inactive/i);
    const refreshCountAfterDeactivated = await prisma.refreshToken.count({ where: { userId: deactivatedUser.id } });
    assert.equal(refreshCountAfterDeactivated, refreshCountBeforeDeactivated);
    const deactivatedUserAfter = await prisma.portalUser.findUniqueOrThrow({ where: { id: deactivatedUser.id } });
    assert.equal(deactivatedUserAfter.passwordHash, passwordHash);

    // ---- Active, unlocked account: succeeds exactly as before — password
    // changes, a real session (access token + refresh token) is issued. ----
    const activeRes = await changeFirstPassword(activeUser.email);
    assert.equal(activeRes.status, 200);
    const activeJson = (await activeRes.json()) as { data: { token: string; refreshToken: string; requiresPasswordChange: boolean } };
    assert.equal(activeJson.data.requiresPasswordChange, false);
    assert.ok(activeJson.data.token && activeJson.data.token.length > 0);
    assert.ok(activeJson.data.refreshToken && activeJson.data.refreshToken.length > 0);
    const activeUserAfter = await prisma.portalUser.findUniqueOrThrow({ where: { id: activeUser.id } });
    assert.notEqual(activeUserAfter.passwordHash, passwordHash); // password actually changed
    assert.equal(activeUserAfter.forcePasswordChange, false);
    const refreshCountAfterActive = await prisma.refreshToken.count({ where: { userId: activeUser.id, revokedAt: null } });
    assert.equal(refreshCountAfterActive, 1);
  } finally {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authAuditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.portalUser.deleteMany({ where: { id: { in: createdUserIds } } });
    await close();
  }
});
